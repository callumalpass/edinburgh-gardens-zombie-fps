import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyDirectedZombieHit } from "../src/game/combat/damage";
import type { Zombie } from "../src/game/state";
import type { RandomSource } from "../src/game/types";
import { addWeapon, createInitialLoadout, damageAtDistance, getWeaponStats } from "../src/game/weapons";
import type { ZombieType } from "../src/game/waves";

const fixedRng: RandomSource = {
  next: () => 0.5,
  range: (min, max) => min + (max - min) * 0.5,
  int: (min, max) => Math.floor(min + (max - min) * 0.5),
  pick: (items) => items[0]
};

function zombie(type: ZombieType, health = 100): Zombie {
  return {
    id: 1,
    type,
    mesh: new THREE.Group(),
    position: new THREE.Vector3(0, 0, 8),
    health,
    maxHealth: health,
    speed: 0,
    radius: 0.72,
    reward: 0,
    attackCooldown: 0,
    walkOffset: 0,
    aiState: "wander",
    target: null,
    lastKnownPlayer: null,
    wanderTimer: 0,
    searchTimer: 0,
    memoryTimer: 0,
    vocalCooldown: 0,
    stepCooldown: 0,
    staggerTimer: 0,
    screamCooldown: 0
  };
}

describe("combat damage", () => {
  it("applies directed weapon damage and turns a zombie toward the shooter", () => {
    const stats = getWeaponStats(addWeapon(createInitialLoadout(), "carbine"));
    const target = zombie("shambler", 100);
    const result = applyDirectedZombieHit(
      target,
      { distance: 12, zone: "body" },
      stats,
      { x: 3, z: -2 },
      fixedRng,
      { memorySeconds: { min: 2.6, max: 4.4 }, staggerBonusByZone: { legs: 0.22 } }
    );

    expect(result.damage).toBe(damageAtDistance(stats, 12, "body"));
    expect(target.health).toBe(100 - result.damage);
    expect(target.aiState).toBe("chase");
    expect(target.target).toEqual({ x: 3, z: -2 });
    expect(target.lastKnownPlayer).toBe(target.target);
    expect(target.memoryTimer).toBeCloseTo(3.5);
  });

  it("uses zone-specific stagger bonuses and preserves stronger existing stagger", () => {
    const stats = getWeaponStats(addWeapon(createInitialLoadout(), "carbine"));
    const target = zombie("bloater", 100);
    target.staggerTimer = 10;

    const result = applyDirectedZombieHit(
      target,
      { distance: 8, zone: "legs" },
      stats,
      { x: 0, z: 0 },
      fixedRng,
      { memorySeconds: { min: 1, max: 3 }, staggerBonusByZone: { legs: 0.22 } }
    );

    expect(result.staggerSeconds).toBeGreaterThan(stats.staggerPower);
    expect(target.staggerTimer).toBe(10);
  });

  it("reports lethal hits without removing ownership from the caller", () => {
    const stats = getWeaponStats(addWeapon(createInitialLoadout(), "rifle"));
    const target = zombie("shambler", 1);

    const result = applyDirectedZombieHit(
      target,
      { distance: 4, zone: "head" },
      stats,
      { x: 0, z: 0 },
      fixedRng,
      { memorySeconds: { min: 2, max: 3.4 } }
    );

    expect(result.killed).toBe(true);
    expect(target.health).toBeLessThanOrEqual(0);
  });
});
