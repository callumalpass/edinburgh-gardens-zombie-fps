import type { InteractableFixture, InteractableRaisedFootprint, Vec2 } from "./types";

export function pointInInteractableRaisedFootprint(point: Vec2, fixture: InteractableFixture, padding = 0): boolean {
  if (!fixture.raisedFootprint) {
    return distance(point, fixture.position) <= fixture.radius + padding;
  }
  return pointInRaisedFootprint(point, fixture.raisedFootprint, padding);
}

export function pointInRaisedFootprint(point: Vec2, footprint: InteractableRaisedFootprint, padding = 0): boolean {
  if (footprint.shape === "circle") {
    return distance(point, footprint.center) <= footprint.radius + padding;
  }

  const dx = point.x - footprint.center.x;
  const dz = point.z - footprint.center.z;
  const cos = Math.cos(footprint.angle);
  const sin = Math.sin(footprint.angle);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  return Math.abs(localX) <= footprint.halfX + padding && Math.abs(localZ) <= footprint.halfZ + padding;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
