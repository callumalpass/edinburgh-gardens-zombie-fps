import type { RandomSource, Vec2 } from "../types";
import { getWaveConfig, type WavePhase } from "../waves";

export interface WaveDirectorOptions {
  intermissionSeconds?: number;
  initialSpawnDelay?: number;
}

export interface WaveDirectorUpdateContext {
  activeZombies: number;
  canSpawn: boolean;
  spawn: (anchor?: Vec2) => void;
}

export interface WaveDirectorUpdate {
  spawned: number;
  startedIntermission: boolean;
  startedWave: boolean;
}

const DEFAULT_INTERMISSION_SECONDS = 24;
const DEFAULT_INITIAL_SPAWN_DELAY = 1.1;

export class WaveDirector {
  private readonly intermissionSeconds: number;
  private readonly initialSpawnDelay: number;
  private waveValue = 1;
  private phaseValue: WavePhase = "active";
  private intermissionTimerValue = 0;
  private spawnTimer = 0;
  private spawnPackRemaining = 0;
  private spawnPackAnchor: Vec2 | null = null;
  private spawnedThisWave = 0;

  constructor(
    private readonly spawnPoints: readonly Vec2[],
    private readonly rng: RandomSource,
    options: WaveDirectorOptions = {}
  ) {
    this.intermissionSeconds = options.intermissionSeconds ?? DEFAULT_INTERMISSION_SECONDS;
    this.initialSpawnDelay = options.initialSpawnDelay ?? DEFAULT_INITIAL_SPAWN_DELAY;
    this.reset();
  }

  get wave(): number {
    return this.waveValue;
  }

  get phase(): WavePhase {
    return this.phaseValue;
  }

  get intermissionTimer(): number {
    return this.intermissionTimerValue;
  }

  reset(): void {
    this.waveValue = 1;
    this.phaseValue = "active";
    this.intermissionTimerValue = 0;
    this.resetActiveWave();
  }

  update(dt: number, context: WaveDirectorUpdateContext): WaveDirectorUpdate {
    const update: WaveDirectorUpdate = {
      spawned: 0,
      startedIntermission: false,
      startedWave: false
    };

    if (this.phaseValue === "intermission") {
      this.intermissionTimerValue = Math.max(0, this.intermissionTimerValue - dt);
      if (this.intermissionTimerValue <= 0) {
        this.waveValue += 1;
        this.phaseValue = "active";
        this.resetActiveWave();
        update.startedWave = true;
      }
      return update;
    }

    let projectedActiveZombies = context.activeZombies;
    if (context.canSpawn) {
      update.spawned = this.updateSpawning(dt, context.activeZombies, context.spawn);
      projectedActiveZombies += update.spawned;
    }

    const config = getWaveConfig(this.waveValue);
    if (this.spawnedThisWave >= config.total && projectedActiveZombies === 0) {
      update.startedIntermission = this.startIntermission();
    }

    return update;
  }

  startIntermission(): boolean {
    if (this.phaseValue === "intermission") return false;
    this.phaseValue = "intermission";
    this.intermissionTimerValue = this.intermissionSeconds;
    this.spawnPackRemaining = 0;
    this.spawnPackAnchor = null;
    return true;
  }

  completeActiveWaveForTest(): void {
    this.phaseValue = "active";
    this.spawnedThisWave = getWaveConfig(this.waveValue).total;
    this.spawnTimer = 0;
    this.spawnPackRemaining = 0;
    this.spawnPackAnchor = null;
  }

  private resetActiveWave(): void {
    this.spawnTimer = this.initialSpawnDelay;
    this.spawnPackRemaining = 0;
    this.spawnPackAnchor = null;
    this.spawnedThisWave = 0;
  }

  private updateSpawning(dt: number, activeZombies: number, spawn: (anchor?: Vec2) => void): number {
    const config = getWaveConfig(this.waveValue);
    if (this.spawnedThisWave >= config.total || this.spawnPoints.length === 0) return 0;

    this.spawnTimer -= dt;
    if (this.spawnPackRemaining <= 0 && activeZombies <= 1) {
      this.spawnTimer = Math.min(this.spawnTimer, 1.45);
    }
    if (this.spawnTimer > 0) return 0;

    const remaining = config.total - this.spawnedThisWave;
    const stragglerTail = remaining <= config.stragglerCount;
    if (this.spawnPackRemaining <= 0) {
      this.spawnPackRemaining = stragglerTail ? 1 : Math.min(remaining, this.rng.int(config.packMin, config.packMax));
      this.spawnPackAnchor = this.rng.pick(this.spawnPoints);
    }

    spawn(this.spawnPackAnchor ?? undefined);
    this.spawnedThisWave += 1;
    this.spawnPackRemaining -= 1;

    const remainingAfterSpawn = config.total - this.spawnedThisWave;
    if (remainingAfterSpawn <= 0) {
      this.spawnTimer = 0;
      this.spawnPackRemaining = 0;
      this.spawnPackAnchor = null;
      return 1;
    }

    if (this.spawnPackRemaining > 0) {
      this.spawnTimer = config.spawnInterval;
    } else {
      this.spawnPackAnchor = null;
      this.spawnTimer = remainingAfterSpawn <= config.stragglerCount ? config.stragglerInterval : config.packInterval;
    }
    return 1;
  }
}
