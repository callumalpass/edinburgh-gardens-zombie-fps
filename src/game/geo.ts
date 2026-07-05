import type { GeoPoint, Vec2 } from "./types";

export const MAP_CENTER: GeoPoint = {
  lat: -37.7876764,
  lon: 144.9828576
};

const METERS_PER_DEGREE_LAT = 111_320;
const METERS_PER_DEGREE_LON = METERS_PER_DEGREE_LAT * Math.cos((MAP_CENTER.lat * Math.PI) / 180);

export const WORLD_SCALE = 1.65;

export function geoToWorld(point: GeoPoint, scale = WORLD_SCALE): Vec2 {
  return {
    x: (point.lon - MAP_CENTER.lon) * METERS_PER_DEGREE_LON * scale,
    z: (MAP_CENTER.lat - point.lat) * METERS_PER_DEGREE_LAT * scale
  };
}

export function polygonFromGeo(points: readonly GeoPoint[]): Vec2[] {
  return points.map((point) => geoToWorld(point));
}

export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.z > point.z !== b.z > point.z;
    if (!crosses) {
      continue;
    }
    const xAtZ = ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (point.x < xAtZ) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonArea(polygon: readonly Vec2[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

export function polygonCentroid(polygon: readonly Vec2[]): Vec2 {
  const area = polygonArea(polygon);
  if (Math.abs(area) < 0.0001) {
    return averagePoint(polygon);
  }

  let x = 0;
  let z = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const factor = a.x * b.z - b.x * a.z;
    x += (a.x + b.x) * factor;
    z += (a.z + b.z) * factor;
  }

  const divisor = 6 * area;
  return { x: x / divisor, z: z / divisor };
}

export function averagePoint(points: readonly Vec2[]): Vec2 {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      z: sum.z + point.z
    }),
    { x: 0, z: 0 }
  );
  return {
    x: total.x / points.length,
    z: total.z / points.length
  };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  return distance(point, nearestPointOnSegment(point, a, b));
}

export function nearestPointOnSegment(point: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) {
    return { ...a };
  }
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
  return {
    x: a.x + dx * t,
    z: a.z + dz * t
  };
}

export function nearestPointOnPolygon(point: Vec2, polygon: readonly Vec2[]): Vec2 {
  let closest = polygon[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const candidate = nearestPointOnSegment(point, polygon[i], polygon[(i + 1) % polygon.length]);
    const candidateDistance = distance(point, candidate);
    if (candidateDistance < closestDistance) {
      closest = candidate;
      closestDistance = candidateDistance;
    }
  }
  return closest;
}

export function clampToPolygon(point: Vec2, polygon: readonly Vec2[], inset = 1): Vec2 {
  if (pointInPolygon(point, polygon)) {
    return point;
  }

  const nearest = nearestPointOnPolygon(point, polygon);
  const center = polygonCentroid(polygon);
  const dx = center.x - nearest.x;
  const dz = center.z - nearest.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: nearest.x + (dx / length) * inset,
    z: nearest.z + (dz / length) * inset
  };
}

export function boundingRadius(points: readonly Vec2[], center = averagePoint(points)): number {
  return points.reduce((max, point) => Math.max(max, distance(center, point)), 0);
}

export function makeCircle(center: Vec2, radius: number, steps = 28): Vec2[] {
  return Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius
    };
  });
}

export function lerpPoint(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t
  };
}

export function samplePolyline(points: readonly Vec2[], spacing: number): Vec2[] {
  const samples: Vec2[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const segmentLength = distance(a, b);
    const steps = Math.max(1, Math.floor(segmentLength / spacing));
    for (let step = 0; step <= steps; step += 1) {
      samples.push(lerpPoint(a, b, step / steps));
    }
  }
  return samples;
}
