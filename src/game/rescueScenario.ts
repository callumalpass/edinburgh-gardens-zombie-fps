import { polygonCentroid } from "./geo";
import type { LevelData, Vec2 } from "./types";

export const CARETAKER_KEY_ITEM_ID = "caretaker-key" as const;
export const CART_BATTERY_ITEM_ID = "cart-battery" as const;
export const CART_WHEEL_ITEM_ID = "cart-wheel" as const;
export const MAINTENANCE_CART_ID = "alfred-maintenance-cart";

export type RescueScenarioPhase =
  | "dormant"
  | "find-caretaker"
  | "take-key"
  | "unlock-dog"
  | "find-cart-parts"
  | "repair-cart"
  | "complete";

export interface RescueScenarioState {
  phase: RescueScenarioPhase;
  caretakerZombieId: number | null;
  caretakerSpawned: boolean;
  keyDropped: boolean;
  dogFreed: boolean;
  cartRepaired: boolean;
  unlockedGateIds: Set<string>;
}

export interface ScenarioGateDefinition {
  id: string;
  label: string;
  position: Vec2;
  angle: number;
  width: number;
  unlockItem: "caretaker-key" | "bolt-cutters";
  objectiveGate?: boolean;
}

export interface ScenarioBarricadeDefinition {
  id: string;
  position: Vec2;
  angle: number;
}

export interface RescueScenarioLayout {
  dogBuildingCenter: Vec2;
  dogDoorAngle: number;
  dogPosition: Vec2;
  caretakerSpawnPosition: Vec2;
  cartPosition: Vec2;
  cartAngle: number;
  batteryPosition: Vec2;
  wheelPosition: Vec2;
  gates: ScenarioGateDefinition[];
  barricades: ScenarioBarricadeDefinition[];
}

export function createInitialRescueScenarioState(): RescueScenarioState {
  return {
    phase: "dormant",
    caretakerZombieId: null,
    caretakerSpawned: false,
    keyDropped: false,
    dogFreed: false,
    cartRepaired: false,
    unlockedGateIds: new Set<string>()
  };
}

export function rescueScenarioObjective(state: RescueScenarioState): string | null {
  switch (state.phase) {
    case "dormant": return null;
    case "find-caretaker": return "Find the infected caretaker near the bowling green";
    case "take-key": return "Take the caretaker's key ring";
    case "unlock-dog": return "Unlock the north-toilets stall and rescue Miso";
    case "find-cart-parts": return "Find the cart battery and replacement wheel";
    case "repair-cart": return "Return to the maintenance cart and fit both parts";
    case "complete": return "Miso rescued · maintenance cart running";
  }
}

export function createRescueScenarioLayout(level: LevelData): RescueScenarioLayout {
  const northToilets = level.landmarks.find((landmark) => landmark.id === "north-toilets" && landmark.polygon);
  const dogBuildingCenter = northToilets?.polygon
    ? polygonCentroid(northToilets.polygon)
    : { x: -68.5, z: -248.3 };
  const stallApproach = level.amenities.find((amenity) => amenity.id === "north-toilets-south-west-stall-bank")?.position
    ?? add(dogBuildingCenter, { x: -1, z: 0 }, 7);
  const doorEdge = northToilets?.polygon
    ? nearestPolygonEdge(stallApproach, northToilets.polygon)
    : { point: stallApproach, tangent: { x: 0, z: 1 } };
  const doorOutward = normalized({
    x: stallApproach.x - dogBuildingCenter.x,
    z: stallApproach.z - dogBuildingCenter.z
  });
  const dogDoorPosition = add(doorEdge.point, doorOutward, 0.08);
  const dogDoorAngle = Math.atan2(-doorEdge.tangent.z, doorEdge.tangent.x);
  // Keep the waiting dog fully behind the authored wall/door bank. Once the
  // key turns, the runtime places him on the apron as he exits the stall.
  const dogPosition = add(dogDoorPosition, doorOutward, -2.25);

  const bowlingAccess = level.amenities.find((amenity) => amenity.id === "bowling-clubroom-access")?.position
    ?? { x: -248, z: 34 };
  const bowlingBuilding = level.mappedBuildings.find((building) => building.id === "osm-building-543505639");
  const caretakerSpawnPosition = moveAwayFromStructure(bowlingAccess, bowlingBuilding?.polygon, 2.4);

  const grandstandAccess = level.amenities.find((amenity) => amenity.id === "grandstand-changeroom-access")?.position
    ?? { x: -172, z: 86 };
  const grandstand = level.landmarks.find((landmark) => landmark.id === "grandstand" && landmark.polygon);
  const cartPosition = moveAwayFromStructure(grandstandAccess, grandstand?.polygon, 2.8);
  const cartOutward = normalized({
    x: cartPosition.x - (grandstand?.polygon ? polygonCentroid(grandstand.polygon).x : cartPosition.x + 1),
    z: cartPosition.z - (grandstand?.polygon ? polygonCentroid(grandstand.polygon).z : cartPosition.z)
  });
  const cartAngle = Math.atan2(cartOutward.x, cartOutward.z) + Math.PI * 0.5;

  const dogGate: ScenarioGateDefinition = {
    id: "north-toilets-rescue-stall-door",
    label: "Locked north-toilets stall",
    position: dogDoorPosition,
    angle: dogDoorAngle,
    width: 1.18,
    unlockItem: CARETAKER_KEY_ITEM_ID,
    objectiveGate: true
  };
  // These are temporary wave-three gameplay chains, not 2026 park fabric.
  // Never place them across the Hannah memorial gates or the restored
  // Sportsman's Memorial: doing so hid the real heritage entrances and made
  // their source-backed public passages impassable. This includes the roofed
  // Bowling Club–grandstand gateway now resolved from the highlighted aerial.
  // The chains instead span two ordinary service-path segments and disappear
  // when cut.
  const shortcutPaths = [
    level.paths.find((path) => path.id === "osm-210387722-bowling-service-track"),
    level.paths.find((path) => path.id === "osm-403753754-oval-west-connector")
  ].filter((path): path is NonNullable<typeof path> => Boolean(path && path.points.length >= 2));
  const shortcutLabels = ["Bowling private-track shortcut", "Oval service-lane shortcut"];
  const gates: ScenarioGateDefinition[] = [dogGate, ...shortcutPaths.map((path, index) => {
    const segmentIndex = Math.max(0, Math.floor((path.points.length - 1) * 0.5));
    const start = path.points[segmentIndex];
    const end = path.points[segmentIndex + 1];
    return {
      id: `locked-shortcut-${index + 1}`,
      label: shortcutLabels[index],
      position: { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 },
      angle: Math.atan2(end.z - start.z, end.x - start.x) + Math.PI * 0.5,
      width: index === 0 ? 3.6 : 3.2,
      unlockItem: "bolt-cutters" as const
    };
  })];

  // The repair hunt deliberately crosses the park instead of clustering
  // around the rescue building: east-lawn cache, south-west gatehouse and
  // the grandstand cart form three distinct legs well outside the spawn zone.
  const eastCache = furthestBy(level.pickupPoints, (point) => point.x) ?? { x: 257, z: -45 };
  const batteryPosition = { x: eastCache.x - 1.2, z: eastCache.z + 0.8 };
  const hiddenBike = level.rideableBikes.find((bike) => bike.id === "freeman-hidden-bike")?.position
    ?? { x: -306, z: 284 };
  const parkCenter = polygonCentroid(level.boundary);
  const wheelPosition = add(hiddenBike, normalized({ x: parkCenter.x - hiddenBike.x, z: parkCenter.z - hiddenBike.z }), 3.25);

  const remotePickupTargets = [
    { x: -29, z: -136 },
    { x: 7, z: 217 },
    { x: -108, z: -216 }
  ];
  const barricades = remotePickupTargets.map((target, index) => {
    const position = nearestPoint(target, level.pickupPoints) ?? target;
    return {
      id: `maintenance-barricade-${index + 1}`,
      position,
      angle: Math.atan2(parkCenter.z - position.z, parkCenter.x - position.x) + (index - 1) * 0.12
    };
  });

  return {
    dogBuildingCenter,
    dogDoorAngle,
    dogPosition,
    caretakerSpawnPosition,
    cartPosition,
    cartAngle,
    batteryPosition,
    wheelPosition,
    gates,
    barricades
  };
}

function moveAwayFromStructure(anchor: Vec2, polygon: readonly Vec2[] | undefined, clearance: number): Vec2 {
  if (!polygon || polygon.length < 3) return anchor;
  const center = polygonCentroid(polygon);
  return add(anchor, normalized({ x: anchor.x - center.x, z: anchor.z - center.z }), clearance);
}

function nearestPolygonEdge(point: Vec2, polygon: readonly Vec2[]): { point: Vec2; tangent: Vec2 } {
  let nearest = { point: polygon[0] ?? point, tangent: { x: 1, z: 0 }, distanceSq: Number.POSITIVE_INFINITY };
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const edge = { x: end.x - start.x, z: end.z - start.z };
    const lengthSq = edge.x * edge.x + edge.z * edge.z;
    const t = lengthSq > 0
      ? Math.max(0, Math.min(1, ((point.x - start.x) * edge.x + (point.z - start.z) * edge.z) / lengthSq))
      : 0;
    const candidate = { x: start.x + edge.x * t, z: start.z + edge.z * t };
    const distanceSq = (candidate.x - point.x) ** 2 + (candidate.z - point.z) ** 2;
    if (distanceSq < nearest.distanceSq) {
      nearest = { point: candidate, tangent: normalized(edge), distanceSq };
    }
  }
  return { point: nearest.point, tangent: nearest.tangent };
}

function furthestBy(points: readonly Vec2[], score: (point: Vec2) => number): Vec2 | null {
  return points.reduce<Vec2 | null>((best, point) => !best || score(point) > score(best) ? point : best, null);
}

function nearestPoint(target: Vec2, points: readonly Vec2[]): Vec2 | null {
  return points.reduce<Vec2 | null>((best, point) => {
    if (!best) return point;
    return squaredDistance(point, target) < squaredDistance(best, target) ? point : best;
  }, null);
}

function squaredDistance(a: Vec2, b: Vec2): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function add(point: Vec2, direction: Vec2, scale: number): Vec2 {
  return { x: point.x + direction.x * scale, z: point.z + direction.z * scale };
}

function normalized(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.z) || 1;
  return { x: vector.x / length, z: vector.z / length };
}
