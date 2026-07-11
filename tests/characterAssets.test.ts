import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVATAR_DEFINITIONS, AVATAR_IDS } from "../src/game/characters";

interface CharacterManifest {
  blenderVersion: string;
  animationContract: { rootMotion: boolean; clips: string[]; weaponSocket: string };
  avatars: Array<{
    id: string;
    glb: string;
    triangleCount: number;
    meshObjectCount: number;
    armatureCount: number;
    distinctiveFeature: string | null;
  }>;
}

const manifest = JSON.parse(
  readFileSync(new URL("../assets/blender/characters/edinburgh-gardens-survivors.asset.json", import.meta.url), "utf8")
) as CharacterManifest;

describe("Blender character assets", () => {
  it("ships one compact rigged GLB and portrait for every registered survivor", () => {
    expect(manifest.avatars.map((avatar) => avatar.id)).toEqual([...AVATAR_IDS]);
    for (const avatar of manifest.avatars) {
      expect(avatar.meshObjectCount).toBe(1);
      expect(avatar.armatureCount).toBe(1);
      expect(avatar.triangleCount).toBeGreaterThan(1_500);
      expect(avatar.triangleCount).toBeLessThan(5_000);
      expect(existsSync(avatar.glb)).toBe(true);
      expect(statSync(avatar.glb).size).toBeLessThan(600_000);

      const definition = AVATAR_DEFINITIONS[avatar.id as keyof typeof AVATAR_DEFINITIONS];
      expect(definition.assetPath).toBe(avatar.glb.replace(/^public\//, ""));
      expect(existsSync(`public/${definition.portraitPath}`)).toBe(true);
    }
  });

  it("keeps the shared in-place animation and weapon-socket contract explicit", () => {
    expect(manifest.blenderVersion).toMatch(/^4\.5\./);
    expect(manifest.animationContract.rootMotion).toBe(false);
    expect(manifest.animationContract.weaponSocket).toContain("WeaponSocket");
    expect(manifest.animationContract.clips).toEqual([
      "Idle", "Walk", "Run", "Crouch", "CrouchWalk", "Aim", "AimLongGun", "AimSidearm", "MeleeReady",
      "Melee", "Reload", "Jump", "BikeIdle", "BikeRide", "Skateboard", "Downed"
    ]);
    expect(manifest.avatars.find((avatar) => avatar.id === "milo")?.distinctiveFeature).toMatch(/light-brown curly hair.*bush hat/i);
  });
});
