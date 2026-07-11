import { app, BrowserWindow, ipcMain, shell } from "electron";
import electronUpdater from "electron-updater";
import { createSocket } from "node:dgram";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMultiplayerRelay } from "../server/multiplayer-server.mjs";
import { createUpdateController } from "./update-controller.mjs";

const { autoUpdater } = electronUpdater;

const DEFAULT_WEB_PORT = Number.parseInt(process.env.EGLL_WEB_PORT ?? "5480", 10);
const DEFAULT_RELAY_PORT = Number.parseInt(process.env.MULTIPLAYER_PORT ?? "5488", 10);
const DISCOVERY_PORT = Number.parseInt(process.env.EGLL_DISCOVERY_PORT ?? "5489", 10);
const DISCOVERY_INTERVAL_MS = 1500;
const LAN_HOST = "0.0.0.0";
const LOOPBACK_HOST = "127.0.0.1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let webServer = null;
let webServerInfo = null;
let relay = null;
let relayInfo = null;
let beaconSocket = null;
let beaconTimer = null;
let hostSession = null;
let updateController = null;
let updateCheckTimer = null;
let updateInitialCheckTimer = null;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".webp", "image/webp"],
  [".wasm", "application/wasm"]
]);

async function boot() {
  await app.whenReady();
  const distDir = path.join(app.getAppPath(), "dist");
  if (!existsSync(path.join(distDir, "index.html"))) {
    throw new Error(`Missing built web app at ${distDir}. Run npm run build before starting Electron.`);
  }
  webServerInfo = await startStaticWebServer(distDir, DEFAULT_WEB_PORT);
  createWindow();
  initializeUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    title: "Edinburgh Gardens 2030",
    backgroundColor: "#102126",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.loadURL(`${webServerInfo.localUrl}?desktop=1`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startStaticWebServer(distDir, preferredPort) {
  const server = createServer((request, response) => {
    serveDistFile(distDir, request, response);
  });
  const info = await listenWithFallback(server, LAN_HOST, preferredPort, "web app");
  webServer = server;
  return {
    host: LAN_HOST,
    port: info.port,
    localUrl: `http://${LOOPBACK_HOST}:${info.port}/`,
    lanUrls: lanAddresses().map((address) => `http://${address}:${info.port}/`)
  };
}

function serveDistFile(distDir, request, response) {
  const requestUrl = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidatePath = path.normalize(path.join(distDir, relativePath));
  const safeRoot = path.normalize(distDir + path.sep);
  const fallbackPath = path.join(distDir, "index.html");
  const filePath = candidatePath.startsWith(safeRoot) && fileExists(candidatePath) ? candidatePath : fallbackPath;
  const extension = path.extname(filePath).toLowerCase();

  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(response);
}

function fileExists(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

async function ensureRelay() {
  if (relayInfo) {
    return relayInfo;
  }
  relayInfo = await startRelayWithFallback(DEFAULT_RELAY_PORT);
  return relayInfo;
}

async function startRelayWithFallback(preferredPort) {
  const candidate = startMultiplayerRelay({
    host: LAN_HOST,
    port: preferredPort,
    logger: console
  });
  try {
    const info = await candidate.ready;
    relay = candidate;
    return {
      host: LAN_HOST,
      port: info.port,
      localUrl: `ws://${LOOPBACK_HOST}:${info.port}`,
      lanUrls: lanAddresses().map((address) => `ws://${address}:${info.port}`)
    };
  } catch (error) {
    await candidate.close().catch(() => {});
    if (error?.code === "EADDRINUSE" && preferredPort !== 0) {
      return startRelayWithFallback(0);
    }
    throw error;
  }
}

function listenWithFallback(server, host, preferredPort, label) {
  return new Promise((resolve, reject) => {
    let attemptedFallback = false;

    const listen = (port) => {
      server.once("error", onError);
      server.listen(port, host, () => {
        server.off("error", onError);
        const address = server.address();
        const actualPort = typeof address === "object" && address ? address.port : port;
        console.log(`Edinburgh Gardens ${label} serving on http://${host}:${actualPort}`);
        resolve({ port: actualPort });
      });
    };

    const onError = (error) => {
      server.off("error", onError);
      if (error?.code === "EADDRINUSE" && !attemptedFallback) {
        attemptedFallback = true;
        listen(0);
        return;
      }
      reject(error);
    };

    listen(preferredPort);
  });
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => address.address);
}

function runtimeInfo() {
  return {
    isElectron: true,
    appVersion: app.getVersion(),
    platform: process.platform,
    preferredMultiplayer: true,
    webServer: {
      ...webServerInfo,
      lanUrls: lanAddresses().map((address) => `http://${address}:${webServerInfo.port}/`)
    },
    relay: relayInfo
      ? {
          ...relayInfo,
          lanUrls: lanAddresses().map((address) => `ws://${address}:${relayInfo.port}`)
        }
      : null
  };
}

ipcMain.handle("lan:runtime", () => runtimeInfo());

ipcMain.handle("lan:start-host", async (_event, options = {}) => {
  const roomId = String(options.roomId || "edinburgh-gardens").slice(0, 48);
  const playerName = String(options.playerName || "Host").slice(0, 32);
  const avatarId = ["milo", "asha", "jules", "maeve"].includes(options.avatarId) ? options.avatarId : "milo";
  const info = await ensureRelay();
  hostSession = {
    roomId,
    playerName,
    avatarId,
    startedAt: Date.now()
  };
  startHostBeacon();
  const params = new URLSearchParams({
    desktop: "1",
    lan: "host",
    server: info.localUrl,
    room: roomId,
    name: playerName,
    avatar: avatarId
  });
  const hostCodes = lanAddresses();
  return {
    ...runtimeInfo(),
    hostGameUrl: `${webServerInfo.localUrl}?${params.toString()}`,
    browserJoinUrls: hostCodes.map((address) => {
      const joinParams = new URLSearchParams({
        lan: "join",
        server: `ws://${address}:${info.port}`,
        room: roomId,
        name: "Player"
      });
      return `http://${address}:${webServerInfo.port}/?${joinParams.toString()}`;
    }),
    desktopServerUrls: hostCodes.map((address) => `ws://${address}:${info.port}`),
    hostCodes,
    preferredHostCode: hostCodes[0] ?? LOOPBACK_HOST,
    roomId,
    playerName
  };
});

ipcMain.handle("lan:stop-host", async () => {
  stopHostBeacon();
  if (relay) {
    await relay.close();
  }
  relay = null;
  relayInfo = null;
  hostSession = null;
  return runtimeInfo();
});

ipcMain.handle("lan:discover-hosts", async (_event, options = {}) => {
  const timeoutMs = Math.max(400, Math.min(5000, Number(options.timeoutMs ?? 1600)));
  return discoverHosts(timeoutMs);
});

ipcMain.handle("lan:open-external", async (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) {
    await shell.openExternal(url);
  }
});

ipcMain.handle("update:state", (event) => trustedUpdateRequest(event, () => updateController?.getState() ?? fallbackUpdateState()));
ipcMain.handle("update:check", (event) => trustedUpdateRequest(event, () => updateController?.check() ?? fallbackUpdateState()));
ipcMain.handle("update:download", (event) => trustedUpdateRequest(event, () => updateController?.download() ?? fallbackUpdateState()));
ipcMain.handle("update:install", (event) => trustedUpdateRequest(event, () => updateController?.install() ?? false));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (updateInitialCheckTimer) clearTimeout(updateInitialCheckTimer);
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateController?.dispose();
  stopHostBeacon();
  relay?.close().catch(() => {});
  webServer?.close();
});

function initializeUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;
  updateController = createUpdateController({
    updater: autoUpdater,
    isPackaged: app.isPackaged,
    currentVersion: app.getVersion(),
    onState: broadcastUpdateState
  });
  broadcastUpdateState(updateController.getState());
  if (!app.isPackaged) return;
  updateInitialCheckTimer = setTimeout(() => void updateController?.check(), 5000);
  updateInitialCheckTimer.unref?.();
  updateCheckTimer = setInterval(() => void updateController?.check(), 4 * 60 * 60 * 1000);
  updateCheckTimer.unref?.();
}

function trustedUpdateRequest(event, request) {
  if (!isTrustedRendererUrl(event.senderFrame?.url ?? event.sender.getURL())) {
    throw new Error("Update requests are only accepted from the local desktop application.");
  }
  return request();
}

function isTrustedRendererUrl(url) {
  try {
    return new URL(url).origin === new URL(webServerInfo.localUrl).origin;
  } catch {
    return false;
  }
}

function broadcastUpdateState(state) {
  const progress = state.phase === "downloading" ? (state.progress?.percent ?? 0) / 100 : -1;
  for (const window of BrowserWindow.getAllWindows()) {
    window.setProgressBar(progress);
    window.webContents.send("update:status", state);
  }
}

function fallbackUpdateState() {
  return {
    phase: "disabled",
    currentVersion: app.getVersion(),
    version: null,
    releaseName: null,
    releaseNotes: null,
    message: "The desktop updater is not ready.",
    progress: null,
    error: null,
    checkedAt: null
  };
}

boot().catch((error) => {
  console.error(error);
  app.exit(1);
});

function startHostBeacon() {
  stopHostBeacon();
  if (!relayInfo || !webServerInfo || !hostSession) {
    return;
  }
  beaconSocket = createSocket("udp4");
  beaconSocket.on("error", (error) => console.warn("LAN discovery beacon failed:", error.message));
  beaconSocket.bind(() => {
    beaconSocket?.setBroadcast(true);
    sendHostBeacon();
    beaconTimer = setInterval(sendHostBeacon, DISCOVERY_INTERVAL_MS);
  });
}

function stopHostBeacon() {
  if (beaconTimer) {
    clearInterval(beaconTimer);
    beaconTimer = null;
  }
  if (beaconSocket) {
    beaconSocket.close();
    beaconSocket = null;
  }
}

function sendHostBeacon() {
  if (!beaconSocket || !relayInfo || !webServerInfo || !hostSession) {
    return;
  }
  const addresses = lanAddresses();
  const message = Buffer.from(JSON.stringify({
    kind: "egll-host",
    version: 1,
    appVersion: app.getVersion(),
    roomId: hostSession.roomId,
    playerName: hostSession.playerName,
    relayPort: relayInfo.port,
    webPort: webServerInfo.port,
    addresses,
    startedAt: hostSession.startedAt
  }));
  for (const target of broadcastTargets(addresses)) {
    beaconSocket.send(message, DISCOVERY_PORT, target, (error) => {
      if (error) {
        console.warn(`LAN discovery beacon could not send to ${target}:`, error.message);
      }
    });
  }
}

function broadcastTargets(addresses) {
  const targets = new Set(["255.255.255.255"]);
  for (const address of addresses) {
    const parts = address.split(".");
    if (parts.length === 4) {
      targets.add(`${parts[0]}.${parts[1]}.${parts[2]}.255`);
    }
  }
  return [...targets];
}

function discoverHosts(timeoutMs) {
  return new Promise((resolve) => {
    const found = new Map();
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    let finished = false;
    const done = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      socket.close();
      resolve([...found.values()].sort((a, b) => a.playerName.localeCompare(b.playerName)));
    };
    const timer = setTimeout(done, timeoutMs);

    socket.on("message", (data, remote) => {
      const beacon = parseBeacon(data);
      if (!beacon) {
        return;
      }
      const hostAddress = chooseReachableAddress(beacon.addresses, remote.address);
      const key = `${hostAddress}:${beacon.relayPort}:${beacon.roomId}`;
      found.set(key, {
        id: key,
        playerName: beacon.playerName,
        roomId: beacon.roomId,
        hostAddress,
        serverUrl: `ws://${hostAddress}:${beacon.relayPort}`,
        browserUrl: `http://${hostAddress}:${beacon.webPort}/`,
        appVersion: beacon.appVersion,
        ageMs: Math.max(0, Date.now() - beacon.startedAt)
      });
    });
    socket.on("error", () => done());
    socket.bind(DISCOVERY_PORT, LAN_HOST);
  });
}

function parseBeacon(data) {
  try {
    const value = JSON.parse(data.toString("utf8"));
    if (
      value?.kind !== "egll-host" ||
      typeof value.roomId !== "string" ||
      typeof value.playerName !== "string" ||
      typeof value.relayPort !== "number" ||
      typeof value.webPort !== "number" ||
      !Array.isArray(value.addresses)
    ) {
      return null;
    }
    return {
      appVersion: String(value.appVersion || "unknown").slice(0, 32),
      roomId: value.roomId.slice(0, 48),
      playerName: value.playerName.slice(0, 32),
      relayPort: value.relayPort,
      webPort: value.webPort,
      addresses: value.addresses.filter((address) => typeof address === "string"),
      startedAt: Number(value.startedAt || Date.now())
    };
  } catch {
    return null;
  }
}

function chooseReachableAddress(addresses, remoteAddress) {
  if (remoteAddress && remoteAddress !== "0.0.0.0") {
    return remoteAddress;
  }
  return addresses[0] ?? LOOPBACK_HOST;
}
