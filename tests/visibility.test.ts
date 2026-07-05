import { describe, expect, it } from "vitest";
import { isLineOfSightBlocked, isPointVisibleToPlayer } from "../src/game/visibility";
import type { BoxObstacle, CollisionObstacle } from "../src/game/types";

const box: BoxObstacle = {
  id: "wall",
  label: "Wall",
  shape: "box",
  center: { x: 0, z: -10 },
  halfX: 4,
  halfZ: 1,
  angle: 0
};

function context(obstacles: readonly CollisionObstacle[] = [box]) {
  return {
    playerPosition: { x: 0, z: 0 },
    playerYaw: 0,
    playerHeight: 0,
    cameraFov: 74,
    cameraAspect: 16 / 9,
    obstacles
  };
}

describe("visibility system", () => {
  it("culls points behind the player", () => {
    expect(isPointVisibleToPlayer({ x: 0, z: -20 }, context([]))).toBe(true);
    expect(isPointVisibleToPlayer({ x: 0, z: 20 }, context([]))).toBe(false);
  });

  it("blocks line of sight through obstacles unless bypassed", () => {
    expect(isLineOfSightBlocked({ x: 0, z: 0 }, { x: 0, z: -20 }, context(), 0)).toBe(true);
    expect(
      isLineOfSightBlocked(
        { x: 0, z: 0 },
        { x: 0, z: -20 },
        {
          ...context(),
          isObstacleBypassed: (id) => id === "wall"
        },
        0
      )
    ).toBe(false);
  });

  it("allows movement-only circular obstacles to stay out of sight occlusion", () => {
    expect(
      isLineOfSightBlocked(
        { x: 0, z: 0 },
        { x: 0, z: -20 },
        context([{ id: "tree", label: "Tree trunk", center: { x: 0, z: -10 }, radius: 2.5, blocksSight: false }]),
        0
      )
    ).toBe(false);
  });
});
