import { distance } from "./geo";
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
    const nearest = [...this.level.elevationSamples]
      .map((sample) => ({
        sample,
        distance: distance(point, sample.position)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12);

    for (const entry of nearest) {
      if (entry.distance < 0.1) {
        return entry.sample.altitude;
      }
      const weight = 1 / Math.max(20, entry.distance * entry.distance);
      weightedAltitude += entry.sample.altitude * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedAltitude / totalWeight : this.level.elevationMin;
  }
}

