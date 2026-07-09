import { describe, expect, it } from "vitest";
import { claimIntermissionUpgrade, intermissionUpgradeChoices } from "../src/game/intermissionChoices";
import { createInitialLoadout } from "../src/game/weapons";

describe("intermission upgrade choices", () => {
  it("offers three distinct eligible upgrades and rotates them by wave", () => {
    const loadout = createInitialLoadout();
    const first = intermissionUpgradeChoices(loadout, 1);
    const second = intermissionUpgradeChoices(loadout, 2);

    expect(first).toHaveLength(3);
    expect(new Set(first.map((choice) => choice.id)).size).toBe(3);
    expect(second.map((choice) => choice.id)).not.toEqual(first.map((choice) => choice.id));
  });

  it("claims a choice without mutating the original loadout", () => {
    const loadout = createInitialLoadout();
    const upgraded = claimIntermissionUpgrade(loadout, "damage");

    expect(loadout.upgrades.damage).toBe(0);
    expect(upgraded.upgrades.damage).toBe(1);
  });

  it("does not offer maxed upgrades", () => {
    const loadout = createInitialLoadout();
    loadout.upgrades.damage = 4;
    loadout.upgrades.reload = 3;
    loadout.upgrades.spread = 3;
    loadout.upgrades.magazine = 4;
    loadout.upgrades.fireRate = 3;

    expect(intermissionUpgradeChoices(loadout, 8)).toEqual([]);
  });
});
