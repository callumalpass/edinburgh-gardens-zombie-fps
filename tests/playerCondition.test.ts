import { describe, expect, it } from "vitest";
import {
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
});
