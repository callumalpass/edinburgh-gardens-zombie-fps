import { describe, expect, it } from "vitest";
import { movementNoiseKind, movementNoiseMultiplier, NoiseSystem } from "../src/game/noise";

describe("noise system", () => {
  it("makes crouched movement quieter and slower to attract attention", () => {
    expect(movementNoiseKind(0.4, true, false)).toBeNull();
    expect(movementNoiseKind(2.2, true, false)).toBe("footstep");
    expect(movementNoiseKind(9, false, true)).toBe("sprint");
    expect(movementNoiseMultiplier(true, "grass")).toBeLessThan(movementNoiseMultiplier(false, "grass"));
    expect(movementNoiseMultiplier(false, "gravel")).toBeGreaterThan(movementNoiseMultiplier(false, "grass"));
    expect(movementNoiseMultiplier(false, "grass", 0.88)).toBeLessThan(movementNoiseMultiplier(false, "grass"));
  });

  it("returns the strongest audible event for nearby zombies and expires old events", () => {
    const noise = new NoiseSystem();
    noise.emit("footstep", { x: 0, z: 0 });
    noise.emit("gunshot", { x: 72, z: 0 });

    expect(noise.strongestAt({ x: 80, z: 0 })?.kind).toBe("gunshot");
    expect(noise.strongestAt({ x: 370, z: 0 })).toBeNull();

    noise.update(7);
    expect(noise.strongestAt({ x: 72, z: 0 })).toBeNull();
  });

  it("lets high-hearing zombie roles investigate subtler sound farther away", () => {
    const noise = new NoiseSystem();
    noise.emit("reload", { x: 0, z: 0 });

    expect(noise.strongestAt({ x: 21, z: 0 }, 1)).toBeNull();
    expect(noise.strongestAt({ x: 21, z: 0 }, 1.55)?.kind).toBe("reload");
  });

  it("keeps melee much quieter than gunshots", () => {
    const noise = new NoiseSystem();
    noise.emit("melee", { x: 0, z: 0 });
    expect(noise.strongestAt({ x: 8, z: 0 })?.kind).toBe("melee");
    expect(noise.strongestAt({ x: 20, z: 0 })).toBeNull();
  });
});
