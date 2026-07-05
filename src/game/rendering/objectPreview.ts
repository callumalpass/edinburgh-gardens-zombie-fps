import { boundingRadius, distance, polygonCentroid } from "../geo";
import type { LevelData, LevelPath, PathSurfacePatch, Vec2 } from "../types";

export type ObjectPreviewTargetKind =
  | "landmark"
  | "mapped-building"
  | "mapped-fence"
  | "hardscape-line"
  | "path"
  | "path-surface-patch"
  | "street-edge"
  | "sports-fixture"
  | "amenity"
  | "park-life-detail"
  | "tree"
  | "upgrade-station";

export interface ObjectPreviewTarget {
  id: string;
  sourceId: string;
  sourceIndex?: number;
  kind: ObjectPreviewTargetKind;
  label: string;
  position: Vec2;
  radius: number;
  height: number;
}

export function createObjectPreviewTargets(level: LevelData): ObjectPreviewTarget[] {
  const targets: ObjectPreviewTarget[] = [];
  const add = (target: Omit<ObjectPreviewTarget, "id">) => {
    targets.push({
      ...target,
      id: `${target.kind}:${target.sourceId}`
    });
  };

  for (const landmark of level.landmarks) {
    if (landmark.kind === "park") continue;
    const position = landmark.position ?? (landmark.polygon ? polygonCentroid(landmark.polygon) : null);
    if (!position) continue;
    add({
      sourceId: landmark.id,
      kind: "landmark",
      label: landmark.label,
      position,
      radius: landmark.polygon ? boundingRadius(landmark.polygon, position) : landmark.radius ?? landmarkRadius(landmark.kind),
      height: landmarkHeight(landmark.kind)
    });
  }

  for (const building of level.mappedBuildings) {
    const position = polygonCentroid(building.polygon);
    add({
      sourceId: building.id,
      kind: "mapped-building",
      label: building.label,
      position,
      radius: boundingRadius(building.polygon, position) + 1.4,
      height: Math.max(2.2, building.height + 1.2)
    });
  }

  for (const [sourceIndex, fence] of level.mappedFences.entries()) {
    const position = averagePoint(fence.points);
    add({
      sourceId: fence.id,
      sourceIndex,
      kind: "mapped-fence",
      label: fence.label,
      position,
      radius: polylineRadius(fence.points, position) + 1.6,
      height: 2.2
    });
  }

  for (const [sourceIndex, line] of level.hardscapeLines.entries()) {
    const position = averagePoint(line.points);
    add({
      sourceId: line.id,
      sourceIndex,
      kind: "hardscape-line",
      label: line.label,
      position,
      radius: polylineRadius(line.points, position) + 1.8,
      height: Math.max(1.5, line.height + 0.8)
    });
  }

  for (const [sourceIndex, path] of level.paths.entries()) {
    const position = averagePoint(path.points);
    add({
      sourceId: path.id,
      sourceIndex,
      kind: "path",
      label: path.label,
      position,
      radius: polylineRadius(path.points, position) + path.width,
      height: 1.2
    });
  }

  for (const [sourceIndex, patch] of level.pathSurfacePatches.entries()) {
    add({
      sourceId: patch.id,
      sourceIndex,
      kind: "path-surface-patch",
      label: patch.label,
      position: patch.position,
      radius: pathSurfacePatchRadius(patch),
      height: 0.8
    });
  }

  for (const [sourceIndex, street] of level.streetEdges.entries()) {
    const position = averagePoint(street.points);
    add({
      sourceId: street.id,
      sourceIndex,
      kind: "street-edge",
      label: street.label,
      position,
      radius: polylineRadius(street.points, position) + street.width,
      height: 1.2
    });
  }

  for (const [sourceIndex, fixture] of level.sportsFixtures.entries()) {
    add({
      sourceId: fixture.id,
      sourceIndex,
      kind: "sports-fixture",
      label: fixture.label,
      position: fixture.position,
      radius: fixture.kind === "football-goal" ? fixture.width * 0.55 + 1 : 2.2,
      height: fixture.height + 0.9
    });
  }

  for (const [sourceIndex, amenity] of level.amenities.entries()) {
    add({
      sourceId: amenity.id,
      sourceIndex,
      kind: "amenity",
      label: amenity.label,
      position: amenity.position,
      radius: amenityRadius(amenity.kind),
      height: amenity.kind === "table_tennis" ? 1.7 : 2.2
    });
  }

  for (const [sourceIndex, detail] of level.parkLifeDetails.entries()) {
    add({
      sourceId: detail.id,
      sourceIndex,
      kind: "park-life-detail",
      label: detail.label,
      position: detail.position,
      radius: parkLifeRadius(detail.kind),
      height: detail.kind === "cricket-nets" ? 3.2 : 2.1
    });
  }

  for (const [sourceIndex, tree] of level.trees.entries()) {
    add({
      sourceId: tree.id,
      sourceIndex,
      kind: "tree",
      label: tree.label,
      position: tree.position,
      radius: Math.max(2.8, tree.canopyRadius * 0.85),
      height: Math.max(6, tree.height ?? tree.canopyRadius * 1.8)
    });
  }

  for (const [sourceIndex, station] of level.upgradeStations.entries()) {
    add({
      sourceId: station.id,
      sourceIndex,
      kind: "upgrade-station",
      label: station.label,
      position: station.position,
      radius: 2.8,
      height: 2.8
    });
  }

  return targets;
}

function averagePoint(points: readonly Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, z: 0 };
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  return { x: total.x / points.length, z: total.z / points.length };
}

function polylineRadius(points: readonly Vec2[], center: Vec2): number {
  return points.reduce((max, point) => Math.max(max, distance(point, center)), 0);
}

function landmarkRadius(kind: LevelData["landmarks"][number]["kind"]): number {
  if (kind === "bbq") return 4.2;
  if (kind === "rotunda") return 7;
  if (kind === "memorial") return 5.2;
  return 8;
}

function landmarkHeight(kind: LevelData["landmarks"][number]["kind"]): number {
  if (kind === "rotunda") return 9.2;
  if (kind === "grandstand") return 7.4;
  if (kind === "playground" || kind === "skate" || kind === "basketball") return 4.2;
  if (kind === "memorial") return 5.4;
  return 3.2;
}

function amenityRadius(kind: LevelData["amenities"][number]["kind"]): number {
  if (kind === "picnic_table") return 2.4;
  if (kind === "table_tennis") return 2.3;
  if (kind === "bicycle_parking") return 2.1;
  if (kind === "bbq") return 2.8;
  return 1.8;
}

function parkLifeRadius(kind: LevelData["parkLifeDetails"][number]["kind"]): number {
  if (kind === "picnic-blanket") return 3.2;
  if (kind === "casual-bike") return 2.1;
  if (kind === "training-cones") return 3.2;
  if (kind === "cricket-nets") return 5.8;
  if (kind === "chalk-mark") return 1.9;
  return 2.2;
}

function pathSurfacePatchRadius(patch: PathSurfacePatch): number {
  return Math.max(1.8, Math.hypot(patch.length, patch.width) * 0.55);
}

export function pathPreviewMaterialKey(path: LevelPath): "asphalt" | "concrete" | "gravel" | "path" {
  if (path.surface === "concrete" || path.kind === "steps") return "concrete";
  if (path.kind === "rail" || path.kind === "cycleway" || path.kind === "service" || path.surface === "asphalt") return "asphalt";
  if (path.kind === "perimeter" || path.surface === "gravel") return "gravel";
  return "path";
}
