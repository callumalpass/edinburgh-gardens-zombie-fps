import { describe, expect, it } from "vitest";
import { createInitialPlayerCondition, simulatePlayerCondition } from "../src/game/playerCondition";
import { createInitialPlayerState } from "../src/game/playerState";
import { PlayerLocomotion, type LocomotionWorld } from "../src/game/systems/PlayerLocomotion";
import { PlayerSimulation } from "../src/game/systems/PlayerSimulation";
import { triggerAuthoritativeWeapon } from "../src/game/systems/PlayerWeaponSimulation";
import { addWeapon, createInitialLoadout } from "../src/game/weapons";

const world: LocomotionWorld = {
  boundary: [{ x: -500, z: -500 }, { x: 500, z: -500 }, { x: 500, z: 500 }, { x: -500, z: 500 }],
  skateBowls: [],
  interactables: [],
  obstacleIndex: { forNearby: () => undefined },
  groundY: () => 0,
  movementSurfaceAt: () => "asphalt",
  surfaceSpeedMultiplier: () => 1,
  bikeSurfaceSpeedMultiplier: () => 1,
  skateboardSurfaceSpeedMultiplier: () => 1
};

function runFrame(
  simulation: PlayerSimulation,
  actor: ReturnType<typeof createInitialPlayerState>,
  condition: ReturnType<typeof createInitialPlayerCondition>,
  sprint: boolean
) {
  const movement = simulation.simulateMotion(actor, condition, 1 / 60, {
    input: { moveX: 0, moveZ: -1, sprint, crouch: false },
    mount: { kind: "foot" }
  });
  simulatePlayerCondition(actor, condition, 1 / 60, {
    sprinting: movement.sprinting,
    scoped: false,
    resting: false,
    searching: false,
    daylight: 0.5,
    sheltered: false,
    bikePumpBoosted: false
  });
}

describe("authoritative player simulation", () => {
  it("produces identical state for local and network actors given the same commands", () => {
    const simulation = new PlayerSimulation(new PlayerLocomotion(world));
    const local = createInitialPlayerState(0);
    const remote = createInitialPlayerState(0);
    const localCondition = createInitialPlayerCondition();
    const remoteCondition = createInitialPlayerCondition();

    for (let tick = 0; tick < 240; tick += 1) {
      const sprint = tick < 150;
      runFrame(simulation, local, localCondition, sprint);
      runFrame(simulation, remote, remoteCondition, sprint);
    }

    expect(remote.position.toArray()).toEqual(local.position.toArray());
    expect(remote.velocity.toArray()).toEqual(local.velocity.toArray());
    expect(remoteCondition).toEqual(localCondition);
  });

  it("drains sprint stamina and recovers it while continuing to walk", () => {
    const simulation = new PlayerSimulation(new PlayerLocomotion(world));
    const actor = createInitialPlayerState(0);
    const start = actor.position.clone();
    const condition = createInitialPlayerCondition();

    for (let tick = 0; tick < 180; tick += 1) runFrame(simulation, actor, condition, true);
    const afterSprint = condition.stamina;
    for (let tick = 0; tick < 120; tick += 1) runFrame(simulation, actor, condition, false);

    expect(afterSprint).toBeLessThan(55);
    expect(condition.stamina).toBeGreaterThan(afterSprint + 20);
    expect(actor.position.distanceTo(start)).toBeGreaterThan(35);
  });

  it("uses one authoritative weapon gate for peers and the in-process player", () => {
    const makePlayer = () => ({
      loadout: addWeapon(createInitialLoadout(), "carbine"),
      condition: createInitialPlayerCondition(),
      lastShotAt: 0
    });
    const local = makePlayer();
    const remote = makePlayer();

    expect(triggerAuthoritativeWeapon(local, 10).kind).toBe("firearm");
    expect(triggerAuthoritativeWeapon(remote, 10).kind).toBe("firearm");
    expect(remote.loadout.ammoInMagazine).toBe(local.loadout.ammoInMagazine);
    expect(triggerAuthoritativeWeapon(local, 10.01).kind).toBe("denied");
    expect(triggerAuthoritativeWeapon(remote, 11, { mounted: true, canFireMounted: false })).toMatchObject({
      kind: "denied",
      reason: "mounted"
    });
  });
});
