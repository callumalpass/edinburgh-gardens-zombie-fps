import * as THREE from "three";
import { distance, distanceToSegment, geoToWorld, makeCircle, nearestPointOnPolygon, pointInPolygon, polygonCentroid } from "../geo";
import { AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES, footballPostLocalOffsets } from "../sportsFixtures";
import type {
  HardscapeLine,
  LevelData,
  LevelPath,
  Landmark,
  MappedBuilding,
  MappedTree,
  ParkLifeDetail,
  PathSurfacePatch,
  RandomSource,
  SportsFixture,
  TreeProfile,
  Vec2
} from "../types";

const COLLISION_Y = 0.04;
const TERRAIN_GRID_STEP = 7.5;
const TERRAIN_EDGE_PAD = 9;
const TREE_SCALE_MULTIPLIER = 1.22;
const GRASS_SAMPLE_STEP = 5.2;
const GRASS_CLUSTER_LIMIT = 5600;
const GRASS_PATH_CLEARANCE = 1.25;
const WORLD_TOON_RAMP = createWorldToonRamp();

type StyledSurfaceMaterial = THREE.MeshStandardMaterial | THREE.MeshToonMaterial;

interface TreeMaterialSet {
  trunk: THREE.Material;
  leaf: THREE.Material;
  paleBark: THREE.Material;
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
  private readonly detailMaterialCache = new Map<string, THREE.Material>();
  private readonly treeMaterialCache = new Map<string, TreeMaterialSet>();
  private readonly treeTrunkGeometry = new THREE.CylinderGeometry(0.72, 1, 1, 8);
  private readonly treeBranchGeometry = new THREE.CylinderGeometry(0.55, 1, 1, 6);
  private readonly treeRootGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly treeCanopyGeometry = new THREE.IcosahedronGeometry(1, 2);
  private readonly treePaleBarkGeometry = new THREE.CylinderGeometry(0.74, 0.88, 1, 8);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly level: LevelData,
    private readonly rng: RandomSource,
    private readonly materials: GameMaterials,
    private readonly groundYAt: (point: Vec2) => number,
    private readonly averageGroundYAt: (points: readonly Vec2[]) => number
  ) {}

  createWorld(): void {
    this.scene.add(new THREE.HemisphereLight(0xb9d4e8, 0x28222a, 1.38));
    const moon = new THREE.DirectionalLight(0xc9ddff, 2.95);
    moon.position.set(-150, 205, 75);
    moon.castShadow = true;
    moon.shadow.camera.left = -360;
    moon.shadow.camera.right = 360;
    moon.shadow.camera.top = 360;
    moon.shadow.camera.bottom = -360;
    moon.shadow.mapSize.set(2048, 2048);
    this.scene.add(moon);

    const emergency = new THREE.PointLight(0xe34b43, 5.2, 145);
    emergency.position.set(22, 7, 48);
    this.scene.add(emergency);

    this.addGround();
    this.addStreetEdges();
    this.addMownLawnBands();
    this.addLawnWearPatches();
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
    this.addBoundaryFence();
    this.addUnderCanopyGroundWear();
    this.addTrees();
  }

  createUpgradeStations(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xd0a343, emissive: 0x392509, emissiveIntensity: 0.4, roughness: 0.55 });
    for (const station of this.level.upgradeStations) {
      const group = new THREE.Group();
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
    return distance(polygon[0], polygon[polygon.length - 1]) < 0.01 ? polygon.slice(0, -1) : [...polygon];
  }

  private supportY(points: readonly Vec2[], pad = 0): number {
    return Math.max(...points.map((point) => this.groundY(point))) + pad;
  }

  private boxSupportY(center: Vec2, rotation: number, halfX: number, halfZ: number, pad = 0): number {
    return this.supportY(
      [
        this.localPoint(center, rotation, -halfX, -halfZ),
        this.localPoint(center, rotation, halfX, -halfZ),
        this.localPoint(center, rotation, halfX, halfZ),
        this.localPoint(center, rotation, -halfX, halfZ)
      ],
      pad
    );
  }

  private radialSupportY(center: Vec2, radius: number, pad = 0): number {
    const points = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return {
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius
      };
    });
    points.push(center);
    return this.supportY(points, pad);
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
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(radius, 18), this.materials.puddle);
      puddle.position.set(center.x, this.groundY(center) + 0.154, center.z);
      puddle.rotation.set(-Math.PI / 2, 0, this.rng.range(0, Math.PI));
      puddle.scale.set(this.rng.range(1.4, 2.7), this.rng.range(0.28, 0.74), 1);
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
          const mesh = this.createTerrainRect(center, angle + this.stableNoise(seedX, seedZ, 35) * 0.16 - 0.08, length, width, 0.172, 0.006, sheenMaterial);
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
        const dry = this.stableNoise(point.x, point.z, 12) > 0.78;
        const baseColor = dry ? 0x857b59 : shortMown ? 0x747d58 : shaded ? 0x4b563f : 0x62704c;
        const color = new THREE.Color(baseColor).offsetHSL(
          (this.stableNoise(point.x, point.z, 6) - 0.5) * 0.035,
          (this.stableNoise(point.x, point.z, 7) - 0.5) * 0.055,
          (this.stableNoise(point.x, point.z, 8) - 0.5) * 0.09
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
        this.addPathSegment(a, b, shoulderWidth, this.materials.dirt, COLLISION_Y - 0.014, 0.028);
        this.addPathSegment(a, b, path.width, material, COLLISION_Y + 0.008, 0.05);
      }
      for (const point of path.points) {
        this.addPathCap(point, shoulderWidth * 0.52, this.materials.dirt, COLLISION_Y - 0.014, 0.028);
        this.addPathCap(point, path.width * 0.52, material, COLLISION_Y + 0.01, 0.055);
      }
      this.addPathMarkings(path);
    }
  }

  private addPathSegment(a: Vec2, b: Vec2, width: number, material: THREE.Material, y: number, height: number): void {
    const length = distance(a, b);
    if (length < 0.05) return;
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    const center = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
    const mesh = this.createTerrainRect(center, angle, length, width, y, height, material);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addPathCap(point: Vec2, radius: number, material: THREE.Material, y: number, height: number): void {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 18), material);
    cap.position.set(point.x, this.groundY(point) + y, point.z);
    cap.receiveShadow = true;
    this.scene.add(cap);
  }

  private addPathSurfacePatches(): void {
    for (const patch of this.level.pathSurfacePatches) {
      const mesh = this.createTerrainRect(
        patch.position,
        patch.angle,
        patch.length,
        patch.width,
        patch.kind === "path-junction-wear" ? 0.156 : 0.136,
        0.014,
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
          const mesh = this.createTerrainRect(point, angle + Math.PI / 2, path.width * 0.82, 0.035, 0.142, 0.012, treadMaterial);
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
        const mesh = this.createTerrainRect(point, angle, actualLength, width, 0.132, 0.018, material);
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
      const mesh = this.createTerrainRect(center, Math.atan2(dz, dx), segmentLength, width, 0.13, 0.014, material);
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
    if (landmark.id === "raingarden-reservoir") {
      this.addRaingarden(landmark.polygon);
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
    const footprint = this.fitBoxFromPolygon(building.polygon, 0, 0);
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
    }
  }

  private addMappedFences(): void {
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x6b7a71, metalness: 0.22, roughness: 0.58 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5e56, metalness: 0.32, roughness: 0.48 });
    for (const fence of this.level.mappedFences) {
      for (let i = 0; i < fence.points.length - 1; i += 1) {
        this.addFenceSegment(fence.points[i], fence.points[i + 1], 0, 1, 1.65, postMaterial, railMaterial);
      }
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

  private addBlockPolygon(polygon: Vec2[], height: number, material: THREE.Material, frontSign = -1): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0.8, 0.45);
    const center = footprint.center;
    const rotation = -footprint.angle;
    const baseY = this.boxSupportY(center, rotation, footprint.halfX, footprint.halfZ);
    const geometry = new THREE.BoxGeometry(footprint.halfX * 2, height, footprint.halfZ * 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(center.x, baseY + height / 2, center.z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(footprint.halfX * 2 + 1.8, 0.45, footprint.halfZ * 2 + 1.6), this.materials.timber);
    roof.position.set(center.x, baseY + height + 0.25, center.z);
    roof.rotation.y = mesh.rotation.y;
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

  private fitBoxFromPolygon(polygon: Vec2[], paddingX: number, paddingZ: number): { center: Vec2; halfX: number; halfZ: number; angle: number } {
    const center = polygonCentroid(polygon);
    const first = polygon[0];
    const second = polygon[1] ?? first;
    const angle = Math.atan2(second.z - first.z, second.x - first.x);
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

    return { center, halfX: halfX + paddingX, halfZ: halfZ + paddingZ, angle };
  }

  private localPoint(center: Vec2, rotation: number, localX: number, localZ: number): Vec2 {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: center.x + localX * cos - localZ * sin,
      z: center.z + localX * sin + localZ * cos
    };
  }

  private worldToLocal(center: Vec2, rotation: number, point: Vec2): Vec2 {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: dx * cos + dz * sin,
      z: -dx * sin + dz * cos
    };
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
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localX = dx * cos + dz * sin;
    const localZ = -dx * sin + dz * cos;
    return Math.abs(localX) <= halfX && Math.abs(localZ) <= halfZ;
  }

  private stableNoise(x: number, z: number, salt: number): number {
    const value = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
    return value - Math.floor(value);
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
    return this.addLocalBox(center, rotation, localX, localZ, width, height, depth, this.materials.darkOpening, y, false);
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
    return this.addLocalBox(center, rotation, localX, localZ, 0.28, 0.2, 0.12, lightMaterial, y, false);
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

    this.addBlockPolygon(landmark.polygon, 5.8, this.materials.brick, frontSign);

    this.addLocalBox(center, rotation, 0, frontZ, footprint.halfX * 1.45, 1.35, 0.08, this.materials.darkOpening, 1.75, false);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) {
      this.addLocalCylinder(center, rotation, x * footprint.halfX * 2, frontOut(0.08), 0.09, 0.12, 2.8, this.materials.metal);
    }
    for (let i = -4; i <= 4; i += 1) {
      this.addLocalBox(center, rotation, (i / 4) * footprint.halfX * 0.9, 0, 0.08, 0.09, footprint.halfZ * 2 + 2.3, this.materials.metal, 6.12);
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
    const rail = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, 0.16, 0.14), railMaterial);
    const center = { x: (startPoint.x + endPoint.x) / 2, z: (startPoint.z + endPoint.z) / 2 };
    rail.position.set(center.x, this.supportY([startPoint, endPoint]) + height * 0.55, center.z);
    rail.rotation.y = angle;
    rail.castShadow = true;
    this.scene.add(rail);
    const postCount = Math.max(1, Math.floor(segmentLength / 8));
    for (let postIndex = 0; postIndex <= postCount; postIndex += 1) {
      const t = postIndex / postCount;
      const point = { x: startPoint.x + (endPoint.x - startPoint.x) * t, z: startPoint.z + (endPoint.z - startPoint.z) * t };
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, height, 6), postMaterial);
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
  }

  private addOval(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, new THREE.MeshStandardMaterial({ color: 0x5d874d, roughness: 0.9 }), 0.075);
    this.addFenceAround(landmark.polygon, 1.25, 0x8f7b61);
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
    this.addFlatPolygon(landmark.polygon, this.materials.mulch, 0.1);
    const center = polygonCentroid(landmark.polygon);
    const frame = new THREE.Group();
    const colors = [0xd6b85d, 0xb74838, 0x609f8a];
    for (let i = 0; i < 4; i += 1) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 4.2, 8), new THREE.MeshStandardMaterial({ color: colors[i % colors.length] }));
      pole.position.set((i % 2 === 0 ? -2 : 2), 2.1, i < 2 ? -2 : 2);
      pole.castShadow = true;
      frame.add(pole);
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 4.6), this.materials.timber);
    platform.position.y = 2.35;
    platform.castShadow = true;
    frame.add(platform);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 6.8), new THREE.MeshStandardMaterial({ color: 0xb74838, roughness: 0.42 }));
    slide.position.set(0, 1.4, 5);
    slide.rotation.x = -0.38;
    slide.castShadow = true;
    frame.add(slide);
    frame.position.set(center.x, this.boxSupportY(center, 0, 2.6, 2.35), center.z);
    this.scene.add(frame);
    this.addSwingSet({ x: center.x - 5.6, z: center.z - 3.2 }, 0.25);
    this.addBalanceLogs({ x: center.x + 4.5, z: center.z + 3.8 }, -0.45);
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
    const center = polygonCentroid(landmark.polygon);
    for (const offset of [-6, 6]) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0x6d706c, roughness: 0.76 }));
      const point = { x: center.x + offset, z: center.z };
      ramp.position.set(point.x, this.boxSupportY(point, 0, 4.5, 2) + 0.65, point.z);
      ramp.rotation.z = offset < 0 ? 0.22 : -0.22;
      ramp.castShadow = true;
      ramp.receiveShadow = true;
      this.scene.add(ramp);
    }
    this.addSkateRail({ x: center.x, z: center.z - 2.3 }, 0.08, 8.5);
    this.addLocalBox(center, 0, 0, 4.2, 6.2, 0.46, 0.72, this.materials.concrete, 0.34);
    this.addLocalBox(center, 0, -4.2, -4.1, 4.6, 0.38, 0.64, this.materials.concrete, 0.28);
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
      } else if (detail.kind === "casual-bike") {
        this.addCasualBike(detail);
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

  private addCasualBike(detail: ParkLifeDetail): void {
    const group = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x263734, metalness: 0.35, roughness: 0.42 });
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1b211f, roughness: 0.56 });
    for (const x of [-0.62, 0.62]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 20), wheelMaterial);
      wheel.position.set(x, 0.42, 0);
      wheel.rotation.y = Math.PI / 2;
      wheel.castShadow = true;
      group.add(wheel);
    }
    const topTube = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.055, 0.055), frameMaterial);
    topTube.position.y = 0.74;
    topTube.castShadow = true;
    group.add(topTube);
    for (const x of [-0.28, 0.28]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.58, 0.055), frameMaterial);
      fork.position.set(x, 0.62, 0);
      fork.rotation.z = x < 0 ? -0.34 : 0.34;
      fork.castShadow = true;
      group.add(fork);
    }
    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05), frameMaterial);
    handlebar.position.set(0.72, 0.92, 0);
    handlebar.rotation.z = 0.12;
    group.add(handlebar);
    group.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    group.rotation.y = detail.angle;
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
    const netMaterial = new THREE.MeshBasicMaterial({ color: 0xc9d4c6, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
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

    for (const x of [-width * 0.5, width * 0.5]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, height, length), netMaterial);
      side.position.set(x, height * 0.5, 0);
      group.add(side);
    }
    const rear = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03), netMaterial);
    rear.position.set(0, height * 0.5, length * 0.5);
    group.add(rear);

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

      const spill = new THREE.Mesh(
        new THREE.CircleGeometry(6.2, 28),
        new THREE.MeshBasicMaterial({
          color: 0xc49a55,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      spill.position.set(0, 0.045, -0.9);
      spill.rotation.x = -Math.PI / 2;
      spill.userData.kind = "lamp-ground-spill";
      group.add(spill);
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

  private parkEntrances(): Array<{ position: Vec2; angle: number; width: number; sign: boolean }> {
    return [
      { position: geoToWorld({ lat: -37.78956, lon: 144.98011 }), angle: -0.22, width: 5.2, sign: false },
      { position: geoToWorld({ lat: -37.78735, lon: 144.98554 }), angle: 2.55, width: 4.8, sign: true },
      { position: geoToWorld({ lat: -37.78572, lon: 144.98228 }), angle: 0.32, width: 4.8, sign: false },
      { position: geoToWorld({ lat: -37.78855, lon: 144.98505 }), angle: 2.3, width: 4.6, sign: false }
    ];
  }

  private addParkEntranceDetails(): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0xb6aa8d, roughness: 0.74 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x202622, metalness: 0.45, roughness: 0.42 });
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
        const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.54, 0.12), new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 0.68 }));
        sign.position.set(entrance.position.x, this.groundY(entrance.position) + 1.35, entrance.position.z);
        sign.rotation.y = -entrance.angle;
        sign.castShadow = true;
        this.scene.add(sign);
        this.addLabel("Edinburgh Gardens", entrance.position, 3.4);
      }
      this.addEntranceCrossing(entrance);
    }
  }

  private addStreetEdges(): void {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x252a26, roughness: 0.88 });
    const residential = new THREE.MeshStandardMaterial({ color: 0x2d302c, roughness: 0.9 });
    const kerb = new THREE.MeshStandardMaterial({ color: 0xa9a18d, roughness: 0.7 });
    const line = new THREE.MeshBasicMaterial({ color: 0xcfc8a6, transparent: true, opacity: 0.74 });
    const rail = new THREE.MeshBasicMaterial({ color: 0x6f756d, transparent: true, opacity: 0.8 });

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
      const canopy = new THREE.Mesh(this.treeCanopyGeometry, materials.leaf);
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

    const baseTrunkColor = profile === "gum" ? 0x8c806a : profile === "oak" ? 0x56402e : 0x684d34;
    const baseLeafColor = profile === "gum" ? 0x6f8078 : profile === "oak" ? 0x38543c : profile === "elm" ? 0x4a6741 : 0x526940;
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
        emissive: 0x0d2019,
        emissiveIntensity: 0.16,
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
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(7, 17, 25, 0.78)";
    ctx.fillRect(0, 24, 512, 76);
    ctx.strokeStyle = "rgba(245, 184, 88, 0.82)";
    ctx.strokeRect(8, 30, 496, 64);
    ctx.fillStyle = "#ede0aa";
    ctx.font = "600 34px system-ui, sans-serif";
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

function createWorldToonRamp(): THREE.DataTexture {
  const data = new Uint8Array([
    48, 48, 48, 255,
    112, 112, 112, 255,
    196, 196, 196, 255,
    255, 255, 255, 255
  ]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createGrassClumpGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [];
  const bladeCount = 7;

  for (let index = 0; index < bladeCount; index += 1) {
    const angle = (index / bladeCount) * Math.PI * 2;
    const right = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const forward = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const width = 0.045 + (index % 3) * 0.014;
    const height = 0.68 + (index % 4) * 0.095;
    const lean = 0.045 + (index % 2) * 0.035;
    const baseOffset = forward.clone().multiplyScalar((index - bladeCount / 2) * 0.012);
    const left = baseOffset.clone().addScaledVector(right, -width);
    const rightBase = baseOffset.clone().addScaledVector(right, width);
    const tip = baseOffset.clone().addScaledVector(forward, lean);
    tip.y = height;

    vertices.push(left.x, 0, left.z, rightBase.x, 0, rightBase.z, tip.x, tip.y, tip.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}
