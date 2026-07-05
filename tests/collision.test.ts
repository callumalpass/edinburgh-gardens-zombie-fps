import { describe, expect, it } from "vitest";
import { resolveObstacle, shouldBypassObstacle } from "../src/game/collision";
import { distance } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";
import type { BoxObstacle } from "../src/game/types";

describe("collision system", () => {
  it("pushes points out of expanded box obstacles", () => {
    const obstacle: BoxObstacle = {
      id: "box",
      label: "Box",
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
