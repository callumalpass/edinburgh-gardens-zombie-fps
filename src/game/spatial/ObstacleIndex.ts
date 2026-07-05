import type { CollisionObstacle, Vec2 } from "../types";

export interface ObstacleIndexOptions {
  gridSize?: number;
}

const DEFAULT_GRID_SIZE = 24;

interface IndexedObstacle {
  obstacle: CollisionObstacle;
  coverRadius: number;
  queryStamp: number;
}

export class ObstacleIndex {
  private readonly gridSize: number;
  private readonly entries = new Map<CollisionObstacle, IndexedObstacle>();
  private readonly grid = new Map<number, Map<number, IndexedObstacle[]>>();
  private queryStamp = 0;

  constructor(private readonly obstacles: readonly CollisionObstacle[], options: ObstacleIndexOptions = {}) {
    this.gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;
    this.indexObstacles();
    this.indexGrid();
  }

  coverRadius(obstacle: CollisionObstacle): number {
    return this.entries.get(obstacle)?.coverRadius ?? computeObstacleCoverRadius(obstacle);
  }

  forNearby(point: Vec2, radius: number, visit: (obstacle: CollisionObstacle) => boolean | void, clearance = 0.85): void {
    const extent = radius + clearance;
    const minX = this.cellIndex(point.x - extent);
    const maxX = this.cellIndex(point.x + extent);
    const minZ = this.cellIndex(point.z - extent);
    const maxZ = this.cellIndex(point.z + extent);

    const queryStamp = this.nextQueryStamp();
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const bucket = this.bucketAt(x, z);
        if (!bucket) continue;
        for (const entry of bucket) {
          if (entry.queryStamp === queryStamp) continue;
          entry.queryStamp = queryStamp;
          const { obstacle } = entry;
          if (this.couldOverlapEntry(point, radius, entry, clearance)) {
            if (visit(obstacle)) {
              return;
            }
          }
        }
      }
    }
  }

  nearby(point: Vec2, radius: number, clearance = 0.85): CollisionObstacle[] {
    const nearby: CollisionObstacle[] = [];
    this.forNearby(
      point,
      radius,
      (obstacle) => {
        nearby.push(obstacle);
      },
      clearance
    );
    return nearby;
  }

  couldOverlap(point: Vec2, radius: number, obstacle: CollisionObstacle, clearance = 0.85): boolean {
    const dx = point.x - obstacle.center.x;
    const dz = point.z - obstacle.center.z;
    const range = this.coverRadius(obstacle) + radius + clearance;
    return dx * dx + dz * dz <= range * range;
  }

  private couldOverlapEntry(point: Vec2, radius: number, entry: IndexedObstacle, clearance = 0.85): boolean {
    const dx = point.x - entry.obstacle.center.x;
    const dz = point.z - entry.obstacle.center.z;
    const range = entry.coverRadius + radius + clearance;
    return dx * dx + dz * dz <= range * range;
  }

  private indexObstacles(): void {
    for (const obstacle of this.obstacles) {
      this.entries.set(obstacle, {
        obstacle,
        coverRadius: computeObstacleCoverRadius(obstacle),
        queryStamp: 0
      });
    }
  }

  private indexGrid(): void {
    for (const entry of this.entries.values()) {
      const { obstacle, coverRadius: radius } = entry;
      const minX = this.cellIndex(obstacle.center.x - radius);
      const maxX = this.cellIndex(obstacle.center.x + radius);
      const minZ = this.cellIndex(obstacle.center.z - radius);
      const maxZ = this.cellIndex(obstacle.center.z + radius);
      for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          this.ensureBucket(x, z).push(entry);
        }
      }
    }
  }

  private ensureBucket(x: number, z: number): IndexedObstacle[] {
    let column = this.grid.get(x);
    if (!column) {
      column = new Map();
      this.grid.set(x, column);
    }

    const bucket = column.get(z);
    if (bucket) {
      return bucket;
    }

    const nextBucket: IndexedObstacle[] = [];
    column.set(z, nextBucket);
    return nextBucket;
  }

  private bucketAt(x: number, z: number): IndexedObstacle[] | undefined {
    return this.grid.get(x)?.get(z);
  }

  private cellIndex(value: number): number {
    return Math.floor(value / this.gridSize);
  }

  private nextQueryStamp(): number {
    if (this.queryStamp >= Number.MAX_SAFE_INTEGER) {
      for (const entry of this.entries.values()) {
        entry.queryStamp = 0;
      }
      this.queryStamp = 0;
    }
    this.queryStamp += 1;
    return this.queryStamp;
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
