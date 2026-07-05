import { describe, expect, it } from "vitest";
import { clampToPolygon, distance, distanceToSegment, geoToWorld, pointInPolygon, polygonArea, polygonCentroid, WORLD_SCALE } from "../src/game/geo";
import { createLevelData, PARK_BOUNDARY_GEO } from "../src/game/levelData";
import {
  AUSTRALIAN_RULES_FULL_GOAL_WIDTH_METRES,
  BASKETBALL_BACKBOARD_WIDTH_METRES,
  BASKETBALL_RIM_HEIGHT_METRES,
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

describe("map geometry", () => {
  it("converts the OSM boundary into a playable non-degenerate park polygon", () => {
    const level = createLevelData();
    expect(PARK_BOUNDARY_GEO.length).toBeGreaterThan(40);
    expect(Math.abs(polygonArea(level.boundary))).toBeGreaterThan(10_000);
    expect(pointInPolygon(polygonCentroid(level.boundary), level.boundary)).toBe(true);
  });

  it("places key features inside the Edinburgh Gardens boundary", () => {
    const level = createLevelData();
    for (const station of level.upgradeStations) {
      expect(pointInPolygon(station.position, level.boundary)).toBe(true);
    }
    for (const spawn of level.spawnPoints) {
      expect(pointInPolygon(spawn, level.boundary)).toBe(true);
    }
  });

  it("uses mapped tree points inside the park for more accurate placement", () => {
    const level = createLevelData();
    expect(level.treePoints.length).toBeGreaterThanOrEqual(340);
    expect(level.treeLines.length).toBeGreaterThanOrEqual(5);
    expect(level.significantTrees.length).toBe(19);
    expect(level.trees.length).toBeGreaterThanOrEqual(365);
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
    expect(plinthTrees.length).toBeGreaterThanOrEqual(45);
    expect(plinthTrees.filter((tree) => tree.source?.includes("Vicmap Vegetation Tree Urban")).length).toBeGreaterThanOrEqual(40);
    for (const removedNodeId of [5365392008, 5365392009, 5365392010, 5365392011, 5365393282, 5365393283, 5365393284]) {
      expect(level.trees.some((tree) => tree.id === `osm-tree-${removedNodeId}`)).toBe(false);
    }
  });

  it("derives solid trunk colliders from mapped and researched trees", () => {
    const level = createLevelData();
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(level.treeColliders.length).toBe(level.trees.length);
    expect(level.treeColliders.length).toBeGreaterThanOrEqual(365);
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
    const level = createLevelData();
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
  });

  it("keeps the real-map scale expanded but close to measured metres", () => {
    expect(WORLD_SCALE).toBeGreaterThan(1);
    expect(WORLD_SCALE).toBeLessThan(1.35);
  });

  it("includes Vicmap-derived elevation samples for broad terrain", () => {
    const level = createLevelData();
    expect(level.elevationSamples.length).toBeGreaterThanOrEqual(90);
    expect(level.elevationMin).toBeGreaterThanOrEqual(26);
    expect(level.elevationMax).toBeLessThanOrEqual(33);
    expect(level.elevationMax - level.elevationMin).toBeGreaterThan(4);
    expect(level.elevationSamples.some((sample) => sample.source === "vicmap-spot")).toBe(true);
    expect(level.elevationSamples.filter((sample) => pointInPolygon(sample.position, level.boundary)).length).toBe(level.elevationSamples.length);
  });

  it("adds sourceable micro-terrain modifiers over broad elevation", () => {
    const level = createLevelData();
    const modifierKinds = new Set(level.terrainModifiers.map((modifier) => modifier.kind));
    for (const kind of ["path-crown", "path-shoulder", "tree-root", "drainage-swale", "oval-banking"] as const) {
      expect(modifierKinds.has(kind)).toBe(true);
    }
    expect(level.terrainModifiers.length).toBeGreaterThan(level.trees.length);
    expect(level.terrainModifiers.every((modifier) => modifier.source && modifier.delta !== 0)).toBe(true);
    expect(level.terrainModifiers.filter((modifier) => modifier.kind === "tree-root").length).toBe(level.trees.length);
  });

  it("samples local micro-relief without replacing Vicmap broad slope", () => {
    const level = createLevelData();
    const sampler = new TerrainSampler(level);
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

  it("includes OSM-mapped building and fence footprints", () => {
    const level = createLevelData();
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
    expect(level.mappedFences.length).toBeGreaterThanOrEqual(1);
    expect(level.mappedBuildings.filter((building) => pointInPolygon(polygonCentroid(building.polygon), level.boundary)).length).toBe(level.mappedBuildings.length);
  });

  it("includes researched hardscape edge and drain features", () => {
    const level = createLevelData();
    const hardscapeIds = new Set(level.hardscapeLines.map((line) => line.id));
    expect(level.hardscapeLines.length).toBeGreaterThanOrEqual(4);
    expect(hardscapeIds.has("hardscape-elm-avenue-basalt-edging")).toBe(true);
    expect(hardscapeIds.has("hardscape-oval-east-bluestone-drain")).toBe(true);
    expect(hardscapeIds.has("hardscape-alfred-crescent-retaining-wall")).toBe(true);
    expect(level.hardscapeLines.every((line) => line.source?.includes("CMP"))).toBe(true);
    expect(level.hardscapeLines.filter((line) => line.points.some((point) => pointInPolygon(point, level.boundary))).length).toBe(level.hardscapeLines.length);
  });

  it("adds sourceable path material transition patches without collision", () => {
    const level = createLevelData();
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
    const level = createLevelData();
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
    const level = createLevelData();
    const landmarkIds = new Set(level.landmarks.map((landmark) => landmark.id));
    expect(landmarkIds.has("queen-victoria-plinth")).toBe(true);
    expect(landmarkIds.has("sportsmans-war-memorial")).toBe(true);
    expect(landmarkIds.has("cook-memorial-site")).toBe(true);
  });

  it("uses realistic access points for climbable building fixtures", () => {
    const level = createLevelData();
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

  it("uses a richer OSM-derived path and amenity network", () => {
    const level = createLevelData();
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

  it("models open lawns and park feature precincts as accessible landmarks", () => {
    const level = createLevelData();
    const landmarkIds = new Set(level.landmarks.map((landmark) => landmark.id));
    for (const id of ["north-open-lawn", "north-activity-precinct", "alfred-crescent-open-lawn", "south-picnic-lawn", "raingarden-reservoir"]) {
      expect(landmarkIds.has(id)).toBe(true);
    }

    const gardenLandmarks = level.landmarks.filter((landmark) => landmark.kind === "garden" && landmark.id !== "park");
    expect(gardenLandmarks.length).toBeGreaterThanOrEqual(5);
    for (const landmark of gardenLandmarks) {
      expect(landmark.polygon).toBeDefined();
      if (!landmark.polygon) {
        throw new Error(`Missing polygon for ${landmark.id}`);
      }
      expect(pointInPolygon(polygonCentroid(landmark.polygon), level.boundary)).toBe(true);
    }

    const skate = level.landmarks.find((landmark) => landmark.id === "skate");
    const raingarden = level.landmarks.find((landmark) => landmark.id === "raingarden-reservoir");
    expect(skate?.polygon).toBeDefined();
    expect(raingarden?.polygon).toBeDefined();
    const skateCenter = polygonCentroid(skate!.polygon!);
    const raingardenCenter = polygonCentroid(raingarden!.polygon!);
    expect(raingardenCenter.z).toBeGreaterThan(skateCenter.z);
    expect(distance(raingardenCenter, skateCenter)).toBeLessThan(160);
  });

  it("keeps small park furniture interactive without adding collision blockers", () => {
    const level = createLevelData();
    const amenityIds = new Set(level.amenities.map((amenity) => amenity.id));
    for (const id of ["north-table-tennis", "north-bbq-picnic-table-1", "south-picnic-table-1"]) {
      expect(amenityIds.has(id)).toBe(true);
    }

    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(obstacleIds.has("north-activity-precinct")).toBe(false);
    expect(obstacleIds.has("south-picnic-lawn")).toBe(false);
    expect(obstacleIds.has("north-table-tennis")).toBe(false);
  });

  it("keeps park-life details sourceable and non-colliding", () => {
    const level = createLevelData();
    const detailKinds = new Set(level.parkLifeDetails.map((detail) => detail.kind));
    for (const kind of ["dog-sign", "picnic-blanket", "notice-board", "casual-bike", "training-cones", "dog-water-bowl", "picnic-cooler", "sports-bag", "chalk-mark", "cricket-nets"] as const) {
      expect(detailKinds.has(kind)).toBe(true);
    }
    expect(level.parkLifeDetails.length).toBeGreaterThanOrEqual(18);
    expect(level.parkLifeDetails.every((detail) => detail.source && pointInPolygon(detail.position, level.boundary))).toBe(true);
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(level.parkLifeDetails.some((detail) => obstacleIds.has(detail.id))).toBe(false);
  });

  it("uses a fitted grandstand obstacle so nearby open lawn remains accessible", () => {
    const level = createLevelData();
    const grandstand = level.obstacles.find((obstacle) => obstacle.id === "grandstand");
    expect(grandstand?.shape).toBe("box");
    if (grandstand?.shape !== "box") {
      throw new Error("Expected fitted grandstand box obstacle");
    }
    expect(grandstand.halfZ).toBeLessThan(5.8 * WORLD_SCALE);
    expect(grandstand.halfX).toBeGreaterThan(grandstand.halfZ * 3);
  });

  it("keeps collision intent aligned with real access", () => {
    const level = createLevelData();
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(obstacleIds.has("tennis")).toBe(true);
    expect(obstacleIds.has("bowling")).toBe(true);
    expect(level.obstacles.find((obstacle) => obstacle.id === "tennis")?.shape).toBe("polygon");
    expect(level.obstacles.find((obstacle) => obstacle.id === "bowling")?.shape).toBe("polygon");
    expect(obstacleIds.has("south-playground")).toBe(true);
    expect(obstacleIds.has("north-playground")).toBe(true);
    expect(obstacleIds.has("skate")).toBe(true);
    expect(level.obstacles.find((obstacle) => obstacle.id === "south-playground")?.blocksSight).toBe(false);
    expect(level.obstacles.find((obstacle) => obstacle.id === "north-playground")?.blocksSight).toBe(false);
    expect(level.obstacles.find((obstacle) => obstacle.id === "skate")?.blocksSight).toBe(false);
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
    const level = createLevelData();
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
    const structuralLandmarkKinds = new Set(["basketball", "bowls", "court", "grandstand", "playground", "rotunda", "skate", "tennis", "toilets"]);
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

  it("clamps external points back into the park", () => {
    const level = createLevelData();
    const outside = geoToWorld({ lat: -37.7925, lon: 144.9869 });
    expect(pointInPolygon(outside, level.boundary)).toBe(false);
    const clamped = clampToPolygon(outside, level.boundary, 4);
    expect(pointInPolygon(clamped, level.boundary)).toBe(true);
  });
});
