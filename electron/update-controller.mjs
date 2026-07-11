const CHECK_BLOCKED_PHASES = new Set(["checking", "available", "downloading", "downloaded", "installing"]);

export function createUpdateController({ updater, isPackaged, currentVersion, onState = () => {} }) {
  let state = isPackaged
    ? updateState("idle", currentVersion, "Ready to check for updates.")
    : updateState("disabled", currentVersion, "Updates are available in packaged desktop releases.");

  const publish = (patch) => {
    state = { ...state, ...patch, currentVersion };
    onState({ ...state });
    return { ...state };
  };

  const handlers = {
    "checking-for-update": () => publish({ phase: "checking", message: "Checking for a new release…", error: null }),
    "update-available": (info) => publish({
      phase: "available",
      version: cleanVersion(info?.version),
      releaseName: cleanText(info?.releaseName),
      releaseNotes: cleanReleaseNotes(info?.releaseNotes),
      message: `Version ${cleanVersion(info?.version) ?? "unknown"} is ready to download.`,
      progress: null,
      error: null,
      checkedAt: Date.now()
    }),
    "update-not-available": (info) => publish({
      phase: "up-to-date",
      version: cleanVersion(info?.version) ?? currentVersion,
      message: `You have the latest version (${currentVersion}).`,
      progress: null,
      error: null,
      checkedAt: Date.now()
    }),
    "download-progress": (progress) => publish({
      phase: "downloading",
      message: `Downloading update… ${Math.round(Number(progress?.percent) || 0)}%`,
      progress: {
        percent: clampPercent(progress?.percent),
        transferred: finiteNumber(progress?.transferred),
        total: finiteNumber(progress?.total),
        bytesPerSecond: finiteNumber(progress?.bytesPerSecond)
      },
      error: null
    }),
    "update-downloaded": (info) => publish({
      phase: "downloaded",
      version: cleanVersion(info?.version) ?? state.version,
      releaseName: cleanText(info?.releaseName) ?? state.releaseName,
      releaseNotes: cleanReleaseNotes(info?.releaseNotes) ?? state.releaseNotes,
      message: `Version ${cleanVersion(info?.version) ?? state.version ?? "new"} is ready. Restart to install it.`,
      progress: { percent: 100, transferred: state.progress?.total ?? 0, total: state.progress?.total ?? 0, bytesPerSecond: 0 },
      error: null
    }),
    "update-cancelled": () => publish({ phase: "available", message: "Update download cancelled.", progress: null }),
    error: (error) => publish({
      phase: "error",
      message: "The update could not be completed.",
      error: errorMessage(error),
      progress: null
    })
  };

  for (const [event, handler] of Object.entries(handlers)) updater.on(event, handler);

  return {
    getState: () => ({ ...state }),
    async check() {
      if (!isPackaged || CHECK_BLOCKED_PHASES.has(state.phase)) return { ...state };
      publish({ phase: "checking", message: "Checking for a new release…", error: null, progress: null });
      try {
        await updater.checkForUpdates();
      } catch (error) {
        handlers.error(error);
      }
      return { ...state };
    },
    async download() {
      if (!isPackaged || state.phase !== "available") return { ...state };
      publish({ phase: "downloading", message: "Starting update download…", progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }, error: null });
      try {
        await updater.downloadUpdate();
      } catch (error) {
        handlers.error(error);
      }
      return { ...state };
    },
    install() {
      if (!isPackaged || state.phase !== "downloaded") return false;
      publish({ phase: "installing", message: "Restarting to install the update…", error: null });
      try {
        updater.quitAndInstall(false, true);
        return true;
      } catch (error) {
        handlers.error(error);
        return false;
      }
    },
    dispose() {
      for (const [event, handler] of Object.entries(handlers)) updater.removeListener(event, handler);
    }
  };
}

function updateState(phase, currentVersion, message) {
  return { phase, currentVersion, version: null, releaseName: null, releaseNotes: null, message, progress: null, error: null, checkedAt: null };
}

function cleanVersion(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 64) : null;
}

function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function cleanReleaseNotes(value) {
  if (typeof value === "string") return value.trim().slice(0, 4000) || null;
  if (!Array.isArray(value)) return null;
  const text = value.map((entry) => cleanText(entry?.note)).filter(Boolean).join("\n");
  return text.slice(0, 4000) || null;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function errorMessage(error) {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error ?? "Unknown updater error").slice(0, 1000);
}
