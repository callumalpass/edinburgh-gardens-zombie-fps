import { describe, expect, it } from "vitest";
import { WaveDirector } from "../src/game/systems/WaveDirector";
import type { RandomSource, Vec2 } from "../src/game/types";
import { getWaveConfig } from "../src/game/waves";

class PredictableRandom implements RandomSource {
  next(): number {
    return 0;
  }

  range(min: number, _max: number): number {
    return min;
  }

  int(min: number, _max: number): number {
    return min;
  }

  pick<T>(items: readonly T[]): T {
    return items[0];
  }
}

const spawnPoints: Vec2[] = [
  { x: 10, z: 20 },
  { x: 30, z: 40 }
];

describe("WaveDirector", () => {
  it("spawns from a stable pack anchor after the initial delay", () => {
    const director = new WaveDirector(spawnPoints, new PredictableRandom());
    const anchors: Array<Vec2 | undefined> = [];
    const openingTotal = getWaveConfig(1).total;

    expect(director.remainingSpawns).toBe(openingTotal);

    const first = director.update(1.2, {
      activeZombies: 0,
      canSpawn: true,
      spawn: (anchor) => anchors.push(anchor)
    });

    expect(first.spawned).toBe(1);
    expect(anchors).toEqual([spawnPoints[0]]);
    expect(director.wave).toBe(1);
    expect(director.phase).toBe("active");
    expect(director.remainingSpawns).toBe(openingTotal - 1);
  });

  it("starts intermission after a cleared wave and advances to the next wave", () => {
    const director = new WaveDirector(spawnPoints, new PredictableRandom(), { intermissionSeconds: 3 });
    director.completeActiveWaveForTest();

    const cleared = director.update(0, {
      activeZombies: 0,
      canSpawn: true,
      spawn: () => {
        throw new Error("cleared wave should not spawn");
      }
    });

    expect(cleared.startedIntermission).toBe(true);
    expect(director.phase).toBe("intermission");
    expect(director.intermissionTimer).toBe(3);
    expect(director.remainingSpawns).toBe(0);

    const nextWave = director.update(3, {
      activeZombies: 0,
      canSpawn: true,
      spawn: () => {
        throw new Error("intermission update should not spawn");
      }
    });

    expect(nextWave.startedWave).toBe(true);
    expect(director.phase).toBe("active");
    expect(director.wave).toBe(2);
  });

  it("can reset back to the first active wave", () => {
    const director = new WaveDirector(spawnPoints, new PredictableRandom(), { intermissionSeconds: 1 });
    director.completeActiveWaveForTest();
    director.update(0, { activeZombies: 0, canSpawn: true, spawn: () => undefined });
    director.update(1, { activeZombies: 0, canSpawn: true, spawn: () => undefined });

    director.reset();

    expect(director.wave).toBe(1);
    expect(director.phase).toBe("active");
    expect(director.intermissionTimer).toBe(0);
  });

  it("can rush a bounded pack from the nearest spawn approach", () => {
    const director = new WaveDirector(spawnPoints, new PredictableRandom(), { intermissionSeconds: 1 });
    for (let wave = 1; wave < 4; wave += 1) {
      director.completeActiveWaveForTest();
      director.update(0, { activeZombies: 0, canSpawn: true, spawn: () => undefined });
      director.update(1, { activeZombies: 0, canSpawn: true, spawn: () => undefined });
    }
    const remainingBefore = director.remainingSpawns;
    const anchors: Array<Vec2 | undefined> = [];

    const spawned = director.rushSpawnPack({ x: 28, z: 38 }, 3, (anchor) => anchors.push(anchor));

    expect(director.wave).toBe(4);
    expect(spawned).toBe(2);
    expect(anchors).toEqual([spawnPoints[1], spawnPoints[1]]);
    expect(director.remainingSpawns).toBe(remainingBefore - spawned);
  });

  it("blocks rushed packs during intermission or when the active horde is already saturated", () => {
    const director = new WaveDirector(spawnPoints, new PredictableRandom(), { intermissionSeconds: 1 });
    const spawnedAtCap = director.rushSpawnPack({ x: 10, z: 20 }, 99, () => {
      throw new Error("active cap should prevent rushed spawning");
    });
    expect(spawnedAtCap).toBe(0);

    director.completeActiveWaveForTest();
    director.update(0, { activeZombies: 0, canSpawn: true, spawn: () => undefined });

    const spawnedDuringIntermission = director.rushSpawnPack({ x: 10, z: 20 }, 0, () => {
      throw new Error("intermission should prevent rushed spawning");
    });
    expect(director.phase).toBe("intermission");
    expect(spawnedDuringIntermission).toBe(0);
  });
});
