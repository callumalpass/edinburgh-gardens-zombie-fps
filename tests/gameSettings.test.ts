import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_SETTINGS, loadGameSettings, normalizeGameSettings, saveGameSettings } from "../src/game/gameSettings";

describe("game settings", () => {
  it("clamps stored values to supported ranges", () => {
    expect(normalizeGameSettings({ mouseSensitivity: 9, fieldOfView: 20, masterVolume: -1, highContrastHud: true })).toEqual({
      mouseSensitivity: 2,
      fieldOfView: 60,
      masterVolume: 0,
      highContrastHud: true
    });
  });

  it("loads defaults when stored JSON is invalid", () => {
    expect(loadGameSettings({ getItem: () => "not-json" })).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it("persists normalized settings", () => {
    let stored = "";
    saveGameSettings(
      { mouseSensitivity: 1.2, fieldOfView: 82, masterVolume: 0.5, highContrastHud: false },
      { setItem: (_key, value) => { stored = value; } }
    );
    expect(JSON.parse(stored)).toEqual({ mouseSensitivity: 1.2, fieldOfView: 82, masterVolume: 0.5, highContrastHud: false });
  });
});
