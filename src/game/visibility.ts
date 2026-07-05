import { distanceToSegment } from "./geo";
import { lineIntersectsBox, lineIntersectsPolygon } from "./collision";
import type { CollisionObstacle, Vec2 } from "./types";

export interface VisibilityContext {
  playerPosition: Vec2;
  playerYaw: number;
  playerHeight: number;
  cameraFov: number;
  cameraAspect: number;
  obstacles: readonly CollisionObstacle[];
  isObstacleBypassed?: (obstacleId: string, point: Vec2) => boolean;
}

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

  const forward = playerForward2D(context.playerYaw);
  const dot = (dx / range) * forward.x + (dz / range) * forward.z;
  if (dot <= 0) return false;

  const horizontalFov = 2 * Math.atan(Math.tan(degToRad(context.cameraFov) / 2) * context.cameraAspect);
  const angle = Math.acos(clamp(dot, -1, 1));
  if (angle > horizontalFov / 2 + 0.08) return false;

  return !isLineOfSightBlocked(context.playerPosition, point, context, padding);
}

export function isLineOfSightBlocked(a: Vec2, b: Vec2, context: VisibilityContext, padding = 0): boolean {
  if (context.playerHeight > 2.6) {
    return false;
  }

  return context.obstacles.some((obstacle) => {
    if (context.isObstacleBypassed?.(obstacle.id, a)) return false;
    if (obstacle.shape === "box") {
      return lineIntersectsBox(a, b, obstacle.center, obstacle.halfX + padding, obstacle.halfZ + padding, obstacle.angle);
    }
    if (obstacle.shape === "polygon") {
      return lineIntersectsPolygon(a, b, obstacle.polygon, padding);
    }
    return distanceToSegment(obstacle.center, a, b) <= obstacle.radius + padding;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

