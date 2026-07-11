import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CONTEXT_WORLD_DATA } from "../contextData.generated";
import type {
  ContextBuilding,
  ContextFacadeTone,
  ContextRoad,
  ContextRoofShape,
  ContextRoofTone,
  ContextWorldData
} from "../contextTypes";
import { pointInPolygon } from "../geo";
import type { Vec2 } from "../types";
import { createAnimeToonRamp } from "./animeStyle";
import type { RenderQualityLevel } from "./renderQuality";

const CONTEXT_GROUND_EXTENT_METRES = 270;
const WORLD_SCALE = 1.28;
const CONTEXT_GROUND_GRID = 18;
const CONTEXT_ELEVATION_BUCKET_SIZE = 48;
const BODY_COLORS: Record<ContextFacadeTone, number> = {
  brick: 0x8e5547,
  cream: 0xc6b990,
  weatherboard: 0xaab8aa,
  ochre: 0xb58751,
  charcoal: 0x59615e
};
const ROOF_COLORS: Record<ContextRoofTone, number> = {
  silver: 0xb7bfba,
  cream: 0xc7b99c,
  terracotta: 0x985747,
  charcoal: 0x4f5b5b,
  weathered: 0x858980
};

export interface ContextWorldStats {
  buildings: number;
  roads: number;
  trees: number;
  meshes: number;
  triangles: number;
}

interface OrientedFootprint {
  center: Vec2;
  angle: number;
  halfX: number;
  halfZ: number;
}

/**
 * Render-only urban context outside the playable park polygon.
 *
 * This builder deliberately owns no collision, navigation, interaction,
 * lighting or simulation state. Its source-backed geometry can therefore be
 * aggressively merged without affecting the park's gameplay contracts.
 */
export class ContextWorldBuilder {
  readonly root = new THREE.Group();
  private readonly nearDetails = new THREE.Group();
  private readonly contextTreesNear = new THREE.Group();
  private readonly contextTreesFar = new THREE.Group();
  private readonly contextElevationDatum: number;
  private readonly contextElevationBuckets = new Map<string, ContextWorldData["elevationSamples"]>();
  private stats: ContextWorldStats = { buildings: 0, roads: 0, trees: 0, meshes: 0, triangles: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly parkBoundary: readonly Vec2[],
    private readonly groundY: (point: Vec2) => number,
    private readonly data: ContextWorldData = CONTEXT_WORLD_DATA
  ) {
    this.contextElevationDatum = estimateContextElevationDatum(data, parkBoundary, groundY);
    for (const sample of data.elevationSamples) {
      const key = elevationBucketKey(sample.position);
      const bucket = this.contextElevationBuckets.get(key) ?? [];
      bucket.push(sample);
      this.contextElevationBuckets.set(key, bucket);
    }
    this.root.name = "Edinburgh Gardens render-only context belt";
    this.root.userData.kind = "context-world";
    this.root.userData.nonPlayable = true;
    this.nearDetails.name = "Context near facade accents";
    this.contextTreesNear.name = "Context trees near";
    this.contextTreesFar.name = "Context trees far";
    this.root.add(this.nearDetails, this.contextTreesNear, this.contextTreesFar);
  }

  create(): ContextWorldStats {
    this.addContextGround();
    this.addRoads();
    this.addBuildings();
    this.addTrees();
    this.scene.add(this.root);
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      this.stats.meshes += 1;
      const position = object.geometry.getAttribute("position");
      const geometryTriangles = object.geometry.index ? object.geometry.index.count / 3 : (position?.count ?? 0) / 3;
      this.stats.triangles += geometryTriangles * (object instanceof THREE.InstancedMesh ? object.count : 1);
    });
    this.root.userData.stats = { ...this.stats };
    return { ...this.stats };
  }

  setQualityLevel(level: RenderQualityLevel): void {
    this.nearDetails.visible = level === "high";
    this.contextTreesNear.visible = level !== "low";
    this.contextTreesFar.visible = true;
  }

  getStats(): ContextWorldStats {
    return { ...this.stats };
  }

  private addContextGround(): void {
    const minX = Math.min(...this.parkBoundary.map((point) => point.x)) - CONTEXT_GROUND_EXTENT_METRES * WORLD_SCALE;
    const maxX = Math.max(...this.parkBoundary.map((point) => point.x)) + CONTEXT_GROUND_EXTENT_METRES * WORLD_SCALE;
    const minZ = Math.min(...this.parkBoundary.map((point) => point.z)) - CONTEXT_GROUND_EXTENT_METRES * WORLD_SCALE;
    const maxZ = Math.max(...this.parkBoundary.map((point) => point.z)) + CONTEXT_GROUND_EXTENT_METRES * WORLD_SCALE;
    const vertices: number[] = [];
    const colors: number[] = [];
    const innerBelt = this.data.beltDistanceMetres * WORLD_SCALE;
    const outerBelt = CONTEXT_GROUND_EXTENT_METRES * WORLD_SCALE;
    const nearColor = new THREE.Color(0x697467);
    const farColor = new THREE.Color(0x35464a);
    const scratch = new THREE.Color();
    const addVertex = (point: Vec2, distance: number) => {
      const fade = THREE.MathUtils.smoothstep(distance, innerBelt * 0.72, outerBelt);
      scratch.copy(nearColor).lerp(farColor, fade);
      vertices.push(point.x, this.contextGroundY(point) - 0.045 - fade * 0.7, point.z);
      colors.push(scratch.r, scratch.g, scratch.b);
    };

    for (let x = minX; x < maxX; x += CONTEXT_GROUND_GRID) {
      for (let z = minZ; z < maxZ; z += CONTEXT_GROUND_GRID) {
        const center = { x: x + CONTEXT_GROUND_GRID * 0.5, z: z + CONTEXT_GROUND_GRID * 0.5 };
        if (pointInPolygon(center, this.parkBoundary)) continue;
        const distance = distanceToPolygon(center, this.parkBoundary);
        if (distance > outerBelt) continue;
        const p00 = { x, z };
        const p10 = { x: x + CONTEXT_GROUND_GRID, z };
        const p01 = { x, z: z + CONTEXT_GROUND_GRID };
        const p11 = { x: x + CONTEXT_GROUND_GRID, z: z + CONTEXT_GROUND_GRID };
        for (const point of [p00, p11, p10, p00, p01, p11]) addVertex(point, distance);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshToonMaterial({
      color: 0xffffff,
      vertexColors: true,
      gradientMap: createAnimeToonRamp()
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Context terrain collar";
    mesh.userData.kind = "context-ground";
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    this.root.add(mesh);
  }

  private addRoads(): void {
    const geometries = new Map<ContextRoad["kind"], THREE.BufferGeometry[]>();
    const pavementGeometries: THREE.BufferGeometry[] = [];
    const tramWirePositions: number[] = [];
    const tramPoleMatrices: THREE.Matrix4[] = [];
    const tramPoleCells = new Set<string>();
    for (const road of this.data.roads) {
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const start = road.points[index];
        const end = road.points[index + 1];
        const center = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
        if (pointInPolygon(center, this.parkBoundary)) continue;
        const length = Math.hypot(end.x - start.x, end.z - start.z);
        if (length < 1) continue;
        const angle = Math.atan2(end.z - start.z, end.x - start.x);
        if (road.kind === "road") {
          const pavement = new THREE.PlaneGeometry(length + 0.7, road.width + 4.2);
          pavement.rotateX(-Math.PI / 2);
          pavement.rotateY(-angle);
          pavement.translate(center.x, this.contextGroundY(center) + 0.006, center.z);
          pavementGeometries.push(pavement);
        }
        const geometry = new THREE.PlaneGeometry(length + 0.35, road.width);
        geometry.rotateX(-Math.PI / 2);
        geometry.rotateY(-angle);
        geometry.translate(center.x, this.contextGroundY(center) + roadSurfaceOffset(road.kind), center.z);
        const bucket = geometries.get(road.kind) ?? [];
        bucket.push(geometry);
        geometries.set(road.kind, bucket);
        if (road.kind === "tram") {
          const startY = this.contextGroundY(start);
          const endY = this.contextGroundY(end);
          tramWirePositions.push(start.x, startY + 6.25, start.z, end.x, endY + 6.25, end.z);
          for (const point of [start, end]) {
            const cell = `${Math.round(point.x / 18)}:${Math.round(point.z / 18)}`;
            if (tramPoleCells.has(cell)) continue;
            tramPoleCells.add(cell);
            tramPoleMatrices.push(new THREE.Matrix4().compose(
              new THREE.Vector3(point.x, this.contextGroundY(point) + 3.15, point.z),
              new THREE.Quaternion(),
              new THREE.Vector3(0.115, 6.3, 0.115)
            ));
          }
        }
        this.stats.roads += 1;
      }
    }

    const pavementGeometry = mergeAndDispose(pavementGeometries);
    if (pavementGeometry) {
      const pavements = new THREE.Mesh(pavementGeometry, toonMaterial(0x8d887b, 0.025));
      pavements.name = "Context street pavements";
      pavements.userData.kind = "context-pavements";
      pavements.castShadow = false;
      pavements.receiveShadow = false;
      this.root.add(pavements);
    }

    const colors: Record<ContextRoad["kind"], number> = {
      road: 0x303c3e,
      service: 0x4f554e,
      path: 0x918775,
      tram: 0xaeb6b0
    };
    for (const [kind, bucket] of geometries) {
      const geometry = mergeAndDispose(bucket);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, toonMaterial(colors[kind], 0.04));
      mesh.name = `Context ${kind} ribbons`;
      mesh.userData.kind = `context-${kind}`;
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      this.root.add(mesh);
    }

    if (tramPoleMatrices.length > 0) {
      const poles = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 1, 1, 5),
        toonMaterial(0x34433f, 0.03),
        tramPoleMatrices.length
      );
      tramPoleMatrices.forEach((matrix, index) => poles.setMatrixAt(index, matrix));
      poles.instanceMatrix.needsUpdate = true;
      poles.name = "Context route 11 overhead poles";
      poles.userData.kind = "context-tram-infrastructure";
      poles.castShadow = false;
      poles.receiveShadow = false;
      this.nearDetails.add(poles);
    }
    if (tramWirePositions.length > 0) {
      const wireGeometry = new THREE.BufferGeometry();
      wireGeometry.setAttribute("position", new THREE.Float32BufferAttribute(tramWirePositions, 3));
      const wires = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ color: 0x44504b, transparent: true, opacity: 0.62 }));
      wires.name = "Context route 11 overhead wire";
      wires.userData.kind = "context-tram-infrastructure";
      this.nearDetails.add(wires);
    }
  }

  private addBuildings(): void {
    const bodyBuckets = new Map<ContextFacadeTone, THREE.BufferGeometry[]>();
    const roofBuckets = new Map<ContextRoofTone, THREE.BufferGeometry[]>();
    const windowMatrices: THREE.Matrix4[] = [];
    const doorMatrices: THREE.Matrix4[] = [];
    const awningMatrices: THREE.Matrix4[] = [];
    const rooftopGardenGeometries: THREE.BufferGeometry[] = [];

    for (const building of this.data.buildings) {
      const supportY = this.contextGroundY(building.center);
      const body = createBuildingBodyGeometry(building, supportY);
      const bodyBucket = bodyBuckets.get(building.facadeTone) ?? [];
      bodyBucket.push(body);
      bodyBuckets.set(building.facadeTone, bodyBucket);

      const roof = createBuildingRoofGeometry(building, supportY);
      const roofBucket = roofBuckets.get(building.roofTone) ?? [];
      roofBucket.push(roof);
      roofBuckets.set(building.roofTone, roofBucket);
      if (building.facadeProfile === "modern-civic" && building.featureCues?.includes("rooftop garden")) {
        rooftopGardenGeometries.push(createRooftopGardenGeometry(building, supportY));
      }

      if (building.detailTier === "near") {
        for (const matrix of facadeAccentMatrices(building, supportY, this.parkBoundary)) windowMatrices.push(matrix);
        doorMatrices.push(facadeDoorMatrix(building, supportY, this.parkBoundary));
        if (building.facadeProfile === "terrace-shop") {
          awningMatrices.push(facadeAwningMatrix(building, supportY, this.parkBoundary));
        }
      }
      this.stats.buildings += 1;
    }

    for (const [tone, bucket] of bodyBuckets) {
      const geometry = mergeAndDispose(bucket);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, toonMaterial(BODY_COLORS[tone], 0.035));
      mesh.name = `Context ${tone} facades`;
      mesh.userData.kind = "context-buildings";
      mesh.userData.facadeTone = tone;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.root.add(mesh);
    }

    for (const [tone, bucket] of roofBuckets) {
      const geometry = mergeAndDispose(bucket);
      if (!geometry) continue;
      const material = toonMaterial(ROOF_COLORS[tone], 0.075);
      material.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Context ${tone} roofs`;
      mesh.userData.kind = "context-roofs";
      mesh.userData.roofTone = tone;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.root.add(mesh);
    }
    const rooftopGardenGeometry = mergeAndDispose(rooftopGardenGeometries);
    if (rooftopGardenGeometry) {
      const rooftopGardens = new THREE.Mesh(rooftopGardenGeometry, toonMaterial(0x58704b, 0.045));
      rooftopGardens.name = "Context Bargoonga Nganjin rooftop garden";
      rooftopGardens.userData.kind = "context-landmark-detail";
      rooftopGardens.castShadow = false;
      rooftopGardens.receiveShadow = false;
      this.root.add(rooftopGardens);
    }

    if (windowMatrices.length > 0) {
      const geometry = new THREE.PlaneGeometry(0.9, 1.05);
      const material = new THREE.MeshBasicMaterial({ color: 0x344d56, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
      const windows = new THREE.InstancedMesh(geometry, material, windowMatrices.length);
      windowMatrices.forEach((matrix, index) => windows.setMatrixAt(index, matrix));
      windows.instanceMatrix.needsUpdate = true;
      windows.name = "Context near facade tonal accents";
      windows.userData.kind = "context-facade-accents";
      this.nearDetails.add(windows);
    }
    if (doorMatrices.length > 0) {
      const geometry = new THREE.PlaneGeometry(0.86, 1.7);
      const material = new THREE.MeshBasicMaterial({ color: 0x513e35, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
      const doors = new THREE.InstancedMesh(geometry, material, doorMatrices.length);
      doorMatrices.forEach((matrix, index) => doors.setMatrixAt(index, matrix));
      doors.instanceMatrix.needsUpdate = true;
      doors.name = "Context near facade entrances";
      doors.userData.kind = "context-facade-accents";
      this.nearDetails.add(doors);
    }
    if (awningMatrices.length > 0) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const awnings = new THREE.InstancedMesh(geometry, toonMaterial(0x6f4439, 0.055), awningMatrices.length);
      awningMatrices.forEach((matrix, index) => awnings.setMatrixAt(index, matrix));
      awnings.instanceMatrix.needsUpdate = true;
      awnings.name = "Context St Georges and Brunswick shop awnings";
      awnings.userData.kind = "context-facade-accents";
      awnings.castShadow = false;
      awnings.receiveShadow = false;
      this.nearDetails.add(awnings);
    }
  }

  private addTrees(): void {
    const near = this.data.trees.filter((tree) => tree.distanceToPark <= 90);
    const far = this.data.trees.filter((tree) => tree.distanceToPark > 90);
    this.addTreeInstances(near, this.contextTreesNear, "near");
    this.addTreeInstances(far, this.contextTreesFar, "far");
    this.stats.trees = this.data.trees.length;
  }

  private addTreeInstances(trees: ContextWorldData["trees"], parent: THREE.Group, tier: "near" | "far"): void {
    if (trees.length === 0) return;
    const trunkGeometry = new THREE.CylinderGeometry(0.62, 0.82, 1, 5);
    const canopyGeometry = new THREE.IcosahedronGeometry(1, 0);
    const trunks = new THREE.InstancedMesh(trunkGeometry, toonMaterial(0x685540, 0.02), trees.length);
    const canopies = new THREE.InstancedMesh(canopyGeometry, toonMaterial(tier === "near" ? 0x526d4f : 0x40594e, 0.03), trees.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    trees.forEach((tree, index) => {
      const ground = this.contextGroundY(tree.position);
      const trunkHeight = Math.max(2.2, tree.height * 0.48);
      position.set(tree.position.x, ground + trunkHeight * 0.5, tree.position.z);
      scale.set(Math.max(0.22, tree.canopyRadius * 0.12), trunkHeight, Math.max(0.22, tree.canopyRadius * 0.12));
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(index, matrix);

      position.set(tree.position.x, ground + tree.height * 0.72, tree.position.z);
      scale.set(tree.canopyRadius, Math.max(1.4, tree.height * 0.38), tree.canopyRadius * 0.92);
      matrix.compose(position, quaternion, scale);
      canopies.setMatrixAt(index, matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    trunks.name = `Context ${tier} tree trunks`;
    canopies.name = `Context ${tier} tree canopies`;
    trunks.userData.kind = "context-trees";
    canopies.userData.kind = "context-trees";
    trunks.castShadow = false;
    canopies.castShadow = false;
    parent.add(trunks, canopies);
  }

  private contextGroundY(point: Vec2): number {
    const parkSurface = this.groundY(point);
    if (this.data.elevationSamples.length === 0) return parkSurface;
    const nearestDistances = new Array<number>(8).fill(Number.POSITIVE_INFINITY);
    const nearestAltitudes = new Array<number>(8).fill(0);
    for (const sample of this.nearbyElevationSamples(point)) {
      const distanceSquared = (point.x - sample.position.x) ** 2 + (point.z - sample.position.z) ** 2;
      if (distanceSquared >= nearestDistances[7]) continue;
      let insertAt = 7;
      while (insertAt > 0 && distanceSquared < nearestDistances[insertAt - 1]) {
        nearestDistances[insertAt] = nearestDistances[insertAt - 1];
        nearestAltitudes[insertAt] = nearestAltitudes[insertAt - 1];
        insertAt -= 1;
      }
      nearestDistances[insertAt] = distanceSquared;
      nearestAltitudes[insertAt] = sample.altitude;
    }
    let weightedAltitude = 0;
    let totalWeight = 0;
    for (let index = 0; index < nearestDistances.length; index += 1) {
      if (!Number.isFinite(nearestDistances[index])) continue;
      const weight = 1 / Math.max(24, nearestDistances[index]);
      weightedAltitude += nearestAltitudes[index] * weight;
      totalWeight += weight;
    }
    const sampledSurface = totalWeight > 0 ? weightedAltitude / totalWeight - this.contextElevationDatum : parkSurface;
    const boundaryBlend = THREE.MathUtils.smoothstep(distanceToPolygon(point, this.parkBoundary), 2, 28);
    return THREE.MathUtils.lerp(parkSurface, sampledSurface, boundaryBlend);
  }

  private nearbyElevationSamples(point: Vec2): ContextWorldData["elevationSamples"] {
    const cellX = Math.floor(point.x / CONTEXT_ELEVATION_BUCKET_SIZE);
    const cellZ = Math.floor(point.z / CONTEXT_ELEVATION_BUCKET_SIZE);
    const candidates: ContextWorldData["elevationSamples"] = [];
    for (let radius = 0; radius <= 3 && candidates.length < 12; radius += 1) {
      for (let x = cellX - radius; x <= cellX + radius; x += 1) {
        for (let z = cellZ - radius; z <= cellZ + radius; z += 1) {
          if (radius > 0 && x > cellX - radius && x < cellX + radius && z > cellZ - radius && z < cellZ + radius) continue;
          const bucket = this.contextElevationBuckets.get(`${x}:${z}`);
          if (bucket) candidates.push(...bucket);
        }
      }
    }
    return candidates.length > 0 ? candidates : this.data.elevationSamples;
  }
}

function estimateContextElevationDatum(
  data: ContextWorldData,
  parkBoundary: readonly Vec2[],
  parkGroundY: (point: Vec2) => number
): number {
  const offsets = data.elevationSamples
    .map((sample) => ({
      offset: sample.altitude - parkGroundY(sample.position),
      distance: distanceToPolygon(sample.position, parkBoundary)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 24)
    .map((entry) => entry.offset)
    .sort((a, b) => a - b);
  return offsets.length > 0 ? offsets[Math.floor(offsets.length / 2)] : 27;
}

function elevationBucketKey(point: Vec2): string {
  return `${Math.floor(point.x / CONTEXT_ELEVATION_BUCKET_SIZE)}:${Math.floor(point.z / CONTEXT_ELEVATION_BUCKET_SIZE)}`;
}

function toonMaterial(color: number, emissiveIntensity: number): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(0.22),
    emissiveIntensity,
    gradientMap: createAnimeToonRamp()
  });
  return material;
}

function createBuildingBodyGeometry(building: ContextBuilding, supportY: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  building.polygon.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: building.height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, supportY, 0);
  geometry.deleteAttribute("uv");
  geometry.computeVertexNormals();
  return geometry;
}

function createBuildingRoofGeometry(building: ContextBuilding, supportY: number): THREE.BufferGeometry {
  const footprint = orientedFootprint(building.polygon);
  const baseY = supportY + building.height + 0.025;
  const rise = roofRise(building.roofShape, footprint);
  const shape = new THREE.Shape();
  building.polygon.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  const position = geometry.getAttribute("position");
  const cos = Math.cos(footprint.angle);
  const sin = Math.sin(footprint.angle);
  for (let index = 0; index < position.count; index += 1) {
    const worldX = position.getX(index);
    const worldZ = -position.getY(index);
    const dx = worldX - footprint.center.x;
    const dz = worldZ - footprint.center.z;
    const localX = dx * cos + dz * sin;
    const localZ = -dx * sin + dz * cos;
    const across = THREE.MathUtils.clamp(localZ / Math.max(0.1, footprint.halfZ), -1, 1);
    const along = THREE.MathUtils.clamp(localX / Math.max(0.1, footprint.halfX), -1, 1);
    let pitch = 0;
    if (building.roofShape === "gable") pitch = 1 - Math.abs(across);
    else if (building.roofShape === "hipped") pitch = Math.max(0, Math.min(1 - Math.abs(across), 1 - Math.abs(along)));
    else if (building.roofShape === "skillion") pitch = (across + 1) * 0.5;
    position.setXYZ(index, worldX, baseY + rise * pitch, worldZ);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createRooftopGardenGeometry(building: ContextBuilding, supportY: number): THREE.BufferGeometry {
  const footprint = orientedFootprint(building.polygon);
  const geometry = new THREE.BoxGeometry(
    Math.max(1.6, footprint.halfX * 1.12),
    0.22,
    Math.max(1.6, footprint.halfZ * 1.12)
  );
  geometry.rotateY(-footprint.angle);
  geometry.translate(footprint.center.x, supportY + building.height + 0.18, footprint.center.z);
  return geometry;
}

function roofRise(shape: ContextRoofShape, footprint: OrientedFootprint): number {
  if (shape === "flat") return 0;
  if (shape === "skillion") return THREE.MathUtils.clamp(footprint.halfZ * 0.24, 0.45, 1.3);
  return THREE.MathUtils.clamp(footprint.halfZ * 0.44, 0.7, 2.4);
}

function orientedFootprint(polygon: readonly Vec2[]): OrientedFootprint {
  const center = polygon.reduce((sum, point) => ({ x: sum.x + point.x / polygon.length, z: sum.z + point.z / polygon.length }), { x: 0, z: 0 });
  let longestStart = polygon[0];
  let longestEnd = polygon[1] ?? polygon[0];
  let longest = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > longest) {
      longest = length;
      longestStart = a;
      longestEnd = b;
    }
  }
  const angle = Math.atan2(longestEnd.z - longestStart.z, longestEnd.x - longestStart.x);
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
  return { center, angle, halfX, halfZ };
}

function facadeAccentMatrices(building: ContextBuilding, supportY: number, parkBoundary: readonly Vec2[]): THREE.Matrix4[] {
  const frame = frontFacadeFrame(building, parkBoundary);
  const count = Math.max(1, Math.min(9, Math.floor(frame.halfWidth * 0.72)));
  const storeys = building.facadeProfile === "church" ? 1 : building.storeys;
  const matrices: THREE.Matrix4[] = [];
  for (let storey = 0; storey < storeys; storey += 1) {
    const y = supportY + (building.facadeProfile === "church" ? Math.min(4.1, building.height * 0.48) : 1.82 + storey * 2.75);
    if (y > supportY + building.height - 0.55) continue;
    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? 0 : index / (count - 1) - 0.5;
      const position = new THREE.Vector3(
        frame.center.x + frame.tangent.x * t * frame.halfWidth * 1.52 + frame.normal.x * 0.035,
        y,
        frame.center.z + frame.tangent.z * t * frame.halfWidth * 1.52 + frame.normal.z * 0.035
      );
      const scale = building.facadeProfile === "church"
        ? new THREE.Vector3(0.62, 1.65, 1)
        : building.facadeProfile === "modern-civic"
          ? new THREE.Vector3(1.26, 0.92, 1)
          : new THREE.Vector3(0.82, 0.78, 1);
      matrices.push(new THREE.Matrix4().compose(position, frame.rotation, scale));
    }
  }
  return matrices;
}

function facadeDoorMatrix(building: ContextBuilding, supportY: number, parkBoundary: readonly Vec2[]): THREE.Matrix4 {
  const frame = frontFacadeFrame(building, parkBoundary);
  const position = new THREE.Vector3(
    frame.center.x + frame.tangent.x * Math.min(1.15, frame.halfWidth * 0.25) + frame.normal.x * 0.04,
    supportY + 0.88,
    frame.center.z + frame.tangent.z * Math.min(1.15, frame.halfWidth * 0.25) + frame.normal.z * 0.04
  );
  return new THREE.Matrix4().compose(position, frame.rotation, new THREE.Vector3(0.88, 0.92, 1));
}

function facadeAwningMatrix(building: ContextBuilding, supportY: number, parkBoundary: readonly Vec2[]): THREE.Matrix4 {
  const frame = frontFacadeFrame(building, parkBoundary);
  const yaw = Math.atan2(frame.tangent.z, frame.tangent.x);
  const position = new THREE.Vector3(
    frame.center.x + frame.normal.x * 0.48,
    supportY + Math.min(2.72, building.height * 0.62),
    frame.center.z + frame.normal.z * 0.48
  );
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -yaw, 0));
  return new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(frame.halfWidth * 1.65, 0.11, 0.82));
}

interface FacadeFrame {
  center: Vec2;
  tangent: Vec2;
  normal: Vec2;
  halfWidth: number;
  rotation: THREE.Quaternion;
}

function frontFacadeFrame(building: ContextBuilding, parkBoundary: readonly Vec2[]): FacadeFrame {
  let edgeStart = building.polygon[0];
  let edgeEnd = building.polygon[1] ?? building.polygon[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < building.polygon.length; index += 1) {
    const start = building.polygon[index];
    const end = building.polygon[(index + 1) % building.polygon.length];
    const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
    const parkPoint = nearestPointOnPolygon(midpoint, parkBoundary);
    const distance = Math.hypot(parkPoint.x - midpoint.x, parkPoint.z - midpoint.z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      edgeStart = start;
      edgeEnd = end;
    }
  }
  const edgeDx = edgeEnd.x - edgeStart.x;
  const edgeDz = edgeEnd.z - edgeStart.z;
  const edgeLength = Math.hypot(edgeDx, edgeDz) || 1;
  const tangent = { x: edgeDx / edgeLength, z: edgeDz / edgeLength };
  const center = { x: (edgeStart.x + edgeEnd.x) * 0.5, z: (edgeStart.z + edgeEnd.z) * 0.5 };
  const nearestParkPoint = nearestPointOnPolygon(center, parkBoundary);
  const normalCandidate = { x: -tangent.z, z: tangent.x };
  const towardPark = { x: nearestParkPoint.x - center.x, z: nearestParkPoint.z - center.z };
  const normalSign = normalCandidate.x * towardPark.x + normalCandidate.z * towardPark.z >= 0 ? 1 : -1;
  const normal = { x: normalCandidate.x * normalSign, z: normalCandidate.z * normalSign };
  const halfWidth = edgeLength * 0.5;
  const yaw = Math.atan2(normal.x, normal.z);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  return { center, tangent, normal, halfWidth, rotation };
}

function nearestPointOnPolygon(point: Vec2, polygon: readonly Vec2[]): Vec2 {
  let nearest = polygon[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const candidate = nearestPointOnSegment(point, polygon[index], polygon[(index + 1) % polygon.length]);
    const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = candidate;
    }
  }
  return nearest;
}

function nearestPointOnSegment(point: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
  return { x: a.x + dx * t, z: a.z + dz * t };
}

function distanceToPolygon(point: Vec2, polygon: readonly Vec2[]): number {
  return Math.min(...polygon.map((a, index) => {
    const nearest = nearestPointOnSegment(point, a, polygon[(index + 1) % polygon.length]);
    return Math.hypot(nearest.x - point.x, nearest.z - point.z);
  }));
}

function roadSurfaceOffset(kind: ContextRoad["kind"]): number {
  if (kind === "path") return 0.024;
  if (kind === "tram") return 0.038;
  return 0.012;
}

function mergeAndDispose(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}
