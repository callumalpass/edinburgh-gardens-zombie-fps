import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { distance } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";
import {
  createTerrainOverlayDiscGeometry,
  createTerrainOverlayRectGeometry,
  TERRAIN_OVERLAY_MAX_LENGTH_STEP,
  TERRAIN_OVERLAY_MAX_WIDTH_STEP
} from "../src/game/rendering/terrainOverlay";
import { TerrainSampler } from "../src/game/terrain";
import type { Vec2 } from "../src/game/types";

function expectGeometryFollowsTerrain(geometry: THREE.BufferGeometry, groundYAt: (point: Vec2) => number, yOffset: number): number {
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const point = { x: positions.getX(index), z: positions.getZ(index) };
    expect(positions.getY(index)).toBeCloseTo(groundYAt(point) + yOffset, 5);
  }
  return positions.count;
}

describe("terrain overlay geometry", () => {
  it("samples all path surface vertices from the terrain instead of bridging long slopes", () => {
    const level = createLevelData();
    const sampler = new TerrainSampler(level);
    const yOffset = 0.073;
    let checkedVertices = 0;
    let densifiedSegments = 0;

    for (const path of level.paths) {
      for (let index = 0; index < path.points.length - 1; index += 1) {
        const a = path.points[index];
        const b = path.points[index + 1];
        const segmentLength = distance(a, b);
        if (segmentLength < 0.05) continue;

        const lengthSegments = Math.max(1, Math.ceil(segmentLength / TERRAIN_OVERLAY_MAX_LENGTH_STEP));
        const widthSegments = Math.max(1, Math.ceil(path.width / TERRAIN_OVERLAY_MAX_WIDTH_STEP));
        const geometry = createTerrainOverlayRectGeometry({
          center: { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 },
          angle: Math.atan2(b.z - a.z, b.x - a.x),
          length: segmentLength,
          width: path.width,
          yOffset,
          groundYAt: (point) => sampler.groundY(point)
        });

        expect(geometry.getAttribute("position").count).toBe((lengthSegments + 1) * (widthSegments + 1));
        checkedVertices += expectGeometryFollowsTerrain(geometry, (point) => sampler.groundY(point), yOffset);
        if (lengthSegments > 1 || widthSegments > 1) {
          densifiedSegments += 1;
        }
      }
    }

    expect(checkedVertices).toBeGreaterThan(3000);
    expect(densifiedSegments).toBeGreaterThan(40);
  });

  it("samples rounded path caps from local terrain across their radius", () => {
    const level = createLevelData();
    const sampler = new TerrainSampler(level);
    const yOffset = 0.078;
    let checkedVertices = 0;

    for (const path of level.paths) {
      for (const point of path.points) {
        const geometry = createTerrainOverlayDiscGeometry(point, path.width * 0.5, yOffset, (sample) => sampler.groundY(sample));
        checkedVertices += expectGeometryFollowsTerrain(geometry, (sample) => sampler.groundY(sample), yOffset);
      }
    }

    expect(checkedVertices).toBeGreaterThan(5000);
  });

  it("keeps a crowned path surface above the crown instead of burying the centerline", () => {
    const yOffset = 0.05;
    const geometry = createTerrainOverlayRectGeometry({
      center: { x: 0, z: 0 },
      angle: 0,
      length: 18,
      width: 3.6,
      yOffset,
      groundYAt: (point) => 0.24 * Math.exp(-(point.x * point.x) / 10 - (point.z * point.z) / 1.8)
    });
    const positions = geometry.getAttribute("position");
    let centerlineY = Number.NEGATIVE_INFINITY;
    let edgeY = Number.POSITIVE_INFINITY;

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const y = positions.getY(index);
      if (Math.abs(x) < 0.001 && Math.abs(z) < 0.001) {
        centerlineY = Math.max(centerlineY, y);
      }
      if (Math.abs(x) > 8.9 && Math.abs(z) > 1.7) {
        edgeY = Math.min(edgeY, y);
      }
    }

    expect(centerlineY).toBeCloseTo(0.29, 5);
    expect(centerlineY - edgeY).toBeGreaterThan(0.22);
  });
});
