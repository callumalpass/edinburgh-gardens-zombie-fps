import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PLAYER_HEIGHT, PLAYER_RADIUS, RAISED_SURFACE_EDGE_TOLERANCE } from "../src/game/gameConfig";
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
  it("uses a human-scale movement capsule", () => {
    expect(PLAYER_RADIUS).toBeCloseTo(0.48, 3);
    expect(PLAYER_RADIUS * 2).toBeLessThan(PLAYER_HEIGHT);
  });

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

  it("does not extend an elevated floor beyond its authored footprint", () => {
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
    actor.position.set(4 + RAISED_SURFACE_EDGE_TOLERANCE + 0.02, 1.25, 0);
    actor.height = 3;

    locomotion.updateFixtureElevation(actor, 1);

    expect(actor.heightTarget).toBe(0);
    expect(actor.height).toBeLessThan(0.01);
  });

  it("keeps rigid raised floors level over sloping terrain", () => {
    const fixture: InteractableFixture = {
      id: "flat-roof",
      label: "Flat roof",
      kind: "toilets",
      position: { x: 0, z: 0 },
      radius: 4,
      height: 3,
      prompt: "Roof",
      mode: "toggle",
      raisedFootprint: { shape: "box", center: { x: 0, z: 0 }, halfX: 4, halfZ: 3, angle: 0 }
    };
    const world = makeWorld([fixture]);
    world.groundY = (point) => point.x * 0.2;
    const locomotion = new PlayerLocomotion(world);
    const actor = createInitialPlayerState(0.6);
    actor.position.set(3, 0.6, 0);
    actor.activeFixtureId = fixture.id;

    locomotion.updateFixtureElevation(actor, 1);

    expect(actor.heightTarget).toBeCloseTo(2.4, 5);
    expect(world.groundY(actor.position) + actor.height).toBeCloseTo(3, 2);
  });

  it("anchors broad Blender roofs to their average footprint support", () => {
    const fixture: InteractableFixture = {
      id: "asset-roof",
      label: "Asset roof",
      kind: "building",
      position: { x: 0, z: 0 },
      radius: 5,
      height: 3,
      prompt: "Roof",
      mode: "toggle",
      raisedFootprint: { shape: "box", center: { x: 0, z: 0 }, halfX: 5, halfZ: 2, angle: 0 },
      surfaceGroundPoints: [{ x: -4, z: 0 }, { x: 4, z: 0 }]
    };
    const world = makeWorld([fixture]);
    world.groundY = (point) => 1 + point.x * 0.25;
    const locomotion = new PlayerLocomotion(world);

    expect(locomotion.fixtureElevationAt(fixture, { x: 2, z: 0 })).toBeCloseTo(2.5, 5);
    expect(world.groundY({ x: 2, z: 0 }) + locomotion.fixtureElevationAt(fixture, { x: 2, z: 0 })).toBeCloseTo(4, 5);
  });

  it("keeps the full capsule on non-tennis climbed decks", () => {
    const fixture: InteractableFixture = {
      id: "rotunda-deck",
      label: "Rotunda deck",
      kind: "rotunda",
      position: { x: 0, z: 0 },
      radius: 4,
      height: 2,
      prompt: "Deck",
      mode: "toggle",
      raisedFootprint: { shape: "circle", center: { x: 0, z: 0 }, radius: 4 }
    };
    const locomotion = new PlayerLocomotion(makeWorld([fixture]));
    const actor = createInitialPlayerState(1.25);
    actor.position.set(3.35, 1.25, 0);
    actor.activeFixtureId = fixture.id;

    locomotion.moveOnFoot(actor, 0.35, { x: 1, z: 0, length: 1 }, {
      wantsSprint: false,
      condition: createInitialPlayerCondition()
    });

    expect(Math.hypot(actor.position.x, actor.position.z)).toBeLessThanOrEqual(
      4 - PLAYER_RADIUS - RAISED_SURFACE_EDGE_TOLERANCE + 0.001
    );
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
