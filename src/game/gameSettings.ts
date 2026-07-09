export interface GameSettings {
  mouseSensitivity: number;
  fieldOfView: number;
  masterVolume: number;
  highContrastHud: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  mouseSensitivity: 1,
  fieldOfView: 74,
  masterVolume: 0.72,
  highContrastHud: false
};

const STORAGE_KEY = "egll.gameSettings";

export function normalizeGameSettings(value: Partial<GameSettings> | null | undefined): GameSettings {
  return {
    mouseSensitivity: clamp(value?.mouseSensitivity ?? DEFAULT_GAME_SETTINGS.mouseSensitivity, 0.45, 2),
    fieldOfView: clamp(value?.fieldOfView ?? DEFAULT_GAME_SETTINGS.fieldOfView, 60, 95),
    masterVolume: clamp(value?.masterVolume ?? DEFAULT_GAME_SETTINGS.masterVolume, 0, 1),
    highContrastHud: value?.highContrastHud === true
  };
}

export function loadGameSettings(storage: Pick<Storage, "getItem"> | null = safeStorage()): GameSettings {
  if (!storage) return { ...DEFAULT_GAME_SETTINGS };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalizeGameSettings(JSON.parse(raw) as Partial<GameSettings>) : { ...DEFAULT_GAME_SETTINGS };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function saveGameSettings(settings: GameSettings, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeGameSettings(settings)));
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
