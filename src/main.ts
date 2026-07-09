import { GameApp } from "./game/GameApp";
import "./styles/main.css";

interface ElectronLanRuntime {
  isElectron: true;
  appVersion: string;
  platform: string;
  preferredMultiplayer: boolean;
  webServer: {
    port: number;
    localUrl: string;
    lanUrls: string[];
  };
  relay: {
    port: number;
    localUrl: string;
    lanUrls: string[];
  } | null;
}

interface ElectronLanHostInfo extends ElectronLanRuntime {
  hostGameUrl: string;
  browserJoinUrls: string[];
  desktopServerUrls: string[];
  hostCodes: string[];
  preferredHostCode: string;
  roomId: string;
  playerName: string;
}

interface ElectronDiscoveredHost {
  id: string;
  playerName: string;
  roomId: string;
  hostAddress: string;
  serverUrl: string;
  browserUrl: string;
  appVersion: string;
  ageMs: number;
}

interface ElectronLanApi {
  runtime: () => Promise<ElectronLanRuntime>;
  startHost: (options: { roomId: string; playerName: string }) => Promise<ElectronLanHostInfo>;
  stopHost: () => Promise<ElectronLanRuntime>;
  discoverHosts: (options?: { timeoutMs?: number }) => Promise<ElectronDiscoveredHost[]>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    edinburghLan?: ElectronLanApi;
  }
}

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root");
}

const root = rootElement;
let game: GameApp | null = null;

if (shouldLaunchImmediately()) {
  launchGame();
} else {
  void renderLaunchMenu(root);
}

function shouldLaunchImmediately(locationSearch = window.location.search): boolean {
  const params = new URLSearchParams(locationSearch);
  return params.has("smoke") || params.has("lan") || params.has("multiplayer") || params.get("play") === "1";
}

function launchGame(params?: URLSearchParams): void {
  if (params) {
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }
  root.innerHTML = "";
  game = new GameApp(root);
  game.init();
}

window.addEventListener("beforeunload", () => game?.dispose(), { once: true });

async function renderLaunchMenu(container: HTMLElement): Promise<void> {
  const runtime = await window.edinburghLan?.runtime().catch(() => null);
  const params = new URLSearchParams(window.location.search);
  const defaultMode = runtime ? "host" : "single";
  const defaultName = localStorageValue("egll.playerName") || params.get("name") || (runtime ? "Host" : "Player");
  const defaultRoom = params.get("room") || "edinburgh-gardens";
  const defaultServer = params.get("server") || runtime?.relay?.lanUrls[0] || defaultLanServer();

  container.innerHTML = launchMenuMarkup({
    runtime,
    mode: defaultMode,
    playerName: defaultName,
    roomId: defaultRoom,
    serverUrl: defaultServer
  });

  const form = container.querySelector<HTMLFormElement>("[data-launch-form]");
  const modeInput = container.querySelector<HTMLInputElement>("[data-launch-mode]");
  const status = container.querySelector<HTMLElement>("[data-launch-status]");
  const hostDetails = container.querySelector<HTMLElement>("[data-host-details]");
  const serverField = container.querySelector<HTMLInputElement>('[name="serverUrl"]');
  const roomField = container.querySelector<HTMLInputElement>('[name="roomId"]');
  const nameField = container.querySelector<HTMLInputElement>('[name="playerName"]');
  const submitButton = container.querySelector<HTMLButtonElement>("[data-launch-submit]");
  const discoveryList = container.querySelector<HTMLElement>("[data-discovery-list]");
  if (!form || !modeInput || !status || !hostDetails || !serverField || !roomField || !nameField || !submitButton || !discoveryList) {
    throw new Error("Launch menu failed to render required controls");
  }

  const setMode = (mode: string) => {
    modeInput.value = mode;
    container.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    form.dataset.mode = mode;
    submitButton.textContent = mode === "host" ? "Start hosting" : mode === "join" ? "Join game" : "Start single player";
    if (mode === "join" && runtime) {
      void refreshDiscoveredHosts(discoveryList, status);
    }
  };
  setMode(defaultMode);

  container.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-mode],[data-copy],[data-enter-host],[data-refresh-hosts],[data-join-discovered]")
      : null;
    if (!target) {
      return;
    }
    if (target.dataset.mode) {
      setMode(target.dataset.mode);
      return;
    }
    if (target.dataset.copy) {
      void copyText(target.dataset.copy, status);
      return;
    }
    if (target.dataset.enterHost) {
      const hostUrl = new URL(target.dataset.enterHost);
      launchGame(hostUrl.searchParams);
      return;
    }
    if (target.dataset.refreshHosts !== undefined) {
      void refreshDiscoveredHosts(discoveryList, status);
      return;
    }
    if (target.dataset.joinDiscovered) {
      const serverUrl = target.dataset.serverUrl || "";
      const roomId = target.dataset.roomId || roomField.value;
      launchJoin(serverUrl, roomId, nameField.value, status);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hostDetails.hidden = true;
    const formData = new FormData(form);
    const mode = String(formData.get("mode") || "single");
    const playerName = cleanInput(String(formData.get("playerName") || "Player"), 32);
    const roomId = cleanInput(String(formData.get("roomId") || "edinburgh-gardens"), 48);
    localStorageSet("egll.playerName", playerName);

    if (mode === "single") {
      launchGame(new URLSearchParams({ play: "1" }));
      return;
    }

    if (mode === "host") {
      if (runtime && window.edinburghLan) {
        setStatus(status, "Starting LAN host...");
        try {
          const host = await window.edinburghLan.startHost({ roomId, playerName });
          renderHostDetails(hostDetails, host);
          setStatus(status, "Hosting. Desktop clients can find this game automatically.");
        } catch (error) {
          setStatus(status, error instanceof Error ? error.message : "Could not start LAN host.", true);
        }
        return;
      }

      const hostParams = new URLSearchParams({
        lan: "host",
        room: roomId,
        name: playerName
      });
      const browserServer = normalizeServerUrl(String(formData.get("serverUrl") || defaultLanServer()));
      hostParams.set("server", browserServer);
      launchGame(hostParams);
      return;
    }

    try {
      launchJoin(String(formData.get("serverUrl") || serverField.value || defaultLanServer()), roomId, playerName, status);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Enter the host IP shown on the host machine.", true);
    }
  });
}

function launchMenuMarkup(options: {
  runtime: ElectronLanRuntime | null | undefined;
  mode: string;
  playerName: string;
  roomId: string;
  serverUrl: string;
}): string {
  const desktop = Boolean(options.runtime);
  const lanUrl = options.runtime?.webServer.lanUrls[0] ?? "";
  const statusText = desktop
    ? `Desktop LAN ready${lanUrl ? ` · hosting also serves browser clients at ${lanUrl}` : ""}`
    : window.location.protocol === "https:"
      ? "Public HTTPS builds are best for single player. Use desktop or a host HTTP URL for LAN."
      : "For LAN, host from the desktop app or run the relay beside this browser build.";

  return `
    <main class="launch-screen">
      <section class="launch-panel" aria-label="Launch game">
        <p class="kicker">${desktop ? "Desktop LAN" : "Web build"}</p>
        <h1>Edinburgh Gardens 2030</h1>
        <form class="launch-form" data-launch-form data-mode="${escapeAttr(options.mode)}">
          <input type="hidden" name="mode" value="${escapeAttr(options.mode)}" data-launch-mode>
          <div class="mode-segments" aria-label="Play mode">
            <button type="button" data-mode="single">Single</button>
            <button type="button" data-mode="host">Host LAN</button>
            <button type="button" data-mode="join">Join LAN</button>
          </div>
          <div class="launch-fields">
            <label class="network-field">
              <span>Name</span>
              <input name="playerName" maxlength="32" autocomplete="nickname" value="${escapeAttr(options.playerName)}">
            </label>
            <label class="network-field">
              <span>Room</span>
              <input name="roomId" maxlength="48" spellcheck="false" value="${escapeAttr(options.roomId)}">
            </label>
            <label class="server-field join-only network-field">
              <span>Host IP</span>
              <input name="serverUrl" spellcheck="false" inputmode="url" placeholder="192.168.1.42" value="${escapeAttr(displayServerInput(options.serverUrl))}">
              <small>Use the host IP shown on the host machine. Full ws:// addresses still work.</small>
            </label>
          </div>
          <section class="discovery-panel join-only" ${desktop ? "" : "hidden"}>
            <header>
              <div>
                <span>Found Games</span>
                <strong>Desktop app auto-discovery</strong>
              </div>
              <button type="button" data-refresh-hosts>Refresh</button>
            </header>
            <div class="discovery-list" data-discovery-list></div>
          </section>
          <p class="launch-note" data-launch-status>${escapeHtml(statusText)}</p>
          <section class="host-details" data-host-details hidden></section>
          <button class="primary-action launch-submit" type="submit" data-launch-submit>Continue</button>
        </form>
      </section>
    </main>
  `;
}

function renderHostDetails(container: HTMLElement, host: ElectronLanHostInfo): void {
  const browserUrl = host.browserJoinUrls[0] ?? "";
  const hostCode = host.preferredHostCode || host.hostCodes[0] || "";
  const desktopServer = host.desktopServerUrls[0] ?? "";
  container.hidden = false;
  container.innerHTML = `
    <div class="host-ready">
      <span>Host IP</span>
      <strong>${escapeHtml(hostCode || "No LAN address found")}</strong>
      <small>Desktop clients should choose Join LAN. This game should appear automatically; if it does not, they can type this Host IP.</small>
      ${hostCode ? `<button type="button" data-copy="${escapeAttr(hostCode)}">Copy host IP</button>` : ""}
    </div>
    <div class="host-detail-grid" aria-label="Fallback join details">
      <section>
        <span>Fallback desktop address</span>
        <strong>${escapeHtml(desktopServer || "Unavailable")}</strong>
        ${desktopServer ? `<button type="button" data-copy="${escapeAttr(desktopServer)}">Copy</button>` : ""}
      </section>
      <section>
        <span>Browser invite</span>
        <strong>${escapeHtml(browserUrl || "Unavailable")}</strong>
        ${browserUrl ? `<button type="button" data-copy="${escapeAttr(browserUrl)}">Copy</button>` : ""}
      </section>
    </div>
    <button class="secondary-action" type="button" data-enter-host="${escapeAttr(host.hostGameUrl)}">Enter host game</button>
  `;
}

async function refreshDiscoveredHosts(list: HTMLElement, status: HTMLElement): Promise<void> {
  if (!window.edinburghLan) {
    return;
  }
  list.innerHTML = `<p class="discovery-empty">Looking for LAN hosts...</p>`;
  try {
    const hosts = await window.edinburghLan.discoverHosts({ timeoutMs: 1600 });
    if (hosts.length === 0) {
      list.innerHTML = `<p class="discovery-empty">No desktop hosts found. Type the host IP below.</p>`;
      return;
    }
    list.innerHTML = hosts.map((host) => `
      <button
        class="discovered-host"
        type="button"
        data-join-discovered="1"
        data-server-url="${escapeAttr(host.serverUrl)}"
        data-room-id="${escapeAttr(host.roomId)}"
      >
        <span>${escapeHtml(host.playerName)}</span>
        <strong>${escapeHtml(host.roomId)}</strong>
        <small>${escapeHtml(host.hostAddress)}</small>
      </button>
    `).join("");
    setStatus(status, `Found ${hosts.length} LAN host${hosts.length === 1 ? "" : "s"}.`);
  } catch {
    list.innerHTML = `<p class="discovery-empty">Discovery is unavailable. Type the host IP below.</p>`;
  }
}

function launchJoin(serverInput: string, roomId: string, playerName: string, status: HTMLElement): void {
  try {
    const serverUrl = normalizeServerUrl(serverInput);
    if (isBlockedMixedWebSocket(serverUrl)) {
      setStatus(status, "This HTTPS page cannot connect to a LAN host. Use the desktop app or open the host HTTP URL.", true);
      return;
    }
    launchGame(
      new URLSearchParams({
        lan: "join",
        server: serverUrl,
        room: cleanInput(roomId || "edinburgh-gardens", 48),
        name: cleanInput(playerName || "Player", 32)
      })
    );
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : "Enter the host IP shown on the host machine.", true);
  }
}

function defaultLanServer(): string {
  const hostname = window.location.hostname || "127.0.0.1";
  return `ws://${hostname}:5488`;
}

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed || `${window.location.hostname || "127.0.0.1"}:5488`}`;
  const url = new URL(withProtocol);
  const nestedServer = url.searchParams.get("server");
  if ((url.protocol === "http:" || url.protocol === "https:") && nestedServer) {
    return normalizeServerUrl(nestedServer);
  }
  if (url.protocol === "http:") {
    url.protocol = "ws:";
    if (!url.port || url.port === "5480") {
      url.port = "5488";
    }
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("LAN host must be a ws:// or wss:// address.");
  }
  if (!url.port) {
    url.port = "5488";
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function displayServerInput(serverUrl: string): string {
  try {
    const url = new URL(serverUrl);
    return url.hostname === window.location.hostname ? "" : url.hostname;
  } catch {
    return serverUrl;
  }
}

function isBlockedMixedWebSocket(serverUrl: string): boolean {
  return window.location.protocol === "https:" && serverUrl.startsWith("ws://");
}

function setStatus(target: HTMLElement, message: string, error = false): void {
  target.textContent = message;
  target.classList.toggle("error", error);
}

async function copyText(value: string, status: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(status, "Copied.");
  } catch {
    setStatus(status, value);
  }
}

function cleanInput(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function localStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
