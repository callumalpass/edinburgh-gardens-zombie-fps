import { describe, expect, it } from "vitest";
import {
  audibleRadiusForNoise,
  footstepProfileForSurface,
  NOISE_SOUND_PROFILES,
  soundGainAtDistance,
  soundPanForSource,
  worldSoundAudibleRadius,
  worldSoundBaseGain
} from "../src/game/audio";

describe("game audio profiles", () => {
  it("maps AI noise events to player-audible sound radii", () => {
    expect(audibleRadiusForNoise({ kind: "gunshot", radius: 280 })).toBeGreaterThan(300);
    expect(audibleRadiusForNoise({ kind: "footstep", radius: 13 })).toBeLessThan(25);
    expect(audibleRadiusForNoise({ kind: "distraction", radius: 74 })).toBeGreaterThan(80);
    expect(NOISE_SOUND_PROFILES.gunshot.baseGain).toBeGreaterThan(NOISE_SOUND_PROFILES.footstep.baseGain);
    expect(NOISE_SOUND_PROFILES.scavenge.baseGain).toBeGreaterThan(NOISE_SOUND_PROFILES.flashlight.baseGain);
  });

  it("attenuates positional sounds smoothly with distance", () => {
    expect(soundGainAtDistance(0, 40, 1)).toBeGreaterThan(soundGainAtDistance(22, 40, 1));
    expect(soundGainAtDistance(40, 40, 1)).toBe(0);
    expect(soundGainAtDistance(12, 40, 0.4)).toBeLessThan(soundGainAtDistance(12, 40, 1));
  });

  it("keeps surface sound identity aligned with movement noise surfaces", () => {
    expect(footstepProfileForSurface("gravel").noiseGain).toBeGreaterThan(footstepProfileForSurface("grass").noiseGain);
    expect(footstepProfileForSurface("rail").brightness).toBeGreaterThan(footstepProfileForSurface("dirt").brightness);
  });

  it("makes zombie cues audible before melee range", () => {
    expect(worldSoundAudibleRadius("zombieGroan", { zombieType: "shambler", aiState: "chase" })).toBeGreaterThan(120);
    expect(worldSoundAudibleRadius("zombieGroan", { zombieType: "screamer", aiState: "chase" })).toBeGreaterThan(
      worldSoundAudibleRadius("zombieGroan", { zombieType: "shambler", aiState: "chase" })
    );
    expect(worldSoundAudibleRadius("zombieStep", { zombieType: "bloater" })).toBeGreaterThan(
      worldSoundAudibleRadius("zombieStep", { zombieType: "sprinter" })
    );
    expect(worldSoundBaseGain("zombieGroan", { zombieType: "shambler" })).toBeGreaterThan(worldSoundBaseGain("shell"));
  });

  it("gives screamers and bloaters stronger identity cues", () => {
    expect(worldSoundBaseGain("zombieGroan", { zombieType: "screamer" })).toBeGreaterThan(
      worldSoundBaseGain("zombieGroan", { zombieType: "bloater" })
    );
    expect(worldSoundBaseGain("zombieAttack", { zombieType: "screamer" })).toBeGreaterThan(
      worldSoundBaseGain("zombieAttack", { zombieType: "shambler" })
    );
    expect(worldSoundAudibleRadius("zombieAttack", { zombieType: "bloater" })).toBeGreaterThan(
      worldSoundAudibleRadius("zombieAttack", { zombieType: "shambler" })
    );
    expect(NOISE_SOUND_PROFILES.scream.baseGain).toBeGreaterThan(NOISE_SOUND_PROFILES.distraction.baseGain);
  });

  it("pans world sounds from the player's facing direction", () => {
    const listener = { position: { x: 0, z: 0 }, yaw: 0 };
    expect(soundPanForSource(listener, { x: 12, z: 0 })).toBeGreaterThan(0.8);
    expect(soundPanForSource(listener, { x: -12, z: 0 })).toBeLessThan(-0.8);
    expect(Math.abs(soundPanForSource(listener, { x: 0, z: 12 }))).toBeLessThan(0.01);
  });
});
