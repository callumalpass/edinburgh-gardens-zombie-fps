import { describe, expect, it } from "vitest";
import {
  applyUpgrade,
  addWeapon,
  canUpgrade,
  consumeRound,
  createInitialLoadout,
  damageAtDistance,
  effectiveFirearmSpread,
  finishReloadIfReady,
  getWeaponStats,
  hasWeapon,
  startReload,
  switchWeapon,
  WEAPON_DEFINITIONS,
  weatherWeaponInstability,
  upgradeCost
} from "../src/game/weapons";
import { zombieProfile } from "../src/game/zombieProfiles";

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
    let loadout = addWeapon(createInitialLoadout(), "carbine");
    const beforeShot = loadout.ammoInMagazine;
    expect(beforeShot).toBeGreaterThan(0);
    loadout = consumeRound(loadout);
    expect(loadout.ammoInMagazine).toBe(beforeShot - 1);
    loadout = startReload(loadout, 10);
    expect(loadout.reloadingUntil).toBeGreaterThan(10);
    loadout = finishReloadIfReady(loadout, 100);
    expect(loadout.ammoInMagazine).toBe(getWeaponStats(loadout).magazineSize);
  });

  it("adds discovered weapons and switches active stats", () => {
    let loadout = createInitialLoadout();
    expect(loadout.weaponId).toBe("knife");
    expect(hasWeapon(loadout, "knife")).toBe(true);
    expect(getWeaponStats(loadout).kind).toBe("melee");
    expect(hasWeapon(loadout, "shotgun")).toBe(false);
    loadout = addWeapon(loadout, "shotgun");
    expect(hasWeapon(loadout, "shotgun")).toBe(true);
    expect(loadout.weaponId).toBe("shotgun");
    expect(getWeaponStats(loadout).pellets).toBeGreaterThan(1);
  });

  it("preserves firearm magazines when switching through melee weapons", () => {
    let loadout = addWeapon(createInitialLoadout(), "carbine");
    loadout = consumeRound(loadout);
    const carbineAmmo = loadout.ammoInMagazine;
    loadout = addWeapon(loadout, "machete");
    expect(getWeaponStats(loadout).kind).toBe("melee");
    expect(loadout.ammoInMagazine).toBe(0);
    loadout = switchWeapon(loadout, "carbine");
    expect(loadout.ammoInMagazine).toBe(carbineAmmo);
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

  it("gives weapons sharper tactical identities", () => {
    let loadout = createInitialLoadout();
    const knife = getWeaponStats(loadout);
    loadout = addWeapon(loadout, "machete");
    const machete = getWeaponStats(loadout);
    loadout = addWeapon(loadout, "shotgun");
    const shotgun = getWeaponStats(loadout);
    loadout = addWeapon(loadout, "smg");
    const smg = getWeaponStats(loadout);
    loadout = addWeapon(loadout, "rifle");
    const rifle = getWeaponStats(loadout);

    expect(knife.noiseMultiplier).toBeLessThan(machete.noiseMultiplier);
    expect(machete.penetration).toBeGreaterThan(knife.penetration);
    expect(shotgun.noiseMultiplier).toBeGreaterThan(smg.noiseMultiplier);
    expect(rifle.noiseMultiplier).toBeGreaterThan(shotgun.noiseMultiplier);
    expect(smg.movingSpread).toBeGreaterThan(rifle.movingSpread);
    expect(WEAPON_DEFINITIONS.rifle.pickupAmmo).toBeLessThan(WEAPON_DEFINITIONS.carbine.pickupAmmo);
  });

  it("keeps emergency melee responsive enough for early pressure", () => {
    const knife = getWeaponStats(createInitialLoadout());
    const shambler = zombieProfile("shambler");
    const twoBodyHits = damageAtDistance(knife, 2.4, "body") * 2;

    expect(knife.fireDelay).toBeLessThan(0.4);
    expect(knife.range).toBeGreaterThan(4.4);
    expect(twoBodyHits).toBeGreaterThanOrEqual(shambler.health);
  });

  it("makes firearms stronger through feel rather than raw noise", () => {
    let loadout = addWeapon(createInitialLoadout(), "carbine");
    const carbine = getWeaponStats(loadout);
    loadout = addWeapon(loadout, "shotgun");
    const shotgun = getWeaponStats(loadout);
    loadout = addWeapon(loadout, "smg");
    const smg = getWeaponStats(loadout);

    expect(carbine.magazineSize).toBeGreaterThanOrEqual(14);
    expect(carbine.recoilKick).toBeLessThan(shotgun.recoilKick);
    expect(shotgun.reloadTime).toBeLessThan(1.5);
    expect(shotgun.staggerPower).toBeGreaterThan(0.9);
    expect(smg.maxBloom).toBeLessThan(0.055);
  });

  it("adds a modest weather handling penalty without overwhelming stance and aiming", () => {
    const loadout = addWeapon(createInitialLoadout(), "rifle");
    const stats = getWeaponStats(loadout);
    const clear = { precipitation: 0, wind: 0.2, wetness: 0.18 };
    const storm = { precipitation: 1, wind: 0.9, wetness: 1 };
    const standingStorm = effectiveFirearmSpread(stats, {
      movementSpeed: 0,
      shotBloom: 0,
      crouching: false,
      aimAmount: 0,
      aimHeld: false,
      stamina: 100,
      weather: storm
    });
    const standingClear = effectiveFirearmSpread(stats, {
      movementSpeed: 0,
      shotBloom: 0,
      crouching: false,
      aimAmount: 0,
      aimHeld: false,
      stamina: 100,
      weather: clear
    });
    const crouchedAimedStorm = effectiveFirearmSpread(stats, {
      movementSpeed: 0,
      shotBloom: 0,
      crouching: true,
      aimAmount: 1,
      aimHeld: true,
      stamina: 100,
      weather: storm
    });

    expect(weatherWeaponInstability(storm)).toBeGreaterThan(weatherWeaponInstability(clear));
    expect(standingStorm).toBeGreaterThan(standingClear);
    expect(standingStorm / standingClear).toBeLessThan(1.12);
    expect(crouchedAimedStorm).toBeLessThan(standingClear);
  });
});
