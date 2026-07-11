import { describe, expect, it } from "vitest";
import { CONTEXT_WORLD_DATA } from "../src/game/contextData.generated";
import { pointInPolygon } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";

describe("outside-park context evidence", () => {
  it("keeps one complete auditable record for every rendered building", () => {
    const buildings = CONTEXT_WORLD_DATA.buildings;
    expect(buildings).toHaveLength(448);
    expect(new Set(buildings.map((building) => building.id)).size).toBe(buildings.length);
    expect(new Set(buildings.map((building) => building.osmWayId)).size).toBe(buildings.length);

    for (const building of buildings) {
      expect(building.polygon.length).toBeGreaterThanOrEqual(3);
      expect(building.polygon.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
      expect(building.distanceToPark).toBeGreaterThan(0);
      expect(building.distanceToPark).toBeLessThanOrEqual(CONTEXT_WORLD_DATA.beltDistanceMetres);
      expect(building.height).toBeGreaterThan(2);
      expect(building.height).toBeLessThan(20);
      expect(building.storeys).toBeGreaterThanOrEqual(1);
      expect(building.heightBasis.length).toBeGreaterThan(20);
      expect(building.source).toContain(`OpenStreetMap way ${building.osmWayId}`);
      expect(building.source).toContain("Vicmap Basemap aerial");
      expect(building.source).toContain("City of Yarra HO327");
      expect(building.uncertainty.length).toBeGreaterThan(60);
    }
  });

  it("keeps the context outside the playable park and out of gameplay registries", () => {
    const level = createLevelData();
    for (const building of CONTEXT_WORLD_DATA.buildings) {
      expect(pointInPolygon(building.center, level.boundary), building.id).toBe(false);
    }

    const gameplayData = JSON.stringify({
      obstacles: level.obstacles,
      interactables: level.interactables,
      mappedBuildings: level.mappedBuildings,
      sportsFixtures: level.sportsFixtures,
      spawnPoints: level.spawnPoints
    });
    expect(gameplayData).not.toContain("context-building-");
    expect(gameplayData).not.toContain("context-road-");
    expect(gameplayData).not.toContain("context-tree-");
  });

  it("retains the researched evidence tiers, landmark cues and support layers", () => {
    const evidenceCounts = Object.fromEntries(
      ["feature-specific", "footprint-address-aerial", "footprint-aerial"].map((tier) => [
        tier,
        CONTEXT_WORLD_DATA.buildings.filter((building) => building.evidenceTier === tier).length
      ])
    );
    expect(evidenceCounts).toEqual({
      "feature-specific": 13,
      "footprint-address-aerial": 238,
      "footprint-aerial": 197
    });
    expect(CONTEXT_WORLD_DATA.buildings.filter((building) => building.address).length).toBe(389);

    const library = CONTEXT_WORLD_DATA.buildings.find((building) => building.osmWayId === "484321207");
    expect(library).toMatchObject({ facadeProfile: "modern-civic", storeys: 3, roofShape: "flat" });
    expect(library?.featureSources?.length).toBeGreaterThanOrEqual(2);
    expect(library?.featureCues).toContain("rooftop garden");

    const stLukes = CONTEXT_WORLD_DATA.buildings.find((building) => building.osmWayId === "1475006788");
    expect(stLukes).toMatchObject({ facadeProfile: "church", roofShape: "gable" });
    expect(stLukes?.featureCues?.join(" ")).toContain("Crouch & Wilson");

    expect(CONTEXT_WORLD_DATA.roads.length).toBeGreaterThan(400);
    expect(CONTEXT_WORLD_DATA.roads.filter((road) => road.kind === "tram")).toHaveLength(4);
    expect(CONTEXT_WORLD_DATA.roads.filter((road) => road.kind === "tram").every((road) => road.width < 0.2)).toBe(true);
    expect(CONTEXT_WORLD_DATA.trees).toHaveLength(1_048);
    expect(CONTEXT_WORLD_DATA.elevationSamples).toHaveLength(735);
    const altitudes = CONTEXT_WORLD_DATA.elevationSamples.map((sample) => sample.altitude);
    expect(Math.min(...altitudes)).toBe(25);
    expect(Math.max(...altitudes)).toBe(37);
  });
});
