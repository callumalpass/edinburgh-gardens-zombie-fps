import { bench, describe } from "vitest";
import { createLevelData } from "../src/game/levelData";
import { distance } from "../src/game/geo";
import { MovementSurfaceSampler, movementSurfaceAt } from "../src/game/movement";
import { createTerrainOverlayRectGeometry } from "../src/game/rendering/terrainOverlay";
import { ObstacleIndex } from "../src/game/spatial/ObstacleIndex";
import { TerrainSampler } from "../src/game/terrain";
import { isLineOfSightBlocked, isPointVisibleToPlayer } from "../src/game/visibility";
import { separateCircularAgents, type CircularAgent } from "../src/game/spatial/AgentSeparation";
import type { Vec2 } from "../src/game/types";

const level = createLevelData();
const terrain = new TerrainSampler(level);
const obstacleIndex = new ObstacleIndex(level.obstacles);
const movementSurfaces = new MovementSurfaceSampler(level);
const samplePoints = [
  ...level.boundary,
  ...level.paths.flatMap((path) => path.points),
  ...level.amenities.map((amenity) => amenity.position),
  ...level.spawnPoints,
  ...level.weaponSpawns.map((spawn) => spawn.position)
];
const playerPosition = { x: 0, z: 0 };
const visibilityContext = {
  playerPosition,
  playerYaw: -2.35,
  playerHeight: 0,
  cameraFov: 74,
  cameraAspect: 16 / 9,
  obstacles: level.obstacles
};
const sightTargets = deterministicSample(
  [
    ...level.spawnPoints,
    ...level.pickupPoints,
    ...level.amenities.map((amenity) => amenity.position),
    ...level.paths.flatMap((path) => path.points)
  ],
  96
);
const obstacleQueryPoints = deterministicSample(
  [
    ...samplePoints,
    ...level.pickupPoints,
    ...level.trees.map((tree) => tree.position)
  ],
  160
);
const movementSurfacePoints = deterministicSample(
  [
    ...level.paths.flatMap((path) => path.points),
    ...level.spawnPoints,
    ...level.pickupPoints,
    ...level.amenities.map((amenity) => amenity.position),
    ...level.trees.map((tree) => tree.position)
  ],
  192
);
const overlaySegments = deterministicSample(
  level.paths.flatMap((path) =>
    path.points.slice(0, -1).map((point, index) => ({
      a: point,
      b: path.points[index + 1],
      width: path.width
    }))
  ),
  48
).filter((segment) => distance(segment.a, segment.b) >= 0.05);
const crowdBaseline = deterministicCrowd(128);
let terrainSink = 0;
let sightSink = 0;
let visibilitySink = 0;
let obstacleSink = 0;
let surfaceSink = 0;
let crowdSink = 0;
let overlaySink = 0;

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

  bench("point visibility checks for HUD and AI", () => {
    let visible = 0;
    for (const target of sightTargets) {
      if (isPointVisibleToPlayer(target, visibilityContext, 1)) {
        visible += 1;
      }
    }
    visibilitySink = visible;
  });

  bench("nearby obstacle index queries for movement", () => {
    let nearby = 0;
    for (const point of obstacleQueryPoints) {
      obstacleIndex.forNearby(point, 2.2, () => {
        nearby += 1;
      });
    }
    obstacleSink = nearby;
  });

  bench("indexed movement-surface lookups for player and bike", () => {
    let asphaltLike = 0;
    for (const point of movementSurfacePoints) {
      const surface = movementSurfaces.at(point);
      if (surface === "asphalt" || surface === "concrete" || surface === "rail") {
        asphaltLike += 1;
      }
    }
    surfaceSink = asphaltLike;
  });

  bench("linear movement-surface scan baseline", () => {
    let asphaltLike = 0;
    for (const point of movementSurfacePoints) {
      const surface = movementSurfaceAt(level, point);
      if (surface === "asphalt" || surface === "concrete" || surface === "rail") {
        asphaltLike += 1;
      }
    }
    surfaceSink += asphaltLike;
  });

  bench("terrain overlay geometry over path segments", () => {
    let vertices = 0;
    for (const segment of overlaySegments) {
      const segmentLength = distance(segment.a, segment.b);
      const geometry = createTerrainOverlayRectGeometry({
        center: { x: (segment.a.x + segment.b.x) * 0.5, z: (segment.a.z + segment.b.z) * 0.5 },
        angle: Math.atan2(segment.b.z - segment.a.z, segment.b.x - segment.a.x),
        length: segmentLength,
        width: segment.width,
        yOffset: 0.073,
        groundYAt: (point) => terrain.groundY(point)
      });
      vertices += geometry.getAttribute("position").count;
      geometry.dispose();
    }
    overlaySink = vertices;
  });

  bench("zombie separation over a dense crowd", () => {
    const agents = crowdBaseline.map((agent) => ({
      id: agent.id,
      radius: agent.radius,
      position: { ...agent.position }
    }));

    crowdSink += separateCircularAgents(agents, {
      gap: 0.16,
      gridSize: 8,
      iterations: 3
    });
  });
});

function deterministicSample<T>(points: readonly T[], limit: number): T[] {
  if (points.length <= limit) return [...points];
  const sampled: T[] = [];
  const step = points.length / limit;
  for (let index = 0; index < limit; index += 1) {
    sampled.push(points[Math.floor(index * step)]);
  }
  return sampled;
}

function deterministicCrowd(count: number): CircularAgent[] {
  const agents: CircularAgent[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / 16);
    const column = index % 16;
    agents.push({
      id: index + 1,
      radius: index % 11 === 0 ? 2.2 : index % 5 === 0 ? 1.18 : 1.35,
      position: {
        x: column * 1.7 + ((index * 17) % 5) * 0.11,
        z: row * 1.55 + ((index * 23) % 7) * 0.09
      }
    });
  }
  return agents;
}
