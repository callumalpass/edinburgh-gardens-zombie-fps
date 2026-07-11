import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ClientZombieInterpolator } from "../src/game/multiplayer/ClientZombieInterpolator";
import type { Zombie } from "../src/game/state";

function zombie(id = 1): Zombie {
  return {
    id,
    type: "shambler",
    mesh: new THREE.Group(),
    position: new THREE.Vector3(),
    health: 100,
    maxHealth: 100,
    speed: 0,
    radius: 0.8,
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

describe("ClientZombieInterpolator", () => {
  it("moves a zombie continuously between authoritative snapshots", () => {
    const interpolator = new ClientZombieInterpolator();
    const actor = zombie();
    interpolator.reset(actor, { position: new THREE.Vector3(0, 1, 0), rotationY: 3.1 }, 0);
    interpolator.push(actor, { position: new THREE.Vector3(6, 2, -3), rotationY: -3.1 }, 0.06);

    expect(actor.position.toArray()).toEqual([0, 1, 0]);
    const samples: number[] = [];
    for (let frame = 0; frame < 3; frame += 1) {
      interpolator.update([actor], 0.02);
      samples.push(actor.position.x);
    }

    expect(samples[0]).toBeCloseTo(2);
    expect(samples[1]).toBeCloseTo(4);
    expect(samples[2]).toBeCloseTo(6);
    expect(actor.position.y).toBeCloseTo(2);
    expect(actor.position.z).toBeCloseTo(-3);
    expect(Math.abs(actor.mesh.rotation.y)).toBeGreaterThan(3);
  });

  it("retargets from the currently presented position without a correction jump", () => {
    const interpolator = new ClientZombieInterpolator();
    const actor = zombie();
    interpolator.reset(actor, { position: new THREE.Vector3(0, 0, 0), rotationY: 0 }, 0);
    interpolator.push(actor, { position: new THREE.Vector3(6, 0, 0), rotationY: 0.5 }, 0.06);
    interpolator.update([actor], 0.03);
    expect(actor.position.x).toBeCloseTo(3);

    interpolator.push(actor, { position: new THREE.Vector3(9, 0, 0), rotationY: 1 }, 0.12);
    expect(actor.position.x).toBeCloseTo(3);
    interpolator.update([actor], 0.03);
    expect(actor.position.x).toBeCloseTo(6);
    interpolator.update([actor], 0.03);
    expect(actor.position.x).toBeCloseTo(9);
  });

  it("snaps large corrections and forgets removed zombie state", () => {
    const interpolator = new ClientZombieInterpolator();
    const actor = zombie(7);
    interpolator.reset(actor, { position: new THREE.Vector3(0, 0, 0), rotationY: 0 }, 0);
    interpolator.push(actor, { position: new THREE.Vector3(20, 0, 0), rotationY: 1.5 }, 0.06);

    expect(actor.position.x).toBe(20);
    expect(actor.mesh.rotation.y).toBe(1.5);

    interpolator.remove(actor.id);
    actor.position.set(2, 0, 0);
    interpolator.push(actor, { position: new THREE.Vector3(4, 0, 0), rotationY: 0.5 }, 0.12);
    expect(actor.position.x).toBe(4);
  });
});
