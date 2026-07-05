import type { RandomSource } from "./types";
import type { AmenityPoint } from "./types";
import type { Pickup } from "./state";
import type { WeaponId } from "./weapons";
import type { ZombieType } from "./zombieProfiles";
import { zombieProfile } from "./zombieProfiles";

export interface LootResult {
  scrap: number;
  ammo: number;
  health: number;
  status: string;
}

export function searchAmenityLoot(kind: AmenityPoint["kind"], rng: RandomSource): LootResult {
  if (kind === "waste_basket") {
    return { scrap: 5 + rng.int(0, 6), ammo: rng.next() < 0.18 ? 4 : 0, health: 0, status: "Found scraps in bin" };
  }
  if (kind === "bicycle_parking") {
    return { scrap: 11 + rng.int(0, 8), ammo: 4 + rng.int(0, 6), health: 0, status: "Stripped bike rack supplies" };
  }
  if (kind === "bbq") {
    return { scrap: 8 + rng.int(0, 7), ammo: 7 + rng.int(0, 8), health: 4 + rng.int(0, 8), status: "Searched BBQ supplies" };
  }
  if (kind === "toilets") {
    return { scrap: rng.int(0, 5), ammo: 0, health: 10 + rng.int(0, 10), status: "Sheltered at toilets" };
  }
  return { scrap: 0, ammo: 0, health: 0, status: "Nothing useful found" };
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
  if (wave >= 4 && roll > 0.82) return "rifle";
  if (roll > 0.64) return "shotgun";
  if (roll > 0.3) return "smg";
  return "carbine";
}
