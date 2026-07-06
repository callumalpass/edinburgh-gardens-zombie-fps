import { describe, expect, it } from "vitest";
import { FLARE_BURST_RADIUS, flareBurstEffectAtDistance } from "../src/game/flareGun";

describe("flare gun burst", () => {
  it("front-loads stagger more than raw damage", () => {
    const center = flareBurstEffectAtDistance(0, 1.2);
    const near = flareBurstEffectAtDistance(5, 1.2);

    expect(center.damage).toBeGreaterThan(40);
    expect(center.staggerSeconds).toBeGreaterThan(3.2);
    expect(center.shoveDistance).toBeGreaterThan(2.6);
    expect(near.damage).toBeLessThan(center.damage);
    expect(near.staggerSeconds).toBeLessThan(center.staggerSeconds);
  });

  it("keeps the outer radius useful as a crowd-control flare", () => {
    const edge = flareBurstEffectAtDistance(FLARE_BURST_RADIUS - 0.7, 1);

    expect(edge.damage).toBeGreaterThan(6);
    expect(edge.staggerSeconds).toBeGreaterThan(0.9);
    expect(edge.shoveDistance).toBeGreaterThan(0);
  });

  it("does not leak damage beyond the burning radius", () => {
    expect(flareBurstEffectAtDistance(FLARE_BURST_RADIUS + 0.5, 0).damage).toBe(0);
    expect(flareBurstEffectAtDistance(FLARE_BURST_RADIUS + 0.5, 0).staggerSeconds).toBe(0);
  });
});
