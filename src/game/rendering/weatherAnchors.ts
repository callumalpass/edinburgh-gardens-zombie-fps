import { polygonCentroid } from "../geo";
import type { LevelData, Vec2 } from "../types";

export function collectWeatherAnchors(level: LevelData, start: Vec2, limit = 140): Vec2[] {
  const anchors: Vec2[] = [{ x: start.x, z: start.z }];
  const addAnchor = (point: Vec2 | undefined) => {
    if (point) {
      anchors.push({ x: point.x, z: point.z });
    }
  };

  level.upgradeStations.forEach((station) => addAnchor(station.position));
  level.weaponSpawns.forEach((spawn) => addAnchor(spawn.position));
  addAnchor(level.rideableBike.position);
  level.landmarks.forEach((landmark) => addAnchor(landmark.position ?? (landmark.polygon ? polygonCentroid(landmark.polygon) : undefined)));
  level.amenities.forEach((amenity, index) => {
    if (index % 8 === 0) {
      addAnchor(amenity.position);
    }
  });

  level.paths.forEach((path) => {
    if (path.points.length === 0) {
      return;
    }
    addAnchor(path.points[0]);
    addAnchor(path.points[Math.floor(path.points.length * 0.5)]);
    addAnchor(path.points[path.points.length - 1]);
  });

  const uniqueAnchors = new Map<string, Vec2>();
  anchors.forEach((anchor) => {
    const key = `${Math.round(anchor.x / 8)}:${Math.round(anchor.z / 8)}`;
    if (!uniqueAnchors.has(key)) {
      uniqueAnchors.set(key, anchor);
    }
  });

  return [...uniqueAnchors.values()].slice(0, limit);
}
