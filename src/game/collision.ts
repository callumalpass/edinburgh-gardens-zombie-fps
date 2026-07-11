import { distance, distanceToSegmentSquared, nearestPointOnSegment, pointInPolygon } from "./geo";
import { RAISED_SURFACE_EDGE_TOLERANCE } from "./gameConfig";
import { pointInInteractableRaisedFootprint } from "./interactables";
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
      // Push through the nearest wall, not radially away from the polygon
      // centroid. Centroid-based normals are visibly wrong for L/T-shaped
      // Blender footprints and can move the player deeper into a concavity.
      let dx = closest.x - point.x;
      let dz = closest.z - point.z;
      if (Math.hypot(dx, dz) < 0.0001) {
        dx = closest.x - obstacle.center.x;
        dz = closest.z - obstacle.center.z;
      }
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
      (gap) => {
        // Access gaps run through the box along local Z. The capsule centre
        // must be radius-clear of both jambs, while the through-depth extends
        // by the radius so the player can approach from either side.
        const clearHalfWidth = Math.max(0, gap.halfX - radius);
        return (
          Math.abs(localX - gap.localCenterX) <= clearHalfWidth &&
          Math.abs(localZ - gap.localCenterZ) <= gap.halfZ + radius
        );
      }
    ) ?? false
  );
}

export function shouldBypassObstacle(obstacleId: string, point: Vec2, context: ObstacleBypassContext): boolean {
  const active = context.interactables.find((fixture) => fixture.id === context.activeFixtureId);
  if (
    active &&
    fixtureCanBypass(active, obstacleId) &&
    pointInInteractableRaisedFootprint(point, active, RAISED_SURFACE_EDGE_TOLERANCE)
  ) {
    return true;
  }

  return context.interactables.some(
    (fixture) =>
      fixture.mode === "auto" &&
      fixtureCanBypass(fixture, obstacleId) &&
      pointInInteractableRaisedFootprint(point, fixture, RAISED_SURFACE_EDGE_TOLERANCE)
  );
}

function fixtureCanBypass(fixture: InteractableFixture, obstacleId: string): boolean {
  return fixture.bypassObstacleIds?.includes(obstacleId) ?? false;
}

export function lineIntersectsBox(a: Vec2, b: Vec2, center: Vec2, halfX: number, halfZ: number, angle: number): boolean {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const startDx = a.x - center.x;
  const startDz = a.z - center.z;
  const endDx = b.x - center.x;
  const endDz = b.z - center.z;
  const startX = startDx * cos + startDz * sin;
  const startZ = -startDx * sin + startDz * cos;
  const endX = endDx * cos + endDz * sin;
  const endZ = -endDx * sin + endDz * cos;
  let tMin = 0;
  let tMax = 1;

  const deltaX = endX - startX;
  if (Math.abs(deltaX) < 0.0001) {
    if (startX < -halfX || startX > halfX) return false;
  } else {
    let tx1 = (-halfX - startX) / deltaX;
    let tx2 = (halfX - startX) / deltaX;
    if (tx1 > tx2) [tx1, tx2] = [tx2, tx1];
    tMin = Math.max(tMin, tx1);
    tMax = Math.min(tMax, tx2);
    if (tMin > tMax) return false;
  }

  const deltaZ = endZ - startZ;
  if (Math.abs(deltaZ) < 0.0001) {
    if (startZ < -halfZ || startZ > halfZ) return false;
  } else {
    let tz1 = (-halfZ - startZ) / deltaZ;
    let tz2 = (halfZ - startZ) / deltaZ;
    if (tz1 > tz2) [tz1, tz2] = [tz2, tz1];
    tMin = Math.max(tMin, tz1);
    tMax = Math.min(tMax, tz2);
    if (tMin > tMax) return false;
  }

  return true;
}

export function lineIntersectsPolygon(a: Vec2, b: Vec2, polygon: Vec2[], padding: number): boolean {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) {
    return true;
  }

  const paddingSquared = padding * padding;
  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    if (
      segmentsIntersect(a, b, start, end) ||
      distanceToSegmentSquared(start, a, b) <= paddingSquared ||
      distanceToSegmentSquared(end, a, b) <= paddingSquared
    ) {
      return true;
    }
  }
  return false;
}

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = segmentOrientation(a, b, c);
  const o2 = segmentOrientation(a, b, d);
  const o3 = segmentOrientation(c, d, a);
  const o4 = segmentOrientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(a, c, b)) return true;
  if (o2 === 0 && pointOnSegment(a, d, b)) return true;
  if (o3 === 0 && pointOnSegment(c, a, d)) return true;
  if (o4 === 0 && pointOnSegment(c, b, d)) return true;
  return false;
}

function segmentOrientation(p: Vec2, q: Vec2, r: Vec2): number {
  return Math.sign((q.z - p.z) * (r.x - q.x) - (q.x - p.x) * (r.z - q.z));
}

function pointOnSegment(p: Vec2, q: Vec2, r: Vec2): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + 0.0001 &&
    q.x + 0.0001 >= Math.min(p.x, r.x) &&
    q.z <= Math.max(p.z, r.z) + 0.0001 &&
    q.z + 0.0001 >= Math.min(p.z, r.z)
  );
}
