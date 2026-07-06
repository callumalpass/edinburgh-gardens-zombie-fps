import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  canZombieMeleeCombatant,
  findMeleeHits,
  findZombieHits,
  raySphereHit,
  type CombatTarget
} from "../src/game/combat/targeting";
import type { ZombieType } from "../src/game/waves";

function target(id: number, type: ZombieType, x: number, z: number, radius = 0.72): CombatTarget {
  return {
    id,
    type,
    position: new THREE.Vector3(x, 0, z),
    radius
  };
}

describe("combat targeting", () => {
  it("finds the near intersection point on a ray/sphere hit", () => {
    const hit = raySphereHit(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 5),
      1,
      12
    );

    expect(hit?.distance).toBeCloseTo(4);
    expect(hit?.point.z).toBeCloseTo(4);
  });

  it("rejects ray/sphere misses outside the range and radius", () => {
    expect(
      raySphereHit(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, 5),
        1,
        3.5
      )
    ).toBeNull();
    expect(
      raySphereHit(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(2.1, 0, 5),
        1,
        12
      )
    ).toBeNull();
  });

  it("returns closest firearm hits sorted by distance and capped by penetration", () => {
    const hits = findZombieHits(
      [target(1, "shambler", 0, 12), target(2, "sprinter", 0, 8), target(3, "shambler", 3, 6)],
      new THREE.Vector3(0, 1.58, 0),
      new THREE.Vector3(0, 0, 1),
      30,
      2
    );

    expect(hits.map((hit) => hit.target.id)).toEqual([2, 1]);
    expect(hits.every((hit) => hit.zone === "body")).toBe(true);
  });

  it("uses the closest zone per zombie instead of returning duplicate body parts", () => {
    const hits = findZombieHits(
      [target(1, "bloater", 0, 10, 1.1)],
      new THREE.Vector3(0, 1.58, 0),
      new THREE.Vector3(0, 0, 1),
      30,
      4
    );

    expect(hits).toHaveLength(1);
    expect(hits[0].target.id).toBe(1);
    expect(hits[0].zone).toBe("body");
  });

  it("keeps machete swings wider than knife swings", () => {
    const angled = target(1, "shambler", Math.sin(0.6) * 4, Math.cos(0.6) * 4);
    const origin = new THREE.Vector3(0, 0, 0);
    const forward = new THREE.Vector3(0, 0, 1);

    expect(findMeleeHits([angled], origin, forward, 5, 1, false, "knife")).toEqual([]);
    expect(findMeleeHits([angled], origin, forward, 5, 1, false, "machete").map((hit) => hit.target.id)).toEqual([1]);
  });

  it("classifies melee strike zones from stance and target posture", () => {
    const standingTarget = target(1, "shambler", 0, 3);
    const crawler = target(2, "crawler", 0, 4);
    const origin = new THREE.Vector3(0, 0, 0);
    const forward = new THREE.Vector3(0, 0, 1);

    expect(findMeleeHits([standingTarget], origin, forward, 6, 1, false, "knife")[0].zone).toBe("body");
    expect(findMeleeHits([standingTarget], origin, forward, 6, 1, true, "knife")[0].zone).toBe("legs");
    expect(findMeleeHits([crawler], origin, forward, 6, 1, false, "knife")[0].zone).toBe("legs");
  });

  it("lets bloaters hit elevated players only when horizontally close", () => {
    const closeElevatedTarget = {
      zombieType: "bloater" as const,
      zombieRadius: 2.2,
      targetRadius: 2.2,
      horizontalDistance: 5.1,
      targetElevation: 3.6
    };

    expect(canZombieMeleeCombatant(closeElevatedTarget)).toBe(true);
    expect(canZombieMeleeCombatant({ ...closeElevatedTarget, horizontalDistance: 5.4 })).toBe(false);
    expect(canZombieMeleeCombatant({ ...closeElevatedTarget, zombieType: "shambler" })).toBe(false);
    expect(canZombieMeleeCombatant({ ...closeElevatedTarget, zombieType: "shambler", targetElevation: 1.2 })).toBe(true);
  });
});
