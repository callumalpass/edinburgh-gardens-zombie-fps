import { describe, expect, it } from "vitest";
import {
  applyUpgrade,
  addWeapon,
  canUpgrade,
  consumeRound,
  createInitialLoadout,
  damageAtDistance,
  finishReloadIfReady,
  getWeaponStats,
  hasWeapon,
  startReload,
  upgradeCost
} from "../src/game/weapons";

describe("weapon upgrades", () => {
  it("improves stats without mutating the previous loadout", () => {
    const first = createInitialLoadout();
    const next = applyUpgrade(first, "damage");
    expect(first.upgrades.damage).toBe(0);
    expect(next.upgrades.damage).toBe(1);
    expect(getWeaponStats(next).damage).toBeGreaterThan(getWeaponStats(first).damage);
  });

  it("scales upgrade costs and caps max levels", () => {
    expect(upgradeCost("magazine", 1)).toBeGreaterThan(upgradeCost("magazine", 0));
    let loadout = createInitialLoadout();
    while (canUpgrade(loadout, "spread")) {
      loadout = applyUpgrade(loadout, "spread");
    }
    expect(canUpgrade(loadout, "spread")).toBe(false);
  });

  it("supports magazine consumption and timed reloads", () => {
    let loadout = createInitialLoadout();
    loadout = consumeRound(loadout);
    expect(loadout.ammoInMagazine).toBe(getWeaponStats(loadout).magazineSize - 1);
    loadout = startReload(loadout, 10);
    expect(loadout.reloadingUntil).toBeGreaterThan(10);
    loadout = finishReloadIfReady(loadout, 100);
    expect(loadout.ammoInMagazine).toBe(getWeaponStats(loadout).magazineSize);
  });

  it("adds discovered weapons and switches active stats", () => {
    let loadout = createInitialLoadout();
    expect(hasWeapon(loadout, "shotgun")).toBe(false);
    loadout = addWeapon(loadout, "shotgun");
    expect(hasWeapon(loadout, "shotgun")).toBe(true);
    expect(loadout.weaponId).toBe("shotgun");
    expect(getWeaponStats(loadout).pellets).toBeGreaterThan(1);
  });

  it("models scoped damage falloff and hit zones", () => {
    let loadout = addWeapon(createInitialLoadout(), "rifle");
    const stats = getWeaponStats(loadout);
    expect(stats.scopeZoom).toBeGreaterThan(2);
    expect(stats.penetration).toBeGreaterThan(1);
    expect(damageAtDistance(stats, 35, "head")).toBeGreaterThan(damageAtDistance(stats, 35, "body"));
    expect(damageAtDistance(stats, stats.range, "legs")).toBeLessThan(stats.damage);

    loadout = addWeapon(loadout, "shotgun");
    const shotgun = getWeaponStats(loadout);
    expect(shotgun.reloadStyle).toBe("single");
    expect(shotgun.staggerPower).toBeGreaterThan(stats.staggerPower);
    expect(shotgun.scopeZoom).toBe(1);
    expect(getWeaponStats(addWeapon(loadout, "smg")).sway).toBeGreaterThan(stats.sway);
  });
});
