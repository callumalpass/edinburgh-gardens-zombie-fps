import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createInitialPlayerCondition } from "../src/game/playerCondition";
import { createInitialPlayerState } from "../src/game/playerState";
import { PlayerLocomotion, type LocomotionWorld } from "../src/game/systems/PlayerLocomotion";
import type { InteractableFixture } from "../src/game/types";

const boundary = [
  { x: -50, z: -50 },
  { x: 50, z: -50 },
  { x: 50, z: 50 },
  { x: -50, z: 50 }
];

function makeWorld(interactables: InteractableFixture[] = []): LocomotionWorld {
  return {
    boundary,
    skateBowls: [],
    interactables,
    obstacleIndex: {
      forNearby: () => {}
    },
    groundY: () => 1.25,
    movementSurfaceAt: () => "asphalt",
    surfaceSpeedMultiplier: () => 1,
    bikeSurfaceSpeedMultiplier: () => 1
  };
}

describe("PlayerLocomotion", () => {
  it("moves player-like actors with the same sprint rules used by local and remote players", () => {
    const locomotion = new PlayerLocomotion(makeWorld());
    const actor = createInitialPlayerState(1.25);
    actor.position.set(0, 1.25, 0);
    actor.yaw = 0;
    const condition = createInitialPlayerCondition();

    const result = locomotion.moveOnFoot(actor, 0.5, { x: 0, z: -1, length: 1 }, { wantsSprint: true, condition });

    expect(result.sprinting).toBe(true);
    expect(result.moved).toBe(true);
    expect(actor.position.z).toBeLessThan(0);
    expect(actor.position.y).toBe(1.25);
    expect(actor.velocity.length()).toBeGreaterThan(8);
  });

  it("centralizes fixture elevation and jump settling", () => {
    const fixture: InteractableFixture = {
      id: "deck",
      label: "Deck",
      kind: "rotunda",
      position: { x: 0, z: 0 },
      radius: 4,
      height: 3,
      prompt: "Deck",
      mode: "auto",
      raisedFootprint: { shape: "circle", center: { x: 0, z: 0 }, radius: 4 }
    };
    const locomotion = new PlayerLocomotion(makeWorld([fixture]));
    const actor = createInitialPlayerState(1.25);
    actor.position.set(0, 1.25, 0);

    locomotion.updateFixtureElevation(actor, 1);
    expect(actor.height).toBeGreaterThan(2.9);

    locomotion.startJump(actor);
    expect(actor.jumpHeight).toBeGreaterThan(0);
    locomotion.updateJumpState(actor, 0.016);
    expect(actor.jumpHeight).toBe(0);
    expect(actor.jumpVelocity).toBe(0);
  });

  it("uses the bike movement curve while keeping riders grounded and unclimbed", () => {
    const locomotion = new PlayerLocomotion(makeWorld());
    const actor = createInitialPlayerState(1.25);
    actor.position.set(0, 1.25, 0);
    actor.activeFixtureId = "deck";
    actor.height = 2;
    actor.crouching = true;

    const result = locomotion.moveOnBike(actor, 0.5, { x: 0, z: -1, length: 1 }, {
      wantsSprint: true,
      condition: createInitialPlayerCondition(),
      pumpSpeedMultiplier: 1
    });

    expect(result.moved).toBe(true);
    expect(result.sprinting).toBe(true);
    expect(actor.activeFixtureId).toBeNull();
    expect(actor.heightTarget).toBe(0);
    expect(actor.crouching).toBe(false);
    expect(actor.position).toBeInstanceOf(THREE.Vector3);
  });
});
