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
    health: 70,
    speed: 7.2,
    radius: 1.35,
    reward: 12,
    sightRange: 54,
    hearingMultiplier: 1,
    attackDamage: 10,
    attackCooldown: 0.95,
    staggerResistance: 1,
    pickupChance: 0.42,
    weaponDropChance: 0.06
  },
  sprinter: {
    type: "sprinter",
    health: 48,
    speed: 12.4,
    radius: 1.18,
    reward: 15,
    sightRange: 64,
    hearingMultiplier: 1.25,
    attackDamage: 9,
    attackCooldown: 0.65,
    staggerResistance: 0.82,
    pickupChance: 0.34,
    weaponDropChance: 0.1
  },
  bloater: {
    type: "bloater",
    health: 150,
    speed: 4.6,
    radius: 2.2,
    reward: 24,
    sightRange: 48,
    hearingMultiplier: 0.78,
    attackDamage: 18,
    attackCooldown: 1.05,
    staggerResistance: 1.85,
    pickupChance: 0.62,
    weaponDropChance: 0.32
  },
  crawler: {
    type: "crawler",
    health: 42,
    speed: 5.2,
    radius: 0.95,
    reward: 14,
    sightRange: 42,
    hearingMultiplier: 1.4,
    attackDamage: 8,
    attackCooldown: 0.78,
    staggerResistance: 0.72,
    pickupChance: 0.28,
    weaponDropChance: 0.07
  },
  screamer: {
    type: "screamer",
    health: 82,
    speed: 6.4,
    radius: 1.28,
    reward: 20,
    sightRange: 70,
    hearingMultiplier: 1.55,
    attackDamage: 7,
    attackCooldown: 0.9,
    staggerResistance: 0.9,
    pickupChance: 0.5,
    weaponDropChance: 0.2
  }
};

export function zombieProfile(type: ZombieType): ZombieProfile {
  return ZOMBIE_PROFILES[type];
}
