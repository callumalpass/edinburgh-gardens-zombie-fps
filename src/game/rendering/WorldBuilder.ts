import * as THREE from "three";
import { distance, distanceToSegment, geoToWorld, makeCircle, nearestPointOnPolygon, pointInPolygon, polygonCentroid } from "../geo";
import { AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES, footballPostLocalOffsets } from "../sportsFixtures";
import type {
  AmenityPoint,
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
  StreetEdge,
  TreeProfile,
  UpgradeStation,
  Vec2
} from "../types";
import { MELBOURNE_ANIME_PALETTE, createAnimeToonRamp, tuneAnimeMaterial } from "./animeStyle";
import { MeshFactory } from "./MeshFactory";
import { pathPreviewMaterialKey, type ObjectPreviewTarget } from "./objectPreview";
import {
  createTerrainOverlayDiscGeometry,
  createTerrainOverlayEllipseGeometry,
  createTerrainOverlayRectGeometry
} from "./terrainOverlay";
import type { TimeOfDayState } from "./timeOfDay";
import type { WeatherState } from "./weather";
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

type StyledSurfaceMaterial = THREE.MeshStandardMaterial | THREE.MeshToonMaterial;

interface TreeMaterialSet {
  trunk: THREE.Material;
  leaf: THREE.Material;
  leafHighlight: THREE.Material;
  paleBark: THREE.Material;
}

interface ParkEntrance {
  position: Vec2;
  angle: number;
  width: number;
  sign: boolean;
  name: string;
  transit: "tram" | "rail-trail" | "neighbourhood";
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
  private readonly detailMaterialCache = new Map<string, THREE.Material>();
  private readonly treeMaterialCache = new Map<string, TreeMaterialSet>();
  private readonly treeTrunkGeometry = new THREE.CylinderGeometry(0.72, 1, 1, 8);
  private readonly treeBranchGeometry = new THREE.CylinderGeometry(0.55, 1, 1, 6);
  private readonly treeRootGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly treeCanopyGeometry = new THREE.IcosahedronGeometry(1, 2);
  private readonly treePaleBarkGeometry = new THREE.CylinderGeometry(0.74, 0.88, 1, 8);
  private ambientLight: THREE.HemisphereLight | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
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
    moon.position.set(-150, 205, 75);
    moon.castShadow = true;
    moon.shadow.camera.left = -360;
    moon.shadow.camera.right = 360;
    moon.shadow.camera.top = 360;
    moon.shadow.camera.bottom = -360;
    moon.shadow.mapSize.set(2048, 2048);
    this.scene.add(moon);

    const emergency = new THREE.PointLight(0xe34b43, 5.2, 145);
    this.emergencyLight = emergency;
    emergency.position.set(22, 7, 48);
    this.scene.add(emergency);

    this.addGround();
    this.addStreetEdges();
    this.addMownLawnBands();
    this.addLawnWearPatches();
    this.addPaintedLawnWashes();
    this.addDistantGroundBreakup();
    this.addPaths();
    this.addPathSurfacePatches();
    this.addHardscapeLines();
    this.addDampGroundDetails();
    this.addWetPathSheen();
    this.addGrassClumps();
    this.addRailTrailRemnants();
    this.addLandmarks();
    this.addSportsFixtures();
    this.addMappedBuildings();
    this.addMappedFences();
    this.addAmenities();
    this.addParkLifeDetails();
    this.addPathLights();
    this.addParkEntranceDetails();
    this.addMelbourneMarkers();
    this.addBoundaryFence();
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
    } else if (target.kind === "street-edge") {
      const street = this.level.streetEdges.find((candidate) => candidate.id === target.sourceId);
      if (street) this.addStreetEdgePreview(street);
    } else if (target.kind === "sports-fixture") {
      const fixture = this.level.sportsFixtures.find((candidate) => candidate.id === target.sourceId);
      if (fixture) this.addSportsFixturePreview(fixture);
    } else if (target.kind === "amenity") {
      const amenity = this.level.amenities.find((candidate) => candidate.id === target.sourceId);
      if (amenity) this.addAmenityPreview(amenity);
    } else if (target.kind === "park-life-detail") {
      const detail = this.level.parkLifeDetails.find((candidate) => candidate.id === target.sourceId);
      if (detail) this.addParkLifeDetailPreview(detail);
    } else if (target.kind === "rideable-bike") {
      this.addRideableBikePreview();
    } else if (target.kind === "tree") {
      const tree = this.level.trees.find((candidate) => candidate.id === target.sourceId);
      if (tree) this.addRealisticTree(tree, target.sourceIndex ?? this.level.trees.indexOf(tree));
    } else if (target.kind === "upgrade-station") {
      const station = this.level.upgradeStations.find((candidate) => candidate.id === target.sourceId);
      if (station) this.addUpgradeStation(station);
    } else if (target.kind === "weapon-spawn" || target.kind === "weapon-model") {
      if (target.weaponId) this.addWeaponItemPreview(target);
    } else if (target.kind === "pickup-item") {
      if (target.pickupKind) this.addPickupItemPreview(target);
    } else if (target.kind === "zombie-model") {
      if (target.zombieType) this.addZombieModelPreview(target);
    }
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
    const radius = Math.max(4, target.radius * 1.35);
    const platform = this.createTerrainOverlayDisc(target.position, radius, 0.02, this.materials.grass);
    platform.receiveShadow = true;
    this.scene.add(platform);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.92, radius, 48),
      new THREE.MeshBasicMaterial({ color: 0xf0cf7a, transparent: true, opacity: 0.34, side: THREE.DoubleSide })
    );
    ring.position.set(target.position.x, this.groundY(target.position) + 0.075, target.position.z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    this.addLabel(target.label, target.position, target.height + 1.15);
  }

  private addLandmarkPreview(landmark: Landmark): void {
    if (landmark.kind === "park") return;
    if (landmark.kind === "garden" && landmark.polygon) this.addGardenZone(landmark);
    if (landmark.kind === "oval" && landmark.polygon) this.addOval(landmark);
    if (landmark.kind === "grandstand" && landmark.polygon) this.addGrandstand(landmark);
    if (landmark.kind === "tennis" && landmark.polygon) {
      this.addFenceAround(landmark.polygon, 2.2, 0x93a59a);
      this.addTennisClubDetails(landmark.polygon);
    }
    if (landmark.kind === "court" && landmark.polygon) {
      this.addFlatPolygon(landmark.polygon, this.materials.court, 0.09);
      this.addTennisCourtLines(landmark.polygon);
      this.addTennisNet(landmark.polygon);
      this.addTennisCourtWorksCues(landmark);
    }
    if (landmark.kind === "bowls" && landmark.polygon) {
      this.addFlatPolygon(landmark.polygon, this.materials.court, 0.08, landmark.id.startsWith("bowling-green") ? 0.86 : 0.6);
      if (landmark.id === "bowling") {
        this.addFenceAround(landmark.polygon, 1.15, 0x677362);
        this.addBowlsClubDetails(landmark.polygon);
      }
      if (landmark.id.startsWith("bowling-green")) {
        this.addBowlingRinkLines(landmark.polygon);
        this.addLowHedgeAround(landmark.polygon, 0.52, 0.42);
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
    const angle = this.angleFromId(amenity.id);
    if (amenity.kind === "bench") {
      this.addBench(amenity.position, angle);
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
      this.addSupplyCrate(amenity.position, angle);
      this.addAmenityHalo(amenity.position, 0xd0a343, 0.64);
    } else if (amenity.kind === "toilets") {
      this.addToiletSign(amenity.position, angle);
      this.addAmenityHalo(amenity.position, 0x61a8d3, 0.52);
    } else if (this.isStructureAmenity(amenity)) {
      this.addStructureAccessCue(amenity, angle);
      this.addAmenityHalo(amenity.position, 0xe3a84a, 0.58);
    }
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
      this.keyLight.intensity = 2.36 + timeOfDay.daylight * 0.9 + timeOfDay.dawnDusk * 0.22;
      this.keyLight.position.set(
        THREE.MathUtils.lerp(-150, 130, timeOfDay.daylight),
        THREE.MathUtils.lerp(205, 175, timeOfDay.daylight),
        THREE.MathUtils.lerp(75, -120, timeOfDay.daylight)
      );
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
      material.opacity = (0.035 + lampT * 0.15) * (0.86 + wetness * 0.38);
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

  createUpgradeStations(): void {
    for (const station of this.level.upgradeStations) {
      this.addUpgradeStation(station);
    }
  }

  private addUpgradeStation(station: UpgradeStation): void {
    const material = this.standardDetailMaterial("upgrade-station-crate", 0xd0a343, 0.55, 0.08);
    const group = new THREE.Group();
    group.name = station.label;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.8), material);
    crate.position.y = 0.75;
    crate.castShadow = true;
    group.add(crate);

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
    const addVertex = (point: Vec2) => {
      vertices.push(point.x, this.groundY(point), point.z);
      uvs.push((point.x - minX) / 26, (point.z - minZ) / 26);
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
      const patch = new THREE.Mesh(new THREE.CircleGeometry(index % 3 === 0 ? 4.2 : 2.7, 18), this.materials.wornGrass);
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
      const stripe = new THREE.Mesh(new THREE.CircleGeometry(band.radius, 36), this.materials.wornGrass);
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

  private pathSurfacePatchMaterial(patch: PathSurfacePatch): THREE.Material {
    if (patch.material === "worn-grass") return this.materials.wornGrass;
    if (patch.material === "gravel") return this.materials.gravel;
    if (patch.material === "leaf-litter") return this.materials.leafLitter;
    return this.materials.dirt;
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
    const geometry = new THREE.BoxGeometry(0.52, line.height, 0.36);
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

  private addRailTrailRemnants(): void {
    const sleeperMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4731, roughness: 0.86 });
    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xb7af98, roughness: 0.78 });
    let markerCount = 0;

    for (const path of this.level.paths.filter((candidate) => candidate.kind === "rail")) {
      for (let i = 0; i < path.points.length - 1; i += 1) {
        const a = path.points[i];
        const b = path.points[i + 1];
        const segmentLength = distance(a, b);
        if (segmentLength < 6) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const angle = Math.atan2(dz, dx);
        const sleeperCount = Math.floor(segmentLength / 10);

        for (let step = 1; step <= sleeperCount; step += 1) {
          const t = step / (sleeperCount + 1);
          const sleeper = new THREE.Mesh(new THREE.BoxGeometry(path.width * 0.92, 0.065, 0.28), sleeperMaterial);
          const point = { x: a.x + dx * t, z: a.z + dz * t };
          sleeper.rotation.y = -angle + Math.PI / 2;
          sleeper.position.set(point.x, this.boxSupportY(point, sleeper.rotation.y, path.width * 0.46, 0.14) + 0.145, point.z);
          sleeper.castShadow = true;
          sleeper.receiveShadow = true;
          this.scene.add(sleeper);
        }

        if (markerCount % 2 === 0) {
          const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 8), markerMaterial);
          marker.position.set(a.x, this.groundY(a) + 0.45, a.z);
          marker.castShadow = true;
          this.scene.add(marker);
        }
        markerCount += 1;
      }
    }
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
    const terraceWidth = Math.max(4.5, footprint.halfX * 1.72);
    const terraceDepth = Math.max(1.2, footprint.halfZ * 0.32);
    const plantedDepth = Math.max(6, footprint.halfZ * 1.55);
    const startZ = -plantedDepth * 0.5 + terraceDepth * 0.5;

    const base = this.createTerrainRect(center, rotation, terraceWidth + 1.2, plantedDepth + 1.1, 0.066, 0.028, this.materials.leafLitter);
    base.receiveShadow = true;
    this.scene.add(base);
    this.addFeatureOutline(polygon, 0x7fa08c, 0.5);

    for (let terrace = 0; terrace < 4; terrace += 1) {
      const localZ = startZ + terrace * (plantedDepth / 4);
      const material = terrace % 2 === 0 ? this.materials.mulch : this.materials.wornGrass;
      this.addLocalBox(center, rotation, 0, localZ, terraceWidth, 0.04, terraceDepth, material, 0.08, false);
      if (terrace < 3) {
        this.addLocalBox(center, rotation, 0, localZ + terraceDepth * 0.58, terraceWidth * 0.94, 0.18, 0.13, this.materials.basalt, 0.15);
      }
    }

    const channelLocal: Vec2[] = [
      { x: -footprint.halfX * 0.62, z: -plantedDepth * 0.42 },
      { x: footprint.halfX * 0.54, z: -plantedDepth * 0.25 },
      { x: -footprint.halfX * 0.5, z: -plantedDepth * 0.07 },
      { x: footprint.halfX * 0.52, z: plantedDepth * 0.12 },
      { x: -footprint.halfX * 0.36, z: plantedDepth * 0.29 },
      { x: footprint.halfX * 0.58, z: plantedDepth * 0.43 }
    ];
    this.addRaingardenLowFlowChannel(center, rotation, channelLocal);

    const inlet = channelLocal[0];
    const outlet = channelLocal[channelLocal.length - 1];
    this.addLocalCylinder(center, rotation, inlet.x - 0.55, inlet.z - 0.25, 0.52, 0.58, 0.09, this.materials.basalt);
    this.addLocalCylinder(center, rotation, inlet.x - 0.55, inlet.z - 0.25, 0.35, 0.35, 0.045, this.materials.metal, 0.09);
    this.addLocalCylinder(center, rotation, outlet.x + 0.4, outlet.z + 0.25, 0.48, 0.52, 0.08, this.materials.concrete);
    this.addLocalCylinder(center, rotation, outlet.x + 0.4, outlet.z + 0.25, 0.28, 0.28, 0.04, this.materials.metal, 0.08);
    this.addLocalBox(center, rotation, 0, plantedDepth * 0.49, terraceWidth * 0.62, 0.035, 0.32, this.materials.concrete, 0.105, false);
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
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), this.materials.concrete);
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
      if (landmark.kind === "tennis" && landmark.polygon) {
        this.addFenceAround(landmark.polygon, 2.2, 0x93a59a);
        this.addTennisClubDetails(landmark.polygon);
      }
      if (landmark.kind === "court" && landmark.polygon) {
        this.addFlatPolygon(landmark.polygon, this.materials.court, 0.09);
        this.addTennisCourtLines(landmark.polygon);
        this.addTennisNet(landmark.polygon);
        this.addTennisCourtWorksCues(landmark);
      }
      if (landmark.kind === "bowls" && landmark.polygon) {
        this.addFlatPolygon(landmark.polygon, this.materials.court, 0.08, landmark.id.startsWith("bowling-green") ? 0.86 : 0.6);
        if (landmark.id === "bowling") {
          this.addFenceAround(landmark.polygon, 1.15, 0x677362);
          this.addBowlsClubDetails(landmark.polygon);
        }
        if (landmark.id.startsWith("bowling-green")) {
          this.addBowlingRinkLines(landmark.polygon);
          this.addLowHedgeAround(landmark.polygon, 0.52, 0.42);
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

  private addMappedBuilding(building: MappedBuilding): void {
    if (building.detailProfile === "rotunda-pavilion") {
      return;
    }

    if (building.id === "osm-man-made-715802679") {
      this.addMappedStorageTank(building);
      return;
    }

    const material =
      building.material === "brick" ? this.materials.brick : building.material === "timber" ? this.materials.timber : this.materials.concrete;
    const mesh = this.addPrismPolygon(building.polygon, building.height, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const center = polygonCentroid(building.polygon);
    const roof = this.addPrismPolygon(building.polygon, 0.18, this.materials.metal, building.height + 0.08);
    roof.castShadow = true;

    if (building.id === "osm-building-543505702" || building.id === "osm-building-242003562") {
      this.addLabel(building.label, center, building.height + 1.8);
    }
    this.addMappedBuildingDetails(building, center);
  }

  private addMappedStorageTank(building: MappedBuilding): void {
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0);
    const center = footprint.center;
    const rotation = -footprint.angle;
    const radius = Math.max(0.58, Math.min(footprint.halfX, footprint.halfZ) * 0.94);
    const groundY = this.radialSupportY(center, radius + 0.35);
    const tankMaterial = this.standardDetailMaterial("storage-tank-body", 0x7e8780, 0.56, 0.3);
    const lidMaterial = this.standardDetailMaterial("storage-tank-lid", 0xa9b1a9, 0.48, 0.42);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.36, radius + 0.44, 0.08, 24), this.materials.concrete);
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
    this.addLocalCylinder(center, rotation, radius * 0.18, -radius * 0.16, radius * 0.22, radius * 0.22, 0.08, this.materials.metal, building.height + 0.18);

    for (const side of [-1, 1]) {
      this.addLocalBox(center, rotation, side * 0.14, radius + 0.08, 0.045, building.height * 0.72, 0.05, this.materials.metal, 0.12 + building.height * 0.36, false);
    }
    for (let rung = 0; rung < 4; rung += 1) {
      this.addLocalBox(center, rotation, 0, radius + 0.11, 0.36, 0.035, 0.055, this.materials.metal, 0.38 + rung * 0.32, false);
    }
    this.addLocalCylinder(center, rotation, -radius * 0.72, radius * 0.68, 0.055, 0.055, 0.72, this.materials.metal, 0.05);
    this.addLocalBox(center, rotation, -radius * 0.72, radius * 1.02, 0.42, 0.18, 0.24, this.materials.metal, 0.22);
  }

  private addMappedBuildingDetails(building: MappedBuilding, center: Vec2): void {
    if (!building.detailProfile) return;
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0, building.facade?.frontagePoint);
    const rotation = -footprint.angle;
    const frontZ = footprint.halfZ + 0.08;
    const rearZ = -footprint.halfZ - 0.08;

    if (building.detailProfile === "tennis-pavilion") {
      this.addBuildingApron(center, rotation, 0, frontZ + 0.9, footprint.halfX * 1.45, 1.55);
      this.addBuildingAwning(center, rotation, 0, frontZ + 0.72, footprint.halfX * 1.5, 1.28, building.height + 0.1, this.materials.metal);
      for (const x of [-0.42, 0, 0.42]) {
        this.addLocalCylinder(center, rotation, x * footprint.halfX * 2, frontZ + 0.42, 0.055, 0.07, 2.7, this.materials.metal);
      }
      this.addBuildingGutter(center, rotation, 0, frontZ + 0.03, footprint.halfX * 1.86, building.height);
      this.addBuildingWallLight(center, rotation, -footprint.halfX * 0.72, frontZ + 0.06, 2.32);
      this.addBuildingSign(center, rotation, -footprint.halfX * 0.28, frontZ + 0.04, footprint.halfX * 0.36, 0.34, 2.28, 0x2f735c);
      this.addBuildingTextSign(center, rotation, footprint.halfX * 0.28, frontZ + 0.055, footprint.halfX * 0.54, 0.38, 2.34, "TENNIS", "#2f735c", "#f4e7b8");
      this.addBuildingTextSign(center, rotation, footprint.halfX * 0.68, frontZ + 1.62, footprint.halfX * 0.34, 0.34, 1.58, "WORKS", "#e36e2f", "#18110b");
      this.addLocalBox(center, rotation, -footprint.halfX * 0.62, frontZ + 1.42, footprint.halfX * 0.58, 0.07, 1.12, this.materials.concrete, 0.16, false);
      for (const side of [-1, 1]) {
        this.addLocalBox(center, rotation, -footprint.halfX * 0.62 + side * footprint.halfX * 0.34, frontZ + 1.42, 0.055, 0.72, 1.08, this.materials.metal, 0.52);
      }
      const worksMesh = this.standardDetailMaterial("tennis-works-mesh", 0xd06a2c, 0.68, 0.02, true, 0.58);
      for (const x of [0.42, 0.82]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 1.58, 0.08, 1.28, 0.08, this.materials.metal, 0.74);
      }
      this.addLocalBox(center, rotation, footprint.halfX * 0.62, frontZ + 1.58, footprint.halfX * 0.62, 0.78, 0.045, worksMesh, 0.78, false);
      for (const x of [-0.55, 0, 0.55]) {
        this.addBuildingWindow(center, rotation, x * footprint.halfX * 1.15, rearZ - 0.03, footprint.halfX * 0.3, 1.15, 1.45);
      }
      for (const x of [-0.48, 0.36]) {
        this.addBuildingRoofVent(center, rotation, x * footprint.halfX, -footprint.halfZ * 0.2, building.height, 0.52, 0.32);
      }
      for (const x of [0.42, 0.7]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, rearZ - 0.42, 0.52, 0.82, 0.42, this.materials.metal, 0.5);
      }
      this.addLocalBox(center, rotation, 0, rearZ - 0.08, footprint.halfX * 1.35, 1.55, 0.12, this.materials.hedge, 1.1);
      this.addLabel("Fitzroy Tennis Club", center, building.height + 1.45);
      return;
    }

    if (building.detailProfile === "bowling-club") {
      const muralBlue = this.basicDetailMaterial("bowls-mural-blue", 0x234f88);
      const muralMaroon = this.basicDetailMaterial("bowls-mural-maroon", 0x7b263b);
      const muralGold = this.basicDetailMaterial("bowls-mural-gold", 0xd0a13a);
      this.addBuildingApron(center, rotation, -footprint.halfX * 0.18, frontZ + 0.82, footprint.halfX * 1.42, 1.7, 0.12);
      this.addBuildingAwning(center, rotation, -footprint.halfX * 0.18, frontZ + 0.58, footprint.halfX * 1.5, 1.35, building.height + 0.08, this.materials.timber, 0.22);
      this.addBuildingGutter(center, rotation, -footprint.halfX * 0.18, frontZ + 0.03, footprint.halfX * 1.72, building.height);
      this.addBuildingGutter(center, rotation, 0, rearZ - 0.03, footprint.halfX * 1.62, building.height);
      for (const x of [-0.58, -0.22, 0.14, 0.5]) {
        this.addBuildingWindow(center, rotation, x * footprint.halfX, frontZ - 0.02, 1.35, 0.86, 1.36, 0.09);
      }
      this.addBuildingSign(center, rotation, -footprint.halfX * 0.12, frontZ + 0.04, footprint.halfX * 0.56, 0.36, 2.38, 0x223f64);
      for (const x of [-0.66, 0.66]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.25, 0.12, 1.35, 0.12, this.materials.timber, 0.8);
      }
      for (const placement of [
        { z: -0.42, material: muralBlue },
        { z: 0.03, material: muralMaroon },
        { z: 0.48, material: muralBlue }
      ]) {
        this.addLocalBox(center, rotation, -footprint.halfX - 0.035, placement.z * footprint.halfZ, 0.07, 1.18, footprint.halfZ * 0.38, placement.material, 1.55, false);
      }
      this.addLocalBox(center, rotation, -footprint.halfX - 0.06, footprint.halfZ * 0.08, 0.08, 0.34, 0.32, muralGold, 2.18, false);
      this.addBowlsMuralMotifs(center, rotation, footprint);
      this.addBuildingTextSign(center, rotation, -footprint.halfX * 0.12, frontZ + 0.055, footprint.halfX * 0.64, 0.34, 2.46, "BOWLS", "#223f64", "#f3d47d");
      for (const x of [-0.42, 0.36]) {
        this.addBuildingRoofVent(center, rotation, x * footprint.halfX, -footprint.halfZ * 0.22, building.height, 0.58, 0.34);
      }
      this.addLocalBox(center, rotation, footprint.halfX * 0.72, frontZ + 1.12, 0.8, 0.48, 0.32, this.materials.timber, 0.32);
      this.addLabel("Fitzroy Victoria Bowling Club", center, building.height + 1.45);
      return;
    }

    if (building.detailProfile === "gatehouse") {
      this.addBuildingAwning(center, rotation, 0, 0, footprint.halfX * 2.3, footprint.halfZ * 2.45, building.height + 0.16, this.materials.timber, 0.42);
      this.addBuildingApron(center, rotation, 0, frontZ + 0.7, footprint.halfX * 1.15, 0.72, 0.08);
      this.addBuildingDoor(center, rotation, 0, frontZ + 0.02, footprint.halfX * 0.82, 1.65, 1.08);
      this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 2.05, building.height);
      this.addBuildingWindow(center, rotation, 0, rearZ - 0.02, footprint.halfX * 0.72, 0.46, 1.48, 0.08);
      this.addBuildingSign(center, rotation, 0, rearZ - 0.035, footprint.halfX * 0.9, 0.32, 1.95, 0x5c4630);
      this.addBuildingTextSign(center, rotation, 0, frontZ + 0.035, footprint.halfX * 1.05, 0.3, 2.18, "GATE", "#5c4630", "#f2e6a8");
      for (const x of [-0.72, 0.72]) {
        this.addBuildingSign(center, rotation, x * footprint.halfX, frontZ + 0.015, footprint.halfX * 0.42, 0.62, 1.78, 0xe8e0b6);
      }
      for (const x of [-0.92, 0.92]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.72, 0.12, 0.88, 0.12, this.materials.metal, 0.5);
      }
      this.addLocalBox(center, rotation, 0, frontZ + 0.72, footprint.halfX * 1.85, 0.08, 0.08, this.materials.metal, 0.74);
      this.addLabel("Freeman Street gatehouse", center, building.height + 1.15);
      return;
    }

    if (building.detailProfile === "rotunda-pavilion") {
      const pavilionRadius = Math.min(footprint.halfX, footprint.halfZ) * 0.84;
      const dome = new THREE.Mesh(new THREE.ConeGeometry(footprint.halfX * 1.45, 0.9, 18), this.materials.timber);
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
      this.addBuildingApron(center, rotation, 0, frontZ + 0.48, footprint.halfX * 1.35, 1.05, 0.1);
      for (const x of [-0.62, -0.22, 0.22, 0.62]) {
        this.addBuildingWindow(center, rotation, x * footprint.halfX, frontZ + 0.02, footprint.halfX * 0.32, 0.72, 1.82);
      }
      this.addBuildingSign(center, rotation, -footprint.halfX * 0.24, frontZ + 0.04, footprint.halfX * 0.52, 0.34, 2.42, 0x315d67);
      this.addBuildingTextSign(center, rotation, footprint.halfX * 0.36, frontZ + 0.055, footprint.halfX * 0.58, 0.34, 2.5, "EMELY", "#315d67", "#f2e6a8");
      this.addLocalBox(center, rotation, -footprint.halfX * 0.62, frontZ + 1.04, footprint.halfX * 0.48, 0.07, 1.1, this.materials.concrete, 0.16, false);
      for (const side of [-1, 1]) {
        this.addLocalBox(center, rotation, -footprint.halfX * 0.62 + side * footprint.halfX * 0.28, frontZ + 1.04, 0.055, 0.7, 1.05, this.materials.metal, 0.52);
      }
      const courtyardZ = rearZ - 1.65;
      this.addLocalBox(center, rotation, 0, courtyardZ, footprint.halfX * 1.46, 0.06, 2.4, this.materials.concrete, 0.1, false);
      for (const x of [-0.78, 0.78]) {
        for (const z of [-0.56, 0.56]) {
          this.addLocalCylinder(center, rotation, x * footprint.halfX, courtyardZ + z * 2.05, 0.045, 0.055, 1.25, this.materials.metal);
        }
      }
      this.addLocalBox(center, rotation, 0, courtyardZ - 1.15, footprint.halfX * 1.62, 0.08, 0.08, this.materials.metal, 0.72);
      this.addLocalBox(center, rotation, 0, courtyardZ + 1.15, footprint.halfX * 1.62, 0.08, 0.08, this.materials.metal, 0.72);
      this.addLocalShadeSail(
        center,
        rotation,
        [
          { x: -footprint.halfX * 0.82, z: courtyardZ - 1.05, y: 2.55 },
          { x: footprint.halfX * 0.76, z: courtyardZ - 0.92, y: 2.95 },
          { x: footprint.halfX * 0.88, z: courtyardZ + 1.08, y: 2.62 },
          { x: -footprint.halfX * 0.72, z: courtyardZ + 0.92, y: 2.88 }
        ],
        this.standardDetailMaterial("emely-shade-sail", 0xc8d3cf, 0.78, 0.02, true, 0.82)
      );
      this.addBuildingRoofVent(center, rotation, footprint.halfX * 0.48, -footprint.halfZ * 0.22, building.height, 0.46, 0.32);
      this.addEmelyBakerGateDetails(center, rotation, courtyardZ, footprint);
      this.addLabel("Emely Baker Centre", center, building.height + 1.35);
      return;
    }

    if (building.detailProfile === "amenities") {
      const amenitiesDoorMaterial = this.standardDetailMaterial("amenities-painted-door", 0x3f5556, 0.72, 0.03);
      this.addBuildingApron(center, rotation, 0, frontZ + 0.34, footprint.halfX * 1.3, 0.84, 0.09);
      for (const x of [-0.42, 0, 0.42]) {
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.02, footprint.halfX * 0.28, 1.38, 0.08, amenitiesDoorMaterial, 1.02, false);
        this.addLocalBox(center, rotation, x * footprint.halfX + footprint.halfX * 0.1, frontZ + 0.075, 0.055, 0.12, 0.05, this.materials.darkOpening, 1.1, false);
        this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.075, footprint.halfX * 0.22, 0.14, 0.055, this.materials.metal, 1.86, false);
      }
      this.addBuildingSign(center, rotation, 0, frontZ + 0.03, footprint.halfX * 0.48, 0.45, 2.48, 0xe8e0b6);
      this.addBuildingTextSign(center, rotation, 0, frontZ + 0.045, footprint.halfX * 0.54, 0.38, 2.54, "TOILETS", "#246ca8", "#f2e6a8");
      if (building.id === "osm-building-242003562") {
        this.addBuildingSign(center, rotation, -footprint.halfX * 0.82, frontZ + 0.04, footprint.halfX * 0.24, 0.38, 2.16, 0x246ca8);
        this.addBuildingWallLight(center, rotation, footprint.halfX * 0.82, frontZ + 0.06, 2.34);
        this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 1.82, building.height);
        this.addBuildingGutter(center, rotation, 0, rearZ - 0.02, footprint.halfX * 1.55, building.height);
        for (const x of [-0.44, 0.18, 0.68]) {
          this.addBuildingRoofVent(center, rotation, x * footprint.halfX, -footprint.halfZ * 0.32, building.height, 0.5, 0.34);
        }
        const ladderLocal = this.localPointOnPolygonEdge(center, rotation, building.polygon, footprint.halfX * 0.86, rearZ - 0.03);
        this.addBuildingServiceLadder(center, rotation, ladderLocal.x, ladderLocal.z, 2.15, 1.28);
        for (const x of [-0.58, 0.58]) {
          this.addLocalCylinder(center, rotation, x * footprint.halfX, frontZ + 0.78, 0.09, 0.1, 0.82, this.materials.metal);
        }
      }
      return;
    }

    if (building.detailProfile === "bowling-shed") {
      this.addBuildingAwning(center, rotation, 0, 0, footprint.halfX * 2.18, footprint.halfZ * 2.28, building.height + 0.1, this.materials.metal, 0.22);
      this.addBuildingDoor(center, rotation, 0, frontZ + 0.02, footprint.halfX * 0.95, 1.15, 0.74);
      if (building.id === "osm-building-1475006767") {
        this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 1.72, building.height);
        this.addLocalBox(center, rotation, 0, frontZ + 0.075, footprint.halfX * 0.82, 0.08, 0.06, this.materials.metal, 1.18, false);
        this.addLocalBox(center, rotation, -footprint.halfX * 0.62, frontZ + 0.52, 0.42, 0.62, 0.38, this.materials.metal, 0.36);
        this.addLocalCylinder(center, rotation, footprint.halfX * 0.58, frontZ + 0.46, 0.2, 0.2, 0.08, this.materials.metal, 0.34);
      }
      if (building.id === "osm-building-1475006768") {
        this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 1.58, building.height);
        this.addBuildingRoofVent(center, rotation, footprint.halfX * 0.32, -footprint.halfZ * 0.18, building.height, 0.36, 0.28);
        this.addLocalCylinder(center, rotation, -footprint.halfX * 0.56, frontZ + 0.42, 0.16, 0.16, 0.08, this.materials.metal, 0.34);
        for (const x of [0.42, 0.66]) {
          this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.58, 0.26, 0.54, 0.3, this.materials.metal, 0.34);
        }
      }
      if (building.id === "osm-building-1475006769") {
        this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 1.76, building.height);
        this.addBuildingGutter(center, rotation, 0, rearZ - 0.02, footprint.halfX * 1.38, building.height);
        this.addLocalBox(center, rotation, -footprint.halfX * 0.18, frontZ + 0.075, footprint.halfX * 0.74, 0.1, 0.06, this.materials.metal, 1.18, false);
        this.addBuildingRoofVent(center, rotation, footprint.halfX * 0.42, -footprint.halfZ * 0.16, building.height, 0.34, 0.26);
        this.addLocalBox(center, rotation, footprint.halfX * 0.56, frontZ + 0.52, 0.5, 0.42, 0.34, this.materials.timber, 0.31);
      }
      if (building.id === "osm-building-1475006770") {
        this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 1.82, building.height);
        this.addLocalCylinder(center, rotation, footprint.halfX * 0.58, frontZ + 0.4, 0.15, 0.15, 0.08, this.materials.metal, 0.34);
        this.addLocalBox(center, rotation, -footprint.halfX * 0.52, frontZ + 0.52, 0.38, 0.44, 0.3, this.materials.timber, 0.3);
        this.addLocalBox(center, rotation, 0, rearZ - 0.26, footprint.halfX * 1.32, 0.3, 0.28, this.materials.timber, 0.34);
      }
      if (building.id === "osm-building-1475006771") {
        this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 1.62, building.height);
        this.addLocalBox(center, rotation, footprint.halfX * 0.54, frontZ + 0.44, 0.34, 0.36, 0.28, this.materials.timber, 0.28);
        this.addLocalBox(center, rotation, -footprint.halfX * 0.18, rearZ - 0.2, footprint.halfX * 1.02, 0.18, 0.22, this.materials.metal, 0.42);
      }
      if (building.id === "osm-building-1475006772") {
        this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 1.68, building.height);
        this.addLocalBox(center, rotation, 0, frontZ + 0.075, footprint.halfX * 0.72, 0.1, 0.06, this.materials.metal, 1.08, false);
        this.addBuildingRoofVent(center, rotation, -footprint.halfX * 0.36, -footprint.halfZ * 0.1, building.height, 0.3, 0.24);
        this.addLocalCylinder(center, rotation, footprint.halfX * 0.58, frontZ + 0.42, 0.12, 0.12, 0.08, this.materials.metal, 0.31);
      }
      if (building.id === "osm-building-1475006773") {
        this.addBuildingGutter(center, rotation, 0, frontZ + 0.02, footprint.halfX * 1.86, building.height);
        this.addBuildingGutter(center, rotation, 0, rearZ - 0.02, footprint.halfX * 1.62, building.height);
        for (const x of [-0.42, 0.42]) {
          this.addLocalBox(center, rotation, x * footprint.halfX, frontZ + 0.06, footprint.halfX * 0.34, 1.02, 0.07, this.materials.darkOpening, 0.82, false);
        }
        this.addLocalBox(center, rotation, 0, rearZ - 0.28, footprint.halfX * 1.54, 0.32, 0.3, this.materials.timber, 0.34);
        for (const x of [-0.62, 0, 0.62]) {
          this.addLocalBox(center, rotation, x * footprint.halfX, rearZ - 0.5, 0.08, 0.54, 0.08, this.materials.metal, 0.56);
        }
      }
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
    for (const gate of fence.gates ?? []) {
      this.addFenceGateThreshold(gate.position, height);
    }
  }

  private addFenceGateThreshold(position: Vec2, height: number): void {
    const gateMaterial = new THREE.MeshBasicMaterial({ color: 0xd7cfad, transparent: true, opacity: 0.56 });
    const threshold = this.createTerrainOverlayRect(position, 0.35, 1.7, 0.18, PATH_MARKING_SURFACE_Y, gateMaterial);
    threshold.receiveShadow = false;
    this.scene.add(threshold);
    const postMaterial = this.materials.metal;
    for (const side of [-1, 1]) {
      const point = { x: position.x + side * 0.95, z: position.z };
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, Math.min(1.25, height), 8), postMaterial);
      post.position.set(point.x, this.groundY(point) + Math.min(1.25, height) * 0.5, point.z);
      post.castShadow = true;
      this.scene.add(post);
    }
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
    const indices: number[] = [];
    for (const point of cleanPolygon) {
      vertices.push(point.x, this.groundY(point) + y, point.z);
      uvs.push(point.x * 0.04, point.z * 0.04);
    }
    for (const triangle of triangles) {
      indices.push(triangle[0], triangle[1], triangle[2]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const meshMaterial = opacity < 1 ? material.clone() : material;
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    if (opacity < 1) {
      meshMaterial.transparent = true;
      meshMaterial.opacity = opacity;
    }
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addBlockPolygon(polygon: Vec2[], height: number, material: THREE.Material, frontSign = -1, options: { openFront?: boolean } = {}): void {
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
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(center.x, baseY + height / 2, center.z);
      mesh.rotation.y = rotation;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(footprint.halfX * 2 + 1.8, 0.28, footprint.halfZ * 2 + 1.6), this.materials.timber);
    roof.position.set(center.x, baseY + height + 0.2, center.z);
    roof.rotation.y = rotation;
    roof.castShadow = true;
    this.scene.add(roof);

    for (let row = 0; row < 4; row += 1) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(footprint.halfX * 1.65, 0.18, 0.34), this.materials.timber);
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
    return new THREE.Mesh(
      createTerrainOverlayRectGeometry({
        center,
        angle,
        length,
        width,
        yOffset,
        groundYAt: (point) => this.groundY(point)
      }),
      material
    );
  }

  private createTerrainOverlayDisc(center: Vec2, radius: number, yOffset: number, material: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(createTerrainOverlayDiscGeometry(center, radius, yOffset, (point) => this.groundY(point)), material);
  }

  private createTerrainOverlayEllipse(
    center: Vec2,
    angle: number,
    radiusX: number,
    radiusZ: number,
    yOffset: number,
    material: THREE.Material
  ): THREE.Mesh {
    return new THREE.Mesh(
      createTerrainOverlayEllipseGeometry({
        center,
        angle,
        radiusX,
        radiusZ,
        yOffset,
        groundYAt: (point) => this.groundY(point)
      }),
      material
    );
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
    return localWorldPoint(center, rotation, localX, localZ);
  }

  private worldToLocal(center: Vec2, rotation: number, point: Vec2): Vec2 {
    return worldPointToLocal(center, rotation, point);
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
    return this.level.trees.some((tree) => distance(point, tree.position) < tree.canopyRadius * 0.72);
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
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
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 10), material);
    mesh.position.set(position.x, this.groundY(position) + yOffset + height / 2, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private basicDetailMaterial(key: string, color: number): THREE.MeshBasicMaterial {
    const cacheKey = `basic:${key}:${color.toString(16)}`;
    let material = this.detailMaterialCache.get(cacheKey);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color });
      this.detailMaterialCache.set(cacheKey, material);
    }
    return material as THREE.MeshBasicMaterial;
  }

  private canvasSignMaterial(key: string, text: string, background: string, foreground: string): THREE.MeshBasicMaterial {
    const cacheKey = `canvas-sign:${key}:${text}:${background}:${foreground}`;
    let material = this.detailMaterialCache.get(cacheKey);
    if (!material) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = foreground;
      ctx.font = text.length > 4 ? "700 44px system-ui, sans-serif" : "800 52px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
      ctx.strokeStyle = foreground;
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      material = new THREE.MeshBasicMaterial({ map: texture });
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
    const maroon = this.basicDetailMaterial("bowls-mural-detail-maroon", 0x7b263b);
    const gold = this.basicDetailMaterial("bowls-mural-lion", 0xd0a13a);
    const wallX = -footprint.halfX - 0.078;

    for (const z of [-0.55, -0.22, 0.18, 0.52]) {
      this.addLocalBox(center, rotation, wallX, z * footprint.halfZ, 0.09, 0.08, footprint.halfZ * 0.42, flora, 1.86, false);
      this.addLocalBox(center, rotation, wallX - 0.01, z * footprint.halfZ + footprint.halfZ * 0.11, 0.092, 0.16, 0.18, maroon, 1.98, false);
    }

    this.addLocalBox(center, rotation, wallX - 0.015, footprint.halfZ * 0.08, 0.095, 0.42, 0.48, gold, 2.23, false);
    for (const z of [-0.28, 0, 0.28]) {
      this.addLocalBox(center, rotation, wallX - 0.018, footprint.halfZ * 0.08 + z, 0.1, 0.16, 0.08, gold, 2.55 - Math.abs(z) * 0.32, false);
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
    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0.8, 0.45);
    const rotation = -footprint.angle;
    const center = footprint.center;
    const oval = this.level.landmarks.find((candidate) => candidate.kind === "oval" && candidate.polygon)?.polygon;
    const ovalCenter = oval ? polygonCentroid(oval) : center;
    const dx = ovalCenter.x - center.x;
    const dz = ovalCenter.z - center.z;
    const ovalLocalZ = -dx * Math.sin(rotation) + dz * Math.cos(rotation);
    const frontSign = ovalLocalZ < 0 ? -1 : 1;
    const frontZ = frontSign * (footprint.halfZ + 0.05);
    const frontOut = (distanceFromFront: number) => frontZ + frontSign * distanceFromFront;
    const frontIn = (distanceFromFront: number) => frontZ - frontSign * distanceFromFront;

    this.addBlockPolygon(landmark.polygon, 5.8, this.materials.brick, frontSign, { openFront: true });

    const frontScreenMaterial = this.standardDetailMaterial("grandstand-front-transparent-screen", 0x0b1718, 0.5, 0.06, true, 0.24);
    frontScreenMaterial.depthWrite = false;
    this.addLocalBox(center, rotation, 0, frontZ, footprint.halfX * 1.36, 1.18, 0.045, frontScreenMaterial, 1.72, false);
    for (const x of [-0.58, 0, 0.58]) {
      this.addLocalBox(center, rotation, x * footprint.halfX * 1.05, frontOut(0.055), footprint.halfX * 0.28, 1.28, 0.07, this.materials.darkOpening, 0.84, false);
      this.addLocalBox(center, rotation, x * footprint.halfX * 1.05 + footprint.halfX * 0.09, frontOut(0.095), 0.08, 0.12, 0.055, this.materials.metal, 0.96, false);
    }
    this.addBuildingTextSign(center, rotation, -footprint.halfX * 0.54, frontOut(0.08), footprint.halfX * 0.36, 0.3, 2.72, "CHANGE", "#5b4632", "#f2e6a8", 0.06);
    this.addBuildingTextSign(center, rotation, footprint.halfX * 0.54, frontOut(0.08), footprint.halfX * 0.32, 0.3, 2.72, "UMPIRE", "#5b4632", "#f2e6a8", 0.06);
    for (const y of [1.16, 2.34]) {
      this.addLocalBox(center, rotation, 0, frontOut(0.02), footprint.halfX * 1.42, 0.08, 0.08, this.materials.metal, y, false);
    }
    for (const x of [-0.42, -0.14, 0.14, 0.42]) {
      this.addLocalCylinder(center, rotation, x * footprint.halfX * 2, frontOut(0.08), 0.09, 0.12, 2.8, this.materials.metal);
    }
    for (let i = -4; i <= 4; i += 1) {
      this.addLocalBox(center, rotation, (i / 4) * footprint.halfX * 0.9, 0, 0.08, 0.09, footprint.halfZ * 2 + 2.3, this.materials.metal, 6.12);
    }
    for (let row = 0; row < 5; row += 1) {
      this.addLocalBox(center, rotation, 0, frontIn(0.84 + row * 0.48), footprint.halfX * 1.32, 0.12, 0.24, this.materials.timber, 2.08 + row * 0.34);
    }
    for (let step = 0; step < 5; step += 1) {
      this.addLocalBox(
        center,
        rotation,
        0,
        frontZ + frontSign * (0.74 - step * 0.48),
        footprint.halfX * 0.52,
        0.16,
        0.34,
        this.materials.concrete,
        0.16 + step * 0.17
      );
    }
    for (const side of [-1, 1]) {
      this.addLocalBox(center, rotation, side * footprint.halfX * 0.31, frontIn(0.62), 0.07, 0.08, 2.35, this.materials.metal, 0.82);
    }
    for (let step = 0; step < 4; step += 1) {
      this.addLocalBox(center, rotation, footprint.halfX + 0.55, frontIn(0.55 + step * 0.42), 1.1, 0.16, 0.32, this.materials.concrete, 0.18 + step * 0.18);
    }
    for (const side of [-1, 1]) {
      this.addLocalBox(center, rotation, footprint.halfX + 0.55 + side * 0.64, frontIn(1.16), 0.08, 0.08, 2.4, this.materials.metal, 0.9);
      for (const z of [0.24, 1.16, 2.08]) {
        this.addLocalBox(center, rotation, footprint.halfX + 0.55 + side * 0.64, frontIn(z), 0.08, 0.85, 0.08, this.materials.metal, 0.48);
      }
    }
    this.addLabel("Kevin Murray Stand", center, 6.7);
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

  private addTennisClubDetails(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const rotation = -footprint.angle;
    const apronZ = footprint.halfZ + 1.1;
    this.addLocalBox(footprint.center, rotation, 0, apronZ, footprint.halfX * 1.72, 0.055, 1.3, this.materials.concrete, 0.12, false);
    for (const x of [-0.7, 0.7]) {
      for (const z of [-0.82, 0.82]) {
        const point = this.localPoint(footprint.center, rotation, x * footprint.halfX, z * footprint.halfZ);
        this.addLampPost(point, rotation, false);
      }
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
    this.addOvalMowingBands(landmark.polygon, center);
    const ring = makeCircle(center, 34, 64);
    this.addPathRing(ring, 0xebe2bf);
    this.addOvalBoundaryMarkers(center, 38);
    this.addOvalSportsDetails(landmark.polygon, center);
    this.addLabel("W.T. Peterson Oval", center, 7);
  }

  private addOvalMowingBands(polygon: Vec2[], center: Vec2): void {
    const minX = Math.min(...polygon.map((point) => point.x));
    const maxX = Math.max(...polygon.map((point) => point.x));
    const minZ = Math.min(...polygon.map((point) => point.z));
    const maxZ = Math.max(...polygon.map((point) => point.z));
    const radiusX = (maxX - minX) * 0.42;
    const radiusZ = (maxZ - minZ) * 0.42;
    const materials = [
      new THREE.LineBasicMaterial({ color: 0x82a365, transparent: true, opacity: 0.44 }),
      new THREE.LineBasicMaterial({ color: 0x486f3f, transparent: true, opacity: 0.32 })
    ];

    for (let band = 0; band < 6; band += 1) {
      const scale = 1 - band * 0.105;
      const points = Array.from({ length: 80 }, (_, index) => {
        const angle = (index / 80) * Math.PI * 2;
        const point = { x: center.x + Math.cos(angle) * radiusX * scale, z: center.z + Math.sin(angle) * radiusZ * scale };
        return new THREE.Vector3(point.x, this.groundY(point) + 0.155, point.z);
      });
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([...points, points[0]]), materials[band % materials.length]));
    }
  }

  private addOvalBoundaryMarkers(center: Vec2, radius: number): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xd6d0b5, roughness: 0.8 });
    for (let i = 0; i < 20; i += 1) {
      const angle = (i / 20) * Math.PI * 2;
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 8), material);
      const point = { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
      marker.position.set(point.x, this.groundY(point) + 0.28, point.z);
      marker.castShadow = true;
      this.scene.add(marker);
    }
  }

  private addOvalSportsDetails(polygon: Vec2[], center: Vec2): void {
    const pitch = this.createTerrainRect(center, 0.12, 4.6, 20, 0.14, 0.06, new THREE.MeshStandardMaterial({ color: 0xb8a36e, roughness: 0.93 }));
    pitch.receiveShadow = true;
    this.scene.add(pitch);
    this.addFieldLines(center, 4.8, 20.5, 0.12, [
      { x1: -0.5, z1: -0.32, x2: 0.5, z2: -0.32 },
      { x1: -0.5, z1: 0.32, x2: 0.5, z2: 0.32 },
      { x1: -0.18, z1: -0.42, x2: -0.18, z2: -0.25 },
      { x1: 0.18, z1: -0.42, x2: 0.18, z2: -0.25 },
      { x1: -0.18, z1: 0.42, x2: -0.18, z2: 0.25 },
      { x1: 0.18, z1: 0.42, x2: 0.18, z2: 0.25 }
    ], 0xf0e8c8);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xe7e0bf, transparent: true, opacity: 0.82 });
    const centreCirclePoints = makeCircle(center, 9.5, 48);
    const centreCircle = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        [...centreCirclePoints, centreCirclePoints[0]].map((point) => new THREE.Vector3(point.x, this.groundY(point) + 0.18, point.z))
      ),
      lineMaterial
    );
    this.scene.add(centreCircle);

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

  private addTennisCourtWorksCues(landmark: Landmark): void {
    if (!landmark.polygon || landmark.courtStatus !== "renovating-existing") return;

    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0, 0);
    const rotation = -footprint.angle;
    const center = footprint.center;
    const courtLength = footprint.halfX * 1.7;
    const courtWidth = footprint.halfZ * 1.7;
    const patchedSurface = this.standardDetailMaterial("tennis-renovation-patched-synthetic", 0x65a17e, 0.78, 0.02, true, 0.34);
    const scuffedSurface = this.standardDetailMaterial("tennis-renovation-scuffed-existing", 0x2f715f, 0.82, 0.02, true, 0.24);
    const tapeMaterial = this.standardDetailMaterial("tennis-renovation-layout-tape", 0xe8ddad, 0.66, 0.02);
    const worksOchre = this.standardDetailMaterial("tennis-renovation-works-ochre", 0xd8783c, 0.7, 0.02);

    for (const patch of [
      { localX: -footprint.halfX * 0.42, material: scuffedSurface },
      { localX: footprint.halfX * 0.42, material: patchedSurface }
    ]) {
      const patchCenter = this.localPoint(center, rotation, patch.localX, 0);
      const overlay = this.createTerrainOverlayRect(patchCenter, rotation, courtLength * 0.48, courtWidth, PATH_PATCH_SURFACE_Y + 0.018, patch.material);
      overlay.receiveShadow = true;
      this.scene.add(overlay);
    }

    this.addLocalBox(center, rotation, 0, 0, 0.09, 0.018, courtWidth * 0.92, tapeMaterial, 0.155, false);
    this.addLocalBox(center, rotation, -footprint.halfX * 0.84, 0, 0.08, 0.018, courtWidth * 0.9, tapeMaterial, 0.153, false);
    this.addLocalBox(center, rotation, footprint.halfX * 0.84, 0, 0.08, 0.018, courtWidth * 0.9, tapeMaterial, 0.153, false);

    const courtNumber = Number(landmark.id.match(/\d+$/)?.[0] ?? 0);
    if (courtNumber % 3 === 1) {
      for (const localZ of [-footprint.halfZ * 0.62, footprint.halfZ * 0.62]) {
        this.addLocalCylinder(center, rotation, footprint.halfX * 0.78, localZ, 0.11, 0.12, 0.28, worksOchre, 0.08);
        this.addLocalBox(center, rotation, footprint.halfX * 0.6, localZ, 0.52, 0.08, 0.22, worksOchre, 0.12);
      }
    }
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
      [-halfX * 0.75, 0],
      [-halfX * 0.22, -halfZ * 0.12],
      [halfX * 0.72, -halfZ * 0.08]
    ], 0.9);
    this.addPlaygroundTower(center, rotation, -halfX * 0.16, -halfZ * 0.08, 3.8, 3.2, 1.46, "north-toddler", 0x4f9c82);
    this.addToddlerSlide(center, rotation, halfX * 0.18, halfZ * 0.28, 0xd6b85d);
    this.addSwingSet(this.localPoint(center, rotation, -halfX * 0.54, halfZ * 0.28), rotation + 0.05);
    this.addBalanceLogs(this.localPoint(center, rotation, halfX * 0.46, -halfZ * 0.36), rotation - 0.25);
    this.addTunnel(center, rotation, halfX * 0.42, halfZ * 0.18);
    this.addSpringRider(center, rotation, -halfX * 0.54, -halfZ * 0.32, 0xc86d3b);
    this.addSpringRider(center, rotation, halfX * 0.62, -halfZ * 0.04, 0x5f86a6);
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
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, platformY + 1.7, 8), this.materials.timber);
        pole.position.set(x, (platformY + 1.7) * 0.5, z);
        pole.castShadow = true;
        group.add(pole);
      }
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, depth), this.materials.timber);
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
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.45, 0.28, 4), this.materials.timber);
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
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.16, 20), this.materials.rubber);
    disc.position.set(position.x, this.groundY(position) + 0.18, position.z);
    disc.castShadow = true;
    this.scene.add(disc);
    this.addLocalCylinder(center, rotation, localX, localZ, 0.045, 0.06, 0.95, this.materials.metal, 0.18);
  }

  private addTunnel(center: Vec2, rotation: number, localX: number, localZ: number): void {
    const position = this.localPoint(center, rotation, localX, localZ);
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.1, 14, 1, true), this.materials.rubber);
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
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.34), this.materials.rubber);
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
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.3, 8), this.materials.timber);
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
      if (this.isSkateBowlExitAngle(bowl, midAngle, bowl.exitWidth * 1.15)) {
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

    this.addSkateRail(this.localPoint(center, rotation, halfX * 0.18, -halfZ * 0.03), rotation + 0.05, Math.min(8.6, halfX * 0.7));
    this.addLocalBox(center, rotation, halfX * 0.36, halfZ * 0.36, Math.min(6.8, halfX * 0.55), 0.42, 0.82, ledgeMaterial, 0.25);
    this.addLocalBox(center, rotation, -halfX * 0.18, halfZ * 0.43, Math.min(5.2, halfX * 0.45), 0.36, 1.1, ledgeMaterial, 0.22);
    this.addLocalBox(center, rotation, halfX * 0.56, -halfZ * 0.34, Math.min(4.8, halfX * 0.38), 0.5, 1.15, ledgeMaterial, 0.28);

    const leftBank = this.addLocalBox(center, rotation, -halfX * 0.55, -halfZ * 0.1, Math.min(5.8, halfX * 0.46), 0.72, 2.8, bankMaterial, 0.36);
    leftBank.rotation.z = 0.18;
    const rightBank = this.addLocalBox(center, rotation, halfX * 0.54, halfZ * 0.02, Math.min(5.8, halfX * 0.46), 0.72, 2.8, bankMaterial, 0.36);
    rightBank.rotation.z = -0.18;

    const quarterPipe = this.addLocalBox(center, rotation, 0, -halfZ * 0.62, Math.min(9.5, halfX * 0.8), 0.92, 1.35, bankMaterial, 0.46);
    quarterPipe.rotation.x = -0.2;

    const seatMaterial = this.standardDetailMaterial("fitzy-bowl-concrete-seating", 0xa8aba3, 0.78, 0.03);
    this.addLocalBox(center, rotation, -halfX * 0.58, halfZ * 0.68, Math.min(4.8, halfX * 0.42), 0.38, 0.8, seatMaterial, 0.24);
    this.addLocalBox(center, rotation, -halfX * 0.12, halfZ * 0.72, Math.min(5.4, halfX * 0.46), 0.38, 0.8, seatMaterial, 0.24);
  }

  private skateBowlPoint(bowl: SkateBowlFeature, angle: number, scale: number): Vec2 {
    return this.localPoint(bowl.center, bowl.angle, Math.cos(angle) * bowl.radiusX * scale, Math.sin(angle) * bowl.radiusZ * scale);
  }

  private isSkateBowlExitAngle(bowl: SkateBowlFeature, angle: number, width: number): boolean {
    const delta = Math.atan2(Math.sin(angle - bowl.exitAngle), Math.cos(angle - bowl.exitAngle));
    return Math.abs(delta) <= width;
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
    const center = landmark.polygon ? polygonCentroid(landmark.polygon) : landmark.position;
    if (!center) return;
    const footprint = landmark.polygon ? this.fitBoxFromPolygon(landmark.polygon, 0.12, 0.12) : { center, halfX: 3, halfZ: 2.5, angle: 0 };
    const rotation = landmark.polygon ? -footprint.angle : 0;
    const width = Math.max(5.4, footprint.halfX * 2);
    const depth = Math.max(4.6, footprint.halfZ * 2);
    const wallMaterial = this.standardDetailMaterial("toilet-block-wall", 0xb8a072, 0.82, 0);
    const roofMaterial = this.standardDetailMaterial("toilet-block-roof", 0x6f7567, 0.8, 0.02);

    this.addLocalBox(center, rotation, 0, 0, width + 1.1, 0.08, depth + 1.2, this.materials.concrete, 0.07, false);
    this.addLocalBox(center, rotation, 0, 0, width, 3.2, depth, wallMaterial, 1.6);
    this.addLocalBox(center, rotation, 0, 0, width + 0.7, 0.34, depth + 0.7, roofMaterial, 3.38);
    const frontZ = -depth * 0.5 - 0.045;
    for (const x of [-1.65, 0, 1.65]) {
      this.addLocalBox(center, rotation, x, frontZ, 0.84, 1.72, 0.08, this.materials.darkOpening, 1.08, false);
    }
    for (const x of [-2.15, 2.15]) {
      this.addLocalBox(center, rotation, x, frontZ - 0.02, 0.75, 0.18, 0.1, this.materials.metal, 2.62, false);
    }
    this.addLocalBox(center, rotation, 0, frontZ - 0.02, 2.2, 0.7, 0.1, this.basicDetailMaterial("toilet-sign", 0x2e6c79), 2.7, false);
    this.addBuildingGutter(center, rotation, 0, frontZ - 0.02, width * 0.84, 3.2);
    this.addBuildingGutter(center, rotation, 0, depth * 0.5 + 0.04, width * 0.78, 3.2);
    this.addLocalBox(center, rotation, -width * 0.34, frontZ - 0.035, 0.42, 0.36, 0.1, this.basicDetailMaterial("toilet-accessible-sign", 0x246ca8), 2.28, false);
    this.addBuildingWallLight(center, rotation, width * 0.34, frontZ - 0.04, 2.38);
    this.addBuildingRoofVent(center, rotation, width * 0.22, 0, 3.2, 0.42, 0.28);
    this.addLocalBox(center, rotation, width * 0.54, 0, 0.1, 1.1, depth * 0.76, this.materials.hedge, 0.72);
    if (landmark.polygon) {
      const ladderLocal = this.localPointOnPolygonEdge(center, rotation, landmark.polygon, footprint.halfX * 0.78, footprint.halfZ + 0.1);
      this.addBuildingServiceLadder(center, rotation, ladderLocal.x, ladderLocal.z, 2.05, 1.2);
    }
  }

  private addBbq(position: Vec2): void {
    const groundY = this.radialSupportY(position, 3.2);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), this.materials.concrete);
    pad.position.set(position.x, groundY + 0.075, position.z);
    pad.rotation.x = -Math.PI / 2;
    pad.receiveShadow = true;
    this.scene.add(pad);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.0, 1.4), this.materials.metal);
    base.position.set(position.x, groundY + 0.55, position.z);
    base.castShadow = true;
    this.scene.add(base);
    const shelter = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.32, 4), this.materials.timber);
    shelter.position.set(position.x, groundY + 3.2, position.z);
    shelter.rotation.y = Math.PI / 4;
    shelter.castShadow = true;
    this.scene.add(shelter);
    this.addPicnicTable({ x: position.x + 3.1, z: position.z + 1.2 }, -0.28);
  }

  private addAmenities(): void {
    for (const amenity of this.level.amenities) {
      const angle = this.angleFromId(amenity.id);
      if (amenity.kind === "bench") {
        this.addBench(amenity.position, angle);
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
        this.addSupplyCrate(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0xd0a343, 0.64);
      } else if (amenity.kind === "toilets") {
        this.addToiletSign(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0x61a8d3, 0.52);
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
      } else {
        this.addChalkMark(detail);
      }
    }
  }

  private addDogAreaSign(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.45, 8), this.materials.metal);
    post.position.y = 0.72;
    post.castShadow = true;
    group.add(post);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: 0x315c45, roughness: 0.62 }));
    sign.position.y = 1.32;
    sign.castShadow = true;
    group.add(sign);
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), new THREE.MeshBasicMaterial({ color: 0xe7e2cb }));
    mark.position.set(-0.18, 1.32, -0.034);
    group.add(mark);
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

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.06, 14), this.materials.concrete);
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
    const frame = new THREE.MeshStandardMaterial({ color: 0x4c3926, roughness: 0.72 });
    const board = new THREE.MeshStandardMaterial({ color: 0x244734, roughness: 0.66 });
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

  private addRideableBikePreview(): void {
    const bike = this.level.rideableBike;
    const group = new MeshFactory(this.materials).createBikeMesh();
    group.scale.setScalar(1.45);
    group.position.set(bike.position.x, this.groundY(bike.position), bike.position.z);
    group.rotation.y = bike.angle;
    this.scene.add(group);
  }

  private addTrainingCones(detail: ParkLifeDetail): void {
    const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xd6632e, roughness: 0.58 });
    for (let index = 0; index < 6; index += 1) {
      const localX = (index - 2.5) * 0.82;
      const localZ = Math.sin(index * 1.7) * 0.32;
      const point = this.localPoint(detail.position, detail.angle, localX, localZ);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.44, 8), coneMaterial);
      cone.position.set(point.x, this.groundY(point) + 0.22, point.z);
      cone.castShadow = true;
      this.scene.add(cone);
    }
  }

  private addDogWaterBowl(detail: ParkLifeDetail): void {
    const groundY = this.groundY(detail.position);
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
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4f8f9a, roughness: 0.58 });
    const lidMaterial = new THREE.MeshStandardMaterial({ color: 0xe6dfc8, roughness: 0.52 });
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
    group.position.set(detail.position.x, this.boxSupportY(detail.position, detail.angle, 0.52, 0.33), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addSportsBag(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const bagMaterial = new THREE.MeshStandardMaterial({ color: 0x293a4d, roughness: 0.74 });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.58), bagMaterial);
    bag.position.y = 0.26;
    bag.castShadow = true;
    group.add(bag);
    for (const x of [-0.32, 0.32]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 6, 14), this.materials.timber);
      strap.position.set(x, 0.48, 0);
      strap.rotation.x = Math.PI / 2;
      strap.scale.z = 0.55;
      group.add(strap);
    }
    group.position.set(detail.position.x, this.boxSupportY(detail.position, detail.angle, 0.65, 0.32), detail.position.z);
    group.rotation.y = detail.angle;
    this.scene.add(group);
  }

  private addCricketNets(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const netMaterial = new THREE.MeshBasicMaterial({ color: 0xc9d4c6, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const netLineMaterial = new THREE.LineBasicMaterial({ color: 0xdde6d8, transparent: true, opacity: 0.58 });
    const frameMaterial = this.materials.metal;
    const width = 3.2;
    const length = 8.5;
    const height = 2.45;

    for (const x of [-width * 0.5, width * 0.5]) {
      for (const z of [-length * 0.5, length * 0.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, height, 8), frameMaterial);
        post.position.set(x, height * 0.5, z);
        post.castShadow = true;
        group.add(post);
      }
    }

    const addFrameRail = (x: number, y: number, z: number, railWidth: number, railHeight: number, railDepth: number) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(railWidth, railHeight, railDepth), frameMaterial);
      rail.position.set(x, y, z);
      rail.castShadow = true;
      group.add(rail);
    };
    for (const x of [-width * 0.5, width * 0.5]) {
      addFrameRail(x, height, 0, 0.06, 0.06, length);
    }
    for (const z of [-length * 0.5, length * 0.5]) {
      addFrameRail(0, height, z, width, 0.06, 0.06);
    }

    for (const x of [-width * 0.5, width * 0.5]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, height, length), netMaterial);
      side.position.set(x, height * 0.5, 0);
      group.add(side);
    }
    const rear = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03), netMaterial);
    rear.position.set(0, height * 0.5, length * 0.5);
    group.add(rear);
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, length), netMaterial);
    top.position.set(0, height, 0);
    group.add(top);

    const linePoints: THREE.Vector3[] = [];
    for (const x of [-width * 0.5, width * 0.5]) {
      for (const y of [0.62, 1.2, 1.78, 2.34]) {
        linePoints.push(new THREE.Vector3(x, y, -length * 0.5), new THREE.Vector3(x, y, length * 0.5));
      }
      for (let step = 0; step <= 4; step += 1) {
        const z = -length * 0.5 + (length * step) / 4;
        linePoints.push(new THREE.Vector3(x, 0.18, z), new THREE.Vector3(x, height, z));
      }
    }
    for (const y of [0.62, 1.2, 1.78, 2.34]) {
      linePoints.push(new THREE.Vector3(-width * 0.5, y, length * 0.5), new THREE.Vector3(width * 0.5, y, length * 0.5));
    }
    for (let step = 0; step <= 4; step += 1) {
      const x = -width * 0.5 + (width * step) / 4;
      linePoints.push(new THREE.Vector3(x, 0.18, length * 0.5), new THREE.Vector3(x, height, length * 0.5));
    }
    const netLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePoints), netLineMaterial);
    group.add(netLines);

    const mat = new THREE.MeshStandardMaterial({ color: 0x7a725f, roughness: 0.92 });
    const pitch = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, 0.05, length * 0.74), mat);
    pitch.position.y = 0.035;
    pitch.receiveShadow = true;
    group.add(pitch);

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

      const spillMaterial = new THREE.MeshBasicMaterial({
        color: 0xc49a55,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const spill = new THREE.Mesh(
        new THREE.CircleGeometry(6.2, 28),
        spillMaterial
      );
      spill.position.set(0, 0.045, -0.9);
      spill.rotation.x = -Math.PI / 2;
      spill.userData.kind = "lamp-ground-spill";
      group.add(spill);
      this.lampSpillMaterials.push(spillMaterial);
      this.renderedLampSpillCount += 1;
    }
    group.position.set(position.x, this.groundY(position), position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private addBench(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.55), this.materials.concrete);
    pad.position.y = 0.035;
    pad.receiveShadow = true;
    group.add(pad);
    for (const z of [-0.22, 0, 0.22]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.11, 0.12), this.materials.timber);
      slat.position.set(0, 0.72, z);
      slat.castShadow = true;
      group.add(slat);
    }
    for (const y of [0.96, 1.18]) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.12, 0.14), this.materials.timber);
      back.position.set(0, y, 0.43);
      back.rotation.x = -0.18;
      back.castShadow = true;
      group.add(back);
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
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addPicnicTable(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.055, 2.45), this.materials.concrete);
    pad.position.y = 0.032;
    pad.receiveShadow = true;
    group.add(pad);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.72), this.materials.timber);
    top.position.y = 0.82;
    top.castShadow = true;
    group.add(top);
    for (const z of [-0.85, 0.85]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.32), this.materials.timber);
      bench.position.set(0, 0.52, z);
      bench.castShadow = true;
      group.add(bench);
    }
    for (const x of [-0.72, 0.72]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.12), this.materials.metal);
      leg.position.set(x, 0.38, 0);
      leg.rotation.z = x < 0 ? -0.18 : 0.18;
      leg.castShadow = true;
      group.add(leg);
    }
    group.position.set(position.x, this.boxSupportY(position, angle, 1.68, 1.23), position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addTableTennis(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.055, 2.8), this.materials.concrete);
    pad.position.y = 0.032;
    pad.receiveShadow = true;
    group.add(pad);
    const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6b65, roughness: 0.54 });
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
      const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 18), new THREE.MeshStandardMaterial({ color: 0xb74838, roughness: 0.48 }));
      paddle.position.set(x, 0.19, -0.9);
      paddle.rotation.x = Math.PI / 2;
      paddle.castShadow = true;
      group.add(paddle);
    }
    group.position.set(position.x, this.boxSupportY(position, angle, 2.1, 1.4), position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addWasteBasket(position: Vec2): void {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 0.82 }));
    body.position.set(position.x, this.groundY(position) + 0.45, position.z);
    body.castShadow = true;
    this.scene.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 12), this.materials.metal);
    lid.position.set(position.x, this.groundY(position) + 0.94, position.z);
    lid.castShadow = true;
    this.scene.add(lid);
  }

  private addDrinkingFountain(position: Vec2): void {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.15, 12), new THREE.MeshStandardMaterial({ color: 0x496e76, roughness: 0.58 }));
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
      const rack = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 8, 18), this.materials.metal);
      rack.position.set(x, 0.46, 0);
      rack.rotation.x = Math.PI / 2;
      rack.castShadow = true;
      group.add(rack);
    }
    group.position.set(position.x, this.boxSupportY(position, angle, 1.15, 0.45), position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addSupplyCrate(position: Vec2, angle: number): void {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.95), new THREE.MeshStandardMaterial({ color: 0x80603b, roughness: 0.76 }));
    crate.position.set(position.x, this.boxSupportY(position, angle, 0.65, 0.48) + 0.38, position.z);
    crate.rotation.y = angle;
    crate.castShadow = true;
    crate.receiveShadow = true;
    this.scene.add(crate);
  }

  private isStructureAmenity(amenity: AmenityPoint): boolean {
    return (
      amenity.kind === "clubroom" ||
      amenity.kind === "changeroom" ||
      amenity.kind === "gatehouse" ||
      amenity.kind === "maintenance_room" ||
      amenity.kind === "community_room"
    );
  }

  private addStructureAccessCue(amenity: AmenityPoint, angle: number): void {
    const panelColor =
      amenity.kind === "changeroom"
        ? 0x5f725f
        : amenity.kind === "gatehouse"
          ? 0x6a4c32
          : amenity.kind === "maintenance_room"
            ? 0x5b6665
            : amenity.kind === "community_room"
              ? 0x315d67
              : 0x314f44;
    const panelMaterial = this.standardDetailMaterial(`structure-access-${amenity.kind}`, panelColor, 0.72, 0.08);
    const latchMaterial = this.standardDetailMaterial("structure-access-latch", 0xd0a343, 0.48, 0.28);
    const signText =
      amenity.kind === "changeroom"
        ? "CHANGE"
        : amenity.kind === "gatehouse"
          ? "GATE"
          : amenity.kind === "maintenance_room"
            ? "STORE"
            : amenity.kind === "community_room"
              ? "ROOM"
              : "CLUB";
    const signMaterial = this.canvasSignMaterial(`structure-access-${amenity.kind}`, signText, "#2b332c", "#f0d996");

    this.addLocalBox(amenity.position, angle, 0, 0, 1.8, 0.065, 1.1, this.materials.concrete, 0.095, false);
    this.addLocalBox(amenity.position, angle, 0, -0.28, 1.08, 0.9, 0.16, panelMaterial, 0.58);
    this.addLocalBox(amenity.position, angle, 0.41, -0.39, 0.12, 0.16, 0.08, latchMaterial, 0.72, false);
    this.addLocalBox(amenity.position, angle, 0, -0.48, 0.78, 0.3, 0.055, signMaterial, 1.24, false);

    if (amenity.kind === "changeroom") {
      const firstAid = this.basicDetailMaterial("structure-first-aid", 0xd8e6dc);
      const cross = this.basicDetailMaterial("structure-first-aid-cross", 0x396c55);
      this.addLocalBox(amenity.position, angle, -0.5, -0.52, 0.34, 0.34, 0.06, firstAid, 0.92, false);
      this.addLocalBox(amenity.position, angle, -0.5, -0.56, 0.24, 0.055, 0.065, cross, 0.92, false);
      this.addLocalBox(amenity.position, angle, -0.5, -0.565, 0.055, 0.24, 0.065, cross, 0.92, false);
      this.addLocalBox(amenity.position, angle, 0.18, 0.28, 1.15, 0.16, 0.32, this.materials.timber, 0.2);
      return;
    }

    if (amenity.kind === "gatehouse") {
      this.addLocalBox(amenity.position, angle, -0.1, -0.56, 0.62, 0.2, 0.06, this.materials.darkOpening, 0.84, false);
      for (const x of [-0.72, 0.72]) {
        this.addLocalCylinder(amenity.position, angle, x, 0.34, 0.08, 0.1, 0.72, this.materials.metal);
      }
      return;
    }

    if (amenity.kind === "maintenance_room") {
      this.addLocalBox(amenity.position, angle, -0.46, 0.28, 0.55, 0.52, 0.42, this.materials.metal, 0.34);
      this.addLocalCylinder(amenity.position, angle, 0.5, 0.3, 0.18, 0.18, 0.08, this.materials.metal, 0.28);
      this.addLocalBox(amenity.position, angle, 0.5, 0.45, 0.12, 0.24, 0.08, latchMaterial, 0.32, false);
      return;
    }

    if (amenity.kind === "community_room") {
      const firstAid = this.basicDetailMaterial("community-first-aid", 0xe7e3d0);
      const cross = this.basicDetailMaterial("community-first-aid-cross", 0x2d7a6d);
      this.addLocalBox(amenity.position, angle, -0.48, -0.52, 0.32, 0.32, 0.06, firstAid, 0.92, false);
      this.addLocalBox(amenity.position, angle, -0.48, -0.56, 0.22, 0.052, 0.065, cross, 0.92, false);
      this.addLocalBox(amenity.position, angle, -0.48, -0.565, 0.052, 0.22, 0.065, cross, 0.92, false);
      this.addLocalBox(amenity.position, angle, 0.48, 0.26, 0.48, 0.52, 0.28, this.materials.timber, 0.34);
      return;
    }

    this.addLocalBox(amenity.position, angle, -0.48, 0.24, 0.48, 0.58, 0.34, this.materials.metal, 0.38);
    this.addLocalBox(amenity.position, angle, 0.48, 0.24, 0.44, 0.44, 0.32, this.materials.timber, 0.32);
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
    const copper = new THREE.MeshStandardMaterial({ color: 0x6f8069, metalness: 0.18, roughness: 0.66 });
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
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.06), this.materials.darkOpening);
      vent.position.set(Math.cos(angle) * 4.48, 1.12, Math.sin(angle) * 4.48);
      vent.rotation.y = -angle;
      group.add(vent);
    }
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.05, 0.28, 36), this.materials.path);
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
      group.add(stair);
    }
    for (const side of [-1, 1]) {
      const handrail = this.createBranch(new THREE.Vector3(side * 1.48, 0.92, -7.1), new THREE.Vector3(side * 1.24, 1.78, -4.92), 0.045, this.materials.metal);
      group.add(handrail);
      for (const z of [-6.85, -5.95, -5.05]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.92, 8), this.materials.metal);
        post.position.set(side * 1.38, 0.56, z);
        post.castShadow = true;
        group.add(post);
      }
    }
    const landingStrip = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 0.22), plaque);
    landingStrip.position.set(0, 1.94, -4.35);
    landingStrip.castShadow = true;
    group.add(landingStrip);
    const cappedServicePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 12), plaque);
    cappedServicePlate.position.set(1.86, 1.98, -4.42);
    cappedServicePlate.castShadow = true;
    group.add(cappedServicePlate);
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.92, 0.5), renderStone);
      pier.position.set(side * 1.62, 0.78, -5.88);
      pier.castShadow = true;
      group.add(pier);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.34, 0.05), plaque);
      plate.position.set(side * 1.05, 1.55, -4.48);
      group.add(plate);
    }
    group.position.set(position.x, this.radialSupportY(position, 5.7), position.z);
    group.rotation.y = -0.34;
    this.scene.add(group);
    this.addLabel("Rotunda", position, 7);
  }

  private addMemorial(landmark: Landmark): void {
    const position = landmark.position;
    if (!position) return;
    if (landmark.id === "queen-victoria-plinth") {
      this.addQueenVictoriaPlinth(position);
      return;
    }
    if (landmark.id === "sportsmans-war-memorial") {
      this.addSportsmansMemorial(position);
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
    const ledMaterial = new THREE.MeshBasicMaterial({ color: 0xe04f3e });
    const column = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.65, 0.28), frameMaterial);
    column.position.y = 0.85;
    column.castShadow = true;
    sculpture.add(column);
    for (let row = 0; row < 3; row += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.035), ledMaterial);
      bar.position.set(0, 1.28 - row * 0.34, -0.165);
      sculpture.add(bar);
    }
    sculpture.position.set(position.x, plinthGroundY + 2.36, position.z);
    sculpture.rotation.y = -0.45;
    this.scene.add(sculpture);
    this.addLabel("Queen Victoria plinth", position, 5.2);
  }

  private addSportsmansMemorial(position: Vec2): void {
    const groundY = this.boxSupportY(position, 0, 1.9, 1.1);
    const stone = new THREE.MeshStandardMaterial({ color: 0xd0c2a2, roughness: 0.68 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5d2d, metalness: 0.35, roughness: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.35, 2.2), stone);
    base.position.set(position.x, groundY + 0.22, position.z);
    base.castShadow = true;
    this.scene.add(base);
    for (const x of [-1.25, 1.25]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.6, 10), stone);
      column.position.set(position.x + x, groundY + 1.5, position.z);
      column.castShadow = true;
      this.scene.add(column);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.28, 0.38), stone);
    lintel.position.set(position.x, groundY + 2.88, position.z);
    lintel.castShadow = true;
    this.scene.add(lintel);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.4, 0.12), bronze);
    panel.position.set(position.x, groundY + 1.45, position.z - 0.16);
    panel.castShadow = true;
    this.scene.add(panel);
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 24), bronze);
    wreath.position.set(position.x, groundY + 2.15, position.z - 0.24);
    this.scene.add(wreath);
    this.addLabel("Sportsman's Memorial", position, 4.5);
  }

  private addCookMemorialSite(position: Vec2): void {
    const groundY = this.radialSupportY(position, 1.95);
    const stone = new THREE.MeshStandardMaterial({ color: 0xaea58e, roughness: 0.78 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x39403c, metalness: 0.25, roughness: 0.46 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.95, 0.22, 18), stone);
    pad.position.set(position.x, groundY + 0.12, position.z);
    pad.castShadow = true;
    pad.receiveShadow = true;
    this.scene.add(pad);
    const remnant = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.38, 0.72), stone);
    remnant.position.set(position.x, groundY + 0.48, position.z);
    remnant.rotation.y = 0.35;
    remnant.castShadow = true;
    this.scene.add(remnant);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.48), this.materials.metal);
    plaque.position.set(position.x + 0.08, groundY + 0.71, position.z - 0.08);
    plaque.rotation.set(-0.22, 0.35, 0);
    this.scene.add(plaque);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), metal);
      const point = { x: position.x + Math.cos(angle) * 2.4, z: position.z + Math.sin(angle) * 2.4 };
      bollard.position.set(point.x, this.groundY(point) + 0.45, point.z);
      bollard.castShadow = true;
      this.scene.add(bollard);
    }
    this.addLabel("Cook memorial site", position, 3.2);
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
    this.level.trees.forEach((tree, index) => {
      if (!pointInPolygon(tree.position, this.level.boundary)) {
        return;
      }
      this.addRealisticTree(tree, index);
      this.renderedTreeCount += 1;
    });
  }

  private addUnderCanopyGroundWear(): void {
    const trees = this.level.trees.filter((tree) => pointInPolygon(tree.position, this.level.boundary));
    if (trees.length === 0) return;

    const circleGeometry = new THREE.CircleGeometry(1, 22);
    const litterMesh = new THREE.InstancedMesh(circleGeometry, this.materials.leafLitter, trees.length);
    const wearMesh = new THREE.InstancedMesh(circleGeometry, this.materials.wornGrass, trees.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let index = 0; index < trees.length; index += 1) {
      const tree = trees[index];
      const angle = this.angleFromId(tree.id);
      const canopyRadius = tree.canopyRadius * (tree.profile === "gum" ? 0.72 : tree.profile === "oak" ? 0.95 : 0.84);
      const y = this.groundY(tree.position);

      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, angle));
      scale.set(canopyRadius * (tree.canopyGroup === "avenue" ? 0.82 : 1), canopyRadius * 0.58, 1);
      matrix.compose(new THREE.Vector3(tree.position.x, y + 0.038, tree.position.z), quaternion, scale);
      litterMesh.setMatrixAt(index, matrix);

      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, angle + Math.PI * 0.5));
      scale.set(canopyRadius * 1.12, canopyRadius * 0.74, 1);
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
    const heritageScale = tree.height ? THREE.MathUtils.clamp(tree.height / 20, 0.72, 1.45) : isAvenueTree ? 1.08 : 1;
    const scale = this.rng.range(0.9, 1.35) * heritageScale * TREE_SCALE_MULTIPLIER;
    const trunkHeight =
      profile === "gum"
        ? this.rng.range(6.8, 9.8) * scale
        : profile === "oak"
          ? this.rng.range(4.5, 6.8) * scale
          : this.rng.range(5.2, 8.4) * scale;
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

    const branchCount = profile === "gum" ? 5 : profile === "oak" ? 6 : 5;
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const angle = (branchIndex / branchCount) * Math.PI * 2 + this.rng.range(-0.25, 0.25);
      const start = new THREE.Vector3(0, trunkHeight * this.rng.range(0.55, 0.78), 0);
      const end = new THREE.Vector3(
        Math.cos(angle) * this.rng.range(profile === "gum" ? 1.0 : 1.35, profile === "oak" ? 3.2 : 2.6) * scale,
        trunkHeight * this.rng.range(profile === "gum" ? 0.72 : 0.68, 0.96),
        Math.sin(angle) * this.rng.range(profile === "gum" ? 1.0 : 1.35, profile === "oak" ? 3.2 : 2.6) * scale
      );
      group.add(this.createBranch(start, end, trunkRadius * this.rng.range(0.28, 0.42), materials.trunk));
    }

    const lobeCount = Math.max(4, Math.round((profile === "gum" ? 5 : profile === "oak" ? 8 : 7) * tree.canopyDensity + (tree.canopyGroup === "specimen" ? 1 : 0)));
    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
      const angle = (lobeIndex / lobeCount) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
      const canopyRadius = tree.canopyRadius * this.rng.range(profile === "gum" ? 0.22 : 0.25, profile === "oak" ? 0.42 : 0.36);
      const spread = tree.canopyRadius * (profile === "gum" ? 0.28 : profile === "oak" ? 0.5 : tree.canopyGroup === "avenue" ? 0.42 : 0.46);
      const canopyMaterial = lobeIndex % (profile === "gum" ? 3 : 4) === 0 ? materials.leafHighlight : materials.leaf;
      const canopy = new THREE.Mesh(this.treeCanopyGeometry, canopyMaterial);
      canopy.position.set(
        Math.cos(angle) * this.rng.range(spread * 0.45, spread),
        trunkHeight + this.rng.range(profile === "gum" ? -0.45 : 0.05, profile === "oak" ? 1.0 : 1.45) * scale,
        Math.sin(angle) * this.rng.range(spread * 0.45, spread)
      );
      canopy.scale.set(
        canopyRadius * this.rng.range(profile === "gum" ? 0.85 : 1.05, profile === "oak" ? 1.75 : 1.55),
        canopyRadius * this.rng.range(profile === "gum" ? 1.05 : 0.68, profile === "oak" ? 0.9 : 1.08),
        canopyRadius * this.rng.range(profile === "gum" ? 0.85 : 1.05, profile === "oak" ? 1.75 : 1.55)
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

    group.position.set(point.x, this.groundY(point), point.z);
    group.rotation.y = this.rng.range(0, Math.PI * 2);
    group.userData.treeIndex = index;
    group.userData.treeSource = tree.source ?? "mapped";
    group.userData.treeSpecies = tree.label;
    this.scene.add(group);
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

  private getTreeMaterials(profile: TreeProfile, index: number): TreeMaterialSet {
    const variant = index % 8;
    const key = `${profile}-${variant}`;
    const cached = this.treeMaterialCache.get(key);
    if (cached) return cached;

    const baseTrunkColor = profile === "gum" ? 0x8b806b : profile === "oak" ? 0x56402e : 0x684d34;
    const baseLeafColor = profile === "gum" ? 0x748782 : profile === "oak" ? 0x3d573d : profile === "elm" ? 0x506b43 : 0x597044;
    const highlightLeafColor = profile === "gum" ? 0x9aaca3 : profile === "oak" ? 0x6f7b4c : profile === "elm" ? 0x7e8f55 : 0x81925b;
    const hueOffset = (variant - 3.5) * 0.004;
    const saturationOffset = ((variant % 3) - 1) * 0.02;
    const lightOffset = ((variant % 5) - 2) * 0.018;
    const materials = {
      trunk: new THREE.MeshToonMaterial({
        color: new THREE.Color(baseTrunkColor).offsetHSL(hueOffset, saturationOffset, lightOffset),
        emissive: 0x160f0a,
        emissiveIntensity: 0.12,
        gradientMap: WORLD_TOON_RAMP
      }),
      leaf: new THREE.MeshToonMaterial({
        color: new THREE.Color(baseLeafColor).offsetHSL(hueOffset * 1.4, saturationOffset, lightOffset),
        emissive: 0x0e2119,
        emissiveIntensity: 0.14,
        gradientMap: WORLD_TOON_RAMP
      }),
      leafHighlight: new THREE.MeshToonMaterial({
        color: new THREE.Color(highlightLeafColor).offsetHSL(hueOffset, saturationOffset * 0.5, lightOffset * 0.7),
        emissive: 0x17281c,
        emissiveIntensity: 0.1,
        gradientMap: WORLD_TOON_RAMP
      }),
      paleBark: new THREE.MeshToonMaterial({
        color: 0xcdbf9f,
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
