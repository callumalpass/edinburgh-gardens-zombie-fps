import type { RandomSource } from "./types";
import type { AmenityPoint } from "./types";
import type { Pickup } from "./state";
import type { UpgradeId, WeaponId } from "./weapons";
import type { ZombieType } from "./zombieProfiles";
import { zombieProfile } from "./zombieProfiles";

export interface LootResult {
  scrap: number;
  ammo: number;
  health: number;
  attachment: UpgradeId | null;
  medicine: number;
  throwables: number;
  junk: boolean;
  quality: "junk" | "basic" | "useful" | "valuable";
  noiseMultiplier: number;
  searchSecondsMultiplier: number;
  status: string;
}

export interface LootSearchContext {
  exposed?: boolean;
  nearbyZombies?: number;
  wave?: number;
}

const ATTACHMENT_POOL: UpgradeId[] = ["damage", "reload", "magazine", "spread", "fireRate"];
const STRUCTURE_AMENITY_KINDS = new Set<AmenityPoint["kind"]>([
  "clubroom",
  "changeroom",
  "umpire_room",
  "gatehouse",
  "maintenance_room",
  "community_room",
  "kitchenette"
]);

export function isStructureAmenityKind(kind: AmenityPoint["kind"]): boolean {
  return STRUCTURE_AMENITY_KINDS.has(kind);
}

export function lootRiskScore(context: LootSearchContext = {}): number {
  const nearbyPressure = Math.min(0.46, (context.nearbyZombies ?? 0) * 0.115);
  const exposedPressure = context.exposed ? 0.28 : 0;
  const wavePressure = Math.min(0.22, Math.max(0, (context.wave ?? 1) - 1) * 0.018);
  return Math.min(1, nearbyPressure + exposedPressure + wavePressure);
}

export function lootNoiseMultiplier(kind: AmenityPoint["kind"], context: LootSearchContext = {}): number {
  const risk = lootRiskScore(context);
  const base =
    kind === "bbq"
      ? 1.05
      : kind === "waste_basket"
        ? 0.8
        : kind === "gatehouse"
          ? 0.82
          : kind === "umpire_room"
            ? 0.9
            : kind === "kitchenette"
              ? 0.96
          : kind === "maintenance_room" || kind === "changeroom"
            ? 1.02
            : isStructureAmenityKind(kind)
              ? 0.94
              : 0.92;
  return base * (1 + risk * 0.7);
}

export function lootSearchSecondsMultiplier(context: LootSearchContext = {}): number {
  return 1 + lootRiskScore(context) * 0.46;
}

export function searchAmenityLoot(kind: AmenityPoint["kind"], rng: RandomSource, context: LootSearchContext = {}): LootResult {
  const risk = lootRiskScore(context);
  const valueBoost = Math.round(risk * 10);
  const qualityRoll = rng.next() + risk * 0.34 + amenityLootBias(kind);
  const quality = qualityRoll > 0.94 ? "valuable" : qualityRoll > 0.62 ? "useful" : qualityRoll < 0.16 ? "junk" : "basic";
  const attachment = quality === "valuable" ? rng.pick(ATTACHMENT_POOL) : null;
  const throwables = quality === "useful" && rng.next() < 0.34 + risk * 0.22 ? 1 : quality === "valuable" && rng.next() < 0.28 ? 1 : 0;
  const noiseMultiplier = lootNoiseMultiplier(kind, context);
  const searchSecondsMultiplier = lootSearchSecondsMultiplier(context);

  if (kind === "waste_basket") {
    const junk = quality === "junk";
    return withLootDefaults({
      scrap: junk ? Math.max(1, rng.int(0, 2)) : 5 + rng.int(0, 6) + Math.floor(valueBoost * 0.5),
      ammo: junk ? 0 : rng.next() < 0.18 + risk * 0.32 ? 4 + Math.floor(valueBoost * 0.35) : 0,
      health: 0,
      attachment,
      throwables,
      junk,
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: junk ? "Only junk in bin" : quality === "valuable" ? "Found a wrapped attachment in bin" : "Found scraps in bin"
    });
  }
  if (kind === "bicycle_parking") {
    return withLootDefaults({
      scrap: 11 + rng.int(0, 8) + valueBoost,
      ammo: 4 + rng.int(0, 6) + Math.floor(valueBoost * 0.45),
      health: 0,
      attachment,
      throwables,
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Recovered bike-tool attachment" : quality === "junk" ? "Mostly bent bike parts" : "Stripped bike rack supplies"
    });
  }
  if (kind === "bbq") {
    return withLootDefaults({
      scrap: 8 + rng.int(0, 7) + valueBoost,
      ammo: 7 + rng.int(0, 8) + Math.floor(valueBoost * 0.65),
      health: 4 + rng.int(0, 8),
      attachment,
      throwables,
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found sealed BBQ cache attachment" : quality === "junk" ? "Found greasy junk at BBQ" : "Searched BBQ supplies"
    });
  }
  if (kind === "toilets") {
    return withLootDefaults({
      scrap: rng.int(0, 5) + Math.floor(valueBoost * 0.4),
      ammo: risk > 0.45 && rng.next() < 0.22 ? 5 + Math.floor(valueBoost * 0.4) : 0,
      health: 10 + rng.int(0, 10) + Math.floor(valueBoost * 0.45),
      attachment,
      medicine: 10 + Math.round(risk * 12),
      throwables,
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found maintenance-room attachment" : "Sheltered at toilets"
    });
  }
  if (kind === "clubroom") {
    return withLootDefaults({
      scrap: 10 + rng.int(0, 9) + valueBoost,
      ammo: 8 + rng.int(0, 8) + Math.floor(valueBoost * 0.55),
      health: rng.next() < 0.35 ? 4 + rng.int(0, 5) : 0,
      attachment,
      throwables,
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found clubroom attachment" : quality === "junk" ? "Clubroom mostly empty" : "Recovered clubroom supplies"
    });
  }
  if (kind === "changeroom") {
    return withLootDefaults({
      scrap: 7 + rng.int(0, 6) + Math.floor(valueBoost * 0.8),
      ammo: 6 + rng.int(0, 7) + Math.floor(valueBoost * 0.5),
      health: 8 + rng.int(0, 10) + Math.floor(valueBoost * 0.4),
      attachment,
      medicine: 8 + Math.round(risk * 10),
      throwables,
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found changeroom attachment" : "Restocked from changeroom kit"
    });
  }
  if (kind === "umpire_room") {
    return withLootDefaults({
      scrap: 9 + rng.int(0, 8) + valueBoost,
      ammo: 7 + rng.int(0, 8) + Math.floor(valueBoost * 0.55),
      health: rng.next() < 0.38 ? 5 + rng.int(0, 7) : 0,
      attachment,
      medicine: rng.next() < 0.42 ? 6 + Math.round(risk * 8) : 0,
      throwables,
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found umpire-room attachment" : "Recovered umpire-room supplies"
    });
  }
  if (kind === "gatehouse") {
    return withLootDefaults({
      scrap: 12 + rng.int(0, 9) + valueBoost,
      ammo: quality === "valuable" || rng.next() < 0.32 + risk * 0.25 ? 5 + Math.floor(valueBoost * 0.45) : 0,
      health: 0,
      attachment,
      throwables: quality === "valuable" && rng.next() < 0.32 ? 1 : 0,
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found gatehouse attachment" : "Found gatehouse keys and scrap"
    });
  }
  if (kind === "maintenance_room") {
    return withLootDefaults({
      scrap: 13 + rng.int(0, 10) + valueBoost,
      ammo: 5 + rng.int(0, 7) + Math.floor(valueBoost * 0.45),
      health: rng.next() < 0.42 ? 6 + rng.int(0, 8) : 0,
      attachment,
      medicine: rng.next() < 0.45 ? 5 + Math.round(risk * 9) : 0,
      throwables: Math.min(2, throwables + (rng.next() < 0.22 + risk * 0.18 ? 1 : 0)),
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found service-room attachment" : "Recovered maintenance supplies"
    });
  }
  if (kind === "community_room") {
    return withLootDefaults({
      scrap: 5 + rng.int(0, 6) + Math.floor(valueBoost * 0.45),
      ammo: risk > 0.38 && rng.next() < 0.28 ? 4 + Math.floor(valueBoost * 0.35) : 0,
      health: 12 + rng.int(0, 10) + Math.floor(valueBoost * 0.4),
      attachment,
      medicine: 12 + Math.round(risk * 11),
      throwables,
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found community-room attachment" : "Found community-room first aid"
    });
  }
  if (kind === "kitchenette") {
    return withLootDefaults({
      scrap: 4 + rng.int(0, 5) + Math.floor(valueBoost * 0.35),
      ammo: risk > 0.42 && rng.next() < 0.22 ? 3 + Math.floor(valueBoost * 0.3) : 0,
      health: 14 + rng.int(0, 12) + Math.floor(valueBoost * 0.35),
      attachment,
      medicine: 8 + Math.round(risk * 8),
      throwables: Math.min(2, throwables + (quality === "valuable" && rng.next() < 0.24 ? 1 : 0)),
      junk: quality === "junk",
      quality,
      noiseMultiplier,
      searchSecondsMultiplier,
      status: attachment ? "Found kitchenette attachment" : "Found kitchenette food and first aid"
    });
  }
  return withLootDefaults({
    scrap: quality === "valuable" ? 4 + valueBoost : 0,
    ammo: quality === "valuable" ? 3 + Math.floor(valueBoost * 0.5) : 0,
    health: 0,
    attachment,
    throwables,
    junk: quality !== "valuable",
    quality: quality === "valuable" ? "valuable" : "junk",
    noiseMultiplier,
    searchSecondsMultiplier,
    status: quality === "valuable" ? "Found a hidden stash" : "Nothing useful found"
  });
}

function amenityLootBias(kind: AmenityPoint["kind"]): number {
  if (kind === "clubroom") return 0.1;
  if (kind === "changeroom") return 0.09;
  if (kind === "umpire_room") return 0.08;
  if (kind === "gatehouse") return 0.08;
  if (kind === "maintenance_room") return 0.11;
  if (kind === "community_room") return 0.06;
  if (kind === "kitchenette") return 0.06;
  if (kind === "bbq") return 0.08;
  if (kind === "bicycle_parking") return 0.05;
  if (kind === "toilets") return 0.03;
  if (kind === "waste_basket") return -0.02;
  return -0.08;
}

function withLootDefaults(result: Omit<LootResult, "medicine"> & { medicine?: number }): LootResult {
  return {
    medicine: 0,
    ...result
  };
}

export function chooseZombiePickup(type: ZombieType, rng: RandomSource): { type: Pickup["type"]; amount: number } | null {
  const profile = zombieProfile(type);
  if (rng.next() > profile.pickupChance) {
    return null;
  }
  const roll = rng.next();
  if (roll < 0.5) return { type: "ammo", amount: type === "bloater" ? 28 : 12 + rng.int(0, 9) };
  if (roll < 0.76) return { type: "health", amount: type === "bloater" ? 24 : 12 + rng.int(0, 8) };
  return { type: "scrap", amount: profile.reward + rng.int(4, 12) };
}

export function chooseZombieWeaponDrop(type: ZombieType, wave: number, rng: RandomSource): WeaponId | null {
  const profile = zombieProfile(type);
  const chance = Math.min(0.42, profile.weaponDropChance + wave * 0.008);
  if (rng.next() > chance) {
    return null;
  }
  const roll = rng.next();
  if (roll < 0.14) return "machete";
  if (wave >= 4 && roll > 0.82) return "rifle";
  if (roll > 0.64) return "shotgun";
  if (roll > 0.3) return "smg";
  return "carbine";
}
