import { boundingRadius, distance, polygonCentroid } from "../geo";
import type {
  GroundSurfacePolygon,
  LevelData,
  LevelPath,
  PathSurfacePatch,
  SkateBowlFeature,
  StructureShelter,
  Vec2
} from "../types";
import { WEAPON_DEFINITIONS, type WeaponId } from "../weapons";
import type { ZombieType } from "../waves";
import type { WorldItemId } from "../items";
import type { PickupKind } from "./MeshFactory";

export type ObjectPreviewTargetKind =
  | "landmark"
  | "mapped-building"
  | "structure-shelter"
  | "mapped-fence"
  | "hardscape-line"
  | "path"
  | "path-surface-patch"
  | "ground-surface-polygon"
  | "street-edge"
  | "sports-fixture"
  | "skate-bowl"
  | "amenity"
  | "park-life-detail"
  | "rideable-bike"
  | "tree"
  | "upgrade-station"
  | "weapon-spawn"
  | "item-spawn"
  | "weapon-model"
  | "pickup-item"
  | "zombie-model";

export interface ObjectPreviewTarget {
  id: string;
  sourceId: string;
  sourceIndex?: number;
  kind: ObjectPreviewTargetKind;
  label: string;
  position: Vec2;
  radius: number;
  height: number;
  viewAngle?: number;
  viewAngleOffsets?: readonly number[];
  elevatedViews?: readonly boolean[];
  detailViewPosition?: Vec2;
  detailViewRadius?: number;
  weaponId?: WeaponId;
  itemId?: WorldItemId;
  pickupKind?: PickupKind;
  zombieType?: ZombieType;
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
      radius:
        landmark.kind === "memorial"
          ? Math.max(6.4, landmark.radius ?? 0)
          : landmark.polygon
            ? boundingRadius(landmark.polygon, position)
            : landmark.radius ?? landmarkRadius(landmark.kind),
      height: landmarkHeight(landmark.kind),
      viewAngle: landmarkViewAngle(landmark, level)
    });
  }

  for (const building of level.mappedBuildings) {
    const position = polygonCentroid(building.polygon);
    const isRotunda = building.detailProfile === "rotunda-pavilion";
    const isBowlingClub = building.detailProfile === "bowling-club";
    add({
      sourceId: building.id,
      kind: "mapped-building",
      label: building.label,
      position,
      radius: isRotunda ? 8.2 : boundingRadius(building.polygon, position) + 1.4,
      height: isRotunda ? 9.8 : isBowlingClub ? 6.1 : Math.max(2.2, building.height + 1.2),
      viewAngle: buildingFrontViewAngle(building),
      viewAngleOffsets: isRotunda ? [0, Math.PI / 4, Math.PI, -Math.PI / 4] : undefined,
      elevatedViews: isRotunda ? [false, true, false, true] : isBowlingClub ? [false, false, false, false] : undefined
    });
  }

  for (const shelter of level.structureShelters) {
    add({
      sourceId: shelter.id,
      kind: "structure-shelter",
      label: shelter.label,
      position: shelter.footprint.center,
      radius: structureShelterRadius(shelter),
      height: structureShelterHeight(shelter, level)
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
      height: Math.max(1.5, line.height + 0.8),
      viewAngle: polylineNormalViewAngle(line.points),
      viewAngleOffsets: [0, Math.PI / 6, Math.PI, -Math.PI / 6],
      elevatedViews: [true, false, true, false],
      detailViewPosition: longestSegmentMidpoint(line.points),
      detailViewRadius: 6
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
      height: 1.2,
      viewAngle: polylineNormalViewAngle(path.points),
      viewAngleOffsets: [0, Math.PI / 6, Math.PI, -Math.PI / 6],
      elevatedViews: [true, false, true, false],
      detailViewPosition: longestSegmentMidpoint(path.points),
      detailViewRadius: Math.max(6, Math.min(10, path.width * 2.8))
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

  for (const [sourceIndex, surface] of level.groundSurfacePolygons.entries()) {
    const position = polygonCentroid(surface.polygon);
    add({
      sourceId: surface.id,
      sourceIndex,
      kind: "ground-surface-polygon",
      label: surface.label,
      position,
      radius: groundSurfacePolygonRadius(surface),
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
      radius: fixture.kind === "football-goal" ? fixture.width * 0.75 + 1 : 2.2,
      height: fixture.height + 0.9,
      viewAngle: Math.PI / 2 - fixture.angle,
      viewAngleOffsets: [0, Math.PI / 4, Math.PI, -Math.PI / 4]
    });
  }

  for (const [sourceIndex, bowl] of level.skateBowls.entries()) {
    add({
      sourceId: bowl.id,
      sourceIndex,
      kind: "skate-bowl",
      label: bowl.label,
      position: bowl.center,
      radius: skateBowlRadius(bowl),
      height: Math.max(2.2, bowl.depth + 1.2)
    });
  }

  for (const [sourceIndex, amenity] of level.amenities.entries()) {
    const linkedBuilding = amenity.linkedStructureId
      ? level.mappedBuildings.find((candidate) => candidate.id === amenity.linkedStructureId)
      : undefined;
    const linkedLandmark = amenity.linkedStructureId
      ? level.landmarks.find((candidate) => candidate.id === amenity.linkedStructureId)
      : undefined;
    const linkedCenter = linkedBuilding
      ? polygonCentroid(linkedBuilding.polygon)
      : linkedLandmark?.position ?? (linkedLandmark?.polygon ? polygonCentroid(linkedLandmark.polygon) : undefined);
    const linkedContextRadius = linkedBuilding
      ? Math.max(5.8, Math.min(8.2, boundingRadius(linkedBuilding.polygon, polygonCentroid(linkedBuilding.polygon)) * 0.48))
      : linkedLandmark
        ? 6.4
        : undefined;
    add({
      sourceId: amenity.id,
      sourceIndex,
      kind: "amenity",
      label: amenity.label,
      position: amenity.position,
      radius: linkedContextRadius ?? amenityRadius(amenity.kind),
      height: linkedBuilding
        ? Math.max(3.4, linkedBuilding.height + 1.2)
        : linkedLandmark
          ? landmarkHeight(linkedLandmark.kind)
          : amenity.kind === "table_tennis"
            ? 1.7
            : 2.2,
      viewAngle: linkedCenter
        ? Math.atan2(amenity.position.z - linkedCenter.z, amenity.position.x - linkedCenter.x)
        : undefined,
      viewAngleOffsets: linkedCenter ? [0, Math.PI / 6, Math.PI, -Math.PI / 6] : undefined
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
      height:
        detail.kind === "cricket-nets"
          ? 3.2
          : detail.kind === "heritage-gas-lamp"
            ? 4.4
            : detail.kind === "chandler-fountain"
              ? 3.0
          : detail.kind === "construction-fence" || detail.kind === "works-materials"
            ? 2.4
            : detail.kind === "removed-tree-stump"
              ? 1.2
              : 2.1
    });
  }

  for (const bike of level.rideableBikes ?? [level.rideableBike]) {
    add({
      sourceId: bike.id,
      kind: "rideable-bike",
      label: bike.label,
      position: bike.position,
      radius: 3.1,
      height: 2.4
    });
  }

  for (const [sourceIndex, tree] of level.trees.entries()) {
    add({
      sourceId: tree.id,
      sourceIndex,
      kind: "tree",
      label: tree.label,
      position: tree.position,
      // The renderer deliberately varies crown lobes and trunk scale. Frame the
      // largest possible silhouette rather than the nominal inventory radius so
      // the visual audit never crops a mature canopy and hides defects at its edge.
      radius: Math.max(3.6, tree.canopyRadius * 1.55),
      height: tree.height
        ? Math.max(15.5, tree.height * 1.65)
        : Math.max(22, tree.canopyRadius * 2.8)
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

  for (const [sourceIndex, spawn] of level.weaponSpawns.entries()) {
    add({
      sourceId: spawn.id,
      sourceIndex,
      kind: "weapon-spawn",
      label: spawn.label,
      position: spawn.position,
      radius: 3.1,
      height: 2.4,
      weaponId: spawn.weaponId
    });
  }

  for (const [sourceIndex, spawn] of level.itemSpawns.entries()) {
    add({
      sourceId: spawn.id,
      sourceIndex,
      kind: "item-spawn",
      label: spawn.label,
      position: spawn.position,
      radius: spawn.itemId === "ladder" ? 3.2 : spawn.itemId === "skateboard" ? 2.4 : 1.8,
      height: spawn.itemId === "ladder" ? 2.4 : 1.8,
      itemId: spawn.itemId
    });
  }

  for (const weaponId of Object.keys(WEAPON_DEFINITIONS) as WeaponId[]) {
    const definition = WEAPON_DEFINITIONS[weaponId];
    add({
      sourceId: weaponId,
      kind: "weapon-model",
      label: definition.name,
      position: { x: 0, z: 0 },
      radius: weaponId === "rifle" || weaponId === "shotgun" ? 2.6 : 2.1,
      height: 1.8,
      weaponId
    });
  }

  for (const pickupKind of ["ammo", "health", "scrap"] as PickupKind[]) {
    add({
      sourceId: pickupKind,
      kind: "pickup-item",
      label: `${pickupKind[0].toUpperCase()}${pickupKind.slice(1)} pickup`,
      position: { x: 0, z: 0 },
      radius: 1.8,
      height: 1.8,
      pickupKind
    });
  }

  for (const zombieType of ["shambler", "sprinter", "bloater", "crawler", "screamer"] as ZombieType[]) {
    add({
      sourceId: zombieType,
      kind: "zombie-model",
      label: `${zombieType[0].toUpperCase()}${zombieType.slice(1)} zombie`,
      position: { x: 0, z: 0 },
      radius: zombieType === "bloater" ? 2.8 : 2.2,
      height: zombieType === "crawler" ? 1.8 : zombieType === "bloater" ? 4.5 : 3.5,
      zombieType
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

function polylineNormalViewAngle(points: readonly Vec2[]): number | undefined {
  let longest = 0;
  let angle: number | undefined;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distance(points[index], points[index + 1]);
    if (length <= longest) continue;
    longest = length;
    angle = Math.atan2(points[index + 1].z - points[index].z, points[index + 1].x - points[index].x) + Math.PI / 2;
  }
  return angle;
}

function longestSegmentMidpoint(points: readonly Vec2[]): Vec2 | undefined {
  let longest = 0;
  let midpoint: Vec2 | undefined;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distance(points[index], points[index + 1]);
    if (length <= longest) continue;
    longest = length;
    midpoint = {
      x: (points[index].x + points[index + 1].x) * 0.5,
      z: (points[index].z + points[index + 1].z) * 0.5
    };
  }
  return midpoint;
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
  if (kind === "memorial") return 7.2;
  return 3.2;
}

function landmarkViewAngle(landmark: LevelData["landmarks"][number], level: LevelData): number | undefined {
  if (landmark.kind !== "grandstand" || !landmark.polygon) return undefined;
  const oval = level.landmarks.find((candidate) => candidate.kind === "oval" && candidate.polygon);
  if (!oval?.polygon) return undefined;
  const center = polygonCentroid(landmark.polygon);
  const ovalCenter = polygonCentroid(oval.polygon);
  return Math.atan2(ovalCenter.z - center.z, ovalCenter.x - center.x);
}

function buildingFrontViewAngle(building: LevelData["mappedBuildings"][number]): number | undefined {
  if (!building.facade?.frontagePoint || building.polygon.length < 2) return undefined;
  const center = polygonCentroid(building.polygon);
  let longestAngle = 0;
  let longestLength = -1;
  for (let index = 0; index < building.polygon.length; index += 1) {
    const a = building.polygon[index];
    const b = building.polygon[(index + 1) % building.polygon.length];
    const length = distance(a, b);
    if (length > longestLength) {
      longestLength = length;
      longestAngle = Math.atan2(b.z - a.z, b.x - a.x);
    }
  }
  const dx = building.facade.frontagePoint.x - center.x;
  const dz = building.facade.frontagePoint.z - center.z;
  const localZ = -dx * Math.sin(longestAngle) + dz * Math.cos(longestAngle);
  if (localZ < 0) longestAngle += Math.PI;
  return longestAngle + Math.PI / 2;
}

function amenityRadius(kind: LevelData["amenities"][number]["kind"]): number {
  if (kind === "picnic_table") return 2.4;
  if (kind === "table_tennis") return 2.3;
  if (kind === "bicycle_parking") return 2.1;
  if (kind === "bbq") return 2.8;
  if (
    kind === "clubroom" ||
    kind === "changeroom" ||
    kind === "umpire_room" ||
    kind === "first_aid_room" ||
    kind === "gatehouse" ||
    kind === "maintenance_room" ||
    kind === "community_room" ||
    kind === "kitchenette" ||
    kind === "kiosk_hatch" ||
    kind === "utility_box" ||
    kind === "memorial_plaque"
  ) {
    return 2.6;
  }
  return 1.8;
}

function parkLifeRadius(kind: LevelData["parkLifeDetails"][number]["kind"]): number {
  if (kind === "picnic-blanket") return 3.2;
  if (kind === "broken-bike") return 2.1;
  if (kind === "training-cones") return 3.2;
  if (kind === "cricket-nets") return 11.0;
  if (kind === "construction-fence") return 5.2;
  if (kind === "works-materials") return 3.6;
  if (kind === "removed-tree-stump") return 2.2;
  if (kind === "park-rule-sign") return 1.9;
  if (kind === "heritage-gas-lamp") return 2.8;
  if (kind === "heritage-bollard") return 1.4;
  if (kind === "heritage-seat") return 2.7;
  if (kind === "interpretive-sign") return 2.3;
  if (kind === "chandler-fountain") return 2.6;
  if (kind === "chalk-mark") return 1.9;
  return 2.2;
}

function pathSurfacePatchRadius(patch: PathSurfacePatch): number {
  return Math.max(1.8, Math.hypot(patch.length, patch.width) * 0.55);
}

function groundSurfacePolygonRadius(surface: GroundSurfacePolygon): number {
  return Math.max(1.8, boundingRadius(surface.polygon, polygonCentroid(surface.polygon)) + 0.8);
}

function structureShelterRadius(shelter: StructureShelter): number {
  if (shelter.footprint.shape === "circle") {
    return shelter.footprint.radius + 1.8;
  }
  return Math.hypot(shelter.footprint.halfX, shelter.footprint.halfZ) + 1.8;
}

function structureShelterHeight(shelter: StructureShelter, level: LevelData): number {
  const building = level.mappedBuildings.find((candidate) => candidate.id === shelter.linkedStructureId);
  if (building) return Math.max(3.2, building.height + 1.4);
  if (shelter.linkedStructureId === "grandstand") return 8.2;
  return shelter.kind === "shade-sail" ? 4.8 : 9.2;
}

function skateBowlRadius(bowl: SkateBowlFeature): number {
  return Math.hypot(bowl.radiusX, bowl.radiusZ) + 1.8;
}

export function pathPreviewMaterialKey(path: LevelPath): "asphalt" | "concrete" | "gravel" | "path" {
  if (path.surface === "concrete" || path.kind === "steps") return "concrete";
  if (path.kind === "rail" || path.kind === "cycleway" || path.kind === "service" || path.surface === "asphalt") return "asphalt";
  if (path.kind === "perimeter" || path.surface === "gravel") return "gravel";
  return "path";
}
