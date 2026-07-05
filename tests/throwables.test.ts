import { describe, expect, it } from "vitest";
import { BOTTLE_BOMB_EFFECT_RADIUS, bottleBombEffectAtDistance } from "../src/game/throwables";

describe("throwable bottle bombs", () => {
  it("delivers a strong close blast without scaling infinitely", () => {
    const center = bottleBombEffectAtDistance(0, 1.35);
    const near = bottleBombEffectAtDistance(4, 1.35);

    expect(center.damage).toBeGreaterThan(70);
    expect(center.staggerSeconds).toBeGreaterThan(2.8);
    expect(center.shoveDistance).toBeGreaterThan(4);
    expect(near.damage).toBeLessThan(center.damage);
    expect(near.staggerSeconds).toBeLessThan(center.staggerSeconds);
  });

  it("keeps the outer edge useful for crowd control", () => {
    const edge = bottleBombEffectAtDistance(BOTTLE_BOMB_EFFECT_RADIUS - 0.8, 1);

    expect(edge.damage).toBeGreaterThan(10);
    expect(edge.staggerSeconds).toBeGreaterThan(0.8);
    expect(edge.shoveDistance).toBeGreaterThan(0);
  });

  it("has a hard maximum radius", () => {
    expect(bottleBombEffectAtDistance(BOTTLE_BOMB_EFFECT_RADIUS + 1, 0).damage).toBe(0);
    expect(bottleBombEffectAtDistance(BOTTLE_BOMB_EFFECT_RADIUS + 1, 0).staggerSeconds).toBe(0);
  });
});
