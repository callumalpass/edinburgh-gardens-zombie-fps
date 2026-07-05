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

export function lootRiskScore(context: LootSearchContext = {}): number {
  const nearbyPressure = Math.min(0.46, (context.nearbyZombies ?? 0) * 0.115);
  const exposedPressure = context.exposed ? 0.28 : 0;
  const wavePressure = Math.min(0.22, Math.max(0, (context.wave ?? 1) - 1) * 0.018);
  return Math.min(1, nearbyPressure + exposedPressure + wavePressure);
}

export function lootNoiseMultiplier(kind: AmenityPoint["kind"], context: LootSearchContext = {}): number {
  const risk = lootRiskScore(context);
  return (kind === "bbq" ? 1.05 : kind === "waste_basket" ? 0.8 : 0.92) * (1 + risk * 0.7);
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
  if (roll < 0.48) return { type: "ammo", amount: type === "bloater" ? 24 : 10 + rng.int(0, 8) };
  if (roll < 0.72) return { type: "health", amount: type === "bloater" ? 22 : 10 + rng.int(0, 8) };
  return { type: "scrap", amount: profile.reward + rng.int(2, 10) };
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
