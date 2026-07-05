import { describe, expect, it } from "vitest";
import { createLevelData } from "../src/game/levelData";
import { claimObjectiveReward, createActiveObjective, createObjectiveCycle, updateObjectiveProgress } from "../src/game/objectives";
import { createInitialLoadout } from "../src/game/weapons";

describe("intermission objectives", () => {
  it("builds a rotating objective cycle from real map features", () => {
    const cycle = createObjectiveCycle(createLevelData());
    expect(cycle.map((objective) => objective.id)).toEqual([
      "rotunda-relay",
      "grandstand-radio",
      "rail-cache",
      "basketball-hold",
      "bbq-supplies"
    ]);
    expect(cycle.every((objective) => objective.position && objective.radius > 0)).toBe(true);
  });

  it("progresses only while holding the objective zone and decays outside it", () => {
    const definition = createObjectiveCycle(createLevelData())[0];
    let objective = createActiveObjective(definition);
    objective = updateObjectiveProgress(objective, objective.position, definition.holdSeconds / 2);
    expect(objective.completed).toBe(false);
    expect(objective.progress).toBeCloseTo(definition.holdSeconds / 2);

    objective = updateObjectiveProgress(objective, { x: objective.position.x + 200, z: objective.position.z }, 1);
    expect(objective.progress).toBeLessThan(definition.holdSeconds / 2);

    objective = updateObjectiveProgress(objective, objective.position, definition.holdSeconds);
    expect(objective.completed).toBe(true);
  });

  it("rewards scarce resources without mutating the previous loadout", () => {
    const definition = createObjectiveCycle(createLevelData())[2];
    const objective = { ...createActiveObjective(definition), completed: true };
    const loadout = createInitialLoadout();
    const reward = claimObjectiveReward(objective, 10, loadout);

    expect(reward.scrap).toBe(10 + definition.rewardScrap);
    expect(reward.loadout.reserveAmmo).toBe(loadout.reserveAmmo + definition.rewardAmmo);
    expect(loadout.reserveAmmo).toBe(72);
  });
});
