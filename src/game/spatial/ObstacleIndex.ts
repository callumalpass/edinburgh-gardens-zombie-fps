import type { CollisionObstacle, Vec2 } from "../types";

export interface ObstacleIndexOptions {
  gridSize?: number;
}

const DEFAULT_GRID_SIZE = 24;

export class ObstacleIndex {
  private readonly gridSize: number;
  private readonly coverRadii = new Map<string, number>();
  private readonly grid = new Map<number, Map<number, CollisionObstacle[]>>();
  private readonly querySeen = new Set<string>();

  constructor(private readonly obstacles: readonly CollisionObstacle[], options: ObstacleIndexOptions = {}) {
    this.gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;
    this.indexCoverRadii();
    this.indexGrid();
  }

  coverRadius(obstacle: CollisionObstacle): number {
    return this.coverRadii.get(obstacle.id) ?? computeObstacleCoverRadius(obstacle);
  }

  forNearby(point: Vec2, radius: number, visit: (obstacle: CollisionObstacle) => void, clearance = 0.85): void {
    const extent = radius + clearance;
    const minX = this.cellIndex(point.x - extent);
    const maxX = this.cellIndex(point.x + extent);
    const minZ = this.cellIndex(point.z - extent);
    const maxZ = this.cellIndex(point.z + extent);

    this.querySeen.clear();
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const bucket = this.bucketAt(x, z);
        if (!bucket) continue;
        for (const obstacle of bucket) {
          if (this.querySeen.has(obstacle.id)) continue;
          this.querySeen.add(obstacle.id);
          if (this.couldOverlap(point, radius, obstacle, clearance)) {
            visit(obstacle);
          }
        }
      }
    }
  }

  nearby(point: Vec2, radius: number, clearance = 0.85): CollisionObstacle[] {
    const nearby: CollisionObstacle[] = [];
    this.forNearby(point, radius, (obstacle) => nearby.push(obstacle), clearance);
    return nearby;
  }

  couldOverlap(point: Vec2, radius: number, obstacle: CollisionObstacle, clearance = 0.85): boolean {
    const dx = point.x - obstacle.center.x;
    const dz = point.z - obstacle.center.z;
    const range = this.coverRadius(obstacle) + radius + clearance;
    return dx * dx + dz * dz <= range * range;
  }

  private indexCoverRadii(): void {
    for (const obstacle of this.obstacles) {
      this.coverRadii.set(obstacle.id, computeObstacleCoverRadius(obstacle));
    }
  }

  private indexGrid(): void {
    for (const obstacle of this.obstacles) {
      const radius = this.coverRadius(obstacle);
      const minX = this.cellIndex(obstacle.center.x - radius);
      const maxX = this.cellIndex(obstacle.center.x + radius);
      const minZ = this.cellIndex(obstacle.center.z - radius);
      const maxZ = this.cellIndex(obstacle.center.z + radius);
      for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          this.ensureBucket(x, z).push(obstacle);
        }
      }
    }
  }

  private ensureBucket(x: number, z: number): CollisionObstacle[] {
    let column = this.grid.get(x);
    if (!column) {
      column = new Map();
      this.grid.set(x, column);
    }

    const bucket = column.get(z);
    if (bucket) {
      return bucket;
    }

    const nextBucket: CollisionObstacle[] = [];
    column.set(z, nextBucket);
    return nextBucket;
  }

  private bucketAt(x: number, z: number): CollisionObstacle[] | undefined {
    return this.grid.get(x)?.get(z);
  }

  private cellIndex(value: number): number {
    return Math.floor(value / this.gridSize);
  }
}

export function computeObstacleCoverRadius(obstacle: CollisionObstacle): number {
  if (obstacle.shape === "box") {
    return Math.hypot(obstacle.halfX, obstacle.halfZ);
  }
  if (obstacle.shape === "polygon") {
    let radius = 0;
    for (const point of obstacle.polygon) {
      const dx = point.x - obstacle.center.x;
      const dz = point.z - obstacle.center.z;
      radius = Math.max(radius, Math.hypot(dx, dz));
    }
    return radius;
  }
  return obstacle.radius;
}
