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
  blocksSight?: boolean;
}

export interface BoxObstacle {
  id: string;
  label: string;
  shape: "box";
  center: Vec2;
  halfX: number;
  halfZ: number;
  angle: number;
  blocksSight?: boolean;
}

export interface PolygonObstacle {
  id: string;
  label: string;
  shape: "polygon";
  center: Vec2;
  polygon: Vec2[];
  blocksSight?: boolean;
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

export type TreeProfile = "elm" | "gum" | "oak" | "generic";

export interface MappedTree {
  id: string;
  label: string;
  position: Vec2;
  profile: TreeProfile;
  canopyRadius: number;
  canopyDensity: number;
  canopyGroup: "avenue" | "specimen" | "mapped";
  height?: number;
  dbh?: number;
  source?: string;
}

export interface TreeCollider {
  id: string;
  label: string;
  position: Vec2;
  radius: number;
  source?: string;
}

export interface ElevationSample {
  position: Vec2;
  altitude: number;
  source: "vicmap-contour" | "vicmap-spot";
}

export type TerrainModifierKind = "path-crown" | "path-shoulder" | "tree-root" | "drainage-swale" | "oval-banking";

export interface TerrainLineModifier {
  id: string;
  label: string;
  kind: TerrainModifierKind;
  shape: "line";
  points: Vec2[];
  innerWidth: number;
  outerWidth: number;
  delta: number;
  source?: string;
}

export interface TerrainRadialModifier {
  id: string;
  label: string;
  kind: TerrainModifierKind;
  shape: "radial";
  center: Vec2;
  radius: number;
  delta: number;
  source?: string;
}

export type TerrainModifier = TerrainLineModifier | TerrainRadialModifier;

export interface MappedBuilding {
  id: string;
  label: string;
  polygon: Vec2[];
  height: number;
  material: "brick" | "timber" | "utility";
  detailProfile?:
    | "tennis-pavilion"
    | "bowling-club"
    | "gatehouse"
    | "rotunda-pavilion"
    | "community-centre"
    | "bowling-shed"
    | "amenities";
  source?: string;
  collision: boolean;
}

export interface MappedFence {
  id: string;
  label: string;
  points: Vec2[];
}

export interface HardscapeLine {
  id: string;
  label: string;
  kind: "basalt-edging" | "bluestone-wall" | "bluestone-drain";
  points: Vec2[];
  width: number;
  height: number;
  source?: string;
}

export interface PathSurfacePatch {
  id: string;
  label: string;
  kind: "path-edge-wear" | "path-junction-wear" | "desire-path" | "gravel-feather" | "muddy-threshold";
  material: "dirt" | "worn-grass" | "gravel" | "leaf-litter";
  position: Vec2;
  angle: number;
  length: number;
  width: number;
  source?: string;
}

export interface StreetEdge {
  id: string;
  label: string;
  kind: "residential" | "trunk" | "primary";
  points: Vec2[];
  width: number;
  surface?: "asphalt" | "paved" | "unknown";
  hasTram?: boolean;
  source?: string;
}

export interface SportsFixture {
  id: string;
  label: string;
  kind: "football-goal" | "basketball-hoop";
  position: Vec2;
  angle: number;
  radius: number;
  width: number;
  height: number;
  source?: string;
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
  accessPosition?: Vec2;
  exitPosition?: Vec2;
  accessRadius?: number;
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

export interface ParkLifeDetail {
  id: string;
  label: string;
  kind: "dog-sign" | "picnic-blanket" | "notice-board" | "casual-bike" | "training-cones";
  position: Vec2;
  angle: number;
  source?: string;
}

export interface WeaponSpawn {
  id: string;
  label: string;
  weaponId: "knife" | "machete" | "carbine" | "shotgun" | "smg" | "rifle";
  position: Vec2;
}

export interface LevelData {
  boundary: Vec2[];
  paths: LevelPath[];
  landmarks: Landmark[];
  treeLines: Vec2[][];
  treePoints: Vec2[];
  significantTrees: SignificantTreePoint[];
  trees: MappedTree[];
  treeColliders: TreeCollider[];
  elevationSamples: ElevationSample[];
  elevationMin: number;
  elevationMax: number;
  terrainModifiers: TerrainModifier[];
  mappedBuildings: MappedBuilding[];
  mappedFences: MappedFence[];
  hardscapeLines: HardscapeLine[];
  pathSurfacePatches: PathSurfacePatch[];
  streetEdges: StreetEdge[];
  sportsFixtures: SportsFixture[];
  obstacles: CollisionObstacle[];
  spawnPoints: Vec2[];
  pickupPoints: Vec2[];
  upgradeStations: UpgradeStation[];
  interactables: InteractableFixture[];
  amenities: AmenityPoint[];
  parkLifeDetails: ParkLifeDetail[];
  weaponSpawns: WeaponSpawn[];
}

export interface RandomSource {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}
