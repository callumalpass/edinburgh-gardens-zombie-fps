import { describe, expect, it } from "vitest";
import {
  AVATAR_DEFINITIONS,
  AVATAR_IDS,
  AVATAR_STORAGE_KEY,
  DEFAULT_AVATAR_ID,
  avatarDefinition,
  loadSelectedAvatar,
  normalizeAvatarId,
  saveSelectedAvatar
} from "../src/game/characters";

describe("character registry", () => {
  it("defines a complete unique roster", () => {
    expect(Object.keys(AVATAR_DEFINITIONS)).toEqual([...AVATAR_IDS]);
    expect(new Set(Object.values(AVATAR_DEFINITIONS).map((avatar) => avatar.assetPath)).size).toBe(AVATAR_IDS.length);
    expect(AVATAR_DEFINITIONS.milo.silhouette.toLowerCase()).toContain("curls");
    expect(AVATAR_DEFINITIONS.milo.silhouette.toLowerCase()).toContain("bush hat");
  });

  it("normalizes unknown or obsolete ids to the default", () => {
    expect(normalizeAvatarId("asha")).toBe("asha");
    expect(normalizeAvatarId("unknown-survivor")).toBe(DEFAULT_AVATAR_ID);
    expect(avatarDefinition(null).id).toBe(DEFAULT_AVATAR_ID);
  });

  it("loads and saves selection defensively", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    expect(loadSelectedAvatar(storage)).toBe(DEFAULT_AVATAR_ID);
    expect(saveSelectedAvatar("maeve", storage)).toBe("maeve");
    expect(values.get(AVATAR_STORAGE_KEY)).toBe("maeve");
    expect(loadSelectedAvatar(storage)).toBe("maeve");
    expect(saveSelectedAvatar("retired-avatar", storage)).toBe(DEFAULT_AVATAR_ID);
  });
});
