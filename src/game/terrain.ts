import type { LevelData, Vec2 } from "./types";

export class TerrainSampler {
  constructor(private readonly level: LevelData) {}

  groundY(point: Vec2): number {
    return Math.max(0, this.altitudeAt(point) - this.level.elevationMin);
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
    const nearest: Array<{ altitude: number; distanceSquared: number }> = [];

    for (const sample of this.level.elevationSamples) {
      const dx = point.x - sample.position.x;
      const dz = point.z - sample.position.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < 0.01) {
        return sample.altitude;
      }

      if (nearest.length < 12 || distanceSquared < nearest[nearest.length - 1].distanceSquared) {
        nearest.push({ altitude: sample.altitude, distanceSquared });
        for (let index = nearest.length - 1; index > 0 && nearest[index].distanceSquared < nearest[index - 1].distanceSquared; index -= 1) {
          const previous = nearest[index - 1];
          nearest[index - 1] = nearest[index];
          nearest[index] = previous;
        }
        if (nearest.length > 12) {
          nearest.pop();
        }
      }
    }

    for (const entry of nearest) {
      const weight = 1 / Math.max(20, entry.distanceSquared);
      weightedAltitude += entry.altitude * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedAltitude / totalWeight : this.level.elevationMin;
  }
}
