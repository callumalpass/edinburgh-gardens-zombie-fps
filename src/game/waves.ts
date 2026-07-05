import type { RandomSource, Vec2 } from "./types";
import { ZOMBIE_PROFILES, type ZombieType } from "./zombieProfiles";

export type { ZombieType } from "./zombieProfiles";
export type WavePhase = "active" | "intermission";

export interface WaveConfig {
  wave: number;
  total: number;
  spawnInterval: number;
  packMin: number;
  packMax: number;
  packInterval: number;
  stragglerCount: number;
  stragglerInterval: number;
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
    total: 5 + clampedWave * 3 + Math.floor(Math.pow(clampedWave, 1.14)),
    spawnInterval: Math.max(0.52, 1.5 - clampedWave * 0.07),
    packMin: clampedWave < 3 ? 1 : clampedWave < 6 ? 2 : 3,
    packMax: Math.min(6, 2 + Math.floor((clampedWave + 1) / 2)),
    packInterval: Math.max(3.6, 7.1 - clampedWave * 0.32),
    stragglerCount: Math.min(6, 1 + Math.floor((clampedWave + 1) / 2)),
    stragglerInterval: Math.max(3.1, 6.2 - clampedWave * 0.2),
    healthMultiplier: 1 + (clampedWave - 1) * 0.13,
    speedMultiplier: 1 + Math.min(0.48, (clampedWave - 1) * 0.03),
    typeWeights: {
      shambler: Math.max(0.42, 1 - clampedWave * 0.05),
      sprinter: Math.min(0.34, Math.max(0, (clampedWave - 1) * 0.04)),
      bloater: Math.min(0.28, Math.max(0, (clampedWave - 2) * 0.032)),
      crawler: Math.min(0.22, Math.max(0, (clampedWave - 1) * 0.032)),
      screamer: Math.min(0.16, Math.max(0, (clampedWave - 3) * 0.024))
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

export function createZombieSpawn(config: WaveConfig, spawnPoints: readonly Vec2[], rng: RandomSource, anchor?: Vec2): ZombieSpawn {
  const type = chooseZombieType(config, rng);
  const base = ZOMBIE_PROFILES[type];
  const spawnAnchor = anchor ?? rng.pick(spawnPoints);
  const spread = anchor ? 10 : 6;
  return {
    type,
    position: {
      x: spawnAnchor.x + rng.range(-spread, spread),
      z: spawnAnchor.z + rng.range(-spread, spread)
    },
    health: Math.round(base.health * config.healthMultiplier),
    speed: base.speed * config.speedMultiplier * rng.range(0.92, 1.08),
    reward: Math.round(base.reward * (1 + config.wave * 0.08))
  };
}
