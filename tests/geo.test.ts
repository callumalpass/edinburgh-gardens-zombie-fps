import { describe, expect, it } from "vitest";
import { clampToPolygon, geoToWorld, pointInPolygon, polygonArea, polygonCentroid, WORLD_SCALE } from "../src/game/geo";
import { createLevelData, PARK_BOUNDARY_GEO } from "../src/game/levelData";

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
    expect(level.treePoints.filter((tree) => pointInPolygon(tree, level.boundary)).length).toBe(level.treePoints.length);
    expect(level.significantTrees.filter((tree) => pointInPolygon(tree.position, level.boundary)).length).toBe(level.significantTrees.length);
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
    expect(level.mappedBuildings.length).toBeGreaterThanOrEqual(12);
    expect(buildingIds.has("osm-building-543505702")).toBe(true);
    expect(buildingIds.has("osm-building-242003562")).toBe(true);
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

  it("includes the major memorial and plinth landmarks", () => {
    const level = createLevelData();
    const landmarkIds = new Set(level.landmarks.map((landmark) => landmark.id));
    expect(landmarkIds.has("queen-victoria-plinth")).toBe(true);
    expect(landmarkIds.has("sportsmans-war-memorial")).toBe(true);
    expect(landmarkIds.has("cook-memorial-site")).toBe(true);
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
