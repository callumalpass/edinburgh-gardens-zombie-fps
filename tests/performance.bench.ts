import { bench, describe } from "vitest";
import { createLevelData } from "../src/game/levelData";
import { TerrainSampler } from "../src/game/terrain";
import { isLineOfSightBlocked } from "../src/game/visibility";
import type { Vec2 } from "../src/game/types";

const level = createLevelData();
const terrain = new TerrainSampler(level);
const samplePoints = [
  ...level.boundary,
  ...level.paths.flatMap((path) => path.points),
  ...level.amenities.map((amenity) => amenity.position),
  ...level.spawnPoints,
  ...level.weaponSpawns.map((spawn) => spawn.position)
];
const playerPosition = { x: 0, z: 0 };
const sightTargets = deterministicSample(
  [
    ...level.spawnPoints,
    ...level.pickupPoints,
    ...level.amenities.map((amenity) => amenity.position),
    ...level.paths.flatMap((path) => path.points)
  ],
  96
);
let terrainSink = 0;
let sightSink = 0;

describe("level performance", () => {
  bench("terrain groundY over representative level points", () => {
    let total = 0;
    for (const point of samplePoints) {
      total += terrain.groundY(point);
    }
    terrainSink = total;
  });

  bench("line-of-sight queries across park obstacles", () => {
    let blocked = 0;
    for (const target of sightTargets) {
      if (
        isLineOfSightBlocked(playerPosition, target, {
          playerPosition,
          playerYaw: 0,
          playerHeight: 0,
          cameraFov: 74,
          cameraAspect: 16 / 9,
          obstacles: level.obstacles
        })
      ) {
        blocked += 1;
      }
    }
    sightSink = blocked;
  });
});

function deterministicSample(points: readonly Vec2[], limit: number): Vec2[] {
  if (points.length <= limit) return [...points];
  const sampled: Vec2[] = [];
  const step = points.length / limit;
  for (let index = 0; index < limit; index += 1) {
    sampled.push(points[Math.floor(index * step)]);
  }
  return sampled;
}
