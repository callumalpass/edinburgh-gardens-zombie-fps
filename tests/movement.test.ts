import { describe, expect, it } from "vitest";
import {
  bikeSurfaceSpeedMultiplier,
  MovementSurfaceSampler,
  movementSurfaceAt,
  pathMovementSurface,
  surfaceSpeedMultiplier
} from "../src/game/movement";
import type { LevelPath } from "../src/game/types";

const path = (overrides: Partial<LevelPath>): LevelPath => ({
  id: overrides.id ?? "path",
  label: overrides.label ?? "Path",
  kind: overrides.kind ?? "footway",
  points: overrides.points ?? [
    { x: -10, z: 0 },
    { x: 10, z: 0 }
  ],
  width: overrides.width ?? 4,
  surface: overrides.surface,
  source: overrides.source
});

describe("movement surfaces", () => {
  it("classifies paths by kind and surface metadata", () => {
    expect(pathMovementSurface(path({ kind: "rail" }))).toBe("rail");
    expect(pathMovementSurface(path({ kind: "perimeter", surface: "asphalt" }))).toBe("gravel");
    expect(pathMovementSurface(path({ kind: "service", surface: "asphalt" }))).toBe("asphalt");
    expect(pathMovementSurface(path({ kind: "steps" }))).toBe("concrete");
    expect(pathMovementSurface(path({ kind: "footway", surface: "unknown" }))).toBe("concrete");
  });

  it("uses the nearest overlapping path instead of the first matching path", () => {
    const level = {
      paths: [
        path({ id: "wide-gravel", kind: "perimeter", points: [{ x: -10, z: 0 }, { x: 10, z: 0 }], width: 8 }),
        path({ id: "tight-asphalt", kind: "cycleway", surface: "asphalt", points: [{ x: -10, z: 1 }, { x: 10, z: 1 }], width: 3 })
      ]
    };

    expect(movementSurfaceAt(level, { x: 0, z: 1 })).toBe("asphalt");
  });

  it("indexes path segments while preserving nearest-surface classification", () => {
    const level = {
      paths: [
        path({ id: "north-service", kind: "service", points: [{ x: -40, z: -18 }, { x: 10, z: -18 }, { x: 42, z: -4 }], width: 3.2 }),
        path({ id: "cross-gravel", kind: "perimeter", points: [{ x: -8, z: -40 }, { x: -8, z: 40 }], width: 5.5 }),
        path({ id: "rail-trail", kind: "rail", points: [{ x: 18, z: -35 }, { x: 18, z: 35 }], width: 4.2 })
      ]
    };
    const sampler = new MovementSurfaceSampler(level, { gridSize: 12 });
    const points = [
      { x: -30, z: -18 },
      { x: -8, z: 3 },
      { x: 18, z: 22 },
      { x: 40, z: -5 },
      { x: 46, z: 28 }
    ];

    expect(points.map((point) => sampler.at(point))).toEqual(points.map((point) => movementSurfaceAt(level, point)));
  });

  it("falls back to grass and keeps bike/player speed curves distinct", () => {
    expect(movementSurfaceAt({ paths: [] }, { x: 100, z: 100 })).toBe("grass");
    expect(new MovementSurfaceSampler({ paths: [] }).at({ x: 100, z: 100 })).toBe("grass");
    expect(surfaceSpeedMultiplier("asphalt")).toBeGreaterThan(surfaceSpeedMultiplier("grass"));
    expect(bikeSurfaceSpeedMultiplier("asphalt")).toBeGreaterThan(surfaceSpeedMultiplier("asphalt"));
    expect(bikeSurfaceSpeedMultiplier("dirt")).toBeLessThan(surfaceSpeedMultiplier("dirt"));
  });
});
