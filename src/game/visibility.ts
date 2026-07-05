import { distanceToSegment } from "./geo";
import { lineIntersectsBox, lineIntersectsPolygon } from "./collision";
import type { CollisionObstacle, Vec2 } from "./types";

const SIGHT_GRID_SIZE = 36;
const FOV_PADDING_RADIANS = 0.08;
let cachedFov = Number.NaN;
let cachedAspect = Number.NaN;
let cachedVisibleDotThreshold = 0;

export interface VisibilityContext {
  playerPosition: Vec2;
  playerYaw: number;
  playerHeight: number;
  cameraFov: number;
  cameraAspect: number;
  obstacles: readonly CollisionObstacle[];
  isObstacleBypassed?: (obstacleId: string, point: Vec2) => boolean;
}

interface IndexedSightObstacle {
  obstacle: CollisionObstacle;
  coverRadius: number;
}

const sightIndexes = new WeakMap<readonly CollisionObstacle[], SightObstacleIndex>();

export function playerForward2D(yaw: number): Vec2 {
  return {
    x: -Math.sin(yaw),
    z: -Math.cos(yaw)
  };
}

export function isPointVisibleToPlayer(point: Vec2, context: VisibilityContext, padding = 0): boolean {
  const dx = point.x - context.playerPosition.x;
  const dz = point.z - context.playerPosition.z;
  const range = Math.hypot(dx, dz);
  if (range < 0.001) return true;

  const dot = (dx / range) * -Math.sin(context.playerYaw) + (dz / range) * -Math.cos(context.playerYaw);
  if (dot <= 0) return false;

  if (dot < visibleDotThreshold(context.cameraFov, context.cameraAspect)) return false;

  return !isLineOfSightBlocked(context.playerPosition, point, context, padding);
}

export function isLineOfSightBlocked(a: Vec2, b: Vec2, context: VisibilityContext, padding = 0): boolean {
  if (context.playerHeight > 2.6) {
    return false;
  }

  const sightIndex = sightIndexes.get(context.obstacles) ?? buildAndCacheSightIndex(context.obstacles);
  let blocked = false;
  sightIndex.forSegment(a, b, padding, (obstacle) => {
    if (obstacle.blocksSight === false) return false;
    if (context.isObstacleBypassed?.(obstacle.id, a)) return false;
    if (obstacle.shape === "box") {
      blocked = lineIntersectsBox(a, b, obstacle.center, obstacle.halfX + padding, obstacle.halfZ + padding, obstacle.angle);
      return blocked;
    }
    if (obstacle.shape === "polygon") {
      blocked = lineIntersectsPolygon(a, b, obstacle.polygon, padding);
      return blocked;
    }
    blocked = distanceToSegment(obstacle.center, a, b) <= obstacle.radius + padding;
    return blocked;
  });
  return blocked;
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function visibleDotThreshold(cameraFov: number, cameraAspect: number): number {
  if (cameraFov === cachedFov && cameraAspect === cachedAspect) {
    return cachedVisibleDotThreshold;
  }

  const halfHorizontalTan = Math.tan(degToRad(cameraFov) * 0.5) * cameraAspect;
  const threshold =
    (Math.cos(FOV_PADDING_RADIANS) - halfHorizontalTan * Math.sin(FOV_PADDING_RADIANS)) /
    Math.sqrt(1 + halfHorizontalTan * halfHorizontalTan);
  cachedFov = cameraFov;
  cachedAspect = cameraAspect;
  cachedVisibleDotThreshold = threshold;
  return threshold;
}

function buildAndCacheSightIndex(obstacles: readonly CollisionObstacle[]): SightObstacleIndex {
  const index = new SightObstacleIndex(obstacles);
  sightIndexes.set(obstacles, index);
  return index;
}

class SightObstacleIndex {
  private readonly grid = new Map<string, IndexedSightObstacle[]>();
  private readonly querySeen = new Set<string>();

  constructor(obstacles: readonly CollisionObstacle[]) {
    for (const obstacle of obstacles) {
      if (obstacle.blocksSight === false) continue;
      this.addObstacle(obstacle);
    }
  }

  forSegment(a: Vec2, b: Vec2, padding: number, visit: (obstacle: CollisionObstacle) => boolean | void): void {
    const minX = this.cellIndex(Math.min(a.x, b.x) - padding);
    const maxX = this.cellIndex(Math.max(a.x, b.x) + padding);
    const minZ = this.cellIndex(Math.min(a.z, b.z) - padding);
    const maxZ = this.cellIndex(Math.max(a.z, b.z) + padding);

    this.querySeen.clear();
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const bucket = this.grid.get(this.cellKey(x, z));
        if (!bucket) continue;
        for (const entry of bucket) {
          const { obstacle } = entry;
          if (this.querySeen.has(obstacle.id)) continue;
          this.querySeen.add(obstacle.id);
          if (distanceToSegment(obstacle.center, a, b) > entry.coverRadius + padding) continue;
          if (visit(obstacle)) {
            return;
          }
        }
      }
    }
  }

  private addObstacle(obstacle: CollisionObstacle): void {
    const entry = { obstacle, coverRadius: computeObstacleCoverRadius(obstacle) };
    const minX = this.cellIndex(obstacle.center.x - entry.coverRadius);
    const maxX = this.cellIndex(obstacle.center.x + entry.coverRadius);
    const minZ = this.cellIndex(obstacle.center.z - entry.coverRadius);
    const maxZ = this.cellIndex(obstacle.center.z + entry.coverRadius);
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const key = this.cellKey(x, z);
        const bucket = this.grid.get(key);
        if (bucket) {
          bucket.push(entry);
        } else {
          this.grid.set(key, [entry]);
        }
      }
    }
  }

  private cellIndex(value: number): number {
    return Math.floor(value / SIGHT_GRID_SIZE);
  }

  private cellKey(x: number, z: number): string {
    return `${x}:${z}`;
  }
}

function computeObstacleCoverRadius(obstacle: CollisionObstacle): number {
  if (obstacle.shape === "box") {
    return Math.hypot(obstacle.halfX, obstacle.halfZ);
  }
  if (obstacle.shape === "polygon") {
    let radius = 0;
    for (const point of obstacle.polygon) {
      radius = Math.max(radius, Math.hypot(point.x - obstacle.center.x, point.z - obstacle.center.z));
    }
    return radius;
  }
  return obstacle.radius;
}
