import { GameApp } from "./game/GameApp";
import {
  AVATAR_DEFINITIONS,
  AVATAR_IDS,
  avatarDefinition,
  loadSelectedAvatar,
  normalizeAvatarId,
  saveSelectedAvatar,
  type AvatarId
} from "./game/characters";
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
  startHost: (options: { roomId: string; playerName: string; avatarId: AvatarId }) => Promise<ElectronLanHostInfo>;
  stopHost: () => Promise<ElectronLanRuntime>;
  discoverHosts: (options?: { timeoutMs?: number }) => Promise<ElectronDiscoveredHost[]>;
  openExternal: (url: string) => Promise<void>;
}

type ElectronUpdatePhase = "disabled" | "idle" | "checking" | "available" | "downloading" | "downloaded" | "installing" | "up-to-date" | "error";

interface ElectronUpdateState {
  phase: ElectronUpdatePhase;
  currentVersion: string;
  version: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  message: string;
  progress: { percent: number; transferred: number; total: number; bytesPerSecond: number } | null;
  error: string | null;
  checkedAt: number | null;
}

interface ElectronUpdateApi {
  state: () => Promise<ElectronUpdateState>;
  check: () => Promise<ElectronUpdateState>;
  download: () => Promise<ElectronUpdateState>;
  install: () => Promise<boolean>;
  onStatus: (callback: (state: ElectronUpdateState) => void) => () => void;
}

declare global {
  interface Window {
    edinburghLan?: ElectronLanApi;
    edinburghUpdates?: ElectronUpdateApi;
  }
}

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root");
}

const root = rootElement;
let game: GameApp | null = null;
const disposeUpdaterUi = mountDesktopUpdater();

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

window.addEventListener("beforeunload", () => {
  disposeUpdaterUi?.();
  game?.dispose();
}, { once: true });

function mountDesktopUpdater(): (() => void) | null {
  const api = window.edinburghUpdates;
  if (!api) return null;

  const panel = document.createElement("aside");
  panel.className = "desktop-updater";
  panel.hidden = true;
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `
    <button class="desktop-updater-close" type="button" aria-label="Dismiss update message" data-update-dismiss>×</button>
    <span class="desktop-updater-kicker">Desktop update</span>
    <strong data-update-title>Checking releases</strong>
    <p data-update-message></p>
    <div class="desktop-updater-progress" data-update-progress hidden><i></i></div>
    <small data-update-detail></small>
    <details data-update-notes hidden><summary>Release notes</summary><p></p></details>
    <button class="desktop-updater-action" type="button" data-update-action>Check for updates</button>`;
  document.body.append(panel);

  const title = panel.querySelector<HTMLElement>("[data-update-title]")!;
  const message = panel.querySelector<HTMLElement>("[data-update-message]")!;
  const detail = panel.querySelector<HTMLElement>("[data-update-detail]")!;
  const progress = panel.querySelector<HTMLElement>("[data-update-progress]")!;
  const progressFill = progress.querySelector<HTMLElement>("i")!;
  const notes = panel.querySelector<HTMLDetailsElement>("[data-update-notes]")!;
  const notesText = notes.querySelector<HTMLElement>("p")!;
  const action = panel.querySelector<HTMLButtonElement>("[data-update-action]")!;
  let currentState: ElectronUpdateState | null = null;
  let manuallyOpened = false;

  const render = (state: ElectronUpdateState) => {
    currentState = state;
    const needsAttention = ["available", "downloading", "downloaded", "installing"].includes(state.phase);
    panel.hidden = state.phase === "disabled" || (!manuallyOpened && !needsAttention);
    panel.dataset.phase = state.phase;
    title.textContent = updateTitle(state);
    message.textContent = state.message;
    detail.textContent = state.error
      ? state.error
      : state.progress?.total
        ? `${formatBytes(state.progress.transferred)} of ${formatBytes(state.progress.total)} · ${formatBytes(state.progress.bytesPerSecond)}/s`
        : `Installed version ${state.currentVersion}`;
    progress.hidden = state.phase !== "downloading";
    progressFill.style.width = `${state.progress?.percent ?? 0}%`;
    notes.hidden = !state.releaseNotes;
    notesText.textContent = state.releaseNotes ?? "";
    action.hidden = state.phase === "disabled" || state.phase === "checking" || state.phase === "downloading" || state.phase === "installing";
    action.disabled = action.hidden;
    action.textContent = state.phase === "available"
      ? `Download ${state.version ?? "update"}`
      : state.phase === "downloaded"
        ? "Restart and install"
        : state.phase === "error"
          ? "Try again"
          : "Check for updates";
  };

  const unsubscribe = api.onStatus(render);
  void api.state().then(render).catch(() => { panel.hidden = true; });
  const openUpdater = () => {
    manuallyOpened = true;
    if (currentState) render(currentState);
    if (!currentState || currentState.phase === "idle" || currentState.phase === "up-to-date" || currentState.phase === "error") {
      void api.check().then(render);
    }
  };
  window.addEventListener("edinburgh:open-updater", openUpdater);
  panel.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-update-dismiss],[data-update-action]") : null;
    if (!target) return;
    if (target.dataset.updateDismiss !== undefined) {
      manuallyOpened = false;
      panel.hidden = true;
      return;
    }
    if (!currentState) return;
    action.disabled = true;
    const request = currentState.phase === "available"
      ? api.download()
      : currentState.phase === "downloaded"
        ? api.install().then(() => currentState!)
        : api.check();
    void request.then(render).catch((error) => render({
      ...currentState!,
      phase: "error",
      message: "The update request failed.",
      error: error instanceof Error ? error.message : String(error)
    }));
  });

  return () => {
    unsubscribe();
    window.removeEventListener("edinburgh:open-updater", openUpdater);
    panel.remove();
  };
}

function updateTitle(state: ElectronUpdateState): string {
  if (state.phase === "available") return state.releaseName
    ? `${state.releaseName} · ${state.version ?? "new release"}`
    : `Update ${state.version ?? "available"}`;
  if (state.phase === "downloaded") return "Update ready";
  if (state.phase === "downloading") return "Downloading update";
  if (state.phase === "checking") return "Checking for updates";
  if (state.phase === "installing") return "Installing update";
  if (state.phase === "error") return "Update problem";
  return "Edinburgh Gardens 2030";
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function renderLaunchMenu(container: HTMLElement): Promise<void> {
  const runtime = await window.edinburghLan?.runtime().catch(() => null);
  const params = new URLSearchParams(window.location.search);
  const defaultMode = "single";
  const defaultName = localStorageValue("egll.playerName") || params.get("name") || (runtime ? "Host" : "Player");
  const defaultAvatar = normalizeAvatarId(params.get("avatar") ?? loadSelectedAvatar());
  const defaultRoom = params.get("room") || "edinburgh-gardens";
  const defaultServer = params.get("server") || runtime?.relay?.lanUrls[0] || defaultLanServer();

  container.innerHTML = launchMenuMarkup({
    runtime,
    mode: defaultMode,
    playerName: defaultName,
    avatarId: defaultAvatar,
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
  const avatarField = container.querySelector<HTMLInputElement>('[name="avatarId"]');
  const submitButton = container.querySelector<HTMLButtonElement>("[data-launch-submit]");
  const discoveryList = container.querySelector<HTMLElement>("[data-discovery-list]");
  if (!form || !modeInput || !status || !hostDetails || !serverField || !roomField || !nameField || !avatarField || !submitButton || !discoveryList) {
    throw new Error("Launch menu failed to render required controls");
  }
  container.querySelector<HTMLButtonElement>("[data-open-updater]")?.addEventListener("click", () => {
    window.dispatchEvent(new Event("edinburgh:open-updater"));
  });

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

  const setAvatar = (avatarId: unknown) => {
    const selected = avatarDefinition(avatarId);
    avatarField.value = selected.id;
    saveSelectedAvatar(selected.id);
    container.querySelectorAll<HTMLButtonElement>("[data-avatar]").forEach((button) => {
      const active = button.dataset.avatar === selected.id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    const portrait = container.querySelector<HTMLImageElement>("[data-avatar-portrait]");
    const name = container.querySelector<HTMLElement>("[data-avatar-name]");
    const role = container.querySelector<HTMLElement>("[data-avatar-role]");
    const description = container.querySelector<HTMLElement>("[data-avatar-description]");
    if (portrait) {
      portrait.src = selected.portraitPath;
      portrait.alt = `${selected.name}, ${selected.silhouette}`;
    }
    if (name) name.textContent = selected.name;
    if (role) role.textContent = selected.role;
    if (description) description.textContent = selected.description;
  };
  setAvatar(defaultAvatar);

  container.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-mode],[data-avatar],[data-copy],[data-enter-host],[data-refresh-hosts],[data-join-discovered]")
      : null;
    if (!target) {
      return;
    }
    if (target.dataset.avatar) {
      setAvatar(target.dataset.avatar);
      return;
    }
    if (target.dataset.mode) {
      setMode(target.dataset.mode);
      if (target.dataset.launchSingle !== undefined) {
        form.requestSubmit();
      }
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
      launchJoin(serverUrl, roomId, nameField.value, avatarField.value, status);
    }
  });

  container.addEventListener("keydown", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-avatar]") : null;
    if (!target || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const options = [...container.querySelectorAll<HTMLButtonElement>("[data-avatar]")];
    const currentIndex = options.indexOf(target);
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = options[(currentIndex + direction + options.length) % options.length];
    if (!next) return;
    event.preventDefault();
    setAvatar(next.dataset.avatar);
    next.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hostDetails.hidden = true;
    const formData = new FormData(form);
    const mode = String(formData.get("mode") || "single");
    const playerName = cleanInput(String(formData.get("playerName") || "Player"), 32);
    const roomId = cleanInput(String(formData.get("roomId") || "edinburgh-gardens"), 48);
    const avatarId = saveSelectedAvatar(formData.get("avatarId"));
    localStorageSet("egll.playerName", playerName);

    if (mode === "single") {
      launchGame(new URLSearchParams({ play: "1", avatar: avatarId }));
      return;
    }

    if (mode === "host") {
      if (runtime && window.edinburghLan) {
        setStatus(status, "Starting LAN host...");
        try {
          const host = await window.edinburghLan.startHost({ roomId, playerName, avatarId });
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
        name: playerName,
        avatar: avatarId
      });
      const browserServer = normalizeServerUrl(String(formData.get("serverUrl") || defaultLanServer()));
      hostParams.set("server", browserServer);
      launchGame(hostParams);
      return;
    }

    try {
      launchJoin(String(formData.get("serverUrl") || serverField.value || defaultLanServer()), roomId, playerName, avatarId, status);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Enter the host IP shown on the host machine.", true);
    }
  });
}

function launchMenuMarkup(options: {
  runtime: ElectronLanRuntime | null | undefined;
  mode: string;
  playerName: string;
  avatarId: AvatarId;
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
  const selectedAvatar = AVATAR_DEFINITIONS[options.avatarId];
  const avatarOptions = AVATAR_IDS.map((avatarId) => {
    const avatar = AVATAR_DEFINITIONS[avatarId];
    const active = avatar.id === selectedAvatar.id;
    return `
      <button class="avatar-option${active ? " active" : ""}" type="button" role="radio" aria-checked="${active ? "true" : "false"}" tabindex="${active ? "0" : "-1"}" data-avatar="${avatar.id}">
        <img src="${escapeAttr(avatar.portraitPath)}" alt="" aria-hidden="true">
        <span><strong>${escapeHtml(avatar.name)}</strong><small>${escapeHtml(avatar.role)}</small></span>
      </button>`;
  }).join("");

  return `
    <main class="launch-screen">
      <section class="launch-panel" aria-label="Launch game">
        <div class="launch-edition-row">
          <p class="kicker">${desktop ? `Desktop edition ${escapeHtml(options.runtime?.appVersion ?? "")}` : "Web edition"} · Fitzroy North</p>
          ${desktop ? `<button class="desktop-update-link" type="button" data-open-updater>Check for updates</button>` : ""}
        </div>
        <h1>Edinburgh Gardens 2030</h1>
        <p class="launch-deck">A survival FPS across a rain-soaked, research-built Edinburgh Gardens. Stay quiet, scavenge the park, and outlast the horde alone or over LAN.</p>
        <form class="launch-form" data-launch-form data-mode="${escapeAttr(options.mode)}">
          <input type="hidden" name="mode" value="${escapeAttr(options.mode)}" data-launch-mode>
          <input type="hidden" name="avatarId" value="${selectedAvatar.id}">
          <section class="avatar-selector" aria-labelledby="survivor-heading">
            <div class="avatar-focus">
              <img src="${escapeAttr(selectedAvatar.portraitPath)}" alt="${escapeAttr(`${selectedAvatar.name}, ${selectedAvatar.silhouette}`)}" data-avatar-portrait>
              <div>
                <span id="survivor-heading">Choose your survivor</span>
                <strong data-avatar-name>${escapeHtml(selectedAvatar.name)}</strong>
                <b data-avatar-role>${escapeHtml(selectedAvatar.role)}</b>
                <p data-avatar-description>${escapeHtml(selectedAvatar.description)}</p>
              </div>
            </div>
            <div class="avatar-options" role="radiogroup" aria-label="Survivors">${avatarOptions}</div>
          </section>
          <div class="play-mode-list" aria-label="Play mode">
            <button class="solo-launch" type="button" data-mode="single" data-launch-single>
              <span>Play solo</span><small>Start immediately</small>
            </button>
            <div class="coop-launch-options">
              <button type="button" data-mode="host"><span>Host co-op</span><small>Open a LAN game</small></button>
              <button type="button" data-mode="join"><span>Join co-op</span><small>Find a nearby host</small></button>
            </div>
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

function launchJoin(serverInput: string, roomId: string, playerName: string, avatarValue: unknown, status: HTMLElement): void {
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
        name: cleanInput(playerName || "Player", 32),
        avatar: normalizeAvatarId(avatarValue)
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
