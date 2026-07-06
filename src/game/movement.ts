import { distanceToSegment } from "./geo";
import type { MovementSurface } from "./noise";
import { gridCellKey, type GridCellKey } from "./spatial/gridKey";
import type { LevelPath, Vec2 } from "./types";

const SURFACE_GRID_SIZE = 18;
const PATH_SURFACE_WIDTH_SCALE = 0.78;

export interface MovementSurfaceLevel {
  paths: readonly LevelPath[];
}

export function movementSurfaceAt(level: MovementSurfaceLevel, point: Vec2): MovementSurface {
  let nearestSurface: MovementSurface | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const path of level.paths) {
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const pathDistance = distanceToSegment(point, path.points[index], path.points[index + 1]);
      if (pathDistance <= path.width * PATH_SURFACE_WIDTH_SCALE && pathDistance < nearestDistance) {
        nearestDistance = pathDistance;
        nearestSurface = pathMovementSurface(path);
      }
    }
  }

  return nearestSurface ?? "grass";
}

export function pathMovementSurface(path: LevelPath): MovementSurface {
  if (path.kind === "rail") return "rail";
  if (path.surface === "gravel" || path.kind === "perimeter") return "gravel";
  if (path.surface === "asphalt" || path.kind === "cycleway" || path.kind === "service") return "asphalt";
  if (path.surface === "concrete" || path.kind === "steps" || path.kind === "footway") return "concrete";
  return "dirt";
}

export function surfaceSpeedMultiplier(surface: MovementSurface): number {
  if (surface === "rail") return 1.12;
  if (surface === "asphalt") return 1.08;
  if (surface === "concrete") return 1.03;
  if (surface === "gravel") return 0.94;
  if (surface === "dirt") return 0.84;
  return 0.9;
}

export function bikeSurfaceSpeedMultiplier(surface: MovementSurface): number {
  if (surface === "rail") return 1.2;
  if (surface === "asphalt") return 1.18;
  if (surface === "concrete") return 1.1;
  if (surface === "gravel") return 0.88;
  if (surface === "dirt") return 0.72;
  return 0.82;
}

export function skateboardSurfaceSpeedMultiplier(surface: MovementSurface): number {
  if (surface === "rail") return 1.16;
  if (surface === "asphalt") return 1.14;
  if (surface === "concrete") return 1.08;
  if (surface === "gravel") return 0.58;
  if (surface === "dirt") return 0.42;
  return 0;
}

interface IndexedPathSegment {
  surface: MovementSurface;
  start: Vec2;
  end: Vec2;
  dx: number;
  dz: number;
  lengthSquared: number;
  width: number;
  widthSquared: number;
}

export class MovementSurfaceSampler {
  private readonly grid = new Map<GridCellKey, IndexedPathSegment[]>();
  private readonly gridSize: number;

  constructor(private readonly level: MovementSurfaceLevel, options: { gridSize?: number } = {}) {
    this.gridSize = options.gridSize ?? SURFACE_GRID_SIZE;
    this.indexPaths();
  }

  at(point: Vec2): MovementSurface {
    let nearestSurface: MovementSurface | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const segment of this.bucketAt(this.cellIndex(point.x), this.cellIndex(point.z)) ?? []) {
      const pathDistanceSquared = distanceToIndexedSegmentSquared(point, segment);
      if (pathDistanceSquared <= segment.widthSquared && pathDistanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = pathDistanceSquared;
        nearestSurface = segment.surface;
      }
    }

    return nearestSurface ?? "grass";
  }

  speedMultiplier(surface: MovementSurface): number {
    return surfaceSpeedMultiplier(surface);
  }

  bikeSpeedMultiplier(surface: MovementSurface): number {
    return bikeSurfaceSpeedMultiplier(surface);
  }

  skateboardSpeedMultiplier(surface: MovementSurface): number {
    return skateboardSurfaceSpeedMultiplier(surface);
  }

  private indexPaths(): void {
    for (const path of this.level.paths) {
      const width = path.width * PATH_SURFACE_WIDTH_SCALE;
      const widthSquared = width * width;
      const surface = pathMovementSurface(path);
      for (let index = 0; index < path.points.length - 1; index += 1) {
        const start = path.points[index];
        const end = path.points[index + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const segment = {
          surface,
          start,
          end,
          dx,
          dz,
          lengthSquared: dx * dx + dz * dz,
          width,
          widthSquared
        };
        const minX = this.cellIndex(Math.min(start.x, end.x) - width);
        const maxX = this.cellIndex(Math.max(start.x, end.x) + width);
        const minZ = this.cellIndex(Math.min(start.z, end.z) - width);
        const maxZ = this.cellIndex(Math.max(start.z, end.z) + width);

        for (let x = minX; x <= maxX; x += 1) {
          for (let z = minZ; z <= maxZ; z += 1) {
            this.ensureBucket(x, z).push(segment);
          }
        }
      }
    }
  }

  private ensureBucket(x: number, z: number): IndexedPathSegment[] {
    const key = gridCellKey(x, z);
    const bucket = this.grid.get(key);
    if (bucket) {
      return bucket;
    }

    const nextBucket: IndexedPathSegment[] = [];
    this.grid.set(key, nextBucket);
    return nextBucket;
  }

  private bucketAt(x: number, z: number): IndexedPathSegment[] | undefined {
    return this.grid.get(gridCellKey(x, z));
  }

  private cellIndex(value: number): number {
    return Math.floor(value / this.gridSize);
  }
}

function distanceToIndexedSegmentSquared(point: Vec2, segment: IndexedPathSegment): number {
  if (segment.lengthSquared === 0) {
    const dx = point.x - segment.start.x;
    const dz = point.z - segment.start.z;
    return dx * dx + dz * dz;
  }

  const projection = ((point.x - segment.start.x) * segment.dx + (point.z - segment.start.z) * segment.dz) / segment.lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  const nearestX = segment.start.x + segment.dx * t;
  const nearestZ = segment.start.z + segment.dz * t;
  const dx = point.x - nearestX;
  const dz = point.z - nearestZ;
  return dx * dx + dz * dz;
}
