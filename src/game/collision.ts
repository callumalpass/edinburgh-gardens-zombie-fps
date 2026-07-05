import { distance, distanceToSegment, nearestPointOnSegment, pointInPolygon } from "./geo";
import type { CollisionObstacle, InteractableFixture, Vec2 } from "./types";

export interface ObstacleBypassContext {
  activeFixtureId: string | null;
  interactables: readonly InteractableFixture[];
}

export function resolveObstacle(point: Vec2, radius: number, obstacle: CollisionObstacle): Vec2 {
  if (obstacle.shape === "box") {
    const dx = point.x - obstacle.center.x;
    const dz = point.z - obstacle.center.z;
    const cos = Math.cos(obstacle.angle);
    const sin = Math.sin(obstacle.angle);
    let localX = dx * cos + dz * sin;
    let localZ = -dx * sin + dz * cos;
    const expandedX = obstacle.halfX + radius;
    const expandedZ = obstacle.halfZ + radius;

    if (Math.abs(localX) >= expandedX || Math.abs(localZ) >= expandedZ) {
      return point;
    }
    if (pointWithinBoxAccessGap(localX, localZ, radius, obstacle)) {
      return point;
    }

    const pushX = expandedX - Math.abs(localX);
    const pushZ = expandedZ - Math.abs(localZ);
    if (pushX < pushZ) {
      localX = (localX < 0 ? -1 : 1) * expandedX;
    } else {
      localZ = (localZ < 0 ? -1 : 1) * expandedZ;
    }

    return {
      x: obstacle.center.x + localX * cos - localZ * sin,
      z: obstacle.center.z + localX * sin + localZ * cos
    };
  }

  if (obstacle.shape === "polygon") {
    let closest = obstacle.polygon[0];
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < obstacle.polygon.length; i += 1) {
      const candidate = nearestPointOnSegment(point, obstacle.polygon[i], obstacle.polygon[(i + 1) % obstacle.polygon.length]);
      const candidateDistance = distance(point, candidate);
      if (candidateDistance < closestDistance) {
        closest = candidate;
        closestDistance = candidateDistance;
      }
    }

    if (pointInPolygon(point, obstacle.polygon)) {
      const dx = closest.x - obstacle.center.x;
      const dz = closest.z - obstacle.center.z;
      const length = Math.hypot(dx, dz) || 1;
      return {
        x: closest.x + (dx / length) * radius,
        z: closest.z + (dz / length) * radius
      };
    }

    if (closestDistance < radius) {
      const dx = point.x - closest.x;
      const dz = point.z - closest.z;
      const length = Math.hypot(dx, dz) || 1;
      return {
        x: closest.x + (dx / length) * radius,
        z: closest.z + (dz / length) * radius
      };
    }
    return point;
  }

  const dist = distance(point, obstacle.center);
  const minDistance = obstacle.radius + radius;
  if (dist >= minDistance) {
    return point;
  }
  const dx = point.x - obstacle.center.x;
  const dz = point.z - obstacle.center.z;
  if (dist < 0.0001) {
    return {
      x: obstacle.center.x + minDistance,
      z: obstacle.center.z
    };
  }
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: obstacle.center.x + (dx / length) * minDistance,
    z: obstacle.center.z + (dz / length) * minDistance
  };
}

function pointWithinBoxAccessGap(localX: number, localZ: number, radius: number, obstacle: Extract<CollisionObstacle, { shape: "box" }>): boolean {
  return (
    obstacle.accessGaps?.some(
      (gap) =>
        Math.abs(localX - gap.localCenterX) <= gap.halfX + radius &&
        Math.abs(localZ - gap.localCenterZ) <= gap.halfZ + radius
    ) ?? false
  );
}

export function shouldBypassObstacle(obstacleId: string, point: Vec2, context: ObstacleBypassContext): boolean {
  const active = context.interactables.find((fixture) => fixture.id === context.activeFixtureId);
  if (active && fixtureCanBypass(active, obstacleId) && distance(point, active.position) <= active.radius + 5) {
    return true;
  }

  return context.interactables.some(
    (fixture) => fixture.mode === "auto" && fixtureCanBypass(fixture, obstacleId) && distance(point, fixture.position) <= fixture.radius
  );
}

function fixtureCanBypass(fixture: InteractableFixture, obstacleId: string): boolean {
  return fixture.bypassObstacleIds?.includes(obstacleId) ?? false;
}

export function lineIntersectsBox(a: Vec2, b: Vec2, center: Vec2, halfX: number, halfZ: number, angle: number): boolean {
  const toLocal = (point: Vec2) => {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: dx * cos + dz * sin,
      z: -dx * sin + dz * cos
    };
  };
  const start = toLocal(a);
  const end = toLocal(b);
  let tMin = 0;
  let tMax = 1;

  for (const axis of ["x", "z"] as const) {
    const min = axis === "x" ? -halfX : -halfZ;
    const max = axis === "x" ? halfX : halfZ;
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 0.0001) {
      if (start[axis] < min || start[axis] > max) return false;
      continue;
    }
    let t1 = (min - start[axis]) / delta;
    let t2 = (max - start[axis]) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return true;
}

export function lineIntersectsPolygon(a: Vec2, b: Vec2, polygon: Vec2[], padding: number): boolean {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) {
    return true;
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    if (segmentsIntersect(a, b, start, end) || distanceToSegment(start, a, b) <= padding || distanceToSegment(end, a, b) <= padding) {
      return true;
    }
  }
  return false;
}

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const orientation = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q.z - p.z) * (r.x - q.x) - (q.x - p.x) * (r.z - q.z));
  const onSegment = (p: Vec2, q: Vec2, r: Vec2) =>
    q.x <= Math.max(p.x, r.x) + 0.0001 &&
    q.x + 0.0001 >= Math.min(p.x, r.x) &&
    q.z <= Math.max(p.z, r.z) + 0.0001 &&
    q.z + 0.0001 >= Math.min(p.z, r.z);

  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}
