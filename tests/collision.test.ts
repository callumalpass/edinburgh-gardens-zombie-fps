import { describe, expect, it } from "vitest";
import { resolveObstacle, shouldBypassObstacle } from "../src/game/collision";
import { distance, polygonCentroid } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";
import type { BoxObstacle } from "../src/game/types";

describe("collision system", () => {
  it("pushes points out of expanded box obstacles", () => {
    const obstacle: BoxObstacle = {
      id: "box",
      label: "Box",
      sourceObjectId: "box",
      sourceObjectKind: "landmark",
      shape: "box",
      center: { x: 0, z: 0 },
      halfX: 2,
      halfZ: 3,
      angle: 0
    };

    const resolved = resolveObstacle({ x: 0.5, z: 0.5 }, 1, obstacle);
    expect(Math.abs(resolved.x) === 3 || Math.abs(resolved.z) === 4).toBe(true);
  });

  it("uses fixture metadata to bypass active obstacles", () => {
    const level = createLevelData();
    const fixture = level.interactables.find((candidate) => candidate.id === "rotunda-deck");
    expect(fixture?.bypassObstacleIds).toContain("osm-building-543505640");

    expect(
      shouldBypassObstacle("osm-building-543505640", fixture!.position, {
        activeFixtureId: fixture!.id,
        interactables: level.interactables
      })
    ).toBe(true);
    expect(
      shouldBypassObstacle("grandstand", fixture!.position, {
        activeFixtureId: fixture!.id,
        interactables: level.interactables
      })
    ).toBe(false);
  });

  it("keeps fixture bypass ids tied to actual obstacles", () => {
    const level = createLevelData();
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    const missing = level.interactables.flatMap((fixture) =>
      (fixture.bypassObstacleIds ?? [])
        .filter((obstacleId) => !obstacleIds.has(obstacleId))
        .map((obstacleId) => `${fixture.id}:${obstacleId}`)
    );

    expect(missing).toEqual([]);
  });

  it("keeps collision obstacles tied to actual source objects", () => {
    const level = createLevelData();
    const landmarks = new Set(level.landmarks.map((source) => source.id));
    const mappedBuildings = new Set(level.mappedBuildings.map((source) => source.id));
    const sportsFixtures = new Set(level.sportsFixtures.map((source) => source.id));
    const treeColliders = new Set(level.treeColliders.map((source) => source.id));
    const fixtureIds = new Set(level.interactables.map((fixture) => fixture.id));
    const missingSources = level.obstacles
      .filter((obstacle) => {
        if (obstacle.sourceObjectKind === "landmark") return !landmarks.has(obstacle.sourceObjectId);
        if (obstacle.sourceObjectKind === "mapped-building") return !mappedBuildings.has(obstacle.sourceObjectId);
        if (obstacle.sourceObjectKind === "sports-fixture") return !sportsFixtures.has(obstacle.sourceObjectId);
        return !treeColliders.has(obstacle.sourceObjectId);
      })
      .map((obstacle) => `${obstacle.id}:${obstacle.sourceObjectKind}:${obstacle.sourceObjectId}`);
    const missingGapFixtures = level.obstacles
      .filter((obstacle) => obstacle.shape === "box")
      .flatMap((obstacle) =>
        (obstacle.accessGaps ?? [])
          .filter((gap) => gap.fixtureId && !fixtureIds.has(gap.fixtureId))
          .map((gap) => `${obstacle.id}:${gap.id}:${gap.fixtureId}`)
      );

    expect(missingSources).toEqual([]);
    expect(missingGapFixtures).toEqual([]);
  });

  it("places grandstand stair access on the oval-facing side of the blocker", () => {
    const level = createLevelData();
    const fixture = level.interactables.find((candidate) => candidate.id === "grandstand-seats");
    const blocker = level.obstacles.find((candidate) => candidate.id === "grandstand");
    const oval = level.landmarks.find((candidate) => candidate.id === "oval");
    if (!fixture?.accessPosition || !fixture.landingPosition || !blocker || blocker.shape !== "box" || !oval?.polygon) {
      throw new Error("Missing grandstand fixture, blocker, or oval geometry");
    }

    const ovalCenter = polygonCentroid(oval.polygon);
    expect(blocker.sourceObjectId).toBe("grandstand");
    expect(blocker.sourceObjectKind).toBe("landmark");
    expect(blocker.accessGaps?.some((gap) => gap.fixtureId === fixture.id)).toBe(true);
    expect(distance(fixture.accessPosition, ovalCenter)).toBeLessThan(distance(blocker.center, ovalCenter));
    expect(distance(resolveObstacle(fixture.accessPosition, 0.48, blocker), fixture.accessPosition)).toBeLessThan(0.001);
    expect(distance(resolveObstacle(fixture.landingPosition, 0.48, blocker), fixture.landingPosition)).toBeLessThan(0.001);
    const sideDoor = { x: blocker.center.x + Math.cos(blocker.angle) * (blocker.halfX * 0.82), z: blocker.center.z + Math.sin(blocker.angle) * (blocker.halfX * 0.82) };
    expect(distance(resolveObstacle(sideDoor, 0.48, blocker), sideDoor)).toBeGreaterThan(0.1);
    expect(
      shouldBypassObstacle("grandstand", fixture.landingPosition, {
        activeFixtureId: fixture.id,
        interactables: level.interactables
      })
    ).toBe(true);
  });

  it("pushes the player out of solid tree trunk obstacles", () => {
    const level = createLevelData();
    const tree = level.treeColliders[0];
    const obstacle = level.obstacles.find((candidate) => candidate.id === tree.id);
    if (!obstacle || obstacle.shape === "box" || obstacle.shape === "polygon") {
      throw new Error("Expected a circular tree obstacle");
    }

    const playerRadius = 0.48;
    const resolved = resolveObstacle(tree.position, playerRadius, obstacle);
    expect(distance(resolved, tree.position)).toBeGreaterThanOrEqual(tree.radius + playerRadius - 0.001);
  });
});
