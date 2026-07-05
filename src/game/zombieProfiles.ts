export type ZombieType = "shambler" | "sprinter" | "bloater" | "crawler" | "screamer";

export interface ZombieProfile {
  type: ZombieType;
  health: number;
  speed: number;
  radius: number;
  reward: number;
  sightRange: number;
  hearingMultiplier: number;
  attackDamage: number;
  attackCooldown: number;
  staggerResistance: number;
  pickupChance: number;
  weaponDropChance: number;
}

export const ZOMBIE_PROFILES: Record<ZombieType, ZombieProfile> = {
  shambler: {
    type: "shambler",
    health: 68,
    speed: 6.6,
    radius: 1.35,
    reward: 12,
    sightRange: 52,
    hearingMultiplier: 1,
    attackDamage: 10,
    attackCooldown: 1.08,
    staggerResistance: 0.92,
    pickupChance: 0.46,
    weaponDropChance: 0.06
  },
  sprinter: {
    type: "sprinter",
    health: 46,
    speed: 11.2,
    radius: 1.18,
    reward: 15,
    sightRange: 60,
    hearingMultiplier: 1.18,
    attackDamage: 9,
    attackCooldown: 0.78,
    staggerResistance: 0.76,
    pickupChance: 0.38,
    weaponDropChance: 0.1
  },
  bloater: {
    type: "bloater",
    health: 146,
    speed: 4.25,
    radius: 2.2,
    reward: 24,
    sightRange: 48,
    hearingMultiplier: 0.78,
    attackDamage: 17,
    attackCooldown: 1.22,
    staggerResistance: 1.72,
    pickupChance: 0.66,
    weaponDropChance: 0.32
  },
  crawler: {
    type: "crawler",
    health: 40,
    speed: 4.9,
    radius: 0.95,
    reward: 14,
    sightRange: 42,
    hearingMultiplier: 1.32,
    attackDamage: 8,
    attackCooldown: 0.9,
    staggerResistance: 0.68,
    pickupChance: 0.34,
    weaponDropChance: 0.07
  },
  screamer: {
    type: "screamer",
    health: 78,
    speed: 6.05,
    radius: 1.28,
    reward: 20,
    sightRange: 66,
    hearingMultiplier: 1.48,
    attackDamage: 7,
    attackCooldown: 1.02,
    staggerResistance: 0.84,
    pickupChance: 0.54,
    weaponDropChance: 0.2
  }
};

export function zombieProfile(type: ZombieType): ZombieProfile {
  return ZOMBIE_PROFILES[type];
}
