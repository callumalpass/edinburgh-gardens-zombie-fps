import { distance } from "../geo";
import type { Vec2 } from "../types";

export function cleanPolygon(polygon: readonly Vec2[]): Vec2[] {
  if (polygon.length < 2) {
    return [...polygon];
  }
  return distance(polygon[0], polygon[polygon.length - 1]) < 0.01 ? polygon.slice(0, -1) : [...polygon];
}

export function localPoint(center: Vec2, rotation: number, localX: number, localZ: number): Vec2 {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: center.x + localX * cos - localZ * sin,
    z: center.z + localX * sin + localZ * cos
  };
}

export function worldToLocal(center: Vec2, rotation: number, point: Vec2): Vec2 {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: dx * cos + dz * sin,
    z: -dx * sin + dz * cos
  };
}

export function pointInRotatedRect(point: Vec2, center: Vec2, angle: number, halfX: number, halfZ: number): boolean {
  const local = worldToLocal(center, angle, point);
  return Math.abs(local.x) <= halfX && Math.abs(local.z) <= halfZ;
}

export function stableNoise(x: number, z: number, salt: number): number {
  const value = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

export class TerrainSupport {
  constructor(private readonly groundYAt: (point: Vec2) => number) {}

  supportY(points: readonly Vec2[], pad = 0): number {
    return Math.max(...points.map((point) => this.groundYAt(point))) + pad;
  }

  boxSupportY(center: Vec2, rotation: number, halfX: number, halfZ: number, pad = 0): number {
    return this.supportY(
      [
        localPoint(center, rotation, -halfX, -halfZ),
        localPoint(center, rotation, halfX, -halfZ),
        localPoint(center, rotation, halfX, halfZ),
        localPoint(center, rotation, -halfX, halfZ)
      ],
      pad
    );
  }

  radialSupportY(center: Vec2, radius: number, pad = 0): number {
    const points = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return {
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius
      };
    });
    points.push(center);
    return this.supportY(points, pad);
  }
}
