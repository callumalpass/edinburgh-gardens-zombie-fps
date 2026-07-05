import { describe, expect, it } from "vitest";
import {
  TerrainSupport,
  cleanPolygon,
  localPoint,
  pointInRotatedRect,
  stableNoise,
  worldToLocal
} from "../src/game/rendering/worldGeometry";

describe("world geometry helpers", () => {
  it("round trips between local and world coordinates", () => {
    const center = { x: 12, z: -4 };
    const world = localPoint(center, Math.PI / 5, 3, -2);
    const local = worldToLocal(center, Math.PI / 5, world);

    expect(local.x).toBeCloseTo(3);
    expect(local.z).toBeCloseTo(-2);
  });

  it("normalizes closed polygons without mutating open polygons", () => {
    const closed = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 0, z: 0 }
    ];
    const open = [
      { x: 0, z: 0 },
      { x: 2, z: 0 }
    ];

    expect(cleanPolygon(closed)).toHaveLength(2);
    expect(cleanPolygon(open)).toEqual(open);
  });

  it("checks rotated rectangle inclusion in local space", () => {
    const center = { x: 0, z: 0 };
    const inside = localPoint(center, Math.PI / 4, 1.8, 0.6);
    const outside = localPoint(center, Math.PI / 4, 2.4, 0.6);

    expect(pointInRotatedRect(inside, center, Math.PI / 4, 2, 1)).toBe(true);
    expect(pointInRotatedRect(outside, center, Math.PI / 4, 2, 1)).toBe(false);
  });

  it("samples support height across box and radial footprints", () => {
    const support = new TerrainSupport((point) => point.x * 0.1 + point.z * 0.2);

    expect(support.boxSupportY({ x: 0, z: 0 }, 0, 2, 3, 0.5)).toBeCloseTo(1.3);
    expect(support.radialSupportY({ x: 0, z: 0 }, 5)).toBeGreaterThan(0.9);
  });

  it("keeps deterministic noise in the unit interval", () => {
    const first = stableNoise(12.5, -3.25, 9);
    const second = stableNoise(12.5, -3.25, 9);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
  });
});
