import * as THREE from "three";
import { WORLD_SCALE, distance, distanceToSegment, geoToWorld, makeCircle, nearestPointOnPolygon, pointInPolygon, polygonCentroid } from "../geo";
import {
  AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES,
  AUSTRALIAN_RULES_CENTRE_SQUARE_METRES,
  AUSTRALIAN_RULES_FIFTY_ARC_METRES,
  AUSTRALIAN_RULES_GOAL_SQUARE_DEPTH_METRES,
  AUSTRALIAN_RULES_GOAL_POST_SPACING_METRES,
  AUSTRALIAN_RULES_INNER_CIRCLE_DIAMETER_METRES,
  AUSTRALIAN_RULES_OUTER_CIRCLE_DIAMETER_METRES,
  CRICKET_BOWLING_CREASE_LENGTH_METRES,
  CRICKET_PITCH_LENGTH_METRES,
  CRICKET_PITCH_WIDTH_METRES,
  CRICKET_POPPING_CREASE_LENGTH_METRES,
  CRICKET_POPPING_CREASE_OFFSET_METRES,
  CRICKET_RETURN_CREASE_LENGTH_METRES,
  CRICKET_STUMP_HEIGHT_METRES,
  CRICKET_WICKET_WIDTH_METRES,
  footballPostLocalOffsets
} from "../sportsFixtures";
import type {
  AmenityPoint,
  GroundSurfacePolygon,
  HardscapeLine,
  LevelData,
  LevelPath,
  Landmark,
  MappedBuilding,
  MappedFence,
  MappedTree,
  ParkLifeDetail,
  PathSurfacePatch,
  RandomSource,
  SkateBowlFeature,
  SportsFixture,
  StructureShelter,
  StreetEdge,
  TreeProfile,
  UpgradeStation,
  Vec2
} from "../types";
import { MELBOURNE_ANIME_PALETTE, createAnimeToonRamp, tuneAnimeMaterial } from "./animeStyle";
import { MeshFactory } from "./MeshFactory";
import { pathPreviewMaterialKey, type ObjectPreviewTarget } from "./objectPreview";
import { instantiateRotundaAsset } from "./RotundaAsset";
import {
  ENTRANCE_PAVILION_ASSET_DEPTH,
  ENTRANCE_PAVILION_ASSET_LENGTH,
  instantiateEntrancePavilionAsset
} from "./EntrancePavilionAsset";
import {
  BOWLING_CLUB_ASSET_DEPTH,
  BOWLING_CLUB_ASSET_LENGTH,
  instantiateBowlingClubAsset
} from "./BowlingClubAsset";
import {
  GRANDSTAND_ASSET_DEPTH,
  GRANDSTAND_ASSET_LENGTH,
  instantiateGrandstandAsset
} from "./GrandstandAsset";
import {
  EMELY_BAKER_ASSET_DEPTH,
  EMELY_BAKER_ASSET_LENGTH,
  instantiateEmelyBakerAsset
} from "./EmelyBakerAsset";
import {
  ALFRED_CRESCENT_PAVILION_ASSET_DEPTH,
  ALFRED_CRESCENT_PAVILION_ASSET_LENGTH,
  instantiateAlfredCrescentPavilionAsset
} from "./AlfredCrescentPavilionAsset";
import {
  NORTH_TOILETS_ASSET_DEPTH,
  NORTH_TOILETS_ASSET_LENGTH,
  instantiateNorthToiletsAsset
} from "./NorthToiletsAsset";
import { instantiateSportsmansMemorialAsset } from "./SportsmansMemorialAsset";
import {
  createTerrainOverlayDiscGeometry,
  createTerrainOverlayEllipseGeometry,
  createTerrainOverlayRectGeometry
} from "./terrainOverlay";
import type { TimeOfDayState } from "./timeOfDay";
import type { WeatherState } from "./weather";
import { RENDER_QUALITY_SETTINGS, type RenderQualityLevel } from "./renderQuality";
import {
  TerrainSupport,
  cleanPolygon as cleanWorldPolygon,
  localPoint as localWorldPoint,
  pointInRotatedRect as pointInWorldRotatedRect,
  stableNoise as stableWorldNoise,
  worldToLocal as worldPointToLocal
} from "./worldGeometry";

const COLLISION_Y = 0.04;
const PATH_SHOULDER_SURFACE_Y = COLLISION_Y;
const PATH_SURFACE_Y = COLLISION_Y + 0.033;
const PATH_CAP_SURFACE_Y = COLLISION_Y + 0.038;
const PATH_MARKING_SURFACE_Y = COLLISION_Y + 0.101;
const PATH_STRIPE_SURFACE_Y = COLLISION_Y + 0.097;
const PATH_TREAD_SURFACE_Y = COLLISION_Y + 0.108;
const PATH_PATCH_SURFACE_Y = COLLISION_Y + 0.103;
const PATH_JUNCTION_PATCH_SURFACE_Y = COLLISION_Y + 0.123;
const WET_PATH_SHEEN_SURFACE_Y = COLLISION_Y + 0.135;
const TERRAIN_GRID_STEP = 7.5;
const TERRAIN_EDGE_PAD = 9;
const TREE_SCALE_MULTIPLIER = 1.22;
const GRASS_SAMPLE_STEP = 5.2;
const GRASS_CLUSTER_LIMIT = 5600;
const GRASS_PATH_CLEARANCE = 1.25;
const FLOATING_WORLD_LABELS_ENABLED = false;
const WORLD_TOON_RAMP = createAnimeToonRamp();
const TREE_RENDER_CHUNK_SIZE = 72;

export interface TreeVisualMassing {
  height: number;
  canopyWidth: number;
  canopyHeight: number;
}

export function treeVisualMassing(tree: Pick<MappedTree, "id" | "source" | "canopyGroup">): TreeVisualMassing {
  if (isYoungReplacementTreeRecord(tree)) {
    return { height: 1, canopyWidth: 1, canopyHeight: 1 };
  }
  if (tree.canopyGroup === "specimen") {
    return { height: 1.24, canopyWidth: 1.12, canopyHeight: 1.06 };
  }
  if (tree.canopyGroup === "avenue") {
    return { height: 1.1, canopyWidth: 1.1, canopyHeight: 1.04 };
  }
  return { height: 1, canopyWidth: 1, canopyHeight: 1 };
}

export function resolveTreeTrunkHeight(tree: Pick<MappedTree, "id" | "source" | "canopyGroup" | "height">, proceduralHeight: number): number {
  const massing = treeVisualMassing(tree);
  if (isYoungReplacementTreeRecord(tree)) return proceduralHeight;
  if (tree.canopyGroup === "specimen" && tree.height) {
    // The crown sits above this point, so four-fifths of recorded total height
    // is a useful trunk/crown-base target. Cap the correction to preserve park
    // sightlines and avoid one dataset value dominating the combat space.
    const measuredCrownBase = tree.height * 0.8;
    return THREE.MathUtils.clamp(measuredCrownBase, proceduralHeight, proceduralHeight * massing.height);
  }
  return proceduralHeight * massing.height;
}

function isYoungReplacementTreeRecord(tree: Pick<MappedTree, "id" | "source">): boolean {
  return tree.id.startsWith("yarra-replacement-tree-") || (tree.source?.includes("35 semi-mature shade trees") ?? false);
}

type StyledSurfaceMaterial = THREE.MeshStandardMaterial | THREE.MeshToonMaterial;

interface TreeMaterialSet {
  trunk: THREE.Material;
  leaf: THREE.Material;
  leafHighlight: THREE.Material;
  leafShadow: THREE.Material;
  paleBark: THREE.Material;
}

interface TreeInstanceColors {
  trunk: THREE.Color;
  leaf: THREE.Color;
  leafHighlight: THREE.Color;
  leafShadow: THREE.Color;
  paleBark: THREE.Color;
}

interface TreeInstanceBucket {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
  castShadow: boolean;
  receiveShadow: boolean;
  kind: string;
  chunkKey: string;
  lod: "full" | "far";
}

interface TreeRenderChunk {
  center: THREE.Vector2;
  fullMeshes: THREE.InstancedMesh[];
  farMeshes: THREE.InstancedMesh[];
  fullVisible: boolean;
  farVisible: boolean;
}

interface ParkEntrance {
  position: Vec2;
  angle: number;
  width: number;
  sign: boolean;
  name: string;
  transit: "tram" | "rail-trail" | "neighbourhood";
}

interface OvalMarkingFrame {
  center: Vec2;
  rotation: number;
  halfWidth: number;
  halfLength: number;
  goalLineZ: [number, number];
}

export interface GameMaterials {
  grass: StyledSurfaceMaterial;
  grassBlade: StyledSurfaceMaterial;
  path: StyledSurfaceMaterial;
  gravel: StyledSurfaceMaterial;
  asphalt: StyledSurfaceMaterial;
  concrete: StyledSurfaceMaterial;
  court: StyledSurfaceMaterial;
  rubber: StyledSurfaceMaterial;
  mulch: StyledSurfaceMaterial;
  dirt: StyledSurfaceMaterial;
  leafLitter: StyledSurfaceMaterial;
  wornGrass: StyledSurfaceMaterial;
  puddle: THREE.MeshStandardMaterial;
  hedge: StyledSurfaceMaterial;
  line: THREE.MeshBasicMaterial;
  timber: StyledSurfaceMaterial;
  metal: THREE.MeshStandardMaterial;
  brick: StyledSurfaceMaterial;
  basalt: StyledSurfaceMaterial;
  darkOpening: THREE.MeshBasicMaterial;
  zombie: StyledSurfaceMaterial;
  zombieDark: StyledSurfaceMaterial;
}

export class WorldBuilder {
  private renderedTreeCount = 0;
  private renderedGrassClumpCount = 0;
  private renderedWetPathSheenCount = 0;
  private renderedLampSpillCount = 0;
  private suppressLabels = false;
  private readonly pendingAssetLoads: Promise<void>[] = [];
  private readonly detailMaterialCache = new Map<string, THREE.Material>();
  private readonly treeMaterialCache = new Map<string, TreeMaterialSet>();
  private readonly treeTrunkGeometry = new THREE.CylinderGeometry(0.72, 1, 1, 8);
  private readonly treeBranchGeometry = new THREE.CylinderGeometry(0.55, 1, 1, 6);
  private readonly treeRootGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly treeCanopyGeometry = new THREE.IcosahedronGeometry(1, 2);
  private readonly treeCanopyCoreGeometry = new THREE.IcosahedronGeometry(1, 1);
  private readonly treePaleBarkGeometry = new THREE.CylinderGeometry(0.74, 0.88, 1, 8);
  private readonly treeLodTrunkGeometry = new THREE.CylinderGeometry(0.72, 1, 1, 5);
  private readonly treeLodCanopyGeometry = new THREE.IcosahedronGeometry(1, 0);
  private readonly treeInstanceMaterials = createInstancedTreeMaterials();
  private readonly treeLodMaterials = createInstancedTreeLodMaterials();
  private readonly treeRenderChunks = new Map<string, TreeRenderChunk>();
  private readonly lightPoolGeometry = new THREE.CircleGeometry(1, 26);
  private grassClumpMesh: THREE.InstancedMesh | null = null;
  private ambientLight: THREE.HemisphereLight | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private readonly keyLightOffset = new THREE.Vector3(-150, 205, 75);
  private readonly shadowFocus = new THREE.Vector3();
  private readonly lastShadowLightOffset = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
  private lastShadowRefreshAt = Number.NEGATIVE_INFINITY;
  private shadowQuality: RenderQualityLevel = "high";
  private emergencyLight: THREE.PointLight | null = null;
  private readonly ambientNightSky = new THREE.Color(0x849eb4);
  private readonly ambientDaySky = new THREE.Color(0xc9d6cf);
  private readonly ambientNightGround = new THREE.Color(0x16151c);
  private readonly ambientDayGround = new THREE.Color(0x4a4938);
  private readonly keyNightColor = new THREE.Color(0xabc4ff);
  private readonly keyDayColor = new THREE.Color(0xffddb1);
  private readonly keyDawnColor = new THREE.Color(0xffb678);
  private readonly grassBaseColor = new THREE.Color(0x6f8f62);
  private readonly grassWetColor = new THREE.Color(0x557554);
  private readonly pathBaseColor = new THREE.Color(0xa48f68);
  private readonly pathWetColor = new THREE.Color(0x71654f);
  private readonly asphaltBaseColor = new THREE.Color(0x293c45);
  private readonly asphaltWetColor = new THREE.Color(0x182d35);
  private readonly concreteBaseColor = new THREE.Color(0x9ca19a);
  private readonly concreteWetColor = new THREE.Color(0x778485);
  private readonly timberBaseColor = new THREE.Color(0x8c613d);
  private readonly timberWetColor = new THREE.Color(0x674b35);
  private readonly brickBaseColor = new THREE.Color(0xa95846);
  private readonly brickWetColor = new THREE.Color(0x7a3f38);
  private readonly metalBaseColor = new THREE.Color(0x94a3a2);
  private readonly metalWetColor = new THREE.Color(0x768a8d);
  private readonly facadeWindowDarkColor = new THREE.Color(0x071217);
  private readonly facadeWindowWarmColor = new THREE.Color(0xf0c16a);
  private readonly lampLights: THREE.PointLight[] = [];
  private readonly lampSpillMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly facadeLights: THREE.PointLight[] = [];
  private readonly wallLightMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly facadeWindowMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly scratchColor = new THREE.Color();
  private readonly terrainSupport: TerrainSupport;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly level: LevelData,
    private readonly rng: RandomSource,
    private readonly materials: GameMaterials,
    private readonly groundYAt: (point: Vec2) => number,
    private readonly averageGroundYAt: (points: readonly Vec2[]) => number
  ) {
    this.terrainSupport = new TerrainSupport(this.groundYAt);
  }

  createWorld(): void {
    this.ambientLight = new THREE.HemisphereLight(0xb9d4e8, 0x28222a, 1.38);
    this.scene.add(this.ambientLight);
    const moon = new THREE.DirectionalLight(0xc9ddff, 2.95);
    this.keyLight = moon;
    moon.userData.dynamic = true;
    moon.target.userData.dynamic = true;
    moon.position.set(-150, 205, 75);
    moon.castShadow = true;
    this.configureShadowCamera("high");
    moon.target.position.copy(this.shadowFocus);
    this.scene.add(moon.target);
    this.scene.add(moon);

    const emergency = new THREE.PointLight(0xe34b43, 5.2, 145);
    this.emergencyLight = emergency;
    emergency.position.set(22, 7, 48);
    this.scene.add(emergency);

    this.addGround();
    this.addStreetEdges();
    this.addMownLawnBands();
    this.addLawnWearPatches();
    this.addPaths();
    this.addGroundSurfacePolygons();
    this.addPathSurfacePatches();
    this.addHardscapeLines();
    this.addDampGroundDetails();
    this.addWetPathSheen();
    this.addGrassClumps();
    this.addLandmarks();
    this.addSportsFixtures();
    this.addMappedBuildings();
    this.addStructureShelters();
    this.addMappedFences();
    this.addAmenities();
    this.addParkLifeDetails();
    // Fixed furniture must come from the audited level register. Earlier
    // renderer-generated boundary fencing, path lamps, entrance furniture and
    // transit markers had no per-object 2026 coordinates and are deliberately
    // not emitted.
    this.addUnderCanopyGroundWear();
    this.addTrees();
  }

  createObjectPreview(target: ObjectPreviewTarget): void {
    this.suppressLabels = true;
    this.addPreviewLighting();
    this.addPreviewGround(target);

    if (target.kind === "landmark") {
      const landmark = this.level.landmarks.find((candidate) => candidate.id === target.sourceId);
      if (landmark) this.addLandmarkPreview(landmark);
    } else if (target.kind === "mapped-building") {
      const building = this.level.mappedBuildings.find((candidate) => candidate.id === target.sourceId);
      if (building) this.addMappedBuildingPreview(building);
    } else if (target.kind === "structure-shelter") {
      const shelter = this.level.structureShelters.find((candidate) => candidate.id === target.sourceId);
      if (shelter) this.addStructureShelterPreview(shelter);
    } else if (target.kind === "mapped-fence") {
      const fence = this.level.mappedFences.find((candidate) => candidate.id === target.sourceId);
      if (fence) this.addMappedFencePreview(fence);
    } else if (target.kind === "hardscape-line") {
      const line = this.level.hardscapeLines.find((candidate) => candidate.id === target.sourceId);
      if (line) this.addHardscapeLinePreview(line);
    } else if (target.kind === "path") {
      const path = this.level.paths.find((candidate) => candidate.id === target.sourceId);
      if (path) this.addPathPreview(path);
    } else if (target.kind === "path-surface-patch") {
      const patch = this.level.pathSurfacePatches.find((candidate) => candidate.id === target.sourceId);
      if (patch) this.addPathSurfacePatchPreview(patch);
    } else if (target.kind === "ground-surface-polygon") {
      const surface = this.level.groundSurfacePolygons.find((candidate) => candidate.id === target.sourceId);
      if (surface) this.addGroundSurfacePolygonPreview(surface);
    } else if (target.kind === "street-edge") {
      const street = this.level.streetEdges.find((candidate) => candidate.id === target.sourceId);
      if (street) this.addStreetEdgePreview(street);
    } else if (target.kind === "sports-fixture") {
      const fixture = this.level.sportsFixtures.find((candidate) => candidate.id === target.sourceId);
      if (fixture) this.addSportsFixturePreview(fixture);
    } else if (target.kind === "skate-bowl") {
      const bowl = this.level.skateBowls.find((candidate) => candidate.id === target.sourceId);
      if (bowl) this.addSkateBowlFeature(bowl);
    } else if (target.kind === "amenity") {
      const amenity = this.level.amenities.find((candidate) => candidate.id === target.sourceId);
      if (amenity) {
        this.addLinkedAmenityStructurePreview(amenity);
        this.addAmenityPreview(amenity);
      }
    } else if (target.kind === "park-life-detail") {
      const detail = this.level.parkLifeDetails.find((candidate) => candidate.id === target.sourceId);
      if (detail) this.addParkLifeDetailPreview(detail);
    } else if (target.kind === "rideable-bike") {
      this.addRideableBikePreview(target.sourceId);
    } else if (target.kind === "tree") {
      const tree = this.level.trees.find((candidate) => candidate.id === target.sourceId);
      if (tree) this.addRealisticTree(tree, target.sourceIndex ?? this.level.trees.indexOf(tree));
    } else if (target.kind === "upgrade-station") {
      const station = this.level.upgradeStations.find((candidate) => candidate.id === target.sourceId);
      if (station) this.addUpgradeStation(station);
    } else if (target.kind === "weapon-spawn" || target.kind === "weapon-model") {
      if (target.weaponId) this.addWeaponItemPreview(target);
    } else if (target.kind === "item-spawn") {
      if (target.itemId) this.addItemSpawnPreview(target);
    } else if (target.kind === "pickup-item") {
      if (target.pickupKind) this.addPickupItemPreview(target);
    } else if (target.kind === "zombie-model") {
      if (target.zombieType) this.addZombieModelPreview(target);
    }
  }

  async whenAssetsReady(): Promise<void> {
    await Promise.all(this.pendingAssetLoads);
  }

  private addPreviewLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd7e0, 0x2a2428, 1.45));

    const key = new THREE.DirectionalLight(0xffe1b2, 2.4);
    key.position.set(-18, 28, 18);
    key.castShadow = true;
    this.scene.add(key);

    const rim = new THREE.PointLight(0x7aa9ff, 1.3, 32);
    rim.position.set(12, 5.5, -10);
    this.scene.add(rim);
  }

  private addPreviewGround(target: ObjectPreviewTarget): void {
    const detailReach = target.detailViewPosition
      ? distance(target.position, target.detailViewPosition) + (target.detailViewRadius ?? 0)
      : 0;
    const radius = Math.max(4, target.radius * 1.35, detailReach * 1.2);
    const platform = this.createTerrainOverlayDisc(target.position, radius, 0.02, this.materials.grass);
    platform.receiveShadow = true;
    this.scene.add(platform);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.92, radius, 48),
      this.washDetailMaterial("preview-platform-tram-ring", MELBOURNE_ANIME_PALETTE.tramOchre, 0.34)
    );
    ring.position.set(target.position.x, this.groundY(target.position) + 0.075, target.position.z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    const wash = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.78, 26),
      this.washDetailMaterial("preview-platform-bluegum-wash", MELBOURNE_ANIME_PALETTE.deepBluegum, 0.12)
    );
    wash.position.set(target.position.x, this.groundY(target.position) + 0.062, target.position.z);
    wash.rotation.set(-Math.PI / 2, 0, this.angleFromId(target.id) * 0.35);
    wash.scale.set(1.2, 0.62, 1);
    this.scene.add(wash);

    for (let index = 0; index < 4; index += 1) {
      const angle = this.angleFromId(`${target.id}:stroke:${index}`) + index * 0.72;
      const offset = {
        x: target.position.x + Math.cos(angle) * radius * 0.25,
        z: target.position.z + Math.sin(angle) * radius * 0.18
      };
      const stroke = this.createTerrainOverlayRect(
        offset,
        angle,
        radius * (0.82 + index * 0.08),
        0.05 + index * 0.01,
        0.088 + index * 0.006,
        this.washDetailMaterial(`preview-brush-stroke-${index}`, index % 2 === 0 ? MELBOURNE_ANIME_PALETTE.weatheredWhite : MELBOURNE_ANIME_PALETTE.wetBluestone, 0.24)
      );
      this.scene.add(stroke);
    }

    this.addLabel(target.label, target.position, target.height + 1.15);
  }

  private addLandmarkPreview(landmark: Landmark): void {
    if (landmark.kind === "park") return;
    if (landmark.kind === "garden" && landmark.polygon) this.addGardenZone(landmark);
    if (landmark.kind === "oval" && landmark.polygon) this.addOval(landmark);
    if (landmark.kind === "grandstand" && landmark.polygon) this.addGrandstand(landmark);
    if (landmark.kind === "court" && landmark.polygon) {
      this.addTennisCourt(landmark);
    }
    if (landmark.kind === "bowls" && landmark.polygon) {
      this.addFlatPolygon(landmark.polygon, this.materials.court, 0.08, landmark.id.startsWith("bowling-green") ? 0.86 : 0.6);
      if (landmark.id.startsWith("bowling-green")) {
        this.addBowlingRinkLines(landmark.polygon);
      }
    }
    if (landmark.kind === "playground" && landmark.polygon) this.addPlayground(landmark);
    if (landmark.kind === "skate" && landmark.polygon) this.addSkatePark(landmark);
    if (landmark.kind === "basketball" && landmark.polygon) this.addBasketball(landmark);
    if (landmark.kind === "toilets") this.addToilets(landmark);
    if (landmark.kind === "bbq" && landmark.position) this.addBbq(landmark.position);
    if (landmark.kind === "rotunda" && landmark.position) this.addRotunda(landmark.position);
    if (landmark.kind === "memorial" && landmark.position) this.addMemorial(landmark);
  }

  private addMappedBuildingPreview(building: MappedBuilding): void {
    if (building.detailProfile === "rotunda-pavilion") {
      this.addRotunda(polygonCentroid(building.polygon));
      return;
    }
    this.addMappedBuilding(building);
  }

  private addStructureShelterPreview(shelter: StructureShelter): void {
    const building = this.level.mappedBuildings.find((candidate) => candidate.id === shelter.linkedStructureId);
    if (building) {
      this.addMappedBuildingPreview(building);
    } else {
      const landmark = this.level.landmarks.find((candidate) => candidate.id === shelter.linkedStructureId);
      if (landmark) this.addLandmarkPreview(landmark);
    }
    this.addStructureShelter(shelter);
  }

  private addMappedFencePreview(fence: MappedFence): void {
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x6b7a71, metalness: 0.22, roughness: 0.58 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5e56, metalness: 0.32, roughness: 0.48 });
    this.addMappedFenceSegments(fence, postMaterial, railMaterial);
  }

  private addHardscapeLinePreview(line: HardscapeLine): void {
    if (line.kind === "basalt-edging") {
      this.addBasaltEdging(line);
    } else if (line.kind === "bluestone-drain") {
      this.addBluestoneDrain(line);
    } else {
      this.addWallLine(line);
    }
  }

  private addPathPreview(path: LevelPath): void {
    const material = this.materials[pathPreviewMaterialKey(path)];
    const shoulderWidth = path.width + (path.kind === "steps" ? 0.36 : path.kind === "rail" ? 2.1 : path.kind === "cycleway" ? 1.45 : path.kind === "service" ? 1.2 : 0.95);
    for (let i = 0; i < path.points.length - 1; i += 1) {
      const a = path.points[i];
      const b = path.points[i + 1];
      this.addPathSegment(a, b, shoulderWidth, this.materials.dirt, PATH_SHOULDER_SURFACE_Y);
      this.addPathSegment(a, b, path.width, material, PATH_SURFACE_Y);
    }
    for (const point of path.points) {
      this.addPathCap(point, shoulderWidth * 0.52, this.materials.dirt, PATH_SHOULDER_SURFACE_Y);
      this.addPathCap(point, path.width * 0.52, material, PATH_CAP_SURFACE_Y);
    }
    this.addPathMarkings(path);
  }

  private addPathSurfacePatchPreview(patch: PathSurfacePatch): void {
    const mesh = this.createTerrainOverlayRect(
      patch.position,
      patch.angle,
      patch.length,
      patch.width,
      patch.kind === "path-junction-wear" ? PATH_JUNCTION_PATCH_SURFACE_Y : PATH_PATCH_SURFACE_Y,
      this.pathSurfacePatchMaterial(patch)
    );
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addGroundSurfacePolygonPreview(surface: GroundSurfacePolygon): void {
    this.addFlatPolygon(surface.polygon, this.groundSurfacePolygonMaterial(surface), PATH_SURFACE_Y + 0.024, surface.kind === "parking-apron" ? 0.88 : 0.76);
  }

  private addStreetEdgePreview(street: StreetEdge): void {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x252a26, roughness: 0.88 });
    const residential = new THREE.MeshStandardMaterial({ color: 0x2d302c, roughness: 0.9 });
    const kerb = new THREE.MeshStandardMaterial({ color: 0xa9a18d, roughness: 0.7 });
    const line = new THREE.MeshBasicMaterial({ color: 0xcfc8a6, transparent: true, opacity: 0.74 });
    const rail = new THREE.MeshBasicMaterial({ color: 0x6f756d, transparent: true, opacity: 0.8 });
    const roadMaterial = street.kind === "residential" ? residential : asphalt;
    for (let i = 0; i < street.points.length - 1; i += 1) {
      this.addStreetSegment(street.points[i], street.points[i + 1], street.width, roadMaterial, kerb, line, rail, street.hasTram === true);
    }
  }

  private addSportsFixturePreview(fixture: SportsFixture): void {
    if (fixture.kind === "football-goal") {
      this.addFootballGoal(fixture);
    } else {
      this.addBasketballHoop(fixture);
    }
  }

  private addAmenityPreview(amenity: AmenityPoint): void {
    const angle = this.isStructureAmenity(amenity) ? this.structureAccessAngle(amenity) : this.angleFromId(amenity.id);
    if (amenity.kind === "bench") {
      this.addBench(amenity.position, amenity.angle ?? angle);
      this.addAmenityHalo(amenity.position, 0x9ebf86, 0.62);
    } else if (amenity.kind === "picnic_table") {
      this.addPicnicTable(amenity.position, angle);
      this.addAmenityHalo(amenity.position, 0x9ebf86, 0.62);
    } else if (amenity.kind === "table_tennis") {
      this.addTableTennis(amenity.position, angle);
      this.addAmenityHalo(amenity.position, 0x61a8d3, 0.68);
    } else if (amenity.kind === "waste_basket") {
      this.addWasteBasket(amenity.position);
      this.addAmenityHalo(amenity.position, 0xd0a343, 0.5);
    } else if (amenity.kind === "drinking_water") {
      this.addDrinkingFountain(amenity.position);
      this.addAmenityHalo(amenity.position, 0x61a8d3, 0.68);
    } else if (amenity.kind === "bicycle_parking") {
      this.addBikeRack(amenity.position, angle);
      this.addAmenityHalo(amenity.position, 0xc2c8ba, 0.58);
    } else if (amenity.kind === "bbq") {
      this.addAmenityHalo(amenity.position, 0xd0a343, 0.64);
    } else if (amenity.kind === "toilets") {
      this.addAmenityHalo(amenity.position, 0x61a8d3, 0.52);
    } else if (amenity.kind === "post_box") {
      this.addPostBox(amenity.position, angle);
      this.addAmenityHalo(amenity.position, 0xb43a32, 0.48);
    } else if (amenity.kind === "memorial_plaque") {
      this.addAmenityHalo(amenity.position, 0xd0a343, 0.52);
    } else if (this.isStructureAmenity(amenity)) {
      this.addStructureAccessCue(amenity, angle);
      this.addAmenityHalo(amenity.position, 0xe3a84a, 0.58);
    }
  }

  private addLinkedAmenityStructurePreview(amenity: AmenityPoint): void {
    if (!amenity.linkedStructureId) return;
    const building = this.level.mappedBuildings.find((candidate) => candidate.id === amenity.linkedStructureId);
    if (building) {
      this.addMappedBuildingPreview(building);
      return;
    }
    const landmark = this.level.landmarks.find((candidate) => candidate.id === amenity.linkedStructureId);
    if (landmark) this.addLandmarkPreview(landmark);
  }

  private addParkLifeDetailPreview(detail: ParkLifeDetail): void {
    if (detail.kind === "dog-sign") {
      this.addDogAreaSign(detail);
    } else if (detail.kind === "picnic-blanket") {
      this.addPicnicBlanket(detail);
    } else if (detail.kind === "notice-board") {
      this.addNoticeBoard(detail);
    } else if (detail.kind === "broken-bike") {
      this.addBrokenBike(detail);
    } else if (detail.kind === "construction-fence") {
      this.addConstructionFence(detail);
    } else if (detail.kind === "works-materials") {
      this.addWorksMaterials(detail);
    } else if (detail.kind === "removed-tree-stump") {
      this.addRemovedTreeStump(detail);
    } else if (detail.kind === "park-rule-sign") {
      this.addParkRuleSign(detail);
    } else if (detail.kind === "training-cones") {
      this.addTrainingCones(detail);
    } else if (detail.kind === "dog-water-bowl") {
      this.addDogWaterBowl(detail);
    } else if (detail.kind === "picnic-cooler") {
      this.addPicnicCooler(detail);
    } else if (detail.kind === "sports-bag") {
      this.addSportsBag(detail);
    } else if (detail.kind === "cricket-nets") {
      this.addCricketNets(detail);
    } else if (detail.kind === "heritage-gas-lamp") {
      this.addHeritageGasLamp(detail);
    } else if (detail.kind === "heritage-bollard") {
      this.addHeritageBollard(detail);
    } else if (detail.kind === "heritage-seat") {
      this.addHeritageSeat(detail);
    } else if (detail.kind === "interpretive-sign") {
      this.addInterpretiveSign(detail);
    } else if (detail.kind === "chandler-fountain") {
      this.addChandlerFountain(detail);
    } else {
      this.addChalkMark(detail);
    }
  }

  updateTimeOfDay(timeOfDay: TimeOfDayState, weather?: Pick<WeatherState, "cloudCover" | "precipitation" | "wetness">): void {
    const wetness = THREE.MathUtils.clamp((weather?.wetness ?? 0) * 0.54 + (weather?.precipitation ?? 0) * 0.22, 0, 0.78);
    const lampT = THREE.MathUtils.clamp(0.08 + timeOfDay.night * 0.86 + (weather?.cloudCover ?? 0) * 0.18 + (weather?.precipitation ?? 0) * 0.08, 0, 1);

    if (this.ambientLight) {
      this.ambientLight.color.copy(this.ambientNightSky).lerp(this.ambientDaySky, timeOfDay.daylight);
      this.ambientLight.groundColor.copy(this.ambientNightGround).lerp(this.ambientDayGround, timeOfDay.daylight);
      this.ambientLight.intensity = 0.94 + timeOfDay.daylight * 0.52 + timeOfDay.dawnDusk * 0.12;
    }

    if (this.keyLight) {
      this.keyLight.color.copy(this.keyNightColor).lerp(this.keyDayColor, timeOfDay.daylight).lerp(this.keyDawnColor, timeOfDay.dawnDusk * 0.35);
      this.keyLight.intensity = 2.18 + timeOfDay.daylight * 0.84 + timeOfDay.dawnDusk * 0.28;
      const daylightInfluence = THREE.MathUtils.clamp(timeOfDay.daylight + timeOfDay.dawnDusk * 0.34, 0, 1);
      const azimuth = THREE.MathUtils.degToRad(timeOfDay.sunAzimuthDegrees);
      const altitude = THREE.MathUtils.degToRad(Math.max(8, timeOfDay.sunAltitudeDegrees));
      const sunRadius = 235;
      const sunX = Math.sin(azimuth) * Math.cos(altitude) * sunRadius;
      const sunY = Math.sin(altitude) * sunRadius + 72;
      const sunZ = -Math.cos(azimuth) * Math.cos(altitude) * sunRadius;
      this.keyLightOffset.set(
        THREE.MathUtils.lerp(-150, sunX, daylightInfluence),
        THREE.MathUtils.lerp(205, sunY, daylightInfluence),
        THREE.MathUtils.lerp(75, sunZ, daylightInfluence)
      );
      this.applyKeyLightTransform();
    }

    if (this.emergencyLight) {
      this.emergencyLight.intensity = 3.45 + timeOfDay.night * 1.95;
    }

    this.applyWetMaterialTint(wetness);

    for (const light of this.lampLights) {
      light.intensity = 0.12 + lampT * 0.82;
    }
    for (const light of this.facadeLights) {
      light.intensity = 0.04 + lampT * 1.28;
    }
    for (const material of this.lampSpillMaterials) {
      const baseOpacity = (material.userData.baseOpacity as number | undefined) ?? 1;
      material.opacity = baseOpacity * (0.035 + lampT * 0.15) * (0.86 + wetness * 0.38);
    }
    for (const material of this.wallLightMaterials) {
      material.emissive.setHex(0xf0a64d);
      material.emissiveIntensity = 0.08 + lampT * 0.75;
    }
    for (const material of this.facadeWindowMaterials) {
      material.color.copy(this.scratchColor.copy(this.facadeWindowDarkColor).lerp(this.facadeWindowWarmColor, lampT * 0.58));
    }
  }

  private applyWetMaterialTint(wetness: number): void {
    this.tintMaterial(this.materials.grass, this.grassBaseColor, this.grassWetColor, wetness * 0.34);
    this.tintMaterial(this.materials.path, this.pathBaseColor, this.pathWetColor, wetness * 0.72);
    this.tintMaterial(this.materials.gravel, this.pathBaseColor, this.pathWetColor, wetness * 0.58);
    this.tintMaterial(this.materials.asphalt, this.asphaltBaseColor, this.asphaltWetColor, wetness);
    this.tintMaterial(this.materials.concrete, this.concreteBaseColor, this.concreteWetColor, wetness * 0.82);
    this.tintMaterial(this.materials.timber, this.timberBaseColor, this.timberWetColor, wetness * 0.42);
    this.tintMaterial(this.materials.brick, this.brickBaseColor, this.brickWetColor, wetness * 0.5);
    this.tintMaterial(this.materials.metal, this.metalBaseColor, this.metalWetColor, wetness * 0.6);
    this.materials.puddle.opacity = 0.34 + wetness * 0.28;
    this.materials.metal.roughness = 0.38 - wetness * 0.14;
  }

  private tintMaterial(material: { color: THREE.Color }, base: THREE.Color, wet: THREE.Color, amount: number): void {
    material.color.copy(this.scratchColor.copy(base).lerp(wet, THREE.MathUtils.clamp(amount, 0, 1)));
  }

  updateShadowFocus(position: Vec2, now: number): boolean {
    if (!this.keyLight) return false;
    const snappedX = Math.round(position.x / 12) * 12;
    const snappedZ = Math.round(position.z / 12) * 12;
    const focusChanged = Math.abs(this.shadowFocus.x - snappedX) > 0.01 || Math.abs(this.shadowFocus.z - snappedZ) > 0.01;
    const lightChanged = this.lastShadowLightOffset.distanceToSquared(this.keyLightOffset) > 0.16;
    const timedRefresh = now - this.lastShadowRefreshAt >= 0.34;

    if (focusChanged) {
      this.shadowFocus.set(snappedX, 0, snappedZ);
      this.applyKeyLightTransform();
    }
    if (focusChanged || (lightChanged && timedRefresh) || this.lastShadowRefreshAt === Number.NEGATIVE_INFINITY) {
      this.keyLight.shadow.needsUpdate = true;
      this.lastShadowLightOffset.copy(this.keyLightOffset);
      this.lastShadowRefreshAt = now;
      return true;
    }
    return false;
  }

  setQualityLevel(level: RenderQualityLevel): void {
    this.shadowQuality = level;
    this.configureShadowCamera(level);
    if (this.grassClumpMesh) {
      const settings = RENDER_QUALITY_SETTINGS[level];
      this.grassClumpMesh.count = Math.max(1, Math.round(this.renderedGrassClumpCount * settings.grassFraction));
    }
  }

  updateTreeLod(position: Vec2): boolean {
    const settings = RENDER_QUALITY_SETTINGS[this.shadowQuality];
    const chunkPadding = TREE_RENDER_CHUNK_SIZE * Math.SQRT1_2;
    let shadowStateChanged = false;
    for (const chunk of this.treeRenderChunks.values()) {
      const distanceToChunk = Math.hypot(position.x - chunk.center.x, position.z - chunk.center.y);
      const fullVisible = distanceToChunk <= settings.treeFullDetailDistance + chunkPadding;
      const farVisible = !fullVisible && distanceToChunk <= settings.treeRenderDistance + chunkPadding;
      if (chunk.fullVisible !== fullVisible) {
        chunk.fullVisible = fullVisible;
        for (const mesh of chunk.fullMeshes) mesh.visible = fullVisible;
        shadowStateChanged = true;
      }
      if (chunk.farVisible !== farVisible) {
        chunk.farVisible = farVisible;
        for (const mesh of chunk.farMeshes) mesh.visible = farVisible;
      }
    }
    return shadowStateChanged;
  }

  private configureShadowCamera(level: RenderQualityLevel): void {
    if (!this.keyLight) return;
    const settings = RENDER_QUALITY_SETTINGS[level];
    const camera = this.keyLight.shadow.camera;
    camera.left = -settings.shadowRadius;
    camera.right = settings.shadowRadius;
    camera.top = settings.shadowRadius;
    camera.bottom = -settings.shadowRadius;
    camera.near = 28;
    camera.far = 520;
    camera.updateProjectionMatrix();
    if (this.keyLight.shadow.mapSize.x !== settings.shadowMapSize) {
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    }
    this.keyLight.shadow.bias = -0.00032;
    this.keyLight.shadow.normalBias = 0.034;
    this.keyLight.shadow.needsUpdate = true;
  }

  private applyKeyLightTransform(): void {
    if (!this.keyLight) return;
    this.keyLight.target.position.copy(this.shadowFocus);
    this.keyLight.position.copy(this.shadowFocus).add(this.keyLightOffset);
    this.keyLight.target.updateMatrixWorld();
  }

  createUpgradeStations(): void {
    for (const station of this.level.upgradeStations) {
      this.addUpgradeStation(station);
    }
  }

  private addUpgradeStation(station: UpgradeStation): void {
    const material = this.standardDetailMaterial("upgrade-station-crate", MELBOURNE_ANIME_PALETTE.tramOchre, 0.64, 0.06);
    const strapMaterial = this.standardDetailMaterial("upgrade-station-bluestone-straps", MELBOURNE_ANIME_PALETTE.bluestoneShadow, 0.58, 0.24);
    const labelMaterial = this.canvasSignMaterial("upgrade-station-label", "SCRAP", "#263d45", "#efd18a");
    const group = new THREE.Group();
    group.name = station.label;
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 1.85, 1.08, 0.18, 0.025, this.angleFromId(station.id));
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.8), material);
    crate.position.y = 0.75;
    crate.castShadow = true;
    group.add(crate);

    for (const x of [-1.1, 1.1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.62, 1.9), strapMaterial);
      strap.position.set(x, 0.78, 0);
      strap.castShadow = true;
      group.add(strap);
    }
    const label = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.4, 0.055), labelMaterial);
    label.position.set(0, 0.92, -0.93);
    group.add(label);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.08, 1.36, -0.94, 1.7, 0.035, 0.26, 0, -0.04);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.eucalyptus, 0.1, 0.24, -0.96, 1.4, 0.028, 0.22, 0, 0.05);

    const lamp = new THREE.PointLight(0xd5a948, 1.2, 18);
    lamp.position.y = 2.4;
    group.add(lamp);

    group.position.set(station.position.x, this.boxSupportY(station.position, 0, 1.3, 0.9), station.position.z);
    this.scene.add(group);
  }

  private addWeaponItemPreview(target: ObjectPreviewTarget): void {
    if (!target.weaponId) return;
    const factory = new MeshFactory(this.materials);
    const mesh = target.kind === "weapon-spawn" ? factory.createWeaponDropMesh(target.weaponId) : factory.createWeaponMesh(target.weaponId, false);
    if (target.kind === "weapon-model") {
      mesh.scale.setScalar(2.35);
      mesh.rotation.x = 0.18;
    }
    mesh.position.set(target.position.x, this.groundY(target.position) + 0.82, target.position.z);
    mesh.rotation.y = target.kind === "weapon-model" ? -0.42 : 0;
    this.scene.add(mesh);
  }

  private addPickupItemPreview(target: ObjectPreviewTarget): void {
    if (!target.pickupKind) return;
    const factory = new MeshFactory(this.materials);
    const mesh = factory.createPickupMesh(target.pickupKind);
    mesh.position.set(target.position.x, this.groundY(target.position) + 0.75, target.position.z);
    mesh.rotation.y = -0.35;
    this.scene.add(mesh);
  }

  private addZombieModelPreview(target: ObjectPreviewTarget): void {
    if (!target.zombieType) return;
    const factory = new MeshFactory(this.materials);
    const mesh = factory.createZombieMesh(target.zombieType);
    mesh.position.set(target.position.x, this.groundY(target.position), target.position.z);
    mesh.rotation.y = -0.28;
    this.scene.add(mesh);
  }

  getRenderedTreeCount(): number {
    return this.renderedTreeCount;
  }

  getRenderedGrassClumpCount(): number {
    return this.renderedGrassClumpCount;
  }

  getRenderedWetPathSheenCount(): number {
    return this.renderedWetPathSheenCount;
  }

  getRenderedLampSpillCount(): number {
    return this.renderedLampSpillCount;
  }

  private groundY(point: Vec2): number {
    return this.groundYAt(point);
  }

  private averageGroundY(points: readonly Vec2[]): number {
    return this.averageGroundYAt(points);
  }

  private cleanPolygon(polygon: readonly Vec2[]): Vec2[] {
    return cleanWorldPolygon(polygon);
  }

  private supportY(points: readonly Vec2[], pad = 0): number {
    return this.terrainSupport.supportY(points, pad);
  }

  private boxSupportY(center: Vec2, rotation: number, halfX: number, halfZ: number, pad = 0): number {
    return this.terrainSupport.boxSupportY(center, rotation, halfX, halfZ, pad);
  }

  private radialSupportY(center: Vec2, radius: number, pad = 0): number {
    return this.terrainSupport.radialSupportY(center, radius, pad);
  }

  private addGround(): void {
    const minX = Math.min(...this.level.boundary.map((point) => point.x)) - TERRAIN_EDGE_PAD;
    const maxX = Math.max(...this.level.boundary.map((point) => point.x)) + TERRAIN_EDGE_PAD;
    const minZ = Math.min(...this.level.boundary.map((point) => point.z)) - TERRAIN_EDGE_PAD;
    const maxZ = Math.max(...this.level.boundary.map((point) => point.z)) + TERRAIN_EDGE_PAD;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const addVertex = (point: Vec2) => {
      vertices.push(point.x, this.groundY(point), point.z);
      uvs.push((point.x - minX) / 26, (point.z - minZ) / 26);
      const color = this.painterlyVertexColorAt(point);
      colors.push(color.r, color.g, color.b);
    };

    for (let x = minX; x < maxX; x += TERRAIN_GRID_STEP) {
      for (let z = minZ; z < maxZ; z += TERRAIN_GRID_STEP) {
        const center = { x: x + TERRAIN_GRID_STEP * 0.5, z: z + TERRAIN_GRID_STEP * 0.5 };
        if (!pointInPolygon(center, this.level.boundary)) {
          continue;
        }
        const p00 = { x, z };
        const p10 = { x: x + TERRAIN_GRID_STEP, z };
        const p01 = { x, z: z + TERRAIN_GRID_STEP };
        const p11 = { x: x + TERRAIN_GRID_STEP, z: z + TERRAIN_GRID_STEP };
        addVertex(p00);
        addVertex(p11);
        addVertex(p10);
        addVertex(p00);
        addVertex(p01);
        addVertex(p11);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.materials.grass);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addLawnWearPatches(): void {
    const highUsePoints = [
      ...this.level.upgradeStations.map((station) => station.position),
      ...this.level.amenities.filter((amenity) => amenity.kind === "bbq" || amenity.kind === "bench").slice(0, 18).map((amenity) => amenity.position)
    ];
    highUsePoints.forEach((point, index) => {
      const patch = new THREE.Mesh(
        this.painterlyGeometry(new THREE.CircleGeometry(index % 3 === 0 ? 4.2 : 2.7, 18), this.materials.wornGrass),
        this.materials.wornGrass
      );
      const center = { x: point.x + this.rng.range(-1.1, 1.1), z: point.z + this.rng.range(-1.1, 1.1) };
      patch.position.set(center.x, this.groundY(center) + 0.082, center.z);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = this.rng.range(0, Math.PI);
      patch.scale.set(this.rng.range(0.7, 1.35), this.rng.range(0.45, 0.95), 1);
      patch.receiveShadow = true;
      this.scene.add(patch);
    });
  }

  private addMownLawnBands(): void {
    const lawnBands = [
      { center: { x: 86, z: -24 }, radius: 17, scaleX: 2.5, scaleZ: 0.42, rotation: -0.36 },
      { center: { x: 118, z: 48 }, radius: 20, scaleX: 2.2, scaleZ: 0.5, rotation: -0.55 },
      { center: { x: -68, z: 52 }, radius: 14, scaleX: 2.3, scaleZ: 0.38, rotation: 0.24 },
      { center: { x: 16, z: -112 }, radius: 18, scaleX: 2.9, scaleZ: 0.35, rotation: -0.08 },
      { center: { x: -122, z: -36 }, radius: 13, scaleX: 2.0, scaleZ: 0.42, rotation: 0.56 }
    ];

    lawnBands.forEach((band) => {
      if (!pointInPolygon(band.center, this.level.boundary)) {
        return;
      }
      const stripe = new THREE.Mesh(
        this.painterlyGeometry(new THREE.CircleGeometry(band.radius, 36), this.materials.wornGrass),
        this.materials.wornGrass
      );
      stripe.position.set(band.center.x, this.groundY(band.center) + 0.066, band.center.z);
      stripe.rotation.set(-Math.PI / 2, 0, band.rotation);
      stripe.scale.set(band.scaleX, band.scaleZ, 1);
      stripe.receiveShadow = true;
      this.scene.add(stripe);
    });
  }

  private addPaintedLawnWashes(): void {
    const minX = Math.min(...this.level.boundary.map((point) => point.x)) + 10;
    const maxX = Math.max(...this.level.boundary.map((point) => point.x)) - 10;
    const minZ = Math.min(...this.level.boundary.map((point) => point.z)) + 10;
    const maxZ = Math.max(...this.level.boundary.map((point) => point.z)) - 10;
    const washMaterials = [
      new THREE.MeshBasicMaterial({ color: 0x8fa36a, transparent: true, opacity: 0.135, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0xb3a56f, transparent: true, opacity: 0.115, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0x456e60, transparent: true, opacity: 0.12, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0x6f7f73, transparent: true, opacity: 0.095, depthWrite: false })
    ];
    const maxWashes = 76;
    let placed = 0;

    outer: for (let x = minX; x <= maxX; x += 18) {
      for (let z = minZ; z <= maxZ; z += 18) {
        if (this.stableNoise(x, z, 141) < 0.46) continue;
        const point = {
          x: x + (this.stableNoise(x, z, 142) - 0.5) * 14,
          z: z + (this.stableNoise(x, z, 143) - 0.5) * 14
        };
        if (!this.isGrassEligible(point)) continue;

        const shaded = this.isUnderCanopy(point);
        const mown = this.isMownOvalPoint(point);
        const materialIndex = shaded ? 2 + Math.floor(this.stableNoise(point.x, point.z, 144) * 2) : mown ? 1 : Math.floor(this.stableNoise(point.x, point.z, 145) * 3);
        const longAxis = THREE.MathUtils.lerp(mown ? 24 : 12, mown ? 46 : 32, this.stableNoise(point.x, point.z, 146));
        const shortAxis = THREE.MathUtils.lerp(shaded ? 4.4 : 3.2, shaded ? 10.5 : 8.6, this.stableNoise(point.x, point.z, 147));
        const wash = this.createTerrainOverlayEllipse(
          point,
          this.stableNoise(point.x, point.z, 148) * Math.PI,
          longAxis,
          shortAxis,
          0.058 + placed * 0.00001,
          washMaterials[Math.min(washMaterials.length - 1, materialIndex)]
        );
        wash.receiveShadow = false;
        wash.renderOrder = 1;
        wash.userData.kind = "painted-lawn-wash";
        this.scene.add(wash);

        placed += 1;
        if (placed >= maxWashes) break outer;
      }
    }
  }

  private addDistantGroundBreakup(): void {
    const minX = Math.min(...this.level.boundary.map((point) => point.x)) + 6;
    const maxX = Math.max(...this.level.boundary.map((point) => point.x)) - 6;
    const minZ = Math.min(...this.level.boundary.map((point) => point.z)) + 6;
    const maxZ = Math.max(...this.level.boundary.map((point) => point.z)) - 6;
    const ovalGeometry = new THREE.CircleGeometry(1, 22);
    const breakupMaterials = [
      new THREE.MeshBasicMaterial({ color: 0x23483d, transparent: true, opacity: 0.16, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0x697047, transparent: true, opacity: 0.13, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0x6b5538, transparent: true, opacity: 0.11, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0x18352d, transparent: true, opacity: 0.14, depthWrite: false })
    ];
    const maxPatches = 160;
    let placed = 0;

    outer: for (let x = minX; x <= maxX; x += 14) {
      for (let z = minZ; z <= maxZ; z += 14) {
        if (this.stableNoise(x, z, 101) < 0.5) continue;
        const point = {
          x: x + (this.stableNoise(x, z, 102) - 0.5) * 13,
          z: z + (this.stableNoise(x, z, 103) - 0.5) * 13
        };
        if (!this.isGrassEligible(point)) continue;

        const tone = this.stableNoise(point.x, point.z, 104);
        const material = breakupMaterials[Math.min(breakupMaterials.length - 1, Math.floor(tone * breakupMaterials.length))];
        const mown = this.isMownOvalPoint(point);
        const longAxis = THREE.MathUtils.lerp(mown ? 11 : 7, mown ? 28 : 21, this.stableNoise(point.x, point.z, 105));
        const shortAxis = THREE.MathUtils.lerp(mown ? 1.4 : 1.8, mown ? 3.8 : 6.2, this.stableNoise(point.x, point.z, 106));
        const patch = new THREE.Mesh(ovalGeometry, material);
        patch.position.set(point.x, this.groundY(point) + 0.088 + placed * 0.00002, point.z);
        patch.rotation.set(-Math.PI / 2, 0, this.stableNoise(point.x, point.z, 107) * Math.PI);
        patch.scale.set(longAxis * 0.5, shortAxis * 0.5, 1);
        patch.receiveShadow = true;
        patch.renderOrder = 1;
        patch.userData.kind = "distant-ground-breakup";
        this.scene.add(patch);

        placed += 1;
        if (placed >= maxPatches) break outer;
      }
    }
  }

  private addDampGroundDetails(): void {
    const puddleCandidates = [
      ...this.level.paths.filter((path) => path.kind !== "rail").flatMap((path) => path.points.filter((_, index) => index % 4 === 0)),
      ...this.level.amenities.filter((amenity) => amenity.kind === "drinking_water" || amenity.kind === "toilets").map((amenity) => amenity.position),
      ...this.level.upgradeStations.map((station) => station.position)
    ];

    puddleCandidates.slice(0, 38).forEach((point, index) => {
      const center = {
        x: point.x + this.rng.range(-1.6, 1.6),
        z: point.z + this.rng.range(-1.6, 1.6)
      };
      if (!pointInPolygon(center, this.level.boundary)) {
        return;
      }
      const radius = index % 5 === 0 ? this.rng.range(1.8, 3.8) : this.rng.range(0.7, 1.7);
      const puddle = this.createTerrainOverlayEllipse(
        center,
        this.rng.range(0, Math.PI),
        radius * this.rng.range(1.4, 2.7),
        radius * this.rng.range(0.28, 0.74),
        0.154,
        this.materials.puddle
      );
      puddle.receiveShadow = true;
      this.scene.add(puddle);
    });
  }

  private addWetPathSheen(): void {
    const sheenMaterial = new THREE.MeshStandardMaterial({
      color: 0xaeb3a5,
      metalness: 0.08,
      roughness: 0.13,
      transparent: true,
      opacity: 0.24,
      depthWrite: false
    });
    this.renderedWetPathSheenCount = 0;
    let placed = 0;
    const limit = 96;

    for (const path of this.level.paths.filter((candidate) => candidate.kind !== "rail")) {
      if (placed >= limit) break;
      for (let i = 0; i < path.points.length - 1; i += 1) {
        if (placed >= limit) break;
        const a = path.points[i];
        const b = path.points[i + 1];
        const segmentLength = distance(a, b);
        if (segmentLength < 9) continue;
        const angle = Math.atan2(b.z - a.z, b.x - a.x);
        const count = Math.min(3, Math.max(1, Math.floor(segmentLength / 58)));

        for (let step = 0; step < count; step += 1) {
          const seedX = (a.x + b.x) * 0.5 + step * 13.7;
          const seedZ = (a.z + b.z) * 0.5 - step * 9.1;
          if (this.stableNoise(seedX, seedZ, 31) < 0.25) continue;
          const t = (step + 1) / (count + 1);
          const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
          const offset = (this.stableNoise(seedX, seedZ, 32) - 0.5) * path.width * 0.42;
          const center = {
            x: point.x + Math.cos(angle + Math.PI / 2) * offset,
            z: point.z + Math.sin(angle + Math.PI / 2) * offset
          };
          if (!pointInPolygon(center, this.level.boundary)) continue;
          const length = THREE.MathUtils.lerp(4.4, Math.min(17, segmentLength * 0.38), this.stableNoise(seedX, seedZ, 33));
          const width = THREE.MathUtils.lerp(path.width * 0.18, path.width * 0.46, this.stableNoise(seedX, seedZ, 34));
          const mesh = this.createTerrainOverlayRect(
            center,
            angle + this.stableNoise(seedX, seedZ, 35) * 0.16 - 0.08,
            length,
            width,
            WET_PATH_SHEEN_SURFACE_Y,
            sheenMaterial
          );
          mesh.receiveShadow = false;
          mesh.userData.kind = "wet-path-sheen";
          this.scene.add(mesh);
          placed += 1;
          this.renderedWetPathSheenCount = placed;
          if (placed >= limit) break;
        }
      }
    }
  }

  private addGrassClumps(): void {
    this.renderedGrassClumpCount = 0;
    const minX = Math.min(...this.level.boundary.map((point) => point.x)) + 2;
    const maxX = Math.max(...this.level.boundary.map((point) => point.x)) - 2;
    const minZ = Math.min(...this.level.boundary.map((point) => point.z)) + 2;
    const maxZ = Math.max(...this.level.boundary.map((point) => point.z)) - 2;
    const clumps: Array<{
      point: Vec2;
      height: number;
      spread: number;
      rotation: number;
      leanX: number;
      leanZ: number;
      color: THREE.Color;
    }> = [];

    outer: for (let x = minX; x <= maxX; x += GRASS_SAMPLE_STEP) {
      for (let z = minZ; z <= maxZ; z += GRASS_SAMPLE_STEP) {
        const density = this.stableNoise(x, z, 1);
        if (density < 0.34) {
          continue;
        }
        const point = {
          x: x + (this.stableNoise(x, z, 2) - 0.5) * GRASS_SAMPLE_STEP * 0.86,
          z: z + (this.stableNoise(x, z, 3) - 0.5) * GRASS_SAMPLE_STEP * 0.86
        };
        if (!this.isGrassEligible(point)) {
          continue;
        }

        const shortMown = this.isMownOvalPoint(point);
        const shaded = this.isUnderCanopy(point);
        const variation = this.stableNoise(point.x, point.z, 4);
        const height = shortMown
          ? THREE.MathUtils.lerp(0.16, 0.3, variation)
          : shaded
            ? THREE.MathUtils.lerp(0.24, 0.46, variation)
            : THREE.MathUtils.lerp(0.3, 0.64, variation);
        const spread = shortMown
          ? THREE.MathUtils.lerp(0.36, 0.68, this.stableNoise(point.x, point.z, 5))
          : THREE.MathUtils.lerp(0.55, 1.18, this.stableNoise(point.x, point.z, 5));
        const dry = this.stableNoise(point.x, point.z, 12) > 0.72;
        const baseColor = dry
          ? MELBOURNE_ANIME_PALETTE.dryGrass
          : shortMown
            ? MELBOURNE_ANIME_PALETTE.couchGrass
            : shaded
              ? 0x50664e
              : MELBOURNE_ANIME_PALETTE.eucalyptus;
        const color = new THREE.Color(baseColor).offsetHSL(
          (this.stableNoise(point.x, point.z, 6) - 0.5) * 0.025,
          (this.stableNoise(point.x, point.z, 7) - 0.5) * 0.045,
          (this.stableNoise(point.x, point.z, 8) - 0.5) * 0.075
        );

        clumps.push({
          point,
          height,
          spread,
          rotation: this.stableNoise(point.x, point.z, 9) * Math.PI * 2,
          leanX: (this.stableNoise(point.x, point.z, 10) - 0.5) * 0.16,
          leanZ: (this.stableNoise(point.x, point.z, 11) - 0.5) * 0.16,
          color
        });
        if (clumps.length >= GRASS_CLUSTER_LIMIT) {
          break outer;
        }
      }
    }

    if (clumps.length === 0) {
      return;
    }

    const mesh = new THREE.InstancedMesh(createGrassClumpGeometry(), this.materials.grassBlade, clumps.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();

    clumps.forEach((clump, index) => {
      euler.set(clump.leanX, clump.rotation, clump.leanZ);
      quaternion.setFromEuler(euler);
      scale.set(clump.spread, clump.height, clump.spread);
      matrix.compose(new THREE.Vector3(clump.point.x, this.groundY(clump.point) + 0.04, clump.point.z), quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, clump.color);
    });

    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.frustumCulled = false;
    mesh.userData.kind = "grass-clumps";
    mesh.userData.count = clumps.length;
    this.grassClumpMesh = mesh;
    this.renderedGrassClumpCount = clumps.length;
    this.scene.add(mesh);
  }

  private addPaths(): void {
    for (const path of this.level.paths) {
      const material =
        path.surface === "concrete"
          ? this.materials.concrete
          : path.kind === "steps"
          ? this.materials.concrete
          : path.kind === "rail" || path.kind === "cycleway" || path.kind === "service" || path.surface === "asphalt"
          ? this.materials.asphalt
          : path.kind === "perimeter" || path.surface === "gravel"
            ? this.materials.gravel
            : this.materials.path;
      const shoulderWidth = path.width + (path.kind === "steps" ? 0.36 : path.kind === "rail" ? 2.1 : path.kind === "cycleway" ? 1.45 : path.kind === "service" ? 1.2 : 0.95);
      for (let i = 0; i < path.points.length - 1; i += 1) {
        const a = path.points[i];
        const b = path.points[i + 1];
        this.addPathSegment(a, b, shoulderWidth, this.materials.dirt, PATH_SHOULDER_SURFACE_Y);
        this.addPathSegment(a, b, path.width, material, PATH_SURFACE_Y);
      }
      for (const point of path.points) {
        this.addPathCap(point, shoulderWidth * 0.52, this.materials.dirt, PATH_SHOULDER_SURFACE_Y);
        this.addPathCap(point, path.width * 0.52, material, PATH_CAP_SURFACE_Y);
      }
      this.addPathMarkings(path);
    }
  }

  private addPathSegment(a: Vec2, b: Vec2, width: number, material: THREE.Material, yOffset: number): void {
    const length = distance(a, b);
    if (length < 0.05) return;
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    const center = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
    const mesh = this.createTerrainOverlayRect(center, angle, length, width, yOffset, material);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addPathCap(point: Vec2, radius: number, material: THREE.Material, yOffset: number): void {
    const cap = this.createTerrainOverlayDisc(point, radius, yOffset, material);
    cap.receiveShadow = true;
    this.scene.add(cap);
  }

  private addPathSurfacePatches(): void {
    for (const patch of this.level.pathSurfacePatches) {
      const mesh = this.createTerrainOverlayRect(
        patch.position,
        patch.angle,
        patch.length,
        patch.width,
        patch.kind === "path-junction-wear" ? PATH_JUNCTION_PATCH_SURFACE_Y : PATH_PATCH_SURFACE_Y,
        this.pathSurfacePatchMaterial(patch)
      );
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  private addGroundSurfacePolygons(): void {
    for (const surface of this.level.groundSurfacePolygons) {
      this.addFlatPolygon(surface.polygon, this.groundSurfacePolygonMaterial(surface), PATH_SURFACE_Y + 0.018, surface.kind === "parking-apron" ? 0.84 : 0.72);
    }
  }

  private pathSurfacePatchMaterial(patch: PathSurfacePatch): THREE.Material {
    if (patch.material === "worn-grass") return this.materials.wornGrass;
    if (patch.material === "gravel") return this.materials.gravel;
    if (patch.material === "leaf-litter") return this.materials.leafLitter;
    return this.materials.dirt;
  }

  private groundSurfacePolygonMaterial(surface: GroundSurfacePolygon): THREE.Material {
    if (surface.material === "concrete") return this.materials.concrete;
    if (surface.material === "gravel") return this.materials.gravel;
    return this.materials.asphalt;
  }

  private addPathMarkings(path: LevelPath): void {
    if (path.kind === "rail") {
      const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xd7cfad, transparent: true, opacity: 0.62 });
      const railMaterial = new THREE.MeshBasicMaterial({ color: 0x6f7268, transparent: true, opacity: 0.52 });
      this.addDashedPathLine(path.points, 0, 4.8, 5.6, 0.16, dashMaterial);
      this.addSolidPathStripe(path.points, -1.65, 0.08, railMaterial);
      this.addSolidPathStripe(path.points, 1.65, 0.08, railMaterial);
      return;
    }

    if (path.kind === "cycleway") {
      const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xe4dfc5, transparent: true, opacity: 0.54 });
      this.addDashedPathLine(path.points, 0, 3.2, 4.7, 0.12, dashMaterial);
    }

    if (path.kind === "steps") {
      const treadMaterial = new THREE.MeshBasicMaterial({ color: 0x8e897e, transparent: true, opacity: 0.62 });
      for (let i = 0; i < path.points.length - 1; i += 1) {
        const a = path.points[i];
        const b = path.points[i + 1];
        const segmentLength = distance(a, b);
        if (segmentLength < 0.3) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const angle = Math.atan2(dz, dx);
        const count = Math.max(1, Math.floor(segmentLength / 0.55));
        for (let step = 1; step <= count; step += 1) {
          const t = step / (count + 1);
          const point = { x: a.x + dx * t, z: a.z + dz * t };
          const mesh = this.createTerrainOverlayRect(point, angle + Math.PI / 2, path.width * 0.82, 0.035, PATH_TREAD_SURFACE_Y, treadMaterial);
          this.scene.add(mesh);
        }
      }
    }
  }

  private addDashedPathLine(
    points: Vec2[],
    offset: number,
    dashLength: number,
    gap: number,
    width: number,
    material: THREE.Material
  ): void {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const segmentLength = distance(a, b);
      if (segmentLength < dashLength) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const angle = Math.atan2(dz, dx);
      const nx = -dz / segmentLength;
      const nz = dx / segmentLength;
      for (let along = dashLength * 0.5; along < segmentLength; along += dashLength + gap) {
        const actualLength = Math.min(dashLength, segmentLength - along + dashLength * 0.5);
        const t = along / segmentLength;
        const point = { x: a.x + dx * t + nx * offset, z: a.z + dz * t + nz * offset };
        const mesh = this.createTerrainOverlayRect(point, angle, actualLength, width, PATH_MARKING_SURFACE_Y, material);
        this.scene.add(mesh);
      }
    }
  }

  private addSolidPathStripe(points: Vec2[], offset: number, width: number, material: THREE.Material): void {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const segmentLength = distance(a, b);
      if (segmentLength < 0.05) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const nx = -dz / segmentLength;
      const nz = dx / segmentLength;
      const center = { x: (a.x + b.x) / 2 + nx * offset, z: (a.z + b.z) / 2 + nz * offset };
      const mesh = this.createTerrainOverlayRect(center, Math.atan2(dz, dx), segmentLength, width, PATH_STRIPE_SURFACE_Y, material);
      this.scene.add(mesh);
    }
  }

  private addHardscapeLines(): void {
    for (const line of this.level.hardscapeLines) {
      if (line.kind === "basalt-edging") {
        this.addBasaltEdging(line);
      } else if (line.kind === "bluestone-drain") {
        this.addBluestoneDrain(line);
      } else {
        this.addWallLine(line);
      }
    }
  }

  private addWallLine(line: HardscapeLine): void {
    for (let i = 0; i < line.points.length - 1; i += 1) {
      const a = line.points[i];
      const b = line.points[i + 1];
      const segmentLength = distance(a, b);
      if (segmentLength < 0.5) continue;
      const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const wall = this.createTerrainRect(center, Math.atan2(b.z - a.z, b.x - a.x), segmentLength, line.width, line.height * 0.5, line.height, this.materials.basalt);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
    }
  }

  private addBluestoneDrain(line: HardscapeLine): void {
    for (let i = 0; i < line.points.length - 1; i += 1) {
      const a = line.points[i];
      const b = line.points[i + 1];
      const segmentLength = distance(a, b);
      if (segmentLength < 0.5) continue;
      const angle = Math.atan2(b.z - a.z, b.x - a.x);
      const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const channel = this.createTerrainRect(center, angle, segmentLength, line.width, 0.055, 0.045, this.materials.puddle);
      channel.receiveShadow = true;
      this.scene.add(channel);
      for (const side of [-1, 1]) {
        const offset = side * (line.width * 0.45);
        const nx = -Math.sin(angle);
        const nz = Math.cos(angle);
        const edgeCenter = { x: center.x + nx * offset, z: center.z + nz * offset };
        const edge = this.createTerrainRect(edgeCenter, angle, segmentLength, 0.16, line.height * 0.5, line.height, this.materials.basalt);
        edge.castShadow = true;
        edge.receiveShadow = true;
        this.scene.add(edge);
      }
    }
  }

  private addBasaltEdging(line: HardscapeLine): void {
    const placements: Array<{ position: Vec2; angle: number; scale: number }> = [];
    const spacing = 4.8;
    for (let i = 0; i < line.points.length - 1; i += 1) {
      const a = line.points[i];
      const b = line.points[i + 1];
      const segmentLength = distance(a, b);
      if (segmentLength < spacing) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const angle = Math.atan2(dz, dx);
      const nx = -dz / segmentLength;
      const nz = dx / segmentLength;
      const count = Math.floor(segmentLength / spacing);
      for (let step = 1; step <= count; step += 1) {
        if ((step + i) % 5 === 0) continue;
        const t = step / (count + 1);
        const wobble = ((step * 17 + i * 11) % 9 - 4) * 0.035;
        for (const side of [-1, 1]) {
          const offset = side * (line.width * 0.5 + 0.32 + wobble);
          placements.push({
            position: { x: a.x + dx * t + nx * offset, z: a.z + dz * t + nz * offset },
            angle,
            scale: 0.84 + ((step + i * 3) % 5) * 0.055
          });
        }
      }
    }

    if (placements.length === 0) return;
    const geometry = this.painterlyGeometry(new THREE.BoxGeometry(0.52, line.height, 0.36), this.materials.basalt);
    const mesh = new THREE.InstancedMesh(geometry, this.materials.basalt, placements.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < placements.length; i += 1) {
      const placement = placements[i];
      quaternion.setFromEuler(new THREE.Euler(0, -placement.angle + ((i % 7) - 3) * 0.025, 0));
      scale.set(placement.scale, 0.9 + (i % 4) * 0.08, 0.88 + (i % 3) * 0.06);
      matrix.compose(
        new THREE.Vector3(placement.position.x, this.groundY(placement.position) + line.height * 0.48, placement.position.z),
        quaternion,
        scale
      );
      mesh.setMatrixAt(i, matrix);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addGardenZone(landmark: Landmark): void {
    if (!landmark.polygon) return;
    if (landmark.gardenStyle === "stormwater-filtration") {
      this.addRaingarden(landmark.polygon);
      return;
    }
    if (landmark.gardenStyle === "stormwater-storage") {
      this.addRaingardenStorage(landmark.polygon);
      return;
    }
    if (landmark.cover === "dense-shrub") {
      this.addRaisedShrubPlanter(landmark);
      return;
    }
    if (landmark.gardenStyle === "ornamental-floral") {
      this.addOrnamentalDisplayBed(landmark);
      return;
    }
    if (landmark.gardenStyle === "ornamental-shrub" || landmark.gardenStyle === "agapanthus") {
      this.addOrnamentalShrubBed(landmark);
      return;
    }
    this.addFlatPolygon(landmark.polygon, this.materials.wornGrass, 0.064, landmark.id === "north-activity-precinct" ? 0.2 : 0.32);
    this.addFeatureOutline(landmark.polygon, 0xb7c99a, 0.32);
    if (landmark.id === "alfred-crescent-open-lawn") {
      this.addUnfencedSportsGround(landmark.polygon);
    }
    if (landmark.id === "north-activity-precinct") {
      this.addActivityPrecinctDetails(landmark.polygon);
    }
  }

  private addRaingardenStorage(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0.4, 0.4);
    const center = footprint.center;
    const rotation = -footprint.angle;
    this.addFlatPolygon(polygon, this.materials.concrete, 0.078, 0.42);
    this.addFeatureOutline(polygon, 0x9ea99f, 0.22);
    this.addLocalBox(center, rotation, 0, 0, footprint.halfX * 1.1, 0.035, 0.4, this.materials.metal, 0.115, false);
    for (const offset of [-footprint.halfX * 0.38, footprint.halfX * 0.38]) {
      this.addLocalCylinder(center, rotation, offset, 0, 0.36, 0.36, 0.045, this.materials.metal, 0.08);
    }
  }

  private addOrnamentalDisplayBed(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const polygon = landmark.polygon;
    const footprint = this.fitBoxFromPolygon(polygon, 0.2, 0.2);
    const center = footprint.center;
    const rotation = -footprint.angle;
    this.addFlatPolygon(polygon, this.materials.mulch, 0.082, 0.72);
    this.addFeatureOutline(polygon, landmark.id.includes("queen") ? 0x5f8b5d : 0xc8c0a8, 0.18);
    const leafMaterial = this.materials.hedge;
    const flowerMaterials = [
      this.standardDetailMaterial("display-flower-carmine", 0xb63b54, 0.62),
      this.standardDetailMaterial("display-flower-cream", 0xd8d2a1, 0.66),
      this.standardDetailMaterial("display-flower-blue", 0x606fbd, 0.7)
    ];
    const columns = Math.max(5, Math.min(16, Math.round((footprint.halfX * 2) / 3.4)));
    const rows = Math.max(2, Math.min(4, Math.round((footprint.halfZ * 2) / 2.4)));
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const localX = -footprint.halfX * 0.7 + (column / Math.max(1, columns - 1)) * footprint.halfX * 1.4;
        const localZ = -footprint.halfZ * 0.55 + (row / Math.max(1, rows - 1)) * footprint.halfZ * 1.1;
        const point = this.localPoint(center, rotation, localX, localZ);
        if (!pointInPolygon(point, polygon)) continue;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.34, 6, 4), leafMaterial);
        leaf.scale.set(1.15, 0.35, 0.82);
        leaf.position.set(point.x, this.groundY(point) + 0.16, point.z);
        leaf.receiveShadow = true;
        this.scene.add(leaf);
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), flowerMaterials[(row + column) % flowerMaterials.length]);
        flower.position.set(point.x, this.groundY(point) + 0.38, point.z);
        this.scene.add(flower);
      }
    }
  }

  private addOrnamentalShrubBed(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const polygon = landmark.polygon;
    const footprint = this.fitBoxFromPolygon(polygon, 0.2, 0.2);
    const center = footprint.center;
    const rotation = -footprint.angle;
    const agapanthus = landmark.gardenStyle === "agapanthus";
    this.addFlatPolygon(polygon, this.materials.mulch, 0.082, 0.7);
    this.addFeatureOutline(polygon, 0xb9b2a0, 0.18);
    const count = Math.max(7, Math.min(22, Math.round((footprint.halfX * footprint.halfZ) / (agapanthus ? 5 : 6))));
    const geometry = new THREE.SphereGeometry(1, 7, 5);
    const flowerMaterial = this.standardDetailMaterial("agapanthus-flower-head", 0x6b62b8, 0.68);
    for (let index = 0; index < count; index += 1) {
      const localX = (this.stableNoise(center.x, center.z, index) - 0.5) * footprint.halfX * 1.45;
      const localZ = (this.stableNoise(center.z, center.x, index + 17) - 0.5) * footprint.halfZ * 1.14;
      const point = this.localPoint(center, rotation, localX, localZ);
      if (!pointInPolygon(point, polygon)) continue;
      const height = agapanthus ? 0.28 + this.stableNoise(point.x, point.z, 21) * 0.24 : 0.58 + this.stableNoise(point.x, point.z, 22) * 0.58;
      const spread = agapanthus ? 0.42 + this.stableNoise(point.x, point.z, 23) * 0.28 : 0.58 + this.stableNoise(point.x, point.z, 24) * 0.42;
      const shrub = new THREE.Mesh(geometry, this.materials.hedge);
      shrub.scale.set(spread, height * 0.54, spread * 0.82);
      shrub.position.set(point.x, this.groundY(point) + 0.1 + height * 0.42, point.z);
      shrub.rotation.y = this.stableNoise(point.x, point.z, 25) * Math.PI * 2;
      shrub.castShadow = true;
      shrub.receiveShadow = true;
      this.scene.add(shrub);
      if (agapanthus && index % 3 === 0) {
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), flowerMaterial);
        flower.position.set(point.x, this.groundY(point) + 0.82, point.z);
        this.scene.add(flower);
      }
    }
  }

  private addRaisedShrubPlanter(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const polygon = landmark.polygon;
    const center = polygonCentroid(polygon);
    const radius = Math.max(...polygon.map((point) => distance(point, center)));
    const bluestone = landmark.id === "north-east-bluestone-shrub-planter";
    const edgeMaterial = bluestone ? this.materials.basalt : this.materials.concrete;
    const edgeWidth = bluestone ? 0.46 : 0.3;
    const edgeHeight = bluestone ? 0.44 : 0.26;

    this.addFlatPolygon(polygon, this.materials.mulch, 0.086, 0.82);
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const segmentLength = distance(a, b);
      if (segmentLength < 0.25) continue;
      const segmentCenter = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
      const edge = this.createTerrainRect(
        segmentCenter,
        Math.atan2(b.z - a.z, b.x - a.x),
        segmentLength,
        edgeWidth,
        0.08 + edgeHeight * 0.5,
        edgeHeight,
        edgeMaterial
      );
      edge.castShadow = true;
      edge.receiveShadow = true;
      this.scene.add(edge);
    }

    const shrubCount = bluestone ? 26 : 9;
    const shrubGeometry = new THREE.SphereGeometry(1, 8, 6);
    for (let index = 0; index < shrubCount; index += 1) {
      const theta = index * 2.399963 + (this.stableNoise(center.x, center.z, index) - 0.5) * 0.26;
      const ring = Math.sqrt((index + 0.5) / shrubCount) * radius * (bluestone ? 0.78 : 0.7);
      const point = {
        x: center.x + Math.cos(theta) * ring,
        z: center.z + Math.sin(theta) * ring
      };
      if (!pointInPolygon(point, polygon)) continue;
      const height = bluestone ? 0.75 + this.stableNoise(point.x, point.z, 21) * 0.86 : 0.42 + this.stableNoise(point.x, point.z, 22) * 0.42;
      const spread = bluestone ? 0.82 + this.stableNoise(point.x, point.z, 23) * 0.66 : 0.46 + this.stableNoise(point.x, point.z, 24) * 0.34;
      const shrub = new THREE.Mesh(shrubGeometry, this.materials.hedge);
      shrub.scale.set(spread * 1.16, height * 0.62, spread);
      shrub.position.set(point.x, this.groundY(point) + 0.11 + height * 0.42, point.z);
      shrub.rotation.y = theta;
      shrub.castShadow = true;
      shrub.receiveShadow = true;
      this.scene.add(shrub);
    }
  }

  private addRaingarden(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 1.8, 1.35);
    const center = footprint.center;
    const rotation = -footprint.angle;
    const plantedLength = Math.max(12, footprint.halfX * 1.68);
    const plantedDepth = Math.max(6, footprint.halfZ * 1.52);
    const terraceLength = plantedLength / 4;
    const startX = -plantedLength * 0.5 + terraceLength * 0.5;

    const base = this.createTerrainRect(center, rotation, plantedLength + 1.1, plantedDepth + 1.0, 0.066, 0.028, this.materials.leafLitter);
    base.receiveShadow = true;
    this.scene.add(base);
    this.addFeatureOutline(polygon, 0x7fa08c, 0.5);

    // The GHD/Landezine plan and photographs show four bays stepping along the
    // long axis, bounded by pale concrete and crossed by a weathering-steel
    // zig-zag. The previous renderer incorrectly drew four long parallel bars.
    for (let terrace = 0; terrace < 4; terrace += 1) {
      const localX = startX + terrace * terraceLength;
      const material = terrace % 2 === 0 ? this.materials.mulch : this.materials.wornGrass;
      this.addLocalBox(center, rotation, localX, 0, terraceLength * 0.92, 0.04, plantedDepth * 0.9, material, 0.08, false);
      if (terrace < 3) {
        const dividerX = -plantedLength * 0.5 + (terrace + 1) * terraceLength;
        this.addLocalBox(center, rotation, dividerX, 0, 0.13, 0.2, plantedDepth * 0.92, this.materials.concrete, 0.15);
      }
    }

    for (const side of [-1, 1]) {
      this.addLocalBox(center, rotation, 0, side * plantedDepth * 0.5, plantedLength + 0.8, 0.24, 0.18, this.materials.concrete, 0.16);
    }

    const channelLocal: Vec2[] = [
      { x: -plantedLength * 0.48, z: -plantedDepth * 0.42 },
      { x: -plantedLength * 0.28, z: plantedDepth * 0.18 },
      { x: -plantedLength * 0.08, z: -plantedDepth * 0.34 },
      { x: plantedLength * 0.12, z: plantedDepth * 0.22 },
      { x: plantedLength * 0.31, z: -plantedDepth * 0.3 },
      { x: plantedLength * 0.48, z: plantedDepth * 0.36 }
    ];
    this.addRaingardenLowFlowChannel(center, rotation, channelLocal);

    const inlet = channelLocal[0];
    const outlet = channelLocal[channelLocal.length - 1];
    this.addLocalCylinder(center, rotation, inlet.x - 0.55, inlet.z - 0.25, 0.52, 0.58, 0.09, this.materials.basalt);
    this.addLocalCylinder(center, rotation, inlet.x - 0.55, inlet.z - 0.25, 0.35, 0.35, 0.045, this.materials.metal, 0.09);
    this.addLocalCylinder(center, rotation, outlet.x + 0.4, outlet.z + 0.25, 0.48, 0.52, 0.08, this.materials.concrete);
    this.addLocalCylinder(center, rotation, outlet.x + 0.4, outlet.z + 0.25, 0.28, 0.28, 0.04, this.materials.metal, 0.08);
    this.addLocalBox(center, rotation, plantedLength * 0.44, plantedDepth * 0.47, plantedLength * 0.16, 0.035, 0.32, this.materials.concrete, 0.105, false);
    this.addRaingardenPlanting(center, rotation, footprint.halfX, plantedDepth, polygon);
  }

  private addRaingardenLowFlowChannel(center: Vec2, rotation: number, localPoints: Vec2[]): void {
    for (let i = 0; i < localPoints.length - 1; i += 1) {
      const a = this.localPoint(center, rotation, localPoints[i].x, localPoints[i].z);
      const b = this.localPoint(center, rotation, localPoints[i + 1].x, localPoints[i + 1].z);
      const segmentLength = distance(a, b);
      if (segmentLength < 0.3) continue;
      const angle = Math.atan2(b.z - a.z, b.x - a.x);
      const segmentCenter = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
      const water = this.createTerrainRect(segmentCenter, angle, segmentLength, 0.36, 0.12, 0.022, this.materials.puddle);
      water.receiveShadow = true;
      this.scene.add(water);

      const nx = -Math.sin(angle);
      const nz = Math.cos(angle);
      for (const side of [-1, 1]) {
        const edgeCenter = { x: segmentCenter.x + nx * side * 0.24, z: segmentCenter.z + nz * side * 0.24 };
        const edge = this.createTerrainRect(edgeCenter, angle, segmentLength, 0.055, 0.145, 0.035, this.materials.metal);
        edge.receiveShadow = true;
        this.scene.add(edge);
      }
    }
  }

  private addRaingardenPlanting(center: Vec2, rotation: number, halfX: number, plantedDepth: number, polygon: Vec2[]): void {
    const positions: Array<{ point: Vec2; height: number; radius: number }> = [];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 10; column += 1) {
        const localX = -halfX * 0.72 + column * ((halfX * 1.44) / 9) + (this.stableNoise(row, column, 41) - 0.5) * 0.34;
        const localZ = -plantedDepth * 0.38 + row * ((plantedDepth * 0.76) / 3) + (this.stableNoise(row, column, 73) - 0.5) * 0.28;
        if (Math.abs(localX) < halfX * 0.18 && row % 2 === 1) continue;
        const point = this.localPoint(center, rotation, localX, localZ);
        if (!pointInPolygon(point, polygon)) continue;
        positions.push({
          point,
          height: 0.55 + this.stableNoise(localX, localZ, 5) * 0.65,
          radius: 0.18 + this.stableNoise(localX, localZ, 9) * 0.16
        });
      }
    }
    if (positions.length === 0) return;

    const geometry = new THREE.ConeGeometry(1, 1, 5);
    const material = new THREE.MeshStandardMaterial({ color: 0x58705b, roughness: 0.94 });
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 1) {
      const placement = positions[i];
      quaternion.setFromEuler(new THREE.Euler(0, (i % 7) * 0.38, 0));
      scale.set(placement.radius, placement.height, placement.radius);
      matrix.compose(
        new THREE.Vector3(placement.point.x, this.groundY(placement.point) + 0.1 + placement.height * 0.5, placement.point.z),
        quaternion,
        scale
      );
      mesh.setMatrixAt(i, matrix);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addFeatureOutline(polygon: Vec2[], color: number, opacity: number): void {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const points = [...polygon, polygon[0]].map((point) => new THREE.Vector3(point.x, this.groundY(point) + 0.17, point.z));
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  private addUnfencedSportsGround(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, -4.5, -3.5);
    const rotation = -0.58;
    const width = Math.min(footprint.halfX * 1.45, 58);
    const depth = Math.min(footprint.halfZ * 1.38, 44);
    this.addFieldLines(footprint.center, width, depth, rotation, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 },
      { x1: -0.5, z1: 0, x2: 0.5, z2: 0 },
      { x1: -0.16, z1: -0.5, x2: -0.16, z2: -0.38 },
      { x1: 0.16, z1: -0.5, x2: 0.16, z2: -0.38 },
      { x1: -0.16, z1: 0.5, x2: -0.16, z2: 0.38 },
      { x1: 0.16, z1: 0.5, x2: 0.16, z2: 0.38 }
    ], 0xd8e0bd);
    this.addCourtCircle(footprint.center, 4.7, 0xd8e0bd);
    for (const z of [-0.53, 0.53]) {
      for (const x of [-0.12, 0.12]) {
        const postPosition = this.localPoint(footprint.center, rotation, x * width, z * depth);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.4, 8), this.materials.line);
        post.position.set(postPosition.x, this.groundY(postPosition) + 1.2, postPosition.z);
        post.castShadow = true;
        this.scene.add(post);
      }
    }
  }

  private addActivityPrecinctDetails(polygon: Vec2[]): void {
    const center = polygonCentroid(polygon);
    const pad = new THREE.Mesh(
      this.painterlyGeometry(new THREE.CircleGeometry(3.4, 24), this.materials.concrete),
      this.materials.concrete
    );
    const padPoint = { x: center.x - 6.2, z: center.z + 4.4 };
    const padGroundY = this.radialSupportY(padPoint, 3.4);
    pad.position.set(padPoint.x, padGroundY + 0.07, padPoint.z);
    pad.rotation.x = -Math.PI / 2;
    pad.receiveShadow = true;
    this.scene.add(pad);
    for (const offset of [-0.7, 0.7]) {
      const chess = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.65), new THREE.MeshStandardMaterial({ color: offset < 0 ? 0xe6dfc2 : 0x343a34, roughness: 0.6 }));
      const chessPoint = { x: center.x - 6.2 + offset, z: center.z + 4.4 };
      chess.position.set(chessPoint.x, padGroundY + 0.76, chessPoint.z);
      chess.castShadow = true;
      this.scene.add(chess);
    }
  }

  private addLandmarks(): void {
    for (const landmark of this.level.landmarks) {
      if (landmark.kind === "park") continue;
      if (landmark.kind === "garden" && landmark.polygon) this.addGardenZone(landmark);
      if (landmark.kind === "oval" && landmark.polygon) this.addOval(landmark);
      if (landmark.kind === "grandstand" && landmark.polygon) this.addGrandstand(landmark);
      if (landmark.kind === "court" && landmark.polygon) {
        this.addTennisCourt(landmark);
      }
      if (landmark.kind === "bowls" && landmark.polygon) {
        this.addFlatPolygon(landmark.polygon, this.materials.court, 0.08, landmark.id.startsWith("bowling-green") ? 0.86 : 0.6);
        if (landmark.id.startsWith("bowling-green")) {
          this.addBowlingRinkLines(landmark.polygon);
        }
      }
      if (landmark.kind === "playground" && landmark.polygon) this.addPlayground(landmark);
      if (landmark.kind === "skate" && landmark.polygon) this.addSkatePark(landmark);
      if (landmark.kind === "basketball" && landmark.polygon) this.addBasketball(landmark);
      if (landmark.kind === "toilets") this.addToilets(landmark);
      if (landmark.kind === "bbq" && landmark.position) this.addBbq(landmark.position);
      if (landmark.kind === "rotunda" && landmark.position) this.addRotunda(landmark.position);
      if (landmark.kind === "memorial" && landmark.position) this.addMemorial(landmark);
    }
  }

  private addMappedBuildings(): void {
    for (const building of this.level.mappedBuildings) {
      this.addMappedBuilding(building);
    }
  }

  private addStructureShelters(): void {
    for (const shelter of this.level.structureShelters) {
      this.addStructureShelter(shelter);
    }
  }

  private addStructureShelter(shelter: StructureShelter): void {
    const dryPatch = this.washDetailMaterial(`structure-shelter-dry-${shelter.kind}`, 0xc9bea0, 0.13 + shelter.weatherProtection * 0.08);
    const dripMaterial = this.washDetailMaterial(`structure-shelter-drip-${shelter.kind}`, 0x3f4c48, 0.18);
    if (shelter.footprint.shape === "circle") {
      const patch = this.createTerrainOverlayDisc(shelter.footprint.center, shelter.footprint.radius, PATH_PATCH_SURFACE_Y + 0.012, dryPatch);
      patch.receiveShadow = false;
      patch.renderOrder = 1;
      this.scene.add(patch);
      const ring = this.createTerrainOverlayDisc(shelter.footprint.center, shelter.footprint.radius + 0.32, PATH_PATCH_SURFACE_Y + 0.014, dripMaterial);
      ring.scale.setScalar(1.02);
      ring.receiveShadow = false;
      ring.renderOrder = 0;
      this.scene.add(ring);
      return;
    }

    const patch = this.createTerrainOverlayRect(
      shelter.footprint.center,
      shelter.footprint.angle,
      shelter.footprint.halfX * 2,
      shelter.footprint.halfZ * 2,
      PATH_PATCH_SURFACE_Y + 0.012,
      dryPatch
    );
    patch.receiveShadow = false;
    patch.renderOrder = 1;
    this.scene.add(patch);

    for (const side of [-1, 1]) {
      const edgeCenter = this.localPoint(shelter.footprint.center, shelter.footprint.angle, 0, side * shelter.footprint.halfZ);
      const drip = this.createTerrainOverlayRect(
        edgeCenter,
        shelter.footprint.angle,
        shelter.footprint.halfX * 2,
        0.18,
        PATH_PATCH_SURFACE_Y + 0.016,
        dripMaterial
      );
      drip.receiveShadow = false;
      drip.renderOrder = 2;
      this.scene.add(drip);
    }
  }

  private addMappedBuilding(building: MappedBuilding): void {
    if (building.detailProfile === "rotunda-pavilion") {
      return;
    }

    if (building.id === "osm-man-made-715802679") {
      this.addMappedStorageTank(building);
      return;
    }

    // Figure 61 of the 2021 CMP records this object as an open timber
    // entrance pavilion, not a solid gatehouse. Its framing and roof are
    // built by the detail profile below, so a generic prism would close the
    // real passage bays.
    if (building.detailProfile === "gatehouse") {
      const existingChildren = new Set(this.scene.children);
      this.addMappedBuildingDetails(building, polygonCentroid(building.polygon));
      this.replaceEntrancePavilionFallbackWithAsset(
        building,
        this.scene.children.filter((child) => !existingChildren.has(child))
      );
      return;
    }

    const bowlingClubFallbackStart = building.detailProfile === "bowling-club" ? new Set(this.scene.children) : null;
    const emelyBakerFallbackStart = building.detailProfile === "community-centre" ? new Set(this.scene.children) : null;
    const alfredPavilionFallbackStart = building.id === "osm-building-242003562" ? new Set(this.scene.children) : null;

    const material =
      building.detailProfile === "tennis-pavilion"
        ? this.standardDetailMaterial("tennis-pavilion-ochre-weatherboards", 0xc7a45d, 0.82, 0.01)
        : building.detailProfile === "bowling-club"
          ? this.standardDetailMaterial("bowls-lower-storey-cream", 0xc7c2a5, 0.84, 0.01)
          : building.detailProfile === "community-centre"
            ? this.standardDetailMaterial("emely-baker-tan-brick", 0x8a6b4e, 0.88, 0.01)
            : building.material === "brick"
              ? this.materials.brick
              : building.material === "timber"
                ? this.materials.timber
                : this.materials.concrete;
    const visualHeight = building.detailProfile === "bowling-club" ? 3.05 : building.height;
    const mesh = this.addPrismPolygon(building.polygon, visualHeight, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const center = polygonCentroid(building.polygon);
    if (
      building.detailProfile !== "tennis-pavilion" &&
      building.detailProfile !== "bowling-club" &&
      building.detailProfile !== "community-centre"
    ) {
      const roof = this.addPrismPolygon(building.polygon, 0.18, this.materials.metal, building.height + 0.08);
      roof.castShadow = true;
    }

    if (building.id === "osm-building-543505702" || building.id === "osm-building-242003562") {
      this.addLabel(building.label, center, building.height + 1.8);
    }
    this.addMappedBuildingDetails(building, center);
    if (bowlingClubFallbackStart) {
      this.replaceBowlingClubFallbackWithAsset(
        building,
        this.scene.children.filter((child) => !bowlingClubFallbackStart.has(child))
      );
    }
    if (emelyBakerFallbackStart) {
      this.replaceEmelyBakerFallbackWithAsset(
        building,
        this.scene.children.filter((child) => !emelyBakerFallbackStart.has(child))
      );
    }
    if (alfredPavilionFallbackStart) {
      this.replaceAlfredCrescentPavilionFallbackWithAsset(
        building,
        this.scene.children.filter((child) => !alfredPavilionFallbackStart.has(child))
      );
    }
  }

  private addMappedStorageTank(building: MappedBuilding): void {
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0);
    const center = footprint.center;
    const radius = Math.max(0.58, Math.min(footprint.halfX, footprint.halfZ) * 0.94);
    const groundY = this.radialSupportY(center, radius + 0.35);
    const tankMaterial = this.standardDetailMaterial("storage-tank-body", 0x7e8780, 0.56, 0.3);
    const lidMaterial = this.standardDetailMaterial("storage-tank-lid", 0xa9b1a9, 0.48, 0.42);

    const pad = new THREE.Mesh(
      this.painterlyGeometry(new THREE.CylinderGeometry(radius + 0.36, radius + 0.44, 0.08, 24), this.materials.concrete),
      this.materials.concrete
    );
    pad.position.set(center.x, groundY + 0.04, center.z);
    pad.receiveShadow = true;
    this.scene.add(pad);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.03, building.height, 28), tankMaterial);
    body.position.set(center.x, groundY + 0.08 + building.height / 2, center.z);
    body.castShadow = true;
    body.receiveShadow = true;
    this.scene.add(body);

    const lid = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.96, radius, 0.1, 28), lidMaterial);
    lid.position.set(center.x, groundY + 0.13 + building.height, center.z);
    lid.castShadow = true;
    this.scene.add(lid);
  }

  private addMappedBuildingDetails(building: MappedBuilding, center: Vec2): void {
    if (!building.detailProfile) return;
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0, building.facade?.frontagePoint);
    const rotation = -footprint.angle;
    const frontZ = footprint.halfZ + 0.08;
    const rearZ = -footprint.halfZ - 0.08;

    if (building.detailProfile === "tennis-pavilion") {
      const ochreWeatherboard = this.standardDetailMaterial("tennis-pavilion-ochre-weatherboards", 0xc7a45d, 0.82, 0.01);
      const redTimber = this.standardDetailMaterial("tennis-pavilion-red-timber", 0x6f3427, 0.76, 0.01);
      const paleRoof = this.standardDetailMaterial("tennis-pavilion-corrugated-roof", 0xbfc0ad, 0.68, 0.16);
      this.addBuildingApron(center, rotation, 0, frontZ + 0.88, footprint.halfX * 1.62, 1.62);
      this.addLocalBox(center, rotation, 0, frontZ + 0.015, footprint.halfX * 1.86, 2.85, 0.08, ochreWeatherboard, 1.46, false);
      this.addBuildingAwning(center, rotation, 0, frontZ + 0.7, footprint.halfX * 1.72, 1.42, building.height - 0.42, paleRoof, 0.14);
      for (const x of [-0.78, -0.39, 0, 0.39, 0.78]) {
        this.addLocalCylinder(center, rotation, x * footprint.halfX, frontZ + 0.48, 0.055, 0.07, 2.58, redTimber);
      }
      this.addBuildingGutter(center, rotation, 0, frontZ + 0.03, footprint.halfX * 1.86, building.height);
      for (const x of [-0.68, -0.4, 0.18]) {
        this.addBuildingWindow(center, rotation, x * footprint.halfX, frontZ + 0.06, footprint.halfX * 0.22, 1.18, 1.46);
      }
      this.addBuildingDoor(center, rotation, -footprint.halfX * 0.08, frontZ + 0.07, footprint.halfX * 0.2, 1.82, 1.03, 0.08);
      this.addBuildingDoor(center, rotation, footprint.halfX * 0.5, frontZ + 0.1, footprint.halfX * 0.18, 1.78, 1.01, 0.08);
      for (let board = 0; board < 7; board += 1) {
        this.addLocalBox(center, rotation, 0, frontZ + 0.085, footprint.halfX * 1.84, 0.025, 0.025, ochreWeatherboard, 0.34 + board * 0.34, false);
      }
      for (const x of [-0.74, -0.28, 0.24, 0.72]) {
        this.addBuildingWindow(center, rotation, x * footprint.halfX, rearZ - 0.03, footprint.halfX * 0.22, 1.12, 1.42);
      }
      this.addHippedRoof(center, rotation, -footprint.halfX * 0.2, 0, footprint.halfX * 1.45, footprint.halfZ * 1.95, building.height - 0.04, 1.22, paleRoof);
      this.addHippedRoof(center, rotation, footprint.halfX * 0.48, -footprint.halfZ * 0.03, footprint.halfX * 0.7, footprint.halfZ * 2.08, building.height + 0.02, 1.36, paleRoof);
      this.addGabledRoof(center, rotation, footprint.halfX * 0.48, frontZ * 0.62, footprint.halfX * 0.48, footprint.halfZ * 0.64, building.height - 0.03, 1.02, paleRoof);
      this.addFacadePediment(
        center,
        rotation,
        footprint.halfX * 0.48,
        frontZ + 0.105,
        footprint.halfX * 0.48,
        0.62,
        2.86,
        ochreWeatherboard
      );
      const clockFace = new THREE.Mesh(
        new THREE.CircleGeometry(0.25, 18),
        this.standardDetailMaterial("tennis-pavilion-clock-face", 0xe4debd, 0.72, 0.02)
      );
      const clockPoint = this.localPoint(center, rotation, -footprint.halfX * 0.08, frontZ + 0.105);
      clockFace.position.set(clockPoint.x, this.groundY(clockPoint) + building.height - 0.42, clockPoint.z);
      clockFace.rotation.set(0, rotation, 0);
      this.scene.add(clockFace);
      for (const x of [-0.62, 0.52]) {
        this.addBuildingDownpipe(center, rotation, x * footprint.halfX, frontZ + 0.06, building.height);
      }
      this.addLabel("Fitzroy Tennis Club", center, building.height + 1.45);
      return;
    }

    if (building.detailProfile === "bowling-club") {
      const muralBlue = this.basicDetailMaterial("bowls-mural-blue", 0x234f88);
      const muralMaroon = this.basicDetailMaterial("bowls-mural-maroon", 0x67242c);
      const muralGold = this.basicDetailMaterial("bowls-mural-gold", 0xe6a343);
      const zincalumeRoof = this.standardDetailMaterial("bowls-zincalume-roof-sheets", 0xb9c4bd, 0.4, 0.34);
      const greenFrame = this.standardDetailMaterial("bowls-green-glazing-frame", 0x41665b, 0.58, 0.22);
      this.addBuildingApron(center, rotation, -footprint.halfX * 0.18, frontZ + 0.82, footprint.halfX * 1.42, 1.7, 0.12);
      const lowerRoofY = 3.12;
      this.addBuildingAwning(center, rotation, -footprint.halfX * 0.05, frontZ + 0.58, footprint.halfX * 1.68, 1.35, lowerRoofY, zincalumeRoof, 0.22);
      this.addBuildingGutter(center, rotation, -footprint.halfX * 0.05, frontZ + 0.03, footprint.halfX * 1.82, lowerRoofY);
      this.addBuildingGutter(center, rotation, 0, rearZ - 0.03, footprint.halfX * 1.62, lowerRoofY);
      this.addLocalBox(center, rotation, -footprint.halfX * 0.05, 0, footprint.halfX * 1.82, 0.055, footprint.halfZ * 1.86, zincalumeRoof, lowerRoofY + 0.13);
      for (const x of [-0.72, -0.42, -0.12, 0.18, 0.48, 0.78]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, 0, 0.035, 0.065, footprint.halfZ * 1.92, this.materials.metal, lowerRoofY + 0.18, false);
      }
      const upperBlock = this.standardDetailMaterial("bowls-upper-storey-cream", 0xd6d0ae, 0.86, 0.01);
      this.addLocalBox(center, rotation, -footprint.halfX * 0.58, -footprint.halfZ * 0.14, footprint.halfX * 0.55, 1.55, footprint.halfZ * 1.3, upperBlock, 3.78);
      this.addLocalBox(center, rotation, -footprint.halfX * 0.58, -footprint.halfZ * 0.14, footprint.halfX * 0.6, 0.08, footprint.halfZ * 1.38, zincalumeRoof, 4.58);
      for (const x of [-0.72, -0.56, -0.4]) {
        this.addBuildingWindow(center, rotation, x * footprint.halfX, frontZ - 0.02, footprint.halfX * 0.12, 0.58, 3.72, 0.08);
      }
      for (const x of [-0.92, 0.78]) {
        this.addBuildingDownpipe(center, rotation, x * footprint.halfX, frontZ + 0.07, lowerRoofY);
        this.addBuildingDownpipe(center, rotation, x * footprint.halfX, rearZ - 0.07, lowerRoofY);
      }
      for (const x of [-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72]) {
        this.addBuildingWindow(center, rotation, x * footprint.halfX, frontZ - 0.02, footprint.halfX * 0.18, 1.28, 1.48, 0.09);
      }
      for (const x of [-0.84, -0.6, -0.36, -0.12, 0.12, 0.36, 0.6, 0.84]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.08, 0.055, 1.5, 0.055, greenFrame, 1.48, false);
      }
      for (const y of [0.78, 2.12]) {
        this.addLocalBox(center, rotation, 0, frontZ + 0.08, footprint.halfX * 1.78, 0.055, 0.055, greenFrame, y, false);
      }
      for (const x of [-0.66, 0.66]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.25, 0.12, 1.35, 0.12, this.materials.timber, 0.8);
      }
      this.addLocalBox(center, rotation, -footprint.halfX - 0.035, footprint.halfZ * 0.06, 0.07, 2.42, footprint.halfZ * 1.18, muralMaroon, 1.45, false);
      this.addLocalBox(center, rotation, -footprint.halfX - 0.06, -footprint.halfZ * 0.49, 0.08, 0.34, footprint.halfZ * 0.18, muralBlue, 2.46, false);
      this.addLocalBox(center, rotation, -footprint.halfX - 0.06, -footprint.halfZ * 0.12, 0.08, 0.08, footprint.halfZ * 0.34, muralGold, 2.46, false);
      this.addBowlsMuralMotifs(center, rotation, footprint);
      this.addLocalBox(
        center,
        rotation,
        0,
        frontZ + 1.28,
        footprint.halfX * 1.72,
        0.42,
        0.08,
        this.basicDetailMaterial("bowls-blue-fascia", 0x223f64),
        2.58,
        false
      );
      this.addBuildingTextSign(
        center,
        rotation,
        -footprint.halfX * 0.43,
        frontZ + 1.33,
        footprint.halfX * 0.82,
        0.34,
        2.61,
        "FITZROY VICTORIA",
        "#223f64",
        "#f3d47d"
      );
      this.addBuildingTextSign(
        center,
        rotation,
        footprint.halfX * 0.43,
        frontZ + 1.33,
        footprint.halfX * 0.82,
        0.34,
        2.61,
        "BOWLING & SPORTS",
        "#223f64",
        "#f3d47d"
      );
      const solarPanel = this.standardDetailMaterial("bowls-solar-panel", 0x264b67, 0.36, 0.42);
      for (const x of [-0.62, -0.42, -0.22, -0.02, 0.18, 0.38, 0.58]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.32, footprint.halfX * 0.16, 0.055, 0.72, solarPanel, lowerRoofY + 0.22, false);
      }
      this.addLocalBox(center, rotation, footprint.halfX * 0.72, frontZ + 1.12, 0.8, 0.48, 0.32, this.materials.timber, 0.32);
      this.addLabel("Fitzroy Victoria Bowling Club", center, building.height + 1.45);
      return;
    }

    if (building.detailProfile === "gatehouse") {
      const creamPanel = this.standardDetailMaterial("entrance-pavilion-cream-panel", 0xd9c994, 0.82, 0);
      const redFrame = this.standardDetailMaterial("entrance-pavilion-red-frame", 0x684034, 0.72, 0.02);
      const corrugatedRoof = this.standardDetailMaterial("entrance-pavilion-corrugated-roof", 0xc0c2b7, 0.64, 0.16);
      this.addLocalBox(center, rotation, 0, 0, footprint.halfX * 2.06, 0.09, footprint.halfZ * 2.1, this.materials.concrete, 0.08, false);
      for (const x of [-0.84, 0.84]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, 0, footprint.halfX * 0.3, 2.36, footprint.halfZ * 1.78, creamPanel, 1.22);
        for (const frameX of [-0.97, -0.71]) {
          this.addLocalBox(center, rotation, Math.sign(x) * Math.abs(frameX) * footprint.halfX, frontZ - 0.08, 0.07, 2.44, 0.08, redFrame, 1.24);
          this.addLocalBox(center, rotation, Math.sign(x) * Math.abs(frameX) * footprint.halfX, rearZ + 0.08, 0.07, 2.44, 0.08, redFrame, 1.24);
        }
      }
      for (const x of [-0.62, -0.22, 0.22, 0.62]) {
        for (const z of [frontZ - 0.08, rearZ + 0.08]) {
          this.addLocalBox(center, rotation, x * footprint.halfX, z, 0.09, 2.48, 0.09, redFrame, 1.26);
        }
      }
      for (const z of [frontZ - 0.08, rearZ + 0.08]) {
        this.addLocalBox(center, rotation, 0, z, footprint.halfX * 2.02, 0.16, 0.1, redFrame, 2.42);
        for (let index = -10; index <= 10; index += 1) {
          const x = (index / 10) * footprint.halfX * 0.92;
          this.addLocalBox(center, rotation, x, z + Math.sign(z) * 0.015, 0.045, 0.12, 0.07, redFrame, 2.31, false);
        }
      }
      this.addHippedRoof(
        center,
        rotation,
        0,
        0,
        footprint.halfX * 2.18,
        footprint.halfZ * 2.36,
        building.height + 0.02,
        0.48,
        corrugatedRoof
      );
      this.addBuildingGutter(center, rotation, 0, frontZ + 0.08, footprint.halfX * 2.08, building.height + 0.04);
      this.addBuildingGutter(center, rotation, 0, rearZ - 0.08, footprint.halfX * 2.08, building.height + 0.04);
      this.addLabel("Timber entrance pavilion", center, building.height + 1.15);
      return;
    }

    if (building.detailProfile === "rotunda-pavilion") {
      const pavilionRadius = Math.min(footprint.halfX, footprint.halfZ) * 0.84;
      const dome = new THREE.Mesh(
        this.painterlyGeometry(new THREE.ConeGeometry(footprint.halfX * 1.45, 0.9, 18), this.materials.timber),
        this.materials.timber
      );
      dome.position.set(center.x, this.radialSupportY(center, footprint.halfX) + building.height + 0.48, center.z);
      dome.castShadow = true;
      this.scene.add(dome);
      this.addBuildingApron(center, rotation, 0, frontZ + 0.38, footprint.halfX * 0.92, 0.86, 0.08);
      this.addBuildingDoor(center, rotation, 0, frontZ + 0.18, footprint.halfX * 0.8, 1.2, 0.86);
      this.addBuildingSign(center, rotation, -footprint.halfX * 0.42, frontZ + 0.2, footprint.halfX * 0.28, 0.32, 1.65, 0x5a4630);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        this.addLocalCylinder(center, rotation, Math.cos(angle) * pavilionRadius, Math.sin(angle) * pavilionRadius, 0.055, 0.07, 2.15, this.materials.timber);
      }
      for (const z of [-0.28, 0.28]) {
        this.addLocalBox(center, rotation, 0, z * footprint.halfZ, footprint.halfX * 0.82, 0.16, 0.22, this.materials.timber, 0.48);
      }
      this.addBuildingRoofVent(center, rotation, 0, 0, building.height, 0.42, 0.42);
      return;
    }

    if (building.detailProfile === "community-centre") {
      const emelyBrick = this.standardDetailMaterial("emely-baker-tan-brick", 0x8a6b4e, 0.88, 0.01);
      const emelyRoof = this.standardDetailMaterial("emely-baker-metal-tray-deck", 0x788783, 0.62, 0.2);
      const wallCoping = this.standardDetailMaterial("emely-baker-tile-coping", 0xb6aa8d, 0.8, 0.02);
      const clerestory = this.facadeWindowMaterial();
      const aluminium = this.standardDetailMaterial("emely-baker-blue-grey-aluminium", 0x526d70, 0.46, 0.42);
      const darkSail = this.standardDetailMaterial("emely-baker-charcoal-shade-sail", 0x202827, 0.86, 0.01, true, 0.92);
      this.addSkillionPolygonRoof(building.polygon, building.height + 0.04, 0.28, footprint.angle, emelyRoof);
      this.addBuildingApron(center, rotation, 0, frontZ + 0.52, footprint.halfX * 1.5, 1.18, 0.08);
      this.addLocalBox(center, rotation, 0, frontZ + 0.055, footprint.halfX * 1.33, 2.34, 0.08, clerestory, 1.43, false);
      for (const x of [-0.62, -0.46, -0.3, -0.14, 0.02, 0.18, 0.34, 0.5, 0.66]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.105, 0.055, 2.42, 0.07, aluminium, 1.44, false);
      }
      for (const y of [0.48, 2.30, 2.71]) {
        this.addLocalBox(center, rotation, 0, frontZ + 0.112, footprint.halfX * 1.34, 0.055, 0.07, aluminium, y, false);
      }
      for (const [x, width] of [[0.18, 0.92], [4.92, 1.04], [6.05, 1.04]] as const) {
        this.addLocalBox(center, rotation, x, frontZ + 0.155, width, 2.02, 0.085, clerestory, 1.17, false);
        for (const side of [-1, 1]) {
          this.addLocalBox(center, rotation, x + side * width * 0.48, frontZ + 0.19, 0.055, 2.06, 0.1, aluminium, 1.17, false);
        }
      }

      const yardRearZ = frontZ + 0.04;
      const yardFrontZ = frontZ + 5.48;
      const yardMidZ = (yardRearZ + yardFrontZ) * 0.5;
      const yardDepth = yardFrontZ - yardRearZ;
      const sideWallX = footprint.halfX * 0.8595;
      const gateCenterZ = frontZ + 3.70;
      const gateHalfWidth = 0.86;
      const westRearEndZ = gateCenterZ - gateHalfWidth;
      const westFrontStartZ = gateCenterZ + gateHalfWidth;
      this.addLocalBox(center, rotation, 0, yardFrontZ, footprint.halfX * 1.718, 1.72, 0.22, emelyBrick, 0.9);
      this.addLocalBox(center, rotation, 0, yardFrontZ, footprint.halfX * 1.724, 0.1, 0.32, wallCoping, 1.82);
      this.addLocalBox(center, rotation, sideWallX, yardMidZ, 0.22, 1.72, yardDepth, emelyBrick, 0.9);
      this.addLocalBox(center, rotation, sideWallX, yardMidZ, 0.32, 0.1, yardDepth + 0.08, wallCoping, 1.82);
      this.addLocalBox(center, rotation, -sideWallX, (yardRearZ + westRearEndZ) * 0.5, 0.22, 1.72, westRearEndZ - yardRearZ, emelyBrick, 0.9);
      this.addLocalBox(center, rotation, -sideWallX, (yardRearZ + westRearEndZ) * 0.5, 0.32, 0.1, westRearEndZ - yardRearZ + 0.06, wallCoping, 1.82);
      this.addLocalBox(center, rotation, -sideWallX, (westFrontStartZ + yardFrontZ) * 0.5, 0.22, 1.72, yardFrontZ - westFrontStartZ, emelyBrick, 0.9);
      this.addLocalBox(center, rotation, -sideWallX, (westFrontStartZ + yardFrontZ) * 0.5, 0.32, 0.1, yardFrontZ - westFrontStartZ + 0.06, wallCoping, 1.82);
      const gateMaterial = this.standardDetailMaterial("emely-baker-courtyard-gate", 0x495750, 0.56, 0.32);
      for (let index = 0; index < 6; index += 1) {
        this.addLocalBox(center, rotation, -sideWallX + 0.10 + index * 0.27, gateCenterZ + 0.70, 0.045, 1.48, 0.045, gateMaterial, 0.76, false);
      }
      for (const y of [0.34, 0.82, 1.48]) {
        this.addLocalBox(center, rotation, -sideWallX + 0.78, gateCenterZ + 0.70, 1.52, 0.06, 0.06, gateMaterial, y, false);
      }
      this.addLocalShadeSail(
        center,
        rotation,
        [
          { x: -9.2, z: frontZ + 0.60, y: 2.74 },
          { x: 1.15, z: frontZ + 0.60, y: 2.68 },
          { x: -4.0, z: frontZ + 5.03, y: 2.58 }
        ],
        darkSail
      );
      for (const x of [0.42, 0.66]) {
        this.addBuildingRoofVent(center, rotation, x * footprint.halfX, -footprint.halfZ * 0.18, building.height, 0.42, 0.3);
      }
      this.addLabel("Emely Baker Centre", center, building.height + 1.35);
      return;
    }

    if (building.detailProfile === "amenities") {
      // Source-backed fallback for Alfred Crescent Sports Pavilion. The GLB
      // replacement carries the exact current L-plan and full 2010/2021
      // articulation; this lighter procedural version keeps its defining
      // canopy, clerestory, green panels and paired entry if loading fails.
      const pavilionGreen = this.standardDetailMaterial("alfred-pavilion-green-panels", 0x178b43, 0.74, 0.02);
      const pavilionLime = this.standardDetailMaterial("alfred-pavilion-lime-panels", 0x89c94a, 0.72, 0.02);
      const pavilionRoof = this.standardDetailMaterial("alfred-pavilion-black-corrugated-roof", 0x333d3f, 0.55, 0.34);
      const pavilionFrame = this.standardDetailMaterial("alfred-pavilion-charcoal-frame", 0x30393b, 0.5, 0.38);
      const pavilionGlass = this.facadeWindowMaterial();
      this.addBuildingApron(center, rotation, 0, frontZ + 1.2, footprint.halfX * 1.45, 2.45, 0.08);
      this.addBuildingAwning(center, rotation, footprint.halfX * 0.1, frontZ + 0.85, footprint.halfX * 1.42, 1.9, 3.0, pavilionRoof, 0.18);
      this.addLocalBox(center, rotation, footprint.halfX * 0.08, frontZ + 0.06, footprint.halfX * 1.55, 0.5, 0.09, pavilionGreen, 2.55, false);
      this.addLocalBox(center, rotation, -footprint.halfX * 0.18, frontZ + 0.065, footprint.halfX * 0.22, 0.46, 0.095, pavilionLime, 2.55, false);
      this.addLocalBox(center, rotation, footprint.halfX * 0.05, frontZ + 0.045, footprint.halfX * 1.5, 1.02, 0.08, pavilionGlass, 3.62, false);
      for (const x of [-0.64, -0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48, 0.64]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.09, 0.065, 1.06, 0.1, pavilionFrame, 3.62, false);
      }
      for (const x of [-0.23, 0.24]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.08, footprint.halfX * 0.18, 2.18, 0.1, pavilionGlass, 1.25, false);
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.14, 0.06, 2.2, 0.12, pavilionFrame, 1.25, false);
      }
      for (const x of [-0.7, -0.42, -0.14, 0.14, 0.42, 0.7]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.82, 0.1, 2.8, 0.1, pavilionFrame, 1.42, false);
      }
      this.addBuildingGutter(center, rotation, 0, frontZ + 0.05, footprint.halfX * 1.7, 4.24);
      return;
    }

    if (building.detailProfile === "bowling-shed") {
      // The aerial and OSM establish these seven footprints and their roof
      // envelopes, but no public source resolves individual door, vent, bin or
      // equipment positions. The exact prism and roof above are therefore the
      // most accurate defensible 2026 representation.
      return;
    }
  }

  private addMappedFences(): void {
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x6b7a71, metalness: 0.22, roughness: 0.58 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5e56, metalness: 0.32, roughness: 0.48 });
    for (const fence of this.level.mappedFences) {
      this.addMappedFenceSegments(fence, postMaterial, railMaterial);
    }
  }

  private addMappedFenceSegments(fence: MappedFence, postMaterial: THREE.Material, railMaterial: THREE.Material): void {
    const gaps = (fence.gates ?? []).map((gate) => ({
      position: gate.position,
      radius: gate.radius
    }));
    const height = fence.height ?? 1.65;
    for (let i = 0; i < fence.points.length - 1; i += 1) {
      const a = fence.points[i];
      const b = fence.points[i + 1];
      const intervals = this.fenceVisibleIntervals(a, b, gaps);
      for (const interval of intervals) {
        this.addFenceSegment(a, b, interval.start, interval.end, height, postMaterial, railMaterial);
      }
    }
    this.addMappedFenceGateDetails(fence);
  }

  private addMappedFenceGateDetails(fence: MappedFence): void {
    const hannahGate = fence.gates?.find((gate) => gate.id === "bowling-hannah-memorial-gate");
    if (!hannahGate) return;

    // CMP Figure 72 shows a genuinely architectural entrance here: red-brick
    // memorial piers on dark-brick bases with an open green metal gate. A bare
    // gap in the chain mesh loses both the landmark and the readable route.
    const segmentAngle = this.nearestPolylineSegmentAngle(fence.points, hannahGate.position);
    const rotation = -segmentAngle;
    const openingHalfWidth = 1.18;
    const brick = this.standardDetailMaterial("hannah-memorial-gate-red-brick", 0xa94f35, 0.86, 0.01);
    const darkBrick = this.standardDetailMaterial("hannah-memorial-gate-dark-brick-base", 0x3c2621, 0.9, 0.01);
    const capstone = this.standardDetailMaterial("hannah-memorial-gate-capstone", 0xc5b99a, 0.82, 0.01);
    const bronze = this.standardDetailMaterial("hannah-memorial-gate-plaques", 0x70452f, 0.54, 0.16);
    const greenMetal = this.standardDetailMaterial("hannah-memorial-gate-green-metal", 0x426659, 0.58, 0.3);

    for (const side of [-1, 1]) {
      const localX = side * openingHalfWidth;
      this.addLocalBox(hannahGate.position, rotation, localX, 0, 0.72, 0.56, 0.72, darkBrick, 0.3);
      this.addLocalBox(hannahGate.position, rotation, localX, 0, 0.62, 1.42, 0.62, brick, 1.02);
      this.addLocalBox(hannahGate.position, rotation, localX, 0, 0.72, 0.12, 0.72, capstone, 1.79);
      this.addLocalBox(hannahGate.position, rotation, localX - side * 0.015, 0.335, 0.34, 0.46, 0.035, bronze, 1.22, false);
      this.addOpenGateLeaf(hannahGate.position, rotation, side * (openingHalfWidth - 0.34), 0, 0.92, 1.3, side, greenMetal);
    }
  }

  private nearestPolylineSegmentAngle(points: readonly Vec2[], position: Vec2): number {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestAngle = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared < 0.000001) continue;
      const t = THREE.MathUtils.clamp(((position.x - a.x) * dx + (position.z - a.z) * dz) / lengthSquared, 0, 1);
      const nearest = { x: a.x + dx * t, z: a.z + dz * t };
      const candidateDistance = distance(nearest, position);
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestAngle = Math.atan2(dz, dx);
      }
    }
    return bestAngle;
  }

  private addPrismPolygon(polygon: Vec2[], height: number, material: THREE.Material, yOffset = 0): THREE.Mesh {
    const cleanPolygon = this.cleanPolygon(polygon);
    const shapePoints = cleanPolygon.map((point) => new THREE.Vector2(point.x, point.z));
    const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);
    const vertices: number[] = [];
    const indices: number[] = [];

    for (const point of cleanPolygon) {
      vertices.push(point.x, this.groundY(point) + yOffset, point.z);
    }
    for (const point of cleanPolygon) {
      vertices.push(point.x, this.groundY(point) + yOffset + height, point.z);
    }

    for (const triangle of triangles) {
      indices.push(cleanPolygon.length + triangle[0], cleanPolygon.length + triangle[1], cleanPolygon.length + triangle[2]);
      indices.push(triangle[2], triangle[1], triangle[0]);
    }

    for (let i = 0; i < cleanPolygon.length; i += 1) {
      const next = (i + 1) % cleanPolygon.length;
      indices.push(i, next, cleanPolygon.length + next);
      indices.push(i, cleanPolygon.length + next, cleanPolygon.length + i);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    const prismMaterial = material.clone();
    prismMaterial.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, prismMaterial);
    this.scene.add(mesh);
    return mesh;
  }

  private addFlatPolygon(polygon: Vec2[], material: THREE.Material, y = 0.08, opacity = 1): THREE.Mesh {
    const cleanPolygon = this.cleanPolygon(polygon);
    const shapePoints = cleanPolygon.map((point) => new THREE.Vector2(point.x, point.z));
    const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);
    const vertices: number[] = [];
    const uvs: number[] = [];
    const emitVertex = (point: Vec2) => {
      vertices.push(point.x, this.groundY(point) + y, point.z);
      uvs.push(point.x * 0.04, point.z * 0.04);
    };
    const emitDrapedTriangle = (a: Vec2, b: Vec2, c: Vec2, depth = 0): void => {
      const longestEdge = Math.max(distance(a, b), distance(b, c), distance(c, a));
      if (longestEdge <= TERRAIN_GRID_STEP || depth >= 5) {
        emitVertex(a);
        emitVertex(b);
        emitVertex(c);
        return;
      }
      const ab = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
      const bc = { x: (b.x + c.x) * 0.5, z: (b.z + c.z) * 0.5 };
      const ca = { x: (c.x + a.x) * 0.5, z: (c.z + a.z) * 0.5 };
      emitDrapedTriangle(a, ab, ca, depth + 1);
      emitDrapedTriangle(ab, b, bc, depth + 1);
      emitDrapedTriangle(ca, bc, c, depth + 1);
      emitDrapedTriangle(ab, bc, ca, depth + 1);
    };
    for (const [a, b, c] of triangles) {
      emitDrapedTriangle(cleanPolygon[a], cleanPolygon[b], cleanPolygon[c]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    const meshMaterial = material.clone();
    meshMaterial.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    if (opacity < 1) {
      meshMaterial.transparent = true;
      meshMaterial.opacity = opacity;
    }
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addBlockPolygon(
    polygon: Vec2[],
    height: number,
    material: THREE.Material,
    frontSign = -1,
    options: { openFront?: boolean; hippedRoof?: boolean; roofMaterial?: THREE.Material; seatRows?: number } = {}
  ): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0.8, 0.45);
    const center = footprint.center;
    const rotation = -footprint.angle;
    const baseY = this.boxSupportY(center, rotation, footprint.halfX, footprint.halfZ);
    if (options.openFront) {
      const wallThickness = 0.42;
      this.addLocalBox(center, rotation, 0, -frontSign * (footprint.halfZ - wallThickness * 0.5), footprint.halfX * 2, height, wallThickness, material, height / 2);
      for (const side of [-1, 1]) {
        this.addLocalBox(center, rotation, side * (footprint.halfX - wallThickness * 0.5), 0, wallThickness, height, footprint.halfZ * 2, material, height / 2);
        this.addLocalBox(
          center,
          rotation,
          side * footprint.halfX * 0.78,
          frontSign * (footprint.halfZ - wallThickness * 0.5),
          footprint.halfX * 0.18,
          2.9,
          wallThickness,
          material,
          1.45
        );
      }
    } else {
      const geometry = new THREE.BoxGeometry(footprint.halfX * 2, height, footprint.halfZ * 2);
      if (this.usesPainterlyVertexWash(material)) {
        this.applyPainterlyVertexColors(geometry);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(center.x, baseY + height / 2, center.z);
      mesh.rotation.y = rotation;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    if (options.hippedRoof) {
      this.addHippedRoof(
        center,
        rotation,
        0,
        0,
        footprint.halfX * 2 + 1.8,
        footprint.halfZ * 2 + 1.6,
        height + 0.04,
        0.72,
        options.roofMaterial ?? this.materials.metal
      );
    } else {
      const roofMaterial = options.roofMaterial ?? this.materials.timber;
      const roof = new THREE.Mesh(
        this.painterlyGeometry(new THREE.BoxGeometry(footprint.halfX * 2 + 1.8, 0.28, footprint.halfZ * 2 + 1.6), roofMaterial),
        roofMaterial
      );
      roof.position.set(center.x, baseY + height + 0.2, center.z);
      roof.rotation.y = rotation;
      roof.castShadow = true;
      this.scene.add(roof);
    }

    for (let row = 0; row < (options.seatRows ?? 4); row += 1) {
      const seatGeometry = new THREE.BoxGeometry(footprint.halfX * 1.65, 0.18, 0.34);
      this.applyPainterlyVertexColors(seatGeometry);
      const seat = new THREE.Mesh(seatGeometry, this.materials.timber);
      const rowCenter = this.localPoint(center, rotation, 0, frontSign * (footprint.halfZ - 0.6 - row * 0.35));
      seat.position.set(rowCenter.x, baseY + 1.2 + row * 0.45, rowCenter.z);
      seat.rotation.y = rotation;
      seat.castShadow = true;
      this.scene.add(seat);
    }
    if (options.openFront) {
      for (let bay = -4; bay <= 4; bay += 1) {
        const x = (bay / 4) * footprint.halfX * 0.9;
        this.addLocalBox(center, rotation, x, frontSign * (footprint.halfZ - 0.34), 0.07, height * 0.58, 0.08, this.materials.metal, height * 0.32);
      }
      for (let truss = -3; truss <= 3; truss += 1) {
        this.addLocalBox(
          center,
          rotation,
          (truss / 3) * footprint.halfX * 0.72,
          frontSign * (footprint.halfZ - 0.42),
          0.08,
          0.08,
          footprint.halfZ * 1.62,
          this.materials.metal,
          height - 0.18
        );
      }
    }
  }

  private createTerrainOverlayRect(center: Vec2, angle: number, length: number, width: number, yOffset: number, material: THREE.Material): THREE.Mesh {
    const geometry = createTerrainOverlayRectGeometry({
      center,
      angle,
      length,
      width,
      yOffset,
      groundYAt: (point) => this.groundY(point)
    });
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    return new THREE.Mesh(geometry, material);
  }

  private createTerrainOverlayDisc(center: Vec2, radius: number, yOffset: number, material: THREE.Material): THREE.Mesh {
    const geometry = createTerrainOverlayDiscGeometry(center, radius, yOffset, (point) => this.groundY(point));
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    return new THREE.Mesh(geometry, material);
  }

  private createTerrainOverlayEllipse(
    center: Vec2,
    angle: number,
    radiusX: number,
    radiusZ: number,
    yOffset: number,
    material: THREE.Material
  ): THREE.Mesh {
    const geometry = createTerrainOverlayEllipseGeometry({
      center,
      angle,
      radiusX,
      radiusZ,
      yOffset,
      groundYAt: (point) => this.groundY(point)
    });
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    return new THREE.Mesh(geometry, material);
  }

  private usesPainterlyVertexWash(material: THREE.Material): boolean {
    return [
      this.materials.grass,
      this.materials.path,
      this.materials.gravel,
      this.materials.asphalt,
      this.materials.concrete,
      this.materials.court,
      this.materials.rubber,
      this.materials.mulch,
      this.materials.dirt,
      this.materials.leafLitter,
      this.materials.wornGrass,
      this.materials.timber,
      this.materials.brick,
      this.materials.basalt
    ].includes(material as StyledSurfaceMaterial);
  }

  private applyPainterlyVertexColors(geometry: THREE.BufferGeometry): void {
    const positions = geometry.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index += 1) {
      const color = this.painterlyVertexColorAt({ x: positions.getX(index), z: positions.getZ(index) });
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  private painterlyGeometry<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material): T {
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    return geometry;
  }

  private painterlyVertexColorAt(point: Vec2): THREE.Color {
    const broad = this.stableNoise(point.x * 0.075, point.z * 0.075, 901);
    const crossWash = this.stableNoise((point.x + point.z) * 0.038, (point.z - point.x) * 0.038, 902);
    const warm = this.stableNoise(point.x * 0.026, point.z * 0.026, 903);
    const color = new THREE.Color(1, 1, 1);
    if (warm > 0.64) {
      color.setRGB(1.055, 1.018, 0.89);
    } else if (crossWash < 0.34) {
      color.setRGB(0.86, 0.985, 0.965);
    } else {
      color.setRGB(0.965, 1.01, 0.94);
    }
    color.multiplyScalar(0.94 + broad * 0.12);
    return color;
  }

  private createTerrainRect(
    center: Vec2,
    angle: number,
    length: number,
    width: number,
    y: number,
    height: number,
    material: THREE.Material
  ): THREE.Mesh {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hx = length * 0.5;
    const hz = width * 0.5;
    const corners = [
      { x: center.x - cos * hx + sin * hz, z: center.z - sin * hx - cos * hz },
      { x: center.x + cos * hx + sin * hz, z: center.z + sin * hx - cos * hz },
      { x: center.x + cos * hx - sin * hz, z: center.z + sin * hx + cos * hz },
      { x: center.x - cos * hx - sin * hz, z: center.z - sin * hx + cos * hz }
    ];
    const vertices: number[] = [];
    const uvs: number[] = [];
    for (const point of corners) {
      vertices.push(point.x, this.groundY(point) + y + height * 0.5, point.z);
      uvs.push(point.x * 0.04, point.z * 0.04);
    }
    for (const point of corners) {
      vertices.push(point.x, this.groundY(point) + y - height * 0.5, point.z);
      uvs.push(point.x * 0.04, point.z * 0.04);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex([
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      4, 5, 1, 4, 1, 0,
      5, 6, 2, 5, 2, 1,
      6, 7, 3, 6, 3, 2,
      7, 4, 0, 7, 0, 3
    ]);
    geometry.computeVertexNormals();
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    return new THREE.Mesh(geometry, material);
  }

  private fitBoxFromPolygon(
    polygon: Vec2[],
    paddingX: number,
    paddingZ: number,
    frontagePoint?: Vec2
  ): { center: Vec2; halfX: number; halfZ: number; angle: number } {
    const center = polygonCentroid(polygon);
    let longestA = polygon[0];
    let longestB = polygon[1] ?? polygon[0];
    let longest = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const segmentLength = distance(a, b);
      if (segmentLength > longest) {
        longest = segmentLength;
        longestA = a;
        longestB = b;
      }
    }
    let angle = Math.atan2(longestB.z - longestA.z, longestB.x - longestA.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let halfX = 0;
    let halfZ = 0;

    for (const point of polygon) {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      halfX = Math.max(halfX, Math.abs(dx * cos + dz * sin));
      halfZ = Math.max(halfZ, Math.abs(-dx * sin + dz * cos));
    }

    if (frontagePoint && this.worldToLocal(center, -angle, frontagePoint).z < 0) {
      angle += Math.PI;
    }

    return { center, halfX: halfX + paddingX, halfZ: halfZ + paddingZ, angle };
  }

  private localPoint(center: Vec2, rotation: number, localX: number, localZ: number): Vec2 {
    // Three.js rotates local X toward negative world Z for a positive Y
    // rotation, while the 2D map helpers use positive X-to-Z rotation. Mirror
    // the sign so detail offsets, facade normals and the rendered mesh share
    // one frame instead of being reflected across the building centre.
    return localWorldPoint(center, -rotation, localX, localZ);
  }

  private worldToLocal(center: Vec2, rotation: number, point: Vec2): Vec2 {
    return worldPointToLocal(center, -rotation, point);
  }

  private localPointOnPolygonEdge(center: Vec2, rotation: number, polygon: Vec2[], localX: number, localZ: number): Vec2 {
    return this.worldToLocal(center, rotation, nearestPointOnPolygon(this.localPoint(center, rotation, localX, localZ), polygon));
  }

  private isGrassEligible(point: Vec2): boolean {
    if (!pointInPolygon(point, this.level.boundary)) {
      return false;
    }

    for (const path of this.level.paths) {
      const clearance = path.width * 0.5 + (path.kind === "rail" || path.kind === "cycleway" ? 1.7 : GRASS_PATH_CLEARANCE);
      for (let i = 0; i < path.points.length - 1; i += 1) {
        if (distanceToSegment(point, path.points[i], path.points[i + 1]) < clearance) {
          return false;
        }
      }
    }

    for (const street of this.level.streetEdges) {
      for (let i = 0; i < street.points.length - 1; i += 1) {
        if (distanceToSegment(point, street.points[i], street.points[i + 1]) < street.width * 0.5 + 1.4) {
          return false;
        }
      }
    }

    for (const line of this.level.hardscapeLines) {
      for (let i = 0; i < line.points.length - 1; i += 1) {
        if (distanceToSegment(point, line.points[i], line.points[i + 1]) < line.width * 0.5 + 0.65) {
          return false;
        }
      }
    }

    for (const patch of this.level.pathSurfacePatches) {
      if (this.pointInRotatedRect(point, patch.position, patch.angle, patch.length * 0.5 + 0.85, patch.width * 0.5 + 0.85)) {
        return false;
      }
    }

    for (const landmark of this.level.landmarks) {
      if (landmark.kind === "park" || landmark.kind === "oval") {
        continue;
      }
      if (landmark.polygon && pointInPolygon(point, landmark.polygon)) {
        return false;
      }
      if (landmark.position && landmark.radius && distance(point, landmark.position) < landmark.radius + 1.2) {
        return false;
      }
    }

    for (const building of this.level.mappedBuildings) {
      if (pointInPolygon(point, building.polygon)) {
        return false;
      }
    }

    for (const obstacle of this.level.obstacles) {
      if (obstacle.shape === "box") {
        if (this.pointInRotatedRect(point, obstacle.center, obstacle.angle, obstacle.halfX + 0.55, obstacle.halfZ + 0.55)) {
          return false;
        }
      } else if (obstacle.shape === "polygon") {
        if (pointInPolygon(point, obstacle.polygon)) {
          return false;
        }
      } else if (distance(point, obstacle.center) < obstacle.radius + 0.45) {
        return false;
      }
    }

    for (const fixture of this.level.sportsFixtures) {
      if (distance(point, fixture.position) < fixture.radius + 0.9) {
        return false;
      }
    }

    for (const amenity of this.level.amenities) {
      if (distance(point, amenity.position) < 1.15) {
        return false;
      }
    }

    for (const detail of this.level.parkLifeDetails) {
      if (distance(point, detail.position) < 1.8) {
        return false;
      }
    }

    return true;
  }

  private isMownOvalPoint(point: Vec2): boolean {
    return this.level.landmarks.some((landmark) => landmark.kind === "oval" && Boolean(landmark.polygon) && pointInPolygon(point, landmark.polygon!));
  }

  private isUnderCanopy(point: Vec2): boolean {
    return this.level.trees.some((tree) => distance(point, tree.position) < tree.canopyRadius * treeVisualMassing(tree).canopyWidth * 0.72);
  }

  private pointInRotatedRect(point: Vec2, center: Vec2, angle: number, halfX: number, halfZ: number): boolean {
    return pointInWorldRotatedRect(point, center, angle, halfX, halfZ);
  }

  private stableNoise(x: number, z: number, salt: number): number {
    return stableWorldNoise(x, z, salt);
  }

  private addLocalBox(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    y: number,
    castShadow = true
  ): THREE.Mesh {
    const position = this.localPoint(center, rotation, localX, localZ);
    const geometry = new THREE.BoxGeometry(width, height, depth);
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, this.boxSupportY(position, rotation, width * 0.5, depth * 0.5) + y, position.z);
    mesh.rotation.y = rotation;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addLocalCylinder(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    material: THREE.Material,
    yOffset = 0
  ): THREE.Mesh {
    const position = this.localPoint(center, rotation, localX, localZ);
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 10);
    if (this.usesPainterlyVertexWash(material)) {
      this.applyPainterlyVertexColors(geometry);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, this.groundY(position) + yOffset + height / 2, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addOpenGateLeaf(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    hingeSide: number,
    material: THREE.Material
  ): void {
    const group = new THREE.Group();
    for (let index = 0; index < 4; index += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, height, 0.05), material);
      bar.position.set(-hingeSide * width * (index / 3), height * 0.5, 0);
      bar.castShadow = true;
      group.add(bar);
    }
    for (const y of [height * 0.28, height * 0.78]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.055), material);
      rail.position.set(-hingeSide * width * 0.5, y, 0);
      rail.castShadow = true;
      group.add(rail);
    }
    const hinge = this.localPoint(center, rotation, localX, localZ);
    group.position.set(hinge.x, this.groundY(hinge), hinge.z);
    group.rotation.y = rotation + hingeSide * 1.05;
    this.scene.add(group);
  }

  private basicDetailMaterial(key: string, color: number): THREE.MeshBasicMaterial {
    const cacheKey = `basic:${key}:${color.toString(16)}`;
    let material = this.detailMaterialCache.get(cacheKey);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color });
      material.name = key;
      this.detailMaterialCache.set(cacheKey, material);
    }
    return material as THREE.MeshBasicMaterial;
  }

  private washDetailMaterial(key: string, color: number, opacity: number): THREE.MeshBasicMaterial {
    const cacheKey = `wash:${key}:${color.toString(16)}:${opacity}`;
    let material = this.detailMaterialCache.get(cacheKey);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      material.name = key;
      this.detailMaterialCache.set(cacheKey, material);
    }
    return material as THREE.MeshBasicMaterial;
  }

  private paintedLightPoolMaterial(color: number, baseOpacity: number): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    material.userData.baseOpacity = baseOpacity;
    this.lampSpillMaterials.push(material);
    return material;
  }

  private addPaintedLightPool(group: THREE.Group, radiusX: number, radiusZ: number, offsetZ = 0, rotation = 0, kind = "painted-light-pool"): void {
    const layers = [
      { color: 0xc49a55, opacity: 1.02, scaleX: 1, scaleZ: 1, y: 0.046, rotation: 0 },
      { color: 0xf0c66f, opacity: 0.54, scaleX: 0.72, scaleZ: 0.42, y: 0.052, rotation: 0.18 },
      { color: 0x789096, opacity: 0.28, scaleX: 1.16, scaleZ: 0.62, y: 0.044, rotation: -0.14 }
    ];
    for (const layer of layers) {
      const spill = new THREE.Mesh(this.lightPoolGeometry, this.paintedLightPoolMaterial(layer.color, layer.opacity));
      spill.position.set(0, layer.y, offsetZ);
      spill.rotation.set(-Math.PI / 2, 0, rotation + layer.rotation);
      spill.scale.set(radiusX * layer.scaleX, radiusZ * layer.scaleZ, 1);
      spill.renderOrder = 2;
      spill.userData.kind = kind;
      group.add(spill);
    }
    this.renderedLampSpillCount += 1;
  }

  private addLocalBrushShadow(
    group: THREE.Group,
    color: number,
    radiusX: number,
    radiusZ: number,
    opacity = 0.16,
    y = 0.018,
    rotation = 0
  ): THREE.Mesh {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 22),
      this.washDetailMaterial(`brush-shadow-${color.toString(16)}-${opacity}`, color, opacity)
    );
    shadow.position.y = y;
    shadow.rotation.x = -Math.PI / 2;
    shadow.rotation.z = rotation;
    shadow.scale.set(radiusX, radiusZ, 1);
    shadow.renderOrder = -2;
    group.add(shadow);
    return shadow;
  }

  private addLocalPaintStroke(
    group: THREE.Group,
    color: number,
    localX: number,
    localY: number,
    localZ: number,
    length: number,
    thickness: number,
    opacity = 0.62,
    rotationY = 0,
    rotationZ = 0
  ): THREE.Mesh {
    const stroke = new THREE.Mesh(
      new THREE.BoxGeometry(length, thickness, thickness),
      this.washDetailMaterial(`paint-stroke-${color.toString(16)}-${opacity}`, color, opacity)
    );
    stroke.position.set(localX, localY, localZ);
    stroke.rotation.set(0, rotationY, rotationZ);
    stroke.renderOrder = 2;
    group.add(stroke);
    return stroke;
  }

  private canvasSignMaterial(key: string, text: string, background: string, foreground: string): THREE.MeshBasicMaterial {
    const cacheKey = `canvas-sign:${key}:${text}:${background}:${foreground}`;
    let material = this.detailMaterialCache.get(cacheKey);
    if (!material) {
      // Geometry audits run the real scene builder in Node without a DOM or
      // WebGL context. Keep the same sign mesh and dimensions there so the
      // building envelope can be validated; only the painterly text texture
      // is omitted. Browser renders continue through the canvas path below.
      if (typeof document === "undefined") {
        material = new THREE.MeshBasicMaterial({ color: new THREE.Color(background) });
        this.detailMaterialCache.set(cacheKey, material);
        return material as THREE.MeshBasicMaterial;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 160;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const seed = hashString(`${key}:${text}:${background}:${foreground}`);
      const accent = mixHex(background, foreground, 0.32);
      const shade = mixHex(background, "#07131a", 0.38);
      const light = mixHex(foreground, "#d9d5bd", 0.32);

      for (let i = 0; i < 80; i += 1) {
        const x = seededRange(seed, i, -24, canvas.width + 12);
        const y = seededRange(seed, i + 91, -12, canvas.height + 8);
        ctx.fillStyle = `${i % 2 === 0 ? light : shade}${alphaHex(seededRange(seed, i + 181, 0.035, 0.11))}`;
        ctx.fillRect(x, y, seededRange(seed, i + 271, 1, 4), seededRange(seed, i + 361, 1, 3));
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 0; i < 12; i += 1) {
        const y = seededRange(seed, i + 17, 14, canvas.height - 14);
        ctx.strokeStyle = `${i % 3 === 0 ? shade : light}${alphaHex(seededRange(seed, i + 43, 0.08, 0.18))}`;
        ctx.lineWidth = seededRange(seed, i + 71, 1.4, 6.4);
        ctx.beginPath();
        ctx.moveTo(seededRange(seed, i + 83, -32, 20), y);
        ctx.bezierCurveTo(
          seededRange(seed, i + 97, 58, 116),
          y + seededRange(seed, i + 103, -12, 12),
          seededRange(seed, i + 137, 176, 248),
          y + seededRange(seed, i + 149, -14, 14),
          seededRange(seed, i + 163, 300, 356),
          y + seededRange(seed, i + 191, -8, 8)
        );
        ctx.stroke();
      }

      ctx.fillStyle = `${accent}33`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(canvas.width, 0);
      ctx.lineTo(canvas.width, 21 + seededRange(seed, 403, -4, 6));
      ctx.bezierCurveTo(214, 18, 96, 30, 0, 20);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, canvas.height - 22 + seededRange(seed, 419, -5, 5));
      ctx.bezierCurveTo(88, canvas.height - 30, 212, canvas.height - 14, canvas.width, canvas.height - 24);
      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(0, canvas.height);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = foreground;
      ctx.lineWidth = 7;
      ctx.strokeRect(13, 13, canvas.width - 26, canvas.height - 26);
      ctx.strokeStyle = `${background}cc`;
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

      const maxTextWidth = canvas.width - 74;
      let fontSize = text.length > 7 ? 46 : text.length > 4 ? 54 : 66;
      do {
        ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
        fontSize -= 2;
      } while (ctx.measureText(text).width > maxTextWidth && fontSize >= 30);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = `${shade}cc`;
      ctx.strokeText(text, canvas.width / 2 + 1, canvas.height / 2 + 5);
      ctx.fillStyle = foreground;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 3);

      ctx.strokeStyle = `${light}77`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(28, canvas.height - 30);
      ctx.bezierCurveTo(94, canvas.height - 22, 194, canvas.height - 36, 292, canvas.height - 27);
      ctx.stroke();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 2;
      material = new THREE.MeshBasicMaterial({ map: texture });
      this.detailMaterialCache.set(cacheKey, material);
    }
    return material as THREE.MeshBasicMaterial;
  }

  private digitalClockMaterial(key: string, text: string, caption: string): THREE.MeshBasicMaterial {
    const cacheKey = `digital-clock:${key}:${text}:${caption}`;
    let material = this.detailMaterialCache.get(cacheKey);
    if (!material) {
      if (typeof document === "undefined") {
        material = new THREE.MeshBasicMaterial({ color: 0xff3e2e, side: THREE.DoubleSide });
        this.detailMaterialCache.set(cacheKey, material);
        return material as THREE.MeshBasicMaterial;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 192;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#040709";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const glow = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 18, canvas.width / 2, canvas.height / 2, 270);
      glow.addColorStop(0, "rgba(255, 62, 46, 0.22)");
      glow.addColorStop(0.58, "rgba(255, 62, 46, 0.06)");
      glow.addColorStop(1, "rgba(255, 62, 46, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#ff4a38";
      ctx.lineWidth = 8;
      ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
      ctx.strokeStyle = "rgba(255, 154, 103, 0.38)";
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

      for (let y = 38; y < canvas.height - 34; y += 8) {
        ctx.fillStyle = y % 16 === 0 ? "rgba(255, 72, 54, 0.08)" : "rgba(255, 72, 54, 0.035)";
        ctx.fillRect(34, y, canvas.width - 68, 2);
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 74px 'Courier New', monospace";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(93, 0, 0, 0.82)";
      ctx.strokeText(text, canvas.width / 2 + 2, 91);
      ctx.fillStyle = "#ff3e2e";
      ctx.fillText(text, canvas.width / 2, 88);
      ctx.fillStyle = "rgba(255, 225, 180, 0.88)";
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.fillText(caption, canvas.width / 2, 146);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 2;
      material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.detailMaterialCache.set(cacheKey, material);
    }
    return material as THREE.MeshBasicMaterial;
  }

  private standardDetailMaterial(
    key: string,
    color: number,
    roughness = 0.72,
    metalness = 0.08,
    transparent = false,
    opacity = 1
  ): THREE.MeshStandardMaterial {
    const cacheKey = `standard:${key}:${color.toString(16)}:${roughness}:${metalness}:${transparent}:${opacity}`;
    let material = this.detailMaterialCache.get(cacheKey);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent, opacity });
      material.name = key;
      tuneAnimeMaterial(material);
      this.detailMaterialCache.set(cacheKey, material);
    }
    return material as THREE.MeshStandardMaterial;
  }

  private addBuildingApron(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    depth: number,
    height = 0.08
  ): THREE.Mesh {
    return this.addLocalBox(center, rotation, localX, localZ, width, height, depth, this.materials.concrete, 0.13, false);
  }

  private addBuildingAwning(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    depth: number,
    y: number,
    material: THREE.Material = this.materials.metal,
    height = 0.18
  ): THREE.Mesh {
    return this.addLocalBox(center, rotation, localX, localZ, width, height, depth, material, y);
  }

  private addHippedRoof(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    depth: number,
    baseY: number,
    roofHeight: number,
    material: THREE.Material
  ): THREE.Mesh {
    const halfWidth = width * 0.5;
    const halfDepth = depth * 0.5;
    const vertices: number[] = [
      -halfWidth, 0, -halfDepth,
      halfWidth, 0, -halfDepth,
      halfWidth, 0, halfDepth,
      -halfWidth, 0, halfDepth
    ];
    const indices: number[] = [];

    if (width >= depth) {
      const ridgeHalf = Math.max(0.04, (width - depth) * 0.5);
      vertices.push(-ridgeHalf, roofHeight, 0, ridgeHalf, roofHeight, 0);
      indices.push(0, 1, 5, 0, 5, 4, 1, 2, 5, 2, 3, 4, 2, 4, 5, 3, 0, 4);
    } else {
      const ridgeHalf = Math.max(0.04, (depth - width) * 0.5);
      vertices.push(0, roofHeight, -ridgeHalf, 0, roofHeight, ridgeHalf);
      indices.push(0, 1, 4, 1, 2, 5, 1, 5, 4, 2, 3, 5, 3, 0, 4, 3, 4, 5);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const roofMaterial = material.clone();
    roofMaterial.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, roofMaterial);
    const position = this.localPoint(center, rotation, localX, localZ);
    mesh.position.set(position.x, this.boxSupportY(position, rotation, halfWidth, halfDepth) + baseY, position.z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addSkillionRoof(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    depth: number,
    baseY: number,
    rise: number,
    material: THREE.Material
  ): THREE.Mesh {
    const halfWidth = width * 0.5;
    const halfDepth = depth * 0.5;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -halfWidth, 0, -halfDepth,
          halfWidth, rise, -halfDepth,
          halfWidth, rise, halfDepth,
          -halfWidth, 0, halfDepth
        ],
        3
      )
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const roofMaterial = material.clone();
    roofMaterial.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, roofMaterial);
    const position = this.localPoint(center, rotation, localX, localZ);
    mesh.position.set(position.x, this.boxSupportY(position, rotation, halfWidth, halfDepth) + baseY, position.z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addSkillionPolygonRoof(
    polygon: Vec2[],
    baseY: number,
    rise: number,
    angle: number,
    material: THREE.Material
  ): THREE.Mesh {
    const cleanPolygon = this.cleanPolygon(polygon);
    const center = polygonCentroid(cleanPolygon);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localXValues = cleanPolygon.map((point) => (point.x - center.x) * cos + (point.z - center.z) * sin);
    const minLocalX = Math.min(...localXValues);
    const maxLocalX = Math.max(...localXValues);
    const span = Math.max(0.001, maxLocalX - minLocalX);
    const supportY = this.averageGroundYAt(cleanPolygon);
    const thickness = 0.14;
    const vertices: number[] = [];
    for (let layer = 0; layer < 2; layer += 1) {
      for (let index = 0; index < cleanPolygon.length; index += 1) {
        const point = cleanPolygon[index];
        const slopeY = rise * ((localXValues[index] - minLocalX) / span);
        vertices.push(point.x, supportY + baseY + slopeY + layer * thickness, point.z);
      }
    }
    const triangles = THREE.ShapeUtils.triangulateShape(
      cleanPolygon.map((point) => new THREE.Vector2(point.x, point.z)),
      []
    );
    const vertexCount = cleanPolygon.length;
    const indices: number[] = [];
    for (const triangle of triangles) {
      indices.push(triangle[2], triangle[1], triangle[0]);
      indices.push(triangle[0] + vertexCount, triangle[1] + vertexCount, triangle[2] + vertexCount);
    }
    for (let index = 0; index < vertexCount; index += 1) {
      const next = (index + 1) % vertexCount;
      indices.push(index, next, next + vertexCount, index, next + vertexCount, index + vertexCount);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addGabledRoof(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    depth: number,
    baseY: number,
    roofHeight: number,
    material: THREE.Material
  ): THREE.Mesh {
    const halfWidth = width * 0.5;
    const halfDepth = depth * 0.5;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -halfWidth, 0, -halfDepth,
          halfWidth, 0, -halfDepth,
          -halfWidth, 0, halfDepth,
          halfWidth, 0, halfDepth,
          -halfWidth, roofHeight, 0,
          halfWidth, roofHeight, 0
        ],
        3
      )
    );
    geometry.setIndex([0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5]);
    geometry.computeVertexNormals();

    const roofMaterial = material.clone();
    roofMaterial.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, roofMaterial);
    const position = this.localPoint(center, rotation, localX, localZ);
    mesh.position.set(position.x, this.boxSupportY(position, rotation, halfWidth, halfDepth) + baseY, position.z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addFacadePediment(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    baseY: number,
    material: THREE.Material
  ): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-width * 0.5, 0, 0, width * 0.5, 0, 0, 0, height, 0], 3)
    );
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    const pedimentMaterial = material.clone();
    pedimentMaterial.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, pedimentMaterial);
    const position = this.localPoint(center, rotation, localX, localZ);
    mesh.position.set(position.x, this.groundY(position) + baseY, position.z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addFacadeClock(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    radius: number,
    y: number
  ): THREE.Mesh {
    const clockMaterial = this.standardDetailMaterial("heritage-facade-clock", 0xe4debd, 0.74, 0.02);
    const material = clockMaterial.clone();
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), material);
    const position = this.localPoint(center, rotation, localX, localZ);
    mesh.position.set(position.x, this.groundY(position) + y, position.z);
    mesh.rotation.y = rotation;
    this.scene.add(mesh);
    return mesh;
  }

  private addFacadeLouver(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    radius: number,
    y: number
  ): THREE.Mesh {
    const louverMaterial = this.standardDetailMaterial("grandstand-round-louver", 0xd8c99b, 0.8, 0.01);
    const material = louverMaterial.clone();
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), material);
    const position = this.localPoint(center, rotation, localX, localZ);
    mesh.position.set(position.x, this.groundY(position) + y, position.z);
    mesh.rotation.y = rotation;
    mesh.userData.kind = "grandstand-round-louver";
    this.scene.add(mesh);
    return mesh;
  }

  private addBuildingDoor(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    y: number,
    depth = 0.08
  ): THREE.Mesh {
    return this.addLocalBox(center, rotation, localX, localZ, width, height, depth, this.materials.darkOpening, y, false);
  }

  private addBuildingWindow(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    y: number,
    depth = 0.08
  ): THREE.Mesh {
    return this.addLocalBox(center, rotation, localX, localZ, width, height, depth, this.facadeWindowMaterial(), y, false);
  }

  private facadeWindowMaterial(): THREE.MeshBasicMaterial {
    const cacheKey = "basic:facade-window-night-glow";
    let material = this.detailMaterialCache.get(cacheKey);
    if (!material) {
      const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x071217 });
      material = windowMaterial;
      this.detailMaterialCache.set(cacheKey, windowMaterial);
      this.facadeWindowMaterials.push(windowMaterial);
    }
    return material as THREE.MeshBasicMaterial;
  }

  private addBuildingSign(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    y: number,
    color = 0x2e6c79,
    depth = 0.09
  ): THREE.Mesh {
    return this.addLocalBox(center, rotation, localX, localZ, width, height, depth, this.basicDetailMaterial("building-sign", color), y, false);
  }

  private addBuildingTextSign(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    y: number,
    text: string,
    background = "#2e6c79",
    foreground = "#f2e6a8",
    depth = 0.095
  ): THREE.Mesh {
    return this.addLocalBox(
      center,
      rotation,
      localX,
      localZ,
      width,
      height,
      depth,
      this.canvasSignMaterial(`building-text-${text}`, text, background, foreground),
      y,
      false
    );
  }

  private addBuildingRoofVent(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    buildingHeight: number,
    width = 0.62,
    depth = 0.38
  ): THREE.Mesh {
    return this.addLocalBox(center, rotation, localX, localZ, width, 0.22, depth, this.materials.metal, buildingHeight + 0.28);
  }

  private addBuildingWallLight(center: Vec2, rotation: number, localX: number, localZ: number, y = 2.35): THREE.Mesh {
    const lightMaterial = this.standardDetailMaterial("warm-wall-light", 0xf0b85d, 0.42, 0.05);
    const mesh = this.addLocalBox(center, rotation, localX, localZ, 0.28, 0.2, 0.12, lightMaterial, y, false);
    this.wallLightMaterials.push(lightMaterial);
    const position = this.localPoint(center, rotation, localX, localZ);
    const glow = new THREE.PointLight(0xf0b85d, 0.8, 18);
    glow.position.set(position.x, this.groundY(position) + y, position.z);
    this.facadeLights.push(glow);
    this.scene.add(glow);
    const spill = this.createTerrainOverlayEllipse(
      position,
      rotation + 0.16,
      2.8,
      0.74,
      0.158,
      this.paintedLightPoolMaterial(0xe0a85c, 0.48)
    );
    spill.receiveShadow = false;
    spill.renderOrder = 3;
    spill.userData.kind = "wall-light-painted-spill";
    this.scene.add(spill);
    this.renderedLampSpillCount += 1;
    return mesh;
  }

  private addBuildingGutter(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    buildingHeight: number
  ): THREE.Mesh {
    return this.addLocalBox(center, rotation, localX, localZ, width, 0.12, 0.12, this.materials.metal, buildingHeight + 0.02);
  }

  private addBuildingDownpipe(center: Vec2, rotation: number, localX: number, localZ: number, height: number): THREE.Mesh {
    return this.addLocalBox(center, rotation, localX, localZ, 0.09, height, 0.09, this.materials.metal, height * 0.5, false);
  }

  private addBuildingServiceLadder(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    height: number,
    y = 1.35
  ): void {
    for (const side of [-1, 1]) {
      this.addLocalBox(center, rotation, localX + side * 0.18, localZ, 0.045, height, 0.055, this.materials.metal, y, false);
    }
    for (let rung = 0; rung < 5; rung += 1) {
      this.addLocalBox(center, rotation, localX, localZ + 0.01, 0.46, 0.045, 0.06, this.materials.metal, 0.48 + rung * 0.42, false);
    }
  }

  private addBowlsMuralMotifs(center: Vec2, rotation: number, footprint: { halfX: number; halfZ: number }): void {
    const flora = this.basicDetailMaterial("bowls-mural-flora", 0x4c8f55);
    const dark = this.basicDetailMaterial("bowls-mural-lion-mane", 0x302b2a);
    const gold = this.basicDetailMaterial("bowls-mural-lion", 0xc97d3f);
    const amber = this.basicDetailMaterial("bowls-mural-amber-disc", 0xf3b54a);
    const pink = this.basicDetailMaterial("bowls-mural-dahlia", 0xe492a2);
    const blue = this.basicDetailMaterial("bowls-mural-budgie-blue", 0x1d6691);
    const wallX = -footprint.halfX - 0.078;

    for (const side of [-1, 1]) {
      const z = side * footprint.halfZ * 0.38;
      this.addLocalBox(center, rotation, wallX, z, 0.09, 1.68, footprint.halfZ * 0.34, amber, 1.48, false);
      this.addLocalBox(center, rotation, wallX - 0.012, z - side * footprint.halfZ * 0.08, 0.092, 0.72, footprint.halfZ * 0.22, gold, 1.08, false);
      this.addLocalBox(center, rotation, wallX - 0.02, z + side * footprint.halfZ * 0.12, 0.095, 0.62, 0.44, dark, 1.63, false);
      this.addLocalBox(center, rotation, wallX - 0.028, z + side * footprint.halfZ * 0.12, 0.098, 0.34, 0.25, gold, 1.63, false);
    }
    for (const z of [-0.18, 0, 0.18]) {
      this.addLocalBox(center, rotation, wallX - 0.018, z * footprint.halfZ, 0.1, 0.5, footprint.halfZ * 0.18, pink, 1.65 + (z === 0 ? 0.16 : 0), false);
    }
    for (const [index, z] of [-0.1, 0.12].entries()) {
      this.addLocalBox(center, rotation, wallX - 0.025, z * footprint.halfZ, 0.1, 0.28, footprint.halfZ * 0.16, flora, 0.92 - index * 0.12, false);
      this.addLocalBox(center, rotation, wallX - 0.032, z * footprint.halfZ, 0.102, 0.12, footprint.halfZ * 0.1, blue, 0.94 - index * 0.12, false);
    }
  }

  private addEmelyBakerGateDetails(
    center: Vec2,
    rotation: number,
    courtyardZ: number,
    footprint: { halfX: number; halfZ: number }
  ): void {
    const gateMaterial = this.standardDetailMaterial("emely-baker-courtyard-gate", 0x4f5e56, 0.58, 0.28);
    const latchMaterial = this.standardDetailMaterial("emely-baker-gate-latch", 0xd0a343, 0.44, 0.34);
    const gateZ = courtyardZ + 1.36;
    const gateX = footprint.halfX * 0.52;

    for (const x of [gateX - 1.1, gateX + 1.1]) {
      this.addLocalBox(center, rotation, x, gateZ, 0.08, 1.15, 0.08, gateMaterial, 0.62);
    }
    for (const y of [0.48, 0.94]) {
      this.addLocalBox(center, rotation, gateX, gateZ, 2.3, 0.065, 0.08, gateMaterial, y);
    }
    this.addLocalBox(center, rotation, gateX + 0.18, gateZ - 0.035, 0.16, 0.18, 0.08, latchMaterial, 0.78, false);
    this.addBuildingTextSign(center, rotation, -footprint.halfX * 0.76, courtyardZ - 1.22, footprint.halfX * 0.42, 0.28, 1.36, "BOOKED", "#315d67", "#f2e6a8", 0.065);
  }

  private addEmelyOutdoorFurniture(
    center: Vec2,
    rotation: number,
    courtyardZ: number,
    footprint: { halfX: number; halfZ: number }
  ): void {
    const tableMaterial = this.standardDetailMaterial("emely-trestle-table-stack", 0xbca46f, 0.72, 0.02);
    const chairMaterial = this.standardDetailMaterial("emely-chair-stack", 0x4f5e56, 0.58, 0.18);
    for (const y of [0.26, 0.38, 0.5]) {
      this.addLocalBox(center, rotation, -footprint.halfX * 0.3, courtyardZ + 0.26, 1.25, 0.06, 0.42, tableMaterial, y);
    }
    for (const index of [0, 1, 2, 3]) {
      this.addLocalBox(center, rotation, footprint.halfX * 0.36 + index * 0.12, courtyardZ - 0.34, 0.08, 0.48, 0.42, chairMaterial, 0.36 + index * 0.035);
    }
    this.addLocalBox(center, rotation, footprint.halfX * 0.58, courtyardZ + 0.42, 0.46, 0.54, 0.32, this.materials.metal, 0.38);
  }

  private addLocalShadeSail(
    center: Vec2,
    rotation: number,
    corners: Array<{ x: number; z: number; y: number }>,
    material: THREE.Material
  ): void {
    const vertices: number[] = [];
    for (const corner of corners) {
      const point = this.localPoint(center, rotation, corner.x, corner.z);
      vertices.push(point.x, this.groundY(point) + corner.y, point.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const sailMaterial = material.clone();
    sailMaterial.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, sailMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    this.scene.add(mesh);
  }

  private addGrandstand(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const fallbackStart = this.scene.children.length;
    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0.8, 0.45);
    const rotation = -footprint.angle;
    const center = footprint.center;
    const oval = this.level.landmarks.find((candidate) => candidate.kind === "oval" && candidate.polygon)?.polygon;
    const ovalCenter = oval ? polygonCentroid(oval) : center;
    const dx = ovalCenter.x - center.x;
    const dz = ovalCenter.z - center.z;
    const ovalLocalZ = -dx * Math.sin(footprint.angle) + dz * Math.cos(footprint.angle);
    const frontSign = ovalLocalZ < 0 ? -1 : 1;
    const frontZ = frontSign * (footprint.halfZ + 0.05);
    const frontOut = (distanceFromFront: number) => frontZ + frontSign * distanceFromFront;
    const frontIn = (distanceFromFront: number) => frontZ - frontSign * distanceFromFront;

    const frontScreenMaterial = this.standardDetailMaterial("grandstand-front-transparent-screen", 0x0b1718, 0.5, 0.06, true, 0.24);
    const grandstandCream = this.standardDetailMaterial("grandstand-painted-cream", 0xd8c99b, 0.8, 0.01);
    const grandstandRedTimber = this.standardDetailMaterial("grandstand-red-timber", 0x6e3028, 0.74, 0.02);
    const grandstandWhiteSeats = this.standardDetailMaterial("grandstand-white-seats", 0xd9d6c5, 0.82, 0.01);
    const grandstandRoof = this.standardDetailMaterial("grandstand-corrugated-roof", 0xbec1b4, 0.64, 0.18);
    this.addBlockPolygon(landmark.polygon, 5.8, this.materials.brick, frontSign, {
      openFront: true,
      hippedRoof: true,
      roofMaterial: grandstandRoof,
      seatRows: 0
    });

    // CMP Figure 36 reads as an enclosed red-brick/cream ground storey with
    // the open, tiered viewing gallery above it. Keeping those two layers
    // separate prevents the white benches from reading as external bleachers.
    this.addLocalBox(center, rotation, 0, frontIn(0.03), footprint.halfX * 1.82, 2.62, 0.34, this.materials.brick, 1.31);
    for (const x of [-0.78, -0.39, 0, 0.39, 0.78]) {
      this.addLocalBox(center, rotation, x * footprint.halfX, frontOut(0.17), footprint.halfX * 0.27, 1.5, 0.055, grandstandCream, 1.28, false);
      this.addLocalBox(center, rotation, x * footprint.halfX, frontOut(0.2), 0.1, 2.64, 0.065, grandstandRedTimber, 1.42, false);
    }
    for (const x of [-0.58, 0, 0.58]) {
      this.addLocalBox(center, rotation, x * footprint.halfX * 1.05, frontOut(0.225), footprint.halfX * 0.22, 1.72, 0.07, this.materials.darkOpening, 1.0, false);
    }
    this.addLocalBox(center, rotation, 0, frontOut(0.16), footprint.halfX * 1.86, 0.24, 0.075, grandstandCream, 2.64, false);

    frontScreenMaterial.depthWrite = false;
    this.addLocalBox(center, rotation, 0, frontIn(0.05), footprint.halfX * 1.76, 2.22, 0.045, frontScreenMaterial, 4.02, false);
    for (const x of [-0.88, -0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66, 0.88]) {
      this.addLocalCylinder(center, rotation, x * footprint.halfX, frontOut(0.1), 0.075, 0.1, 2.72, grandstandRedTimber, 2.67);
    }
    for (const y of [2.86, 5.18]) {
      this.addLocalBox(center, rotation, 0, frontOut(0.12), footprint.halfX * 1.84, 0.1, 0.08, grandstandCream, y, false);
    }
    for (const x of [-0.86, 0.86]) {
      this.addBuildingDownpipe(center, rotation, x * footprint.halfX, frontOut(0.02), 5.8);
    }
    this.addFacadePediment(center, rotation, 0, frontOut(0.17), 3.8, 0.9, 5.76, grandstandCream);
    this.addFacadeLouver(center, rotation, 0, frontOut(0.22), 0.25, 6.12);
    for (let row = 0; row < 8; row += 1) {
      this.addLocalBox(center, rotation, 0, frontIn(0.82 + row * 0.4), footprint.halfX * 1.52, 0.09, 0.24, grandstandWhiteSeats, 3.08 + row * 0.23);
    }
    for (const side of [-1, 1]) {
      const stairX = side * footprint.halfX * 0.38;
      for (let step = 0; step < 10; step += 1) {
        const stair = this.addLocalBox(
          center,
          rotation,
          stairX,
          frontOut(2.5 - step * 0.38),
          1.12,
          0.16,
          0.34,
          grandstandRedTimber,
          0.16 + step * 0.26
        );
        stair.userData.kind = "grandstand-external-stair";
        stair.userData.side = side;
      }
      for (const railSide of [-1, 1]) {
        const rail = this.addLocalBox(center, rotation, stairX + railSide * 0.62, frontOut(0.72), 0.07, 0.1, 3.45, grandstandRedTimber, 1.42);
        rail.userData.kind = "grandstand-external-stair-rail";
        rail.userData.side = side;
      }
    }
    this.addLabel("Kevin Murray Stand", center, 6.7);
    this.replaceGrandstandFallbackWithAsset(landmark, this.scene.children.slice(fallbackStart));
  }

  private addFenceAround(
    polygon: Vec2[],
    height: number,
    color: number,
    gaps: Array<{ position: Vec2; radius: number }> = []
  ): void {
    const postMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x5c6d64, metalness: 0.35, roughness: 0.45 });
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const intervals = this.fenceVisibleIntervals(a, b, gaps);
      for (const interval of intervals) {
        this.addFenceSegment(a, b, interval.start, interval.end, height, postMaterial, railMaterial);
      }
    }
  }

  private fenceVisibleIntervals(
    a: Vec2,
    b: Vec2,
    gaps: Array<{ position: Vec2; radius: number }>
  ): Array<{ start: number; end: number }> {
    let intervals: Array<{ start: number; end: number }> = [{ start: 0, end: 1 }];
    if (gaps.length === 0) return intervals;

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segmentLengthSquared = dx * dx + dz * dz;
    const segmentLength = Math.sqrt(segmentLengthSquared);
    if (segmentLength < 0.001) return [];

    for (const gap of gaps) {
      const t = THREE.MathUtils.clamp(((gap.position.x - a.x) * dx + (gap.position.z - a.z) * dz) / segmentLengthSquared, 0, 1);
      const closest = { x: a.x + dx * t, z: a.z + dz * t };
      if (distance(closest, gap.position) > gap.radius) {
        continue;
      }
      const gapStart = Math.max(0, t - gap.radius / segmentLength);
      const gapEnd = Math.min(1, t + gap.radius / segmentLength);
      const nextIntervals: Array<{ start: number; end: number }> = [];
      for (const interval of intervals) {
        if (gapEnd <= interval.start || gapStart >= interval.end) {
          nextIntervals.push(interval);
          continue;
        }
        if (gapStart - interval.start > 0.015) {
          nextIntervals.push({ start: interval.start, end: gapStart });
        }
        if (interval.end - gapEnd > 0.015) {
          nextIntervals.push({ start: gapEnd, end: interval.end });
        }
      }
      intervals = nextIntervals;
    }

    return intervals;
  }

  private addFenceSegment(
    a: Vec2,
    b: Vec2,
    start: number,
    end: number,
    height: number,
    postMaterial: THREE.Material,
    railMaterial: THREE.Material
  ): void {
    const startPoint = { x: a.x + (b.x - a.x) * start, z: a.z + (b.z - a.z) * start };
    const endPoint = { x: a.x + (b.x - a.x) * end, z: a.z + (b.z - a.z) * end };
    const segmentLength = distance(startPoint, endPoint);
    if (segmentLength < 0.45) return;
    const angle = -Math.atan2(endPoint.z - startPoint.z, endPoint.x - startPoint.x);
    const center = { x: (startPoint.x + endPoint.x) / 2, z: (startPoint.z + endPoint.z) / 2 };
    const baseY = this.supportY([startPoint, endPoint]);
    const meshMaterial = new THREE.MeshBasicMaterial({ color: 0xaebdb3, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, height * 0.66, 0.025), meshMaterial);
    panel.position.set(center.x, baseY + height * 0.52, center.z);
    panel.rotation.y = angle;
    panel.receiveShadow = false;
    this.scene.add(panel);
    for (const railY of [0.24, 0.58, 0.9]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, 0.08, 0.1), railMaterial);
      rail.position.set(center.x, baseY + height * railY, center.z);
      rail.rotation.y = angle;
      rail.castShadow = true;
      this.scene.add(rail);
    }
    const postCount = Math.max(1, Math.floor(segmentLength / 4.2));
    for (let postIndex = 0; postIndex <= postCount; postIndex += 1) {
      const t = postIndex / postCount;
      const point = { x: startPoint.x + (endPoint.x - startPoint.x) * t, z: startPoint.z + (endPoint.z - startPoint.z) * t };
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, height, 8), postMaterial);
      post.position.set(point.x, this.groundY(point) + height / 2, point.z);
      post.castShadow = true;
      this.scene.add(post);
    }
  }

  private addLowHedgeAround(polygon: Vec2[], height: number, width: number): void {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const segmentLength = distance(a, b);
      if (segmentLength < 0.3) continue;
      const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const hedge = this.createTerrainRect(center, Math.atan2(b.z - a.z, b.x - a.x), segmentLength, width, height * 0.5, height, this.materials.hedge);
      hedge.castShadow = true;
      hedge.receiveShadow = true;
      this.scene.add(hedge);
    }
  }

  private addBowlsClubDetails(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const rotation = -footprint.angle;
    const center = footprint.center;
    this.addLocalBox(center, rotation, -footprint.halfX * 0.28, footprint.halfZ * 0.48, footprint.halfX * 0.9, 0.12, 2.1, this.materials.concrete, 0.12, false);
    this.addLocalBox(center, rotation, -footprint.halfX * 0.28, footprint.halfZ * 0.54, footprint.halfX * 0.82, 1.3, 1.1, this.materials.timber, 0.78);
    this.addLocalBox(center, rotation, -footprint.halfX * 0.28, footprint.halfZ * 0.54, footprint.halfX * 0.9, 0.16, 1.3, this.materials.metal, 1.52);
    for (const x of [-0.55, 0, 0.55]) {
      this.addLocalBox(center, rotation, -footprint.halfX * 0.28 + x * footprint.halfX * 0.42, footprint.halfZ * 0.01, 1.9, 0.18, 0.38, this.materials.timber, 0.48);
    }
    const gateZ = footprint.halfZ + 0.72;
    const brickPierMaterial = this.standardDetailMaterial("bowls-memorial-gate-piers", 0x8a4a38, 0.74, 0.02);
    const gateMaterial = this.standardDetailMaterial("bowls-memorial-wrought-gate", 0x2c302c, 0.48, 0.42);
    for (const x of [-0.72, 0.72]) {
      this.addLocalBox(center, rotation, x * footprint.halfX * 0.5, gateZ, 0.42, 1.18, 0.42, brickPierMaterial, 0.64);
      this.addLocalCylinder(center, rotation, x * footprint.halfX * 0.5, gateZ, 0.18, 0.22, 0.16, this.materials.basalt, 1.25);
    }
    for (const y of [0.52, 0.92]) {
      this.addLocalBox(center, rotation, 0, gateZ, footprint.halfX * 0.86, 0.07, 0.08, gateMaterial, y);
    }
    for (const x of [-0.28, -0.14, 0, 0.14, 0.28]) {
      this.addLocalBox(center, rotation, x * footprint.halfX, gateZ, 0.045, 0.78, 0.055, gateMaterial, 0.64);
    }
  }

  private addOval(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, new THREE.MeshStandardMaterial({ color: 0x5d874d, roughness: 0.9 }), 0.075);
    const center = polygonCentroid(landmark.polygon);
    const frame = this.ovalMarkingFrame(landmark.polygon, center);
    this.addOvalMowingBands(landmark.polygon, frame);
    this.addFeatureOutline(landmark.polygon, 0xebe2bf, 0.78);
    this.addOvalBoundaryMarkers(landmark.polygon);
    this.addOvalSportsDetails(landmark.polygon, frame);
    this.addLabel("W.T. Peterson Oval", center, 7);
  }

  private ovalMarkingFrame(polygon: Vec2[], center: Vec2): OvalMarkingFrame {
    const footballGoals = this.level.sportsFixtures
      .filter((fixture) => fixture.kind === "football-goal" && fixture.id.startsWith("oval-"))
      .sort((a, b) => a.position.z - b.position.z);
    const rotation = footballGoals[0]?.angle ?? 0;
    const localPolygon = polygon.map((point) => this.worldToLocal(center, rotation, point));
    const maxLocalX = Math.max(...localPolygon.map((point) => Math.abs(point.x)));
    const maxLocalZ = Math.max(...localPolygon.map((point) => Math.abs(point.z)));
    let halfWidth = Math.max(24, maxLocalX - 4 * WORLD_SCALE);
    let halfLength = Math.max(36, maxLocalZ - 5 * WORLD_SCALE);
    let goalLineZ: [number, number] = [-halfLength, halfLength];

    if (footballGoals.length >= 2) {
      const localGoals = footballGoals
        .slice(0, 2)
        .map((fixture) => this.worldToLocal(center, rotation, fixture.position))
        .sort((a, b) => a.z - b.z);
      goalLineZ = [localGoals[0].z, localGoals[1].z];
      halfLength = Math.min(halfLength, Math.abs(goalLineZ[1] - goalLineZ[0]) * 0.5 + 8 * WORLD_SCALE);
      halfWidth = Math.min(halfWidth, Math.max(24, footballGoals[0].width * 1.75));
    }

    return { center, rotation, halfWidth, halfLength, goalLineZ };
  }

  private addOvalMowingBands(polygon: Vec2[], frame: OvalMarkingFrame): void {
    const materials = [
      new THREE.LineBasicMaterial({ color: 0x82a365, transparent: true, opacity: 0.44 }),
      new THREE.LineBasicMaterial({ color: 0x486f3f, transparent: true, opacity: 0.32 })
    ];

    for (let band = 0; band < 8; band += 1) {
      const scale = 0.94 - band * 0.086;
      const points = Array.from({ length: 96 }, (_, index) => {
        const angle = (index / 96) * Math.PI * 2;
        const point = this.localPoint(
          frame.center,
          frame.rotation,
          Math.cos(angle) * frame.halfWidth * scale,
          Math.sin(angle) * frame.halfLength * scale
        );
        return new THREE.Vector3(point.x, this.groundY(point) + 0.155, point.z);
      }).filter((point) => pointInPolygon({ x: point.x, z: point.z }, polygon));
      if (points.length < 6) continue;
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([...points, points[0]]), materials[band % materials.length]));
    }
  }

  private addOvalBoundaryMarkers(polygon: Vec2[]): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xd6d0b5, roughness: 0.8 });
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const segmentLength = distance(a, b);
      const count = Math.floor(segmentLength / 18);
      if (count === 0) continue;
      for (let step = 1; step <= count; step += 1) {
        const t = step / (count + 1);
        const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 8), material);
        marker.position.set(point.x, this.groundY(point) + 0.28, point.z);
        marker.castShadow = true;
        this.scene.add(marker);
      }
    }
  }

  private addOvalSportsDetails(polygon: Vec2[], frame: OvalMarkingFrame): void {
    this.addOvalAflMarkings(polygon, frame);
    this.addOvalCricketPitch(frame);
    this.addOvalMatchDayCues(polygon, frame);
  }

  private addOvalAflMarkings(polygon: Vec2[], frame: OvalMarkingFrame): void {
    const centreSquare = Math.min(AUSTRALIAN_RULES_CENTRE_SQUARE_METRES * WORLD_SCALE, frame.halfWidth * 1.62, frame.halfLength * 0.82);
    this.addFieldLines(frame.center, centreSquare, centreSquare, frame.rotation, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 }
    ], 0xe7e0bf);

    this.addCourtCircle(frame.center, (AUSTRALIAN_RULES_OUTER_CIRCLE_DIAMETER_METRES * WORLD_SCALE) / 2, 0xe7e0bf);
    this.addCourtCircle(frame.center, (AUSTRALIAN_RULES_INNER_CIRCLE_DIAMETER_METRES * WORLD_SCALE) / 2, 0xe7e0bf);
    const centreLine = this.createTerrainRect(frame.center, frame.rotation, frame.halfWidth * 0.34, 0.08, 0.18, 0.012, this.materials.line);
    this.scene.add(centreLine);

    for (const goalZ of frame.goalLineZ) {
      this.addOvalFiftyArc(polygon, frame, goalZ);
      this.addOvalGoalSquare(frame, goalZ);
    }
  }

  private addOvalFiftyArc(polygon: Vec2[], frame: OvalMarkingFrame, goalZ: number): void {
    const radius = AUSTRALIAN_RULES_FIFTY_ARC_METRES * WORLD_SCALE;
    const halfArcWidth = Math.min(frame.halfWidth * 0.92, radius * 0.88);
    const inward = goalZ < 0 ? 1 : -1;
    const points: THREE.Vector3[] = [];

    for (let step = 0; step <= 48; step += 1) {
      const x = -halfArcWidth + (halfArcWidth * 2 * step) / 48;
      const z = goalZ + inward * Math.sqrt(Math.max(0, radius * radius - x * x));
      const point = this.localPoint(frame.center, frame.rotation, x, z);
      if (!pointInPolygon(point, polygon)) continue;
      points.push(new THREE.Vector3(point.x, this.groundY(point) + 0.18, point.z));
    }

    if (points.length > 2) {
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xe7e0bf, transparent: true, opacity: 0.78 })));
    }
  }

  private addOvalGoalSquare(frame: OvalMarkingFrame, goalZ: number): void {
    const inward = goalZ < 0 ? 1 : -1;
    const depth = AUSTRALIAN_RULES_GOAL_SQUARE_DEPTH_METRES * WORLD_SCALE;
    const width = AUSTRALIAN_RULES_GOAL_POST_SPACING_METRES * WORLD_SCALE;
    const squareCenter = this.localPoint(frame.center, frame.rotation, 0, goalZ + inward * depth * 0.5);
    this.addFieldLines(squareCenter, width, depth, frame.rotation, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 }
    ], 0xe7e0bf);
  }

  private addOvalCricketPitch(frame: OvalMarkingFrame): void {
    const pitchLength = CRICKET_PITCH_LENGTH_METRES * WORLD_SCALE;
    const pitchWidth = CRICKET_PITCH_WIDTH_METRES * WORLD_SCALE;
    const creaseMaterial = this.basicDetailMaterial("cricket-crease-whitewash", 0xf0e8c8);
    const stumpMaterial = this.standardDetailMaterial("cricket-stumps-wet-ash", 0xd3bd80, 0.64, 0.04);
    const pitch = this.createTerrainRect(
      frame.center,
      frame.rotation + Math.PI / 2,
      pitchLength,
      pitchWidth,
      0.14,
      0.055,
      new THREE.MeshStandardMaterial({ color: 0xb8a36e, roughness: 0.93 })
    );
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    const bowlingCrease = CRICKET_BOWLING_CREASE_LENGTH_METRES * WORLD_SCALE;
    const poppingCrease = CRICKET_POPPING_CREASE_LENGTH_METRES * WORLD_SCALE;
    const poppingOffset = CRICKET_POPPING_CREASE_OFFSET_METRES * WORLD_SCALE;
    const returnLength = CRICKET_RETURN_CREASE_LENGTH_METRES * WORLD_SCALE;
    const returnOffset = (bowlingCrease * 0.5);
    const stumpHeight = CRICKET_STUMP_HEIGHT_METRES;
    const wicketWidth = CRICKET_WICKET_WIDTH_METRES * WORLD_SCALE;

    for (const endZ of [-pitchLength * 0.5, pitchLength * 0.5]) {
      const inward = endZ < 0 ? 1 : -1;
      const bowlingCenter = this.localPoint(frame.center, frame.rotation, 0, endZ);
      const poppingCenter = this.localPoint(frame.center, frame.rotation, 0, endZ + inward * poppingOffset);
      this.scene.add(this.createTerrainRect(bowlingCenter, frame.rotation, bowlingCrease, 0.07, 0.188, 0.012, creaseMaterial));
      this.scene.add(this.createTerrainRect(poppingCenter, frame.rotation, poppingCrease, 0.07, 0.19, 0.012, creaseMaterial));

      for (const side of [-1, 1]) {
        const returnCenter = this.localPoint(frame.center, frame.rotation, side * returnOffset, endZ + inward * (poppingOffset - returnLength * 0.5));
        this.scene.add(this.createTerrainRect(returnCenter, frame.rotation + Math.PI / 2, returnLength, 0.06, 0.19, 0.012, creaseMaterial));
      }

      for (const localX of [-wicketWidth * 0.5, 0, wicketWidth * 0.5]) {
        this.addLocalCylinder(frame.center, frame.rotation, localX, endZ, 0.022, 0.026, stumpHeight, stumpMaterial, 0.01);
      }
      this.addLocalBox(frame.center, frame.rotation, 0, endZ, wicketWidth + 0.13, 0.024, 0.036, stumpMaterial, stumpHeight + 0.035);
    }

    for (const localZ of [-pitchLength * 0.28, pitchLength * 0.28]) {
      const sheenCenter = this.localPoint(frame.center, frame.rotation, 0, localZ);
      const sheen = this.createTerrainOverlayEllipse(sheenCenter, frame.rotation, pitchWidth * 0.62, 0.55, PATH_PATCH_SURFACE_Y + 0.018, this.materials.puddle);
      sheen.receiveShadow = true;
      this.scene.add(sheen);
    }
  }

  private addOvalMatchDayCues(polygon: Vec2[], frame: OvalMarkingFrame): void {
    const grandstand = this.level.landmarks.find((candidate) => candidate.kind === "grandstand" && candidate.polygon);
    const grandstandLocal = grandstand?.polygon ? this.worldToLocal(frame.center, frame.rotation, polygonCentroid(grandstand.polygon)) : { x: -1, z: 0 };
    const spectatorSide = grandstandLocal.x < 0 ? -1 : 1;
    const benchMaterial = this.standardDetailMaterial("oval-match-day-bench", 0x71806c, 0.74, 0.04);
    const scoreboardMaterial = this.canvasSignMaterial("oval-scoreboard", "FITZROY", "#26352f", "#f0d996");

    for (const localZ of [-frame.halfLength * 0.22, frame.halfLength * 0.18]) {
      const point = this.localPoint(frame.center, frame.rotation, spectatorSide * frame.halfWidth * 0.82, localZ);
      if (!pointInPolygon(point, polygon)) continue;
      this.addLocalBox(frame.center, frame.rotation, spectatorSide * frame.halfWidth * 0.82, localZ, 3.9, 0.28, 0.72, benchMaterial, 0.26);
      this.addLocalBox(frame.center, frame.rotation, spectatorSide * frame.halfWidth * 0.82, localZ + 0.45, 3.7, 0.72, 0.08, benchMaterial, 0.7);
    }

    const boardPoint = this.localPoint(frame.center, frame.rotation, -spectatorSide * frame.halfWidth * 0.9, frame.halfLength * 0.08);
    if (pointInPolygon(boardPoint, polygon)) {
      this.addLocalBox(frame.center, frame.rotation, -spectatorSide * frame.halfWidth * 0.9, frame.halfLength * 0.08, 4.2, 1.72, 0.18, scoreboardMaterial, 1.18, false);
      for (const side of [-1, 1]) {
        this.addLocalCylinder(frame.center, frame.rotation, -spectatorSide * frame.halfWidth * 0.9 + side * 1.8, frame.halfLength * 0.08, 0.05, 0.06, 1.4, this.materials.metal);
      }
    }
  }

  private addPathRing(points: Vec2[], color: number): void {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82 });
    const geometry = new THREE.BufferGeometry().setFromPoints(
      [...points, points[0]].map((point) => new THREE.Vector3(point.x, this.groundY(point) + 0.16, point.z))
    );
    this.scene.add(new THREE.Line(geometry, material));
  }

  private addTennisCourtLines(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    this.addFieldLines(footprint.center, footprint.halfX * 1.72, footprint.halfZ * 1.72, -footprint.angle, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 },
      { x1: 0, z1: -0.5, x2: 0, z2: 0.5 },
      { x1: -0.5, z1: 0, x2: 0.5, z2: 0 },
      { x1: -0.32, z1: -0.5, x2: -0.32, z2: 0.5 },
      { x1: 0.32, z1: -0.5, x2: 0.32, z2: 0.5 }
    ]);
  }

  private addTennisNet(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const rotation = -footprint.angle;
    const netAlongX = footprint.halfZ > footprint.halfX;
    const netWidth = netAlongX ? footprint.halfX * 1.55 : 0.08;
    const netDepth = netAlongX ? 0.08 : footprint.halfZ * 1.55;
    const netMaterial = new THREE.MeshBasicMaterial({ color: 0x1e2923, transparent: true, opacity: 0.78 });
    this.addLocalBox(footprint.center, rotation, 0, 0, netWidth, 0.64, netDepth, netMaterial, 0.52, false);

    const postOffset = netAlongX ? footprint.halfX * 0.82 : footprint.halfZ * 0.82;
    for (const side of [-1, 1]) {
      const localX = netAlongX ? side * postOffset : 0;
      const localZ = netAlongX ? 0 : side * postOffset;
      this.addLocalCylinder(footprint.center, rotation, localX, localZ, 0.055, 0.07, 1.05, this.materials.metal);
    }
  }

  private addTennisCourt(landmark: Landmark): void {
    if (!landmark.polygon) return;
    if (landmark.courtStatus === "under-construction") {
      // The public 2026 sources establish the closed northern work zone, but not
      // day-specific plant/material locations. Keep the stripped surface free of
      // speculative nets, line tape, machinery and stockpiles.
      const strippedSubgrade = this.standardDetailMaterial("fitzroy-2026-tennis-works-subgrade", 0x8c6c49, 0.96, 0.01);
      this.addFlatPolygon(landmark.polygon, strippedSubgrade, 0.09);
      this.addFeatureOutline(landmark.polygon, 0x594f40, 0.34);
      return;
    }
    const clay = this.standardDetailMaterial("fitzroy-existing-red-clay", 0xa6543b, 0.94, 0.01);
    this.addFlatPolygon(landmark.polygon, clay, 0.09);
    this.addTennisCourtLines(landmark.polygon);
    this.addTennisNet(landmark.polygon);
  }

  private addBowlingRinkLines(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const lines = Array.from({ length: 5 }, (_, index) => {
      const x = -0.4 + index * 0.2;
      return { x1: x, z1: -0.48, x2: x, z2: 0.48 };
    });
    this.addFieldLines(footprint.center, footprint.halfX * 1.8, footprint.halfZ * 1.8, -footprint.angle, lines, 0xaecb9b);
  }

  private addFieldLines(
    center: Vec2,
    width: number,
    depth: number,
    rotation: number,
    lines: Array<{ x1: number; z1: number; x2: number; z2: number }>,
    color = 0xe8e0b6
  ): void {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.88 });
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const toWorld = (x: number, z: number) => {
      const localX = x * width;
      const localZ = z * depth;
      const point = { x: center.x + localX * cos - localZ * sin, z: center.z + localX * sin + localZ * cos };
      return new THREE.Vector3(point.x, this.groundY(point) + 0.18, point.z);
    };
    for (const line of lines) {
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([toWorld(line.x1, line.z1), toWorld(line.x2, line.z2)]), material));
    }
  }

  private addPlayground(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0, 0);
    const center = footprint.center;
    const rotation = -footprint.angle;
    this.addFlatPolygon(landmark.polygon, this.materials.mulch, 0.1);
    if (landmark.id === "south-playground") {
      this.addSouthPlaygroundDetails(center, rotation, footprint.halfX, footprint.halfZ);
    } else {
      this.addNorthPlaygroundDetails(center, rotation, footprint.halfX, footprint.halfZ);
    }
  }

  private addSouthPlaygroundDetails(center: Vec2, rotation: number, halfX: number, halfZ: number): void {
    this.addPlaygroundPath(center, rotation, [
      [-halfX * 0.82, -halfZ * 0.42],
      [-halfX * 0.22, -halfZ * 0.12],
      [halfX * 0.06, halfZ * 0.16],
      [halfX * 0.82, halfZ * 0.36]
    ], 1.1);
    this.addPlaygroundPath(center, rotation, [
      [-halfX * 0.1, -halfZ * 0.72],
      [-halfX * 0.05, -halfZ * 0.1],
      [halfX * 0.04, halfZ * 0.62]
    ], 0.92);
    this.addPlaygroundTower(center, rotation, -halfX * 0.18, -halfZ * 0.12, 5.7, 4.8, 2.35, "south-main", 0xb74838);
    this.addPlaygroundRopeWeb(center, rotation, halfX * 0.24, -halfZ * 0.18, 4.8, 3.1);
    this.addSandpit(center, rotation, halfX * 0.42, halfZ * 0.35, 5.4, 3.6);
    this.addSandpit(center, rotation, -halfX * 0.5, halfZ * 0.32, 3.8, 2.7);
    this.addSwingSet(this.localPoint(center, rotation, -halfX * 0.58, -halfZ * 0.5), rotation + 0.08);
    this.addSwingSet(this.localPoint(center, rotation, halfX * 0.62, -halfZ * 0.54), rotation - 0.12);
    this.addPlaygroundShelter(center, rotation, 0, halfZ * 0.02);
    this.addToddlerSlide(center, rotation, -halfX * 0.48, halfZ * 0.02, 0x609f8a);
    this.addChalkWall(center, rotation, -halfX * 0.73, halfZ * 0.02, 1.35);
    this.addSeesaw(center, rotation, halfX * 0.02, halfZ * 0.55);
    this.addSpinner(center, rotation, halfX * 0.63, halfZ * 0.08);
  }

  private addNorthPlaygroundDetails(center: Vec2, rotation: number, halfX: number, halfZ: number): void {
    this.addPlaygroundPath(center, rotation, [
      [-halfX * 0.78, -halfZ * 0.42],
      [-halfX * 0.46, -halfZ * 0.18],
      [halfX * 0.08, -halfZ * 0.12],
      [halfX * 0.72, -halfZ * 0.18]
    ], 0.9);
    this.addPlaygroundPath(center, rotation, [
      [-halfX * 0.52, halfZ * 0.08],
      [halfX * 0.02, halfZ * 0.18],
      [halfX * 0.58, halfZ * 0.34]
    ], 0.82);

    // City of Yarra's 2018 final concept plan is used as a diagram, not merely
    // an equipment list: A is the northern toddler unit and F is the larger
    // southern/eastern activity unit, with swings and spinner between them.
    this.addPlaygroundTower(center, rotation, -halfX * 0.42, halfZ * 0.06, 3.8, 3.2, 1.46, "north-toddler-a", 0x74b94d);
    this.addPlaygroundTower(center, rotation, halfX * 0.3, halfZ * 0.28, 5.4, 4.0, 1.62, "north-activity-f", 0xd3a62f);
    this.addSwingSet(this.localPoint(center, rotation, -halfX * 0.02, -halfZ * 0.48), rotation + 0.02);
    this.addBasketSwing(center, rotation, halfX * 0.02, -halfZ * 0.12);
    this.addSpinner(center, rotation, -halfX * 0.04, halfZ * 0.48);
    this.addPlaygroundTrampoline(center, rotation, halfX * 0.55, -halfZ * 0.3);

    this.addBalanceLogs(this.localPoint(center, rotation, -halfX * 0.38, -halfZ * 0.36), rotation - 0.22);
    this.addBalanceLogs(this.localPoint(center, rotation, halfX * 0.2, halfZ * 0.5), rotation + 0.18);
    this.addSandpit(center, rotation, -halfX * 0.34, halfZ * 0.36, 3.8, 2.5);
    this.addNorthPlaygroundSeats(center, rotation, halfX, halfZ);
    this.addNorthPlaygroundShadeSails(center, rotation, halfX, halfZ);
  }

  private addBasketSwing(center: Vec2, rotation: number, localX: number, localZ: number): void {
    const position = this.localPoint(center, rotation, localX, localZ);
    const frame = this.standardDetailMaterial("north-playground-basket-swing-frame", 0x3c4542, 0.58, 0.28);
    for (const x of [-1.45, 1.45]) {
      for (const z of [-0.48, 0.48]) {
        this.addLocalCylinder(position, rotation, x, z, 0.055, 0.075, 2.8, frame);
      }
    }
    this.addLocalBox(position, rotation, 0, 0, 3.35, 0.09, 0.1, frame, 2.72);
    for (const x of [-0.34, 0.34]) {
      this.addLocalCylinder(position, rotation, x, 0, 0.018, 0.018, 1.45, this.materials.metal, 1.18);
    }
    const basket = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 6, 16), this.materials.rubber);
    basket.position.set(position.x, this.groundY(position) + 1.08, position.z);
    basket.rotation.x = Math.PI / 2;
    basket.rotation.y = rotation;
    basket.castShadow = true;
    this.scene.add(basket);
  }

  private addPlaygroundTrampoline(center: Vec2, rotation: number, localX: number, localZ: number): void {
    const position = this.localPoint(center, rotation, localX, localZ);
    const rope = new THREE.LineBasicMaterial({ color: 0xe1b33f, transparent: true, opacity: 0.86 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.02, 0.16, 18), this.materials.rubber);
    hub.position.set(position.x, this.groundY(position) + 0.22, position.z);
    hub.castShadow = true;
    this.scene.add(hub);
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = rotation + (index / 10) * Math.PI * 2;
      const outer = { x: position.x + Math.cos(angle) * 2.65, z: position.z + Math.sin(angle) * 2.65 };
      this.addLocalCylinder(outer, 0, 0, 0, 0.045, 0.06, 1.25, this.materials.metal);
      points.push(
        new THREE.Vector3(position.x + Math.cos(angle) * 0.86, this.groundY(position) + 0.34, position.z + Math.sin(angle) * 0.86),
        new THREE.Vector3(outer.x, this.groundY(outer) + 1.18, outer.z)
      );
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), rope));
  }

  private addNorthPlaygroundSeats(center: Vec2, rotation: number, halfX: number, halfZ: number): void {
    const seatMaterial = this.standardDetailMaterial("north-playground-concept-plan-seats", 0x8f6a45, 0.78, 0.01);
    for (const [x, z] of [
      [-halfX * 0.46, -halfZ * 0.66],
      [halfX * 0.02, halfZ * 0.7],
      [halfX * 0.46, halfZ * 0.58],
      [halfX * 0.58, -halfZ * 0.08]
    ]) {
      this.addLocalBox(center, rotation, x, z, 2.3, 0.16, 0.52, seatMaterial, 0.42);
      for (const side of [-0.76, 0.76]) this.addLocalBox(center, rotation, x + side, z, 0.1, 0.42, 0.32, this.materials.metal, 0.22);
    }
  }

  private addNorthPlaygroundShadeSails(center: Vec2, rotation: number, halfX: number, halfZ: number): void {
    const sail = this.standardDetailMaterial("north-playground-concept-plan-shade-sails", 0x4d4f49, 0.9, 0.01, true, 0.9);
    const add = (x: number, z: number, width: number, depth: number, tilt: number) => this.addLocalShadeSail(center, rotation, [
      { x: x - width, z: z - depth, y: 3.25 + tilt },
      { x: x + width, z: z - depth, y: 3.05 - tilt },
      { x: x + width, z: z + depth, y: 3.35 + tilt },
      { x: x - width, z: z + depth, y: 3.0 - tilt }
    ], sail);
    add(-halfX * 0.4, halfZ * 0.06, 3.8, 3.2, 0.16);
    add(0, -halfZ * 0.3, 4.1, 3.0, -0.12);
    add(halfX * 0.28, halfZ * 0.28, 4.4, 3.4, 0.1);
  }

  private addPlaygroundPath(center: Vec2, rotation: number, localPoints: Array<[number, number]>, width: number): void {
    const material = this.standardDetailMaterial("playground-access-path", 0xd4c8a9, 0.82, 0.01);
    const points = localPoints.map(([x, z]) => this.localPoint(center, rotation, x, z));
    for (let i = 0; i < points.length - 1; i += 1) {
      this.addPathSegment(points[i], points[i + 1], width, material, PATH_SURFACE_Y + 0.024);
    }
    for (const point of points) {
      this.addPathCap(point, width * 0.48, material, PATH_CAP_SURFACE_Y + 0.024);
    }
  }

  private addPlaygroundTower(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    depth: number,
    platformY: number,
    key: string,
    accentColor: number
  ): void {
    const base = this.localPoint(center, rotation, localX, localZ);
    const group = new THREE.Group();
    const accent = this.standardDetailMaterial(`playground-${key}-accent`, accentColor, 0.54, 0.02);
    const roof = this.standardDetailMaterial(`playground-${key}-roof`, 0x8a5d3f, 0.72, 0.01);

    for (const x of [-width * 0.42, width * 0.42]) {
      for (const z of [-depth * 0.38, depth * 0.38]) {
        const pole = new THREE.Mesh(
          this.painterlyGeometry(new THREE.CylinderGeometry(0.14, 0.18, platformY + 1.7, 8), this.materials.timber),
          this.materials.timber
        );
        pole.position.set(x, (platformY + 1.7) * 0.5, z);
        pole.castShadow = true;
        group.add(pole);
      }
    }
    const deck = new THREE.Mesh(
      this.painterlyGeometry(new THREE.BoxGeometry(width, 0.22, depth), this.materials.timber),
      this.materials.timber
    );
    deck.userData.kind = "playground-tower-deck";
    deck.userData.playgroundKey = key;
    deck.position.y = platformY;
    deck.castShadow = true;
    group.add(deck);

    for (const z of [-depth * 0.34, depth * 0.34]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.14, 0.12), accent);
      rail.position.set(0, platformY + 0.82, z);
      rail.castShadow = true;
      group.add(rail);
    }
    const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(width * 0.58, 0.9, 4), roof);
    roofMesh.position.y = platformY + 2.1;
    roofMesh.rotation.y = Math.PI * 0.25;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(width * 0.26, 0.16, depth * 1.26), accent);
    slide.position.set(width * 0.08, platformY * 0.53, depth * 0.84);
    slide.rotation.x = -0.34;
    slide.castShadow = true;
    group.add(slide);

    for (let rung = 0; rung < 4; rung += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(width * 0.48, 0.09, 0.13), this.materials.metal);
      step.position.set(-width * 0.18, 0.48 + rung * 0.34, -depth * 0.55);
      step.castShadow = true;
      group.add(step);
    }

    group.position.set(base.x, this.boxSupportY(base, rotation, width * 0.55, depth * 0.62), base.z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private addPlaygroundRopeWeb(center: Vec2, rotation: number, localX: number, localZ: number, width: number, height: number): void {
    const base = this.localPoint(center, rotation, localX, localZ);
    const group = new THREE.Group();
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf0e1bf, transparent: true, opacity: 0.86 });
    const frameMaterial = this.materials.metal;
    for (const x of [-width * 0.5, width * 0.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, height, 8), frameMaterial);
      post.position.set(x, height * 0.5, 0);
      post.castShadow = true;
      group.add(post);
    }
    const points: THREE.Vector3[] = [];
    for (let step = 0; step <= 4; step += 1) {
      const x = -width * 0.5 + (width * step) / 4;
      points.push(new THREE.Vector3(x, 0.28, 0), new THREE.Vector3(0, height, 0));
    }
    for (let step = 1; step <= 3; step += 1) {
      const y = 0.38 + (height - 0.52) * (step / 4);
      points.push(new THREE.Vector3(-width * 0.5, y, 0), new THREE.Vector3(width * 0.5, y, 0));
    }
    points.push(new THREE.Vector3(-width * 0.5, 0.28, 0), new THREE.Vector3(width * 0.5, height * 0.84, 0));
    points.push(new THREE.Vector3(width * 0.5, 0.28, 0), new THREE.Vector3(-width * 0.5, height * 0.84, 0));
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
    group.position.set(base.x, this.groundY(base) + 0.04, base.z);
    group.rotation.y = rotation + 0.22;
    this.scene.add(group);
  }

  private addSandpit(center: Vec2, rotation: number, localX: number, localZ: number, width: number, depth: number): void {
    const point = this.localPoint(center, rotation, localX, localZ);
    const sand = this.createTerrainOverlayRect(point, rotation, width, depth, PATH_SURFACE_Y + 0.018, this.materials.dirt);
    sand.receiveShadow = true;
    this.scene.add(sand);
    this.addLocalBox(center, rotation, localX, localZ - depth * 0.5, width + 0.25, 0.18, 0.18, this.materials.timber, 0.16);
    this.addLocalBox(center, rotation, localX, localZ + depth * 0.5, width + 0.25, 0.18, 0.18, this.materials.timber, 0.16);
    this.addLocalBox(center, rotation, localX - width * 0.5, localZ, 0.18, 0.18, depth + 0.25, this.materials.timber, 0.16);
    this.addLocalBox(center, rotation, localX + width * 0.5, localZ, 0.18, 0.18, depth + 0.25, this.materials.timber, 0.16);
  }

  private addPlaygroundShelter(center: Vec2, rotation: number, localX: number, localZ: number): void {
    const position = this.localPoint(center, rotation, localX, localZ);
    const groundY = this.radialSupportY(position, 2.4);
    const roof = new THREE.Mesh(
      this.painterlyGeometry(new THREE.CylinderGeometry(2.0, 2.45, 0.28, 4), this.materials.timber),
      this.materials.timber
    );
    roof.position.set(position.x, groundY + 2.55, position.z);
    roof.rotation.y = rotation + Math.PI / 4;
    roof.castShadow = true;
    this.scene.add(roof);
    for (const x of [-1.35, 1.35]) {
      for (const z of [-1.0, 1.0]) {
        this.addLocalCylinder(position, rotation, x, z, 0.055, 0.075, 2.25, this.materials.metal);
      }
    }
  }

  private addToddlerSlide(center: Vec2, rotation: number, localX: number, localZ: number, color: number): void {
    const accent = this.standardDetailMaterial(`toddler-slide-${color.toString(16)}`, color, 0.52, 0.02);
    this.addLocalBox(center, rotation, localX, localZ, 2.3, 0.18, 1.9, this.materials.timber, 0.92);
    const slide = this.addLocalBox(center, rotation, localX + 1.65, localZ + 0.22, 0.95, 0.14, 2.9, accent, 0.62);
    slide.rotation.x = -0.28;
    for (const z of [-0.58, 0.58]) {
      this.addLocalBox(center, rotation, localX - 1.25, localZ + z, 0.1, 0.95, 0.1, this.materials.metal, 0.52);
    }
  }

  private addChalkWall(center: Vec2, rotation: number, localX: number, localZ: number, width: number): void {
    this.addLocalBox(center, rotation, localX, localZ, width, 1.05, 0.08, this.materials.darkOpening, 0.68, false);
    for (const x of [-width * 0.42, width * 0.42]) {
      this.addLocalCylinder(center, rotation, localX + x, localZ, 0.04, 0.05, 1.3, this.materials.timber);
    }
  }

  private addSeesaw(center: Vec2, rotation: number, localX: number, localZ: number): void {
    const beam = this.addLocalBox(center, rotation + 0.18, localX, localZ, 4.5, 0.16, 0.28, this.materials.timber, 0.62);
    beam.rotation.z = 0.12;
    this.addLocalCylinder(center, rotation, localX, localZ, 0.22, 0.28, 0.42, this.materials.metal, 0.12);
  }

  private addSpinner(center: Vec2, rotation: number, localX: number, localZ: number): void {
    const position = this.localPoint(center, rotation, localX, localZ);
    const disc = new THREE.Mesh(
      this.painterlyGeometry(new THREE.CylinderGeometry(1.05, 1.12, 0.16, 20), this.materials.rubber),
      this.materials.rubber
    );
    disc.position.set(position.x, this.groundY(position) + 0.18, position.z);
    disc.castShadow = true;
    this.scene.add(disc);
    this.addLocalCylinder(center, rotation, localX, localZ, 0.045, 0.06, 0.95, this.materials.metal, 0.18);
  }

  private addTunnel(center: Vec2, rotation: number, localX: number, localZ: number): void {
    const position = this.localPoint(center, rotation, localX, localZ);
    const tunnel = new THREE.Mesh(
      this.painterlyGeometry(new THREE.CylinderGeometry(0.7, 0.7, 2.1, 14, 1, true), this.materials.rubber),
      this.materials.rubber
    );
    tunnel.position.set(position.x, this.groundY(position) + 0.72, position.z);
    tunnel.rotation.z = Math.PI / 2;
    tunnel.rotation.y = rotation + Math.PI / 2;
    tunnel.castShadow = true;
    this.scene.add(tunnel);
  }

  private addSpringRider(center: Vec2, rotation: number, localX: number, localZ: number, color: number): void {
    const accent = this.standardDetailMaterial(`spring-rider-${color.toString(16)}`, color, 0.58, 0.02);
    this.addLocalCylinder(center, rotation, localX, localZ, 0.05, 0.07, 0.62, this.materials.metal, 0.08);
    this.addLocalBox(center, rotation, localX, localZ, 1.05, 0.42, 0.42, accent, 0.72);
    this.addLocalBox(center, rotation, localX + 0.58, localZ, 0.34, 0.2, 0.24, accent, 0.9);
  }

  private addSwingSet(position: Vec2, rotation: number): void {
    const group = new THREE.Group();
    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0x5f6f69, metalness: 0.25, roughness: 0.5 });
    for (const x of [-1.8, 1.8]) {
      for (const z of [-0.55, 0.55]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.3, 8), sideMaterial);
        leg.position.set(x, 1.6, z);
        leg.rotation.z = x < 0 ? -0.22 : 0.22;
        leg.castShadow = true;
        group.add(leg);
      }
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.25, 8), sideMaterial);
    beam.position.set(0, 3.18, 0);
    beam.rotation.z = Math.PI / 2;
    beam.castShadow = true;
    group.add(beam);
    for (const x of [-0.8, 0.8]) {
      for (const chainX of [-0.18, 0.18]) {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.65, 6), this.materials.metal);
        chain.position.set(x + chainX, 2.25, 0);
        chain.castShadow = true;
        group.add(chain);
      }
      const seat = new THREE.Mesh(
        this.painterlyGeometry(new THREE.BoxGeometry(0.85, 0.08, 0.34), this.materials.rubber),
        this.materials.rubber
      );
      seat.position.set(x, 1.42, 0);
      seat.castShadow = true;
      group.add(seat);
    }
    group.position.set(position.x, this.boxSupportY(position, rotation, 2.05, 0.65), position.z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private addBalanceLogs(position: Vec2, rotation: number): void {
    const group = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const log = new THREE.Mesh(
        this.painterlyGeometry(new THREE.CylinderGeometry(0.16, 0.18, 2.3, 8), this.materials.timber),
        this.materials.timber
      );
      log.position.set((i - 1.5) * 1.1, 0.28 + (i % 2) * 0.08, (i % 2) * 0.52);
      log.rotation.z = Math.PI / 2;
      log.castShadow = true;
      group.add(log);
    }
    group.position.set(position.x, this.boxSupportY(position, rotation, 2.25, 0.9), position.z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private addSkatePark(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, this.materials.concrete, 0.1);
    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0, 0);
    const center = footprint.center;
    const rotation = -footprint.angle;

    for (const bowl of this.level.skateBowls) {
      this.addSkateBowlFeature(bowl);
    }

    this.addSkateStreetSection(center, rotation, footprint.halfX, footprint.halfZ);
  }

  private addSkateBowlFeature(bowl: SkateBowlFeature): void {
    const floorMaterial = this.standardDetailMaterial(
      `fitzy-bowl-floor-${bowl.difficulty}`,
      bowl.difficulty === "deep" ? 0x7f8582 : 0x90978f,
      0.82,
      0.03
    );
    const shadowMaterial = this.standardDetailMaterial(`fitzy-bowl-low-point-${bowl.id}`, 0x5f6868, 0.9, 0.02, true, 0.64);
    const rimMaterial = this.standardDetailMaterial(`fitzy-bowl-rim-${bowl.difficulty}`, 0xb0b4ad, 0.74, 0.04);

    const floor = this.createTerrainOverlayEllipse(bowl.center, bowl.angle, bowl.radiusX, bowl.radiusZ, PATH_SURFACE_Y + 0.024, floorMaterial);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const lowPoint = this.createTerrainOverlayEllipse(
      bowl.center,
      bowl.angle,
      bowl.radiusX * 0.52,
      bowl.radiusZ * 0.52,
      PATH_SURFACE_Y + 0.03,
      shadowMaterial
    );
    lowPoint.receiveShadow = true;
    this.scene.add(lowPoint);

    this.addSkateBowlContour(bowl, 0.72, 0xaeb5b1);
    this.addSkateBowlContour(bowl, 0.43, 0x6d7778);
    this.addSkateBowlRim(bowl, rimMaterial);
    this.addSkateBowlExitRamp(bowl, rimMaterial);
  }

  private addSkateBowlRim(bowl: SkateBowlFeature, rimMaterial: THREE.Material): void {
    const segments = bowl.difficulty === "deep" ? 24 : 18;
    for (let index = 0; index < segments; index += 1) {
      const startAngle = (index / segments) * Math.PI * 2;
      const endAngle = ((index + 0.82) / segments) * Math.PI * 2;
      const midAngle = (startAngle + endAngle) * 0.5;
      const midPoint = this.skateBowlPoint(bowl, midAngle, 1.02);
      if (
        this.isSkateBowlExitAngle(bowl, midAngle, bowl.exitWidth * 1.15) ||
        this.isInsideConnectedSkateBowl(bowl, midPoint)
      ) {
        continue;
      }

      const start = this.skateBowlPoint(bowl, startAngle, 1.02);
      const end = this.skateBowlPoint(bowl, endAngle, 1.02);
      const center = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
      const angle = Math.atan2(end.z - start.z, end.x - start.x);
      const length = distance(start, end);
      const rim = this.createTerrainRect(center, angle, length, 0.5, PATH_SURFACE_Y + 0.2, 0.22, rimMaterial);
      rim.receiveShadow = true;
      this.scene.add(rim);

      const coping = this.createTerrainRect(center, angle, length * 0.92, 0.095, PATH_SURFACE_Y + 0.35, 0.075, this.materials.metal);
      coping.receiveShadow = true;
      this.scene.add(coping);
    }
  }

  private addSkateBowlExitRamp(bowl: SkateBowlFeature, material: THREE.Material): void {
    const inner = this.skateBowlPoint(bowl, bowl.exitAngle, 0.75);
    const outer = this.skateBowlPoint(bowl, bowl.exitAngle, 1.2);
    const center = { x: (inner.x + outer.x) * 0.5, z: (inner.z + outer.z) * 0.5 };
    const angle = Math.atan2(outer.z - inner.z, outer.x - inner.x);
    const rollOut = this.createTerrainRect(center, angle, distance(inner, outer), bowl.difficulty === "deep" ? 1.35 : 1.9, PATH_SURFACE_Y + 0.045, 0.055, material);
    rollOut.receiveShadow = true;
    this.scene.add(rollOut);
  }

  private addSkateBowlContour(bowl: SkateBowlFeature, scale: number, color: number): void {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: scale < 0.5 ? 0.5 : 0.68 });
    const points: THREE.Vector3[] = [];
    for (let step = 0; step <= 48; step += 1) {
      const angle = (step / 48) * Math.PI * 2;
      const point = this.skateBowlPoint(bowl, angle, scale);
      points.push(new THREE.Vector3(point.x, this.groundY(point) + PATH_MARKING_SURFACE_Y + 0.008, point.z));
    }
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  private addSkateStreetSection(center: Vec2, rotation: number, halfX: number, halfZ: number): void {
    const ledgeMaterial = this.standardDetailMaterial("fitzy-bowl-street-ledges", 0x8a908a, 0.78, 0.04);
    const bankMaterial = this.standardDetailMaterial("fitzy-bowl-bank-faces", 0x969c96, 0.78, 0.03);

    // Playce drawing 19321_003 places the 2022 street extension north of the
    // retained bowl complexes: long west bank, north quarter-pipe return,
    // central manual pad/rail and the raised timber spectator terrace to east.
    const westBank = this.addLocalBox(center, rotation, halfX * 0.12, -halfZ * 0.7, Math.min(16.5, halfX * 1.08), 0.9, 3.0, bankMaterial, 0.46);
    westBank.rotation.z = 0.16;
    const northWestBank = this.addLocalBox(center, rotation, halfX * 0.63, -halfZ * 0.42, Math.min(8.2, halfX * 0.56), 0.72, 2.7, bankMaterial, 0.38);
    northWestBank.rotation.z = -0.17;
    const northQuarter = this.addLocalBox(center, rotation, halfX * 0.72, halfZ * 0.08, Math.min(11.8, halfX * 0.78), 0.96, 2.8, bankMaterial, 0.48);
    northQuarter.rotation.x = -0.19;
    const northEastReturn = this.addLocalBox(center, rotation, halfX * 0.48, halfZ * 0.65, Math.min(9.5, halfX * 0.68), 0.82, 2.5, bankMaterial, 0.42);
    northEastReturn.rotation.z = 0.16;

    this.addLocalBox(center, rotation, halfX * 0.2, -halfZ * 0.05, Math.min(6.6, halfX * 0.44), 0.34, 1.2, ledgeMaterial, 0.2);
    this.addLocalBox(center, rotation, halfX * 0.24, halfZ * 0.26, Math.min(5.5, halfX * 0.38), 0.42, 1.0, ledgeMaterial, 0.24);
    this.addSkateRail(this.localPoint(center, rotation, halfX * 0.06, -halfZ * 0.12), rotation + 0.02, Math.min(8.4, halfX * 0.58));
    this.addCurvedSkateRail(center, rotation, halfX * 0.02, halfZ * 0.18, Math.min(7.8, halfX * 0.54));

    const terraceConcrete = this.standardDetailMaterial("fitzy-bowl-spectator-terrace", 0x7d8581, 0.8, 0.03);
    const terraceTimber = this.standardDetailMaterial("fitzy-bowl-timber-seat", 0xb7894c, 0.76, 0.01);
    this.addLocalBox(center, rotation, -halfX * 0.02, halfZ * 0.72, Math.min(9.8, halfX * 0.72), 0.34, 3.4, terraceConcrete, 0.2);
    this.addLocalBox(center, rotation, 0, halfZ * 0.72, Math.min(7.2, halfX * 0.52), 0.48, 2.15, terraceConcrete, 0.48);
    this.addLocalBox(center, rotation, 0, halfZ * 0.7, Math.min(5.8, halfX * 0.42), 0.18, 1.45, terraceTimber, 0.82);
  }

  private addCurvedSkateRail(center: Vec2, rotation: number, localX: number, localZ: number, length: number): void {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 10; index += 1) {
      const t = index / 10;
      const point = this.localPoint(center, rotation, localX + (t - 0.5) * length, localZ + Math.sin((t - 0.5) * Math.PI) * 0.8);
      points.push(new THREE.Vector3(point.x, this.groundY(point) + 0.78, point.z));
      if (index === 2 || index === 8) this.addLocalCylinder(point, 0, 0, 0, 0.045, 0.055, 0.78, this.materials.metal);
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.055, 8, false), this.materials.metal);
    rail.castShadow = true;
    this.scene.add(rail);
  }

  private skateBowlPoint(bowl: SkateBowlFeature, angle: number, scale: number): Vec2 {
    return this.localPoint(bowl.center, bowl.angle, Math.cos(angle) * bowl.radiusX * scale, Math.sin(angle) * bowl.radiusZ * scale);
  }

  private isSkateBowlExitAngle(bowl: SkateBowlFeature, angle: number, width: number): boolean {
    const delta = Math.atan2(Math.sin(angle - bowl.exitAngle), Math.cos(angle - bowl.exitAngle));
    return Math.abs(delta) <= width;
  }

  private isInsideConnectedSkateBowl(bowl: SkateBowlFeature, point: Vec2): boolean {
    if (!bowl.groupId) return false;
    return this.level.skateBowls.some((candidate) => {
      if (candidate === bowl || candidate.groupId !== bowl.groupId) return false;
      const dx = point.x - candidate.center.x;
      const dz = point.z - candidate.center.z;
      const cos = Math.cos(candidate.angle);
      const sin = Math.sin(candidate.angle);
      const localX = dx * cos + dz * sin;
      const localZ = -dx * sin + dz * cos;
      return (localX * localX) / (candidate.radiusX * candidate.radiusX) + (localZ * localZ) / (candidate.radiusZ * candidate.radiusZ) < 0.92;
    });
  }

  private addSkateRail(position: Vec2, rotation: number, length: number): void {
    const group = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, length, 10), this.materials.metal);
    rail.position.y = 0.82;
    rail.rotation.z = Math.PI / 2;
    rail.castShadow = true;
    group.add(rail);
    for (const x of [-length * 0.36, length * 0.36]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.82, 8), this.materials.metal);
      post.position.set(x, 0.41, 0);
      post.castShadow = true;
      group.add(post);
    }
    group.position.set(position.x, this.boxSupportY(position, rotation, length * 0.5, 0.18), position.z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private addBasketball(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, this.materials.asphalt, 0.1);
    const center = polygonCentroid(landmark.polygon);
    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0, 0);
    this.addFieldLines(footprint.center, footprint.halfX * 1.75, footprint.halfZ * 1.75, -footprint.angle, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 },
      { x1: 0, z1: -0.5, x2: 0, z2: 0.5 },
      { x1: -0.18, z1: -0.5, x2: -0.18, z2: -0.25 },
      { x1: 0.18, z1: 0.5, x2: 0.18, z2: 0.25 }
    ]);
    this.addCourtCircle(center, 2.2, 0xe8e0b6);
  }

  private addSportsFixtures(): void {
    for (const fixture of this.level.sportsFixtures) {
      if (fixture.kind === "football-goal") {
        this.addFootballGoal(fixture);
      } else {
        this.addBasketballHoop(fixture);
      }
    }
  }

  private addFootballGoal(fixture: SportsFixture): void {
    const [westBehind, westGoal, eastGoal, eastBehind] = footballPostLocalOffsets(fixture.width);
    const placements = [
      { x: westBehind, height: AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES, radius: 0.075 },
      { x: westGoal, height: fixture.height, radius: 0.09 },
      { x: eastGoal, height: fixture.height, radius: 0.09 },
      { x: eastBehind, height: AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES, radius: 0.075 }
    ];
    const paddingMaterial = new THREE.MeshStandardMaterial({ color: 0x31596d, roughness: 0.64 });
    for (const placement of placements) {
      const point = this.localPoint(fixture.position, fixture.angle, placement.x, 0);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(placement.radius * 0.78, placement.radius, placement.height, 10), this.materials.line);
      post.position.set(point.x, this.groundY(point) + placement.height / 2, point.z);
      post.castShadow = true;
      this.scene.add(post);

      const paddingHeight = Math.min(2.5, placement.height * 0.78);
      const padding = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, paddingHeight, 10), paddingMaterial);
      padding.position.set(point.x, this.groundY(point) + paddingHeight / 2, point.z);
      padding.castShadow = true;
      this.scene.add(padding);
    }

    const goalLine = this.createTerrainRect(fixture.position, fixture.angle, fixture.width, 0.12, 0.14, 0.018, this.materials.line);
    this.scene.add(goalLine);
  }

  private addBasketballHoop(fixture: SportsFixture): void {
    const groundY = this.groundY(fixture.position);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, fixture.height + 0.55, 12), this.materials.metal);
    pole.position.set(fixture.position.x, groundY + (fixture.height + 0.55) / 2, fixture.position.z);
    pole.castShadow = true;
    this.scene.add(pole);

    const boardPoint = this.localPoint(fixture.position, fixture.angle, 0, 1.05);
    const board = new THREE.Mesh(new THREE.BoxGeometry(fixture.width, 1.1, 0.14), new THREE.MeshStandardMaterial({ color: 0xe6d9b8, roughness: 0.5 }));
    board.position.set(boardPoint.x, groundY + fixture.height + 0.35, boardPoint.z);
    board.rotation.y = fixture.angle;
    board.castShadow = true;
    this.scene.add(board);

    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.46, 0.03), new THREE.MeshBasicMaterial({ color: 0x2f3a36 }));
    const innerPoint = this.localPoint(fixture.position, fixture.angle, 0, 1.13);
    inner.position.set(innerPoint.x, groundY + fixture.height + 0.18, innerPoint.z);
    inner.rotation.y = fixture.angle;
    this.scene.add(inner);

    const hoopPoint = this.localPoint(fixture.position, fixture.angle, 0, 1.55);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.028, 8, 24), new THREE.MeshStandardMaterial({ color: 0xb94e39, metalness: 0.25, roughness: 0.4 }));
    hoop.position.set(hoopPoint.x, groundY + fixture.height, hoopPoint.z);
    hoop.rotation.set(Math.PI / 2, 0, fixture.angle);
    hoop.castShadow = true;
    this.scene.add(hoop);

    const support = this.addLocalBox(fixture.position, fixture.angle, 0, 0.68, 0.08, 0.08, 1.4, this.materials.metal, fixture.height + 0.1);
    support.rotation.x = 0.16;
  }

  private addCourtCircle(center: Vec2, radius: number, color: number): void {
    const points = makeCircle(center, radius, 40);
    this.scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([...points, points[0]].map((point) => new THREE.Vector3(point.x, this.groundY(point) + 0.18, point.z))),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.86 })
      )
    );
  }

  private addToilets(landmark: Landmark): void {
    const fallbackStart = landmark.id === "north-toilets" ? new Set(this.scene.children) : null;
    const center = landmark.polygon ? polygonCentroid(landmark.polygon) : landmark.position;
    if (!center) return;
    const footprint = landmark.polygon ? this.fitBoxFromPolygon(landmark.polygon, 0.12, 0.12) : { center, halfX: 3, halfZ: 2.5, angle: 0 };
    const rotation = landmark.polygon ? -footprint.angle : 0;
    const width = Math.max(5.4, footprint.halfX * 2);
    const depth = Math.max(4.6, footprint.halfZ * 2);
    const wallMaterial = this.standardDetailMaterial("north-toilet-corrugated-wall", 0x30383a, 0.72, 0.1);
    const roofMaterial = this.standardDetailMaterial("north-toilet-sheet-metal-roof", 0x7e8c8a, 0.64, 0.18);
    const clearRoofMaterial = this.standardDetailMaterial("north-toilet-clear-roof-sheet", 0xc4d8d4, 0.42, 0.02, true, 0.46);
    const doorMaterial = this.standardDetailMaterial("north-toilet-current-grey-doors", 0x596365, 0.6, 0.18);
    const signMaterial = this.basicDetailMaterial("north-toilet-blue-wayfinding-sign", 0x1454a4);
    const basinMaterial = this.standardDetailMaterial("north-toilet-stainless-hand-basin", 0x899493, 0.4, 0.56);

    const cellDepth = depth * 0.74;
    const cellZ = depth * 0.06;
    const roofWidth = width + 1.1;
    const metalRoofWidth = roofWidth * 0.64;
    const clearRoofWidth = roofWidth - metalRoofWidth;
    const roofRise = 0.62;
    this.addLocalBox(center, rotation, 0, 0, width + 1.1, 0.08, depth + 1.2, this.materials.concrete, 0.07, false);
    this.addLocalBox(center, rotation, 0, cellZ, width, 2.5, cellDepth, wallMaterial, 1.29);
    this.addSkillionRoof(
      center,
      rotation,
      -roofWidth * 0.18,
      0,
      metalRoofWidth,
      depth + 1.5,
      2.82,
      roofRise * 0.64,
      roofMaterial
    );
    this.addSkillionRoof(
      center,
      rotation,
      roofWidth * 0.32,
      0,
      clearRoofWidth,
      depth + 1.5,
      2.82 + roofRise * 0.64,
      roofRise * 0.36,
      clearRoofMaterial
    );
    for (const x of [-width * 0.45, width * 0.12, width * 0.45]) {
      for (const z of [-depth * 0.58, depth * 0.58]) {
        this.addLocalCylinder(center, rotation, x, z, 0.055, 0.07, 3.0, this.materials.metal);
      }
    }
    const stallSideX = width * 0.5 + 0.045;
    for (const [index, z] of [-depth * 0.38, -depth * 0.23, -depth * 0.08, depth * 0.08, depth * 0.23, depth * 0.38].entries()) {
      this.addLocalBox(center, rotation, stallSideX, z, 0.08, 2.1, depth * 0.12, doorMaterial, 1.14, false);
      this.addLocalBox(center, rotation, stallSideX + 0.045, z, 0.08, 0.3, depth * 0.035, signMaterial, 1.48, false);
    }
    const publicZ = -depth * 0.5 - 0.055;
    for (const x of [-0.68, 0.68]) {
      this.addLocalBox(center, rotation, x, publicZ, 0.88, 0.46, 0.48, basinMaterial, 0.73, true);
    }
    if (fallbackStart && landmark.polygon) {
      this.replaceNorthToiletsFallbackWithAsset(
        landmark,
        this.scene.children.filter((child) => !fallbackStart.has(child))
      );
    }
  }

  private addBbq(position: Vec2): void {
    const groundY = this.radialSupportY(position, 3.2);
    const group = new THREE.Group();
    const pad = new THREE.Mesh(this.painterlyGeometry(new THREE.CircleGeometry(3.2, 24), this.materials.concrete), this.materials.concrete);
    pad.position.y = 0.075;
    pad.rotation.x = -Math.PI / 2;
    pad.receiveShadow = true;
    group.add(pad);

    // CMP 2004 Figure 67 records the park BBQ as a low, faceted bluestone
    // masonry unit with a dark cooktop, not a generic steel cabinet.
    const body = new THREE.Mesh(
      this.painterlyGeometry(new THREE.CylinderGeometry(0.88, 0.98, 0.92, 12), this.materials.basalt),
      this.materials.basalt
    );
    body.position.y = 0.53;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const mortar = this.standardDetailMaterial("edinburgh-bbq-mortar", 0x78817a, 0.86, 0.02);
    for (const y of [0.28, 0.52, 0.76]) {
      const course = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.018, 6, 24), mortar);
      course.position.y = y;
      course.rotation.x = Math.PI / 2;
      group.add(course);
    }

    const timberRim = new THREE.Mesh(
      this.painterlyGeometry(new THREE.TorusGeometry(0.91, 0.075, 8, 24), this.materials.timber),
      this.materials.timber
    );
    timberRim.position.y = 1.01;
    timberRim.rotation.x = Math.PI / 2;
    timberRim.castShadow = true;
    group.add(timberRim);

    const cooktopMaterial = this.standardDetailMaterial("edinburgh-bbq-stainless-cooktop", 0x778681, 0.34, 0.52);
    const cooktop = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.78, 0.09, 16), cooktopMaterial);
    cooktop.position.y = 1.04;
    cooktop.castShadow = true;
    group.add(cooktop);
    const hotplate = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.035, 0.58), this.basicDetailMaterial("edinburgh-bbq-hotplate", 0x252a27));
    hotplate.position.set(0, 1.105, -0.04);
    group.add(hotplate);

    const controlPanel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.055), cooktopMaterial);
    controlPanel.position.set(0, 0.68, -0.94);
    group.add(controlPanel);
    for (const x of [-0.13, 0.13]) {
      const control = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 10), this.basicDetailMaterial("edinburgh-bbq-control", 0x202622));
      control.position.set(x, 0.68, -0.98);
      control.rotation.x = Math.PI / 2;
      group.add(control);
    }

    group.position.set(position.x, groundY, position.z);
    group.rotation.y = this.angleFromPoint(position);
    this.scene.add(group);
  }

  private addAmenities(): void {
    for (const amenity of this.level.amenities) {
      const angle = this.isStructureAmenity(amenity) ? this.structureAccessAngle(amenity) : this.angleFromId(amenity.id);
      if (amenity.kind === "bench") {
        this.addBench(amenity.position, amenity.angle ?? angle);
        this.addAmenityHalo(amenity.position, 0x9ebf86, 0.62);
      } else if (amenity.kind === "picnic_table") {
        this.addPicnicTable(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0x9ebf86, 0.62);
      } else if (amenity.kind === "table_tennis") {
        this.addTableTennis(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0x61a8d3, 0.68);
      } else if (amenity.kind === "waste_basket") {
        this.addWasteBasket(amenity.position);
        this.addAmenityHalo(amenity.position, 0xd0a343, 0.5);
      } else if (amenity.kind === "drinking_water") {
        this.addDrinkingFountain(amenity.position);
        this.addAmenityHalo(amenity.position, 0x61a8d3, 0.68);
      } else if (amenity.kind === "bicycle_parking") {
        this.addBikeRack(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0xc2c8ba, 0.58);
      } else if (amenity.kind === "bbq") {
        this.addAmenityHalo(amenity.position, 0xd0a343, 0.64);
    } else if (amenity.kind === "toilets") {
      this.addAmenityHalo(amenity.position, 0x61a8d3, 0.52);
    } else if (amenity.kind === "post_box") {
      this.addPostBox(amenity.position, angle);
      this.addAmenityHalo(amenity.position, 0xb43a32, 0.48);
    } else if (amenity.kind === "memorial_plaque") {
      this.addAmenityHalo(amenity.position, 0xd0a343, 0.52);
      } else if (this.isStructureAmenity(amenity)) {
        this.addStructureAccessCue(amenity, angle);
        this.addAmenityHalo(amenity.position, 0xe3a84a, 0.58);
      }
    }
  }

  private addParkLifeDetails(): void {
    for (const detail of this.level.parkLifeDetails) {
      if (detail.kind === "dog-sign") {
        this.addDogAreaSign(detail);
      } else if (detail.kind === "picnic-blanket") {
        this.addPicnicBlanket(detail);
      } else if (detail.kind === "notice-board") {
        this.addNoticeBoard(detail);
      } else if (detail.kind === "broken-bike") {
        continue;
      } else if (detail.kind === "construction-fence") {
        this.addConstructionFence(detail);
      } else if (detail.kind === "works-materials") {
        this.addWorksMaterials(detail);
      } else if (detail.kind === "removed-tree-stump") {
        this.addRemovedTreeStump(detail);
      } else if (detail.kind === "park-rule-sign") {
        this.addParkRuleSign(detail);
      } else if (detail.kind === "training-cones") {
        this.addTrainingCones(detail);
      } else if (detail.kind === "dog-water-bowl") {
        this.addDogWaterBowl(detail);
      } else if (detail.kind === "picnic-cooler") {
        this.addPicnicCooler(detail);
      } else if (detail.kind === "sports-bag") {
        this.addSportsBag(detail);
      } else if (detail.kind === "cricket-nets") {
        this.addCricketNets(detail);
      } else if (detail.kind === "heritage-gas-lamp") {
        this.addHeritageGasLamp(detail);
      } else if (detail.kind === "heritage-bollard") {
        this.addHeritageBollard(detail);
      } else if (detail.kind === "heritage-seat") {
        this.addHeritageSeat(detail);
      } else if (detail.kind === "interpretive-sign") {
        this.addInterpretiveSign(detail);
      } else if (detail.kind === "chandler-fountain") {
        this.addChandlerFountain(detail);
      } else {
        this.addChalkMark(detail);
      }
    }
  }

  private addDogAreaSign(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 0.64, 0.42, 0.12);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.45, 8), this.materials.metal);
    post.position.y = 0.72;
    post.castShadow = true;
    group.add(post);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.06), this.canvasSignMaterial(`dog-area-${detail.id}`, "DOGS", "#315c45", "#f2e6bf"));
    sign.position.y = 1.32;
    sign.castShadow = true;
    group.add(sign);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, 0.06, 1.02, -0.05, 0.48, 0.018, 0.28, 0, -0.12);
    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addParkRuleSign(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const rule = detail.rule ?? "dogs-on-leash";
    const signConfig =
      rule === "alcohol-hours"
        ? { text: "9-9", background: "#5c4630", foreground: "#f4dfa6", width: 1.28 }
        : rule === "rotunda-stairs-no-power"
          ? { text: "STAIRS", background: "#5a4630", foreground: "#f4dfa6", width: 1.55 }
          : rule === "access-friendly"
            ? { text: "ACCESS", background: "#246ca8", foreground: "#f4dfa6", width: 1.5 }
            : { text: "LEASH", background: "#315c45", foreground: "#f4dfa6", width: 1.42 };
    const postMaterial = this.standardDetailMaterial("park-rule-sign-post", 0x4d5954, 0.58, 0.24);
    const panelMaterial = this.canvasSignMaterial(`park-rule-${rule}`, signConfig.text, signConfig.background, signConfig.foreground);
    const paleMaterial = this.basicDetailMaterial("park-rule-pale-symbol", 0xf2e6bf);
    const darkMaterial = this.basicDetailMaterial("park-rule-dark-symbol", 0x1d2522);
    const accentMaterial = this.basicDetailMaterial("park-rule-red-symbol", 0xb84c3c);

    const pad = new THREE.Mesh(
      this.painterlyGeometry(new THREE.CylinderGeometry(0.36, 0.42, 0.06, 14), this.materials.concrete),
      this.materials.concrete
    );
    pad.position.y = 0.03;
    pad.receiveShadow = true;
    group.add(pad);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.42, 8), postMaterial);
    post.position.y = 0.72;
    post.castShadow = true;
    group.add(post);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(signConfig.width, 0.58, 0.075), panelMaterial);
    panel.position.y = 1.36;
    panel.castShadow = true;
    group.add(panel);

    if (rule === "dogs-on-leash") {
      const lead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.035), paleMaterial);
      lead.position.set(-0.18, 1.04, -0.055);
      lead.rotation.z = -0.32;
      group.add(lead);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 6, 16), paleMaterial);
      collar.position.set(0.26, 1.04, -0.058);
      collar.rotation.x = Math.PI / 2;
      group.add(collar);
    } else if (rule === "alcohol-hours") {
      const bottle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.06), paleMaterial);
      bottle.position.set(-0.34, 0.98, -0.055);
      group.add(bottle);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.055), paleMaterial);
      neck.position.set(-0.34, 1.27, -0.058);
      group.add(neck);
      const slash = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 0.055), accentMaterial);
      slash.position.set(0.25, 1.08, -0.06);
      slash.rotation.z = -0.58;
      group.add(slash);
    } else if (rule === "rotunda-stairs-no-power") {
      for (let step = 0; step < 3; step += 1) {
        const stair = new THREE.Mesh(new THREE.BoxGeometry(0.22 + step * 0.16, 0.055, 0.055), paleMaterial);
        stair.position.set(-0.34 + step * 0.16, 0.94 + step * 0.12, -0.055);
        group.add(stair);
      }
      const plug = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.055), darkMaterial);
      plug.position.set(0.34, 1.04, -0.058);
      group.add(plug);
      const slash = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.058), accentMaterial);
      slash.position.set(0.34, 1.04, -0.064);
      slash.rotation.z = -0.62;
      group.add(slash);
    } else if (rule === "access-friendly") {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), paleMaterial);
      disc.position.set(-0.34, 1.08, -0.058);
      group.add(disc);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.055), paleMaterial);
      seat.position.set(-0.18, 0.92, -0.058);
      group.add(seat);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 18), paleMaterial);
      wheel.position.set(0.14, 0.88, -0.058);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
    }

    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addChandlerFountain(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const pinkGranite = this.standardDetailMaterial("chandler-polished-harcourt-granite", 0x9b7468, 0.7, 0.03);
    const rockGranite = this.standardDetailMaterial("chandler-rock-faced-harcourt-granite", 0x77756d, 0.88, 0.02);
    const bluestone = this.standardDetailMaterial("chandler-bluestone-plinth", 0x59666a, 0.9, 0.02);
    const bronze = this.standardDetailMaterial("chandler-fountain-bronze", 0x575f58, 0.44, 0.34);
    const water = this.materials.puddle;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 1.55), bluestone);
    plinth.position.y = 0.08;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.82, 0.84), rockGranite);
    base.position.y = 0.57;
    base.castShadow = true;
    group.add(base);

    const basin = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.34, 0.76), pinkGranite);
    basin.position.y = 1.08;
    basin.castShadow = true;
    group.add(basin);

    // The CMP records two, not four, semicircular bowls. They project from the
    // opposite sides of the square basin and carry small replacement bubblers.
    for (const side of [-1, 1]) {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.27, 0.17, 16), pinkGranite);
      bowl.position.set(side * 0.49, 1.12, 0);
      bowl.scale.z = 0.72;
      bowl.castShadow = true;
      group.add(bowl);
      const basinWater = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.018, 14), water);
      basinWater.position.set(side * 0.49, 1.215, 0);
      group.add(basinWater);
      const bubbler = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.13, 8), bronze);
      bubbler.position.set(side * 0.63, 1.3, 0);
      bubbler.castShadow = true;
      group.add(bubbler);
    }

    const templeBase = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.78), pinkGranite);
    templeBase.position.y = 1.31;
    templeBase.castShadow = true;
    group.add(templeBase);
    for (const x of [-0.25, 0.25]) {
      for (const z of [-0.25, 0.25]) {
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.7, 10), pinkGranite);
        column.position.set(x, 1.7, z);
        column.castShadow = true;
        group.add(column);
      }
    }
    const archMaterial = pinkGranite;
    for (const z of [-0.29, 0.29]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 6, 18, Math.PI), archMaterial);
      arch.position.set(0, 2.02, z);
      arch.castShadow = true;
      group.add(arch);
    }
    for (const x of [-0.29, 0.29]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 6, 18, Math.PI), archMaterial);
      arch.position.set(x, 2.02, 0);
      arch.rotation.y = Math.PI / 2;
      arch.castShadow = true;
      group.add(arch);
    }

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.14, 0.78), pinkGranite);
    cap.position.y = 2.12;
    cap.castShadow = true;
    group.add(cap);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.43, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), pinkGranite);
    dome.position.y = 2.19;
    dome.castShadow = true;
    group.add(dome);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), pinkGranite);
    finial.position.y = 2.68;
    finial.castShadow = true;
    group.add(finial);

    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addHeritageGasLamp(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const iron = this.standardDetailMaterial("heritage-cast-iron", 0x1d2522, 0.54, 0.42);
    const glass = this.standardDetailMaterial("heritage-lamp-warm-glass", 0xf2cf82, 0.24, 0.02, true, 0.82);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.36, 12), iron);
    base.position.y = 0.18;
    base.castShadow = true;
    group.add(base);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.18, 10), iron);
    collar.position.y = 0.48;
    collar.castShadow = true;
    group.add(collar);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 2.75, 10), iron);
    post.position.y = 1.78;
    post.castShadow = true;
    group.add(post);
    for (const y of [0.92, 1.48, 2.04]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 6, 20), iron);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }
    for (const side of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.045), iron);
      brace.position.set(side * 0.18, 2.88, 0);
      brace.rotation.z = side * 0.64;
      brace.castShadow = true;
      group.add(brace);
    }
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.46), glass);
    lantern.position.y = 3.22;
    lantern.castShadow = true;
    group.add(lantern);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.22, 4), iron);
    roof.position.y = 3.62;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    const glow = new THREE.PointLight(0xf0c96a, 0.82, 24);
    glow.position.y = 3.22;
    group.add(glow);
    this.lampLights.push(glow);

    this.addPaintedLightPool(group, 5.2, 3.15, 0, 0.08, "heritage-lamp-ground-spill");

    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addHeritageBollard(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const iron = this.standardDetailMaterial("fitzroy-cast-iron-bollard", 0x202622, 0.52, 0.36);
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.72, 10), iron);
    bollard.position.y = 0.36;
    bollard.castShadow = true;
    group.add(bollard);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), iron);
    cap.position.y = 0.78;
    cap.castShadow = true;
    group.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 16), iron);
    ring.position.y = 0.55;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addHeritageSeat(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const timber = this.materials.timber;
    const iron = this.standardDetailMaterial("heritage-seat-iron-frame", 0x25302c, 0.56, 0.32);
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 1.78, 0.76, 0.13, 0.018, 0.04);
    const pad = new THREE.Mesh(
      this.painterlyGeometry(new THREE.BoxGeometry(3.2, 0.045, 1.25), this.materials.concrete),
      this.materials.concrete
    );
    pad.position.y = 0.025;
    pad.receiveShadow = true;
    group.add(pad);
    for (const z of [-0.32, -0.1, 0.12]) {
      const slat = new THREE.Mesh(this.painterlyGeometry(new THREE.BoxGeometry(2.82, 0.09, 0.12), timber), timber);
      slat.position.set(0, 0.62, z);
      slat.castShadow = true;
      group.add(slat);
      this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, 0.18, 0.685, z - 0.065, 1.6, 0.016, 0.14, 0, 0.03);
    }
    for (const y of [0.9, 1.1, 1.3]) {
      const back = new THREE.Mesh(this.painterlyGeometry(new THREE.BoxGeometry(2.82, 0.09, 0.12), timber), timber);
      back.position.set(0, y, 0.43);
      back.rotation.x = -0.22;
      back.castShadow = true;
      group.add(back);
      this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, -0.2, y + 0.04, 0.35, 1.48, 0.016, 0.12, 0, -0.02);
    }
    for (const x of [-1.16, 1.16]) {
      const side = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 20, Math.PI * 1.08), iron);
      side.position.set(x, 0.58, 0.1);
      side.rotation.set(Math.PI / 2, 0, Math.PI * 0.07);
      group.add(side);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), iron);
      leg.position.set(x, 0.38, -0.34);
      leg.castShadow = true;
      group.add(leg);
    }
    group.position.set(detail.position.x, this.boxSupportY(detail.position, detail.angle, 1.65, 0.68), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addInterpretiveSign(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const postMaterial = this.standardDetailMaterial("interpretive-sign-post", 0x4d5954, 0.58, 0.24);
    const panelMaterial = this.canvasSignMaterial(`interpretive-${detail.id}`, "HISTORY", "#33453d", "#f2e6a8");
    const mapMaterial = this.basicDetailMaterial("interpretive-map-panel", 0xd8ceaa);
    for (const x of [-0.5, 0.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.2, 8), postMaterial);
      post.position.set(x, 0.6, 0);
      post.castShadow = true;
      group.add(post);
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.78, 0.08), panelMaterial);
    panel.position.y = 1.28;
    panel.castShadow = true;
    group.add(panel);
    const inset = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.32, 0.085), mapMaterial);
    inset.position.set(0, 1.1, -0.048);
    group.add(inset);
    for (const y of [1.02, 1.12, 1.22]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.025, 0.09), this.basicDetailMaterial("interpretive-text-lines", 0x374239));
      line.position.set(0, y, -0.095);
      group.add(line);
    }
    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addPicnicBlanket(detail: ParkLifeDetail): void {
    const blanketMaterial = new THREE.MeshStandardMaterial({ color: 0x9f5347, roughness: 0.88 });
    const trimMaterial = new THREE.MeshBasicMaterial({ color: 0xe4d4a4, transparent: true, opacity: 0.82 });
    const blanket = this.createTerrainRect(detail.position, detail.angle, 3.25, 2.15, 0.092, 0.018, blanketMaterial);
    blanket.receiveShadow = true;
    this.scene.add(blanket);
    for (const offset of [-0.72, 0, 0.72]) {
      const stripeCenter = this.localPoint(detail.position, detail.angle, offset, 0);
      const stripe = this.createTerrainRect(stripeCenter, detail.angle + Math.PI / 2, 2.0, 0.07, 0.112, 0.012, trimMaterial);
      this.scene.add(stripe);
    }
    this.addLocalBox(detail.position, detail.angle, 1.22, -0.58, 0.42, 0.32, 0.36, this.materials.timber, 0.22);
    this.addLocalCylinder(detail.position, detail.angle, -1.12, 0.62, 0.16, 0.18, 0.12, this.materials.line);
  }

  private addNoticeBoard(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 1.02, 0.48, 0.13);
    const frame = this.standardDetailMaterial("notice-board-frame", 0x4c3926, 0.78, 0.03);
    const board = this.standardDetailMaterial("notice-board-green", 0x244734, 0.72, 0.04);
    for (const x of [-0.62, 0.62]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.75, 0.08), frame);
      post.position.set(x, 0.88, 0);
      post.castShadow = true;
      group.add(post);
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.92, 0.08), board);
    panel.position.y = 1.36;
    panel.castShadow = true;
    group.add(panel);
    for (const y of [1.22, 1.42, 1.58]) {
      const notice = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.07, 0.012), new THREE.MeshBasicMaterial({ color: 0xe6d7a8, transparent: true, opacity: 0.86 }));
      notice.position.set(0, y, -0.048);
      group.add(notice);
    }
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, -0.08, 1.78, -0.05, 1.18, 0.024, 0.2, 0, -0.04);
    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addBrokenBike(detail: ParkLifeDetail): void {
    const group = new MeshFactory(this.materials).createBikeMesh({ issue: detail.bikeIssue });
    group.scale.setScalar(1.15);
    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addConstructionFence(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const isGrandstand = detail.id.includes("grandstand");
    const length = isGrandstand ? 5.8 : 8.8;
    const meshMaterial = this.standardDetailMaterial("works-orange-mesh", 0xe36e2f, 0.72, 0.02, true, 0.32);
    meshMaterial.side = THREE.DoubleSide;
    const railMaterial = this.standardDetailMaterial("works-fence-rail", 0x4d5551, 0.58, 0.32);
    const signMaterial = this.canvasSignMaterial("works-site-sign", "WORKS", "#e36e2f", "#18110b");

    const panel = new THREE.Mesh(new THREE.BoxGeometry(length, 1.15, 0.035), meshMaterial);
    panel.position.y = 0.82;
    panel.castShadow = false;
    group.add(panel);

    for (const y of [0.34, 1.24]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.08), railMaterial);
      rail.position.y = y;
      rail.castShadow = true;
      group.add(rail);
    }

    const postCount = Math.max(2, Math.floor(length / 1.85));
    for (let postIndex = 0; postIndex <= postCount; postIndex += 1) {
      const x = -length * 0.5 + (length * postIndex) / postCount;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.48, 8), railMaterial);
      post.position.set(x, 0.74, 0);
      post.castShadow = true;
      group.add(post);
    }

    for (const x of [-length * 0.28, length * 0.24]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(length * 0.28, 0.055, 0.055), railMaterial);
      brace.position.set(x, 0.79, -0.035);
      brace.rotation.z = x < 0 ? 0.42 : -0.42;
      brace.castShadow = true;
      group.add(brace);
    }

    const sign = new THREE.Mesh(new THREE.BoxGeometry(isGrandstand ? 1.65 : 1.9, 0.54, 0.055), signMaterial);
    sign.position.set(isGrandstand ? 0 : -length * 0.24, 1.18, -0.065);
    group.add(sign);

    if (isGrandstand) {
      const gateBar = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.1), railMaterial);
      gateBar.position.set(0, 0.72, -0.12);
      group.add(gateBar);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.08), this.materials.metal);
      lock.position.set(0.38, 0.86, -0.17);
      group.add(lock);
    }

    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addWorksMaterials(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const rollMaterial = this.standardDetailMaterial("synthetic-court-roll", 0x3f8068, 0.64, 0.04);
    const rollEndMaterial = this.basicDetailMaterial("synthetic-court-roll-end", 0xe7e1c4);
    const strapMaterial = this.standardDetailMaterial("works-roll-strap", 0x202b2d, 0.72, 0.16);
    const palletMaterial = this.standardDetailMaterial("works-pallet-timber", 0x8c613d, 0.8, 0.02);

    const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 1.3), palletMaterial);
    pallet.position.y = 0.08;
    pallet.castShadow = true;
    group.add(pallet);

    for (let rollIndex = 0; rollIndex < 3; rollIndex += 1) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.35, 16), rollMaterial);
      roll.position.set(0, 0.4 + rollIndex * 0.34, (rollIndex - 1) * 0.36);
      roll.rotation.z = Math.PI / 2;
      roll.castShadow = true;
      group.add(roll);

      for (const x of [-1.2, 1.2]) {
        const end = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), rollEndMaterial);
        end.position.set(x, roll.position.y, roll.position.z);
        end.rotation.y = Math.PI / 2;
        group.add(end);
      }

      for (const x of [-0.72, 0.72]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.62), strapMaterial);
        strap.position.set(x, roll.position.y, roll.position.z);
        strap.castShadow = true;
        group.add(strap);
      }
    }

    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.42, 0.055), this.canvasSignMaterial("court-rolls-sign", "COURTS", "#223f64", "#f2e6a8"));
    sign.position.set(0.68, 1.65, -0.72);
    sign.rotation.y = -0.2;
    group.add(sign);

    group.position.set(detail.position.x, this.boxSupportY(detail.position, detail.angle, 1.45, 0.8), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addRemovedTreeStump(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const barkMaterial = this.standardDetailMaterial("redevelopment-stump-bark", 0x6f5137, 0.88, 0.02);
    const cutMaterial = this.standardDetailMaterial("redevelopment-stump-cut", 0xb99564, 0.82, 0.02);
    const sawdustMaterial = this.standardDetailMaterial("redevelopment-sawdust", 0xb59a66, 0.94, 0, true, 0.58);

    const sawdust = new THREE.Mesh(new THREE.CircleGeometry(0.92, 22), sawdustMaterial);
    sawdust.rotation.x = -Math.PI / 2;
    sawdust.position.y = 0.035;
    sawdust.receiveShadow = true;
    group.add(sawdust);

    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.42, 0.44, 10), barkMaterial);
    stump.position.y = 0.24;
    stump.castShadow = true;
    stump.receiveShadow = true;
    group.add(stump);

    const cut = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.035, 10), cutMaterial);
    cut.position.y = 0.48;
    cut.castShadow = true;
    group.add(cut);

    for (let rootIndex = 0; rootIndex < 4; rootIndex += 1) {
      const root = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.18), barkMaterial);
      const angle = rootIndex * (Math.PI / 2) + detail.angle * 0.18;
      root.position.set(Math.cos(angle) * 0.42, 0.08, Math.sin(angle) * 0.42);
      root.rotation.y = -angle;
      root.castShadow = true;
      group.add(root);
    }

    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addRideableBikePreview(sourceId = this.level.rideableBike.id): void {
    const bike = this.level.rideableBikes.find((candidate) => candidate.id === sourceId) ?? this.level.rideableBike;
    const group = new MeshFactory(this.materials).createBikeMesh({ issue: bike.state === "available" ? undefined : bike.state });
    group.scale.setScalar(1.45);
    group.position.set(bike.position.x, this.groundY(bike.position), bike.position.z);
    group.rotation.y = bike.angle;
    this.scene.add(group);
  }

  private addItemSpawnPreview(target: ObjectPreviewTarget): void {
    if (!target.itemId) return;
    const spawn = this.level.itemSpawns.find((candidate) => candidate.id === target.sourceId);
    const group = new MeshFactory(this.materials).createWorldItemMesh(target.itemId);
    group.position.set(target.position.x, this.groundY(target.position), target.position.z);
    group.rotation.y = spawn?.angle ?? 0;
    if (target.itemId === "ladder") {
      group.rotation.x = -0.42;
      group.position.y += 0.18;
    }
    this.scene.add(group);
  }

  private addTrainingCones(detail: ParkLifeDetail): void {
    const coneMaterial = this.standardDetailMaterial("training-cone-vermilion", 0xd6632e, 0.62, 0.02);
    const stripeMaterial = this.basicDetailMaterial("training-cone-pale-stripe", 0xf2e6bf);
    for (let index = 0; index < 6; index += 1) {
      const localX = (index - 2.5) * 0.82;
      const localZ = Math.sin(index * 1.7) * 0.32;
      const point = this.localPoint(detail.position, detail.angle, localX, localZ);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.44, 8), coneMaterial);
      cone.position.set(point.x, this.groundY(point) + 0.22, point.z);
      cone.castShadow = true;
      this.scene.add(cone);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.025, 8), stripeMaterial);
      stripe.position.set(point.x, this.groundY(point) + 0.28, point.z);
      stripe.castShadow = false;
      this.scene.add(stripe);
    }
  }

  private addDogWaterBowl(detail: ParkLifeDetail): void {
    const groundY = this.groundY(detail.position);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.56, 18), this.washDetailMaterial("dog-bowl-shadow", MELBOURNE_ANIME_PALETTE.bluestoneShadow, 0.16));
    shadow.position.set(detail.position.x, groundY + 0.018, detail.position.z);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.18, 0.72, 1);
    this.scene.add(shadow);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.16, 18), this.materials.metal);
    bowl.position.set(detail.position.x, groundY + 0.08, detail.position.z);
    bowl.castShadow = true;
    this.scene.add(bowl);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.018, 18), this.materials.puddle);
    water.position.set(detail.position.x, groundY + 0.17, detail.position.z);
    this.scene.add(water);
  }

  private addPicnicCooler(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 0.74, 0.46, 0.16);
    const bodyMaterial = this.standardDetailMaterial("picnic-cooler-teal", 0x4f8f9a, 0.66, 0.04);
    const lidMaterial = this.standardDetailMaterial("picnic-cooler-lid", 0xe6dfc8, 0.58, 0.02);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.48, 0.58), bodyMaterial);
    body.position.y = 0.28;
    body.castShadow = true;
    group.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.64), lidMaterial);
    lid.position.y = 0.58;
    lid.castShadow = true;
    group.add(lid);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 8, 18), this.materials.metal);
    handle.position.y = 0.74;
    handle.rotation.x = Math.PI / 2;
    group.add(handle);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.06, 0.42, -0.31, 0.54, 0.018, 0.24, 0, -0.04);
    group.position.set(detail.position.x, this.boxSupportY(detail.position, detail.angle, 0.52, 0.33), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addSportsBag(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 0.9, 0.48, 0.17, 0.018, -0.1);
    const bagMaterial = this.standardDetailMaterial("sports-bag-blue", 0x293a4d, 0.78, 0.03);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.58), bagMaterial);
    bag.position.y = 0.26;
    bag.castShadow = true;
    group.add(bag);
    for (const x of [-0.32, 0.32]) {
      const strap = new THREE.Mesh(
        this.painterlyGeometry(new THREE.TorusGeometry(0.26, 0.022, 6, 14), this.materials.timber),
        this.materials.timber
      );
      strap.position.set(x, 0.48, 0);
      strap.rotation.x = Math.PI / 2;
      strap.scale.z = 0.55;
      group.add(strap);
    }
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.035), this.canvasSignMaterial("sports-bag-tag", "FC", "#263d45", "#efd18a"));
    tag.position.set(-0.42, 0.34, -0.32);
    group.add(tag);
    group.position.set(detail.position.x, this.boxSupportY(detail.position, detail.angle, 0.65, 0.32), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addCricketNets(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const netMaterial = new THREE.MeshBasicMaterial({ color: 0x23332d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const netLineMaterial = new THREE.LineBasicMaterial({ color: 0xd2dbd2, transparent: true, opacity: 0.5 });
    const frameMaterial = this.standardDetailMaterial("cricket-nets-galvanised-frame", 0x5f6966, 0.48, 0.38);
    const turfMaterial = this.standardDetailMaterial("cricket-nets-artificial-turf", 0x4b8f68, 0.88, 0.02);
    const concreteMaterial = this.standardDetailMaterial("cricket-nets-concrete-pad", 0x8b9189, 0.82, 0.04);
    const creaseMaterial = this.basicDetailMaterial("cricket-nets-crease-lines", 0xe7eadc);
    const muralBlue = this.basicDetailMaterial("cricket-nets-mural-blue", 0x274d7e);
    const muralGold = this.basicDetailMaterial("cricket-nets-mural-gold", 0xd0a13a);
    const muralGreen = this.basicDetailMaterial("cricket-nets-mural-green", 0x3d7151);
    const laneCount = detail.cricketNetLanes ?? 4;
    const width = 12.4;
    const length = 14.8;
    const height = 3.2;
    const lobbyLength = 2.55;
    const halfWidth = width * 0.5;
    const halfLength = length * 0.5;
    const laneWidth = width / laneCount;
    const dividerStart = -halfLength + lobbyLength;

    const addBox = (localX: number, y: number, localZ: number, boxWidth: number, boxHeight: number, boxDepth: number, material: THREE.Material, shadow = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth), material);
      mesh.position.set(localX, y, localZ);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    addBox(0, 0.025, 0, width + 0.8, 0.05, length + 1.05, concreteMaterial, false);
    addBox(0, 0.055, -halfLength - 1.35, width + 0.5, 0.04, 2.25, turfMaterial, false);

    for (let lane = 0; lane < laneCount; lane += 1) {
      const x = -halfWidth + laneWidth * (lane + 0.5);
      addBox(x, 0.085, 0.2, laneWidth * 0.78, 0.045, length * 0.84, turfMaterial, false);
      for (const z of [-halfLength + 2.15, halfLength - 1.95]) {
        addBox(x, 0.13, z, laneWidth * 0.56, 0.025, 0.055, creaseMaterial, false);
        for (const stumpX of [-0.16, 0, 0.16]) {
          addBox(x + stumpX, 0.34, z + 0.2, 0.035, 0.52, 0.035, frameMaterial);
        }
      }
    }

    const addPost = (localX: number, localZ: number, postHeight = height) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, postHeight, 8), frameMaterial);
      post.position.set(localX, postHeight * 0.5, localZ);
      post.castShadow = true;
      group.add(post);
    };
    for (const x of [-halfWidth, halfWidth]) {
      addPost(x, -halfLength);
      addPost(x, halfLength);
    }
    for (let lane = 1; lane < laneCount; lane += 1) {
      const x = -halfWidth + laneWidth * lane;
      addPost(x, dividerStart);
      addPost(x, halfLength);
    }
    for (const x of [-halfWidth, halfWidth]) {
      for (const z of [-halfLength + length * 0.25, 0, halfLength - length * 0.25]) {
        addPost(x, z);
      }
    }

    const addPanel = (localX: number, y: number, localZ: number, panelWidth: number, panelHeight: number, panelDepth: number) => {
      addBox(localX, y, localZ, panelWidth, panelHeight, panelDepth, netMaterial, false);
    };
    addPanel(-halfWidth, height * 0.5, 0, 0.035, height, length);
    addPanel(halfWidth, height * 0.5, 0, 0.035, height, length);
    addPanel(0, height * 0.5, halfLength, width, height, 0.035);
    addPanel(0, height + 0.01, 0, width, 0.025, length);
    for (let lane = 1; lane < laneCount; lane += 1) {
      const x = -halfWidth + laneWidth * lane;
      addPanel(x, height * 0.5, (dividerStart + halfLength) * 0.5, 0.03, height, halfLength - dividerStart);
    }

    const linePoints: THREE.Vector3[] = [];
    const addWallGridX = (x: number, z1: number, z2: number) => {
      for (const y of [0.55, 1.1, 1.65, 2.2, 2.75, height]) {
        linePoints.push(new THREE.Vector3(x, y, z1), new THREE.Vector3(x, y, z2));
      }
      for (let step = 0; step <= 6; step += 1) {
        const z = z1 + ((z2 - z1) * step) / 6;
        linePoints.push(new THREE.Vector3(x, 0.18, z), new THREE.Vector3(x, height, z));
      }
    };
    const addWallGridZ = (z: number, x1: number, x2: number) => {
      for (const y of [0.55, 1.1, 1.65, 2.2, 2.75, height]) {
        linePoints.push(new THREE.Vector3(x1, y, z), new THREE.Vector3(x2, y, z));
      }
      for (let step = 0; step <= Math.max(1, Math.round((x2 - x1) / 1.55)); step += 1) {
        const x = x1 + ((x2 - x1) * step) / Math.max(1, Math.round((x2 - x1) / 1.55));
        linePoints.push(new THREE.Vector3(x, 0.18, z), new THREE.Vector3(x, height, z));
      }
    };
    addWallGridX(-halfWidth, -halfLength, halfLength);
    addWallGridX(halfWidth, -halfLength, halfLength);
    addWallGridZ(halfLength, -halfWidth, halfWidth);
    for (let lane = 1; lane < laneCount; lane += 1) {
      addWallGridX(-halfWidth + laneWidth * lane, dividerStart, halfLength);
    }
    for (let step = 0; step <= 6; step += 1) {
      const z = -halfLength + (length * step) / 6;
      linePoints.push(new THREE.Vector3(-halfWidth, height, z), new THREE.Vector3(halfWidth, height, z));
    }
    for (let lane = 0; lane <= laneCount; lane += 1) {
      const x = -halfWidth + laneWidth * lane;
      linePoints.push(new THREE.Vector3(x, height, -halfLength), new THREE.Vector3(x, height, halfLength));
    }
    const netLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePoints), netLineMaterial);
    group.add(netLines);

    const addRail = (localX: number, y: number, localZ: number, railWidth: number, railHeight: number, railDepth: number) => {
      addBox(localX, y, localZ, railWidth, railHeight, railDepth, frameMaterial);
    };
    for (const x of [-halfWidth, halfWidth]) {
      addRail(x, height, 0, 0.08, 0.08, length);
    }
    addRail(0, height, halfLength, width, 0.08, 0.08);

    addBox(0, 0.42, halfLength + 0.12, width * 0.9, 0.78, 0.18, concreteMaterial);
    for (const [index, material] of [muralBlue, muralGold, muralGreen, muralBlue].entries()) {
      addBox(-width * 0.34 + index * width * 0.225, 0.72, halfLength + 0.005, width * 0.15, 0.28, 0.035, material, false);
    }
    const wallTag = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 0.04), this.canvasSignMaterial("cricket-nets-ecc-tag", "ECC", "#263d45", "#efd18a"));
    wallTag.position.set(0, 0.82, halfLength - 0.012);
    group.add(wallTag);
    addBox(0, 0.06, -halfLength - 0.08, width, 0.03, 0.28, creaseMaterial, false);

    group.position.set(detail.position.x, this.boxSupportY(detail.position, detail.angle, width * 0.5, length * 0.5), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addChalkMark(detail: ParkLifeDetail): void {
    const chalkMaterial = new THREE.MeshBasicMaterial({ color: 0xe8e2c7, transparent: true, opacity: 0.58 });
    for (let mark = 0; mark < 3; mark += 1) {
      const center = this.localPoint(detail.position, detail.angle, (mark - 1) * 0.36, Math.sin(mark) * 0.24);
      const line = this.createTerrainRect(center, detail.angle + mark * 0.72, 1.25 - mark * 0.18, 0.045, 0.164, 0.01, chalkMaterial);
      this.scene.add(line);
    }
  }

  private addPathLights(): void {
    const used = new Set<string>();
    let placed = 0;
    this.renderedLampSpillCount = 0;
    for (const path of this.level.paths.filter((candidate) => candidate.kind !== "footway" && candidate.kind !== "steps" && candidate.kind !== "service")) {
      if (placed >= 34) break;
      for (let i = 0; i < path.points.length - 1; i += 1) {
        if (placed >= 34) break;
        const a = path.points[i];
        const b = path.points[i + 1];
        const segmentLength = distance(a, b);
        const count = Math.floor(segmentLength / 88);
        if (count === 0) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const normalLength = Math.hypot(dx, dz) || 1;
        const offset = path.kind === "rail" ? 3.5 : 2.6;

        for (let step = 1; step <= count; step += 1) {
          const t = step / (count + 1);
          const side = (i + step) % 2 === 0 ? 1 : -1;
          const x = a.x + dx * t + (-dz / normalLength) * offset * side;
          const z = a.z + dz * t + (dx / normalLength) * offset * side;
          const key = `${Math.round(x / 16)}:${Math.round(z / 16)}`;
          if (used.has(key) || !pointInPolygon({ x, z }, this.level.boundary)) continue;
          used.add(key);
          this.addLampPost({ x, z }, Math.atan2(dz, dx), true);
          placed += 1;
          if (placed >= 34) break;
        }
      }
    }
  }

  private addLampPost(position: Vec2, angle: number, activeLight = true): void {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 8), this.materials.metal);
    post.position.y = 1.8;
    post.castShadow = true;
    group.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), this.materials.metal);
    arm.position.set(0, 3.45, -0.42);
    arm.castShadow = true;
    group.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf0d99b }));
    lamp.position.set(0, 3.32, -0.9);
    group.add(lamp);
    if (activeLight) {
      const glow = new THREE.PointLight(0xf0c96a, 0.72, 22);
      glow.position.set(0, 3.25, -0.9);
      group.add(glow);
      this.lampLights.push(glow);

      this.addPaintedLightPool(group, 6.2, 3.55, -0.9, -0.12, "lamp-ground-spill");
    }
    group.position.set(position.x, this.groundY(position), position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private addBench(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 1.85, 0.72, 0.12, 0.018, -0.08);
    const pad = new THREE.Mesh(
      this.painterlyGeometry(new THREE.BoxGeometry(3.2, 0.06, 1.55), this.materials.concrete),
      this.materials.concrete
    );
    pad.position.y = 0.035;
    pad.receiveShadow = true;
    group.add(pad);
    for (const z of [-0.22, 0, 0.22]) {
      const slat = new THREE.Mesh(
        this.painterlyGeometry(new THREE.BoxGeometry(2.72, 0.11, 0.12), this.materials.timber),
        this.materials.timber
      );
      slat.position.set(0, 0.72, z);
      slat.castShadow = true;
      group.add(slat);
      this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.24, 0.79, z - 0.065, 1.72, 0.018, 0.16, 0, 0.02);
    }
    for (const y of [0.96, 1.18]) {
      const back = new THREE.Mesh(
        this.painterlyGeometry(new THREE.BoxGeometry(2.72, 0.12, 0.14), this.materials.timber),
        this.materials.timber
      );
      back.position.set(0, y, 0.43);
      back.rotation.x = -0.18;
      back.castShadow = true;
      group.add(back);
      this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, 0.26, y + 0.045, 0.34, 1.46, 0.018, 0.12, 0, -0.03);
    }
    for (const x of [-0.92, 0.92]) {
      for (const z of [-0.2, 0.28]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), this.materials.metal);
        leg.position.set(x, 0.33, z);
        leg.castShadow = true;
        group.add(leg);
      }
    }
    group.position.set(position.x, this.boxSupportY(position, angle, 1.6, 0.78), position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private addPicnicTable(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 1.95, 1.28, 0.12, 0.018, 0.12);
    const pad = new THREE.Mesh(
      this.painterlyGeometry(new THREE.BoxGeometry(3.35, 0.055, 2.45), this.materials.concrete),
      this.materials.concrete
    );
    pad.position.y = 0.032;
    pad.receiveShadow = true;
    group.add(pad);
    const top = new THREE.Mesh(
      this.painterlyGeometry(new THREE.BoxGeometry(2.4, 0.14, 0.72), this.materials.timber),
      this.materials.timber
    );
    top.position.y = 0.82;
    top.castShadow = true;
    group.add(top);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.1, 0.91, -0.34, 1.75, 0.022, 0.18, 0, 0.02);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.eucalyptus, 0.12, 0.92, 0.34, 1.42, 0.02, 0.16, 0, -0.04);
    for (const z of [-0.85, 0.85]) {
      const bench = new THREE.Mesh(
        this.painterlyGeometry(new THREE.BoxGeometry(2.1, 0.12, 0.32), this.materials.timber),
        this.materials.timber
      );
      bench.position.set(0, 0.52, z);
      bench.castShadow = true;
      group.add(bench);
      this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, 0.18, 0.59, z - 0.17, 1.1, 0.018, 0.13, 0, z < 0 ? -0.03 : 0.03);
    }
    for (const x of [-0.72, 0.72]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.12), this.materials.metal);
      leg.position.set(x, 0.38, 0);
      leg.rotation.z = x < 0 ? -0.18 : 0.18;
      leg.castShadow = true;
      group.add(leg);
    }
    group.position.set(position.x, this.boxSupportY(position, angle, 1.68, 1.23), position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private addTableTennis(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 2.25, 1.42, 0.13, 0.018, -0.16);
    const pad = new THREE.Mesh(
      this.painterlyGeometry(new THREE.BoxGeometry(4.2, 0.055, 2.8), this.materials.concrete),
      this.materials.concrete
    );
    pad.position.y = 0.032;
    pad.receiveShadow = true;
    group.add(pad);
    const tableMaterial = this.standardDetailMaterial("painted-table-tennis-top", 0x2f6b65, 0.6, 0.04);
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.12, 1.53), tableMaterial);
    table.position.y = 0.78;
    table.castShadow = true;
    group.add(table);
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 1.62), new THREE.MeshBasicMaterial({ color: 0xe9eee2, transparent: true, opacity: 0.78 }));
    net.position.y = 1.03;
    group.add(net);
    for (const x of [-1.33, 0, 1.33]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 1.55), this.materials.line);
      line.position.set(x, 0.855, 0);
      group.add(line);
    }
    const centre = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.018, 0.035), this.materials.line);
    centre.position.set(0, 0.858, 0);
    group.add(centre);
    for (const x of [-1.05, 1.05]) {
      for (const z of [-0.52, 0.52]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.76, 6), this.materials.metal);
        leg.position.set(x, 0.38, z);
        leg.castShadow = true;
        group.add(leg);
      }
    }
    for (const x of [-1.85, 1.85]) {
      const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 18), this.standardDetailMaterial("table-tennis-paddle-brick", MELBOURNE_ANIME_PALETTE.brick, 0.58, 0.02));
      paddle.position.set(x, 0.19, -0.9);
      paddle.rotation.x = Math.PI / 2;
      paddle.castShadow = true;
      group.add(paddle);
    }
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.35, 0.868, -0.42, 0.72, 0.018, 0.28, 0, -0.05);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, 0.58, 0.87, 0.46, 0.58, 0.016, 0.2, 0, 0.08);
    group.position.set(position.x, this.boxSupportY(position, angle, 2.1, 1.4), position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private addWasteBasket(position: Vec2): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 0.66, 0.48, 0.16);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.9, 12), this.standardDetailMaterial("waste-basket-bluegum", 0x2e4a3a, 0.82, 0.04));
    body.position.y = 0.45;
    body.castShadow = true;
    group.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 12), this.materials.metal);
    lid.position.y = 0.94;
    lid.castShadow = true;
    group.add(lid);
    const sticker = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.045), this.canvasSignMaterial("waste-basket-sticker", "BIN", "#315c45", "#f2e6bf"));
    sticker.position.set(0, 0.52, -0.35);
    group.add(sticker);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.05, 0.78, -0.37, 0.48, 0.018, 0.18, 0, -0.04);
    group.position.set(position.x, this.groundY(position), position.z);
    group.rotation.y = this.angleFromPoint(position);
    this.scene.add(group);
  }

  private addPostBox(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.brick, 0.7, 0.52, 0.18);
    const red = this.standardDetailMaterial("park-post-box-red", 0xb43a32, 0.66, 0.08);
    const dark = this.basicDetailMaterial("park-post-box-slot", 0x201a18);
    const label = this.canvasSignMaterial("park-post-box-label", "POST", "#f0e2b8", "#7a2621");
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.12, 0.42), red);
    body.position.y = 0.58;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.54), red);
    cap.position.y = 1.22;
    cap.castShadow = true;
    group.add(cap);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.055, 0.035), dark);
    slot.position.set(0, 0.98, -0.235);
    group.add(slot);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.028), label);
    plate.position.set(0, 0.75, -0.258);
    group.add(plate);
    const foot = new THREE.Mesh(
      this.painterlyGeometry(new THREE.BoxGeometry(0.72, 0.08, 0.54), this.materials.basalt),
      this.materials.basalt
    );
    foot.position.y = 0.04;
    foot.receiveShadow = true;
    group.add(foot);
    group.position.set(position.x, this.boxSupportY(position, angle, 0.42, 0.32), position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private addDrinkingFountain(position: Vec2): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.stormTeal, 0.74, 0.5, 0.14);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.15, 12), this.standardDetailMaterial("drinking-fountain-teal", 0x496e76, 0.62, 0.08));
    post.position.y = 0.58;
    post.castShadow = true;
    group.add(post);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.32, 0.18, 16), this.materials.metal);
    basin.position.set(0, 1.12, -0.22);
    basin.castShadow = true;
    group.add(basin);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.32), this.materials.metal);
    spout.position.set(0, 1.28, -0.52);
    spout.castShadow = true;
    group.add(spout);
    this.addLocalPaintStroke(group, MELBOURNE_ANIME_PALETTE.wetBluestone, 0, 0.88, -0.2, 0.36, 0.02, 0.34, 0, 0.08);
    const glow = new THREE.PointLight(0x5fc6d6, 0.45, 9);
    glow.position.set(0, 1.25, -0.45);
    group.add(glow);
    group.position.set(position.x, this.groundY(position), position.z);
    group.rotation.y = this.angleFromPoint(position);
    this.scene.add(group);
  }

  private addBikeRack(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    for (const x of [-0.72, 0, 0.72]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 8, 18, Math.PI), this.materials.metal);
      hoop.position.set(x, 0.48, 0);
      hoop.rotation.z = Math.PI;
      hoop.scale.y = 1.22;
      hoop.castShadow = true;
      group.add(hoop);
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.5, 8), this.materials.metal);
        leg.position.set(x + side * 0.38, 0.25, 0);
        leg.castShadow = true;
        group.add(leg);
      }
    }
    group.position.set(position.x, this.boxSupportY(position, angle, 1.15, 0.45), position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private addSupplyCrate(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    this.addLocalBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 0.9, 0.6, 0.16);
    const crateMaterial = this.standardDetailMaterial("bbq-supply-crate", 0x80603b, 0.8, 0.03);
    const bandMaterial = this.standardDetailMaterial("bbq-supply-crate-band", MELBOURNE_ANIME_PALETTE.tramOchre, 0.74, 0.02);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.95), crateMaterial);
    crate.position.y = 0.38;
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);
    for (const x of [-0.44, 0.44]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.76, 1.0), bandMaterial);
      band.position.set(x, 0.39, 0);
      band.castShadow = true;
      group.add(band);
    }
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.24, 0.045), this.canvasSignMaterial("bbq-supply-label", "BBQ", "#5c4630", "#f2e6bf"));
    label.position.set(0, 0.46, -0.5);
    group.add(label);
    group.position.set(position.x, this.boxSupportY(position, angle, 0.65, 0.48), position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private isStructureAmenity(amenity: AmenityPoint): boolean {
    return (
      amenity.kind === "clubroom" ||
      amenity.kind === "changeroom" ||
      amenity.kind === "umpire_room" ||
      amenity.kind === "first_aid_room" ||
      amenity.kind === "gatehouse" ||
      amenity.kind === "maintenance_room" ||
      amenity.kind === "community_room" ||
      amenity.kind === "kitchenette" ||
      amenity.kind === "kiosk_hatch" ||
      amenity.kind === "utility_box"
    );
  }

  private structureAccessAngle(amenity: AmenityPoint): number {
    const building = amenity.linkedStructureId
      ? this.level.mappedBuildings.find((candidate) => candidate.id === amenity.linkedStructureId)
      : undefined;
    if (building) {
      return -this.fitBoxFromPolygon(building.polygon, 0, 0, building.facade?.frontagePoint).angle;
    }
    const landmark = amenity.linkedStructureId
      ? this.level.landmarks.find((candidate) => candidate.id === amenity.linkedStructureId && candidate.polygon)
      : undefined;
    if (landmark?.polygon) {
      return -this.fitBoxFromPolygon(landmark.polygon, 0, 0).angle;
    }
    return this.angleFromId(amenity.id);
  }

  private structureAccessRenderPosition(amenity: AmenityPoint): Vec2 {
    const building = amenity.linkedStructureId
      ? this.level.mappedBuildings.find((candidate) => candidate.id === amenity.linkedStructureId)
      : undefined;
    if (building) return nearestPointOnPolygon(amenity.position, building.polygon);
    const landmark = amenity.linkedStructureId
      ? this.level.landmarks.find((candidate) => candidate.id === amenity.linkedStructureId && candidate.polygon)
      : undefined;
    return landmark?.polygon ? nearestPointOnPolygon(amenity.position, landmark.polygon) : amenity.position;
  }

  private addStructureAccessCue(amenity: AmenityPoint, angle: number): void {
    // Interior facilities share the documented external room entrance. Do not
    // put appliances or a second invented doorway on the lawn, and do not add
    // a fake door to the entrance pavilion's real open passage.
    if (amenity.kind === "kitchenette" || amenity.kind === "gatehouse") return;

    const position = this.structureAccessRenderPosition(amenity);
    const panelColor = this.structureAccessPanelColor(amenity.kind);
    const panelMaterial = this.standardDetailMaterial(`structure-access-${amenity.kind}`, panelColor, 0.72, 0.08);
    const latchMaterial = this.standardDetailMaterial("structure-access-latch", 0xd0a343, 0.48, 0.28);

    if (amenity.kind === "kiosk_hatch") {
      const shutter = this.standardDetailMaterial("kiosk-roller-shutter", 0xa6a697, 0.68, 0.18);
      const counter = this.standardDetailMaterial("kiosk-counter", 0x8b6a3d, 0.72, 0.08);
      this.addLocalBox(position, angle, 0, 0, 1.22, 0.64, 0.06, shutter, 1.06, false);
      for (const y of [0.68, 0.82, 0.96, 1.1]) {
        this.addLocalBox(position, angle, 0, -0.035, 1.16, 0.026, 0.064, this.materials.darkOpening, y + 0.2, false);
      }
      this.addLocalBox(position, angle, 0, -0.2, 1.35, 0.14, 0.42, counter, 0.68);
      return;
    }

    if (amenity.kind === "utility_box") {
      const panel = this.standardDetailMaterial("utility-switchboard-panel", 0x6e7770, 0.58, 0.18);
      this.addLocalBox(position, angle, 0, 0, 0.5, 0.78, 0.12, panel, 1.58, false);
      this.addLocalBox(position, angle, 0.16, -0.07, 0.07, 0.12, 0.05, latchMaterial, 1.58, false);
      return;
    }

    this.addLocalBox(position, angle, 0, 0, 1.08, 1.94, 0.1, panelMaterial, 1.0, false);
    this.addLocalBox(position, angle, 0.4, -0.07, 0.1, 0.14, 0.055, latchMaterial, 1.02, false);
  }

  private structureAccessPanelColor(kind: AmenityPoint["kind"]): number {
    if (kind === "changeroom") return 0x5f725f;
    if (kind === "umpire_room") return 0x5b5f67;
    if (kind === "first_aid_room") return 0x8e4a43;
    if (kind === "gatehouse") return 0x6a4c32;
    if (kind === "maintenance_room") return 0x5b6665;
    if (kind === "community_room") return 0x315d67;
    if (kind === "kitchenette") return 0x826b4d;
    if (kind === "kiosk_hatch") return 0x6f5635;
    if (kind === "utility_box") return 0x4f5e56;
    return 0x314f44;
  }

  private addMemorialPlaqueCue(position: Vec2, angle: number): void {
    const stone = this.standardDetailMaterial("memorial-plaque-stone", 0xb8ad91, 0.74, 0.02);
    const bronze = this.standardDetailMaterial("memorial-plaque-bronze", 0x8a5d2d, 0.48, 0.38);
    const base = this.addLocalBox(position, angle, 0, 0.12, 1.25, 0.18, 0.48, stone, 0.12);
    base.castShadow = true;
    this.addLocalBox(position, angle, 0, -0.12, 0.95, 0.58, 0.08, stone, 0.48);
    this.addLocalBox(position, angle, 0, -0.18, 0.72, 0.34, 0.055, bronze, 0.55, false);
    for (const y of [0.49, 0.58, 0.67]) {
      this.addLocalBox(position, angle, 0, -0.215, 0.54, 0.026, 0.06, this.basicDetailMaterial("memorial-plaque-lines", 0x2f2518), y, false);
    }
  }

  private addToiletSign(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.4, 8), this.materials.metal);
    post.position.y = 0.7;
    post.castShadow = true;
    group.add(post);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0x2e6c79 }));
    sign.position.y = 1.48;
    group.add(sign);
    group.position.set(position.x, this.groundY(position), position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addAmenityHalo(position: Vec2, color: number, radius: number): void {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.022, 8, 26),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32 })
    );
    halo.position.set(position.x, this.groundY(position) + 0.12, position.z);
    halo.rotation.x = Math.PI / 2;
    this.scene.add(halo);
  }

  private angleFromId(id: string): number {
    const value = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return (value % 360) * THREE.MathUtils.DEG2RAD;
  }

  private angleFromPoint(position: Vec2): number {
    return Math.atan2(position.x, position.z);
  }

  private addRotunda(position: Vec2): void {
    const group = new THREE.Group();
    const renderStone = new THREE.MeshStandardMaterial({ color: 0xd5c6a2, roughness: 0.58 });
    const copper = new THREE.MeshStandardMaterial({ color: 0x98705a, metalness: 0.18, roughness: 0.66 });
    const plaque = new THREE.MeshStandardMaterial({ color: 0x4a3921, metalness: 0.5, roughness: 0.42 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.75, 0.72, 36), renderStone);
    base.position.y = 0.36;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    const lowerStorey = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.45, 1.18, 32), renderStone);
    lowerStorey.position.y = 1.1;
    lowerStorey.castShadow = true;
    lowerStorey.receiveShadow = true;
    group.add(lowerStorey);
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.06), this.materials.darkOpening);
      vent.position.set(Math.cos(angle) * 4.48, 1.12, Math.sin(angle) * 4.48);
      vent.rotation.y = -angle;
      group.add(vent);
    }
    const baseDoor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.42, 0.08), this.materials.darkOpening);
    baseDoor.position.set(0, 0.86, -4.47);
    group.add(baseDoor);
    const platform = new THREE.Mesh(
      this.painterlyGeometry(new THREE.CylinderGeometry(4.8, 5.05, 0.28, 36), this.materials.path),
      this.materials.path
    );
    platform.position.y = 1.86;
    platform.castShadow = true;
    platform.receiveShadow = true;
    group.add(platform);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.31, 3.65, 12), renderStone);
      column.position.set(Math.cos(angle) * 4.0, 3.68, Math.sin(angle) * 4.0);
      column.castShadow = true;
      group.add(column);
      const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.36, 0.16, 12), renderStone);
      capital.position.set(column.position.x, 5.58, column.position.z);
      group.add(capital);
    }
    const entablature = new THREE.Mesh(new THREE.CylinderGeometry(4.85, 4.95, 0.44, 36), renderStone);
    entablature.position.y = 5.84;
    entablature.castShadow = true;
    group.add(entablature);
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const triglyph = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.08), this.materials.darkOpening);
      triglyph.position.set(Math.cos(angle) * 5.02, 5.85, Math.sin(angle) * 5.02);
      triglyph.rotation.y = -angle;
      group.add(triglyph);
    }
    const roof = new THREE.Mesh(new THREE.SphereGeometry(4.65, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), copper);
    roof.scale.y = 0.44;
    roof.position.y = 6.05;
    roof.castShadow = true;
    group.add(roof);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, 0.72, 16), copper);
    lantern.position.y = 8.14;
    lantern.castShadow = true;
    group.add(lantern);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.52, 16), copper);
    finial.position.y = 8.78;
    finial.castShadow = true;
    group.add(finial);
    for (let step = 0; step < 5; step += 1) {
      const stair = new THREE.Mesh(new THREE.BoxGeometry(2.4 + step * 0.28, 0.18, 0.62), renderStone);
      stair.position.set(0, 0.16 + step * 0.18, -5.25 - step * 0.48);
      stair.castShadow = true;
      stair.receiveShadow = true;
      stair.userData.kind = "rotunda-stair";
      group.add(stair);
    }
    for (const side of [-1, 1]) {
      const balustrade = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.08, 2.85), renderStone);
      balustrade.position.set(side * 1.5, 1.34, -5.92);
      balustrade.rotation.x = -0.4;
      balustrade.castShadow = true;
      group.add(balustrade);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 3.0), renderStone);
      cap.position.set(side * 1.5, 1.93, -5.9);
      cap.rotation.x = -0.4;
      cap.castShadow = true;
      group.add(cap);
    }
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.92, 0.5), renderStone);
      pier.position.set(side * 1.62, 0.78, -5.88);
      pier.castShadow = true;
      group.add(pier);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.34, 0.05), plaque);
      plate.position.set(side * 1.05, 1.55, -4.48);
      group.add(plate);
    }
    const stairGate = new THREE.MeshStandardMaterial({ color: 0x26302d, metalness: 0.38, roughness: 0.48 });
    for (const x of [-0.72, -0.36, 0, 0.36, 0.72]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.8, 0.055), stairGate);
      bar.position.set(x, 0.62, -7.58);
      bar.castShadow = true;
      bar.userData.kind = "rotunda-stair-gate";
      group.add(bar);
    }
    for (const y of [0.36, 0.76]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.055, 0.06), stairGate);
      rail.position.set(0, y, -7.58);
      group.add(rail);
    }
    group.position.set(position.x, this.radialSupportY(position, 5.7), position.z);
    group.rotation.y = -0.34;
    this.scene.add(group);
    this.replaceRotundaFallbackWithAsset(group, position);
    this.addLabel("Rotunda", position, 7);
  }

  private replaceRotundaFallbackWithAsset(fallback: THREE.Group, position: Vec2): void {
    if (typeof window === "undefined") return;
    const load = instantiateRotundaAsset()
      .then((asset) => {
        asset.position.set(position.x, this.radialSupportY(position, 6.75), position.z);
        asset.rotation.y = -0.34;
        asset.userData.sourceId = "osm-building-543505640";
        asset.userData.navigationFixtureId = "rotunda-deck";
        fallback.visible = false;
        this.scene.add(asset);
      })
      .catch((error: unknown) => {
        console.warn("Rotunda GLB asset failed to load; retaining procedural fallback", error);
      });
    this.pendingAssetLoads.push(load);
  }

  private replaceEntrancePavilionFallbackWithAsset(building: MappedBuilding, fallbackObjects: THREE.Object3D[]): void {
    if (typeof window === "undefined") return;
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0, building.facade?.frontagePoint);
    const rotation = -footprint.angle;
    const load = instantiateEntrancePavilionAsset()
      .then((asset) => {
        asset.position.set(
          footprint.center.x,
          this.boxSupportY(footprint.center, rotation, footprint.halfX, footprint.halfZ),
          footprint.center.z
        );
        asset.rotation.y = rotation;
        asset.scale.set((footprint.halfX * 2) / ENTRANCE_PAVILION_ASSET_LENGTH, 1, (footprint.halfZ * 2) / ENTRANCE_PAVILION_ASSET_DEPTH);
        asset.userData.sourceId = building.id;
        asset.userData.navigationAmenityId = "timber-entrance-pavilion-passage";
        for (const fallback of fallbackObjects) fallback.visible = false;
        this.scene.add(asset);
      })
      .catch((error: unknown) => {
        console.warn("Entrance pavilion GLB asset failed to load; retaining procedural fallback", error);
      });
    this.pendingAssetLoads.push(load);
  }

  private replaceBowlingClubFallbackWithAsset(building: MappedBuilding, fallbackObjects: THREE.Object3D[]): void {
    if (typeof window === "undefined") return;
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0, building.facade?.frontagePoint);
    const rotation = -footprint.angle;
    const load = instantiateBowlingClubAsset()
      .then((asset) => {
        // The exact-plan shell extends 0.35 m below its authored threshold so
        // average terrain placement embeds the foundation without turning the
        // broad, rigid clubhouse into a visibly floating slab on minor grade.
        asset.position.set(footprint.center.x, this.averageGroundY(building.polygon) - 0.08, footprint.center.z);
        asset.rotation.y = rotation;
        asset.scale.set((footprint.halfX * 2) / BOWLING_CLUB_ASSET_LENGTH, 1, (footprint.halfZ * 2) / BOWLING_CLUB_ASSET_DEPTH);
        asset.userData.sourceId = building.id;
        asset.userData.navigationAmenityId = "bowling-clubroom-access";
        asset.userData.approachGateId = "bowling-hannah-memorial-gate";
        for (const fallback of fallbackObjects) fallback.visible = false;
        this.scene.add(asset);
      })
      .catch((error: unknown) => {
        console.warn("Bowling club GLB asset failed to load; retaining procedural fallback", error);
      });
    this.pendingAssetLoads.push(load);
  }

  private replaceEmelyBakerFallbackWithAsset(building: MappedBuilding, fallbackObjects: THREE.Object3D[]): void {
    if (typeof window === "undefined") return;
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0, building.facade?.frontagePoint);
    const rotation = -footprint.angle;
    const load = instantiateEmelyBakerAsset()
      .then((asset) => {
        asset.position.set(footprint.center.x, this.averageGroundY(building.polygon) - 0.04, footprint.center.z);
        asset.rotation.y = rotation;
        asset.scale.set(
          (footprint.halfX * 2) / EMELY_BAKER_ASSET_LENGTH,
          1,
          (footprint.halfZ * 2) / EMELY_BAKER_ASSET_DEPTH
        );
        asset.userData.sourceId = building.id;
        asset.userData.communityRoomAmenityId = "emely-baker-community-room";
        asset.userData.kitchenetteAmenityId = "emely-baker-kitchenette";
        asset.userData.serviceCabinetAmenityId = "emely-baker-exterior-service-cabinet";
        asset.userData.accessGateId = "emely-courtyard-west-side-gate";
        for (const fallback of fallbackObjects) fallback.visible = false;
        this.scene.add(asset);
      })
      .catch((error: unknown) => {
        console.warn("Emely Baker Centre GLB asset failed to load; retaining procedural fallback", error);
      });
    this.pendingAssetLoads.push(load);
  }

  private replaceAlfredCrescentPavilionFallbackWithAsset(building: MappedBuilding, fallbackObjects: THREE.Object3D[]): void {
    if (typeof window === "undefined") return;
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0, building.facade?.frontagePoint);
    const rotation = -footprint.angle;
    const load = instantiateAlfredCrescentPavilionAsset()
      .then((asset) => {
        asset.position.set(footprint.center.x, this.averageGroundY(building.polygon) - 0.07, footprint.center.z);
        asset.rotation.y = rotation;
        asset.scale.set(
          (footprint.halfX * 2) / ALFRED_CRESCENT_PAVILION_ASSET_LENGTH,
          1,
          (footprint.halfZ * 2) / ALFRED_CRESCENT_PAVILION_ASSET_DEPTH
        );
        asset.userData.sourceId = building.id;
        asset.userData.mainEntranceAmenityId = "alfred-pavilion-main-entrance";
        asset.userData.kioskAmenityId = "alfred-pavilion-kiosk";
        asset.userData.publicToiletAmenityIds = [
          "alfred-pavilion-expanded-public-toilets",
          "alfred-pavilion-south-accessible-toilets"
        ];
        for (const fallback of fallbackObjects) fallback.visible = false;
        this.scene.add(asset);
      })
      .catch((error: unknown) => {
        console.warn("Alfred Crescent Sports Pavilion GLB asset failed to load; retaining procedural fallback", error);
      });
    this.pendingAssetLoads.push(load);
  }

  private replaceNorthToiletsFallbackWithAsset(landmark: Landmark, fallbackObjects: THREE.Object3D[]): void {
    if (typeof window === "undefined" || !landmark.polygon) return;
    const polygon = landmark.polygon;
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const rotation = -footprint.angle;
    const load = instantiateNorthToiletsAsset()
      .then((asset) => {
        asset.position.set(
          footprint.center.x,
          this.averageGroundY(polygon) - 0.035,
          footprint.center.z
        );
        asset.rotation.y = rotation;
        asset.scale.set(
          (footprint.halfX * 2) / NORTH_TOILETS_ASSET_LENGTH,
          1,
          (footprint.halfZ * 2) / NORTH_TOILETS_ASSET_DEPTH
        );
        asset.userData.sourceId = landmark.id;
        asset.userData.stallBankAmenityIds = [
          "north-toilets-south-west-stall-bank",
          "north-toilets-north-east-stall-bank"
        ];
        for (const fallback of fallbackObjects) fallback.visible = false;
        this.scene.add(asset);
      })
      .catch((error: unknown) => {
        console.warn("Edinburgh Gardens north public-toilet GLB asset failed to load; retaining procedural fallback", error);
      });
    this.pendingAssetLoads.push(load);
  }

  private replaceSportsmansMemorialFallbackWithAsset(landmark: Landmark, fallbackObjects: THREE.Object3D[]): void {
    if (typeof window === "undefined" || !landmark.position) return;
    const position = landmark.position;
    const rotation = -(landmark.angle ?? -0.106);
    const load = instantiateSportsmansMemorialAsset()
      .then((asset) => {
        asset.position.set(
          position.x,
          this.boxSupportY(position, rotation, 3.35, 1.67) - 0.035,
          position.z
        );
        asset.rotation.y = rotation;
        asset.userData.sourceId = landmark.id;
        asset.userData.memorialInteractionId = "sportsmans-memorial-east-inscription";
        asset.userData.navigationObstacleIds = [
          "sportsmans-memorial-column-west-south",
          "sportsmans-memorial-column-west-north",
          "sportsmans-memorial-column-centre-south",
          "sportsmans-memorial-column-centre-north",
          "sportsmans-memorial-column-east-south",
          "sportsmans-memorial-column-east-north"
        ];
        for (const fallback of fallbackObjects) fallback.visible = false;
        this.scene.add(asset);
      })
      .catch((error: unknown) => {
        console.warn("Sportsman's War Memorial GLB asset failed to load; retaining procedural fallback", error);
      });
    this.pendingAssetLoads.push(load);
  }

  private replaceGrandstandFallbackWithAsset(landmark: Landmark, fallbackObjects: THREE.Object3D[]): void {
    if (typeof window === "undefined" || !landmark.polygon) return;
    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0, 0);
    const rotation = -footprint.angle;
    const load = instantiateGrandstandAsset()
      .then((asset) => {
        asset.position.set(
          footprint.center.x,
          this.boxSupportY(footprint.center, rotation, footprint.halfX, footprint.halfZ) - 0.04,
          footprint.center.z
        );
        asset.rotation.y = rotation;
        asset.scale.set((footprint.halfX * 2) / GRANDSTAND_ASSET_LENGTH, 1, (footprint.halfZ * 2) / GRANDSTAND_ASSET_DEPTH);
        asset.userData.sourceId = landmark.id;
        asset.userData.navigationFixtureId = "grandstand-seats";
        asset.userData.changeroomAmenityId = "grandstand-changeroom-access";
        asset.userData.umpireAmenityId = "grandstand-umpire-room-access";
        for (const fallback of fallbackObjects) fallback.visible = false;
        this.scene.add(asset);
      })
      .catch((error: unknown) => {
        console.warn("Kevin Murray Stand GLB asset failed to load; retaining procedural fallback", error);
      });
    this.pendingAssetLoads.push(load);
  }

  private addMemorial(landmark: Landmark): void {
    const position = landmark.position;
    if (!position) return;
    if (landmark.id === "queen-victoria-plinth") {
      this.addQueenVictoriaPlinth(position);
      return;
    }
    if (landmark.id === "sportsmans-war-memorial") {
      const fallbackStart = new Set(this.scene.children);
      this.addSportsmansMemorial(position, landmark.angle ?? -0.106);
      this.replaceSportsmansMemorialFallbackWithAsset(
        landmark,
        this.scene.children.filter((child) => !fallbackStart.has(child))
      );
      return;
    }
    this.addCookMemorialSite(position);
  }

  private addQueenVictoriaPlinth(position: Vec2): void {
    const bedGroundY = this.radialSupportY(position, 5.7);
    const plinthGroundY = this.boxSupportY(position, 0, 1.45, 1.45);
    const bed = new THREE.Mesh(new THREE.CircleGeometry(5.7, 40), new THREE.MeshStandardMaterial({ color: 0x4e693f, roughness: 0.96 }));
    bed.position.set(position.x, bedGroundY + 0.11, position.z);
    bed.rotation.x = -Math.PI / 2;
    bed.receiveShadow = true;
    this.scene.add(bed);

    const stone = new THREE.MeshStandardMaterial({ color: 0xb8ad91, roughness: 0.72 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.55, 2.9), stone);
    base.position.set(position.x, plinthGroundY + 0.38, position.z);
    base.castShadow = true;
    base.receiveShadow = true;
    this.scene.add(base);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.45, 2.15), stone);
    plinth.position.set(position.x, plinthGroundY + 1.35, position.z);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    this.scene.add(plinth);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.28, 2.55), stone);
    cap.position.set(position.x, plinthGroundY + 2.22, position.z);
    cap.castShadow = true;
    this.scene.add(cap);

    const sculpture = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x191c1a, metalness: 0.4, roughness: 0.38 });
    const column = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.65, 0.28), frameMaterial);
    column.position.y = 0.85;
    column.castShadow = true;
    sculpture.add(column);
    const clockHousing = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.62, 0.07), frameMaterial);
    clockHousing.position.set(0, 0.88, -0.18);
    clockHousing.castShadow = true;
    sculpture.add(clockHousing);

    const clockFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.42),
      this.digitalClockMaterial("queen-victoria-plinth-zero-clock", "00:00:00", "2030 EVENT")
    );
    clockFace.position.set(0, 0.88, -0.222);
    clockFace.rotation.y = Math.PI;
    clockFace.userData.kind = "plinth-apocalypse-clock";
    clockFace.userData.dynamic = true;
    sculpture.add(clockFace);

    const clockGlow = new THREE.PointLight(0xff4433, 0.62, 4.6, 1.35);
    clockGlow.position.set(0, 0.92, -0.42);
    clockGlow.userData.kind = "plinth-apocalypse-clock-light";
    clockGlow.userData.dynamic = true;
    sculpture.add(clockGlow);

    const statusStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.04, 0.038),
      new THREE.MeshBasicMaterial({ color: 0xff3e2e, transparent: true, opacity: 0.88 })
    );
    statusStripe.position.set(0, 0.48, -0.174);
    statusStripe.userData.kind = "plinth-apocalypse-clock";
    statusStripe.userData.dynamic = true;
    sculpture.add(statusStripe);
    sculpture.position.set(position.x, plinthGroundY + 2.36, position.z);
    sculpture.rotation.y = -0.45;
    this.scene.add(sculpture);
    this.addLabel("Queen Victoria plinth", position, 5.2);
  }

  private addSportsmansMemorial(position: Vec2, angle: number): void {
    const rotation = -angle;
    const groundY = this.boxSupportY(position, rotation, 3.2, 1.55);
    const stone = new THREE.MeshStandardMaterial({ color: 0xd0c2a2, roughness: 0.68 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5d2d, metalness: 0.35, roughness: 0.5 });
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      this.painterlyGeometry(new THREE.BoxGeometry(6.4, 0.18, 3.1), this.materials.concrete),
      this.materials.concrete
    );
    base.position.y = 0.1;
    base.receiveShadow = true;
    group.add(base);
    for (const x of [-2.35, 0, 2.35]) {
      for (const z of [-1.05, 1.05]) {
        const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.58), stone);
        pedestal.position.set(x, 0.42, z);
        pedestal.castShadow = true;
        group.add(pedestal);
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.45, 12), stone);
        column.position.set(x, 1.92, z);
        column.castShadow = true;
        group.add(column);
        const capital = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.48), stone);
        capital.position.set(x, 3.19, z);
        group.add(capital);
      }
    }
    for (const z of [-1.05, 1.05]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.48, 0.42), stone);
      beam.position.set(0, 3.48, z);
      beam.castShadow = true;
      group.add(beam);
    }
    for (const x of [-2.65, 2.65]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 2.52), stone);
      beam.position.set(x, 3.48, 0);
      beam.castShadow = true;
      group.add(beam);
    }
    for (const x of [-2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55]) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 2.72), stone);
      rafter.position.set(x, 3.78, 0);
      rafter.castShadow = true;
      group.add(rafter);
    }
    const inscription = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.34, 2.15),
      this.canvasSignMaterial("sportsmans-in-memoriam", "IN MEMORIAM", "#d0c2a2", "#5a4630")
    );
    inscription.position.set(2.88, 3.52, 0);
    inscription.userData.kind = "sportsmans-east-inscription";
    group.add(inscription);

    // Current and 1932 photographs show a raised rectangular swag panel, not
    // the triangular proxy used by the first memorial pass.
    const pediment = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 2.16), stone);
    pediment.position.set(2.83, 4.17, 0);
    pediment.castShadow = true;
    pediment.userData.kind = "sportsmans-east-pediment";
    group.add(pediment);
    const pedimentCap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 2.46), stone);
    pedimentCap.position.set(2.83, 4.52, 0);
    pedimentCap.castShadow = true;
    group.add(pedimentCap);
    for (const z of [-0.74, 0, 0.74]) {
      const swag = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 16, Math.PI), bronze);
      swag.position.set(2.795, 4.08, z);
      swag.rotation.y = Math.PI / 2;
      swag.rotation.z = Math.PI;
      swag.userData.kind = "sportsmans-east-swag";
      group.add(swag);
    }
    for (const z of [-1.05, 1.05]) {
      const urnBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.34), stone);
      urnBase.position.set(2.65, 3.84, z);
      group.add(urnBase);
      const urn = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), stone);
      urn.scale.y = 1.35;
      urn.position.set(2.65, 4.16, z);
      urn.castShadow = true;
      urn.userData.kind = "sportsmans-east-urn-finial";
      group.add(urn);
      const urnTip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), stone);
      urnTip.position.set(2.65, 4.5, z);
      group.add(urnTip);
    }
    group.position.set(position.x, groundY, position.z);
    group.rotation.y = rotation;
    this.scene.add(group);
    this.addLabel("Sportsman's Memorial", position, 4.5);
  }

  private addCookMemorialSite(position: Vec2): void {
    const rotation = 0.35;
    const groundY = this.boxSupportY(position, rotation, 0.72, 0.46);
    const granite = new THREE.MeshStandardMaterial({ color: 0xb9b6aa, roughness: 0.78 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x765438, metalness: 0.42, roughness: 0.5 });
    const base = this.addLocalBox(position, rotation, 0, 0, 1.55, 0.22, 0.92, granite, 0.12);
    base.position.y = groundY + 0.12;
    const plinth = this.addLocalBox(position, rotation, 0, 0, 1.12, 2.62, 0.7, granite, 1.5);
    plinth.position.y = groundY + 1.5;
    const portraitPanel = this.addLocalBox(position, rotation, 0, -0.37, 0.72, 0.56, 0.055, bronze, groundY + 1.78, false);
    portraitPanel.position.y = groundY + 1.78;
    portraitPanel.userData.kind = "cook-memorial-portrait-panel";
    const portraitArchMaterial = bronze.clone();
    portraitArchMaterial.side = THREE.DoubleSide;
    const portraitArch = new THREE.Mesh(new THREE.CircleGeometry(0.36, 18, 0, Math.PI), portraitArchMaterial);
    const archPoint = this.localPoint(position, rotation, 0, -0.405);
    portraitArch.position.set(archPoint.x, groundY + 2.06, archPoint.z);
    portraitArch.rotation.y = rotation;
    portraitArch.userData.kind = "cook-memorial-portrait-arch";
    this.scene.add(portraitArch);
    const portraitHead = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), this.basicDetailMaterial("cook-portrait-relief", 0x4e3928));
    portraitHead.scale.z = 0.28;
    const portraitHeadPoint = this.localPoint(position, rotation, 0, -0.43);
    portraitHead.position.set(portraitHeadPoint.x, groundY + 2.02, portraitHeadPoint.z);
    portraitHead.rotation.y = rotation;
    portraitHead.userData.kind = "cook-memorial-relief";
    this.scene.add(portraitHead);
    const portraitBust = this.addLocalBox(
      position,
      rotation,
      0,
      -0.408,
      0.34,
      0.23,
      0.035,
      this.basicDetailMaterial("cook-portrait-relief", 0x4e3928),
      groundY + 1.82,
      false
    );
    portraitBust.position.y = groundY + 1.82;
    portraitBust.userData.kind = "cook-memorial-relief";
    this.addLocalBox(position, rotation, 0, -0.375, 0.62, 0.22, 0.06, bronze, groundY + 1.2, false).position.y = groundY + 1.2;
    this.addLocalBox(position, rotation, 0, -0.375, 0.38, 0.15, 0.06, bronze, groundY + 0.72, false).position.y = groundY + 0.72;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.28, 4), granite);
    cap.position.set(position.x, groundY + 2.95, position.z);
    cap.rotation.y = rotation + Math.PI / 4;
    cap.scale.z = 0.64;
    cap.castShadow = true;
    cap.userData.kind = "cook-memorial-pyramidal-cap";
    this.scene.add(cap);
    this.addLabel("Cook Memorial", position, 3.2);
  }

  private addBoundaryFence(): void {
    const gaps = this.parkEntrances().map((entrance) => ({
      position: entrance.position,
      radius: entrance.width + 1.9
    }));
    this.addFenceAround(this.level.boundary, 1.4, 0x657264, gaps);
  }

  private parkEntrances(): ParkEntrance[] {
    return [
      { position: geoToWorld({ lat: -37.78956, lon: 144.98011 }), angle: -0.22, width: 5.2, sign: false, name: "Freeman Street", transit: "neighbourhood" },
      { position: geoToWorld({ lat: -37.78735, lon: 144.98554 }), angle: 2.55, width: 4.8, sign: true, name: "Brunswick Street", transit: "tram" },
      { position: geoToWorld({ lat: -37.78572, lon: 144.98228 }), angle: 0.32, width: 4.8, sign: false, name: "St Georges Road", transit: "tram" },
      { position: geoToWorld({ lat: -37.78855, lon: 144.98505 }), angle: 2.3, width: 4.6, sign: false, name: "Alfred Crescent", transit: "rail-trail" }
    ];
  }

  private addParkEntranceDetails(): void {
    const stone = this.standardDetailMaterial("entrance-bluestone-pillars", 0xb6aa8d, 0.8, 0.04);
    const iron = this.standardDetailMaterial("entrance-painted-iron", 0x202622, 0.56, 0.32);
    const entrances = this.parkEntrances();

    for (const entrance of entrances) {
      const tangent = new THREE.Vector3(Math.cos(entrance.angle), 0, Math.sin(entrance.angle));
      const normal = new THREE.Vector3(-Math.sin(entrance.angle), 0, Math.cos(entrance.angle));
      for (const side of [-1, 1]) {
        const pillarPosition = new THREE.Vector3(entrance.position.x, 0, entrance.position.z).addScaledVector(tangent, side * entrance.width);
        const pillarPoint = { x: pillarPosition.x, z: pillarPosition.z };
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.55, 0.46), stone);
        pillar.position.set(pillarPoint.x, this.groundY(pillarPoint) + 0.78, pillarPoint.z);
        pillar.castShadow = true;
        this.scene.add(pillar);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), stone);
        cap.position.set(pillarPoint.x, this.groundY(pillarPoint) + 1.68, pillarPoint.z);
        cap.castShadow = true;
        this.scene.add(cap);
      }

      if (entrance.transit !== "rail-trail") {
        for (let index = -3; index <= 3; index += 1) {
          if (Math.abs(index) < 1) continue;
          const bollardPosition = new THREE.Vector3(entrance.position.x, 0, entrance.position.z)
            .addScaledVector(tangent, index * 1.35)
            .addScaledVector(normal, -1.8);
          const bollardPoint = { x: bollardPosition.x, z: bollardPosition.z };
          const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.74, 8), iron);
          bollard.position.set(bollardPoint.x, this.groundY(bollardPoint) + 0.37, bollardPoint.z);
          bollard.castShadow = true;
          this.scene.add(bollard);
        }
      }

      if (entrance.sign) {
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 0.54, 0.12),
          this.canvasSignMaterial("edinburgh-gardens-entry", "EDINBURGH", "#244c3c", "#f0d072")
        );
        sign.position.set(entrance.position.x, this.groundY(entrance.position) + 1.35, entrance.position.z);
        sign.rotation.y = -entrance.angle;
        sign.castShadow = true;
        this.scene.add(sign);
        this.addLabel("Edinburgh Gardens", entrance.position, 3.4);
      }
      this.addEntranceCrossing(entrance);
    }
  }

  private addMelbourneMarkers(): void {
    const entrances = this.parkEntrances();
    entrances
      .filter((entrance) => entrance.transit === "tram")
      .forEach((entrance, index) => this.addTramStopTotem(entrance, index % 2 === 0 ? 1 : -1));

    entrances
      .filter((entrance) => entrance.transit === "rail-trail")
      .forEach((entrance) => this.addBikeHoopCluster(entrance));
  }

  private addTramStopTotem(entrance: ParkEntrance, side: number): void {
    const tangent = new THREE.Vector3(Math.cos(entrance.angle), 0, Math.sin(entrance.angle));
    const normal = new THREE.Vector3(-Math.sin(entrance.angle), 0, Math.cos(entrance.angle));
    const base = new THREE.Vector3(entrance.position.x, 0, entrance.position.z)
      .addScaledVector(tangent, side * (entrance.width + 1.15))
      .addScaledVector(normal, -2.85);
    const point = { x: base.x, z: base.z };
    const groundY = this.groundY(point);
    const group = new THREE.Group();
    group.name = `${entrance.name} tram marker`;
    group.position.set(point.x, groundY, point.z);
    group.rotation.y = -entrance.angle;

    const poleMaterial = this.standardDetailMaterial("melbourne-tram-pole", 0x283833, 0.55, 0.34);
    const yellowMaterial = this.basicDetailMaterial("melbourne-tram-yellow", 0xf0c84d);
    const greenMaterial = this.basicDetailMaterial("melbourne-tram-green", 0x1f6f52);
    const mykiMaterial = this.canvasSignMaterial("myki-reader", "myki", "#1d5d93", "#f2e6a8");
    const tramTextMaterial = this.canvasSignMaterial("tram-stop", "TRAM", "#1f6f52", "#f5d45c");

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 2.45, 10), poleMaterial);
    pole.position.y = 1.22;
    pole.castShadow = true;
    group.add(pole);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.08), greenMaterial);
    blade.position.set(0, 2.42, 0);
    blade.castShadow = true;
    group.add(blade);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 0.09), yellowMaterial);
    cap.position.set(0, 2.82, 0);
    group.add(cap);

    const tramLabel = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.28, 0.086), tramTextMaterial);
    tramLabel.position.set(0, 2.42, -0.046);
    group.add(tramLabel);

    const reader = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.1), mykiMaterial);
    reader.position.set(0.33, 1.08, -0.035);
    reader.castShadow = true;
    group.add(reader);

    const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 12), this.materials.metal);
    basePlate.position.y = 0.04;
    basePlate.castShadow = true;
    group.add(basePlate);

    this.scene.add(group);
  }

  private addBikeHoopCluster(entrance: ParkEntrance): void {
    const tangent = new THREE.Vector3(Math.cos(entrance.angle), 0, Math.sin(entrance.angle));
    const normal = new THREE.Vector3(-Math.sin(entrance.angle), 0, Math.cos(entrance.angle));
    const center = new THREE.Vector3(entrance.position.x, 0, entrance.position.z)
      .addScaledVector(tangent, -entrance.width - 1.2)
      .addScaledVector(normal, -2.3);
    const metal = this.standardDetailMaterial("melbourne-bike-hoop-metal", 0x9aa8a1, 0.34, 0.38);
    const blue = this.basicDetailMaterial("melbourne-bike-wayfinding-blue", 0x276f9f);

    for (const offset of [-0.78, 0, 0.78]) {
      const point = { x: center.x + tangent.x * offset, z: center.z + tangent.z * offset };
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.032, 8, 24), metal);
      hoop.position.set(point.x, this.groundY(point) + 0.58, point.z);
      hoop.rotation.y = -entrance.angle;
      hoop.scale.y = 1.18;
      hoop.castShadow = true;
      this.scene.add(hoop);
    }

    const signPoint = { x: center.x + tangent.x * 1.22, z: center.z + tangent.z * 1.22 };
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.35, 8), metal);
    pole.position.set(signPoint.x, this.groundY(signPoint) + 0.68, signPoint.z);
    pole.castShadow = true;
    this.scene.add(pole);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.07), blue);
    sign.position.set(signPoint.x, this.groundY(signPoint) + 1.42, signPoint.z);
    sign.rotation.y = -entrance.angle;
    sign.castShadow = true;
    this.scene.add(sign);
  }

  private addStreetEdges(): void {
    const asphalt = this.standardDetailMaterial("street-wet-bitumen", 0x26363b, 0.9, 0.04);
    const residential = this.standardDetailMaterial("street-residential-bitumen", 0x303732, 0.92, 0.03);
    const kerb = this.standardDetailMaterial("street-kerb-bluestone", 0xa9a18d, 0.78, 0.04);
    const line = new THREE.MeshBasicMaterial({ color: 0xd8cfaa, transparent: true, opacity: 0.62 });
    const rail = new THREE.MeshBasicMaterial({ color: 0x858a80, transparent: true, opacity: 0.72 });

    for (const street of this.level.streetEdges) {
      const roadMaterial = street.kind === "residential" ? residential : asphalt;
      for (let i = 0; i < street.points.length - 1; i += 1) {
        const a = street.points[i];
        const b = street.points[i + 1];
        this.addStreetSegment(a, b, street.width, roadMaterial, kerb, line, rail, street.hasTram === true);
      }
    }
  }

  private addStreetSegment(
    a: Vec2,
    b: Vec2,
    width: number,
    roadMaterial: THREE.Material,
    kerbMaterial: THREE.Material,
    lineMaterial: THREE.Material,
    railMaterial: THREE.Material,
    hasTram: boolean
  ): void {
    const segmentLength = distance(a, b);
    if (segmentLength < 3) return;
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const road = this.createTerrainRect(center, angle, segmentLength + 1.4, width, 0.018, 0.04, roadMaterial);
    road.receiveShadow = true;
    this.scene.add(road);

    const normal = { x: -Math.sin(angle), z: Math.cos(angle) };
    for (const side of [-1, 1]) {
      const kerbCenter = { x: center.x + normal.x * side * (width * 0.5), z: center.z + normal.z * side * (width * 0.5) };
      const kerb = this.createTerrainRect(kerbCenter, angle, segmentLength + 1.1, 0.24, 0.072, 0.06, kerbMaterial);
      kerb.castShadow = true;
      kerb.receiveShadow = true;
      this.scene.add(kerb);
    }

    const centerLine = this.createTerrainRect(center, angle, segmentLength * 0.88, 0.075, 0.096, 0.012, lineMaterial);
    this.scene.add(centerLine);

    if (hasTram) {
      for (const offset of [-0.82, 0.82]) {
        const railCenter = { x: center.x + normal.x * offset, z: center.z + normal.z * offset };
        const railMesh = this.createTerrainRect(railCenter, angle, segmentLength * 0.94, 0.09, 0.108, 0.016, railMaterial);
        this.scene.add(railMesh);
      }
    }
  }

  private addEntranceCrossing(entrance: { position: Vec2; angle: number; width: number }): void {
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xe6e0c7, transparent: true, opacity: 0.68 });
    const normal = new THREE.Vector3(-Math.sin(entrance.angle), 0, Math.cos(entrance.angle));
    for (let stripe = -3; stripe <= 3; stripe += 1) {
      const center = new THREE.Vector3(entrance.position.x, 0, entrance.position.z)
        .addScaledVector(normal, -4.2 + stripe * 0.72);
      const point = { x: center.x, z: center.z };
      const mesh = this.createTerrainRect(point, entrance.angle, entrance.width * 1.5, 0.28, 0.13, 0.014, stripeMaterial);
      this.scene.add(mesh);
    }
  }

  private addTrees(): void {
    this.renderedTreeCount = 0;
    const buckets = new Map<string, TreeInstanceBucket>();
    this.level.trees.forEach((tree, index) => {
      if (!pointInPolygon(tree.position, this.level.boundary)) {
        return;
      }
      this.addBatchedTree(tree, index, this.treeChunkKey(tree.position), buckets);
      this.renderedTreeCount += 1;
    });

    for (const bucket of buckets.values()) {
      if (bucket.matrices.length === 0) continue;
      const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.matrices.length);
      bucket.matrices.forEach((matrix, index) => {
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, bucket.colors[index]);
      });
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.userData.kind = bucket.kind;
      mesh.userData.count = bucket.matrices.length;
      mesh.userData.treeChunk = bucket.chunkKey;
      mesh.userData.treeLod = bucket.lod;
      mesh.visible = bucket.lod === "full";
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      const chunk = this.ensureTreeRenderChunk(bucket.chunkKey);
      (bucket.lod === "full" ? chunk.fullMeshes : chunk.farMeshes).push(mesh);
    }
  }

  private addBatchedTree(tree: MappedTree, index: number, chunkKey: string, buckets: Map<string, TreeInstanceBucket>): void {
    const profile = tree.profile;
    const isAvenueTree = tree.canopyGroup === "avenue" || (tree.source?.includes("avenue") ?? false);
    const isReplacementTree = this.isYoungReplacementTree(tree);
    const winterRetention = this.winterCanopyRetention(profile);
    const massing = treeVisualMassing(tree);
    const heritageScale = tree.height ? THREE.MathUtils.clamp(tree.height / 20, 0.72, 1.45) : isAvenueTree ? 1.08 : 1;
    const scale = this.rng.range(0.9, 1.35) * heritageScale * TREE_SCALE_MULTIPLIER * (isReplacementTree ? 0.68 : 1);
    const proceduralTrunkHeight =
      profile === "gum"
        ? this.rng.range(6.8, 9.8) * scale
        : profile === "oak"
          ? this.rng.range(4.5, 6.8) * scale
          : profile === "jacaranda"
            ? this.rng.range(4.1, 5.8) * scale
            : profile === "kurrajong"
              ? this.rng.range(4.4, 6.2) * scale
              : this.rng.range(5.2, 8.4) * scale;
    const trunkHeight = resolveTreeTrunkHeight(tree, proceduralTrunkHeight);
    const trunkRadius = this.rng.range(0.3, 0.54) * scale * (tree.dbh ? THREE.MathUtils.clamp(tree.dbh / 95, 0.8, 1.45) : isAvenueTree ? 1.08 : 1);
    const materials = this.treeInstanceMaterials;
    const colors = this.treeInstanceColors(profile, index);
    const parentQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rng.range(0, Math.PI * 2), 0));
    const parentMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(tree.position.x, this.groundY(tree.position), tree.position.z),
      parentQuaternion,
      new THREE.Vector3(1, 1, 1)
    );

    const trunkMatrix = this.treeWorldMatrix(
      parentMatrix,
      new THREE.Vector3(0, trunkHeight * 0.5, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, this.rng.range(-0.05, 0.05))),
      new THREE.Vector3(trunkRadius, trunkHeight, trunkRadius)
    );
    this.addTreeInstance(
      buckets,
      chunkKey,
      "tree-trunks",
      this.treeTrunkGeometry,
      materials.trunk,
      trunkMatrix,
      colors.trunk,
      true,
      true
    );

    const branchCount = profile === "gum" || profile === "kurrajong" ? 3 : 4;
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const angle = (branchIndex / branchCount) * Math.PI * 2 + this.rng.range(-0.28, 0.28);
      const reach = this.rng.range(profile === "gum" ? 1 : 1.3, profile === "oak" || profile === "jacaranda" ? 2.9 : 2.35) * scale * massing.canopyWidth;
      const start = new THREE.Vector3(0, trunkHeight * this.rng.range(0.58, 0.76), 0);
      const end = new THREE.Vector3(
        Math.cos(angle) * reach,
        trunkHeight * this.rng.range(profile === "gum" ? 0.74 : 0.7, 0.96),
        Math.sin(angle) * reach
      );
      this.addTreeInstance(
        buckets,
        chunkKey,
        "tree-branches",
        this.treeBranchGeometry,
        materials.trunk,
        this.treeBranchWorldMatrix(parentMatrix, start, end, trunkRadius * this.rng.range(0.28, 0.4)),
        colors.trunk,
        false,
        true
      );
    }

    const twigCount = Math.min(1, this.winterTwigCount(tree, index));
    for (let twigIndex = 0; twigIndex < twigCount; twigIndex += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const reach = tree.canopyRadius * massing.canopyWidth * this.rng.range(0.44, 0.66);
      const start = new THREE.Vector3(Math.cos(angle) * reach * 0.22, trunkHeight * 0.78, Math.sin(angle) * reach * 0.22);
      const end = new THREE.Vector3(Math.cos(angle) * reach, trunkHeight + scale * 1.35, Math.sin(angle) * reach);
      this.addTreeInstance(
        buckets,
        chunkKey,
        "tree-winter-twigs",
        this.treeBranchGeometry,
        materials.trunk,
        this.treeBranchWorldMatrix(parentMatrix, start, end, trunkRadius * 0.1),
        colors.trunk,
        false,
        true
      );
    }

    this.addBatchedCanopyCore(tree, profile, trunkHeight, scale, winterRetention, materials, colors, parentMatrix, chunkKey, buckets);
    const baseLobeCount = profile === "gum" || profile === "kurrajong" ? 3 : 4;
    const lobeCount = Math.max(2, Math.min(4, Math.round(baseLobeCount * (0.72 + tree.canopyDensity * winterRetention * 0.46))));
    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
      const angle = (lobeIndex / lobeCount) * Math.PI * 2 + this.rng.range(-0.32, 0.32);
      const canopyRadius =
        tree.canopyRadius *
        massing.canopyWidth *
        this.rng.range(profile === "gum" ? 0.24 : profile === "jacaranda" ? 0.22 : 0.27, profile === "oak" ? 0.44 : profile === "kurrajong" ? 0.36 : 0.39) *
        (profile === "gum" || profile === "kurrajong" ? 1 : 0.84 + winterRetention * 0.22);
      const spread = tree.canopyRadius * massing.canopyWidth * (profile === "gum" ? 0.28 : profile === "oak" || profile === "jacaranda" ? 0.48 : profile === "kurrajong" ? 0.36 : 0.42);
      const position = new THREE.Vector3(
        Math.cos(angle) * this.rng.range(spread * 0.42, spread),
        trunkHeight + this.rng.range(profile === "gum" ? -0.42 : 0.02, profile === "oak" ? 0.9 : 1.35) * scale,
        Math.sin(angle) * this.rng.range(spread * 0.42, spread)
      );
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.rng.range(-0.18, 0.18), this.rng.range(0, Math.PI), this.rng.range(-0.18, 0.18))
      );
      const lobeScale = new THREE.Vector3(
        canopyRadius * this.rng.range(1, profile === "oak" || profile === "jacaranda" ? 1.68 : 1.48),
        canopyRadius * this.rng.range(profile === "gum" || profile === "kurrajong" ? 1.02 : 0.68, profile === "oak" ? 0.9 : 1.04) * (massing.canopyHeight / massing.canopyWidth),
        canopyRadius * this.rng.range(1, profile === "oak" || profile === "jacaranda" ? 1.68 : 1.48)
      );
      this.addTreeInstance(
        buckets,
        chunkKey,
        lobeIndex === 0 ? "tree-highlight-masses" : "tree-canopy-masses",
        this.treeCanopyGeometry,
        lobeIndex === 0 ? materials.leafHighlight : materials.leaf,
        this.treeWorldMatrix(parentMatrix, position, rotation, lobeScale),
        lobeIndex === 0 ? colors.leafHighlight : colors.leaf,
        false,
        true
      );
    }

    if (profile === "gum") {
      this.addTreeInstance(
        buckets,
        chunkKey,
        "tree-pale-bark",
        this.treePaleBarkGeometry,
        materials.paleBark,
        this.treeWorldMatrix(
          parentMatrix,
          new THREE.Vector3(0, trunkHeight * 0.52, 0),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, this.rng.range(-0.05, 0.05))),
          new THREE.Vector3(trunkRadius, trunkHeight * 0.38, trunkRadius)
        ),
        colors.paleBark,
        false,
        true
      );
    }

    this.addTreeInstance(
      buckets,
      chunkKey,
      "tree-lod-trunks",
      this.treeLodTrunkGeometry,
      this.treeLodMaterials.trunk,
      trunkMatrix,
      colors.trunk,
      false,
      false,
      "far"
    );
    const lodCanopyScale = tree.canopyRadius * (isReplacementTree ? 0.68 : 1);
    this.addTreeInstance(
      buckets,
      chunkKey,
      "tree-lod-canopies",
      this.treeLodCanopyGeometry,
      this.treeLodMaterials.leaf,
      this.treeWorldMatrix(
        parentMatrix,
        new THREE.Vector3(0, trunkHeight + scale * 0.45, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rng.range(0, Math.PI), 0)),
        new THREE.Vector3(
          lodCanopyScale * massing.canopyWidth * 0.72,
          lodCanopyScale * massing.canopyHeight * 0.48,
          lodCanopyScale * massing.canopyWidth * 0.72
        )
      ),
      colors.leaf,
      false,
      false,
      "far"
    );

    if (isReplacementTree) {
      const detailGroup = new THREE.Group();
      this.addYoungReplacementTreeDetails(detailGroup, trunkRadius, trunkHeight);
      detailGroup.position.set(tree.position.x, this.groundY(tree.position), tree.position.z);
      detailGroup.quaternion.copy(parentQuaternion);
      detailGroup.userData.kind = "replacement-tree-details";
      this.scene.add(detailGroup);
    }
  }

  private addBatchedCanopyCore(
    tree: MappedTree,
    profile: TreeProfile,
    trunkHeight: number,
    scale: number,
    winterRetention: number,
    materials: TreeMaterialSet,
    colors: TreeInstanceColors,
    parentMatrix: THREE.Matrix4,
    chunkKey: string,
    buckets: Map<string, TreeInstanceBucket>
  ): void {
    const replacementScale = this.isYoungReplacementTree(tree) ? 0.68 : 1;
    const massing = treeVisualMassing(tree);
    const retentionScale = THREE.MathUtils.lerp(0.5, 1, winterRetention);
    const avenueScale = tree.canopyGroup === "avenue" ? 0.86 : tree.canopyGroup === "specimen" ? 1.06 : 1;
    const width = profile === "gum" ? 0.62 : profile === "oak" ? 0.98 : profile === "jacaranda" ? 0.84 : profile === "kurrajong" ? 0.72 : 0.86;
    const height = profile === "gum" ? 0.5 : profile === "oak" ? 0.34 : profile === "jacaranda" ? 0.3 : profile === "kurrajong" ? 0.44 : 0.32;
    const depth = profile === "gum" || profile === "kurrajong" ? width * 0.82 : width * 1.14;
    this.addTreeInstance(
      buckets,
      chunkKey,
      "tree-canopy-cores",
      this.treeCanopyCoreGeometry,
      materials.leafShadow,
      this.treeWorldMatrix(
        parentMatrix,
        new THREE.Vector3(0, trunkHeight + (profile === "gum" ? 0.18 : profile === "oak" ? 0.56 : 0.42) * scale, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rng.range(-0.08, 0.08), this.rng.range(0, Math.PI), this.rng.range(-0.08, 0.08))),
        new THREE.Vector3(
          tree.canopyRadius * width * massing.canopyWidth * retentionScale * avenueScale * replacementScale,
          tree.canopyRadius * height * massing.canopyHeight * retentionScale * replacementScale,
          tree.canopyRadius * depth * massing.canopyWidth * retentionScale * avenueScale * replacementScale
        )
      ),
      colors.leafShadow,
      true,
      false
    );
  }

  private addTreeInstance(
    buckets: Map<string, TreeInstanceBucket>,
    chunkKey: string,
    kind: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrix: THREE.Matrix4,
    color: THREE.Color,
    castShadow: boolean,
    receiveShadow: boolean,
    lod: "full" | "far" = "full"
  ): void {
    const key = `${chunkKey}:${lod}:${kind}:${geometry.uuid}:${material.uuid}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geometry, material, matrices: [], colors: [], castShadow, receiveShadow, kind, chunkKey, lod };
      buckets.set(key, bucket);
    }
    bucket.matrices.push(matrix);
    bucket.colors.push(color);
  }

  private treeChunkKey(point: Vec2): string {
    return `${Math.floor(point.x / TREE_RENDER_CHUNK_SIZE)},${Math.floor(point.z / TREE_RENDER_CHUNK_SIZE)}`;
  }

  private ensureTreeRenderChunk(key: string): TreeRenderChunk {
    const existing = this.treeRenderChunks.get(key);
    if (existing) return existing;
    const [cellX, cellZ] = key.split(",").map(Number);
    const chunk: TreeRenderChunk = {
      center: new THREE.Vector2(
        (cellX + 0.5) * TREE_RENDER_CHUNK_SIZE,
        (cellZ + 0.5) * TREE_RENDER_CHUNK_SIZE
      ),
      fullMeshes: [],
      farMeshes: [],
      fullVisible: true,
      farVisible: false
    };
    this.treeRenderChunks.set(key, chunk);
    return chunk;
  }

  private treeInstanceColors(profile: TreeProfile, index: number): TreeInstanceColors {
    const trunk = profile === "gum" ? 0x8b806b : profile === "oak" ? 0x56402e : profile === "jacaranda" ? 0x6f6454 : profile === "kurrajong" ? 0x6d664d : 0x684d34;
    const leaf = profile === "gum" ? 0x748782 : profile === "oak" ? 0x5a5534 : profile === "elm" ? 0x62613b : profile === "jacaranda" ? 0x5b5b68 : profile === "kurrajong" ? 0x66775b : 0x597044;
    const leafHighlight = profile === "gum" ? 0x9aaca3 : profile === "oak" ? 0x9a8547 : profile === "elm" ? 0x9b8d53 : profile === "jacaranda" ? 0x9483a8 : profile === "kurrajong" ? 0x9aa27b : 0x81925b;
    const leafShadow = profile === "gum" ? 0x385653 : profile === "oak" ? 0x34321f : profile === "elm" ? 0x363923 : profile === "jacaranda" ? 0x343443 : profile === "kurrajong" ? 0x3b4c37 : 0x2f462e;
    const variant = index % 4;
    const hueOffset = (variant - 1.5) * 0.007;
    const saturationOffset = ((variant % 3) - 1) * 0.02;
    const lightOffset = ((variant % 5) - 2) * 0.018;
    return {
      trunk: new THREE.Color(trunk).offsetHSL(hueOffset, saturationOffset, lightOffset),
      leaf: new THREE.Color(leaf).offsetHSL(hueOffset * 1.4, saturationOffset, lightOffset),
      leafHighlight: new THREE.Color(leafHighlight).offsetHSL(hueOffset, saturationOffset * 0.5, lightOffset * 0.7),
      leafShadow: new THREE.Color(leafShadow).offsetHSL(hueOffset * 0.8, saturationOffset * 0.45, lightOffset * 0.35),
      paleBark: new THREE.Color(0xcdbf9f)
    };
  }

  private treeWorldMatrix(
    parentMatrix: THREE.Matrix4,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    scale: THREE.Vector3
  ): THREE.Matrix4 {
    return parentMatrix.clone().multiply(new THREE.Matrix4().compose(position, quaternion, scale));
  }

  private treeBranchWorldMatrix(
    parentMatrix: THREE.Matrix4,
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number
  ): THREE.Matrix4 {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return this.treeWorldMatrix(
      parentMatrix,
      start.clone().add(end).multiplyScalar(0.5),
      quaternion,
      new THREE.Vector3(radius, length, radius)
    );
  }

  private addUnderCanopyGroundWear(): void {
    const trees = this.level.trees.filter((tree) => pointInPolygon(tree.position, this.level.boundary));
    if (trees.length === 0) return;

    const circleGeometry = this.painterlyGeometry(new THREE.CircleGeometry(1, 22), this.materials.leafLitter);
    const litterMesh = new THREE.InstancedMesh(circleGeometry, this.materials.leafLitter, trees.length);
    const wearMesh = new THREE.InstancedMesh(circleGeometry, this.materials.wornGrass, trees.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let index = 0; index < trees.length; index += 1) {
      const tree = trees[index];
      const angle = this.angleFromId(tree.id);
      const canopyRadius = tree.canopyRadius * treeVisualMassing(tree).canopyWidth * (tree.profile === "gum" ? 0.72 : tree.profile === "oak" ? 0.95 : 0.84);
      const y = this.groundY(tree.position);
      const litterScale = this.winterLeafLitterScale(tree);
      const wearScale = tree.profile === "gum" ? 0.92 : tree.profile === "oak" ? 1.08 : tree.profile === "elm" ? 1.04 : 1;

      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, angle));
      scale.set(canopyRadius * (tree.canopyGroup === "avenue" ? 0.82 : 1) * litterScale, canopyRadius * 0.58 * litterScale, 1);
      matrix.compose(new THREE.Vector3(tree.position.x, y + 0.038, tree.position.z), quaternion, scale);
      litterMesh.setMatrixAt(index, matrix);

      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, angle + Math.PI * 0.5));
      scale.set(canopyRadius * 1.12 * wearScale, canopyRadius * 0.74 * wearScale, 1);
      matrix.compose(new THREE.Vector3(tree.position.x, y + 0.033, tree.position.z), quaternion, scale);
      wearMesh.setMatrixAt(index, matrix);
    }

    litterMesh.receiveShadow = true;
    wearMesh.receiveShadow = true;
    this.scene.add(wearMesh);
    this.scene.add(litterMesh);
  }

  private addRealisticTree(tree: MappedTree, index: number): void {
    const group = new THREE.Group();
    const point = tree.position;
    const profile = tree.profile;
    const isAvenueTree = tree.canopyGroup === "avenue" || (tree.source?.includes("avenue") ?? false);
    const isReplacementTree = this.isYoungReplacementTree(tree);
    const winterRetention = this.winterCanopyRetention(profile);
    const massing = treeVisualMassing(tree);
    const heritageScale = tree.height ? THREE.MathUtils.clamp(tree.height / 20, 0.72, 1.45) : isAvenueTree ? 1.08 : 1;
    const scale = this.rng.range(0.9, 1.35) * heritageScale * TREE_SCALE_MULTIPLIER * (isReplacementTree ? 0.68 : 1);
    const proceduralTrunkHeight =
      profile === "gum"
        ? this.rng.range(6.8, 9.8) * scale
        : profile === "oak"
          ? this.rng.range(4.5, 6.8) * scale
          : profile === "jacaranda"
            ? this.rng.range(4.1, 5.8) * scale
            : profile === "kurrajong"
            ? this.rng.range(4.4, 6.2) * scale
          : this.rng.range(5.2, 8.4) * scale;
    const trunkHeight = resolveTreeTrunkHeight(tree, proceduralTrunkHeight);
    const trunkRadius = this.rng.range(0.3, 0.54) * scale * (tree.dbh ? THREE.MathUtils.clamp(tree.dbh / 95, 0.8, 1.45) : isAvenueTree ? 1.08 : 1);
    const materials = this.getTreeMaterials(profile, index);

    const trunk = new THREE.Mesh(this.treeTrunkGeometry, materials.trunk);
    trunk.scale.set(trunkRadius, trunkHeight, trunkRadius);
    trunk.position.y = trunkHeight / 2;
    trunk.rotation.z = this.rng.range(-0.05, 0.05);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    for (let rootIndex = 0; rootIndex < 5; rootIndex += 1) {
      const angle = (rootIndex / 5) * Math.PI * 2 + this.rng.range(-0.22, 0.22);
      const length = trunkRadius * this.rng.range(2.6, 4.4);
      const root = new THREE.Mesh(this.treeRootGeometry, materials.trunk);
      root.scale.set(length, trunkRadius * 0.22, trunkRadius * 0.38);
      root.position.set(Math.cos(angle) * length * 0.38, trunkRadius * 0.08, Math.sin(angle) * length * 0.38);
      root.rotation.y = -angle;
      root.castShadow = true;
      root.receiveShadow = true;
      group.add(root);
    }

    const branchCount = profile === "gum" ? 5 : profile === "oak" || profile === "jacaranda" ? 7 : profile === "elm" || profile === "kurrajong" ? 6 : 5;
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const angle = (branchIndex / branchCount) * Math.PI * 2 + this.rng.range(-0.25, 0.25);
      const start = new THREE.Vector3(0, trunkHeight * this.rng.range(0.55, 0.78), 0);
      const end = new THREE.Vector3(
        Math.cos(angle) * this.rng.range(profile === "gum" ? 1.0 : 1.35, profile === "oak" || profile === "jacaranda" ? 3.2 : profile === "kurrajong" ? 2.2 : 2.6) * scale * massing.canopyWidth,
        trunkHeight * this.rng.range(profile === "gum" ? 0.72 : profile === "kurrajong" ? 0.76 : 0.68, 0.96),
        Math.sin(angle) * this.rng.range(profile === "gum" ? 1.0 : 1.35, profile === "oak" || profile === "jacaranda" ? 3.2 : profile === "kurrajong" ? 2.2 : 2.6) * scale * massing.canopyWidth
      );
      group.add(this.createBranch(start, end, trunkRadius * this.rng.range(0.28, 0.42), materials.trunk));
    }

    const twigCount = this.winterTwigCount(tree, index);
    for (let twigIndex = 0; twigIndex < twigCount; twigIndex += 1) {
      const angle = (twigIndex / Math.max(1, twigCount)) * Math.PI * 2 + this.rng.range(-0.26, 0.26);
      const reach = tree.canopyRadius * massing.canopyWidth * this.rng.range(profile === "oak" ? 0.42 : 0.32, profile === "oak" ? 0.72 : 0.58);
      const start = new THREE.Vector3(
        Math.cos(angle) * reach * 0.28,
        trunkHeight * this.rng.range(0.7, 0.92),
        Math.sin(angle) * reach * 0.28
      );
      const end = new THREE.Vector3(
        Math.cos(angle) * reach,
        trunkHeight + this.rng.range(0.7, profile === "oak" ? 2.0 : 1.55) * scale,
        Math.sin(angle) * reach
      );
      group.add(this.createBranch(start, end, trunkRadius * this.rng.range(0.08, 0.15), materials.trunk));
      const forkAngle = angle + this.rng.range(-0.42, 0.42);
      const forkEnd = new THREE.Vector3(
        end.x + Math.cos(forkAngle) * reach * 0.22,
        end.y + this.rng.range(-0.25, 0.45) * scale,
        end.z + Math.sin(forkAngle) * reach * 0.22
      );
      group.add(this.createBranch(end, forkEnd, trunkRadius * this.rng.range(0.045, 0.08), materials.trunk));
    }

    const baseLobeCount = profile === "gum" ? 5 : profile === "oak" ? 8 : profile === "elm" || profile === "jacaranda" ? 7 : profile === "kurrajong" ? 6 : 6;
    const lobeCount = Math.max(profile === "gum" || profile === "kurrajong" ? 4 : 2, Math.round(baseLobeCount * tree.canopyDensity * winterRetention + (tree.canopyGroup === "specimen" ? 1 : 0)));
    this.addCanopySilhouetteCore(group, tree, profile, trunkHeight, scale, winterRetention, materials);
    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
      const angle = (lobeIndex / lobeCount) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
      const canopyRadius =
        tree.canopyRadius *
        massing.canopyWidth *
        this.rng.range(profile === "gum" ? 0.22 : profile === "jacaranda" ? 0.2 : 0.25, profile === "oak" ? 0.42 : profile === "kurrajong" ? 0.34 : 0.36) *
        (profile === "gum" || profile === "kurrajong" ? 1 : 0.82 + winterRetention * 0.24);
      const spread =
        tree.canopyRadius *
        massing.canopyWidth *
        (profile === "gum" ? 0.28 : profile === "oak" || profile === "jacaranda" ? 0.5 : profile === "kurrajong" ? 0.38 : tree.canopyGroup === "avenue" ? 0.42 : 0.46);
      const canopyMaterial = lobeIndex % (profile === "gum" ? 3 : 4) === 0 ? materials.leafHighlight : materials.leaf;
      const canopy = new THREE.Mesh(this.treeCanopyGeometry, canopyMaterial);
      canopy.position.set(
        Math.cos(angle) * this.rng.range(spread * 0.45, spread),
        trunkHeight + this.rng.range(profile === "gum" ? -0.45 : profile === "kurrajong" ? -0.2 : 0.05, profile === "oak" ? 1.0 : profile === "jacaranda" ? 1.25 : 1.45) * scale,
        Math.sin(angle) * this.rng.range(spread * 0.45, spread)
      );
      canopy.scale.set(
        canopyRadius * this.rng.range(profile === "gum" ? 0.85 : profile === "kurrajong" ? 0.95 : 1.05, profile === "oak" || profile === "jacaranda" ? 1.75 : 1.55),
        canopyRadius * this.rng.range(profile === "gum" || profile === "kurrajong" ? 1.05 : 0.68, profile === "oak" ? 0.9 : profile === "jacaranda" ? 0.82 : 1.08) * (massing.canopyHeight / massing.canopyWidth),
        canopyRadius * this.rng.range(profile === "gum" ? 0.85 : profile === "kurrajong" ? 0.95 : 1.05, profile === "oak" || profile === "jacaranda" ? 1.75 : 1.55)
      );
      canopy.rotation.set(this.rng.range(-0.2, 0.2), this.rng.range(0, Math.PI), this.rng.range(-0.2, 0.2));
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      group.add(canopy);
    }

    if (profile === "gum") {
      const palePatch = new THREE.Mesh(this.treePaleBarkGeometry, materials.paleBark);
      palePatch.scale.set(trunkRadius, trunkHeight * 0.38, trunkRadius);
      palePatch.position.y = trunkHeight * 0.52;
      palePatch.rotation.z = this.rng.range(-0.05, 0.05);
      palePatch.castShadow = true;
      group.add(palePatch);
    }

    if (isReplacementTree) {
      this.addYoungReplacementTreeDetails(group, trunkRadius, trunkHeight);
    }

    group.position.set(point.x, this.groundY(point), point.z);
    group.rotation.y = this.rng.range(0, Math.PI * 2);
    group.userData.treeIndex = index;
    group.userData.treeSource = tree.source ?? "mapped";
    group.userData.treeSpecies = tree.label;
    this.scene.add(group);
  }

  private addCanopySilhouetteCore(
    group: THREE.Group,
    tree: MappedTree,
    profile: TreeProfile,
    trunkHeight: number,
    scale: number,
    winterRetention: number,
    materials: TreeMaterialSet
  ): void {
    const replacementScale = this.isYoungReplacementTree(tree) ? 0.68 : 1;
    const massing = treeVisualMassing(tree);
    const retentionScale = THREE.MathUtils.lerp(0.5, 1, winterRetention);
    const avenueScale = tree.canopyGroup === "avenue" ? 0.86 : tree.canopyGroup === "specimen" ? 1.06 : 1;
    const width =
      profile === "gum"
        ? 0.62
        : profile === "oak"
          ? 0.98
          : profile === "jacaranda"
            ? 0.84
            : profile === "kurrajong"
              ? 0.72
              : 0.86;
    const height =
      profile === "gum"
        ? 0.5
        : profile === "oak"
          ? 0.34
          : profile === "jacaranda"
            ? 0.3
            : profile === "kurrajong"
              ? 0.44
              : 0.32;
    const depth = profile === "gum" || profile === "kurrajong" ? width * 0.82 : width * 1.14;
    const core = new THREE.Mesh(this.treeCanopyCoreGeometry, materials.leafShadow);
    core.position.y = trunkHeight + (profile === "gum" ? 0.18 : profile === "oak" ? 0.56 : 0.42) * scale;
    core.scale.set(
      tree.canopyRadius * width * massing.canopyWidth * retentionScale * avenueScale * replacementScale,
      tree.canopyRadius * height * massing.canopyHeight * retentionScale * replacementScale,
      tree.canopyRadius * depth * massing.canopyWidth * retentionScale * avenueScale * replacementScale
    );
    core.rotation.set(this.rng.range(-0.08, 0.08), this.rng.range(0, Math.PI), this.rng.range(-0.08, 0.08));
    core.castShadow = true;
    core.receiveShadow = false;
    core.userData.kind = "tree-canopy-silhouette-core";
    group.add(core);
  }

  private isYoungReplacementTree(tree: MappedTree): boolean {
    return isYoungReplacementTreeRecord(tree);
  }

  private addYoungReplacementTreeDetails(group: THREE.Group, trunkRadius: number, trunkHeight: number): void {
    const stakeMaterial = this.standardDetailMaterial("replacement-tree-hardwood-stakes", 0x8a6a3e, 0.82, 0.02);
    const tieMaterial = this.standardDetailMaterial("replacement-tree-ties", 0x2f4d46, 0.72, 0.06);
    const mulchMaterial = this.washDetailMaterial("replacement-tree-mulch-ring", 0x6f5137, 0.36);
    const guardMaterial = this.standardDetailMaterial("replacement-tree-guard", 0xbec8bb, 0.48, 0.18, true, 0.38);
    const stakeHeight = Math.max(1.9, trunkHeight * 0.72);
    const stakeOffset = Math.max(0.36, trunkRadius * 2.35);

    const mulch = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.8, trunkRadius * 3.8), 22), mulchMaterial);
    mulch.rotation.x = -Math.PI / 2;
    mulch.position.y = 0.035;
    mulch.receiveShadow = true;
    group.add(mulch);

    for (const side of [-1, 1]) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, stakeHeight, 8), stakeMaterial);
      stake.position.set(side * stakeOffset, stakeHeight * 0.5, -trunkRadius * 0.28);
      stake.castShadow = true;
      group.add(stake);
    }
    for (const y of [stakeHeight * 0.44, stakeHeight * 0.66]) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(stakeOffset * 2.12, 0.055, 0.055), tieMaterial);
      tie.position.set(0, y, -trunkRadius * 0.3);
      tie.castShadow = true;
      group.add(tie);
    }

    const guard = new THREE.Mesh(new THREE.CylinderGeometry(stakeOffset * 1.18, stakeOffset * 1.24, 0.55, 12, 1, true), guardMaterial);
    guard.position.y = 0.36;
    guard.castShadow = false;
    group.add(guard);
  }

  private createBranch(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const branch = new THREE.Mesh(this.treeBranchGeometry, material);
    branch.scale.set(radius, length, radius);
    branch.position.copy(start).add(end).multiplyScalar(0.5);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    branch.castShadow = true;
    return branch;
  }

  private winterCanopyRetention(profile: TreeProfile): number {
    if (profile === "gum") return 1;
    if (profile === "kurrajong") return 0.9;
    if (profile === "jacaranda") return 0.22;
    if (profile === "oak") return 0.46;
    if (profile === "elm") return 0.36;
    return 0.72;
  }

  private winterTwigCount(tree: MappedTree, index: number): number {
    if (tree.profile === "gum") return tree.canopyGroup === "specimen" ? 1 : 0;
    if (tree.profile === "kurrajong") return this.isYoungReplacementTree(tree) ? 2 : 1;
    if (tree.profile === "jacaranda") return this.isYoungReplacementTree(tree) ? 6 : 8;
    if (tree.profile === "oak") return tree.canopyGroup === "mapped" ? 4 : 7;
    if (tree.profile === "elm") return tree.canopyGroup === "mapped" ? 3 : 6;
    return index % 3 === 0 ? 2 : 0;
  }

  private winterLeafLitterScale(tree: MappedTree): number {
    if (tree.profile === "oak") return tree.canopyGroup === "specimen" ? 1.28 : 1.16;
    if (tree.profile === "elm") return tree.canopyGroup === "avenue" ? 1.24 : 1.12;
    if (tree.profile === "jacaranda") return this.isYoungReplacementTree(tree) ? 0.5 : 0.72;
    if (tree.profile === "kurrajong") return 0.58;
    if (tree.profile === "gum") return 0.64;
    return 0.82;
  }

  private getTreeMaterials(profile: TreeProfile, _index: number): TreeMaterialSet {
    const key = profile;
    const cached = this.treeMaterialCache.get(key);
    if (cached) return cached;
    const colors = this.treeInstanceColors(profile, 0);
    const materials = {
      trunk: new THREE.MeshToonMaterial({
        color: colors.trunk,
        emissive: 0x160f0a,
        emissiveIntensity: 0.12,
        gradientMap: WORLD_TOON_RAMP
      }),
      leaf: new THREE.MeshToonMaterial({
        color: colors.leaf,
        emissive: 0x0e2119,
        emissiveIntensity: 0.14,
        gradientMap: WORLD_TOON_RAMP
      }),
      leafHighlight: new THREE.MeshToonMaterial({
        color: colors.leafHighlight,
        emissive: 0x17281c,
        emissiveIntensity: 0.1,
        gradientMap: WORLD_TOON_RAMP
      }),
      leafShadow: new THREE.MeshToonMaterial({
        color: colors.leafShadow,
        emissive: 0x07130f,
        emissiveIntensity: 0.16,
        gradientMap: WORLD_TOON_RAMP
      }),
      paleBark: new THREE.MeshToonMaterial({
        color: colors.paleBark,
        emissive: 0x21170e,
        emissiveIntensity: 0.1,
        gradientMap: WORLD_TOON_RAMP
      })
    };
    this.treeMaterialCache.set(key, materials);
    return materials;
  }

  private addLabel(text: string, position: Vec2, height: number): void {
    if (!FLOATING_WORLD_LABELS_ENABLED || this.suppressLabels) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(7, 17, 25, 0.78)";
    ctx.fillRect(0, 24, 512, 76);
    ctx.strokeStyle = "rgba(245, 184, 88, 0.82)";
    ctx.strokeRect(8, 30, 496, 64);
    ctx.fillStyle = "#ede0aa";
    let fontSize = 34;
    do {
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      fontSize -= 2;
    } while (ctx.measureText(text).width > 468 && fontSize >= 18);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.set(position.x, this.groundY(position) + height, position.z);
    sprite.scale.set(18, 4.5, 1);
    this.scene.add(sprite);
  }
}

function createInstancedTreeMaterials(): TreeMaterialSet {
  return {
    trunk: instancedTreeMaterial(0x160f0a, 0.12),
    leaf: instancedTreeMaterial(0x0e2119, 0.14),
    leafHighlight: instancedTreeMaterial(0x17281c, 0.1),
    leafShadow: instancedTreeMaterial(0x07130f, 0.16),
    paleBark: instancedTreeMaterial(0x21170e, 0.1)
  };
}

function createInstancedTreeLodMaterials(): TreeMaterialSet {
  const trunk = instancedTreeMaterial(0x160f0a, 0.15);
  const leaf = instancedTreeMaterial(0x0a1a13, 0.18);
  return { trunk, leaf, leafHighlight: leaf, leafShadow: leaf, paleBark: trunk };
}

function instancedTreeMaterial(emissive: THREE.ColorRepresentation, emissiveIntensity: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: 0xffffff,
    emissive,
    emissiveIntensity,
    gradientMap: WORLD_TOON_RAMP,
    vertexColors: true
  });
}

function createGrassClumpGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [];
  const bladeCount = 9;

  for (let index = 0; index < bladeCount; index += 1) {
    const angle = (index / bladeCount) * Math.PI * 2;
    const right = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const forward = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const width = 0.038 + (index % 3) * 0.012;
    const height = 0.58 + (index % 5) * 0.082;
    const lean = 0.055 + (index % 2) * 0.045;
    const baseOffset = forward.clone().multiplyScalar((index - bladeCount / 2) * 0.012);
    const left = baseOffset.clone().addScaledVector(right, -width);
    const rightBase = baseOffset.clone().addScaledVector(right, width);
    const midLeft = baseOffset.clone().addScaledVector(right, -width * 0.58).addScaledVector(forward, lean * 0.42);
    const midRight = baseOffset.clone().addScaledVector(right, width * 0.54).addScaledVector(forward, lean * 0.52);
    const tip = baseOffset.clone().addScaledVector(forward, lean);
    midLeft.y = height * 0.56;
    midRight.y = height * 0.62;
    tip.y = height;

    vertices.push(
      left.x, 0, left.z, rightBase.x, 0, rightBase.z, midRight.x, midRight.y, midRight.z,
      left.x, 0, left.z, midRight.x, midRight.y, midRight.z, midLeft.x, midLeft.y, midLeft.z,
      midLeft.x, midLeft.y, midLeft.z, midRight.x, midRight.y, midRight.z, tip.x, tip.y, tip.z
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, salt: number): number {
  let value = seed ^ Math.imul(salt + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function seededRange(seed: number, salt: number, min: number, max: number): number {
  return min + (max - min) * seededUnit(seed, salt);
}

function alphaHex(alpha: number): string {
  return Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
}

function mixHex(a: string, b: string, amount: number): string {
  const left = parseHexColor(a);
  const right = parseHexColor(b);
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  const channel = (key: keyof typeof left) => Math.round(THREE.MathUtils.lerp(left[key], right[key], t));
  return `#${channel("r").toString(16).padStart(2, "0")}${channel("g").toString(16).padStart(2, "0")}${channel("b")
    .toString(16)
    .padStart(2, "0")}`;
}

function parseHexColor(value: string): { r: number; g: number; b: number } {
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16)
  };
}
