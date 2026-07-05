import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  Matrix,
  Material,
  Mesh,
  MeshBuilder,
  PointLight,
  Quaternion,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import { distance, distanceToSegment, makeCircle, pointInPolygon, polygonCentroid, samplePolyline } from "../../geo";
import { AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES, footballPostLocalOffsets } from "../../sportsFixtures";
import type {
  AmenityPoint,
  Landmark,
  LevelData,
  LevelPath,
  MappedBuilding,
  MappedTree,
  ParkLifeDetail,
  RandomSource,
  SportsFixture,
  TreeProfile,
  Vec2
} from "../../types";
import { TerrainSampler } from "../../terrain";
import type { WeatherState } from "../weather";
import { BabylonMeshFactory } from "./BabylonMeshFactory";
import {
  createBoxBetween,
  createExtrudedPolygonMesh,
  createGroundedTube,
  createTerrainGridMesh,
  createTerrainDiscMesh,
  createTerrainEllipseMesh,
  createTerrainPolygonMesh,
  createTerrainRibbonSegmentMesh,
  DETAIL_SURFACE_Y,
  enablePaintedEdges,
  PATH_SURFACE_Y
} from "./BabylonGeometry";
import { createBabylonGameMaterials, type BabylonGameMaterials } from "./BabylonMaterials";

export interface BabylonWorldReport {
  treeCount: number;
  grassClumpCount: number;
  wetPathSheenCount: number;
  lampSpillCount: number;
  mistBankCount: number;
  rainDropCount: number;
  weatherAnchorCount: number;
}

interface TreeSeed {
  id: string;
  position: Vec2;
  profile: TreeProfile;
  canopyRadius: number;
  canopyDensity: number;
  height?: number;
  dbh?: number;
}

const TREE_SCALE_MULTIPLIER = 1.16;
const GRASS_CLUSTER_LIMIT = 2200;
const FIELD_LINE_WIDTH = 0.16;

interface LocalFootprint {
  center: Vec2;
  halfX: number;
  halfZ: number;
  angle: number;
}

export class BabylonWorld {
  readonly materials: BabylonGameMaterials;
  readonly root: TransformNode;

  private readonly treeMaterialCache = new Map<string, StandardMaterial>();
  private readonly detailMaterialCache = new Map<string, StandardMaterial>();
  private readonly meshFactory: BabylonMeshFactory;
  private readonly dynamicRoot: TransformNode;
  private readonly report: BabylonWorldReport = {
    treeCount: 0,
    grassClumpCount: 0,
    wetPathSheenCount: 0,
    lampSpillCount: 0,
    mistBankCount: 0,
    rainDropCount: 0,
    weatherAnchorCount: 0
  };
  private rainRoot: TransformNode | null = null;
  private mistRoot: TransformNode | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly level: LevelData,
    private readonly terrain: TerrainSampler,
    private readonly rng: RandomSource
  ) {
    this.root = new TransformNode("world-root", scene);
    this.dynamicRoot = new TransformNode("world-dynamic", scene);
    this.dynamicRoot.parent = this.root;
    this.materials = createBabylonGameMaterials(scene, rng);
    this.meshFactory = new BabylonMeshFactory(scene, this.materials);
  }

  createWorld(): BabylonWorldReport {
    this.configureScene();
    this.addGround();
    this.addStreetEdges();
    this.addPaths();
    this.addPathSurfacePatches();
    this.addHardscapeLines();
    this.addLandmarks();
    this.addMappedBuildings();
    this.addMappedFences();
    this.addPlaceIdentitySigns();
    this.addUrbanEdges();
    this.addSportsFixtures();
    this.addAmenities();
    this.addParkLifeDetails();
    this.addOutbreakTraces();
    this.addUpgradeStations();
    this.addWeaponSpawns();
    this.addBoundaryFence();
    this.addUnderCanopyGroundWear();
    this.addTrees();
    this.addGrassClumps();
    this.addWetPathSheen();
    this.addPathLights();
    this.addWeather();
    return this.getReport();
  }

  update(dt: number, elapsed: number, weather: WeatherState): void {
    this.scene.fogDensity = 0.0018 + weather.fog * 0.0029 + weather.precipitation * 0.0009;
    this.scene.imageProcessingConfiguration.exposure = 1.08 * weather.exposureMultiplier;
    this.materials.puddle.alpha = 0.28 + weather.wetness * 0.38;
    this.materials.water.alpha = 0.2 + weather.precipitation * 0.42 + weather.fog * 0.12;
    if (this.rainRoot) {
      this.rainRoot.setEnabled(weather.precipitation > 0.04);
      this.rainRoot.position.z = ((elapsed * 18) % 18) - 9;
      this.rainRoot.position.x = Math.sin(elapsed * 0.17) * weather.wind * 4;
    }
    if (this.mistRoot) {
      this.mistRoot.setEnabled(weather.fog > 0.08);
      this.mistRoot.rotation.y += dt * 0.018;
    }
  }

  getReport(): BabylonWorldReport {
    return { ...this.report };
  }

  groundY(point: Vec2): number {
    return this.terrain.groundY(point);
  }

  private configureScene(): void {
    this.scene.clearColor = new Color4(0.055, 0.084, 0.105, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.11, 0.16, 0.17);
    this.scene.fogDensity = 0.0024;
    this.scene.imageProcessingConfiguration.exposure = 1.18;
    this.scene.imageProcessingConfiguration.contrast = 1.22;
    this.scene.ambientColor = new Color3(0.28, 0.31, 0.25);

    const ambient = new HemisphericLight("park-ambient", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 1.28;
    ambient.diffuse = new Color3(0.7, 0.82, 0.92);
    ambient.groundColor = new Color3(0.18, 0.16, 0.14);

    const moon = new DirectionalLight("moon-key", new Vector3(0.42, -0.82, -0.2), this.scene);
    moon.intensity = 1.85;
    moon.diffuse = new Color3(0.74, 0.83, 1);

    const emergency = new PointLight("emergency-light", new Vector3(22, 7, 48), this.scene);
    emergency.diffuse = new Color3(0.95, 0.2, 0.16);
    emergency.intensity = 0.9;
    emergency.range = 145;
  }

  private addGround(): void {
    const ground = createTerrainGridMesh("edinburgh-gardens-terrain", this.scene, this.level.boundary, this.materials.grass, (point) => this.groundY(point), 0.015, 5.25, 34);
    ground.parent = this.root;
    ground.receiveShadows = true;

    const outline = createGroundedTube("boundary-outline", this.scene, this.level.boundary, 0.09, this.materials.hedge, (point) => this.groundY(point), 0.18, 8);
    outline.parent = this.root;
  }

  private addStreetEdges(): void {
    for (const street of this.level.streetEdges) {
      const material = street.kind === "trunk" ? this.materials.asphalt : this.materials.gravel;
      for (let index = 0; index < street.points.length - 1; index += 1) {
        const segment = createTerrainRibbonSegmentMesh(
          `street-${street.id}-${index}`,
          this.scene,
          street.points[index],
          street.points[index + 1],
          street.width,
          material,
          (point) => this.groundY(point),
          0.022
        );
        segment.parent = this.root;
      }
      if (street.hasTram) {
        const rail = createGroundedTube(`street-rail-${street.id}`, this.scene, street.points, 0.035, this.materials.metal, (point) => this.groundY(point), 0.07, 6);
        rail.parent = this.root;
        const wirePath = street.points.map((point) => new Vector3(point.x, this.groundY(point) + 5.75, point.z));
        const wire = MeshBuilder.CreateTube(`street-tram-wire-${street.id}`, { path: wirePath, radius: 0.018, tessellation: 5 }, this.scene);
        wire.material = this.materials.metal;
        wire.parent = this.root;
        for (const [poleIndex, point] of samplePolyline(street.points, 34).entries()) {
          const pole = MeshBuilder.CreateCylinder(`street-tram-pole-${street.id}-${poleIndex}`, { diameter: 0.11, height: 5.7, tessellation: 8 }, this.scene);
          pole.position.set(point.x, this.groundY(point) + 2.85, point.z);
          pole.material = this.materials.metal;
          pole.parent = this.root;
        }
      }
    }
  }

  private addPaths(): void {
    for (const path of this.level.paths) {
      const material = this.materialForPath(path);
      for (let index = 0; index < path.points.length - 1; index += 1) {
        const a = path.points[index];
        const b = path.points[index + 1];
        if (distance(a, b) < 0.05) continue;
        const segment = createTerrainRibbonSegmentMesh(`path-${path.id}-${index}`, this.scene, a, b, path.width, material, (point) => this.groundY(point), PATH_SURFACE_Y);
        segment.parent = this.root;
      }
      for (const [pointIndex, point] of path.points.entries()) {
        const cap = createTerrainDiscMesh(`path-cap-${path.id}-${pointIndex}`, this.scene, point, path.width * 0.5, material, (sample) => this.groundY(sample), PATH_SURFACE_Y + 0.004, 22);
        cap.parent = this.root;
      }
    }
  }

  private addPathSurfacePatches(): void {
    for (const patch of this.level.pathSurfacePatches) {
      const material =
        patch.material === "dirt"
          ? this.materials.dirt
          : patch.material === "worn-grass"
            ? this.materials.wornGrass
            : patch.material === "leaf-litter"
              ? this.materials.leafLitter
              : this.materials.gravel;
      const mesh = createTerrainEllipseMesh(
        `path-patch-${patch.id}`,
        this.scene,
        patch.position,
        patch.length,
        patch.width,
        patch.angle,
        material,
        (point) => this.groundY(point),
        DETAIL_SURFACE_Y + 0.018,
        32
      );
      mesh.parent = this.root;
    }
  }

  private addHardscapeLines(): void {
    for (const line of this.level.hardscapeLines) {
      const material = line.kind === "bluestone-drain" ? this.materials.darkOpening : this.materials.basalt;
      const mesh = createGroundedTube(`hardscape-${line.id}`, this.scene, line.points, Math.max(0.045, line.width * 0.32), material, (point) => this.groundY(point), line.height * 0.45 + 0.08, 8);
      mesh.parent = this.root;
    }
  }

  private addLandmarks(): void {
    for (const landmark of this.level.landmarks) {
      if (landmark.kind === "park") continue;
      if (landmark.polygon) {
        const material = this.materialForLandmark(landmark);
        const footprint = createTerrainPolygonMesh(`landmark-${landmark.id}`, this.scene, landmark.polygon, material, (point) => this.groundY(point), DETAIL_SURFACE_Y, 18);
        footprint.parent = this.root;
      } else if (landmark.position && landmark.radius) {
        const disc = createTerrainDiscMesh(`landmark-${landmark.id}`, this.scene, landmark.position, landmark.radius, this.materialForLandmark(landmark), (point) => this.groundY(point), DETAIL_SURFACE_Y, 36);
        disc.parent = this.root;
      }

      const center = landmark.position ?? (landmark.polygon ? polygonCentroid(landmark.polygon) : null);
      if (landmark.kind === "garden" && landmark.polygon) this.addGardenDetails(landmark);
      if (landmark.kind === "oval" && landmark.polygon) this.addOvalDetails(landmark);
      if (landmark.kind === "grandstand" && landmark.polygon) this.addGrandstandDetails(landmark);
      if (landmark.kind === "tennis" && landmark.polygon) this.addTennisPrecinctDetails(landmark);
      if (landmark.kind === "court" && landmark.polygon) this.addTennisCourtDetails(landmark);
      if (landmark.kind === "bowls" && landmark.polygon) this.addBowlingDetails(landmark);
      if (landmark.kind === "playground" && center) this.addPlaygroundCue(center, landmark.id);
      if (landmark.kind === "skate" && center) this.addSkateCue(center, landmark.id);
      if (landmark.kind === "basketball" && center) this.addBasketballCue(center, landmark.id, landmark.polygon);
      if (landmark.kind === "toilets" && landmark.polygon) this.addToiletBlockCue(landmark);
      if (landmark.kind === "bbq" && center) this.addBbqShelter(center, landmark.id);
      if (landmark.kind === "rotunda" && center) this.addRotunda(center);
      if (landmark.kind === "memorial" && center) this.addMemorialCue(landmark, center);
    }
  }

  private addMappedBuildings(): void {
    for (const building of this.level.mappedBuildings) {
      const material = building.material === "brick" ? this.materials.brick : building.material === "timber" ? this.materials.timber : this.materials.concrete;
      const mesh = createExtrudedPolygonMesh(`building-${building.id}`, this.scene, building.polygon, building.height, material, (point) => this.groundY(point), 0.035);
      mesh.parent = this.root;
      enablePaintedEdges(mesh);
      this.addBuildingDetails(building);

      const center = polygonCentroid(building.polygon);
      if (building.detailProfile === "amenities" || building.detailProfile === "community-centre") {
        const doorway = createBoxBetween(`building-door-${building.id}`, this.scene, center, 1.2, 1.8, 0.08, 0, this.materials.darkOpening, (point) => this.groundY(point), 0.02);
        doorway.position.y = this.groundY(center) + 0.95;
        doorway.parent = this.root;
      }
    }
  }

  private addBuildingDetails(building: MappedBuilding): void {
    const footprint = this.footprintFromPolygon(building.polygon, 0.08, 0.08);
    const roofMaterial = building.detailProfile === "rotunda-pavilion"
      ? this.materials.metal
      : building.material === "brick"
        ? this.detailMaterial("heritage-building-roof", "#596a66", "#101917")
        : this.detailMaterial("utility-building-roof", "#6f786f", "#121814");
    const roof = createExtrudedPolygonMesh(`building-roof-${building.id}`, this.scene, building.polygon, 0.16, roofMaterial, (point) => this.groundY(point), building.height + 0.035);
    roof.parent = this.root;
    enablePaintedEdges(roof, new Color3(0.012, 0.018, 0.018), 0.28);

    if (building.id.includes("715802679")) {
      const tankRadius = Math.max(0.8, Math.min(1.55, Math.max(footprint.halfX, footprint.halfZ) * 0.82));
      const tank = MeshBuilder.CreateCylinder(`storage-tank-rounded-${building.id}`, { diameter: tankRadius * 2, height: building.height, tessellation: 24 }, this.scene);
      tank.position.set(footprint.center.x, this.groundY(footprint.center) + building.height * 0.5 + 0.04, footprint.center.z);
      tank.material = this.materials.metal;
      tank.parent = this.root;
      enablePaintedEdges(tank);
      const cap = MeshBuilder.CreateCylinder(`storage-tank-cap-${building.id}`, { diameterTop: tankRadius * 1.55, diameterBottom: tankRadius * 1.95, height: 0.36, tessellation: 24 }, this.scene);
      cap.position.set(footprint.center.x, this.groundY(footprint.center) + building.height + 0.25, footprint.center.z);
      cap.material = this.materials.metal;
      cap.parent = this.root;
      return;
    }

    this.addBuildingWindowRun(building, footprint, 1, building.height);
    this.addBuildingWindowRun(building, footprint, -1, building.height);
    const frontZ = footprint.halfZ + 0.08;
    this.addLocalBox(`building-door-panel-${building.id}`, footprint.center, footprint.angle, -footprint.halfX * 0.25, frontZ, 0.72, 1.6, 0.07, this.materials.darkOpening, 0.04);

    if (building.detailProfile === "tennis-pavilion") {
      this.addLocalBox(`tennis-verandah-slab-${building.id}`, footprint.center, footprint.angle, 0, frontZ + 0.92, footprint.halfX * 1.55, 0.08, 1.7, this.materials.concrete, 0.08, this.root, 0.2);
      this.addLocalBox(`tennis-verandah-awning-${building.id}`, footprint.center, footprint.angle, 0, frontZ + 0.9, footprint.halfX * 1.65, 0.16, 1.9, this.materials.metal, 2.45);
      for (const x of [-0.62, 0, 0.62]) {
        this.addLocalCylinder(`tennis-verandah-post-${building.id}-${x}`, footprint.center, footprint.angle, x * footprint.halfX, frontZ + 1.62, 0.08, 2.35, this.materials.metal, 0.06);
      }
      this.addOrientedTextPanel(`building-sign-${building.id}`, "FITZROY TENNIS CLUB", "CLUB ROOMS", footprint.center, footprint.angle, 0, frontZ + 1.73, 3.2, 0.58, 1.85);
    } else if (building.detailProfile === "bowling-club") {
      this.addLocalBox(`bowling-club-verandah-${building.id}`, footprint.center, footprint.angle, -footprint.halfX * 0.18, frontZ + 0.8, footprint.halfX * 1.15, 0.12, 1.55, this.materials.timber, 0.1);
      this.addLocalBox(`bowling-club-verandah-roof-${building.id}`, footprint.center, footprint.angle, -footprint.halfX * 0.18, frontZ + 0.78, footprint.halfX * 1.26, 0.14, 1.72, this.materials.metal, 2.75);
      for (const x of [-0.64, -0.2, 0.24, 0.68]) {
        this.addLocalBox(`bowling-club-bench-${building.id}-${x}`, footprint.center, footprint.angle, x * footprint.halfX, frontZ + 1.22, 1.2, 0.16, 0.38, this.materials.timber, 0.5, this.root, 0.18);
      }
      this.addOrientedTextPanel(`building-sign-${building.id}`, "FITZROY VICTORIA", "BOWLING & SPORTS CLUB", footprint.center, footprint.angle, -footprint.halfX * 0.18, frontZ + 1.62, 3.6, 0.62, 2.1);
    } else if (building.detailProfile === "gatehouse") {
      const leftRoof = this.addLocalBox(`gatehouse-roof-left-${building.id}`, footprint.center, footprint.angle, -footprint.halfX * 0.28, 0, footprint.halfX * 1.14, 0.18, footprint.halfZ * 2.18, roofMaterial, building.height + 0.18);
      leftRoof.rotation.z = 0.18;
      const rightRoof = this.addLocalBox(`gatehouse-roof-right-${building.id}`, footprint.center, footprint.angle, footprint.halfX * 0.28, 0, footprint.halfX * 1.14, 0.18, footprint.halfZ * 2.18, roofMaterial, building.height + 0.18);
      rightRoof.rotation.z = -0.18;
    } else if (building.detailProfile === "community-centre") {
      for (const x of [-0.34, 0.34]) {
        const vent = MeshBuilder.CreateCylinder(`community-roof-vent-${building.id}-${x}`, { diameter: 0.38, height: 0.58, tessellation: 10 }, this.scene);
        const ventPoint = this.localPoint(footprint.center, footprint.angle, x * footprint.halfX, 0);
        vent.position.set(ventPoint.x, this.groundY(ventPoint) + building.height + 0.42, ventPoint.z);
        vent.material = this.materials.metal;
        vent.parent = this.root;
      }
      this.addOrientedTextPanel(`building-sign-${building.id}`, "EMELY BAKER CENTRE", "COMMUNITY ROOMS", footprint.center, footprint.angle, 0, frontZ + 0.9, 3.4, 0.62, 1.8);
    } else if (building.detailProfile === "amenities") {
      this.addOrientedTextPanel(`building-sign-${building.id}`, "TOILETS", "AMENITIES", footprint.center, footprint.angle, footprint.halfX * 0.22, frontZ + 0.88, 1.9, 0.58, 1.85);
      this.addLocalCylinder(`amenities-roof-vent-${building.id}`, footprint.center, footprint.angle, footprint.halfX * 0.42, -footprint.halfZ * 0.22, 0.28, 0.55, this.materials.metal, building.height + 0.12);
    } else if (building.detailProfile === "bowling-shed") {
      this.addLocalBox(`shed-roller-door-${building.id}`, footprint.center, footprint.angle, 0, frontZ, footprint.halfX * 1.18, 1.35, 0.08, this.materials.metal, 0.08);
      for (const stripe of [-0.28, 0, 0.28]) {
        this.addLocalBox(`shed-door-slat-${building.id}-${stripe}`, footprint.center, footprint.angle, 0, frontZ + 0.045, footprint.halfX * 1.14, 0.035, 0.035, this.materials.darkOpening, 0.65 + stripe);
      }
    }
  }

  private addBuildingWindowRun(building: MappedBuilding, footprint: LocalFootprint, side: -1 | 1, height: number): void {
    const windowCount = Math.max(1, Math.min(7, Math.floor((footprint.halfX * 2) / 2.1)));
    const windowMaterial = building.detailProfile === "bowling-shed" ? this.materials.darkOpening : this.materials.windowGlow;
    for (let index = 0; index < windowCount; index += 1) {
      if (building.detailProfile === "bowling-shed" && index % 2 === 1) continue;
      const x = windowCount === 1 ? 0 : -footprint.halfX * 0.72 + index * ((footprint.halfX * 1.44) / (windowCount - 1));
      this.addLocalBox(`building-window-${building.id}-${side}-${index}`, footprint.center, footprint.angle, x, side * (footprint.halfZ + 0.055), 0.62, 0.46, 0.045, windowMaterial, Math.min(height - 0.8, 1.45), this.root, 0.14);
      if (height > 3.5 && building.detailProfile !== "bowling-shed") {
        this.addLocalBox(`building-high-window-${building.id}-${side}-${index}`, footprint.center, footprint.angle, x, side * (footprint.halfZ + 0.058), 0.52, 0.36, 0.042, this.materials.darkOpening, Math.min(height - 0.55, 2.55), this.root, 0.12);
      }
    }
  }

  private addOrientedTextPanel(name: string, label: string, sublabel: string, center: Vec2, angle: number, localX: number, localZ: number, width: number, height: number, y: number): void {
    const point = this.localPoint(center, angle, localX, localZ);
    const root = new TransformNode(`${name}-root`, this.scene);
    root.parent = this.root;
    root.position.set(point.x, this.groundY(point), point.z);
    root.rotation.y = -angle;
    this.addLocalTextPanel(root, name, label, sublabel, width, height, y, -0.02);
  }

  private addMappedFences(): void {
    for (const fence of this.level.mappedFences) {
      const rail = createGroundedTube(`fence-${fence.id}`, this.scene, fence.points, 0.055, this.materials.metal, (point) => this.groundY(point), 1.05, 6);
      rail.parent = this.root;
      for (const point of samplePolyline(fence.points, 7)) {
        const post = MeshBuilder.CreateCylinder(`fence-post-${fence.id}`, { diameter: 0.11, height: 1.55, tessellation: 8 }, this.scene);
        post.position.set(point.x, this.groundY(point) + 0.78, point.z);
        post.material = this.materials.metal;
        post.parent = this.root;
      }
    }
  }

  private addPlaceIdentitySigns(): void {
    const centerForLandmark = (id: string): Vec2 | null => {
      const landmark = this.level.landmarks.find((candidate) => candidate.id === id);
      if (!landmark) return null;
      return landmark.position ?? (landmark.polygon ? polygonCentroid(landmark.polygon) : null);
    };
    const shifted = (point: Vec2 | null, x: number, z: number): Vec2 | null => point ? { x: point.x + x, z: point.z + z } : null;
    const specs: Array<{ id: string; label: string; sublabel: string; position: Vec2 | null; angle: number; width?: number }> = [
      {
        id: "edinburgh-gardens-main",
        label: "EDINBURGH GARDENS",
        sublabel: "Alfred Crescent / Fitzroy North",
        position: shifted(centerForLandmark("alfred-crescent-open-lawn"), 13, 18),
        angle: 2.42,
        width: 5.6
      },
      {
        id: "wt-peterson-oval",
        label: "W. T. PETERSON OVAL",
        sublabel: "Kevin Murray Stand",
        position: shifted(centerForLandmark("oval"), -23, -14),
        angle: -0.16,
        width: 5.1
      },
      {
        id: "inner-circle-rail-trail",
        label: "INNER CIRCLE RAIL TRAIL",
        sublabel: "Shared path",
        position: this.level.paths.find((path) => path.kind === "rail")?.points[Math.floor((this.level.paths.find((path) => path.kind === "rail")?.points.length ?? 1) / 2)] ?? null,
        angle: -0.74,
        width: 5.0
      },
      {
        id: "rotunda-identity",
        label: "FITZROY MEMORIAL ROTUNDA",
        sublabel: "1870s garden structure",
        position: shifted(centerForLandmark("rotunda"), 6, -7),
        angle: -0.32,
        width: 5.2
      },
      {
        id: "tennis-club-identity",
        label: "FITZROY TENNIS CLUB",
        sublabel: "Courts and pavilion",
        position: shifted(centerForLandmark("tennis"), 0, 12),
        angle: 0.88,
        width: 4.8
      },
      {
        id: "skate-precinct-identity",
        label: "FITZROY SKATEPARK",
        sublabel: "North activity precinct",
        position: shifted(centerForLandmark("skate"), -9, 5),
        angle: -0.58,
        width: 4.5
      }
    ];

    for (const spec of specs) {
      if (!spec.position || !pointInPolygon(spec.position, this.level.boundary)) continue;
      this.addSign(spec.id, spec.label, spec.sublabel, spec.position, spec.angle, spec.width ?? 4.8, 1.05, 2.0);
    }
  }

  private addUrbanEdges(): void {
    const parkCenter = polygonCentroid(this.level.boundary);
    let facadeCount = 0;
    for (const street of this.level.streetEdges) {
      const samples = samplePolyline(street.points, street.kind === "trunk" ? 26 : 34);
      for (let index = 0; index < samples.length && facadeCount < 48; index += street.kind === "trunk" ? 2 : 3) {
        const point = samples[index];
        const away = normalize2({ x: point.x - parkCenter.x, z: point.z - parkCenter.z });
        const position = {
          x: point.x + away.x * (street.kind === "trunk" ? 12.5 : 8.8),
          z: point.z + away.z * (street.kind === "trunk" ? 12.5 : 8.8)
        };
        const facade = new TransformNode(`street-facade-${street.id}-${index}`, this.scene);
        facade.parent = this.root;
        facade.position.set(position.x, this.groundY(position), position.z);
        facade.rotation.y = Math.atan2(away.x, away.z);

        const height = street.kind === "trunk" ? this.rng.range(7.4, 10.2) : this.rng.range(5.6, 7.8);
        const width = street.kind === "trunk" ? this.rng.range(5.4, 8.2) : this.rng.range(4.2, 6.4);
        const wall = MeshBuilder.CreateBox(`street-facade-wall-${street.id}-${index}`, { width, height, depth: 1.7 }, this.scene);
        wall.position.y = height * 0.5;
        wall.material = facadeCount % 3 === 0 ? this.materials.concrete : this.materials.brick;
        wall.parent = facade;
        enablePaintedEdges(wall, new Color3(0.018, 0.022, 0.024), 0.28);

        const floors = Math.max(1, Math.floor(height / 2.5));
        const columns = Math.max(2, Math.floor(width / 2.2));
        for (let floor = 0; floor < floors; floor += 1) {
          for (let column = 0; column < columns; column += 1) {
            if ((floor + column + facadeCount) % 4 === 0) continue;
            const windowMesh = MeshBuilder.CreateBox(`street-window-${street.id}-${index}-${floor}-${column}`, { width: 0.62, height: 0.5, depth: 0.055 }, this.scene);
            windowMesh.position.set((column - (columns - 1) / 2) * 1.55, 1.65 + floor * 2.15, -0.88);
            windowMesh.material = (floor + column + facadeCount) % 5 === 0 ? this.materials.darkOpening : this.materials.windowGlow;
            windowMesh.parent = facade;
          }
        }

        if (street.kind === "trunk" && index % 4 === 0) {
          const stop = MeshBuilder.CreateBox(`tram-stop-panel-${street.id}-${index}`, { width: 0.9, height: 1.35, depth: 0.07 }, this.scene);
          stop.position.set(-width * 0.55, 1.1, -1.4);
          stop.material = this.materials.signPaint;
          stop.parent = facade;
          const shelter = MeshBuilder.CreateBox(`tram-stop-shelter-${street.id}-${index}`, { width: 2.2, height: 0.1, depth: 1.1 }, this.scene);
          shelter.position.set(-width * 0.55, 2.1, -1.3);
          shelter.material = this.materials.metal;
          shelter.parent = facade;
        }

        facadeCount += 1;
      }
    }
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

  private addAmenities(): void {
    for (const amenity of this.level.amenities) {
      const root = new TransformNode(`amenity-${amenity.id}`, this.scene);
      root.parent = this.root;
      root.position.set(amenity.position.x, this.groundY(amenity.position), amenity.position.z);
      if (amenity.kind === "bench") this.addBench(root);
      else if (amenity.kind === "picnic_table") this.addPicnicTable(root);
      else if (amenity.kind === "drinking_water") this.addDrinkingFountain(root);
      else if (amenity.kind === "waste_basket") this.addBin(root);
      else if (amenity.kind === "bicycle_parking") this.addBikeRack(root);
      else this.addAmenityMarker(root, amenity);
    }
  }

  private addParkLifeDetails(): void {
    for (const detail of this.level.parkLifeDetails) {
      const root = new TransformNode(`park-life-${detail.id}`, this.scene);
      root.parent = this.root;
      root.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
      root.rotation.y = -detail.angle;
      this.addParkLifeMarker(root, detail);
    }
  }

  private addOutbreakTraces(): void {
    for (const [index, point] of this.level.spawnPoints.entries()) {
      if (index > 8) break;
      const smear = createTerrainEllipseMesh(
        `spawn-smear-${index}`,
        this.scene,
        point,
        this.rng.range(2.2, 5.2),
        this.rng.range(0.42, 1.05),
        this.rng.range(0, Math.PI),
        this.materials.blood,
        (sample) => this.groundY(sample),
        DETAIL_SURFACE_Y + 0.041,
        18
      );
      smear.parent = this.root;

      if (index % 2 === 0) {
        this.addFallenBarrier(point, `spawn-${index}`, this.rng.range(-0.8, 0.8));
      }
    }

    const pathSamples = this.level.paths.flatMap((path) => samplePolyline(path.points, 46));
    for (const [index, point] of pathSamples.slice(0, 22).entries()) {
      if (index % 3 !== 0) continue;
      const paper = createTerrainEllipseMesh(
        `wet-paper-${index}`,
        this.scene,
        {
          x: point.x + this.rng.range(-2.2, 2.2),
          z: point.z + this.rng.range(-1.4, 1.4)
        },
        this.rng.range(0.42, 0.82),
        this.rng.range(0.18, 0.34),
        this.rng.range(0, Math.PI),
        this.materials.paper,
        (sample) => this.groundY(sample),
        DETAIL_SURFACE_Y + 0.044,
        8
      );
      paper.parent = this.root;
    }
  }

  private addFallenBarrier(point: Vec2, id: string, angle: number): void {
    const root = new TransformNode(`fallen-barrier-${id}`, this.scene);
    root.parent = this.root;
    root.position.set(point.x + this.rng.range(-1.8, 1.8), this.groundY(point), point.z + this.rng.range(-1.8, 1.8));
    root.rotation.y = angle;
    root.rotation.z = this.rng.range(-0.08, 0.08);
    for (const offsetY of [0.34, 0.72]) {
      const rail = MeshBuilder.CreateBox(`fallen-barrier-rail-${id}-${offsetY}`, { width: 2.2, height: 0.055, depth: 0.06 }, this.scene);
      rail.position.y = offsetY;
      rail.material = this.materials.metal;
      rail.parent = root;
    }
    for (const offsetX of [-0.92, 0.92]) {
      const leg = MeshBuilder.CreateCylinder(`fallen-barrier-leg-${id}-${offsetX}`, { diameter: 0.055, height: 1.0, tessellation: 6 }, this.scene);
      leg.position.set(offsetX, 0.5, 0);
      leg.rotation.z = 0.08 * Math.sign(offsetX);
      leg.material = this.materials.metal;
      leg.parent = root;
    }
    const tape = MeshBuilder.CreateBox(`fallen-barrier-tape-${id}`, { width: 2.35, height: 0.13, depth: 0.025 }, this.scene);
    tape.position.set(0, 0.88, -0.04);
    tape.material = this.materials.signPaint;
    tape.parent = root;
  }

  private addUpgradeStations(): void {
    for (const station of this.level.upgradeStations) {
      const root = new TransformNode(`upgrade-${station.id}`, this.scene);
      root.parent = this.root;
      root.position.set(station.position.x, this.groundY(station.position) + 0.08, station.position.z);
      const crate = MeshBuilder.CreateBox(`upgrade-crate-${station.id}`, { width: 1.35, height: 0.72, depth: 0.95 }, this.scene);
      crate.position.y = 0.36;
      crate.material = this.materials.timber;
      crate.parent = root;
      enablePaintedEdges(crate);
      const halo = MeshBuilder.CreateTorus(`upgrade-halo-${station.id}`, { diameter: 2.2, thickness: 0.035, tessellation: 28 }, this.scene);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.08;
      halo.material = this.materials.glow;
      halo.parent = root;
    }
  }

  private addWeaponSpawns(): void {
    for (const spawn of this.level.weaponSpawns) {
      const root = new TransformNode(`weapon-cache-${spawn.id}`, this.scene);
      root.parent = this.root;
      root.position.set(spawn.position.x, this.groundY(spawn.position), spawn.position.z);
      root.rotation.y = this.rng.range(-0.42, 0.42);
      const crate = MeshBuilder.CreateBox(`weapon-cache-crate-${spawn.id}`, { width: 1.35, height: 0.34, depth: 0.88 }, this.scene);
      crate.position.y = 0.19;
      crate.material = this.materials.timber;
      crate.parent = root;
      enablePaintedEdges(crate);
      const cloth = MeshBuilder.CreateBox(`weapon-cache-cloth-${spawn.id}`, { width: 1.55, height: 0.035, depth: 0.98 }, this.scene);
      cloth.position.y = 0.39;
      cloth.rotation.y = 0.12;
      cloth.material = this.materials.clothDark;
      cloth.parent = root;
      const weapon = this.meshFactory.createWeaponMesh(spawn.weaponId, false);
      weapon.parent = root;
      weapon.position.set(0, 0.66, 0);
      weapon.rotation.y = Math.PI / 2;
      weapon.rotation.z = -0.08;
      weapon.scaling.setAll(0.92);
      const label = MeshBuilder.CreateBox(`weapon-cache-label-${spawn.id}`, { width: 0.58, height: 0.035, depth: 0.28 }, this.scene);
      label.position.set(-0.36, 0.43, -0.28);
      label.rotation.y = -0.16;
      label.material = this.materials.paper;
      label.parent = root;
      const marker = MeshBuilder.CreateTorus(`weapon-cache-ring-${spawn.id}`, { diameter: 1.8, thickness: 0.035, tessellation: 24 }, this.scene);
      marker.position.y = 0.12;
      marker.rotation.x = Math.PI / 2;
      marker.material = this.materials.glow;
      marker.parent = root;
    }
  }

  private addBoundaryFence(): void {
    const samples = samplePolyline(this.level.boundary, 7.5);
    for (const [index, point] of samples.entries()) {
      if (index % 2 === 1) continue;
      const post = MeshBuilder.CreateCylinder(`boundary-post-${index}`, { diameter: 0.09, height: 1.1, tessellation: 7 }, this.scene);
      post.position.set(point.x, this.groundY(point) + 0.55, point.z);
      post.material = this.materials.metal;
      post.parent = this.root;
    }
  }

  private addUnderCanopyGroundWear(): void {
    for (const tree of this.level.trees.slice(0, 260)) {
      const radius = Math.max(1.8, tree.canopyRadius * 0.42);
      const mesh = createTerrainDiscMesh(`tree-wear-${tree.id}`, this.scene, tree.position, radius, this.materials.leafLitter, (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.006, 18);
      mesh.parent = this.root;
    }
  }

  private addTrees(): void {
    const seeds = this.treeSeeds();
    for (let index = 0; index < seeds.length; index += 1) {
      this.addTree(seeds[index], index);
    }
    this.report.treeCount = seeds.length;
  }

  private addGrassClumps(): void {
    const source = MeshBuilder.CreatePlane("grass-clump-source", { width: 0.42, height: 1.0 }, this.scene);
    source.material = this.materials.grassBlade;
    source.parent = this.root;
    source.isVisible = true;

    const bounds = this.boundaryBounds();
    let count = 0;
    let attempts = 0;
    while (count < GRASS_CLUSTER_LIMIT && attempts < GRASS_CLUSTER_LIMIT * 18) {
      attempts += 1;
      const point = {
        x: this.rng.range(bounds.minX, bounds.maxX),
        z: this.rng.range(bounds.minZ, bounds.maxZ)
      };
      if (!pointInPolygon(point, this.level.boundary) || this.isNearPath(point, 1.2)) continue;
      const scale = new Vector3(this.rng.range(0.45, 0.95), this.rng.range(0.5, 1.25), 1);
      const rotation = Quaternion.RotationYawPitchRoll(this.rng.range(0, Math.PI * 2), 0, 0);
      const matrix = Matrix.Compose(scale, rotation, new Vector3(point.x, this.groundY(point) + scale.y * 0.46, point.z));
      source.thinInstanceAdd(matrix, false);
      count += 1;
    }
    source.thinInstanceRefreshBoundingInfo(true);
    this.report.grassClumpCount = count;
  }

  private addWetPathSheen(): void {
    const samples: Vec2[] = [];
    for (const path of this.level.paths) {
      for (const sample of samplePolyline(path.points, 18)) {
        if (this.rng.next() < 0.22) samples.push(sample);
      }
    }
    for (const [index, point] of samples.slice(0, 86).entries()) {
      const mesh = createTerrainEllipseMesh(`wet-path-sheen-${index}`, this.scene, point, this.rng.range(2.4, 5.8), this.rng.range(0.38, 1.2), this.rng.range(0, Math.PI), this.materials.puddle, (sample) => this.groundY(sample), DETAIL_SURFACE_Y + 0.035, 22);
      mesh.parent = this.root;
      this.report.wetPathSheenCount += 1;
    }
  }

  private addPathLights(): void {
    const samples = this.level.paths.flatMap((path) => samplePolyline(path.points, 42));
    for (const [index, point] of samples.entries()) {
      if (index % 5 !== 0 || this.report.lampSpillCount >= 34) continue;
      const pole = MeshBuilder.CreateCylinder(`lamp-pole-${index}`, { diameter: 0.075, height: 3.2, tessellation: 8 }, this.scene);
      pole.position.set(point.x, this.groundY(point) + 1.6, point.z);
      pole.material = this.materials.metal;
      pole.parent = this.root;
      const bulb = new PointLight(`lamp-light-${index}`, new Vector3(point.x, this.groundY(point) + 3.15, point.z), this.scene);
      bulb.diffuse = new Color3(1, 0.76, 0.42);
      bulb.intensity = 0.18;
      bulb.range = 22;
      const spill = createTerrainDiscMesh(`lamp-spill-${index}`, this.scene, point, 5.8, this.materials.glow, (sample) => this.groundY(sample), DETAIL_SURFACE_Y + 0.028, 24);
      spill.parent = this.root;
      this.report.lampSpillCount += 1;
    }
  }

  private addWeather(): void {
    this.rainRoot = new TransformNode("rain-root", this.scene);
    this.rainRoot.parent = this.dynamicRoot;
    const rain = MeshBuilder.CreateCylinder("rain-streak-source", { diameter: 0.018, height: 1.8, tessellation: 4 }, this.scene);
    rain.rotation.x = 0.18;
    rain.material = this.materials.water;
    rain.parent = this.rainRoot;
    rain.isVisible = true;

    const bounds = this.boundaryBounds();
    const rainCount = 620;
    for (let index = 0; index < rainCount; index += 1) {
      const point = {
        x: this.rng.range(bounds.minX, bounds.maxX),
        z: this.rng.range(bounds.minZ, bounds.maxZ)
      };
      const matrix = Matrix.Compose(
        new Vector3(0.62, this.rng.range(0.7, 1.35), 0.62),
        Quaternion.RotationYawPitchRoll(this.rng.range(-0.18, 0.18), 0.18, this.rng.range(-0.08, 0.08)),
        new Vector3(point.x, this.rng.range(7, 38), point.z)
      );
      rain.thinInstanceAdd(matrix, false);
    }
    rain.thinInstanceRefreshBoundingInfo(true);
    this.report.rainDropCount = rainCount;

    this.mistRoot = new TransformNode("mist-root", this.scene);
    this.mistRoot.parent = this.dynamicRoot;
    const mistCount = 42;
    for (let index = 0; index < mistCount; index += 1) {
      const point = this.rng.pick(this.level.spawnPoints);
      const mesh = createTerrainEllipseMesh(`mist-bank-${index}`, this.scene, point, this.rng.range(10, 26), this.rng.range(3.5, 8), this.rng.range(0, Math.PI), this.materials.water, (sample) => this.groundY(sample), DETAIL_SURFACE_Y + 0.02, 26);
      mesh.parent = this.mistRoot;
      this.report.mistBankCount += 1;
    }

    this.report.weatherAnchorCount = this.level.spawnPoints.length + this.report.lampSpillCount + mistCount;
  }

  private addTree(seed: TreeSeed, index: number): void {
    const root = new TransformNode(`tree-${seed.id}`, this.scene);
    root.parent = this.root;
    root.position.set(seed.position.x, this.groundY(seed.position), seed.position.z);
    const scale = TREE_SCALE_MULTIPLIER * (seed.height ? clamp(seed.height / 19, 0.76, 1.48) : seed.profile === "elm" ? 1.12 : 1);
    const trunkHeight = (seed.height ? clamp(seed.height * 0.34, 4.2, 8.8) : this.rng.range(4.4, 7.2)) * scale;
    const trunkRadius = (seed.dbh ? clamp(seed.dbh / 180, 0.28, 0.78) : this.rng.range(0.34, 0.62)) * scale;
    const trunkMaterial = this.treeMaterial(seed.profile, "trunk", index);
    const leafMaterial = this.treeMaterial(seed.profile, "leaf", index);

    const trunk = MeshBuilder.CreateCylinder(`tree-trunk-${seed.id}`, { diameterTop: trunkRadius * 1.35, diameterBottom: trunkRadius * 1.95, height: trunkHeight, tessellation: 8 }, this.scene);
    trunk.position.y = trunkHeight * 0.5;
    trunk.material = trunkMaterial;
    trunk.parent = root;
    enablePaintedEdges(trunk);

    for (let rootIndex = 0; rootIndex < 4; rootIndex += 1) {
      const angle = (rootIndex / 4) * Math.PI * 2 + this.rng.range(-0.22, 0.22);
      const flare = MeshBuilder.CreateBox(`tree-root-${seed.id}-${rootIndex}`, { width: trunkRadius * 0.42, height: trunkRadius * 0.32, depth: trunkRadius * 2.2 }, this.scene);
      flare.position.set(Math.cos(angle) * trunkRadius * 0.48, trunkRadius * 0.16, Math.sin(angle) * trunkRadius * 0.48);
      flare.rotation.y = -angle;
      flare.rotation.x = this.rng.range(-0.08, 0.08);
      flare.material = trunkMaterial;
      flare.parent = root;
      enablePaintedEdges(flare, new Color3(0.025, 0.035, 0.025), 0.48);
    }

    this.addTreeSpeciesDetails(root, seed, index, trunkHeight, trunkRadius, trunkMaterial, leafMaterial);

    for (let branchIndex = 0; branchIndex < 5; branchIndex += 1) {
      const branch = MeshBuilder.CreateCylinder(`tree-branch-${seed.id}-${branchIndex}`, { diameterTop: trunkRadius * 0.34, diameterBottom: trunkRadius * 0.58, height: trunkHeight * this.rng.range(0.45, 0.72), tessellation: 6 }, this.scene);
      branch.position.set(this.rng.range(-0.6, 0.6), trunkHeight * this.rng.range(0.66, 0.86), this.rng.range(-0.6, 0.6));
      branch.rotation.z = this.rng.range(-0.82, 0.82);
      branch.rotation.x = this.rng.range(-0.54, 0.54);
      branch.rotation.y = this.rng.range(0, Math.PI * 2);
      branch.material = trunkMaterial;
      branch.parent = root;
      enablePaintedEdges(branch, new Color3(0.025, 0.035, 0.025), 0.58);
    }

    const canopyBase = Math.max(2.6, seed.canopyRadius) * scale * (0.78 + seed.canopyDensity * 0.16);
    const canopyCount = seed.profile === "gum" ? 5 : seed.profile === "elm" ? 7 : 6;
    for (let canopyIndex = 0; canopyIndex < canopyCount; canopyIndex += 1) {
      const canopy = MeshBuilder.CreateSphere(`tree-canopy-${seed.id}-${canopyIndex}`, { diameter: canopyBase * this.rng.range(0.58, 1.08), segments: 8 }, this.scene);
      const orbit = (canopyIndex / canopyCount) * Math.PI * 2 + this.rng.range(-0.55, 0.55);
      const spread = canopyBase * this.rng.range(0.06, 0.34);
      canopy.position.set(
        Math.cos(orbit) * spread,
        trunkHeight + this.rng.range(-0.9, 1.55),
        Math.sin(orbit) * spread
      );
      canopy.scaling.x = this.rng.range(0.86, 1.24);
      canopy.scaling.y = this.rng.range(0.56, 0.94);
      canopy.scaling.z = this.rng.range(0.82, 1.26);
      canopy.rotation.y = this.rng.range(0, Math.PI * 2);
      canopy.material = leafMaterial;
      canopy.parent = root;
      enablePaintedEdges(canopy, new Color3(0.02, 0.045, 0.025), 0.52);
    }
  }

  private addTreeSpeciesDetails(
    root: TransformNode,
    seed: TreeSeed,
    index: number,
    trunkHeight: number,
    trunkRadius: number,
    trunkMaterial: StandardMaterial,
    leafMaterial: StandardMaterial
  ): void {
    if (seed.profile === "gum") {
      const paleBark = this.detailMaterial("gum-pale-bark", "#b7ad91", "#1a1710");
      for (let patch = 0; patch < 3; patch += 1) {
        const angle = (patch / 3) * Math.PI * 2 + (index % 5) * 0.17;
        const scar = MeshBuilder.CreateBox(`gum-bark-scar-${seed.id}-${patch}`, { width: trunkRadius * 0.36, height: trunkHeight * 0.42, depth: 0.035 }, this.scene);
        scar.position.set(Math.cos(angle) * trunkRadius * 0.9, trunkHeight * (0.34 + patch * 0.08), Math.sin(angle) * trunkRadius * 0.9);
        scar.rotation.y = -angle;
        scar.material = paleBark;
        scar.parent = root;
      }
      const droppedBranch = MeshBuilder.CreateCylinder(`gum-dropped-branch-${seed.id}`, { diameter: trunkRadius * 0.18, height: trunkRadius * 3.4, tessellation: 6 }, this.scene);
      droppedBranch.position.set(trunkRadius * 1.7, trunkRadius * 0.12, -trunkRadius * 0.9);
      droppedBranch.rotation.z = Math.PI / 2;
      droppedBranch.rotation.y = (index % 8) * 0.31;
      droppedBranch.material = trunkMaterial;
      droppedBranch.parent = root;
      return;
    }

    if (seed.profile === "elm") {
      for (const side of [-1, 1]) {
        const limb = MeshBuilder.CreateCylinder(`elm-low-limb-${seed.id}-${side}`, { diameterTop: trunkRadius * 0.2, diameterBottom: trunkRadius * 0.36, height: trunkRadius * 3.2, tessellation: 6 }, this.scene);
        limb.position.set(side * trunkRadius * 1.25, trunkHeight * 0.74, 0);
        limb.rotation.z = side * 0.95;
        limb.rotation.x = 0.32;
        limb.material = trunkMaterial;
        limb.parent = root;
        enablePaintedEdges(limb, new Color3(0.025, 0.035, 0.025), 0.4);
      }
      if (seed.canopyDensity > 0.8) {
        const skirt = MeshBuilder.CreateSphere(`elm-canopy-skirt-${seed.id}`, { diameter: Math.max(2.1, seed.canopyRadius * 0.72), segments: 8 }, this.scene);
        skirt.position.set(0, trunkHeight * 0.96, 0);
        skirt.scaling.y = 0.32;
        skirt.material = leafMaterial;
        skirt.parent = root;
        enablePaintedEdges(skirt, new Color3(0.02, 0.045, 0.025), 0.34);
      }
      return;
    }

    if (seed.profile === "oak") {
      const hollow = MeshBuilder.CreateCylinder(`oak-hollow-${seed.id}`, { diameter: trunkRadius * 0.55, height: 0.035, tessellation: 10 }, this.scene);
      hollow.position.set(0, trunkHeight * 0.38, -trunkRadius * 0.98);
      hollow.rotation.x = Math.PI / 2;
      hollow.material = this.materials.darkOpening;
      hollow.parent = root;
      const lowLimb = MeshBuilder.CreateCylinder(`oak-heavy-limb-${seed.id}`, { diameterTop: trunkRadius * 0.28, diameterBottom: trunkRadius * 0.48, height: trunkRadius * 3.8, tessellation: 6 }, this.scene);
      lowLimb.position.set(-trunkRadius * 1.45, trunkHeight * 0.64, trunkRadius * 0.28);
      lowLimb.rotation.z = -0.92;
      lowLimb.rotation.x = -0.18;
      lowLimb.material = trunkMaterial;
      lowLimb.parent = root;
    } else if (index % 9 === 0) {
      const branch = MeshBuilder.CreateCylinder(`generic-fallen-stick-${seed.id}`, { diameter: trunkRadius * 0.12, height: trunkRadius * 2.6, tessellation: 5 }, this.scene);
      branch.position.set(-trunkRadius * 1.6, trunkRadius * 0.08, trunkRadius * 1.1);
      branch.rotation.z = Math.PI / 2;
      branch.rotation.y = index * 0.21;
      branch.material = trunkMaterial;
      branch.parent = root;
    }
  }

  private treeSeeds(): TreeSeed[] {
    const seen = new Set<string>();
    const seeds: TreeSeed[] = [];
    const add = (seed: TreeSeed) => {
      const key = `${Math.round(seed.position.x * 2) / 2}:${Math.round(seed.position.z * 2) / 2}`;
      if (seen.has(key)) return;
      seen.add(key);
      seeds.push(seed);
    };

    for (const tree of this.level.trees) {
      add(tree);
    }
    for (const tree of this.level.significantTrees) {
      add({
        id: tree.id,
        position: tree.position,
        profile: tree.genus.toLowerCase().includes("ulmus") ? "elm" : tree.genus.toLowerCase().includes("quercus") ? "oak" : "gum",
        canopyRadius: Math.max(4.2, tree.dbh / 18),
        canopyDensity: 0.88,
        height: tree.height,
        dbh: tree.dbh
      });
    }
    for (const [index, point] of this.level.treePoints.entries()) {
      add({
        id: `legacy-tree-point-${index}`,
        position: point,
        profile: "generic",
        canopyRadius: 4.2,
        canopyDensity: 0.72
      });
    }
    for (const [lineIndex, line] of this.level.treeLines.entries()) {
      for (const [sampleIndex, point] of samplePolyline(line, 9).entries()) {
        add({
          id: `tree-line-${lineIndex}-${sampleIndex}`,
          position: point,
          profile: "elm",
          canopyRadius: 4.8,
          canopyDensity: 0.82
        });
      }
    }
    return seeds;
  }

  private addGardenDetails(landmark: Landmark): void {
    if (!landmark.polygon) return;
    if (landmark.id === "raingarden-reservoir") {
      this.addRaingardenDetails(landmark.polygon);
      return;
    }

    const footprint = this.footprintFromPolygon(landmark.polygon);
    const lightBand = this.detailMaterial("mown-lawn-light", "#8da76f", "#172014", 0.24);
    const darkBand = this.detailMaterial("mown-lawn-dark", "#4e7547", "#10190f", 0.18);
    const bandCount = landmark.id === "north-activity-precinct" ? 4 : 7;
    for (let index = 0; index < bandCount; index += 1) {
      const z = -footprint.halfZ * 0.72 + (index / Math.max(1, bandCount - 1)) * footprint.halfZ * 1.44;
      const a = this.localPoint(footprint.center, footprint.angle + 0.08, -footprint.halfX * 0.82, z);
      const b = this.localPoint(footprint.center, footprint.angle + 0.08, footprint.halfX * 0.82, z);
      const mid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
      if (!pointInPolygon(mid, landmark.polygon)) continue;
      const band = createTerrainRibbonSegmentMesh(
        `garden-mown-band-${landmark.id}-${index}`,
        this.scene,
        a,
        b,
        Math.max(1.2, footprint.halfZ * 0.12),
        index % 2 === 0 ? lightBand : darkBand,
        (point) => this.groundY(point),
        DETAIL_SURFACE_Y + 0.012
      );
      band.parent = this.root;
    }

    if (landmark.id === "north-activity-precinct") {
      const pad = createTerrainDiscMesh(`activity-games-pad-${landmark.id}`, this.scene, this.localPoint(footprint.center, footprint.angle, -footprint.halfX * 0.24, footprint.halfZ * 0.24), 3.2, this.materials.concrete, (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.02, 24);
      pad.parent = this.root;
      this.addLocalBox(`activity-chess-light-${landmark.id}`, footprint.center, footprint.angle, -footprint.halfX * 0.24 - 0.55, footprint.halfZ * 0.24, 0.64, 0.08, 0.64, this.detailMaterial("chess-light", "#d8cfaa", "#2a2418"), 0.62);
      this.addLocalBox(`activity-chess-dark-${landmark.id}`, footprint.center, footprint.angle, -footprint.halfX * 0.24 + 0.55, footprint.halfZ * 0.24, 0.64, 0.08, 0.64, this.detailMaterial("chess-dark", "#303831", "#080908"), 0.62);
    }
  }

  private addRaingardenDetails(polygon: readonly Vec2[]): void {
    const footprint = this.footprintFromPolygon(polygon, 1.2, 0.8);
    const center = footprint.center;
    const angle = footprint.angle;
    const terraceWidth = Math.max(5.2, footprint.halfX * 1.48);
    const plantedDepth = Math.max(8, footprint.halfZ * 1.7);
    const terraceDepth = plantedDepth / 5.2;

    const basin = createTerrainEllipseMesh("raingarden-basin", this.scene, center, terraceWidth + 2.2, plantedDepth + 1.8, angle, this.materials.leafLitter, (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.006, 42);
    basin.parent = this.root;
    this.addPolygonFence("raingarden-low-edge", polygon, 0.42, this.materials.basalt);

    for (let terrace = 0; terrace < 4; terrace += 1) {
      const localZ = -plantedDepth * 0.38 + terrace * terraceDepth * 1.12;
      const material = terrace % 2 === 0 ? this.materials.mulch : this.materials.wornGrass;
      this.addLocalBox(`raingarden-terrace-${terrace}`, center, angle, 0, localZ, terraceWidth, 0.055, terraceDepth, material, 0.075, this.root, 0.2);
      if (terrace < 3) {
        this.addLocalBox(`raingarden-retaining-lip-${terrace}`, center, angle, 0, localZ + terraceDepth * 0.56, terraceWidth * 0.92, 0.18, 0.12, this.materials.basalt, 0.09);
      }
    }

    const channel = [
      { x: -footprint.halfX * 0.54, z: -plantedDepth * 0.43 },
      { x: footprint.halfX * 0.46, z: -plantedDepth * 0.24 },
      { x: -footprint.halfX * 0.42, z: -plantedDepth * 0.04 },
      { x: footprint.halfX * 0.48, z: plantedDepth * 0.15 },
      { x: -footprint.halfX * 0.32, z: plantedDepth * 0.32 },
      { x: footprint.halfX * 0.5, z: plantedDepth * 0.44 }
    ];
    for (let index = 0; index < channel.length - 1; index += 1) {
      const a = this.localPoint(center, angle, channel[index].x, channel[index].z);
      const b = this.localPoint(center, angle, channel[index + 1].x, channel[index + 1].z);
      const water = createTerrainRibbonSegmentMesh(`raingarden-channel-water-${index}`, this.scene, a, b, 0.42, this.materials.puddle, (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.056);
      water.parent = this.root;
      const segmentAngle = Math.atan2(b.z - a.z, b.x - a.x);
      const normal = { x: -Math.sin(segmentAngle), z: Math.cos(segmentAngle) };
      for (const side of [-1, 1]) {
        const edgeA = { x: a.x + normal.x * side * 0.28, z: a.z + normal.z * side * 0.28 };
        const edgeB = { x: b.x + normal.x * side * 0.28, z: b.z + normal.z * side * 0.28 };
        const edge = createGroundedTube(`raingarden-channel-steel-${index}-${side}`, this.scene, [edgeA, edgeB], 0.034, this.materials.metal, (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.09, 5);
        edge.parent = this.root;
      }
    }

    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 10; column += 1) {
        if (row % 2 === 1 && column >= 4 && column <= 5) continue;
        const localX = -footprint.halfX * 0.68 + column * ((footprint.halfX * 1.36) / 9);
        const localZ = -plantedDepth * 0.33 + row * ((plantedDepth * 0.66) / 3);
        const point = this.localPoint(center, angle, localX, localZ);
        if (!pointInPolygon(point, polygon)) continue;
        const sedge = MeshBuilder.CreateCylinder(`raingarden-sedge-${row}-${column}`, { diameterTop: 0.04, diameterBottom: 0.34, height: this.rng.range(0.65, 1.25), tessellation: 5 }, this.scene);
        sedge.position.set(point.x, this.groundY(point) + sedge.getBoundingInfo().boundingBox.extendSize.y + 0.08, point.z);
        sedge.rotation.y = this.rng.range(0, Math.PI * 2);
        sedge.material = this.materials.hedge;
        sedge.parent = this.root;
        enablePaintedEdges(sedge, new Color3(0.018, 0.036, 0.022), 0.22);
      }
    }
  }

  private addOvalDetails(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const footprint = this.footprintFromPolygon(landmark.polygon);
    const center = footprint.center;
    const radiusX = footprint.halfX * 0.86;
    const radiusZ = footprint.halfZ * 0.86;
    for (let band = 0; band < 5; band += 1) {
      const material = band % 2 === 0 ? this.detailMaterial("oval-mow-light", "#84a968", "#172313", 0.34) : this.detailMaterial("oval-mow-dark", "#4d7a45", "#101b0d", 0.24);
      this.addEllipseTube(`oval-mown-ring-${band}`, center, radiusX * (1 - band * 0.105), radiusZ * (1 - band * 0.105), footprint.angle, material, DETAIL_SURFACE_Y + 0.052, 0.035);
    }
    this.addEllipseTube("oval-boundary-line", center, radiusX * 0.83, radiusZ * 0.83, footprint.angle, this.materials.line, DETAIL_SURFACE_Y + 0.08, 0.052);
    this.addCourtCircle("oval-centre", center, 9.5, this.materials.line);
    this.addLocalBox("oval-cricket-pitch", center, footprint.angle + 0.1, 0, 0, 4.7, 0.035, 20, this.materials.path, 0.12, this.root, 0.14);
    this.addFieldLines("oval-cricket-crease", center, 4.9, 20.6, footprint.angle + 0.1, [
      { x1: -0.5, z1: -0.32, x2: 0.5, z2: -0.32 },
      { x1: -0.5, z1: 0.32, x2: 0.5, z2: 0.32 },
      { x1: -0.18, z1: -0.42, x2: -0.18, z2: -0.24 },
      { x1: 0.18, z1: -0.42, x2: 0.18, z2: -0.24 },
      { x1: -0.18, z1: 0.42, x2: -0.18, z2: 0.24 },
      { x1: 0.18, z1: 0.42, x2: 0.18, z2: 0.24 }
    ], this.materials.line, 0.12);
    for (let index = 0; index < 22; index += 1) {
      const theta = (index / 22) * Math.PI * 2;
      const marker = this.localPoint(center, footprint.angle, Math.cos(theta) * radiusX * 0.91, Math.sin(theta) * radiusZ * 0.91);
      const peg = MeshBuilder.CreateCylinder(`oval-boundary-marker-${index}`, { diameter: 0.12, height: 0.52, tessellation: 7 }, this.scene);
      peg.position.set(marker.x, this.groundY(marker) + 0.26, marker.z);
      peg.material = this.materials.line;
      peg.parent = this.root;
    }
  }

  private addGrandstandDetails(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const footprint = this.footprintFromPolygon(landmark.polygon, 0.4, 0.35);
    const center = footprint.center;
    const oval = this.level.landmarks.find((candidate) => candidate.id === "oval" && candidate.polygon)?.polygon;
    const ovalCenter = oval ? polygonCentroid(oval) : center;
    const dx = ovalCenter.x - center.x;
    const dz = ovalCenter.z - center.z;
    const localOvalZ = -dx * Math.sin(footprint.angle) + dz * Math.cos(footprint.angle);
    const frontSign = localOvalZ >= 0 ? 1 : -1;
    this.addLocalBox("grandstand-brick-body", center, footprint.angle, 0, 0, footprint.halfX * 1.78, 3.6, footprint.halfZ * 1.3, this.materials.brick, 0.02);
    this.addLocalBox("grandstand-roof-canopy", center, footprint.angle, 0, -frontSign * footprint.halfZ * 0.18, footprint.halfX * 2.02, 0.28, footprint.halfZ * 1.9, this.materials.metal, 3.6);
    const frontZ = frontSign * (footprint.halfZ * 0.72);
    for (let step = 0; step < 5; step += 1) {
      this.addLocalBox(`grandstand-seat-step-${step}`, center, footprint.angle, 0, frontZ - frontSign * step * 0.45, footprint.halfX * 1.36, 0.18, 0.36, this.materials.concrete, 0.22 + step * 0.18);
    }
    for (const x of [-0.42, -0.14, 0.14, 0.42]) {
      this.addLocalCylinder(`grandstand-front-post-${x}`, center, footprint.angle, x * footprint.halfX * 1.7, frontZ + frontSign * 0.18, 0.09, 2.8, this.materials.metal, 0.12);
    }
    this.addSign("kevin-murray-stand", "KEVIN MURRAY STAND", "W. T. Peterson Oval", this.localPoint(center, footprint.angle, 0, frontZ + frontSign * 0.52), footprint.angle, 4.4, 0.76, 2.2);
  }

  private addTennisPrecinctDetails(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addPolygonFence(`tennis-fence-${landmark.id}`, landmark.polygon, 2.1, this.materials.metal);
    const footprint = this.footprintFromPolygon(landmark.polygon);
    for (const x of [-0.72, 0.72]) {
      const postPoint = this.localPoint(footprint.center, footprint.angle, x * footprint.halfX, footprint.halfZ * 0.78);
      const lamp = MeshBuilder.CreateCylinder(`tennis-light-pole-${x}`, { diameter: 0.11, height: 5.2, tessellation: 8 }, this.scene);
      lamp.position.set(postPoint.x, this.groundY(postPoint) + 2.6, postPoint.z);
      lamp.material = this.materials.metal;
      lamp.parent = this.root;
      const head = MeshBuilder.CreateBox(`tennis-light-head-${x}`, { width: 0.72, height: 0.16, depth: 0.26 }, this.scene);
      head.position.set(postPoint.x, this.groundY(postPoint) + 5.24, postPoint.z);
      head.rotation.y = -footprint.angle;
      head.material = this.materials.windowGlow;
      head.parent = this.root;
    }
  }

  private addTennisCourtDetails(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const footprint = this.footprintFromPolygon(landmark.polygon);
    this.addFieldLines(`tennis-${landmark.id}`, footprint.center, footprint.halfX * 1.72, footprint.halfZ * 1.72, footprint.angle, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 },
      { x1: 0, z1: -0.5, x2: 0, z2: 0.5 },
      { x1: -0.5, z1: 0, x2: 0.5, z2: 0 },
      { x1: -0.32, z1: -0.5, x2: -0.32, z2: 0.5 },
      { x1: 0.32, z1: -0.5, x2: 0.32, z2: 0.5 }
    ], this.materials.line, 0.1);
    const netMaterial = this.detailMaterial("tennis-net", "#16201d", "#050807", 0.66);
    const netWidth = footprint.halfX >= footprint.halfZ ? 0.08 : footprint.halfX * 1.58;
    const netDepth = footprint.halfX >= footprint.halfZ ? footprint.halfZ * 1.58 : 0.08;
    this.addLocalBox(`tennis-net-${landmark.id}`, footprint.center, footprint.angle, 0, 0, netWidth, 0.68, netDepth, netMaterial, 0.15, this.root, 0.16);
  }

  private addBowlingDetails(landmark: Landmark): void {
    if (!landmark.polygon) return;
    if (landmark.id === "bowling") {
      this.addPolygonFence(`bowling-fence-${landmark.id}`, landmark.polygon, 1.1, this.materials.metal);
      return;
    }
    const footprint = this.footprintFromPolygon(landmark.polygon);
    this.addLowHedgeAround(`bowling-green-${landmark.id}`, landmark.polygon, 0.5);
    const rinkLines = Array.from({ length: 6 }, (_, index) => {
      const x = -0.42 + index * 0.168;
      return { x1: x, z1: -0.48, x2: x, z2: 0.48 };
    });
    this.addFieldLines(`bowling-rink-${landmark.id}`, footprint.center, footprint.halfX * 1.76, footprint.halfZ * 1.76, footprint.angle, rinkLines, this.detailMaterial("bowling-line", "#b8d0a6", "#17200f", 0.72), 0.08);
  }

  private addRotunda(position: Vec2): void {
    const root = new TransformNode("rotunda-cue", this.scene);
    root.parent = this.root;
    root.position.set(position.x, this.groundY(position), position.z);
    const base = MeshBuilder.CreateCylinder("rotunda-base", { diameter: 9.2, height: 0.54, tessellation: 36 }, this.scene);
    base.position.y = 0.27;
    base.material = this.materials.concrete;
    base.parent = root;
    enablePaintedEdges(base);
    const roof = MeshBuilder.CreateCylinder("rotunda-roof", { diameterTop: 1.4, diameterBottom: 8.8, height: 1.35, tessellation: 36 }, this.scene);
    roof.position.y = 4.4;
    roof.material = this.materials.metal;
    roof.parent = root;
    enablePaintedEdges(roof);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const column = MeshBuilder.CreateCylinder(`rotunda-column-${index}`, { diameter: 0.28, height: 3.6, tessellation: 10 }, this.scene);
      column.position.set(Math.cos(angle) * 3.8, 2.1, Math.sin(angle) * 3.8);
      column.material = this.materials.concrete;
      column.parent = root;
      enablePaintedEdges(column);
    }
  }

  private addPlaygroundCue(position: Vec2, id: string): void {
    const root = new TransformNode(`playground-${id}-cue`, this.scene);
    root.parent = this.root;
    root.position.set(position.x, this.groundY(position), position.z);
    root.rotation.y = id.includes("north") ? -0.32 : 0.44;
    const colors = [
      this.detailMaterial("play-yellow", "#d0ad43", "#201704"),
      this.detailMaterial("play-red", "#a94b3e", "#180706"),
      this.detailMaterial("play-green", "#4e8b73", "#071b15")
    ];
    for (let index = 0; index < 4; index += 1) {
      const pole = MeshBuilder.CreateCylinder(`playground-${id}-pole-${index}`, { diameter: 0.22, height: 3.9, tessellation: 8 }, this.scene);
      pole.position.set(index % 2 === 0 ? -2 : 2, 1.95, index < 2 ? -1.8 : 1.8);
      pole.material = colors[index % colors.length];
      pole.parent = root;
      enablePaintedEdges(pole);
    }
    const platform = MeshBuilder.CreateBox(`playground-${id}-platform`, { width: 4.8, height: 0.32, depth: 4.1 }, this.scene);
    platform.position.y = 2.18;
    platform.material = this.materials.timber;
    platform.parent = root;
    enablePaintedEdges(platform);
    const slide = MeshBuilder.CreateBox(`playground-${id}-slide`, { width: 1.2, height: 0.18, depth: 5.4 }, this.scene);
    slide.position.set(0.7, 1.26, 4.0);
    slide.rotation.x = -0.34;
    slide.material = this.materials.rubber;
    slide.parent = root;
    enablePaintedEdges(slide);
    const bridge = MeshBuilder.CreateBox(`playground-${id}-bridge`, { width: 3.1, height: 0.16, depth: 0.72 }, this.scene);
    bridge.position.set(-3.5, 1.42, -0.25);
    bridge.rotation.z = 0.06;
    bridge.material = this.materials.timber;
    bridge.parent = root;

    for (const x of [-6.0, -4.2]) {
      for (const side of [-1, 1]) {
        const chain = MeshBuilder.CreateCylinder(`playground-${id}-swing-chain-${x}-${side}`, { diameter: 0.025, height: 1.45, tessellation: 5 }, this.scene);
        chain.position.set(x + side * 0.16, 2.15, -2.9);
        chain.material = this.materials.metal;
        chain.parent = root;
      }
      const seat = MeshBuilder.CreateBox(`playground-${id}-swing-seat-${x}`, { width: 0.78, height: 0.08, depth: 0.32 }, this.scene);
      seat.position.set(x, 1.38, -2.9);
      seat.material = this.materials.rubber;
      seat.parent = root;
    }
    const swingBeam = MeshBuilder.CreateCylinder(`playground-${id}-swing-beam`, { diameter: 0.08, height: 3.2, tessellation: 8 }, this.scene);
    swingBeam.position.set(-5.1, 2.95, -2.9);
    swingBeam.rotation.z = Math.PI / 2;
    swingBeam.material = this.materials.metal;
    swingBeam.parent = root;

    for (let index = 0; index < 4; index += 1) {
      const log = MeshBuilder.CreateCylinder(`playground-${id}-balance-log-${index}`, { diameter: 0.22, height: 1.9, tessellation: 8 }, this.scene);
      log.position.set(3.8 + (index % 2) * 1.05, 0.28, -3.4 + Math.floor(index / 2) * 0.75);
      log.rotation.z = Math.PI / 2;
      log.material = this.materials.timber;
      log.parent = root;
      enablePaintedEdges(log);
    }
  }

  private addSkateCue(position: Vec2, id: string): void {
    const ramp = createTerrainEllipseMesh(`skate-ramp-pad-${id}`, this.scene, position, 10, 4.5, 0.4, this.materials.concrete, (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.04, 28);
    ramp.parent = this.root;
    for (const offset of [-4.8, 4.8]) {
      const rampBlock = this.addLocalBox(`skate-bank-${id}-${offset}`, position, 0.18, offset, 0, 5.4, 0.9, 3.2, this.materials.concrete, 0.06);
      rampBlock.rotation.z = offset < 0 ? 0.16 : -0.16;
    }
    this.addLocalBox(`skate-manual-pad-${id}`, position, 0.18, 0, 4.1, 6.2, 0.36, 0.78, this.materials.concrete, 0.08);
    const rail = MeshBuilder.CreateCylinder(`skate-flatbar-${id}`, { diameter: 0.07, height: 8.6, tessellation: 10 }, this.scene);
    rail.position.set(position.x, this.groundY(position) + 0.82, position.z - 2.2);
    rail.rotation.z = Math.PI / 2;
    rail.rotation.y = -0.08;
    rail.material = this.materials.metal;
    rail.parent = this.root;
    for (const x of [-3.4, 3.4]) {
      this.addLocalCylinder(`skate-rail-post-${id}-${x}`, position, -0.08, x, -2.2, 0.055, 0.82, this.materials.metal);
    }
  }

  private addBasketballCue(position: Vec2, id: string, polygon?: readonly Vec2[]): void {
    const footprint = polygon ? this.footprintFromPolygon(polygon) : { center: position, halfX: 6.2, halfZ: 3.8, angle: 0 };
    this.addFieldLines(`basketball-${id}`, footprint.center, footprint.halfX * 1.76, footprint.halfZ * 1.76, footprint.angle, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 },
      { x1: 0, z1: -0.5, x2: 0, z2: 0.5 },
      { x1: -0.16, z1: -0.5, x2: -0.16, z2: -0.28 },
      { x1: 0.16, z1: 0.5, x2: 0.16, z2: 0.28 }
    ], this.materials.line, 0.11);
    this.addCourtCircle(`basketball-${id}`, footprint.center, 2.2, this.materials.line);
    const key = createTerrainEllipseMesh(`basketball-key-${id}`, this.scene, position, 6.2, 3.8, footprint.angle, this.detailMaterial("basketball-key-fill", "#d8d0a8", "#2a250f", 0.16), (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.042, 24);
    key.parent = this.root;
  }

  private addToiletBlockCue(landmark: Landmark): void {
    if (!landmark.polygon) return;
    const footprint = this.footprintFromPolygon(landmark.polygon, 0.15, 0.15);
    this.addLocalBox(`toilet-roof-${landmark.id}`, footprint.center, footprint.angle, 0, 0, footprint.halfX * 1.9, 0.16, footprint.halfZ * 1.9, this.materials.metal, 2.45);
    this.addLocalBox(`toilet-door-${landmark.id}`, footprint.center, footprint.angle, -footprint.halfX * 0.34, footprint.halfZ + 0.08, 0.58, 1.4, 0.08, this.materials.darkOpening, 0.05);
    const signPoint = this.localPoint(footprint.center, footprint.angle, footprint.halfX * 0.32, footprint.halfZ + 0.1);
    const signRoot = new TransformNode(`toilet-sign-root-${landmark.id}`, this.scene);
    signRoot.parent = this.root;
    signRoot.position.set(signPoint.x, this.groundY(signPoint), signPoint.z);
    signRoot.rotation.y = -footprint.angle;
    this.addLocalTextPanel(signRoot, `toilet-sign-${landmark.id}`, "TOILETS", "PUBLIC", 1.6, 0.54, 1.65, -0.02);
  }

  private addBbqShelter(position: Vec2, id: string): void {
    const root = new TransformNode(`bbq-shelter-${id}`, this.scene);
    root.parent = this.root;
    root.position.set(position.x, this.groundY(position), position.z);
    for (const x of [-1.4, 1.4]) {
      for (const z of [-1.0, 1.0]) {
        const post = MeshBuilder.CreateCylinder(`bbq-post-${id}-${x}-${z}`, { diameter: 0.08, height: 2.2, tessellation: 8 }, this.scene);
        post.position.set(x, 1.1, z);
        post.material = this.materials.metal;
        post.parent = root;
      }
    }
    const roof = MeshBuilder.CreateBox(`bbq-roof-${id}`, { width: 3.6, height: 0.16, depth: 2.8 }, this.scene);
    roof.position.y = 2.25;
    roof.material = this.materials.metal;
    roof.parent = root;
    const hotplate = MeshBuilder.CreateBox(`bbq-hotplate-${id}`, { width: 1.1, height: 0.18, depth: 0.72 }, this.scene);
    hotplate.position.y = 0.86;
    hotplate.material = this.materials.metal;
    hotplate.parent = root;
  }

  private addMemorialCue(landmark: Landmark, position: Vec2): void {
    const base = createBoxBetween(`memorial-base-${landmark.id}`, this.scene, position, landmark.id.includes("queen") ? 3.4 : 2.8, 1.2, landmark.id.includes("queen") ? 3.4 : 1.8, 0, this.materials.concrete, (point) => this.groundY(point), 0);
    base.parent = this.root;
    if (landmark.id.includes("queen")) {
      const plinth = MeshBuilder.CreateCylinder(`memorial-plinth-${landmark.id}`, { diameterTop: 1.2, diameterBottom: 1.6, height: 2.1, tessellation: 18 }, this.scene);
      plinth.position.set(position.x, this.groundY(position) + 2.25, position.z);
      plinth.material = this.materials.concrete;
      plinth.parent = this.root;
      enablePaintedEdges(plinth);
      const sculpture = MeshBuilder.CreateBox(`memorial-zone-red-${landmark.id}`, { width: 0.82, height: 1.75, depth: 0.5 }, this.scene);
      sculpture.position.set(position.x, this.groundY(position) + 4.15, position.z);
      sculpture.rotation.y = 0.36;
      sculpture.material = this.materials.rubber;
      sculpture.parent = this.root;
      this.addEllipseTube(`memorial-bed-${landmark.id}`, position, 5.8, 5.8, 0, this.materials.hedge, DETAIL_SURFACE_Y + 0.12, 0.08);
      return;
    }
    if (landmark.id.includes("war")) {
      const obelisk = MeshBuilder.CreateCylinder(`memorial-obelisk-${landmark.id}`, { diameterTop: 0.28, diameterBottom: 0.78, height: 3.2, tessellation: 4 }, this.scene);
      obelisk.position.set(position.x, this.groundY(position) + 2.8, position.z);
      obelisk.rotation.y = Math.PI / 4;
      obelisk.material = this.materials.basalt;
      obelisk.parent = this.root;
      enablePaintedEdges(obelisk);
      return;
    }
    const plaque = this.addLocalBox(`memorial-plaque-${landmark.id}`, position, 0, 0, -0.96, 1.1, 0.08, 0.52, this.materials.basalt, 1.22);
    plaque.rotation.x = -0.32;
  }

  private addFootballGoal(fixture: SportsFixture): void {
    const root = new TransformNode(`sports-${fixture.id}`, this.scene);
    root.parent = this.root;
    root.position.set(fixture.position.x, this.groundY(fixture.position), fixture.position.z);
    root.rotation.y = -fixture.angle;
    const [westBehind, westGoal, eastGoal, eastBehind] = footballPostLocalOffsets(fixture.width);
    const placements = [
      { x: westBehind, height: AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES, diameter: 0.11 },
      { x: westGoal, height: fixture.height, diameter: 0.14 },
      { x: eastGoal, height: fixture.height, diameter: 0.14 },
      { x: eastBehind, height: AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES, diameter: 0.11 }
    ];
    for (const [index, placement] of placements.entries()) {
      const post = MeshBuilder.CreateCylinder(`goal-post-${fixture.id}-${index}`, { diameter: placement.diameter, height: placement.height, tessellation: 10 }, this.scene);
      post.position.set(placement.x, placement.height * 0.5, 0);
      post.material = this.materials.line;
      post.parent = root;
      const pad = MeshBuilder.CreateCylinder(`goal-post-pad-${fixture.id}-${index}`, { diameter: placement.diameter * 2.8, height: Math.min(2.4, placement.height * 0.68), tessellation: 10 }, this.scene);
      pad.position.set(placement.x, Math.min(2.4, placement.height * 0.68) * 0.5, 0);
      pad.material = this.detailMaterial("goal-padding", "#31596d", "#071018");
      pad.parent = root;
    }
    this.addLocalBox(`goal-line-${fixture.id}`, fixture.position, fixture.angle, 0, 0, fixture.width, 0.025, 0.14, this.materials.line, 0.12, this.root, 0.08);
  }

  private addBasketballHoop(fixture: SportsFixture): void {
    const root = new TransformNode(`sports-${fixture.id}`, this.scene);
    root.parent = this.root;
    root.position.set(fixture.position.x, this.groundY(fixture.position), fixture.position.z);
    root.rotation.y = -fixture.angle;
    const pole = MeshBuilder.CreateCylinder(`hoop-pole-${fixture.id}`, { diameter: 0.14, height: fixture.height, tessellation: 10 }, this.scene);
    pole.position.y = fixture.height * 0.5;
    pole.material = this.materials.metal;
    pole.parent = root;
    const board = MeshBuilder.CreateBox(`hoop-board-${fixture.id}`, { width: 1.65, height: 1, depth: 0.08 }, this.scene);
    board.position.set(0, fixture.height, -0.5);
    board.material = this.materials.line;
    board.parent = root;
    const ring = MeshBuilder.CreateTorus(`hoop-ring-${fixture.id}`, { diameter: 0.72, thickness: 0.035, tessellation: 24 }, this.scene);
    ring.position.set(0, fixture.height - 0.2, -1.05);
    ring.rotation.x = Math.PI / 2;
    ring.material = this.materials.metal;
    ring.parent = root;
  }

  private addBench(root: TransformNode): void {
    const seat = MeshBuilder.CreateBox(`${root.name}-seat`, { width: 2.7, height: 0.14, depth: 0.44 }, this.scene);
    seat.position.y = 0.55;
    seat.material = this.materials.timber;
    seat.parent = root;
    enablePaintedEdges(seat);
    const back = MeshBuilder.CreateBox(`${root.name}-back`, { width: 2.7, height: 0.14, depth: 0.18 }, this.scene);
    back.position.set(0, 0.95, 0.34);
    back.rotation.x = -0.16;
    back.material = this.materials.timber;
    back.parent = root;
    enablePaintedEdges(back);
  }

  private addPicnicTable(root: TransformNode): void {
    const table = MeshBuilder.CreateBox(`${root.name}-table`, { width: 2.4, height: 0.16, depth: 0.72 }, this.scene);
    table.position.y = 0.78;
    table.material = this.materials.timber;
    table.parent = root;
    enablePaintedEdges(table);
    for (const side of [-1, 1]) {
      const bench = MeshBuilder.CreateBox(`${root.name}-bench-${side}`, { width: 2.1, height: 0.12, depth: 0.32 }, this.scene);
      bench.position.set(0, 0.52, side * 0.86);
      bench.material = this.materials.timber;
      bench.parent = root;
      enablePaintedEdges(bench);
    }
  }

  private addDrinkingFountain(root: TransformNode): void {
    const post = MeshBuilder.CreateCylinder(`${root.name}-post`, { diameter: 0.32, height: 1.1, tessellation: 12 }, this.scene);
    post.position.y = 0.55;
    post.material = this.materials.metal;
    post.parent = root;
    enablePaintedEdges(post);
    const basin = MeshBuilder.CreateCylinder(`${root.name}-basin`, { diameterTop: 0.85, diameterBottom: 0.55, height: 0.18, tessellation: 14 }, this.scene);
    basin.position.y = 1.06;
    basin.material = this.materials.water;
    basin.parent = root;
  }

  private addBin(root: TransformNode): void {
    const bin = MeshBuilder.CreateCylinder(`${root.name}-bin`, { diameterTop: 0.82, diameterBottom: 0.68, height: 0.9, tessellation: 12 }, this.scene);
    bin.position.y = 0.45;
    bin.material = this.materials.hedge;
    bin.parent = root;
    enablePaintedEdges(bin);
  }

  private addBikeRack(root: TransformNode): void {
    for (const offset of [-0.45, 0.45]) {
      const rack = MeshBuilder.CreateTorus(`${root.name}-rack-${offset}`, { diameter: 0.74, thickness: 0.045, tessellation: 18 }, this.scene);
      rack.position.set(offset, 0.42, 0);
      rack.rotation.x = Math.PI / 2;
      rack.material = this.materials.metal;
      rack.parent = root;
    }
  }

  private addAmenityMarker(root: TransformNode, amenity: AmenityPoint): void {
    const mesh = MeshBuilder.CreateBox(`${root.name}-marker`, { width: 0.9, height: 0.42, depth: 0.9 }, this.scene);
    mesh.position.y = 0.21;
    mesh.material = amenity.kind === "toilets" ? this.materials.concrete : amenity.kind === "bbq" ? this.materials.metal : this.materials.timber;
    mesh.parent = root;
    enablePaintedEdges(mesh);
  }

  private addParkLifeMarker(root: TransformNode, detail: ParkLifeDetail): void {
    if (detail.kind === "dog-sign") {
      const pole = MeshBuilder.CreateCylinder(`${root.name}-dog-sign-pole`, { diameter: 0.075, height: 1.55, tessellation: 8 }, this.scene);
      pole.position.y = 0.78;
      pole.material = this.materials.metal;
      pole.parent = root;
      this.addLocalTextPanel(root, `${root.name}-dog-sign-panel`, "OFF-LEASH", "AREA", 1.35, 0.58, 1.45, -0.03);
      return;
    }

    if (detail.kind === "notice-board") {
      for (const offset of [-0.72, 0.72]) {
        const post = MeshBuilder.CreateCylinder(`${root.name}-notice-post-${offset}`, { diameter: 0.09, height: 1.8, tessellation: 8 }, this.scene);
        post.position.set(offset, 0.9, 0);
        post.material = this.materials.timber;
        post.parent = root;
      }
      const board = MeshBuilder.CreateBox(`${root.name}-notice-board`, { width: 1.85, height: 1.05, depth: 0.08 }, this.scene);
      board.position.y = 1.32;
      board.material = this.materials.signPaint;
      board.parent = root;
      enablePaintedEdges(board, new Color3(0.016, 0.03, 0.028), 0.32);
      for (let index = 0; index < 4; index += 1) {
        const sheet = MeshBuilder.CreateBox(`${root.name}-notice-sheet-${index}`, { width: 0.34, height: 0.42, depth: 0.025 }, this.scene);
        sheet.position.set(-0.54 + (index % 2) * 0.72, 1.38 + Math.floor(index / 2) * 0.28, -0.055);
        sheet.rotation.z = -0.04 + index * 0.025;
        sheet.material = this.materials.paper;
        sheet.parent = root;
      }
      return;
    }

    if (detail.kind === "casual-bike") {
      for (const offset of [-0.56, 0.56]) {
        const wheel = MeshBuilder.CreateTorus(`${root.name}-bike-wheel-${offset}`, { diameter: 0.78, thickness: 0.035, tessellation: 22 }, this.scene);
        wheel.position.set(offset, 0.42, 0);
        wheel.rotation.y = Math.PI / 2;
        wheel.material = this.materials.metal;
        wheel.parent = root;
      }
      const cross = MeshBuilder.CreateBox(`${root.name}-bike-frame`, { width: 1.05, height: 0.055, depth: 0.07 }, this.scene);
      cross.position.y = 0.72;
      cross.rotation.z = -0.2;
      cross.material = this.materials.metal;
      cross.parent = root;
      const handle = MeshBuilder.CreateBox(`${root.name}-bike-handlebar`, { width: 0.44, height: 0.045, depth: 0.08 }, this.scene);
      handle.position.set(0.72, 0.93, -0.03);
      handle.rotation.z = 0.32;
      handle.material = this.materials.metal;
      handle.parent = root;
      return;
    }

    if (detail.kind === "training-cones") {
      for (let index = 0; index < 7; index += 1) {
        const cone = MeshBuilder.CreateCylinder(`${root.name}-cone-${index}`, { diameterTop: 0.06, diameterBottom: 0.34, height: 0.48, tessellation: 10 }, this.scene);
        cone.position.set((index % 4) * 0.54 - 0.8, 0.24, Math.floor(index / 4) * 0.62 - 0.28);
        cone.material = this.materials.rubber;
        cone.parent = root;
        enablePaintedEdges(cone, new Color3(0.08, 0.035, 0.025), 0.34);
      }
      return;
    }

    if (detail.kind === "dog-water-bowl") {
      const bowl = MeshBuilder.CreateCylinder(`${root.name}-water-bowl`, { diameterTop: 0.62, diameterBottom: 0.48, height: 0.16, tessellation: 16 }, this.scene);
      bowl.position.y = 0.08;
      bowl.material = this.materials.metal;
      bowl.parent = root;
      const water = MeshBuilder.CreateCylinder(`${root.name}-water`, { diameter: 0.5, height: 0.025, tessellation: 16 }, this.scene);
      water.position.y = 0.18;
      water.material = this.materials.water;
      water.parent = root;
      return;
    }

    if (detail.kind === "picnic-blanket") {
      const blanket = MeshBuilder.CreateBox(`${root.name}-blanket`, { width: 2.3, height: 0.035, depth: 1.45 }, this.scene);
      blanket.position.y = 0.04;
      blanket.material = this.materials.rubber;
      blanket.parent = root;
      const bottle = MeshBuilder.CreateCylinder(`${root.name}-bottle`, { diameter: 0.12, height: 0.34, tessellation: 10 }, this.scene);
      bottle.position.set(-0.62, 0.24, 0.34);
      bottle.rotation.z = 0.35;
      bottle.material = this.materials.water;
      bottle.parent = root;
      return;
    }

    if (detail.kind === "picnic-cooler") {
      const cooler = MeshBuilder.CreateBox(`${root.name}-cooler`, { width: 0.95, height: 0.58, depth: 0.58 }, this.scene);
      cooler.position.y = 0.29;
      cooler.material = this.materials.concrete;
      cooler.parent = root;
      enablePaintedEdges(cooler, new Color3(0.025, 0.035, 0.04), 0.34);
      const lid = MeshBuilder.CreateBox(`${root.name}-cooler-lid`, { width: 1.02, height: 0.08, depth: 0.64 }, this.scene);
      lid.position.y = 0.62;
      lid.material = this.materials.rubber;
      lid.parent = root;
      return;
    }

    if (detail.kind === "sports-bag") {
      const bag = MeshBuilder.CreateCapsule(`${root.name}-sports-bag`, { radius: 0.28, height: 0.92, tessellation: 10 }, this.scene);
      bag.position.y = 0.28;
      bag.rotation.z = Math.PI / 2;
      bag.scaling.z = 0.72;
      bag.material = this.materials.cloth;
      bag.parent = root;
      enablePaintedEdges(bag, new Color3(0.018, 0.022, 0.024), 0.34);
      const strap = MeshBuilder.CreateTorus(`${root.name}-sports-bag-strap`, { diameter: 0.6, thickness: 0.025, tessellation: 16 }, this.scene);
      strap.position.y = 0.46;
      strap.rotation.x = Math.PI / 2;
      strap.material = this.materials.clothDark;
      strap.parent = root;
      return;
    }

    if (detail.kind === "chalk-mark") {
      const ring = MeshBuilder.CreateTorus(`${root.name}-chalk`, { diameter: 1.2, thickness: 0.025, tessellation: 22 }, this.scene);
      ring.position.y = 0.08;
      ring.rotation.x = Math.PI / 2;
      ring.material = this.materials.line;
      ring.parent = root;
      for (const offset of [-0.42, 0.42]) {
        const slash = MeshBuilder.CreateBox(`${root.name}-chalk-slash-${offset}`, { width: 0.72, height: 0.024, depth: 0.035 }, this.scene);
        slash.position.set(offset, 0.09, 0);
        slash.rotation.y = offset;
        slash.material = this.materials.line;
        slash.parent = root;
      }
      return;
    }

    if (detail.kind === "cricket-nets") {
      for (const offset of [-1.2, 1.2]) {
        const post = MeshBuilder.CreateCylinder(`${root.name}-net-post-${offset}`, { diameter: 0.065, height: 2.25, tessellation: 8 }, this.scene);
        post.position.set(offset, 1.12, -0.9);
        post.material = this.materials.metal;
        post.parent = root;
      }
      const net = MeshBuilder.CreateBox(`${root.name}-net-plane`, { width: 2.65, height: 1.6, depth: 0.025 }, this.scene);
      net.position.set(0, 1.25, -0.9);
      net.material = this.materials.paper;
      net.parent = root;
      return;
    }

    const mesh = MeshBuilder.CreateBox(`${root.name}-detail`, { width: 1.1, height: 0.18, depth: 0.8 }, this.scene);
    mesh.position.y = 0.16;
    mesh.material = this.materials.timber;
    mesh.parent = root;
    enablePaintedEdges(mesh, new Color3(0.025, 0.035, 0.04), 0.5);
  }

  private addSign(id: string, label: string, sublabel: string, position: Vec2, angle: number, width: number, height: number, panelY: number): void {
    const root = new TransformNode(`place-sign-${id}`, this.scene);
    root.parent = this.root;
    root.position.set(position.x, this.groundY(position), position.z);
    root.rotation.y = angle;
    for (const offset of [-width * 0.42, width * 0.42]) {
      const post = MeshBuilder.CreateCylinder(`place-sign-post-${id}-${offset}`, { diameter: 0.09, height: panelY + 0.28, tessellation: 8 }, this.scene);
      post.position.set(offset, (panelY + 0.28) * 0.5, 0.04);
      post.material = this.materials.metal;
      post.parent = root;
    }
    this.addLocalTextPanel(root, `place-sign-panel-${id}`, label, sublabel, width, height, panelY, -0.02);
  }

  private addLocalTextPanel(root: TransformNode, name: string, label: string, sublabel: string, width: number, height: number, y: number, z: number): Mesh {
    const panel = MeshBuilder.CreatePlane(name, { width, height, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    panel.position.set(0, y, z);
    panel.material = this.createTextSignMaterial(`${name}-material`, label, sublabel);
    panel.parent = root;
    enablePaintedEdges(panel, new Color3(0.012, 0.026, 0.024), 0.32);
    return panel;
  }

  private createTextSignMaterial(name: string, label: string, sublabel: string): StandardMaterial {
    const texture = new DynamicTexture(`${name}-texture`, { width: 1024, height: 384 }, this.scene, false, Texture.TRILINEAR_SAMPLINGMODE);
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#173d39";
    ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = "rgba(232, 221, 180, 0.08)";
    for (let y = 38; y < 384; y += 42) {
      ctx.fillRect(0, y, 1024, 3);
    }
    ctx.strokeStyle = "rgba(232, 221, 180, 0.72)";
    ctx.lineWidth = 10;
    ctx.strokeRect(28, 28, 968, 328);
    ctx.fillStyle = "#efe3b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 58px Arial, sans-serif";
    ctx.fillText(fitText(label, 24), 512, 152);
    ctx.font = "400 34px Arial, sans-serif";
    ctx.fillStyle = "#c9d3bf";
    ctx.fillText(fitText(sublabel, 38), 512, 246);
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillStyle = "#9fb7aa";
    ctx.fillText("YARRA CITY COUNCIL", 512, 314);
    texture.update();
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;

    const material = new StandardMaterial(name, this.scene);
    material.diffuseTexture = texture;
    material.emissiveColor = new Color3(0.02, 0.065, 0.055);
    material.specularColor = new Color3(0.015, 0.018, 0.016);
    material.backFaceCulling = false;
    return material;
  }

  private detailMaterial(name: string, color: string, emissive = "#080b08", alpha?: number): StandardMaterial {
    const cacheKey = `${name}-${color}-${emissive}-${alpha ?? 1}`;
    const existing = this.detailMaterialCache.get(cacheKey);
    if (existing) return existing;
    const material = new StandardMaterial(cacheKey, this.scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.ambientColor = material.diffuseColor.scale(0.38);
    material.emissiveColor = Color3.FromHexString(emissive).scale(0.12);
    material.specularColor = new Color3(0.018, 0.018, 0.016);
    material.backFaceCulling = false;
    if (alpha !== undefined) {
      material.alpha = alpha;
      material.transparencyMode = Material.MATERIAL_ALPHABLEND;
      material.needDepthPrePass = true;
    }
    this.detailMaterialCache.set(cacheKey, material);
    return material;
  }

  private footprintFromPolygon(polygon: readonly Vec2[], paddingX = 0, paddingZ = 0): LocalFootprint {
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
    const angle = Math.atan2(longestB.z - longestA.z, longestB.x - longestA.x);
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
    return {
      center,
      halfX: halfX + paddingX,
      halfZ: halfZ + paddingZ,
      angle
    };
  }

  private localPoint(center: Vec2, angle: number, localX: number, localZ: number): Vec2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: center.x + localX * cos - localZ * sin,
      z: center.z + localX * sin + localZ * cos
    };
  }

  private addLocalBox(
    name: string,
    center: Vec2,
    angle: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    depth: number,
    material: StandardMaterial,
    yOffset = 0,
    parent: TransformNode = this.root,
    edgeWidth = 0.34
  ): Mesh {
    const point = this.localPoint(center, angle, localX, localZ);
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, this.scene);
    mesh.position.set(point.x, this.groundY(point) + yOffset + height * 0.5, point.z);
    mesh.rotation.y = -angle;
    mesh.material = material;
    mesh.parent = parent;
    enablePaintedEdges(mesh, new Color3(0.018, 0.026, 0.024), edgeWidth);
    return mesh;
  }

  private addLocalCylinder(
    name: string,
    center: Vec2,
    angle: number,
    localX: number,
    localZ: number,
    diameter: number,
    height: number,
    material: StandardMaterial,
    yOffset = 0,
    parent: TransformNode = this.root
  ): Mesh {
    const point = this.localPoint(center, angle, localX, localZ);
    const mesh = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: 10 }, this.scene);
    mesh.position.set(point.x, this.groundY(point) + yOffset + height * 0.5, point.z);
    mesh.material = material;
    mesh.parent = parent;
    enablePaintedEdges(mesh, new Color3(0.018, 0.026, 0.024), 0.34);
    return mesh;
  }

  private addFieldLines(
    prefix: string,
    center: Vec2,
    width: number,
    depth: number,
    angle: number,
    lines: Array<{ x1: number; z1: number; x2: number; z2: number }>,
    material = this.materials.line,
    lineWidth = FIELD_LINE_WIDTH
  ): void {
    for (const [index, line] of lines.entries()) {
      const a = this.localPoint(center, angle, line.x1 * width, line.z1 * depth);
      const b = this.localPoint(center, angle, line.x2 * width, line.z2 * depth);
      const mesh = createTerrainRibbonSegmentMesh(`${prefix}-line-${index}`, this.scene, a, b, lineWidth, material, (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.048);
      mesh.parent = this.root;
    }
  }

  private addCourtCircle(prefix: string, center: Vec2, radius: number, material = this.materials.line): void {
    const circle = makeCircle(center, radius, 52);
    const points = [...circle, circle[0]];
    const ring = createGroundedTube(`${prefix}-circle`, this.scene, points, 0.045, material, (point) => this.groundY(point), DETAIL_SURFACE_Y + 0.08, 6);
    ring.parent = this.root;
  }

  private addEllipseTube(prefix: string, center: Vec2, radiusX: number, radiusZ: number, angle: number, material: StandardMaterial, yOffset = DETAIL_SURFACE_Y + 0.08, tubeRadius = 0.045): void {
    const points: Vec2[] = [];
    for (let index = 0; index <= 72; index += 1) {
      const theta = (index / 72) * Math.PI * 2;
      points.push(this.localPoint(center, angle, Math.cos(theta) * radiusX, Math.sin(theta) * radiusZ));
    }
    const mesh = createGroundedTube(prefix, this.scene, points, tubeRadius, material, (point) => this.groundY(point), yOffset, 6);
    mesh.parent = this.root;
  }

  private addPolygonFence(prefix: string, polygon: readonly Vec2[], height: number, material = this.materials.metal): void {
    const closed = [...polygon, polygon[0]];
    for (const railY of [height * 0.36, height * 0.72]) {
      const rail = createGroundedTube(`${prefix}-rail-${railY.toFixed(1)}`, this.scene, closed, 0.035, material, (point) => this.groundY(point), railY, 6);
      rail.parent = this.root;
    }
    for (const [index, point] of samplePolyline(closed, 5.6).entries()) {
      const post = MeshBuilder.CreateCylinder(`${prefix}-post-${index}`, { diameter: 0.09, height, tessellation: 8 }, this.scene);
      post.position.set(point.x, this.groundY(point) + height * 0.5, point.z);
      post.material = material;
      post.parent = this.root;
      enablePaintedEdges(post, new Color3(0.018, 0.026, 0.024), 0.28);
    }
  }

  private addLowHedgeAround(prefix: string, polygon: readonly Vec2[], height = 0.56): void {
    const closed = [...polygon, polygon[0]];
    const hedge = createGroundedTube(`${prefix}-hedge`, this.scene, closed, height * 0.34, this.materials.hedge, (point) => this.groundY(point), height * 0.52, 7);
    hedge.parent = this.root;
  }

  private materialForPath(path: LevelPath): StandardMaterial {
    if (path.surface === "concrete") return this.materials.concrete;
    if (path.surface === "gravel" || path.surface === "sett") return this.materials.gravel;
    if (path.kind === "rail" || path.kind === "cycleway") return this.materials.asphalt;
    return this.materials.path;
  }

  private materialForLandmark(landmark: Landmark): StandardMaterial {
    switch (landmark.kind) {
      case "oval":
        return this.materials.wornGrass;
      case "tennis":
      case "court":
      case "basketball":
        return this.materials.court;
      case "bowls":
        return this.materials.hedge;
      case "garden":
        if (landmark.id === "raingarden-reservoir") return this.materials.leafLitter;
        if (landmark.id === "north-activity-precinct") return this.materials.mulch;
        return this.materials.wornGrass;
      case "playground":
        return this.materials.rubber;
      case "skate":
        return this.materials.concrete;
      case "bbq":
        return this.materials.mulch;
      default:
        return this.materials.path;
    }
  }

  private treeMaterial(profile: TreeProfile, part: "trunk" | "leaf", index: number): StandardMaterial {
    const cacheKey = `${profile}-${part}-${index % 9}`;
    const existing = this.treeMaterialCache.get(cacheKey);
    if (existing) return existing;
    const material = new StandardMaterial(cacheKey, this.scene);
    const trunkBase = profile === "gum" ? "#9a8d72" : profile === "oak" ? "#6c523a" : profile === "elm" ? "#72543c" : "#66503b";
    const leafBase = profile === "gum" ? "#8aa078" : profile === "oak" ? "#496d38" : profile === "elm" ? "#4f7a42" : "#547548";
    const color = Color3.FromHexString(part === "trunk" ? trunkBase : leafBase);
    const jitter = (index % 9) * 0.015 - 0.06;
    material.diffuseColor = new Color3(clamp(color.r + jitter, 0, 1), clamp(color.g + jitter, 0, 1), clamp(color.b + jitter, 0, 1));
    material.emissiveColor = material.diffuseColor.scale(part === "leaf" ? 0.12 : 0.08);
    material.specularColor = new Color3(0.015, 0.015, 0.015);
    this.treeMaterialCache.set(cacheKey, material);
    return material;
  }

  private boundaryBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return {
      minX: Math.min(...this.level.boundary.map((point) => point.x)),
      maxX: Math.max(...this.level.boundary.map((point) => point.x)),
      minZ: Math.min(...this.level.boundary.map((point) => point.z)),
      maxZ: Math.max(...this.level.boundary.map((point) => point.z))
    };
  }

  private isNearPath(point: Vec2, clearance: number): boolean {
    for (const path of this.level.paths) {
      for (let index = 0; index < path.points.length - 1; index += 1) {
        if (distanceToSegment(point, path.points[index], path.points[index + 1]) < path.width * 0.5 + clearance) {
          return true;
        }
      }
    }
    return false;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize2(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.z) || 1;
  return {
    x: vector.x / length,
    z: vector.z / length
  };
}

function fitText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}.`;
}
