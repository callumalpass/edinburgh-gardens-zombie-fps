import { describe, expect, it } from "vitest";
import { clampToPolygon, distance, distanceToSegment, geoToWorld, nearestPointOnSegment, pointInPolygon, polygonArea, polygonCentroid, WORLD_SCALE } from "../src/game/geo";
import { pointInRaisedFootprint } from "../src/game/interactables";
import { createLevelData, PARK_BOUNDARY_GEO } from "../src/game/levelData";
import {
  AUSTRALIAN_RULES_CENTRE_SQUARE_METRES,
  AUSTRALIAN_RULES_FIFTY_ARC_METRES,
  AUSTRALIAN_RULES_FULL_GOAL_WIDTH_METRES,
  AUSTRALIAN_RULES_GOAL_SQUARE_DEPTH_METRES,
  AUSTRALIAN_RULES_GOAL_POST_SPACING_METRES,
  AUSTRALIAN_RULES_INNER_CIRCLE_DIAMETER_METRES,
  AUSTRALIAN_RULES_OUTER_CIRCLE_DIAMETER_METRES,
  BASKETBALL_BACKBOARD_WIDTH_METRES,
  BASKETBALL_RIM_HEIGHT_METRES,
  CRICKET_BOWLING_CREASE_LENGTH_METRES,
  CRICKET_PITCH_LENGTH_METRES,
  CRICKET_PITCH_WIDTH_METRES,
  CRICKET_POPPING_CREASE_OFFSET_METRES,
  CRICKET_STUMP_HEIGHT_METRES,
  CRICKET_WICKET_WIDTH_METRES,
  footballPostLocalOffsets
} from "../src/game/sportsFixtures";
import { TerrainSampler } from "../src/game/terrain";
import type { MappedBuilding } from "../src/game/types";

function distanceToPolygonEdge(point: { x: number; z: number }, polygon: readonly { x: number; z: number }[]): number {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    closest = Math.min(closest, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]));
  }
  return closest;
}

function distanceToObstacleBoundary(point: { x: number; z: number }, obstacle: ReturnType<typeof createLevelData>["obstacles"][number]): number {
  if (obstacle.shape === "polygon") {
    return distanceToPolygonEdge(point, obstacle.polygon);
  }
  if (obstacle.shape === "box") {
    const dx = point.x - obstacle.center.x;
    const dz = point.z - obstacle.center.z;
    const cos = Math.cos(obstacle.angle);
    const sin = Math.sin(obstacle.angle);
    const localX = dx * cos + dz * sin;
    const localZ = -dx * sin + dz * cos;
    const outsideX = Math.max(Math.abs(localX) - obstacle.halfX, 0);
    const outsideZ = Math.max(Math.abs(localZ) - obstacle.halfZ, 0);
    if (outsideX > 0 || outsideZ > 0) {
      return Math.hypot(outsideX, outsideZ);
    }
    return Math.min(obstacle.halfX - Math.abs(localX), obstacle.halfZ - Math.abs(localZ));
  }
  return Math.abs(distance(point, obstacle.center) - obstacle.radius);
}

function signedSideOfNearestPolylineSegment(point: { x: number; z: number }, polyline: readonly { x: number; z: number }[]): number {
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestSignedSide = 0;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared === 0) continue;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
    const nearest = { x: start.x + dx * t, z: start.z + dz * t };
    const nearestDistance = distance(point, nearest);
    if (nearestDistance < closestDistance) {
      closestDistance = nearestDistance;
      closestSignedSide = (dx * (point.z - start.z) - dz * (point.x - start.x)) / Math.sqrt(lengthSquared);
    }
  }
  return closestSignedSide;
}

function pointInsideObstacle(point: { x: number; z: number }, obstacle: ReturnType<typeof createLevelData>["obstacles"][number], padding = 0): boolean {
  if (obstacle.shape === "polygon") {
    return pointInPolygon(point, obstacle.polygon) || distanceToPolygonEdge(point, obstacle.polygon) < padding;
  }
  if (obstacle.shape === "box") {
    const dx = point.x - obstacle.center.x;
    const dz = point.z - obstacle.center.z;
    const cos = Math.cos(obstacle.angle);
    const sin = Math.sin(obstacle.angle);
    const localX = dx * cos + dz * sin;
    const localZ = -dx * sin + dz * cos;
    return Math.abs(localX) < obstacle.halfX + padding && Math.abs(localZ) < obstacle.halfZ + padding;
  }
  return distance(point, obstacle.center) < obstacle.radius + padding;
}

function boxExtentsFromPolygon(polygon: readonly { x: number; z: number }[]): { halfX: number; halfZ: number; angle: number } {
  const center = polygonCentroid(polygon);
  const first = polygon[0];
  const second = polygon[1] ?? first;
  const angle = Math.atan2(second.z - first.z, second.x - first.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let halfX = 0;
  let halfZ = 0;

  for (const point of polygon) {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    halfX = Math.max(halfX, Math.abs(dx * cos + dz * sin));
    halfZ = Math.max(halfZ, Math.abs(-dx * sin + dz * cos));
  }

  return { halfX, halfZ, angle };
}

function averageRadius(polygon: readonly { x: number; z: number }[]): number {
  const center = polygonCentroid(polygon);
  return polygon.reduce((sum, point) => sum + distance(point, center), 0) / polygon.length;
}

function normalizedDirection(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function dot2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return a.x * b.x + a.z * b.z;
}

function basketballHoopFacingVector(angle: number): { x: number; z: number } {
  return { x: -Math.sin(angle), z: Math.cos(angle) };
}

function benchFacingVector(angle: number): { x: number; z: number } {
  return { x: Math.sin(angle), z: -Math.cos(angle) };
}

function nearestPathSegment(point: { x: number; z: number }, paths: ReturnType<typeof createLevelData>["paths"]) {
  let closest:
    | {
        point: { x: number; z: number };
        start: { x: number; z: number };
        end: { x: number; z: number };
        distance: number;
      }
    | undefined;

  for (const path of paths) {
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const start = path.points[index];
      const end = path.points[index + 1];
      const nearest = nearestPointOnSegment(point, start, end);
      const segmentDistance = distance(point, nearest);
      if (!closest || segmentDistance < closest.distance) {
        closest = { point: nearest, start, end, distance: segmentDistance };
      }
    }
  }

  if (!closest) {
    throw new Error("Expected level path segment");
  }
  return closest;
}

const level = createLevelData();
const terrainSampler = new TerrainSampler(level);

describe("map geometry", () => {
  it("converts the OSM boundary into a playable non-degenerate park polygon", () => {
    expect(PARK_BOUNDARY_GEO.length).toBeGreaterThan(40);
    expect(Math.abs(polygonArea(level.boundary))).toBeGreaterThan(10_000);
    expect(pointInPolygon(polygonCentroid(level.boundary), level.boundary)).toBe(true);
  });

  it("places key features inside the Edinburgh Gardens boundary", () => {
    for (const station of level.upgradeStations) {
      expect(pointInPolygon(station.position, level.boundary)).toBe(true);
    }
    for (const spawn of level.spawnPoints) {
      expect(pointInPolygon(spawn, level.boundary)).toBe(true);
    }
  });

  it("uses mapped tree points inside the park for more accurate placement", () => {
    expect(level.treePoints.length).toBeGreaterThanOrEqual(340);
    expect(level.treeLines.length).toBeGreaterThanOrEqual(5);
    expect(level.significantTrees.length).toBe(19);
    expect(level.trees.length).toBeGreaterThanOrEqual(360);
    expect(level.trees.length).toBe(level.treeColliders.length);
    expect(level.treePoints.filter((tree) => pointInPolygon(tree, level.boundary)).length).toBe(level.treePoints.length);
    expect(level.significantTrees.filter((tree) => pointInPolygon(tree.position, level.boundary)).length).toBe(level.significantTrees.length);
    expect(level.trees.filter((tree) => pointInPolygon(tree.position, level.boundary)).length).toBe(level.trees.length);
    const profiles = new Set(level.trees.map((tree) => tree.profile));
    for (const profile of ["elm", "oak", "gum", "generic"] as const) {
      expect(profiles.has(profile)).toBe(true);
    }
    const canopyGroups = new Set(level.trees.map((tree) => tree.canopyGroup));
    for (const group of ["avenue", "specimen", "mapped"] as const) {
      expect(canopyGroups.has(group)).toBe(true);
    }
    expect(level.trees.every((tree) => tree.canopyRadius >= 3 && tree.canopyRadius <= 13)).toBe(true);
    expect(level.trees.every((tree) => tree.canopyDensity >= 0.42 && tree.canopyDensity <= 0.95)).toBe(true);
    expect(level.trees.filter((tree) => tree.canopyGroup === "specimen").length).toBeGreaterThanOrEqual(level.significantTrees.length - 2);
    expect(level.trees.some((tree) => tree.source?.includes("Yarra significant trees") && tree.height && tree.dbh)).toBe(true);
    expect(level.trees.some((tree) => tree.source?.includes("Vicmap Vegetation Tree Urban") && tree.height && tree.canopyRadius)).toBe(true);
    expect(level.trees.some((tree) => tree.id.startsWith("tree-row-") || tree.source?.includes("tree avenue sample"))).toBe(false);
    const queenVictoriaPlinth = level.landmarks.find((landmark) => landmark.id === "queen-victoria-plinth");
    if (!queenVictoriaPlinth?.position) {
      throw new Error("Missing Queen Victoria plinth landmark");
    }
    const plinthTrees = level.trees.filter((tree) => distance(tree.position, queenVictoriaPlinth.position!) < 85 * WORLD_SCALE);
    expect(plinthTrees.length).toBeGreaterThanOrEqual(42);
    expect(plinthTrees.filter((tree) => tree.source?.includes("Vicmap Vegetation Tree Urban")).length).toBeGreaterThanOrEqual(40);
    for (const removedNodeId of [5365392008, 5365392009, 5365392010, 5365392011, 5365393282, 5365393283, 5365393284]) {
      expect(level.trees.some((tree) => tree.id === `osm-tree-${removedNodeId}`)).toBe(false);
    }
  });

  it("derives solid trunk colliders from mapped and researched trees", () => {
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(level.treeColliders.length).toBe(level.trees.length);
    expect(level.treeColliders.length).toBeGreaterThanOrEqual(360);
    expect(level.treeColliders.every((tree) => pointInPolygon(tree.position, level.boundary))).toBe(true);
    expect(level.treeColliders.every((tree) => tree.radius >= 0.34 && tree.radius <= 1.05)).toBe(true);
    expect(level.treeColliders.some((tree) => tree.source?.includes("Yarra significant trees"))).toBe(true);
    expect(level.treeColliders.some((tree) => tree.source?.includes("Vicmap Vegetation Tree Urban"))).toBe(true);
    expect(level.treeColliders.some((tree) => tree.source?.includes("tree avenue sample"))).toBe(false);

    const sampleTree = level.treeColliders[0];
    const sampleObstacle = level.obstacles.find((obstacle) => obstacle.id === sampleTree.id);
    expect(obstacleIds.has(sampleTree.id)).toBe(true);
    if (!sampleObstacle || sampleObstacle.shape === "box" || sampleObstacle.shape === "polygon") {
      throw new Error("Expected tree collider to create a circular obstacle");
    }
    expect(sampleObstacle.radius).toBeCloseTo(sampleTree.radius);
    expect(sampleObstacle.blocksSight).toBe(false);
  });

  it("places researched sports fixtures and collision posts from the same data", () => {
    const footballGoals = level.sportsFixtures.filter((fixture) => fixture.kind === "football-goal");
    const basketballHoops = level.sportsFixtures.filter((fixture) => fixture.kind === "basketball-hoop");
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));

    expect(footballGoals.length).toBe(2);
    expect(basketballHoops.length).toBe(2);
    expect(footballGoals.every((fixture) => fixture.source?.includes("Australian-rules"))).toBe(true);
    expect(footballGoals.every((fixture) => pointInPolygon(fixture.position, level.boundary))).toBe(true);
    expect(footballGoals.every((fixture) => fixture.width === AUSTRALIAN_RULES_FULL_GOAL_WIDTH_METRES * WORLD_SCALE)).toBe(true);
    expect(footballGoals.every((fixture) => fixture.height === 6)).toBe(true);

    const firstGoal = footballGoals[0];
    const postOffsets = footballPostLocalOffsets(firstGoal.width);
    const goalPosts = postOffsets.map((_, index) => level.obstacles.find((obstacle) => obstacle.id === `${firstGoal.id}-post-${index + 1}`));
    expect(goalPosts.every(Boolean)).toBe(true);
    expect(distance((goalPosts[1] as NonNullable<(typeof goalPosts)[number]>).center, (goalPosts[2] as NonNullable<(typeof goalPosts)[number]>).center)).toBeCloseTo(
      6.4 * WORLD_SCALE
    );
    for (const fixture of footballGoals) {
      footballPostLocalOffsets(fixture.width).forEach((_, index) => {
        expect(obstacleIds.has(`${fixture.id}-post-${index + 1}`)).toBe(true);
        expect(level.obstacles.find((obstacle) => obstacle.id === `${fixture.id}-post-${index + 1}`)?.blocksSight).toBe(false);
      });
    }

    expect(basketballHoops.every((fixture) => fixture.source?.includes("standard 3.05m"))).toBe(true);
    expect(basketballHoops.every((fixture) => pointInPolygon(fixture.position, level.boundary))).toBe(true);
    expect(basketballHoops.every((fixture) => fixture.width === BASKETBALL_BACKBOARD_WIDTH_METRES)).toBe(true);
    expect(basketballHoops.every((fixture) => fixture.height === BASKETBALL_RIM_HEIGHT_METRES)).toBe(true);
    expect(basketballHoops.every((fixture) => obstacleIds.has(`${fixture.id}-post`))).toBe(true);
    expect(basketballHoops.every((fixture) => level.obstacles.find((obstacle) => obstacle.id === `${fixture.id}-post`)?.blocksSight === false)).toBe(true);

    const westHoop = basketballHoops.find((fixture) => fixture.id === "basketball-west-hoop");
    const eastHoop = basketballHoops.find((fixture) => fixture.id === "basketball-east-hoop");
    expect(westHoop).toBeTruthy();
    expect(eastHoop).toBeTruthy();
    expect(dot2(basketballHoopFacingVector(westHoop!.angle), normalizedDirection(westHoop!.position, eastHoop!.position))).toBeGreaterThan(0.99);
    expect(dot2(basketballHoopFacingVector(eastHoop!.angle), normalizedDirection(eastHoop!.position, westHoop!.position))).toBeGreaterThan(0.99);
  });

  it("keeps sport marking constants aligned with source dimensions", () => {
    expect(AUSTRALIAN_RULES_FIFTY_ARC_METRES).toBe(50);
    expect(AUSTRALIAN_RULES_CENTRE_SQUARE_METRES).toBe(50);
    expect(AUSTRALIAN_RULES_OUTER_CIRCLE_DIAMETER_METRES).toBe(10);
    expect(AUSTRALIAN_RULES_INNER_CIRCLE_DIAMETER_METRES).toBe(3);
    expect(AUSTRALIAN_RULES_GOAL_SQUARE_DEPTH_METRES).toBe(9);
    expect(AUSTRALIAN_RULES_GOAL_POST_SPACING_METRES).toBe(6.4);
    expect(CRICKET_PITCH_LENGTH_METRES).toBeCloseTo(20.12);
    expect(CRICKET_PITCH_WIDTH_METRES).toBeCloseTo(3.05);
    expect(CRICKET_BOWLING_CREASE_LENGTH_METRES).toBeCloseTo(2.64);
    expect(CRICKET_POPPING_CREASE_OFFSET_METRES).toBeCloseTo(1.22);
    expect(CRICKET_STUMP_HEIGHT_METRES).toBeCloseTo(0.711);
    expect(CRICKET_WICKET_WIDTH_METRES).toBeCloseTo(0.229);
  });

  it("keeps the real-map scale expanded but close to measured metres", () => {
    expect(WORLD_SCALE).toBeGreaterThan(1);
    expect(WORLD_SCALE).toBeLessThan(1.35);
  });

  it("includes Vicmap-derived elevation samples for broad terrain", () => {
    expect(level.elevationSamples.length).toBeGreaterThanOrEqual(90);
    expect(level.elevationMin).toBeGreaterThanOrEqual(26);
    expect(level.elevationMax).toBeLessThanOrEqual(33);
    expect(level.elevationMax - level.elevationMin).toBeGreaterThan(4);
    expect(level.elevationSamples.some((sample) => sample.source === "vicmap-spot")).toBe(true);
    expect(level.elevationSamples.filter((sample) => pointInPolygon(sample.position, level.boundary)).length).toBe(level.elevationSamples.length);
  });

  it("adds sourceable micro-terrain modifiers over broad elevation", () => {
    const modifierKinds = new Set(level.terrainModifiers.map((modifier) => modifier.kind));
    for (const kind of ["path-crown", "path-shoulder", "tree-root", "drainage-swale", "oval-banking", "skate-bowl"] as const) {
      expect(modifierKinds.has(kind)).toBe(true);
    }
    expect(level.terrainModifiers.length).toBeGreaterThan(level.trees.length);
    expect(level.terrainModifiers.every((modifier) => modifier.source && modifier.delta !== 0)).toBe(true);
    expect(level.terrainModifiers.filter((modifier) => modifier.kind === "tree-root").length).toBe(level.trees.length);
  });

  it("samples local micro-relief without replacing Vicmap broad slope", () => {
    const sampler = terrainSampler;
    const crown = level.terrainModifiers.find((modifier) => modifier.kind === "path-crown" && modifier.shape === "line");
    const treeRoot = level.terrainModifiers.find((modifier) => modifier.kind === "tree-root" && modifier.shape === "radial");
    const swale = level.terrainModifiers.find((modifier) => modifier.kind === "drainage-swale" && modifier.shape === "line");

    expect(crown).toBeTruthy();
    expect(treeRoot).toBeTruthy();
    expect(swale).toBeTruthy();
    if (!crown || crown.shape !== "line" || !treeRoot || treeRoot.shape !== "radial" || !swale || swale.shape !== "line") {
      throw new Error("Expected terrain modifier shapes");
    }

    expect(sampler.microReliefAt(crown.points[1])).toBeGreaterThan(0.02);
    expect(sampler.microReliefAt(treeRoot.center)).toBeGreaterThan(0.04);
    expect(sampler.microReliefAt(swale.points[1])).toBeLessThan(0);
    expect(sampler.altitudeAt(crown.points[1])).toBeGreaterThanOrEqual(level.elevationMin);
  });

  it("models Fitzy Bowl as lowered enterable bowls instead of an invisible skate blocker", () => {
    const sampler = terrainSampler;
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    const skateLandmark = level.landmarks.find((landmark) => landmark.id === "skate");
    const bowlModifiers = level.terrainModifiers.filter((modifier) => modifier.kind === "skate-bowl");

    expect(obstacleIds.has("skate")).toBe(false);
    expect(level.skateBowls).toHaveLength(3);
    expect(level.skateBowls.filter((bowl) => bowl.difficulty === "deep")).toHaveLength(2);
    expect(level.skateBowls.some((bowl) => bowl.difficulty === "beginner" && bowl.depth <= 0.4)).toBe(true);
    expect(bowlModifiers).toHaveLength(level.skateBowls.length);
    expect(bowlModifiers.every((modifier) => modifier.shape === "ellipse" && modifier.delta < -0.25)).toBe(true);

    if (!skateLandmark?.polygon) {
      throw new Error("Missing skatepark landmark polygon");
    }
    for (const bowl of level.skateBowls) {
      expect(pointInPolygon(bowl.center, skateLandmark.polygon), `${bowl.id} center outside skatepark`).toBe(true);
      expect(sampler.microReliefAt(bowl.center), `${bowl.id} is not lowered`).toBeLessThan(-0.25);
      expect(bowl.exitWidth, `${bowl.id} exit should be narrow enough to be an intentional route`).toBeLessThan(0.6);
    }
  });

  it("includes OSM-mapped building and fence footprints", () => {
    const buildingIds = new Set(level.mappedBuildings.map((building) => building.id));
    const profiles = new Set(level.mappedBuildings.map((building) => building.detailProfile).filter(Boolean));
    expect(level.mappedBuildings.length).toBeGreaterThanOrEqual(12);
    expect(buildingIds.has("osm-building-543505702")).toBe(true);
    expect(buildingIds.has("osm-building-242003562")).toBe(true);
    expect(buildingIds.has("osm-man-made-715802679")).toBe(true);
    const expectedProfiles: Array<NonNullable<MappedBuilding["detailProfile"]>> = ["tennis-pavilion", "bowling-club", "gatehouse", "community-centre", "amenities"];
    for (const profile of expectedProfiles) {
      expect(profiles.has(profile)).toBe(true);
    }
    expect(level.mappedBuildings.every((building) => building.source?.includes("OSM way"))).toBe(true);
    expect(level.mappedBuildings.some((building) => building.source?.includes("CMP"))).toBe(true);
    const fenceIds = new Set(level.mappedFences.map((fence) => fence.id));
    expect(level.mappedFences.length).toBeGreaterThanOrEqual(3);
    for (const id of ["south-playground-fence", "oval-fence", "osm-fence-715802680"]) {
      expect(fenceIds.has(id)).toBe(true);
    }
    expect(fenceIds.has("north-playground-fence")).toBe(false);
    expect(level.mappedFences.every((fence) => fence.source)).toBe(true);
    expect(level.mappedBuildings.filter((building) => pointInPolygon(polygonCentroid(building.polygon), level.boundary)).length).toBe(level.mappedBuildings.length);
  });

  it("models the south playground fence and gated oval access as mapped blockers", () => {
    const fences = new Map(level.mappedFences.map((fence) => [fence.id, fence]));
    const south = fences.get("south-playground-fence");
    const oval = fences.get("oval-fence");
    expect(south?.gates?.length).toBe(3);
    expect(oval?.gates?.length).toBe(3);
    expect(south?.source).toContain("Melbourne Playgrounds");
    expect(oval?.source).toContain("OSM connector ways 403753751 and 403753754");
    expect(oval?.jumpable).toBe(true);
    expect(oval?.jumpBypassMinHeight).toBeGreaterThan(0.4);
    expect(level.landmarks.find((landmark) => landmark.id === "north-playground")?.source).toContain("no current public fence source");

    const fenceObstacles = level.obstacles.filter((obstacle) => obstacle.sourceObjectKind === "mapped-fence");
    expect(fenceObstacles.length).toBeGreaterThanOrEqual(10);
    expect(fenceObstacles.every((obstacle) => obstacle.blocksSight === false)).toBe(true);
    expect(fenceObstacles.filter((obstacle) => obstacle.sourceObjectId === "oval-fence").every((obstacle) => obstacle.jumpable === true)).toBe(true);
    expect(fenceObstacles.filter((obstacle) => obstacle.sourceObjectId === "south-playground-fence").some((obstacle) => obstacle.jumpable)).toBe(false);

    for (const fence of [south, oval]) {
      if (!fence?.gates) throw new Error(`Missing gates for ${fence?.id ?? "fence"}`);
      const segments = fenceObstacles.filter((obstacle) => obstacle.sourceObjectId === fence.id);
      expect(segments.length, `${fence.id} has no blocking segments`).toBeGreaterThan(0);
      for (const gate of fence.gates) {
        expect(pointInPolygon(gate.position, level.boundary), `${gate.id} is outside the park`).toBe(true);
        const blocked = segments.some((segment) => pointInsideObstacle(gate.position, segment, 0.35));
        expect(blocked, `${gate.id} is blocked by ${fence.id}`).toBe(false);
      }
    }
  });

  it("keeps facade frontages source-backed for major mapped buildings", () => {
    const facadeBuildings = [
      "osm-building-242003562",
      "osm-building-403753784",
      "osm-building-543505638",
      "osm-building-543505639",
      "osm-building-543505702"
    ];

    for (const id of facadeBuildings) {
      const building = level.mappedBuildings.find((candidate) => candidate.id === id);
      expect(building?.facade?.frontagePoint).toBeTruthy();
      expect(building?.facade?.source).toBeTruthy();
      expect(distance(building!.facade!.frontagePoint, polygonCentroid(building!.polygon))).toBeGreaterThan(2);
      expect(distanceToPolygonEdge(building!.facade!.frontagePoint, building!.polygon)).toBeLessThan(40);
    }

    expect(level.mappedBuildings.find((building) => building.id === "osm-building-403753784")?.facade?.source).toContain("Brunswick Street Oval");
    expect(level.mappedBuildings.find((building) => building.id === "osm-building-543505702")?.facade?.source).toContain("Emely Baker Centre");
    expect(level.mappedBuildings.find((building) => building.id === "osm-building-543505639")?.facade?.source).toContain("Memorial Wall");
  });

  it("marks the six existing tennis courts as current renovation surfaces", () => {
    const tennisCourts = level.landmarks.filter((landmark) => landmark.id.startsWith("tennis-court-"));
    expect(tennisCourts.length).toBe(6);
    expect(tennisCourts.every((court) => court.courtStatus === "renovating-existing")).toBe(true);
    expect(tennisCourts.every((court) => court.source?.includes("full renovation of six existing courts"))).toBe(true);
    expect(tennisCourts.every((court) => court.polygon?.every((point) => pointInPolygon(point, level.boundary)))).toBe(true);
  });

  it("adds source-backed deeper structure affordances", () => {
    const amenitiesById = new Map(level.amenities.map((amenity) => [amenity.id, amenity]));

    expect(amenitiesById.get("grandstand-umpire-room-access")?.kind).toBe("umpire_room");
    expect(amenitiesById.get("grandstand-umpire-room-access")?.source).toContain("umpire");
    expect(amenitiesById.get("emely-baker-kitchenette")?.kind).toBe("kitchenette");
    expect(amenitiesById.get("emely-baker-kitchenette")?.source).toContain("microwave");
    expect(amenitiesById.get("bowling-green-service-locker")?.linkedStructureId).toBe("osm-building-1475006770");
    expect(amenitiesById.get("north-toilets-service-room")?.source).toContain("flat concrete roof");
    expect(amenitiesById.get("rotunda-memorial-plaque")?.kind).toBe("memorial_plaque");
    expect(amenitiesById.get("rotunda-memorial-plaque")?.source).toContain("memorial plaques");
    expect(amenitiesById.get("grandstand-external-public-toilets")?.kind).toBe("toilets");
    expect(amenitiesById.get("grandstand-external-public-toilets")?.source).toContain("externally accessible public toilets");
    expect(amenitiesById.get("grandstand-kiosk-hatch")?.kind).toBe("kiosk_hatch");
    expect(amenitiesById.get("grandstand-kiosk-hatch")?.source).toContain("kiosk terrace");
    expect(amenitiesById.get("grandstand-first-aid-room")?.kind).toBe("first_aid_room");
    expect(amenitiesById.get("grandstand-first-aid-room")?.source).toContain("first aid room");
    expect(amenitiesById.get("grandstand-sports-kitchen")?.kind).toBe("kitchenette");
    expect(amenitiesById.get("grandstand-sports-kitchen")?.source).toContain("kitchen");
    expect(amenitiesById.get("bowling-roof-gutter-maintenance")?.source).toContain("zincalume");
    expect(amenitiesById.get("bowling-roof-gutter-maintenance")?.source).toContain("gutters");

    const utilityBoxes = level.amenities.filter((amenity) => amenity.kind === "utility_box");
    expect(utilityBoxes.map((amenity) => amenity.id).sort()).toEqual(
      ["emely-baker-switchboard", "grandstand-switchboard", "south-amenities-switchboard", "tennis-switchboard"].sort()
    );
    expect(utilityBoxes.every((amenity) => amenity.source?.includes("no-current-power constraint"))).toBe(true);
    expect(utilityBoxes.some((amenity) => amenity.linkedStructureId === "osm-building-543505640")).toBe(false);
  });

  it("adds source-backed structure shelter zones around real buildings", () => {
    const shelterIds = new Set(level.structureShelters.map((shelter) => shelter.id));
    const landmarks = new Set(level.landmarks.map((landmark) => landmark.id));
    const mappedBuildings = new Set(level.mappedBuildings.map((building) => building.id));

    for (const id of [
      "rotunda-roof-shelter",
      "grandstand-covered-seats-shelter",
      "osm-building-403753784-verandah-shelter",
      "osm-building-543505702-shade-sail-shelter",
      "north-toilets-roof-shelter"
    ]) {
      expect(shelterIds.has(id)).toBe(true);
    }

    for (const shelter of level.structureShelters) {
      expect(shelter.source, `${shelter.id} missing source`).toBeTruthy();
      expect(shelter.weatherProtection, `${shelter.id} weak protection`).toBeGreaterThan(0.5);
      expect(shelter.weatherProtection, `${shelter.id} overpowered protection`).toBeLessThanOrEqual(0.85);
      expect(pointInPolygon(shelter.footprint.center, level.boundary), `${shelter.id} outside boundary`).toBe(true);
      expect(landmarks.has(shelter.linkedStructureId) || mappedBuildings.has(shelter.linkedStructureId)).toBe(true);
    }

    const rotunda = level.interactables.find((fixture) => fixture.id === "rotunda-deck");
    const rotundaShelter = level.structureShelters.find((shelter) => shelter.id === "rotunda-roof-shelter");
    const grandstand = level.interactables.find((fixture) => fixture.id === "grandstand-seats");
    const grandstandShelter = level.structureShelters.find((shelter) => shelter.id === "grandstand-covered-seats-shelter");
    const southRoof = level.interactables.find((fixture) => fixture.id === "south-toilets-roof");
    const southAmenitiesShelter = level.structureShelters.find((shelter) => shelter.id === "osm-building-242003562-shelter");

    expect(rotunda?.landingPosition && rotundaShelter && pointInRaisedFootprint(rotunda.landingPosition, rotundaShelter.footprint)).toBe(true);
    expect(grandstand?.landingPosition && grandstandShelter && pointInRaisedFootprint(grandstand.landingPosition, grandstandShelter.footprint)).toBe(true);
    expect(southRoof?.landingPosition && southAmenitiesShelter && pointInRaisedFootprint(southRoof.landingPosition, southAmenitiesShelter.footprint)).toBe(true);
  });

  it("includes researched hardscape edge and drain features", () => {
    const hardscapeIds = new Set(level.hardscapeLines.map((line) => line.id));
    expect(level.hardscapeLines.length).toBeGreaterThanOrEqual(3);
    expect(hardscapeIds.has("hardscape-elm-avenue-basalt-edging")).toBe(false);
    expect(hardscapeIds.has("hardscape-oval-east-bluestone-drain")).toBe(true);
    expect(hardscapeIds.has("hardscape-alfred-crescent-retaining-wall")).toBe(true);
    expect(level.hardscapeLines.every((line) => line.source?.includes("CMP"))).toBe(true);
    expect(level.hardscapeLines.filter((line) => line.points.some((point) => pointInPolygon(point, level.boundary))).length).toBe(level.hardscapeLines.length);
  });

  it("adds sourceable path material transition patches without collision", () => {
    const patchKinds = new Set(level.pathSurfacePatches.map((patch) => patch.kind));
    for (const kind of ["path-edge-wear", "path-junction-wear", "desire-path", "gravel-feather", "muddy-threshold"] as const) {
      expect(patchKinds.has(kind)).toBe(true);
    }
    expect(level.pathSurfacePatches.length).toBeGreaterThan(35);
    expect(level.pathSurfacePatches.every((patch) => patch.source && pointInPolygon(patch.position, level.boundary))).toBe(true);
    expect(level.pathSurfacePatches.every((patch) => patch.length > 0.5 && patch.width > 0.4)).toBe(true);
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(level.pathSurfacePatches.some((patch) => obstacleIds.has(patch.id))).toBe(false);
  });

  it("includes OSM-derived street-edge context around the park", () => {
    const streetIds = new Set(level.streetEdges.map((street) => street.id));
    for (const id of ["street-st-georges-road", "street-brunswick-street", "street-freeman-street", "street-alfred-crescent-north-east"]) {
      expect(streetIds.has(id)).toBe(true);
    }
    expect(level.streetEdges.length).toBeGreaterThanOrEqual(5);
    expect(level.streetEdges.every((street) => street.source?.includes("OpenStreetMap Overpass road query"))).toBe(true);
    expect(level.streetEdges.every((street) => street.points.length >= 10)).toBe(true);
    expect(level.streetEdges.filter((street) => street.kind === "trunk" && street.hasTram).length).toBeGreaterThanOrEqual(2);
    expect(level.streetEdges.some((street) => street.surface === "paved")).toBe(true);
    expect(level.streetEdges.some((street) => street.points.some((point) => !pointInPolygon(point, level.boundary)))).toBe(true);
  });

  it("includes the major memorial and plinth landmarks", () => {
    const landmarkIds = new Set(level.landmarks.map((landmark) => landmark.id));
    expect(landmarkIds.has("queen-victoria-plinth")).toBe(true);
    expect(landmarkIds.has("sportsmans-war-memorial")).toBe(true);
    expect(landmarkIds.has("cook-memorial-site")).toBe(true);
  });

  it("uses realistic access points for climbable building fixtures", () => {
    const rotunda = level.interactables.find((fixture) => fixture.id === "rotunda-deck");
    const rotundaBuilding = level.mappedBuildings.find((building) => building.id === "osm-building-543505640");
    expect(rotunda?.accessPosition).toBeTruthy();
    expect(rotunda?.landingPosition).toBeTruthy();
    expect(rotundaBuilding).toBeTruthy();
    expect(rotunda?.bypassObstacleIds).toContain("osm-building-543505640");
    expect(rotunda?.accessKind).toBe("stairs");
    expect(rotunda?.exitPosition).toEqual(rotunda?.accessPosition);
    expect(rotunda?.prompt).toContain("stairs");
    expect(rotunda?.height).toBeGreaterThan(1.5);
    expect(rotunda?.height).toBeLessThan(2.4);
    expect(distance(rotunda!.position, rotunda!.accessPosition!)).toBeGreaterThan(6);
    expect(distance(rotunda!.accessPosition!, rotunda!.landingPosition!)).toBeGreaterThan(3);
    expect(distance(rotunda!.position, rotunda!.landingPosition!)).toBeLessThan(rotunda!.radius);
    expect(distance(rotunda!.position, polygonCentroid(rotundaBuilding!.polygon))).toBeLessThan(0.01);
    expect(pointInPolygon(rotunda!.accessPosition!, level.boundary)).toBe(true);

    const grandstand = level.interactables.find((fixture) => fixture.id === "grandstand-seats");
    expect(grandstand?.accessPosition).toBeTruthy();
    expect(grandstand?.landingPosition).toBeTruthy();
    expect(grandstand?.accessKind).toBe("stairs");
    expect(grandstand?.prompt).toContain("stairs");
    expect(distance(grandstand!.position, grandstand!.accessPosition!)).toBeGreaterThan(5);
    expect(distance(grandstand!.accessPosition!, grandstand!.landingPosition!)).toBeGreaterThan(3);

    const roofFixtures = level.interactables.filter((fixture) => fixture.kind === "toilets" && fixture.id.endsWith("-roof"));
    expect(roofFixtures.length).toBeGreaterThanOrEqual(2);
    expect(roofFixtures.every((fixture) => fixture.accessPosition && fixture.landingPosition && fixture.accessKind === "ladder" && fixture.prompt.includes("ladder"))).toBe(true);
    const southRoof = roofFixtures.find((fixture) => fixture.id === "south-toilets-roof");
    const southAmenitiesBuilding = level.mappedBuildings.find((building) => building.id === "osm-building-242003562");
    expect(southRoof).toBeTruthy();
    expect(southAmenitiesBuilding).toBeTruthy();
    expect(southRoof?.bypassObstacleIds).toContain("osm-building-242003562");
    expect(level.landmarks.some((landmark) => landmark.id === "south-toilets")).toBe(false);
    expect(distance(southRoof!.position, polygonCentroid(southAmenitiesBuilding!.polygon))).toBeLessThan(0.01);
    expect(distanceToPolygonEdge(southRoof!.accessPosition!, southAmenitiesBuilding!.polygon)).toBeLessThan(0.85);

    const northRoof = roofFixtures.find((fixture) => fixture.id === "north-toilets-roof");
    const northToilets = level.landmarks.find((landmark) => landmark.id === "north-toilets");
    expect(northRoof).toBeTruthy();
    expect(northToilets?.polygon).toBeTruthy();
    expect(distanceToPolygonEdge(northRoof!.accessPosition!, northToilets!.polygon!)).toBeLessThan(1.5);

    const basketballFrames = level.interactables.filter((fixture) => fixture.kind === "basketball" && fixture.id.endsWith("-frame"));
    const basketballHoops = level.sportsFixtures.filter((fixture) => fixture.kind === "basketball-hoop");
    expect(basketballFrames.length).toBe(basketballHoops.length);
    for (const frame of basketballFrames) {
      const hoop = basketballHoops.find((fixture) => frame.id === `${fixture.id}-frame`);
      expect(hoop).toBeTruthy();
      expect(frame.accessKind).toBe("frame");
      expect(frame.accessPosition).toEqual(hoop?.position);
      expect(distance(frame.position, hoop!.position)).toBeLessThan(0.01);
      expect(frame.bypassObstacleIds).toContain(`${hoop!.id}-post`);
    }
  });

  it("keeps climbable raised footprints matched to visible platforms", () => {
    const toggleFixtures = level.interactables.filter((fixture) => fixture.mode === "toggle");
    expect(toggleFixtures.length).toBeGreaterThanOrEqual(7);
    for (const fixture of toggleFixtures) {
      expect(fixture.raisedFootprint, `${fixture.id} is missing a raised footprint`).toBeTruthy();
      const landing = fixture.landingPosition ?? fixture.position;
      expect(pointInRaisedFootprint(landing, fixture.raisedFootprint!, 0.05), `${fixture.id} landing is not on its raised footprint`).toBe(true);
    }

    const rotunda = level.interactables.find((fixture) => fixture.id === "rotunda-deck");
    expect(rotunda?.raisedFootprint?.shape).toBe("circle");
    if (rotunda?.raisedFootprint?.shape === "circle") {
      expect(rotunda.raisedFootprint.radius).toBeCloseTo(5.05, 2);
    }
    expect(rotunda?.height).toBeCloseTo(1.86, 2);

    const grandstand = level.interactables.find((fixture) => fixture.id === "grandstand-seats");
    const grandstandPolygon = level.landmarks.find((landmark) => landmark.id === "grandstand")?.polygon;
    expect(grandstand?.raisedFootprint?.shape).toBe("box");
    expect(grandstandPolygon).toBeTruthy();
    if (grandstand?.raisedFootprint?.shape === "box" && grandstandPolygon) {
      const visible = boxExtentsFromPolygon(grandstandPolygon);
      expect(grandstand.raisedFootprint.halfX).toBeCloseTo(visible.halfX + 0.8, 2);
      expect(grandstand.raisedFootprint.halfZ).toBeCloseTo(visible.halfZ + 0.45, 2);
    }
    expect(grandstand?.height).toBeCloseTo(2.55, 2);

    for (const fixtureId of ["north-playground-tower", "south-playground-tower"]) {
      const fixture = level.interactables.find((candidate) => candidate.id === fixtureId);
      expect(fixture?.raisedFootprint?.shape).toBe("box");
      if (fixture?.raisedFootprint?.shape === "box") {
        expect(fixture.raisedFootprint.halfX).toBeCloseTo(2.6, 2);
        expect(fixture.raisedFootprint.halfZ).toBeCloseTo(2.3, 2);
      }
      expect(fixture?.radius).toBeLessThan(4);
      expect(fixture?.accessPosition).toBeTruthy();
    }

    const southRoof = level.interactables.find((fixture) => fixture.id === "south-toilets-roof");
    const southBuilding = level.mappedBuildings.find((building) => building.id === "osm-building-242003562");
    expect(southRoof?.raisedFootprint?.shape).toBe("box");
    expect(southBuilding).toBeTruthy();
    if (southRoof?.raisedFootprint?.shape === "box" && southBuilding) {
      const visible = boxExtentsFromPolygon(southBuilding.polygon);
      expect(southRoof.raisedFootprint.halfX).toBeCloseTo(visible.halfX + 0.18, 2);
      expect(southRoof.raisedFootprint.halfZ).toBeCloseTo(visible.halfZ + 0.18, 2);
    }
    expect(southRoof?.height).toBeCloseTo(3.58, 2);

    for (const frame of level.interactables.filter((fixture) => fixture.kind === "basketball")) {
      expect(frame.raisedFootprint?.shape).toBe("circle");
      if (frame.raisedFootprint?.shape === "circle") {
        expect(frame.raisedFootprint.radius).toBeLessThan(1.2);
      }
      expect(frame.radius).toBeLessThan(1.5);
    }
  });

  it("uses a richer OSM-derived path and amenity network", () => {
    const pathIds = new Set(level.paths.map((path) => path.id));
    expect(level.paths.length).toBeGreaterThanOrEqual(45);
    expect(level.paths.filter((path) => path.kind === "rail").length).toBeGreaterThanOrEqual(2);
    expect(level.paths.filter((path) => path.kind === "service").length).toBeGreaterThanOrEqual(2);
    expect(level.paths.filter((path) => path.kind === "steps").length).toBeGreaterThanOrEqual(4);
    expect(pathIds.has("rotunda-approach-loop")).toBe(true);
    expect(pathIds.has("osm-plinth-garden-loop")).toBe(true);
    expect(pathIds.has("osm-22760904-plinth-west-connector")).toBe(true);
    expect(pathIds.has("osm-22760905-plinth-east-connector")).toBe(true);
    expect(pathIds.has("osm-75488632-rail-trail-central-cross-link")).toBe(true);
    expect(pathIds.has("osm-210387722-bowling-service-track")).toBe(true);
    expect(pathIds.has("osm-1340462810-emely-baker-napier-footpath")).toBe(true);
    expect(pathIds.has("elm-avenue-main")).toBe(false);
    for (const id of [
      "osm-22760900-north-west-short-footway",
      "osm-22760906-tennis-service-path",
      "osm-22760908-north-east-cycle-link",
      "osm-403753751-oval-north-entry",
      "osm-403753754-oval-west-connector",
      "osm-715802681-grandstand-west-steps",
      "osm-715802682-grandstand-inner-steps",
      "osm-715802683-grandstand-east-steps",
      "osm-715802684-grandstand-outer-steps",
      "osm-715802685-grandstand-upper-footway",
      "osm-715802686-grandstand-lower-footway",
      "osm-715802687-grandstand-west-step-link",
      "osm-715802688-grandstand-inner-step-link",
      "osm-715802689-grandstand-east-step-link",
      "osm-715802690-grandstand-central-step-link"
    ]) {
      expect(pathIds.has(id)).toBe(true);
    }
    expect(pathIds.has("osm-rotunda-loop")).toBe(false);
    expect(level.paths.filter((path) => path.source?.startsWith("OpenStreetMap way")).length).toBeGreaterThanOrEqual(24);
    expect(level.amenities.length).toBeGreaterThan(40);
    expect(level.amenities.filter((amenity) => amenity.kind === "drinking_water").length).toBeGreaterThanOrEqual(3);
    expect(level.amenities.filter((amenity) => amenity.kind === "picnic_table").length).toBeGreaterThanOrEqual(4);
    expect(level.amenities.filter((amenity) => amenity.kind === "table_tennis").length).toBeGreaterThanOrEqual(1);
    expect(level.amenities.filter((amenity) => pointInPolygon(amenity.position, level.boundary)).length).toBe(level.amenities.length);
  });

  it("does not render an unsupported Emely Baker to south playground diagonal path", () => {
    const emelyBaker = geoToWorld({ lat: -37.785739, lon: 144.9825 });
    const southPlayground = geoToWorld({ lat: -37.788998, lon: 144.983849 });
    const crossGardenPaths = level.paths.filter(
      (path) =>
        path.points.some((point) => distance(point, emelyBaker) < 45) &&
        path.points.some((point) => distance(point, southPlayground) < 90)
    );

    expect(crossGardenPaths.map((path) => path.id)).toEqual([]);
  });

  it("models open lawns and park feature precincts as accessible landmarks", () => {
    const landmarkIds = new Set(level.landmarks.map((landmark) => landmark.id));
    for (const id of ["north-open-lawn", "north-activity-precinct", "alfred-crescent-open-lawn", "south-picnic-lawn", "stormwater-filtration-garden", "raingarden-reservoir"]) {
      expect(landmarkIds.has(id)).toBe(true);
    }

    const gardenLandmarks = level.landmarks.filter((landmark) => landmark.kind === "garden" && landmark.id !== "park");
    expect(gardenLandmarks.length).toBeGreaterThanOrEqual(15);
    for (const landmark of gardenLandmarks) {
      expect(landmark.polygon).toBeDefined();
      if (!landmark.polygon) {
        throw new Error(`Missing polygon for ${landmark.id}`);
      }
      expect(pointInPolygon(polygonCentroid(landmark.polygon), level.boundary)).toBe(true);
    }

    const skate = level.landmarks.find((landmark) => landmark.id === "skate");
    const raingarden = level.landmarks.find((landmark) => landmark.id === "stormwater-filtration-garden");
    const reservoir = level.landmarks.find((landmark) => landmark.id === "raingarden-reservoir");
    const railTrail = level.paths.find((path) => path.id === "inner-circle-rail-trail");
    expect(skate?.polygon).toBeDefined();
    expect(raingarden?.polygon).toBeDefined();
    expect(reservoir?.polygon).toBeDefined();
    expect(railTrail).toBeDefined();
    expect(raingarden?.gardenStyle).toBe("stormwater-filtration");
    expect(reservoir?.gardenStyle).toBe("stormwater-storage");
    const skateCenter = polygonCentroid(skate!.polygon!);
    const raingardenCenter = polygonCentroid(raingarden!.polygon!);
    const reservoirCenter = polygonCentroid(reservoir!.polygon!);
    const landezineMapMarker = geoToWorld({ lat: -37.787301, lon: 144.983139 });
    const raingardenAreaSquareMeters = Math.abs(polygonArea(raingarden!.polygon!)) / (WORLD_SCALE * WORLD_SCALE);
    expect(raingardenCenter.z).toBeGreaterThan(skateCenter.z);
    expect(distance(raingardenCenter, skateCenter)).toBeLessThan(130);
    expect(signedSideOfNearestPolylineSegment(raingardenCenter, railTrail!.points)).toBeLessThan(-4);
    expect(signedSideOfNearestPolylineSegment(landezineMapMarker, railTrail!.points)).toBeGreaterThan(4);
    expect(raingardenAreaSquareMeters).toBeGreaterThan(600);
    expect(raingardenAreaSquareMeters).toBeLessThan(800);
    expect(reservoirCenter.x).toBeGreaterThan(raingardenCenter.x);
    expect(distance(reservoirCenter, raingardenCenter)).toBeGreaterThan(25);
  });

  it("adds source-backed ornamental garden beds without marking them as cover", () => {
    const expectedStyles = new Map([
      ["st-georges-display-bed-north", "ornamental-floral"],
      ["st-georges-display-bed-central", "ornamental-floral"],
      ["st-georges-display-bed-south", "ornamental-floral"],
      ["rotunda-lawn-shrub-bed-central", "ornamental-shrub"],
      ["rotunda-lawn-shrub-bed-north", "ornamental-shrub"],
      ["rotunda-lawn-shrub-bed-south", "ornamental-shrub"],
      ["queen-victoria-circular-display-bed", "ornamental-floral"],
      ["tennis-agapanthus-strip", "agapanthus"]
    ]);

    for (const [id, style] of expectedStyles) {
      const landmark = level.landmarks.find((candidate) => candidate.id === id);
      expect(landmark?.kind).toBe("garden");
      expect(landmark?.gardenStyle).toBe(style);
      expect(landmark?.cover).toBeUndefined();
      expect(landmark?.source).toContain("CMP");
      expect(landmark?.polygon).toBeDefined();
      expect(pointInPolygon(polygonCentroid(landmark!.polygon!), level.boundary)).toBe(true);
    }

    const stGeorgesBeds = [...expectedStyles.keys()]
      .filter((id) => id.startsWith("st-georges"))
      .map((id) => polygonCentroid(level.landmarks.find((landmark) => landmark.id === id)!.polygon!));
    expect(stGeorgesBeds[0].z).toBeLessThan(stGeorgesBeds[1].z);
    expect(stGeorgesBeds[1].z).toBeLessThan(stGeorgesBeds[2].z);
  });

  it("models the north-east raised shrub planters as source-backed crouch cover", () => {
    const bluestone = level.landmarks.find((landmark) => landmark.id === "north-east-bluestone-shrub-planter");
    const roweNorth = level.landmarks.find((landmark) => landmark.id === "rowe-street-north-entrance-planter");
    const roweSouth = level.landmarks.find((landmark) => landmark.id === "rowe-street-south-entrance-planter");
    const planters = [bluestone, roweNorth, roweSouth];

    for (const planter of planters) {
      expect(planter?.kind).toBe("garden");
      expect(planter?.cover).toBe("dense-shrub");
      expect(planter?.source).toContain("CMP");
      expect(planter?.polygon).toBeDefined();
      expect(pointInPolygon(polygonCentroid(planter!.polygon!), level.boundary)).toBe(true);
      expect(level.trees.some((tree) => pointInPolygon(tree.position, planter!.polygon!))).toBe(false);
    }

    expect(averageRadius(bluestone!.polygon!)).toBeCloseTo(5 * WORLD_SCALE, 1);
    expect(averageRadius(roweNorth!.polygon!)).toBeCloseTo(2.5 * WORLD_SCALE, 1);
    expect(averageRadius(roweSouth!.polygon!)).toBeCloseTo(2.5 * WORLD_SCALE, 1);

    const bluestoneCenter = polygonCentroid(bluestone!.polygon!);
    const roweNorthCenter = polygonCentroid(roweNorth!.polygon!);
    const roweSouthCenter = polygonCentroid(roweSouth!.polygon!);
    expect(bluestoneCenter.z).toBeLessThan(roweNorthCenter.z);
    expect(bluestoneCenter.x).toBeLessThan(roweNorthCenter.x);
    expect(distance(roweNorthCenter, roweSouthCenter)).toBeGreaterThan(10 * WORLD_SCALE);
    expect(distance(roweNorthCenter, roweSouthCenter)).toBeLessThan(18 * WORLD_SCALE);
  });

  it("keeps small park furniture interactive without adding collision blockers", () => {
    const amenityIds = new Set(level.amenities.map((amenity) => amenity.id));
    for (const id of ["north-table-tennis", "north-bbq-picnic-table-1", "south-picnic-table-1"]) {
      expect(amenityIds.has(id)).toBe(true);
    }

    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(obstacleIds.has("north-activity-precinct")).toBe(false);
    expect(obstacleIds.has("south-picnic-lawn")).toBe(false);
    expect(obstacleIds.has("north-table-tennis")).toBe(false);
  });

  it("orients park benches from nearby paths and heritage focal points", () => {
    const parkCenter = polygonCentroid(level.boundary);
    const benches = level.amenities.filter((amenity) => amenity.kind === "bench");
    expect(benches.length).toBeGreaterThanOrEqual(20);
    for (const bench of benches) {
      expect(Number.isFinite(bench.angle)).toBe(true);
      const nearest = nearestPathSegment(bench.position, level.paths);
      const pathDirection = normalizedDirection(nearest.start, nearest.end);
      const benchLengthDirection = { x: Math.cos(bench.angle!), z: Math.sin(bench.angle!) };
      const target = nearest.distance > 0.2 ? nearest.point : parkCenter;
      expect(Math.abs(dot2(benchLengthDirection, pathDirection)), bench.id).toBeGreaterThan(0.99);
      expect(dot2(benchFacingVector(bench.angle!), normalizedDirection(bench.position, target)), bench.id).toBeGreaterThan(0);
      expect(bench.source?.includes("orientation inferred")).toBe(true);
    }

    const rotundaSeat = level.parkLifeDetails.find((detail) => detail.id === "rotunda-reproduction-seat");
    const queenVictoriaSeat = level.parkLifeDetails.find((detail) => detail.id === "queen-victoria-reproduction-seat");
    const rotunda = level.landmarks.find((landmark) => landmark.id === "rotunda");
    const queenVictoriaPlinth = level.landmarks.find((landmark) => landmark.id === "queen-victoria-plinth");
    expect(rotundaSeat).toBeTruthy();
    expect(queenVictoriaSeat).toBeTruthy();
    expect(rotunda?.position).toBeTruthy();
    expect(queenVictoriaPlinth?.position).toBeTruthy();
    expect(dot2(benchFacingVector(rotundaSeat!.angle), normalizedDirection(rotundaSeat!.position, rotunda!.position!))).toBeGreaterThan(0.99);
    expect(dot2(benchFacingVector(queenVictoriaSeat!.angle), normalizedDirection(queenVictoriaSeat!.position, queenVictoriaPlinth!.position!))).toBeGreaterThan(0.99);
  });

  it("keeps park-life details sourceable and non-colliding", () => {
    const detailKinds = new Set(level.parkLifeDetails.map((detail) => detail.kind));
    for (const kind of [
      "dog-sign",
      "park-rule-sign",
      "picnic-blanket",
      "notice-board",
      "broken-bike",
      "training-cones",
      "dog-water-bowl",
      "picnic-cooler",
      "sports-bag",
      "chalk-mark",
      "cricket-nets",
      "heritage-gas-lamp",
      "heritage-bollards",
      "heritage-seat",
      "interpretive-sign",
      "chandler-fountain"
    ] as const) {
      expect(detailKinds.has(kind)).toBe(true);
    }
    expect(level.parkLifeDetails.length).toBeGreaterThanOrEqual(36);
    expect(level.parkLifeDetails.every((detail) => detail.source && pointInPolygon(detail.position, level.boundary))).toBe(true);
    const ruleSigns = level.parkLifeDetails.filter((detail) => detail.kind === "park-rule-sign");
    expect(ruleSigns.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ruleSigns.map((detail) => detail.rule))).toEqual(
      new Set(["dogs-on-leash", "alcohol-hours", "rotunda-stairs-no-power", "access-friendly"])
    );
    const brokenBikes = level.parkLifeDetails.filter((detail) => detail.kind === "broken-bike");
    expect(brokenBikes.length).toBeGreaterThanOrEqual(1);
    expect(brokenBikes.every((detail) => detail.bikeIssue === "flat-tyres" || detail.bikeIssue === "broken-chain" || detail.bikeIssue === "locked")).toBe(true);
    const heritageIds = new Set(level.parkLifeDetails.filter((detail) => detail.source?.includes("Edinburgh Gardens CMP 2004")).map((detail) => detail.id));
    for (const id of [
      "chandler-drinking-fountain",
      "rotunda-north-gas-lamp",
      "rotunda-east-gas-lamp",
      "rotunda-south-gas-lamp",
      "bowling-south-gas-lamp",
      "freeman-entrance-cast-iron-bollards",
      "rowe-street-cast-iron-bollards",
      "rotunda-reproduction-seat",
      "queen-victoria-reproduction-seat",
      "grandstand-interpretive-sign",
      "rotunda-interpretive-sign",
      "queen-victoria-interpretive-sign"
    ]) {
      expect(heritageIds.has(id)).toBe(true);
    }
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(level.parkLifeDetails.some((detail) => obstacleIds.has(detail.id))).toBe(false);
  });

  it("uses a fitted grandstand obstacle so nearby open lawn remains accessible", () => {
    const grandstand = level.obstacles.find((obstacle) => obstacle.id === "grandstand");
    expect(grandstand?.shape).toBe("box");
    if (grandstand?.shape !== "box") {
      throw new Error("Expected fitted grandstand box obstacle");
    }
    expect(grandstand.halfZ).toBeLessThan(5.8 * WORLD_SCALE);
    expect(grandstand.halfX).toBeGreaterThan(grandstand.halfZ * 3);
  });

  it("keeps collision intent aligned with real access", () => {
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(obstacleIds.has("tennis")).toBe(true);
    expect(obstacleIds.has("bowling")).toBe(true);
    expect(level.obstacles.find((obstacle) => obstacle.id === "tennis")?.shape).toBe("polygon");
    expect(level.obstacles.find((obstacle) => obstacle.id === "bowling")?.shape).toBe("polygon");
    expect(obstacleIds.has("south-playground")).toBe(true);
    expect(obstacleIds.has("north-playground")).toBe(true);
    expect(obstacleIds.has("skate")).toBe(false);
    expect(level.obstacles.find((obstacle) => obstacle.id === "south-playground")?.blocksSight).toBe(false);
    expect(level.obstacles.find((obstacle) => obstacle.id === "north-playground")?.blocksSight).toBe(false);
    expect(level.skateBowls.length).toBe(3);
    expect(level.terrainModifiers.filter((modifier) => modifier.kind === "skate-bowl").length).toBe(level.skateBowls.length);
    for (const fixture of level.interactables) {
      for (const obstacleId of fixture.bypassObstacleIds ?? []) {
        expect(obstacleIds.has(obstacleId)).toBe(true);
      }
    }
    const rotundaObstacle = level.obstacles.find((obstacle) => obstacle.id === "osm-building-543505640");
    expect(rotundaObstacle?.shape).toBe("polygon");
    expect(level.obstacles.some((obstacle) => obstacle.id === "rotunda-core")).toBe(false);
    expect(level.interactables.find((fixture) => fixture.id === "rotunda-deck")?.bypassObstacleIds).toContain("osm-building-543505640");
  });

  it("keeps all placed object families spatially coherent", () => {
    const obstacleIds = new Map(level.obstacles.map((obstacle) => [obstacle.id, obstacle]));

    for (const landmark of level.landmarks) {
      const anchor = landmark.position ?? (landmark.polygon ? polygonCentroid(landmark.polygon) : null);
      expect(anchor, `missing landmark anchor for ${landmark.id}`).toBeTruthy();
      expect(pointInPolygon(anchor!, level.boundary), `landmark ${landmark.id} outside boundary`).toBe(true);
    }

    for (const obstacle of level.obstacles) {
      const anchor = obstacle.shape === "polygon" ? polygonCentroid(obstacle.polygon) : obstacle.center;
      expect(pointInPolygon(anchor, level.boundary), `obstacle ${obstacle.id} outside boundary`).toBe(true);
    }
    for (const building of level.mappedBuildings) {
      expect(pointInPolygon(polygonCentroid(building.polygon), level.boundary), `mapped building ${building.id} outside boundary`).toBe(true);
      if (building.collision) {
        expect(obstacleIds.has(building.id), `colliding mapped building ${building.id} has no obstacle`).toBe(true);
      }
    }
    for (const fence of level.mappedFences) {
      expect(fence.points.some((point) => pointInPolygon(point, level.boundary)), `mapped fence ${fence.id} has no in-boundary point`).toBe(true);
    }
    const structuralLandmarkKinds = new Set(["bowls", "grandstand", "rotunda", "tennis", "toilets"]);
    const structuralPolygons = [
      ...level.mappedBuildings.map((building) => ({ id: building.id, polygon: building.polygon })),
      ...level.landmarks
        .filter((landmark) => landmark.polygon && structuralLandmarkKinds.has(landmark.kind))
        .map((landmark) => ({ id: landmark.id, polygon: landmark.polygon! }))
    ];
    const rotundaLandmark = level.landmarks.find((landmark) => landmark.id === "rotunda");

    for (const fixture of level.interactables) {
      expect(pointInPolygon(fixture.position, level.boundary), `interactable ${fixture.id} outside boundary`).toBe(true);
      for (const point of [fixture.accessPosition, fixture.landingPosition, fixture.exitPosition].filter(Boolean)) {
        expect(pointInPolygon(point!, level.boundary), `interactable ${fixture.id} has off-map access/landing point`).toBe(true);
      }
      if (fixture.accessPosition) {
        expect(distance(fixture.position, fixture.accessPosition), `interactable ${fixture.id} access point is detached from fixture`).toBeLessThan(fixture.radius + 8);
      }
      for (const obstacleId of fixture.bypassObstacleIds ?? []) {
        const obstacle = obstacleIds.get(obstacleId);
        expect(obstacle, `interactable ${fixture.id} bypasses missing obstacle ${obstacleId}`).toBeTruthy();
        if (fixture.accessKind === "ladder" || fixture.accessKind === "frame") {
          expect(distanceToObstacleBoundary(fixture.accessPosition ?? fixture.position, obstacle!), `${fixture.id} access is detached from ${obstacleId}`).toBeLessThan(1.8);
        }
      }
    }

    for (const amenity of level.amenities) {
      expect(pointInPolygon(amenity.position, level.boundary), `amenity ${amenity.id} outside boundary`).toBe(true);
    }
    for (const station of level.upgradeStations) {
      expect(pointInPolygon(station.position, level.boundary), `upgrade station ${station.id} outside boundary`).toBe(true);
    }
    for (const spawn of level.spawnPoints) {
      expect(pointInPolygon(spawn, level.boundary), "spawn point outside boundary").toBe(true);
    }
    for (const pickup of level.pickupPoints) {
      expect(pointInPolygon(pickup, level.boundary), "pickup point outside boundary").toBe(true);
    }
    for (const detail of level.parkLifeDetails) {
      expect(pointInPolygon(detail.position, level.boundary), `park-life detail ${detail.id} outside boundary`).toBe(true);
    }
    expect(pointInPolygon(level.rideableBike.position, level.boundary), `rideable bike ${level.rideableBike.id} outside boundary`).toBe(true);
    expect(distance(level.rideableBike.position, { x: 35, z: 42 }), "rideable bike should be hidden far from the start").toBeGreaterThan(220);
    for (const patch of level.pathSurfacePatches) {
      expect(pointInPolygon(patch.position, level.boundary), `path surface patch ${patch.id} outside boundary`).toBe(true);
    }
    for (const tree of level.trees) {
      expect(pointInPolygon(tree.position, level.boundary), `tree ${tree.id} outside boundary`).toBe(true);
      for (const zone of structuralPolygons) {
        expect(pointInPolygon(tree.position, zone.polygon), `tree ${tree.id} is inside structural footprint ${zone.id}`).toBe(false);
      }
      if (rotundaLandmark?.position && rotundaLandmark.radius) {
        expect(distance(tree.position, rotundaLandmark.position), `tree ${tree.id} is inside the rotunda footprint`).toBeGreaterThan(rotundaLandmark.radius);
      }
    }
    for (const tree of level.treeColliders) {
      expect(pointInPolygon(tree.position, level.boundary), `tree collider ${tree.id} outside boundary`).toBe(true);
      expect(obstacleIds.has(tree.id), `tree collider ${tree.id} has no matching obstacle`).toBe(true);
    }
    for (const fixture of level.sportsFixtures) {
      expect(pointInPolygon(fixture.position, level.boundary), `sports fixture ${fixture.id} outside boundary`).toBe(true);
    }
    for (const line of level.hardscapeLines) {
      expect(line.points.some((point) => pointInPolygon(point, level.boundary)), `hardscape line ${line.id} has no in-boundary point`).toBe(true);
    }
  });

  it("keeps point-placed objects out of unrelated blockers and structural footprints", () => {
    const structuralLandmarkKinds = new Set(["bowls", "grandstand", "rotunda", "tennis", "toilets"]);
    const structuralZones = [
      ...level.mappedBuildings.map((building) => ({ id: building.id, polygon: building.polygon })),
      ...level.landmarks
        .filter((landmark) => landmark.polygon && structuralLandmarkKinds.has(landmark.kind))
        .map((landmark) => ({ id: landmark.id, polygon: landmark.polygon! }))
    ];
    const bypassByFixture = new Map(level.interactables.map((fixture) => [fixture.id, new Set(fixture.bypassObstacleIds ?? [])]));
    const allowedById = new Map<string, Set<string>>();
    const allow = (id: string, ...allowedIds: string[]) => {
      allowedById.set(id, new Set(allowedIds));
    };

    allow("rotunda-armory", "osm-building-543505640", "rotunda");
    allow("rotunda-carbine", "osm-building-543505640", "rotunda");
    allow("grandstand-shotgun", "grandstand");
    allow("tennis-smg", "tennis", "osm-building-403753784");
    allow("tennis-locker", "tennis", "osm-building-403753784");
    allow("tennis-synthetic-court-rolls", "tennis");
    allow("brunswick-removed-tree-stump-5", "tennis");
    allow("osm-6280110915", "skate");
    allow("osm-8464870016", "skate");
    allow("skate-chalk-mark", "skate");

    const placementErrors: string[] = [];
    const assertClear = (label: string, point: { x: number; z: number }, allowedIds = new Set<string>()) => {
      const obstacleOffenders = level.obstacles
        .filter((obstacle) => !allowedIds.has(obstacle.id))
        .filter((obstacle) => pointInsideObstacle(point, obstacle, 0.05))
        .map((obstacle) => obstacle.id);
      if (obstacleOffenders.length > 0) {
        placementErrors.push(`${label} is inside unrelated blocker(s): ${obstacleOffenders.join(", ")}`);
      }

      const structuralOffenders = structuralZones
        .filter((zone) => !allowedIds.has(zone.id))
        .filter((zone) => pointInPolygon(point, zone.polygon))
        .map((zone) => zone.id);
      if (structuralOffenders.length > 0) {
        placementErrors.push(`${label} is inside unrelated structural footprint(s): ${structuralOffenders.join(", ")}`);
      }
    };

    level.spawnPoints.forEach((point, index) => assertClear(`spawn point ${index + 1}`, point));
    level.pickupPoints.forEach((point, index) => assertClear(`pickup point ${index + 1}`, point));
    level.amenities.forEach((amenity) => assertClear(`amenity ${amenity.id}`, amenity.position, allowedById.get(amenity.id)));
    level.parkLifeDetails.forEach((detail) => assertClear(`park-life detail ${detail.id}`, detail.position, allowedById.get(detail.id)));
    assertClear(`rideable bike ${level.rideableBike.id}`, level.rideableBike.position);
    level.upgradeStations.forEach((station) => assertClear(`upgrade station ${station.id}`, station.position, allowedById.get(station.id)));
    level.weaponSpawns.forEach((spawn) => assertClear(`weapon spawn ${spawn.id}`, spawn.position, allowedById.get(spawn.id)));

    level.sportsFixtures.forEach((fixture) => {
      const allowedIds = fixture.kind === "basketball-hoop" ? new Set([`${fixture.id}-post`]) : new Set(footballPostLocalOffsets(fixture.width).map((_, index) => `${fixture.id}-post-${index + 1}`));
      for (const allowedId of allowedById.get(fixture.id) ?? []) {
        allowedIds.add(allowedId);
      }
      assertClear(`sports fixture ${fixture.id}`, fixture.position, allowedIds);
    });

    level.interactables.forEach((fixture) => {
      const allowedIds = new Set([...(bypassByFixture.get(fixture.id) ?? []), ...(allowedById.get(fixture.id) ?? [])]);
      assertClear(`interactable ${fixture.id}`, fixture.position, allowedIds);
      if (fixture.accessPosition) {
        const accessAllowed = fixture.accessKind === "frame" ? allowedIds : new Set<string>();
        assertClear(`interactable ${fixture.id} access`, fixture.accessPosition, accessAllowed);
      }
      if (fixture.landingPosition) {
        assertClear(`interactable ${fixture.id} landing`, fixture.landingPosition, allowedIds);
      }
      if (fixture.exitPosition) {
        const exitAllowed = fixture.accessKind === "frame" ? allowedIds : new Set<string>();
        assertClear(`interactable ${fixture.id} exit`, fixture.exitPosition, exitAllowed);
      }
    });

    level.treeColliders.forEach((tree) => {
      assertClear(`tree collider ${tree.id}`, tree.position, new Set([tree.id]));
    });

    expect(placementErrors).toEqual([]);
  });

  it("clamps external points back into the park", () => {
    const outside = geoToWorld({ lat: -37.7925, lon: 144.9869 });
    expect(pointInPolygon(outside, level.boundary)).toBe(false);
    const clamped = clampToPolygon(outside, level.boundary, 4);
    expect(pointInPolygon(clamped, level.boundary)).toBe(true);
  });
});
