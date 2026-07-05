export type UpgradeId = "damage" | "fireRate" | "magazine" | "reload" | "spread";
export type WeaponId = "carbine" | "shotgun" | "smg" | "rifle";

export interface WeaponStats {
  id?: WeaponId;
  name: string;
  damage: number;
  fireDelay: number;
  magazineSize: number;
  reloadTime: number;
  spread: number;
  pellets: number;
  range: number;
  falloffStart: number;
  recoilKick: number;
  recoilDrift: number;
  movingSpread: number;
  bloomPerShot: number;
  maxBloom: number;
  headshotMultiplier: number;
  scopeZoom: number;
  aimSpreadMultiplier: number;
  aimRecoilMultiplier: number;
  reloadStyle: "magazine" | "single";
  pickupAmmo?: number;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  label: string;
  maxLevel: number;
  baseCost: number;
  description: string;
}

export interface Loadout {
  weaponId: WeaponId;
  inventory: WeaponId[];
  upgrades: Record<UpgradeId, number>;
  ammoInMagazine: number;
  reserveAmmo: number;
  reloadingUntil: number;
  reloadStartedAt: number;
}

export const WEAPON_DEFINITIONS: Record<WeaponId, WeaponStats & { id: WeaponId; pickupAmmo: number }> = {
  carbine: {
    id: "carbine",
    name: "Emergency carbine",
    damage: 31,
    fireDelay: 0.27,
    magazineSize: 12,
    reloadTime: 1.55,
    spread: 0.012,
    pellets: 1,
    range: 115,
    falloffStart: 62,
    recoilKick: 0.5,
    recoilDrift: 0.55,
    movingSpread: 0.014,
    bloomPerShot: 0.004,
    maxBloom: 0.028,
    headshotMultiplier: 1.85,
    scopeZoom: 1.55,
    aimSpreadMultiplier: 0.62,
    aimRecoilMultiplier: 0.72,
    reloadStyle: "magazine",
    pickupAmmo: 54
  },
  shotgun: {
    id: "shotgun",
    name: "Grandstand shotgun",
    damage: 18,
    fireDelay: 0.82,
    magazineSize: 6,
    reloadTime: 1.9,
    spread: 0.048,
    pellets: 8,
    range: 58,
    falloffStart: 18,
    recoilKick: 1.05,
    recoilDrift: 0.9,
    movingSpread: 0.025,
    bloomPerShot: 0.014,
    maxBloom: 0.058,
    headshotMultiplier: 1.35,
    scopeZoom: 1,
    aimSpreadMultiplier: 0.9,
    aimRecoilMultiplier: 0.9,
    reloadStyle: "single",
    pickupAmmo: 30
  },
  smg: {
    id: "smg",
    name: "Tennis club SMG",
    damage: 18,
    fireDelay: 0.095,
    magazineSize: 28,
    reloadTime: 1.35,
    spread: 0.021,
    pellets: 1,
    range: 82,
    falloffStart: 34,
    recoilKick: 0.26,
    recoilDrift: 0.82,
    movingSpread: 0.026,
    bloomPerShot: 0.006,
    maxBloom: 0.044,
    headshotMultiplier: 1.65,
    scopeZoom: 1,
    aimSpreadMultiplier: 0.86,
    aimRecoilMultiplier: 0.82,
    reloadStyle: "magazine",
    pickupAmmo: 96
  },
  rifle: {
    id: "rifle",
    name: "Rail trail rifle",
    damage: 68,
    fireDelay: 0.62,
    magazineSize: 5,
    reloadTime: 1.75,
    spread: 0.004,
    pellets: 1,
    range: 180,
    falloffStart: 96,
    recoilKick: 0.82,
    recoilDrift: 0.35,
    movingSpread: 0.011,
    bloomPerShot: 0.003,
    maxBloom: 0.016,
    headshotMultiplier: 2.25,
    scopeZoom: 2.8,
    aimSpreadMultiplier: 0.38,
    aimRecoilMultiplier: 0.56,
    reloadStyle: "magazine",
    pickupAmmo: 26
  }
};

export const BASE_WEAPON: WeaponStats = WEAPON_DEFINITIONS.carbine;

export const UPGRADE_DEFINITIONS: Record<UpgradeId, UpgradeDefinition> = {
  damage: {
    id: "damage",
    label: "Rail barrel",
    maxLevel: 4,
    baseCost: 45,
    description: "More damage per shot"
  },
  fireRate: {
    id: "fireRate",
    label: "Fast cycling bolt",
    maxLevel: 3,
    baseCost: 55,
    description: "Shorter delay between shots"
  },
  magazine: {
    id: "magazine",
    label: "Extended mag",
    maxLevel: 4,
    baseCost: 40,
    description: "More rounds before reload"
  },
  reload: {
    id: "reload",
    label: "Quick reload kit",
    maxLevel: 3,
    baseCost: 35,
    description: "Faster reloads"
  },
  spread: {
    id: "spread",
    label: "Choke stabiliser",
    maxLevel: 3,
    baseCost: 45,
    description: "Tighter shot grouping"
  }
};

export function createInitialLoadout(): Loadout {
  return {
    weaponId: "carbine",
    inventory: ["carbine"],
    upgrades: {
      damage: 0,
      fireRate: 0,
      magazine: 0,
      reload: 0,
      spread: 0
    },
    ammoInMagazine: BASE_WEAPON.magazineSize,
    reserveAmmo: 72,
    reloadingUntil: 0,
    reloadStartedAt: 0
  };
}

export function getWeaponStats(loadout: Loadout): WeaponStats {
  const base = WEAPON_DEFINITIONS[loadout.weaponId];
  const damageLevel = loadout.upgrades.damage;
  const fireRateLevel = loadout.upgrades.fireRate;
  const magazineLevel = loadout.upgrades.magazine;
  const reloadLevel = loadout.upgrades.reload;
  const spreadLevel = loadout.upgrades.spread;

  return {
    ...base,
    damage: Math.round(base.damage * (1 + damageLevel * 0.24)),
    fireDelay: Math.max(0.07, base.fireDelay * (1 - fireRateLevel * 0.16)),
    magazineSize: base.magazineSize + magazineLevel * (loadout.weaponId === "shotgun" || loadout.weaponId === "rifle" ? 2 : 5),
    reloadTime: Math.max(0.62, base.reloadTime * (1 - reloadLevel * 0.17)),
    spread: Math.max(0.0025, base.spread * (1 - spreadLevel * 0.22)),
    movingSpread: Math.max(0.003, base.movingSpread * (1 - spreadLevel * 0.14)),
    bloomPerShot: Math.max(0.0015, base.bloomPerShot * (1 - spreadLevel * 0.12)),
    maxBloom: Math.max(0.006, base.maxBloom * (1 - spreadLevel * 0.1))
  };
}

export function damageAtDistance(stats: WeaponStats, distance: number, zone: "head" | "body" | "legs" = "body"): number {
  const falloffSpan = Math.max(1, stats.range - stats.falloffStart);
  const falloffT = Math.max(0, Math.min(1, (distance - stats.falloffStart) / falloffSpan));
  const falloff = 1 - falloffT * 0.55;
  const zoneMultiplier = zone === "head" ? stats.headshotMultiplier : zone === "legs" ? 0.72 : 1;
  return Math.max(1, Math.round(stats.damage * falloff * zoneMultiplier));
}

export function upgradeCost(upgradeId: UpgradeId, currentLevel: number): number {
  return Math.round(UPGRADE_DEFINITIONS[upgradeId].baseCost * Math.pow(1.65, currentLevel));
}

export function canUpgrade(loadout: Loadout, upgradeId: UpgradeId): boolean {
  return loadout.upgrades[upgradeId] < UPGRADE_DEFINITIONS[upgradeId].maxLevel;
}

export function applyUpgrade(loadout: Loadout, upgradeId: UpgradeId): Loadout {
  if (!canUpgrade(loadout, upgradeId)) {
    return loadout;
  }

  const next: Loadout = {
    ...loadout,
    upgrades: {
      ...loadout.upgrades,
      [upgradeId]: loadout.upgrades[upgradeId] + 1
    }
  };
  const nextStats = getWeaponStats(next);
  next.ammoInMagazine = Math.min(nextStats.magazineSize, next.ammoInMagazine + 3);
  return next;
}

export function startReload(loadout: Loadout, now: number): Loadout {
  if (loadout.reserveAmmo <= 0 || loadout.ammoInMagazine >= getWeaponStats(loadout).magazineSize) {
    return loadout;
  }
  return {
    ...loadout,
    reloadingUntil: now + getWeaponStats(loadout).reloadTime,
    reloadStartedAt: now
  };
}

export function finishReloadIfReady(loadout: Loadout, now: number): Loadout {
  if (loadout.reloadingUntil === 0 || now < loadout.reloadingUntil) {
    return loadout;
  }
  const stats = getWeaponStats(loadout);
  if (stats.reloadStyle === "single") {
    let ammoInMagazine = loadout.ammoInMagazine;
    let reserveAmmo = loadout.reserveAmmo;
    let reloadingUntil = loadout.reloadingUntil;
    while (now >= reloadingUntil && ammoInMagazine < stats.magazineSize && reserveAmmo > 0) {
      ammoInMagazine += 1;
      reserveAmmo -= 1;
      reloadingUntil += stats.reloadTime;
    }
    return {
      ...loadout,
      ammoInMagazine,
      reserveAmmo,
      reloadingUntil: ammoInMagazine >= stats.magazineSize || reserveAmmo <= 0 ? 0 : reloadingUntil,
      reloadStartedAt: ammoInMagazine >= stats.magazineSize || reserveAmmo <= 0 ? 0 : loadout.reloadStartedAt
    };
  }
  const needed = stats.magazineSize - loadout.ammoInMagazine;
  const loaded = Math.min(needed, loadout.reserveAmmo);
  return {
    ...loadout,
    ammoInMagazine: loadout.ammoInMagazine + loaded,
    reserveAmmo: loadout.reserveAmmo - loaded,
    reloadingUntil: 0,
    reloadStartedAt: 0
  };
}

export function consumeRound(loadout: Loadout): Loadout {
  if (loadout.ammoInMagazine <= 0) {
    return loadout;
  }
  return {
    ...loadout,
    ammoInMagazine: loadout.ammoInMagazine - 1
  };
}

export function addAmmo(loadout: Loadout, amount: number): Loadout {
  return {
    ...loadout,
    reserveAmmo: Math.min(360, loadout.reserveAmmo + amount)
  };
}

export function hasWeapon(loadout: Loadout, weaponId: WeaponId): boolean {
  return loadout.inventory.includes(weaponId);
}

export function addWeapon(loadout: Loadout, weaponId: WeaponId): Loadout {
  const alreadyOwned = hasWeapon(loadout, weaponId);
  const next: Loadout = {
    ...loadout,
    weaponId,
    inventory: alreadyOwned ? loadout.inventory : [...loadout.inventory, weaponId],
    reloadingUntil: 0,
    reloadStartedAt: 0,
    reserveAmmo: Math.min(360, loadout.reserveAmmo + WEAPON_DEFINITIONS[weaponId].pickupAmmo)
  };
  const stats = getWeaponStats(next);
  return {
    ...next,
    ammoInMagazine: Math.min(stats.magazineSize, Math.max(next.ammoInMagazine, Math.ceil(stats.magazineSize * 0.7)))
  };
}

export function switchWeapon(loadout: Loadout, weaponId: WeaponId): Loadout {
  if (!hasWeapon(loadout, weaponId) || loadout.weaponId === weaponId) {
    return loadout;
  }
  const next = {
    ...loadout,
    weaponId,
    reloadingUntil: 0,
    reloadStartedAt: 0
  };
  const stats = getWeaponStats(next);
  return {
    ...next,
    ammoInMagazine: Math.min(loadout.ammoInMagazine, stats.magazineSize)
  };
}
