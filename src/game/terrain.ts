import { distanceToSegmentSquared } from "./geo";
import { gridCellKey, type GridCellKey } from "./spatial/gridKey";
import type { LevelData, TerrainLineModifier, TerrainModifier, Vec2 } from "./types";

const MODIFIER_GRID_SIZE = 32;
const NEAREST_ELEVATION_SAMPLE_COUNT = 12;
const MAX_GROUND_CACHE_ENTRIES = 8192;

interface IndexedTerrainModifier {
  modifier: TerrainModifier;
  radiusSquared?: number;
  radiusXSquared?: number;
  radiusZSquared?: number;
  outerWidthSquared?: number;
  cos?: number;
  sin?: number;
  segments?: readonly IndexedLineSegment[];
}

interface IndexedLineSegment {
  start: Vec2;
  end: Vec2;
  dx: number;
  dz: number;
  lengthSquared: number;
}

export class TerrainSampler {
  private readonly groundCache = new Map<number, Map<number, number>>();
  private groundCacheEntries = 0;
  private readonly modifierBuckets = new Map<GridCellKey, IndexedTerrainModifier[]>();
  private readonly nearestAltitudes = new Array<number>(NEAREST_ELEVATION_SAMPLE_COUNT);
  private readonly nearestDistancesSquared = new Array<number>(NEAREST_ELEVATION_SAMPLE_COUNT);

  constructor(private readonly level: LevelData) {
    this.indexTerrainModifiers();
  }

  groundY(point: Vec2): number {
    const cached = this.cachedGroundY(point);
    if (cached !== undefined) {
      return cached;
    }

    const ground = Math.max(0, this.altitudeAt(point) - this.level.elevationMin + this.microReliefAt(point));
    if (this.groundCacheEntries >= MAX_GROUND_CACHE_ENTRIES) {
      this.groundCache.clear();
      this.groundCacheEntries = 0;
    }
    this.setCachedGroundY(point, ground);
    return ground;
  }

  averageGroundY(points: readonly Vec2[]): number {
    if (points.length === 0) {
      return 0;
    }
    return points.reduce((sum, point) => sum + this.groundY(point), 0) / points.length;
  }

  altitudeAt(point: Vec2): number {
    let weightedAltitude = 0;
    let totalWeight = 0;
    let nearestCount = 0;

    for (const sample of this.level.elevationSamples) {
      const dx = point.x - sample.position.x;
      const dz = point.z - sample.position.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < 0.01) {
        return sample.altitude;
      }

      if (
        nearestCount < NEAREST_ELEVATION_SAMPLE_COUNT ||
        distanceSquared < this.nearestDistancesSquared[NEAREST_ELEVATION_SAMPLE_COUNT - 1]
      ) {
        let insertAt = nearestCount;
        while (insertAt > 0 && distanceSquared < this.nearestDistancesSquared[insertAt - 1]) {
          if (insertAt < NEAREST_ELEVATION_SAMPLE_COUNT) {
            this.nearestDistancesSquared[insertAt] = this.nearestDistancesSquared[insertAt - 1];
            this.nearestAltitudes[insertAt] = this.nearestAltitudes[insertAt - 1];
          }
          insertAt -= 1;
        }
        if (insertAt < NEAREST_ELEVATION_SAMPLE_COUNT) {
          this.nearestDistancesSquared[insertAt] = distanceSquared;
          this.nearestAltitudes[insertAt] = sample.altitude;
          nearestCount = Math.min(NEAREST_ELEVATION_SAMPLE_COUNT, nearestCount + 1);
        }
      }
    }

    for (let index = 0; index < nearestCount; index += 1) {
      const weight = 1 / Math.max(20, this.nearestDistancesSquared[index]);
      weightedAltitude += this.nearestAltitudes[index] * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedAltitude / totalWeight : this.level.elevationMin;
  }

  microReliefAt(point: Vec2): number {
    let relief = 0;
    for (const modifier of this.nearbyTerrainModifiers(point)) {
      relief += this.modifierReliefAt(point, modifier);
    }
    return Math.max(-1.8, Math.min(0.42, relief));
  }

  private indexTerrainModifiers(): void {
    for (const modifier of this.level.terrainModifiers) {
      const entry = indexTerrainModifier(modifier);
      const bounds = this.modifierBounds(modifier);
      const minX = this.cellIndex(bounds.minX);
      const maxX = this.cellIndex(bounds.maxX);
      const minZ = this.cellIndex(bounds.minZ);
      const maxZ = this.cellIndex(bounds.maxZ);
      for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          this.ensureModifierBucket(x, z).push(entry);
        }
      }
    }
  }

  private nearbyTerrainModifiers(point: Vec2): readonly IndexedTerrainModifier[] {
    return this.modifierBucketAt(this.cellIndex(point.x), this.cellIndex(point.z)) ?? [];
  }

  private modifierReliefAt(point: Vec2, entry: IndexedTerrainModifier): number {
    const { modifier } = entry;
    if (modifier.shape === "radial") {
      const dx = point.x - modifier.center.x;
      const dz = point.z - modifier.center.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= (entry.radiusSquared ?? modifier.radius * modifier.radius)) {
        return 0;
      }
      const modifierDistance = Math.sqrt(distanceSquared);
      return modifier.delta * smoothFalloff(1 - modifierDistance / modifier.radius);
    }

    if (modifier.shape === "ellipse") {
      const dx = point.x - modifier.center.x;
      const dz = point.z - modifier.center.z;
      const cos = entry.cos ?? Math.cos(modifier.angle);
      const sin = entry.sin ?? Math.sin(modifier.angle);
      const localX = dx * cos + dz * sin;
      const localZ = -dx * sin + dz * cos;
      const normalizedSquared =
        (localX * localX) / (entry.radiusXSquared ?? modifier.radiusX * modifier.radiusX) +
        (localZ * localZ) / (entry.radiusZSquared ?? modifier.radiusZ * modifier.radiusZ);
      if (normalizedSquared >= 1) {
        return 0;
      }
      const normalized = Math.sqrt(normalizedSquared);
      return modifier.delta * smoothFalloff(1 - normalized);
    }

    const modifierDistanceSquared = distanceToPolylineSquared(point, entry.segments ?? indexLineSegments(modifier.points));
    if (modifierDistanceSquared > (entry.outerWidthSquared ?? modifier.outerWidth * modifier.outerWidth)) {
      return 0;
    }
    const modifierDistance = Math.sqrt(modifierDistanceSquared);

    if (modifier.kind === "path-shoulder" || modifier.kind === "oval-banking") {
      if (modifierDistance < modifier.innerWidth) {
        return 0;
      }
      const width = Math.max(0.001, modifier.outerWidth - modifier.innerWidth);
      const bandT = (modifierDistance - modifier.innerWidth) / width;
      return modifier.delta * Math.sin(Math.PI * bandT);
    }

    return modifier.delta * smoothFalloff(1 - modifierDistance / modifier.outerWidth);
  }

  private modifierBounds(modifier: TerrainModifier): { minX: number; minZ: number; maxX: number; maxZ: number } {
    if (modifier.shape === "radial") {
      return {
        minX: modifier.center.x - modifier.radius,
        minZ: modifier.center.z - modifier.radius,
        maxX: modifier.center.x + modifier.radius,
        maxZ: modifier.center.z + modifier.radius
      };
    }

    if (modifier.shape === "ellipse") {
      const cos = Math.cos(modifier.angle);
      const sin = Math.sin(modifier.angle);
      const halfX = Math.abs(modifier.radiusX * cos) + Math.abs(modifier.radiusZ * sin);
      const halfZ = Math.abs(modifier.radiusX * sin) + Math.abs(modifier.radiusZ * cos);
      return {
        minX: modifier.center.x - halfX,
        minZ: modifier.center.z - halfZ,
        maxX: modifier.center.x + halfX,
        maxZ: modifier.center.z + halfZ
      };
    }

    return boundsForLineModifier(modifier);
  }

  private cellIndex(value: number): number {
    return Math.floor(value / MODIFIER_GRID_SIZE);
  }

  private cachedGroundY(point: Vec2): number | undefined {
    return this.groundCache.get(point.x)?.get(point.z);
  }

  private setCachedGroundY(point: Vec2, ground: number): void {
    let row = this.groundCache.get(point.x);
    if (!row) {
      row = new Map();
      this.groundCache.set(point.x, row);
    }
    if (!row.has(point.z)) {
      this.groundCacheEntries += 1;
    }
    row.set(point.z, ground);
  }

  private ensureModifierBucket(x: number, z: number): IndexedTerrainModifier[] {
    const key = gridCellKey(x, z);
    const bucket = this.modifierBuckets.get(key);
    if (bucket) {
      return bucket;
    }

    const nextBucket: IndexedTerrainModifier[] = [];
    this.modifierBuckets.set(key, nextBucket);
    return nextBucket;
  }

  private modifierBucketAt(x: number, z: number): IndexedTerrainModifier[] | undefined {
    return this.modifierBuckets.get(gridCellKey(x, z));
  }
}

function indexTerrainModifier(modifier: TerrainModifier): IndexedTerrainModifier {
  if (modifier.shape === "radial") {
    return {
      modifier,
      radiusSquared: modifier.radius * modifier.radius
    };
  }

  if (modifier.shape === "ellipse") {
    return {
      modifier,
      cos: Math.cos(modifier.angle),
      sin: Math.sin(modifier.angle),
      radiusXSquared: modifier.radiusX * modifier.radiusX,
      radiusZSquared: modifier.radiusZ * modifier.radiusZ
    };
  }

  return {
    modifier,
    outerWidthSquared: modifier.outerWidth * modifier.outerWidth,
    segments: indexLineSegments(modifier.points)
  };
}

function indexLineSegments(points: readonly Vec2[]): IndexedLineSegment[] {
  const segments: IndexedLineSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    segments.push({
      start,
      end,
      dx,
      dz,
      lengthSquared: dx * dx + dz * dz
    });
  }
  return segments;
}

function distanceToPolylineSquared(point: Vec2, segments: readonly IndexedLineSegment[]): number {
  let closest = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    if (segment.lengthSquared === 0) {
      closest = Math.min(closest, distanceToSegmentSquared(point, segment.start, segment.end));
      continue;
    }
    const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * segment.dx + (point.z - segment.start.z) * segment.dz) / segment.lengthSquared));
    const nearestX = segment.start.x + segment.dx * t;
    const nearestZ = segment.start.z + segment.dz * t;
    const dx = point.x - nearestX;
    const dz = point.z - nearestZ;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared < closest) {
      closest = distanceSquared;
    }
  }
  return closest;
}

function boundsForLineModifier(modifier: TerrainLineModifier): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of modifier.points) {
    if (point.x < minX) minX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.x > maxX) maxX = point.x;
    if (point.z > maxZ) maxZ = point.z;
  }
  return {
    minX: minX - modifier.outerWidth,
    minZ: minZ - modifier.outerWidth,
    maxX: maxX + modifier.outerWidth,
    maxZ: maxZ + modifier.outerWidth
  };
}

function smoothFalloff(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
