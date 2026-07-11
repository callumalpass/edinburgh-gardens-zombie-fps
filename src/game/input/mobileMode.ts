export interface MobileModeSignals {
  maxTouchPoints: number;
  coarsePointer: boolean;
}

const STORAGE_KEY = "egll.mobileMode";

export function resolveMobileMode(
  locationSearch: string,
  savedPreference: boolean | null,
  signals: MobileModeSignals
): boolean {
  const params = new URLSearchParams(locationSearch);
  if (params.has("touch")) {
    const value = params.get("touch")?.trim().toLowerCase();
    return value !== "0" && value !== "false" && value !== "off";
  }
  if (savedPreference !== null) return savedPreference;
  return signals.maxTouchPoints > 0 || signals.coarsePointer;
}

export function loadMobileModePreference(
  storage: Pick<Storage, "getItem"> | null = safeStorage()
): boolean | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(STORAGE_KEY);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
  return null;
}

export function saveMobileModePreference(
  enabled: boolean,
  storage: Pick<Storage, "setItem"> | null = safeStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

export function shouldUseTouchControls(): boolean {
  if (typeof window === "undefined") return false;
  return resolveMobileMode(window.location.search, loadMobileModePreference(), {
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches === true
  });
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
