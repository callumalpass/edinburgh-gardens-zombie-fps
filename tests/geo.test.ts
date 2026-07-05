import { describe, expect, it } from "vitest";
import { clampToPolygon, distance, geoToWorld, pointInPolygon, polygonArea, polygonCentroid, WORLD_SCALE } from "../src/game/geo";
import { createLevelData, PARK_BOUNDARY_GEO } from "../src/game/levelData";
import {
  AUSTRALIAN_RULES_FULL_GOAL_WIDTH_METRES,
  BASKETBALL_BACKBOARD_WIDTH_METRES,
  BASKETBALL_RIM_HEIGHT_METRES,
  footballPostLocalOffsets
} from "../src/game/sportsFixtures";
import type { MappedBuilding } from "../src/game/types";

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
    expect(level.treePoints.length).toBeGreaterThanOrEqual(126);
    expect(level.treeLines.length).toBeGreaterThanOrEqual(5);
    expect(level.significantTrees.length).toBeGreaterThanOrEqual(19);
    expect(level.trees.length).toBeGreaterThanOrEqual(145);
    expect(level.trees.length).toBe(level.treeColliders.length);
    expect(level.treePoints.filter((tree) => pointInPolygon(tree, level.boundary)).length).toBe(level.treePoints.length);
    expect(level.significantTrees.filter((tree) => pointInPolygon(tree.position, level.boundary)).length).toBe(level.significantTrees.length);
    expect(level.trees.filter((tree) => pointInPolygon(tree.position, level.boundary)).length).toBe(level.trees.length);
    const profiles = new Set(level.trees.map((tree) => tree.profile));
    for (const profile of ["elm", "oak", "gum", "generic"] as const) {
      expect(profiles.has(profile)).toBe(true);
    }
    expect(level.trees.some((tree) => tree.source?.includes("Yarra significant trees") && tree.height && tree.dbh)).toBe(true);
    expect(level.trees.some((tree) => tree.source?.includes("OpenStreetMap") && tree.profile === "elm")).toBe(true);
    expect(level.trees.some((tree) => tree.source?.includes("tree avenue") && tree.profile === "elm")).toBe(true);
  });

  it("derives solid trunk colliders from mapped and researched trees", () => {
    const level = createLevelData();
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    expect(level.treeColliders.length).toBeGreaterThanOrEqual(145);
    expect(level.treeColliders.every((tree) => pointInPolygon(tree.position, level.boundary))).toBe(true);
    expect(level.treeColliders.every((tree) => tree.radius >= 0.34 && tree.radius <= 1.05)).toBe(true);
    expect(level.treeColliders.some((tree) => tree.source?.includes("Yarra significant trees"))).toBe(true);
    expect(level.treeColliders.some((tree) => tree.source?.includes("OpenStreetMap"))).toBe(true);
    expect(level.treeColliders.some((tree) => tree.source?.includes("tree avenue"))).toBe(true);

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

  it("includes OSM-mapped building and fence footprints", () => {
    const level = createLevelData();
    const buildingIds = new Set(level.mappedBuildings.map((building) => building.id));
    const profiles = new Set(level.mappedBuildings.map((building) => building.detailProfile).filter(Boolean));
    expect(level.mappedBuildings.length).toBeGreaterThanOrEqual(12);
    expect(buildingIds.has("osm-building-543505702")).toBe(true);
    expect(buildingIds.has("osm-building-242003562")).toBe(true);
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
    expect(rotunda?.accessPosition).toBeTruthy();
    expect(rotunda?.exitPosition).toEqual(rotunda?.accessPosition);
    expect(rotunda?.prompt).toContain("stairs");
    expect(rotunda?.height).toBeGreaterThan(1.5);
    expect(rotunda?.height).toBeLessThan(2.4);
    expect(distance(rotunda!.position, rotunda!.accessPosition!)).toBeGreaterThan(6);
    expect(pointInPolygon(rotunda!.accessPosition!, level.boundary)).toBe(true);

    const grandstand = level.interactables.find((fixture) => fixture.id === "grandstand-seats");
    expect(grandstand?.accessPosition).toBeTruthy();
    expect(grandstand?.prompt).toContain("stairs");
    expect(distance(grandstand!.position, grandstand!.accessPosition!)).toBeGreaterThan(5);

    const roofFixtures = level.interactables.filter((fixture) => fixture.kind === "toilets" && fixture.id.endsWith("-roof"));
    expect(roofFixtures.length).toBeGreaterThanOrEqual(2);
    expect(roofFixtures.every((fixture) => fixture.accessPosition && fixture.prompt.includes("ladder"))).toBe(true);
  });

  it("uses a richer OSM-derived path and amenity network", () => {
    const level = createLevelData();
    const pathIds = new Set(level.paths.map((path) => path.id));
    expect(level.paths.length).toBeGreaterThan(30);
    expect(level.paths.filter((path) => path.kind === "rail").length).toBeGreaterThanOrEqual(2);
    expect(level.paths.filter((path) => path.kind === "service").length).toBeGreaterThanOrEqual(1);
    expect(pathIds.has("rotunda-approach-loop")).toBe(true);
    expect(pathIds.has("osm-plinth-garden-loop")).toBe(true);
    expect(pathIds.has("osm-22760904-plinth-west-connector")).toBe(true);
    expect(pathIds.has("osm-22760905-plinth-east-connector")).toBe(true);
    expect(pathIds.has("osm-75488632-rail-trail-central-cross-link")).toBe(true);
    expect(pathIds.has("osm-210387722-bowling-service-track")).toBe(true);
    expect(pathIds.has("osm-rotunda-loop")).toBe(false);
    expect(level.paths.filter((path) => path.source?.startsWith("OpenStreetMap way")).length).toBeGreaterThanOrEqual(9);
    expect(level.amenities.length).toBeGreaterThan(40);
    expect(level.amenities.filter((amenity) => amenity.kind === "drinking_water").length).toBeGreaterThanOrEqual(3);
    expect(level.amenities.filter((amenity) => amenity.kind === "picnic_table").length).toBeGreaterThanOrEqual(4);
    expect(level.amenities.filter((amenity) => amenity.kind === "table_tennis").length).toBeGreaterThanOrEqual(1);
    expect(level.amenities.filter((amenity) => pointInPolygon(amenity.position, level.boundary)).length).toBe(level.amenities.length);
  });

  it("models open lawns and park feature precincts as accessible landmarks", () => {
    const level = createLevelData();
    const landmarkIds = new Set(level.landmarks.map((landmark) => landmark.id));
    for (const id of ["north-open-lawn", "north-activity-precinct", "alfred-crescent-open-lawn", "south-picnic-lawn"]) {
      expect(landmarkIds.has(id)).toBe(true);
    }

    const gardenLandmarks = level.landmarks.filter((landmark) => landmark.kind === "garden" && landmark.id !== "park");
    expect(gardenLandmarks.length).toBeGreaterThanOrEqual(4);
    for (const landmark of gardenLandmarks) {
      expect(landmark.polygon).toBeDefined();
      if (!landmark.polygon) {
        throw new Error(`Missing polygon for ${landmark.id}`);
      }
      expect(pointInPolygon(polygonCentroid(landmark.polygon), level.boundary)).toBe(true);
    }
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
    for (const kind of ["dog-sign", "picnic-blanket", "notice-board", "casual-bike", "training-cones"] as const) {
      expect(detailKinds.has(kind)).toBe(true);
    }
    expect(level.parkLifeDetails.length).toBeGreaterThanOrEqual(9);
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
    expect(obstacleIds.has("south-playground")).toBe(false);
    expect(obstacleIds.has("north-playground")).toBe(false);
    expect(obstacleIds.has("skate")).toBe(false);
    const rotundaCore = level.obstacles.find((obstacle) => obstacle.id === "rotunda-core");
    expect(rotundaCore?.shape ?? "circle").toBe("circle");
    if (rotundaCore?.shape === "box" || rotundaCore?.shape === "polygon") {
      throw new Error("Expected small circular rotunda core");
    }
    expect(rotundaCore?.radius).toBeLessThan(2);
  });

  it("clamps external points back into the park", () => {
    const level = createLevelData();
    const outside = geoToWorld({ lat: -37.7925, lon: 144.9869 });
    expect(pointInPolygon(outside, level.boundary)).toBe(false);
    const clamped = clampToPolygon(outside, level.boundary, 4);
    expect(pointInPolygon(clamped, level.boundary)).toBe(true);
  });
});
