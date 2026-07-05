import { describe, expect, it } from "vitest";
import { SeededRandom } from "../src/game/random";
import { createLevelData } from "../src/game/levelData";
import { createZombieSpawn, getWaveConfig } from "../src/game/waves";

describe("wave spawning", () => {
  it("ramps total enemies and difficulty over time", () => {
    const first = getWaveConfig(1);
    const fifth = getWaveConfig(5);
    expect(fifth.total).toBeGreaterThan(first.total);
    expect(fifth.healthMultiplier).toBeGreaterThan(first.healthMultiplier);
    expect(fifth.spawnInterval).toBeLessThan(first.spawnInterval);
  });

  it("creates deterministic zombie spawn positions from the map spawn list", () => {
    const level = createLevelData();
    const rngA = new SeededRandom(123);
    const rngB = new SeededRandom(123);
    const spawnA = createZombieSpawn(getWaveConfig(3), level.spawnPoints, rngA);
    const spawnB = createZombieSpawn(getWaveConfig(3), level.spawnPoints, rngB);
    expect(spawnA).toEqual(spawnB);
    expect(spawnA.health).toBeGreaterThan(40);
    expect(spawnA.speed).toBeGreaterThan(3);
  });
});
