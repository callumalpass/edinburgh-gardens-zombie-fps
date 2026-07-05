import { describe, expect, it } from "vitest";
import { computeObstacleCoverRadius, ObstacleIndex } from "../src/game/spatial/ObstacleIndex";
import type { CollisionObstacle } from "../src/game/types";

const box: CollisionObstacle = {
  id: "box",
  label: "Box",
  sourceObjectId: "box",
  sourceObjectKind: "landmark",
  shape: "box",
  center: { x: 0, z: 0 },
  halfX: 3,
  halfZ: 4,
  angle: 0
};

const tree: CollisionObstacle = {
  id: "tree",
  label: "Tree",
  sourceObjectId: "tree",
  sourceObjectKind: "tree-collider",
  center: { x: 20, z: 0 },
  radius: 2
};

const polygon: CollisionObstacle = {
  id: "polygon",
  label: "Polygon",
  sourceObjectId: "polygon",
  sourceObjectKind: "mapped-building",
  shape: "polygon",
  center: { x: 50, z: 50 },
  polygon: [
    { x: 48, z: 48 },
    { x: 55, z: 50 },
    { x: 50, z: 56 }
  ]
};

describe("ObstacleIndex", () => {
  it("computes conservative cover radii for each obstacle shape", () => {
    expect(computeObstacleCoverRadius(box)).toBe(5);
    expect(computeObstacleCoverRadius(tree)).toBe(2);
    expect(computeObstacleCoverRadius(polygon)).toBeCloseTo(Math.hypot(0, 6));
  });

  it("queries only nearby obstacles", () => {
    const index = new ObstacleIndex([box, tree, polygon], { gridSize: 8 });

    expect(index.nearby({ x: 1, z: 1 }, 1).map((obstacle) => obstacle.id)).toEqual(["box"]);
    expect(index.nearby({ x: 19, z: 0 }, 1).map((obstacle) => obstacle.id)).toEqual(["tree"]);
    expect(index.nearby({ x: -40, z: -40 }, 1)).toEqual([]);
  });

  it("deduplicates obstacles that span multiple grid cells", () => {
    const index = new ObstacleIndex([box], { gridSize: 2 });
    const seen: string[] = [];

    index.forNearby(
      { x: 0, z: 0 },
      1,
      (obstacle) => {
        seen.push(obstacle.id);
      },
      4
    );

    expect(seen).toEqual(["box"]);
  });

  it("allows visitors to stop a nearby query early", () => {
    const index = new ObstacleIndex([box, tree], { gridSize: 40 });
    const seen: string[] = [];

    index.forNearby(
      { x: 1, z: 1 },
      50,
      (obstacle) => {
        seen.push(obstacle.id);
        return true;
      },
      0
    );

    expect(seen).toHaveLength(1);
  });
});
