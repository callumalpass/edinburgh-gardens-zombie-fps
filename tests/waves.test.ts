import { describe, expect, it } from "vitest";
import { SeededRandom } from "../src/game/random";
import { createLevelData } from "../src/game/levelData";
import { createZombieSpawn, getWaveConfig } from "../src/game/waves";

describe("wave spawning", () => {
  it("keeps the opening wave readable before introducing fast roles", () => {
    const first = getWaveConfig(1);

    expect(first.total).toBeLessThanOrEqual(9);
    expect(first.packMin).toBe(1);
    expect(first.packMax).toBeGreaterThanOrEqual(2);
    expect(first.packInterval).toBeGreaterThan(6);
    expect(first.typeWeights.sprinter).toBe(0);
    expect(first.typeWeights.bloater).toBe(0);
    expect(first.typeWeights.screamer).toBe(0);
  });

  it("ramps total enemies and difficulty over time", () => {
    const first = getWaveConfig(1);
    const fifth = getWaveConfig(5);
    expect(fifth.total).toBeGreaterThan(first.total);
    expect(fifth.healthMultiplier).toBeGreaterThan(first.healthMultiplier);
    expect(fifth.spawnInterval).toBeLessThan(first.spawnInterval);
    expect(fifth.packMax).toBeGreaterThanOrEqual(fifth.packMin);
    expect(fifth.packInterval).toBeGreaterThan(fifth.spawnInterval);
    expect(fifth.stragglerCount).toBeGreaterThan(first.stragglerCount);
    expect(fifth.typeWeights.crawler).toBeGreaterThan(0);
    expect(fifth.typeWeights.screamer).toBeGreaterThan(0);
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

  it("can group a pack around the same spawn anchor", () => {
    const level = createLevelData();
    const rng = new SeededRandom(321);
    const anchor = level.spawnPoints[0];
    const spawn = createZombieSpawn(getWaveConfig(4), level.spawnPoints, rng, anchor);
    expect(Math.hypot(spawn.position.x - anchor.x, spawn.position.z - anchor.z)).toBeLessThan(12);
  });
});
