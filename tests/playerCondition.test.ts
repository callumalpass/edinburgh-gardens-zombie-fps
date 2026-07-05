import { describe, expect, it } from "vitest";
import {
  applyBikePumpBoost,
  bleedDamagePerSecond,
  bikePumpSpeedMultiplier,
  createInitialPlayerCondition,
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
      bleeding: false
    });
    const rested = nextStamina(sprinted, 1, {
      sprinting: false,
      scoped: false,
      resting: true,
      searching: false,
      crouching: false,
      bleeding: false
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
});
