import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Zombie } from "../state";
import type { ZombieType } from "../waves";
import type { RenderQualitySettings } from "./renderQuality";
import { createAnimeToonRamp } from "./animeStyle";

export type ZombieRenderTier = "full" | "far" | "hidden";

const ZOMBIE_TYPES: readonly ZombieType[] = ["shambler", "sprinter", "bloater", "crawler", "screamer"];
const FAR_LOD_CAPACITY_PER_TYPE = 256;
const FAR_LOD_COLORS: Record<ZombieType, THREE.ColorRepresentation> = {
  shambler: 0x82906a,
  sprinter: 0xc2ad58,
  bloater: 0x9a5548,
  crawler: 0x718b5d,
  screamer: 0xd1bd78
};
const FAR_LOD_SKIN = new THREE.Color(0x91a083);
const FAR_LOD_DARK = new THREE.Color(0x263a35);
const FAR_LOD_BLOOD = new THREE.Color(0x713d38);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

export function zombieRenderTier(distanceToPlayer: number, settings: RenderQualitySettings): ZombieRenderTier {
  if (distanceToPlayer <= settings.zombieFullDetailDistance) return "full";
  if (distanceToPlayer <= settings.zombieRenderDistance) return "far";
  return "hidden";
}

export function zombieSimulationInterval(distanceToPlayer: number, settings: RenderQualitySettings): number {
  if (distanceToPlayer <= settings.zombieFullDetailDistance) return 0;
  if (distanceToPlayer <= settings.zombieRenderDistance) return 1 / 15;
  return 1 / 6;
}

export class ZombieRenderLod {
  readonly root = new THREE.Group();
  private readonly meshes = new Map<ZombieType, THREE.InstancedMesh>();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly rotation = new THREE.Euler();
  private readonly position = new THREE.Vector3();

  constructor() {
    this.root.name = "Zombie far LOD batches";
    this.root.userData.dynamic = true;
    const gradientMap = createAnimeToonRamp();
    for (const type of ZOMBIE_TYPES) {
      const material = new THREE.MeshToonMaterial({
        color: 0xffffff,
        emissive: new THREE.Color(FAR_LOD_COLORS[type]).multiplyScalar(0.13),
        emissiveIntensity: 0.16,
        gradientMap,
        vertexColors: true
      });
      const mesh = new THREE.InstancedMesh(createFarZombieGeometry(type), material, FAR_LOD_CAPACITY_PER_TYPE);
      mesh.name = `${type} far LOD`;
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // These five extremely cheap aggregate meshes replace hundreds of uncullable
      // skinned draw calls. Distance rejection happens before their matrices are set.
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.kind = "zombie-far-lod";
      mesh.userData.zombieType = type;
      this.meshes.set(type, mesh);
      this.root.add(mesh);
    }
  }

  update(zombies: readonly Zombie[], playerPosition: THREE.Vector3, settings: RenderQualitySettings): boolean {
    const counts: Record<ZombieType, number> = { shambler: 0, sprinter: 0, bloater: 0, crawler: 0, screamer: 0 };
    let shadowStateChanged = false;

    for (const zombie of zombies) {
      const distanceToPlayer = Math.hypot(
        zombie.position.x - playerPosition.x,
        zombie.position.z - playerPosition.z
      );
      const tier = zombieRenderTier(distanceToPlayer, settings);
      const castsShadow = tier === "full" && distanceToPlayer <= settings.zombieShadowDistance;
      shadowStateChanged = this.setFullDetailState(zombie.mesh, tier === "full", castsShadow) || shadowStateChanged;
      zombie.mesh.userData.zombieRenderTier = tier;
      if (tier !== "far") continue;

      const mesh = this.meshes.get(zombie.type)!;
      const index = counts[zombie.type];
      if (index >= FAR_LOD_CAPACITY_PER_TYPE) continue;
      this.quaternion.setFromEuler(this.rotation.set(0, zombie.mesh.rotation.y, 0));
      this.matrix.compose(
        this.position.set(zombie.position.x, zombie.position.y, zombie.position.z),
        this.quaternion,
        UNIT_SCALE
      );
      mesh.setMatrixAt(index, this.matrix);
      counts[zombie.type] = index + 1;
    }

    for (const type of ZOMBIE_TYPES) {
      const mesh = this.meshes.get(type)!;
      mesh.count = counts[type];
      mesh.instanceMatrix.needsUpdate = mesh.count > 0;
    }
    return shadowStateChanged;
  }

  private setFullDetailState(root: THREE.Group, visible: boolean, castsShadow: boolean): boolean {
    const previousVisible = root.userData.zombieFullDetailVisible as boolean | undefined;
    const previousShadow = root.userData.zombieCastsShadow as boolean | undefined;
    if (previousVisible === visible && previousShadow === castsShadow) return false;
    root.visible = visible;
    root.userData.zombieFullDetailVisible = visible;
    root.userData.zombieCastsShadow = castsShadow;
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = castsShadow;
    });
    return previousShadow !== castsShadow;
  }
}

function createFarZombieGeometry(type: ZombieType): THREE.BufferGeometry {
  if (type === "crawler") return createCrawlerGeometry();

  const height = type === "bloater" ? 2.18 : type === "sprinter" ? 1.92 : type === "screamer" ? 2.04 : 2.05;
  const width = type === "bloater" ? 0.72 : type === "screamer" ? 0.4 : type === "sprinter" ? 0.44 : 0.52;
  const legLength = height * (type === "bloater" ? 0.34 : 0.39);
  const torsoHeight = height * (type === "bloater" ? 0.43 : 0.37);
  const headRadius = width * (type === "bloater" ? 0.35 : 0.42);
  const shoulderY = legLength + torsoHeight * 0.78;
  const shirt = new THREE.Color(FAR_LOD_COLORS[type]);
  const parts: THREE.BufferGeometry[] = [];

  addColoredPart(parts, new THREE.CapsuleGeometry(width * 0.48, Math.max(0.08, torsoHeight - width * 0.96), 2, 6), shirt, {
    position: new THREE.Vector3(0, legLength + torsoHeight * 0.5, 0),
    scale: new THREE.Vector3(type === "bloater" ? 1.18 : 1, 1, type === "bloater" ? 1.12 : 0.82)
  });
  addColoredPart(parts, new THREE.SphereGeometry(headRadius, 7, 5), FAR_LOD_SKIN, {
    position: new THREE.Vector3(type === "screamer" ? 0.04 : 0, height - headRadius * 1.02, type === "sprinter" ? -0.08 : 0)
  });

  const stance = type === "sprinter" ? 0.22 : type === "bloater" ? 0.3 : 0.25;
  const legRadius = width * (type === "bloater" ? 0.17 : 0.14);
  addLimb(parts, new THREE.Vector3(-stance, legLength, 0), new THREE.Vector3(-stance * 1.08, 0.05, type === "sprinter" ? 0.12 : 0), legRadius, FAR_LOD_DARK);
  addLimb(parts, new THREE.Vector3(stance, legLength, 0), new THREE.Vector3(stance * 1.08, 0.05, type === "sprinter" ? -0.12 : 0), legRadius, FAR_LOD_DARK);

  const reach = type === "screamer" ? 0.72 : type === "sprinter" ? 0.62 : 0.54;
  const armRadius = width * (type === "bloater" ? 0.15 : 0.11);
  addLimb(parts, new THREE.Vector3(-width * 0.62, shoulderY, 0), new THREE.Vector3(-width * 0.82, shoulderY - 0.48, -reach), armRadius, FAR_LOD_SKIN);
  addLimb(parts, new THREE.Vector3(width * 0.62, shoulderY, 0), new THREE.Vector3(width * 0.82, shoulderY - 0.4, -reach * 0.88), armRadius, FAR_LOD_SKIN);

  if (type === "bloater") {
    addColoredPart(parts, new THREE.SphereGeometry(width * 0.24, 6, 4), FAR_LOD_BLOOD, {
      position: new THREE.Vector3(width * 0.22, legLength + torsoHeight * 0.56, -width * 0.48),
      scale: new THREE.Vector3(1.2, 0.7, 0.45)
    });
  }
  return mergeFarZombieParts(parts);
}

function createCrawlerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shirt = new THREE.Color(FAR_LOD_COLORS.crawler);
  addColoredPart(parts, new THREE.CapsuleGeometry(0.35, 0.7, 2, 6), shirt, {
    position: new THREE.Vector3(0, 0.52, 0.1),
    rotation: new THREE.Euler(Math.PI / 2, 0, 0),
    scale: new THREE.Vector3(1, 1, 0.78)
  });
  addColoredPart(parts, new THREE.SphereGeometry(0.24, 7, 5), FAR_LOD_SKIN, {
    position: new THREE.Vector3(0, 0.56, -0.68)
  });
  addLimb(parts, new THREE.Vector3(-0.25, 0.48, -0.18), new THREE.Vector3(-0.6, 0.08, -0.68), 0.09, FAR_LOD_SKIN);
  addLimb(parts, new THREE.Vector3(0.25, 0.48, -0.18), new THREE.Vector3(0.6, 0.08, -0.62), 0.09, FAR_LOD_SKIN);
  addLimb(parts, new THREE.Vector3(-0.22, 0.46, 0.42), new THREE.Vector3(-0.52, 0.08, 0.78), 0.1, FAR_LOD_DARK);
  addLimb(parts, new THREE.Vector3(0.22, 0.46, 0.42), new THREE.Vector3(0.52, 0.08, 0.82), 0.1, FAR_LOD_DARK);
  return mergeFarZombieParts(parts);
}

function addLimb(
  parts: THREE.BufferGeometry[],
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  color: THREE.Color
): void {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  addColoredPart(parts, new THREE.CylinderGeometry(radius * 0.82, radius, length, 5, 1), color, {
    position: start.clone().add(end).multiplyScalar(0.5),
    quaternion
  });
}

function addColoredPart(
  parts: THREE.BufferGeometry[],
  geometry: THREE.BufferGeometry,
  color: THREE.Color,
  transform: {
    position?: THREE.Vector3;
    rotation?: THREE.Euler;
    quaternion?: THREE.Quaternion;
    scale?: THREE.Vector3;
  }
): void {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) color.toArray(colors, index * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const quaternion = transform.quaternion ?? new THREE.Quaternion().setFromEuler(transform.rotation ?? new THREE.Euler());
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    transform.position ?? new THREE.Vector3(),
    quaternion,
    transform.scale ?? UNIT_SCALE
  ));
  parts.push(geometry);
}

function mergeFarZombieParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Could not build far zombie LOD geometry");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
