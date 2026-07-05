import { distanceToSegment } from "./geo";
import type { MovementSurface } from "./noise";
import type { LevelPath, Vec2 } from "./types";

export interface MovementSurfaceLevel {
  paths: readonly LevelPath[];
}

export function movementSurfaceAt(level: MovementSurfaceLevel, point: Vec2): MovementSurface {
  let nearestSurface: MovementSurface | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const path of level.paths) {
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const pathDistance = distanceToSegment(point, path.points[index], path.points[index + 1]);
      if (pathDistance <= path.width * 0.78 && pathDistance < nearestDistance) {
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

export class MovementSurfaceSampler {
  constructor(private readonly level: MovementSurfaceLevel) {}

  at(point: Vec2): MovementSurface {
    return movementSurfaceAt(this.level, point);
  }

  speedMultiplier(surface: MovementSurface): number {
    return surfaceSpeedMultiplier(surface);
  }

  bikeSpeedMultiplier(surface: MovementSurface): number {
    return bikeSurfaceSpeedMultiplier(surface);
  }
}
