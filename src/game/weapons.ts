import type { WeatherState } from "./rendering/weather";

export type UpgradeId = "damage" | "fireRate" | "magazine" | "reload" | "spread";
export type WeaponId = "knife" | "machete" | "carbine" | "shotgun" | "flareGun" | "smg" | "rifle";

export interface FirearmSpreadContext {
  movementSpeed: number;
  shotBloom: number;
  crouching: boolean;
  aimAmount: number;
  aimHeld: boolean;
  stamina: number;
  hydration?: number;
  weather?: Pick<WeatherState, "precipitation" | "wind" | "wetness">;
  weatherProtection?: number;
}

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
    damage: 38,
    fireDelay: 0.36,
    magazineSize: 0,
    reloadTime: 0,
    spread: 0,
    pellets: 1,
    range: 4.55,
    falloffStart: 3.35,
    recoilKick: 0.2,
    recoilDrift: 0.14,
    movingSpread: 0,
    bloomPerShot: 0,
    maxBloom: 0,
    headshotMultiplier: 1.65,
    staggerPower: 0.45,
    penetration: 1,
    noiseMultiplier: 0.13,
    sway: 0.32,
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
    damage: 58,
    fireDelay: 0.72,
    magazineSize: 0,
    reloadTime: 0,
    spread: 0,
    pellets: 1,
    range: 6.1,
    falloffStart: 4.35,
    recoilKick: 0.3,
    recoilDrift: 0.2,
    movingSpread: 0,
    bloomPerShot: 0,
    maxBloom: 0,
    headshotMultiplier: 1.7,
    staggerPower: 0.72,
    penetration: 2,
    noiseMultiplier: 0.24,
    sway: 0.38,
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
    damage: 35,
    fireDelay: 0.27,
    magazineSize: 14,
    reloadTime: 1.45,
    spread: 0.011,
    pellets: 1,
    range: 115,
    falloffStart: 62,
    recoilKick: 0.42,
    recoilDrift: 0.5,
    movingSpread: 0.012,
    bloomPerShot: 0.0035,
    maxBloom: 0.024,
    headshotMultiplier: 1.85,
    staggerPower: 0.18,
    penetration: 1,
    noiseMultiplier: 0.94,
    sway: 0.55,
    scopeZoom: 1.55,
    aimSpreadMultiplier: 0.62,
    aimRecoilMultiplier: 0.72,
    reloadStyle: "magazine",
    pickupAmmo: 50
  },
  shotgun: {
    id: "shotgun",
    kind: "firearm",
    name: "Grandstand shotgun",
    damage: 20,
    fireDelay: 0.82,
    magazineSize: 6,
    reloadTime: 1.42,
    spread: 0.046,
    pellets: 8,
    range: 56,
    falloffStart: 17,
    recoilKick: 1.08,
    recoilDrift: 0.82,
    movingSpread: 0.023,
    bloomPerShot: 0.012,
    maxBloom: 0.052,
    headshotMultiplier: 1.35,
    staggerPower: 0.92,
    penetration: 1,
    noiseMultiplier: 1.52,
    sway: 0.66,
    scopeZoom: 1,
    aimSpreadMultiplier: 0.9,
    aimRecoilMultiplier: 0.9,
    reloadStyle: "single",
    pickupAmmo: 26
  },
  flareGun: {
    id: "flareGun",
    kind: "firearm",
    name: "Signal flare gun",
    damage: 24,
    fireDelay: 1.08,
    magazineSize: 1,
    reloadTime: 1.85,
    spread: 0.018,
    pellets: 1,
    range: 92,
    falloffStart: 50,
    recoilKick: 0.7,
    recoilDrift: 0.42,
    movingSpread: 0.018,
    bloomPerShot: 0.004,
    maxBloom: 0.018,
    headshotMultiplier: 1.22,
    staggerPower: 0.38,
    penetration: 1,
    noiseMultiplier: 1.28,
    sway: 0.48,
    scopeZoom: 1,
    aimSpreadMultiplier: 0.82,
    aimRecoilMultiplier: 0.8,
    reloadStyle: "single",
    pickupAmmo: 8
  },
  smg: {
    id: "smg",
    kind: "firearm",
    name: "Tennis club SMG",
    damage: 16,
    fireDelay: 0.086,
    magazineSize: 30,
    reloadTime: 1.25,
    spread: 0.023,
    pellets: 1,
    range: 82,
    falloffStart: 34,
    recoilKick: 0.26,
    recoilDrift: 0.9,
    movingSpread: 0.03,
    bloomPerShot: 0.0065,
    maxBloom: 0.052,
    headshotMultiplier: 1.65,
    staggerPower: 0.12,
    penetration: 1,
    noiseMultiplier: 0.78,
    sway: 0.76,
    scopeZoom: 1,
    aimSpreadMultiplier: 0.86,
    aimRecoilMultiplier: 0.82,
    reloadStyle: "magazine",
    pickupAmmo: 84
  },
  rifle: {
    id: "rifle",
    kind: "firearm",
    name: "Rail trail rifle",
    damage: 82,
    fireDelay: 0.76,
    magazineSize: 5,
    reloadTime: 1.65,
    spread: 0.004,
    pellets: 1,
    range: 190,
    falloffStart: 96,
    recoilKick: 0.88,
    recoilDrift: 0.32,
    movingSpread: 0.01,
    bloomPerShot: 0.003,
    maxBloom: 0.016,
    headshotMultiplier: 2.25,
    staggerPower: 0.48,
    penetration: 2,
    noiseMultiplier: 1.68,
    sway: 0.36,
    scopeZoom: 2.8,
    aimSpreadMultiplier: 0.38,
    aimRecoilMultiplier: 0.56,
    reloadStyle: "magazine",
    pickupAmmo: 20
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
      flareGun: 0,
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
    magazineSize: base.magazineSize + magazineLevel * (loadout.weaponId === "flareGun" ? 1 : loadout.weaponId === "shotgun" || loadout.weaponId === "rifle" ? 2 : 5),
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
  const falloff = 1 - falloffT * 0.5;
  const zoneMultiplier = zone === "head" ? stats.headshotMultiplier : zone === "legs" ? 0.76 : 1;
  return Math.max(1, Math.round(stats.damage * falloff * zoneMultiplier));
}

export function weatherWeaponInstability(weather?: Pick<WeatherState, "precipitation" | "wind" | "wetness">, weatherProtection = 0): number {
  if (!weather) return 0;
  const protection = Math.max(0, Math.min(1, weatherProtection));
  return Math.min(
    0.18,
    weather.precipitation * (1 - protection * 0.78) * 0.06 +
      weather.wind * (1 - protection * 0.42) * 0.07 +
      weather.wetness * (1 - protection * 0.62) * 0.05
  );
}

export function effectiveFirearmSpread(stats: WeaponStats, context: FirearmSpreadContext): number {
  if (stats.kind !== "firearm") return 0;
  const movementSpread = Math.min(1, Math.max(0, context.movementSpeed) / 22) * stats.movingSpread;
  const crouchSpread = context.crouching ? 0.64 : 1;
  const breathControl = context.aimAmount > 0.55 && context.aimHeld ? (context.stamina > 12 ? 0.86 : 1.18) : 1;
  const hydration = context.hydration ?? 100;
  const hydrationSway = hydration < 12 ? 1.24 : hydration < 30 ? 1.14 : hydration < 55 ? 1.06 : 1;
  const aimSpread = 1 + (stats.aimSpreadMultiplier - 1) * Math.max(0, Math.min(1, context.aimAmount));
  const weatherJitter = (stats.spread * 0.22 + stats.movingSpread * 0.08) * weatherWeaponInstability(context.weather, context.weatherProtection);
  return (stats.spread + movementSpread + context.shotBloom + weatherJitter) * aimSpread * crouchSpread * breathControl * hydrationSway;
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
