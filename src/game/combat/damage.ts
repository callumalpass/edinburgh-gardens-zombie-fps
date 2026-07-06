import type { HitZone, Zombie } from "../state";
import type { RandomSource, Vec2 } from "../types";
import { damageAtDistance, type WeaponStats } from "../weapons";
import { zombieProfile } from "../zombieProfiles";

export interface DirectedZombieHit {
  distance: number;
  zone: HitZone;
}

export interface DirectedZombieHitOptions {
  memorySeconds: {
    min: number;
    max: number;
  };
  staggerBonusByZone?: Partial<Record<HitZone, number>>;
}

export interface DirectedZombieHitResult {
  damage: number;
  staggerSeconds: number;
  killed: boolean;
}

export function applyDirectedZombieHit(
  zombie: Zombie,
  hit: DirectedZombieHit,
  stats: WeaponStats,
  shooterPosition: Vec2,
  rng: RandomSource,
  options: DirectedZombieHitOptions
): DirectedZombieHitResult {
  const damage = damageAtDistance(stats, hit.distance, hit.zone);
  const staggerBonus = options.staggerBonusByZone?.[hit.zone] ?? 0;
  const profile = zombieProfile(zombie.type);
  const staggerSeconds = (stats.staggerPower + staggerBonus) / profile.staggerResistance;

  zombie.health -= damage;
  zombie.staggerTimer = Math.max(zombie.staggerTimer, staggerSeconds);
  zombie.aiState = "chase";
  zombie.target = { ...shooterPosition };
  zombie.lastKnownPlayer = zombie.target;
  zombie.memoryTimer = rng.range(options.memorySeconds.min, options.memorySeconds.max);

  return {
    damage,
    staggerSeconds,
    killed: zombie.health <= 0
  };
}
