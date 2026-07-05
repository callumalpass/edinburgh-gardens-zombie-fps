export type UpgradeId = "damage" | "fireRate" | "magazine" | "reload" | "spread";
export type WeaponId = "knife" | "machete" | "carbine" | "shotgun" | "smg" | "rifle";

export interface WeaponStats {
  id?: WeaponId;
  kind: "melee" | "firearm";
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
  staggerPower: number;
  penetration: number;
  noiseMultiplier: number;
  sway: number;
  scopeZoom: number;
  aimSpreadMultiplier: number;
  aimRecoilMultiplier: number;
  reloadStyle: "magazine" | "single" | "none";
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
  magazines: Record<WeaponId, number>;
  ammoInMagazine: number;
  reserveAmmo: number;
  reloadingUntil: number;
  reloadStartedAt: number;
}

export const WEAPON_DEFINITIONS: Record<WeaponId, WeaponStats & { id: WeaponId; pickupAmmo: number }> = {
  knife: {
    id: "knife",
    kind: "melee",
    name: "Emergency knife",
    damage: 34,
    fireDelay: 0.42,
    magazineSize: 0,
    reloadTime: 0,
    spread: 0,
    pellets: 1,
    range: 4.25,
    falloffStart: 3.2,
    recoilKick: 0.22,
    recoilDrift: 0.18,
    movingSpread: 0,
    bloomPerShot: 0,
    maxBloom: 0,
    headshotMultiplier: 1.65,
    staggerPower: 0.38,
    penetration: 1,
    noiseMultiplier: 0.16,
    sway: 0.35,
    scopeZoom: 1,
    aimSpreadMultiplier: 1,
    aimRecoilMultiplier: 1,
    reloadStyle: "none",
    pickupAmmo: 0
  },
  machete: {
    id: "machete",
    kind: "melee",
    name: "Garden machete",
    damage: 54,
    fireDelay: 0.78,
    magazineSize: 0,
    reloadTime: 0,
    spread: 0,
    pellets: 1,
    range: 5.8,
    falloffStart: 4,
    recoilKick: 0.34,
    recoilDrift: 0.22,
    movingSpread: 0,
    bloomPerShot: 0,
    maxBloom: 0,
    headshotMultiplier: 1.7,
    staggerPower: 0.62,
    penetration: 2,
    noiseMultiplier: 0.28,
    sway: 0.42,
    scopeZoom: 1,
    aimSpreadMultiplier: 1,
    aimRecoilMultiplier: 1,
    reloadStyle: "none",
    pickupAmmo: 0
  },
  carbine: {
    id: "carbine",
    kind: "firearm",
    name: "Emergency carbine",
    damage: 33,
    fireDelay: 0.29,
    magazineSize: 12,
    reloadTime: 1.55,
    spread: 0.012,
    pellets: 1,
    range: 115,
    falloffStart: 62,
    recoilKick: 0.46,
    recoilDrift: 0.55,
    movingSpread: 0.014,
    bloomPerShot: 0.004,
    maxBloom: 0.028,
    headshotMultiplier: 1.85,
    staggerPower: 0.18,
    penetration: 1,
    noiseMultiplier: 0.94,
    sway: 0.55,
    scopeZoom: 1.55,
    aimSpreadMultiplier: 0.62,
    aimRecoilMultiplier: 0.72,
    reloadStyle: "magazine",
    pickupAmmo: 42
  },
  shotgun: {
    id: "shotgun",
    kind: "firearm",
    name: "Grandstand shotgun",
    damage: 18,
    fireDelay: 0.88,
    magazineSize: 6,
    reloadTime: 1.9,
    spread: 0.048,
    pellets: 8,
    range: 58,
    falloffStart: 18,
    recoilKick: 1.18,
    recoilDrift: 0.9,
    movingSpread: 0.025,
    bloomPerShot: 0.014,
    maxBloom: 0.058,
    headshotMultiplier: 1.35,
    staggerPower: 0.82,
    penetration: 1,
    noiseMultiplier: 1.58,
    sway: 0.72,
    scopeZoom: 1,
    aimSpreadMultiplier: 0.9,
    aimRecoilMultiplier: 0.9,
    reloadStyle: "single",
    pickupAmmo: 22
  },
  smg: {
    id: "smg",
    kind: "firearm",
    name: "Tennis club SMG",
    damage: 17,
    fireDelay: 0.088,
    magazineSize: 28,
    reloadTime: 1.35,
    spread: 0.026,
    pellets: 1,
    range: 82,
    falloffStart: 34,
    recoilKick: 0.3,
    recoilDrift: 1.05,
    movingSpread: 0.034,
    bloomPerShot: 0.008,
    maxBloom: 0.062,
    headshotMultiplier: 1.65,
    staggerPower: 0.1,
    penetration: 1,
    noiseMultiplier: 0.78,
    sway: 0.88,
    scopeZoom: 1,
    aimSpreadMultiplier: 0.86,
    aimRecoilMultiplier: 0.82,
    reloadStyle: "magazine",
    pickupAmmo: 72
  },
  rifle: {
    id: "rifle",
    kind: "firearm",
    name: "Rail trail rifle",
    damage: 76,
    fireDelay: 0.76,
    magazineSize: 5,
    reloadTime: 1.75,
    spread: 0.004,
    pellets: 1,
    range: 180,
    falloffStart: 96,
    recoilKick: 0.94,
    recoilDrift: 0.35,
    movingSpread: 0.011,
    bloomPerShot: 0.003,
    maxBloom: 0.016,
    headshotMultiplier: 2.25,
    staggerPower: 0.48,
    penetration: 2,
    noiseMultiplier: 1.72,
    sway: 0.42,
    scopeZoom: 2.8,
    aimSpreadMultiplier: 0.38,
    aimRecoilMultiplier: 0.56,
    reloadStyle: "magazine",
    pickupAmmo: 18
  }
};

export const BASE_WEAPON: WeaponStats = WEAPON_DEFINITIONS.knife;

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
    weaponId: "knife",
    inventory: ["knife"],
    upgrades: {
      damage: 0,
      fireRate: 0,
      magazine: 0,
      reload: 0,
      spread: 0
    },
    magazines: {
      knife: 0,
      machete: 0,
      carbine: 0,
      shotgun: 0,
      smg: 0,
      rifle: 0
    },
    ammoInMagazine: 0,
    reserveAmmo: 48,
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

  if (base.kind === "melee") {
    return {
      ...base,
      damage: Math.round(base.damage * (1 + damageLevel * 0.18)),
      fireDelay: Math.max(0.32, base.fireDelay * (1 - fireRateLevel * 0.1)),
      staggerPower: base.staggerPower * (1 + damageLevel * 0.08)
    };
  }

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
  const ammoInMagazine = Math.min(nextStats.magazineSize, next.ammoInMagazine + (nextStats.kind === "melee" ? 0 : 3));
  return {
    ...next,
    ammoInMagazine,
    magazines: {
      ...next.magazines,
      [next.weaponId]: ammoInMagazine
    }
  };
}

export function startReload(loadout: Loadout, now: number): Loadout {
  const stats = getWeaponStats(loadout);
  if (stats.kind === "melee" || loadout.reserveAmmo <= 0 || loadout.ammoInMagazine >= stats.magazineSize) {
    return loadout;
  }
  return {
    ...loadout,
    reloadingUntil: now + stats.reloadTime,
    reloadStartedAt: now
  };
}

export function finishReloadIfReady(loadout: Loadout, now: number): Loadout {
  if (loadout.reloadingUntil === 0 || now < loadout.reloadingUntil) {
    return loadout;
  }
  const stats = getWeaponStats(loadout);
  if (stats.kind === "melee") {
    return {
      ...loadout,
      reloadingUntil: 0,
      reloadStartedAt: 0
    };
  }
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
      magazines: {
        ...loadout.magazines,
        [loadout.weaponId]: ammoInMagazine
      },
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
    magazines: {
      ...loadout.magazines,
      [loadout.weaponId]: loadout.ammoInMagazine + loaded
    },
    reserveAmmo: loadout.reserveAmmo - loaded,
    reloadingUntil: 0,
    reloadStartedAt: 0
  };
}

export function consumeRound(loadout: Loadout): Loadout {
  if (getWeaponStats(loadout).kind === "melee" || loadout.ammoInMagazine <= 0) {
    return loadout;
  }
  const ammoInMagazine = loadout.ammoInMagazine - 1;
  return {
    ...loadout,
    ammoInMagazine,
    magazines: {
      ...loadout.magazines,
      [loadout.weaponId]: ammoInMagazine
    }
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
  const definition = WEAPON_DEFINITIONS[weaponId];
  const next: Loadout = {
    ...loadout,
    weaponId,
    inventory: alreadyOwned ? loadout.inventory : [...loadout.inventory, weaponId],
    reloadingUntil: 0,
    reloadStartedAt: 0,
    reserveAmmo: Math.min(360, loadout.reserveAmmo + definition.pickupAmmo)
  };
  const stats = getWeaponStats(next);
  const ammoInMagazine =
    stats.kind === "melee"
      ? 0
      : Math.min(stats.magazineSize, Math.max(next.magazines[weaponId] ?? 0, Math.ceil(stats.magazineSize * 0.7)));
  return {
    ...next,
    ammoInMagazine,
    magazines: {
      ...next.magazines,
      [weaponId]: ammoInMagazine
    }
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
  const ammoInMagazine = stats.kind === "melee" ? 0 : Math.min(next.magazines[weaponId] ?? 0, stats.magazineSize);
  return {
    ...next,
    ammoInMagazine
  };
}
