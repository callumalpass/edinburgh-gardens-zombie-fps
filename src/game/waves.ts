import type { RandomSource, Vec2 } from "./types";
import { ZOMBIE_PROFILES, type ZombieType } from "./zombieProfiles";

export type { ZombieType } from "./zombieProfiles";

export interface WaveConfig {
  wave: number;
  total: number;
  spawnInterval: number;
  healthMultiplier: number;
  speedMultiplier: number;
  typeWeights: Record<ZombieType, number>;
}

export interface ZombieSpawn {
  type: ZombieType;
  position: Vec2;
  health: number;
  speed: number;
  reward: number;
}

export function getWaveConfig(wave: number): WaveConfig {
  const clampedWave = Math.max(1, Math.floor(wave));
  return {
    wave: clampedWave,
    total: 7 + clampedWave * 4 + Math.floor(Math.pow(clampedWave, 1.18)),
    spawnInterval: Math.max(0.45, 1.35 - clampedWave * 0.07),
    healthMultiplier: 1 + (clampedWave - 1) * 0.15,
    speedMultiplier: 1 + Math.min(0.55, (clampedWave - 1) * 0.035),
    typeWeights: {
      shambler: Math.max(0.35, 1 - clampedWave * 0.055),
      sprinter: Math.min(0.45, clampedWave * 0.045),
      bloater: Math.min(0.32, Math.max(0, (clampedWave - 2) * 0.035)),
      crawler: Math.min(0.24, Math.max(0, (clampedWave - 1) * 0.035)),
      screamer: Math.min(0.18, Math.max(0, (clampedWave - 3) * 0.028))
    }
  };
}

export function chooseZombieType(config: WaveConfig, rng: RandomSource): ZombieType {
  const entries = Object.entries(config.typeWeights) as Array<[ZombieType, number]>;
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng.next() * totalWeight;
  for (const [type, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) {
      return type;
    }
  }
  return "shambler";
}

export function createZombieSpawn(config: WaveConfig, spawnPoints: readonly Vec2[], rng: RandomSource): ZombieSpawn {
  const type = chooseZombieType(config, rng);
  const base = ZOMBIE_PROFILES[type];
  const anchor = rng.pick(spawnPoints);
  return {
    type,
    position: {
      x: anchor.x + rng.range(-5, 5),
      z: anchor.z + rng.range(-5, 5)
    },
    health: Math.round(base.health * config.healthMultiplier),
    speed: base.speed * config.speedMultiplier * rng.range(0.92, 1.08),
    reward: Math.round(base.reward * (1 + config.wave * 0.08))
  };
}
