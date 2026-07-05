export interface Vec2 {
  x: number;
  z: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface LevelPath {
  id: string;
  label: string;
  kind: "rail" | "footway" | "cycleway" | "perimeter" | "service";
  points: Vec2[];
  width: number;
  surface?: "asphalt" | "concrete" | "gravel" | "sett" | "unknown";
  source?: string;
}

export interface Landmark {
  id: string;
  label: string;
  kind:
    | "park"
    | "oval"
    | "grandstand"
    | "tennis"
    | "court"
    | "bowls"
    | "playground"
    | "skate"
    | "basketball"
    | "toilets"
    | "bbq"
    | "rotunda"
    | "memorial"
    | "garden";
  polygon?: Vec2[];
  position?: Vec2;
  radius?: number;
}

export interface CircularObstacle {
  id: string;
  label: string;
  shape?: "circle";
  center: Vec2;
  radius: number;
}

export interface BoxObstacle {
  id: string;
  label: string;
  shape: "box";
  center: Vec2;
  halfX: number;
  halfZ: number;
  angle: number;
}

export interface PolygonObstacle {
  id: string;
  label: string;
  shape: "polygon";
  center: Vec2;
  polygon: Vec2[];
}

export type CollisionObstacle = CircularObstacle | BoxObstacle | PolygonObstacle;

export interface SignificantTreePoint {
  id: string;
  commonName: string;
  genus: string;
  species: string;
  height: number;
  dbh: number;
  position: Vec2;
}

export interface ElevationSample {
  position: Vec2;
  altitude: number;
  source: "vicmap-contour" | "vicmap-spot";
}

export interface MappedBuilding {
  id: string;
  label: string;
  polygon: Vec2[];
  height: number;
  material: "brick" | "timber" | "utility";
  collision: boolean;
}

export interface MappedFence {
  id: string;
  label: string;
  points: Vec2[];
}

export interface UpgradeStation {
  id: string;
  label: string;
  position: Vec2;
  upgradeId: "damage" | "fireRate" | "magazine" | "reload" | "spread";
}

export interface InteractableFixture {
  id: string;
  label: string;
  kind: "rotunda" | "grandstand" | "playground" | "skate" | "basketball" | "toilets";
  position: Vec2;
  radius: number;
  height: number;
  prompt: string;
  mode: "toggle" | "auto";
  bypassObstacleIds?: string[];
}

export interface AmenityPoint {
  id: string;
  label: string;
  kind: "bench" | "drinking_water" | "waste_basket" | "bicycle_parking" | "bbq" | "toilets" | "picnic_table" | "table_tennis";
  position: Vec2;
}

export interface WeaponSpawn {
  id: string;
  label: string;
  weaponId: "carbine" | "shotgun" | "smg" | "rifle";
  position: Vec2;
}

export interface LevelData {
  boundary: Vec2[];
  paths: LevelPath[];
  landmarks: Landmark[];
  treeLines: Vec2[][];
  treePoints: Vec2[];
  significantTrees: SignificantTreePoint[];
  elevationSamples: ElevationSample[];
  elevationMin: number;
  elevationMax: number;
  mappedBuildings: MappedBuilding[];
  mappedFences: MappedFence[];
  obstacles: CollisionObstacle[];
  spawnPoints: Vec2[];
  pickupPoints: Vec2[];
  upgradeStations: UpgradeStation[];
  interactables: InteractableFixture[];
  amenities: AmenityPoint[];
  weaponSpawns: WeaponSpawn[];
}

export interface RandomSource {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}
