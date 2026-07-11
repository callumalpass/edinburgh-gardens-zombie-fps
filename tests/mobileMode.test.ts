import { describe, expect, it } from "vitest";
import {
  loadMobileModePreference,
  resolveMobileMode,
  saveMobileModePreference
} from "../src/game/input/mobileMode";

describe("mobile mode", () => {
  it("uses an explicit URL mode before saved or hardware defaults", () => {
    expect(resolveMobileMode("?touch=1", false, { maxTouchPoints: 0, coarsePointer: false })).toBe(true);
    expect(resolveMobileMode("?touch=0", true, { maxTouchPoints: 5, coarsePointer: true })).toBe(false);
  });

  it("falls back through the saved preference to touch hardware", () => {
    expect(resolveMobileMode("", false, { maxTouchPoints: 5, coarsePointer: true })).toBe(false);
    expect(resolveMobileMode("", null, { maxTouchPoints: 1, coarsePointer: false })).toBe(true);
    expect(resolveMobileMode("", null, { maxTouchPoints: 0, coarsePointer: false })).toBe(false);
  });

  it("persists an explicit menu preference", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; }
    };
    expect(loadMobileModePreference(storage)).toBeNull();
    saveMobileModePreference(true, storage);
    expect(loadMobileModePreference(storage)).toBe(true);
    saveMobileModePreference(false, storage);
    expect(loadMobileModePreference(storage)).toBe(false);
  });
});
