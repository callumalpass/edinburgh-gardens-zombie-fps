import { describe, expect, it } from "vitest";
import {
  applyBikePumpBoost,
  bleedDamagePerSecond,
  bikePumpSpeedMultiplier,
  createInitialPlayerCondition,
  hydrateCondition,
  hydrationStatus,
  nextHydration,
  nextStamina,
  speedMultiplierForCondition,
  spendStamina
} from "../src/game/playerCondition";

describe("player condition", () => {
  it("drains stamina for sprinting and recovers while resting", () => {
    const sprinted = nextStamina(100, 1, {
      sprinting: true,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false,
      hydration: 100
    });
    const rested = nextStamina(sprinted, 1, {
      sprinting: false,
      scoped: false,
      resting: true,
      searching: false,
      crouching: false,
      bleeding: false,
      hydration: 100
    });

    expect(sprinted).toBeLessThan(100);
    expect(rested).toBeGreaterThan(sprinted);
  });

  it("uses the bike pump as a temporary bike sprint boost", () => {
    const initial = createInitialPlayerCondition();
    const boosted = applyBikePumpBoost({ ...initial, stamina: 40 });
    const normalSprint = nextStamina(80, 1, {
      sprinting: true,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false
    });
    const boostedSprint = nextStamina(80, 1, {
      sprinting: true,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false,
      bikePumpBoosted: true
    });

    expect(boosted.bikePumpTimer).toBeGreaterThan(60);
    expect(boosted.stamina).toBeGreaterThan(40);
    expect(boostedSprint).toBeGreaterThan(normalSprint);
    expect(bikePumpSpeedMultiplier(boosted)).toBeGreaterThan(1);
    expect(bikePumpSpeedMultiplier(initial)).toBe(1);
  });

  it("spends stamina atomically and slows exhausted or limping players", () => {
    const initial = createInitialPlayerCondition();
    const spent = spendStamina(initial.stamina, 18);
    const denied = spendStamina(4, 18);

    expect(spent.spent).toBe(true);
    expect(spent.stamina).toBe(82);
    expect(denied.spent).toBe(false);
    expect(speedMultiplierForCondition({ stamina: 12, limpTimer: 0 })).toBeLessThan(1);
    expect(speedMultiplierForCondition({ stamina: 100, limpTimer: 4 })).toBeLessThan(1);
  });

  it("makes rest recovery decisive while keeping injuries meaningful", () => {
    const sprinted = nextStamina(40, 2, {
      sprinting: true,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false
    });
    const rested = nextStamina(sprinted, 2, {
      sprinting: false,
      scoped: false,
      resting: true,
      searching: false,
      crouching: false,
      bleeding: false
    });
    const bleedingRested = nextStamina(sprinted, 2, {
      sprinting: false,
      scoped: false,
      resting: true,
      searching: false,
      crouching: false,
      bleeding: true
    });

    expect(rested).toBeGreaterThan(40);
    expect(bleedingRested).toBeLessThan(rested);
    expect(bleedDamagePerSecond(5)).toBeLessThan(0.8);
  });

  it("uses structure shelter as a modest stamina advantage", () => {
    const exposedSprint = nextStamina(70, 1, {
      sprinting: true,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false
    });
    const shelteredSprint = nextStamina(70, 1, {
      sprinting: true,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false,
      sheltered: true
    });
    const exposedRecovery = nextStamina(40, 1, {
      sprinting: false,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false
    });
    const shelteredRecovery = nextStamina(40, 1, {
      sprinting: false,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false,
      sheltered: true
    });

    expect(shelteredSprint).toBeGreaterThan(exposedSprint);
    expect(shelteredRecovery).toBeGreaterThan(exposedRecovery);
    expect(shelteredRecovery - exposedRecovery).toBeLessThan(3);
  });

  it("drains hydration faster when sprinting or camping high", () => {
    const walking = nextHydration(100, 60, {
      sprinting: false,
      elevated: false,
      bleeding: false,
      daylight: 0.2
    });
    const exposedHighSprint = nextHydration(100, 60, {
      sprinting: true,
      elevated: true,
      bleeding: false,
      daylight: 1
    });

    expect(walking).toBeLessThan(100);
    expect(exposedHighSprint).toBeLessThan(walking);
  });

  it("uses thirst as a stamina and movement pressure instead of direct damage", () => {
    const hydrated = nextStamina(50, 1, {
      sprinting: false,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false,
      hydration: 100
    });
    const parched = nextStamina(50, 1, {
      sprinting: false,
      scoped: false,
      resting: false,
      searching: false,
      crouching: false,
      bleeding: false,
      hydration: 24
    });

    expect(parched).toBeLessThan(hydrated);
    expect(speedMultiplierForCondition({ stamina: 100, limpTimer: 0, hydration: 10 })).toBeLessThan(
      speedMultiplierForCondition({ stamina: 100, limpTimer: 0, hydration: 100 })
    );
    expect(hydrationStatus({ hydration: 50 })).toBe("Thirsty");
    expect(hydrationStatus({ hydration: 24 })).toBe("Parched");
    expect(hydrationStatus({ hydration: 8 })).toBe("Dehydrated");
  });

  it("refills hydration at drinking fountains", () => {
    const refilled = hydrateCondition({ ...createInitialPlayerCondition(), hydration: 18, stamina: 42, blurTimer: 6 });

    expect(refilled.hydration).toBe(100);
    expect(refilled.stamina).toBeGreaterThan(42);
    expect(refilled.blurTimer).toBeLessThan(6);
  });
});
