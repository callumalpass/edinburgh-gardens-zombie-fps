import type { WorldItemId } from "./items";

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
  kind: "rail" | "footway" | "cycleway" | "perimeter" | "service" | "steps";
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
  angle?: number;
  courtStatus?: "active-clay" | "under-construction";
  gardenStyle?: "stormwater-filtration" | "stormwater-storage" | "ornamental-floral" | "ornamental-shrub" | "agapanthus";
  cover?: "dense-shrub";
  source?: string;
}

export type CollisionSourceKind = "landmark" | "mapped-building" | "mapped-fence" | "park-life-detail" | "sports-fixture" | "tree-collider";

export interface CollisionSourceRef {
  sourceObjectId: string;
  sourceObjectKind: CollisionSourceKind;
}

export interface BoxObstacleAccessGap {
  id: string;
  fixtureId?: string;
  localCenterX: number;
  localCenterZ: number;
  halfX: number;
  halfZ: number;
}

interface CollisionObstacleBase extends CollisionSourceRef {
  id: string;
  label: string;
  blocksSight?: boolean;
  jumpable?: boolean;
  jumpBypassMinHeight?: number;
}

export interface CircularObstacle extends CollisionObstacleBase {
  shape?: "circle";
  center: Vec2;
  radius: number;
}

export interface BoxObstacle extends CollisionObstacleBase {
  shape: "box";
  center: Vec2;
  halfX: number;
  halfZ: number;
  angle: number;
  accessGaps?: BoxObstacleAccessGap[];
}

export interface PolygonObstacle extends CollisionObstacleBase {
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

export type TreeProfile = "elm" | "gum" | "oak" | "jacaranda" | "kurrajong" | "generic";

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

export type TerrainModifierKind = "path-crown" | "path-shoulder" | "tree-root" | "drainage-swale" | "oval-banking" | "skate-bowl";

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

export interface TerrainEllipseModifier {
  id: string;
  label: string;
  kind: TerrainModifierKind;
  shape: "ellipse";
  center: Vec2;
  radiusX: number;
  radiusZ: number;
  angle: number;
  delta: number;
  source?: string;
}

export type TerrainModifier = TerrainLineModifier | TerrainRadialModifier | TerrainEllipseModifier;

export interface SkateBowlFeature {
  id: string;
  label: string;
  groupId?: string;
  center: Vec2;
  radiusX: number;
  radiusZ: number;
  angle: number;
  depth: number;
  exitAngle: number;
  exitWidth: number;
  difficulty: "beginner" | "deep";
  source?: string;
}

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
  facade?: {
    frontagePoint: Vec2;
    source: string;
  };
  source?: string;
  collision: boolean;
}

export interface MappedFence {
  id: string;
  label: string;
  points: Vec2[];
  height?: number;
  width?: number;
  jumpable?: boolean;
  jumpBypassMinHeight?: number;
  source?: string;
  gates?: Array<{
    id: string;
    label: string;
    position: Vec2;
    radius: number;
    source?: string;
  }>;
}

export type StructureShelterFootprint = Extract<InteractableRaisedFootprint, { shape: "circle" | "box" }>;

export interface StructureShelter {
  id: string;
  label: string;
  kind: "roof" | "verandah" | "shade-sail" | "grandstand-cover";
  footprint: StructureShelterFootprint;
  weatherProtection: number;
  linkedStructureId: string;
  source?: string;
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

export interface GroundSurfacePolygon {
  id: string;
  label: string;
  kind: "parking-apron" | "paved-area";
  material: "asphalt" | "concrete" | "gravel";
  polygon: Vec2[];
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

export type InteractableRaisedFootprint =
  | {
      shape: "circle";
      center: Vec2;
      radius: number;
    }
  | {
      shape: "box";
      center: Vec2;
      halfX: number;
      halfZ: number;
      angle: number;
    }
  | {
      shape: "polygon";
      center: Vec2;
      polygon: Vec2[];
    };

export interface InteractableFixture {
  id: string;
  label: string;
  kind: "building" | "rotunda" | "grandstand" | "playground" | "skate" | "basketball" | "toilets" | "tennis" | "cricket-nets" | "gate";
  position: Vec2;
  accessPosition?: Vec2;
  landingPosition?: Vec2;
  exitPosition?: Vec2;
  accessRadius?: number;
  accessKind?: "stairs" | "ladder" | "play-structure" | "frame" | "ramp" | "cage-frame";
  accessHeading?: number;
  radius: number;
  height: number;
  raisedFootprint?: InteractableRaisedFootprint;
  /** Terrain samples supporting a rigid Blender-authored deck or roof. */
  surfaceGroundPoints?: Vec2[];
  prompt: string;
  mode: "toggle" | "auto";
  bypassObstacleIds?: string[];
}

export type AmenityKind =
  | "bench"
  | "drinking_water"
  | "waste_basket"
  | "bicycle_parking"
  | "bbq"
  | "toilets"
  | "post_box"
  | "picnic_table"
  | "table_tennis"
  | "clubroom"
  | "changeroom"
  | "umpire_room"
  | "first_aid_room"
  | "gatehouse"
  | "maintenance_room"
  | "community_room"
  | "kitchenette"
  | "kiosk_hatch"
  | "utility_box"
  | "memorial_plaque";

export interface AmenityPoint {
  id: string;
  label: string;
  kind: AmenityKind;
  position: Vec2;
  angle?: number;
  linkedStructureId?: string;
  source?: string;
}

export interface ParkLifeDetail {
  id: string;
  label: string;
  kind:
    | "dog-sign"
    | "picnic-blanket"
    | "notice-board"
    | "broken-bike"
    | "training-cones"
    | "dog-water-bowl"
    | "picnic-cooler"
    | "sports-bag"
    | "chalk-mark"
    | "cricket-nets"
    | "construction-fence"
    | "works-materials"
    | "removed-tree-stump"
    | "park-rule-sign"
    | "heritage-gas-lamp"
    | "heritage-bollard"
    | "heritage-seat"
    | "interpretive-sign"
    | "chandler-fountain";
  position: Vec2;
  angle: number;
  bikeIssue?: "flat-tyres" | "broken-chain" | "locked";
  cricketNetLanes?: number;
  cricketNetEntranceCount?: number;
  cricketNetEnclosure?: "galvanised-pipe-cyclone-wire-cage";
  cricketNetSurface?: "concrete-artificial-turf";
  cricketNetRearMuralWall?: boolean;
  rule?: "dogs-on-leash" | "alcohol-hours" | "rotunda-stairs-no-power" | "access-friendly";
  source?: string;
}

export interface WeaponSpawn {
  id: string;
  label: string;
  weaponId: "knife" | "machete" | "carbine" | "shotgun" | "flareGun" | "smg" | "rifle";
  position: Vec2;
}

export interface RideableBikeSpawn {
  id: string;
  label: string;
  position: Vec2;
  angle: number;
  state?: "available" | "flat-tyres" | "locked";
  requiredItem?: WorldItemId;
  linkedDetailId?: string;
  rackId?: string;
}

export interface ItemSpawn {
  id: string;
  itemId: WorldItemId;
  label: string;
  position: Vec2;
  angle: number;
  source?: string;
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
  skateBowls: SkateBowlFeature[];
  mappedBuildings: MappedBuilding[];
  structureShelters: StructureShelter[];
  mappedFences: MappedFence[];
  hardscapeLines: HardscapeLine[];
  pathSurfacePatches: PathSurfacePatch[];
  groundSurfacePolygons: GroundSurfacePolygon[];
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
  itemSpawns: ItemSpawn[];
  rideableBike: RideableBikeSpawn;
  rideableBikes: RideableBikeSpawn[];
}

export interface RandomSource {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}
