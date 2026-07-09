import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createInitialPlayerCondition } from "../src/game/playerCondition";
import { createInitialPlayerState } from "../src/game/playerState";
import { PlayerLocomotion, type LocomotionWorld } from "../src/game/systems/PlayerLocomotion";
import type { CollisionObstacle, InteractableFixture } from "../src/game/types";

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
    bikeSurfaceSpeedMultiplier: () => 1,
    skateboardSurfaceSpeedMultiplier: (surface) => surface === "grass" ? 0 : 1
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

  it("keeps skateboards off grass while using hard-surface movement", () => {
    const hardSurface = new PlayerLocomotion(makeWorld());
    const actor = createInitialPlayerState(1.25);
    actor.position.set(0, 1.25, 0);

    const rolling = hardSurface.moveOnSkateboard(actor, 0.35, { x: 0, z: -1, length: 1 }, {
      wantsSprint: false,
      condition: createInitialPlayerCondition()
    });

    expect(rolling.usable).toBe(true);
    expect(rolling.moved).toBe(true);

    const grassWorld = { ...makeWorld(), movementSurfaceAt: () => "grass" as const };
    const grassLocomotion = new PlayerLocomotion(grassWorld);
    const grassActor = createInitialPlayerState(1.25);
    const bogged = grassLocomotion.moveOnSkateboard(grassActor, 0.35, { x: 0, z: -1, length: 1 }, {
      wantsSprint: false,
      condition: createInitialPlayerCondition()
    });

    expect(bogged.usable).toBe(false);
    expect(bogged.moved).toBe(false);
  });

  it("keeps ladder-entered tennis court actors inside the fence footprint", () => {
    const tennis: InteractableFixture = {
      id: "tennis-court-ladder",
      label: "Tennis court fence",
      kind: "tennis",
      position: { x: 0, z: 0 },
      radius: 4,
      height: 0.22,
      prompt: "Tennis",
      mode: "toggle",
      bypassObstacleIds: ["tennis"],
      raisedFootprint: {
        shape: "polygon",
        center: { x: 0, z: 0 },
        polygon: [
          { x: -4, z: -5 },
          { x: 4, z: -5 },
          { x: 4, z: 5 },
          { x: -4, z: 5 }
        ]
      }
    };
    const tennisObstacle: CollisionObstacle = {
      id: "tennis",
      label: "Tennis fence",
      sourceObjectId: "tennis",
      sourceObjectKind: "landmark",
      shape: "polygon",
      center: { x: 0, z: 0 },
      polygon: [
        { x: -4, z: -5 },
        { x: 4, z: -5 },
        { x: 4, z: 5 },
        { x: -4, z: 5 }
      ]
    };
    const world = makeWorld([tennis]);
    world.obstacleIndex = {
      forNearby: (_point, _radius, visit) => {
        visit(tennisObstacle);
      }
    };
    const locomotion = new PlayerLocomotion(world);
    const actor = createInitialPlayerState(1.25);
    actor.position.set(3.35, 1.25, 0);
    actor.activeFixtureId = tennis.id;

    const result = locomotion.moveOnFoot(actor, 0.35, { x: 1, z: 0, length: 1 }, {
      wantsSprint: false,
      condition: createInitialPlayerCondition()
    });

    expect(result.moved).toBe(true);
    expect(actor.activeFixtureId).toBe(tennis.id);
    expect(actor.position.x).toBeLessThanOrEqual(3.41);
  });
});
