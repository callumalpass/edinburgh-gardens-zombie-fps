import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { avatarDefinition, type AvatarId } from "../characters";
import { tuneAnimeMaterial } from "./animeStyle";

export interface CharacterAssetInstance {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}

interface CharacterTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const templates = new Map<AvatarId, Promise<CharacterTemplate>>();

export async function instantiateCharacterAsset(avatarId: AvatarId): Promise<CharacterAssetInstance> {
  const template = await loadCharacterTemplate(avatarId);
  const root = cloneSkeleton(template.scene) as THREE.Group;
  root.name = `${avatarDefinition(avatarId).name} avatar`;
  root.userData.kind = "blender-player-avatar";
  root.userData.avatarId = avatarId;

  // Blender object names are global within the source .blend, so sockets in
  // later avatar collections export as WeaponSocket.001, .002, and .003.
  // Runtime code needs one stable contract after each GLB is cloned.
  const weaponSocket = root.getObjectByName("WeaponSocket")
    ?? findObject(root, (object) => object.userData.eg_kind === "weapon-socket" || /^WeaponSocket\.\d+$/.test(object.name));
  if (weaponSocket) weaponSocket.name = "WeaponSocket";

  const orphanHelper = root.children.find((child) => child.name === "Icosphere" && Object.keys(child.userData).length === 0);
  if (orphanHelper) root.remove(orphanHelper);

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    object.castShadow = true;
    object.receiveShadow = false;
    object.frustumCulled = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) tuneAnimeMaterial(material);
  });

  return {
    root,
    animations: template.animations.map((source) => {
      const clip = source.clone();
      clip.name = source.name.replace(/^(milo|asha|jules|maeve)_/, "");
      return clip;
    })
  };
}

function findObject(root: THREE.Object3D, predicate: (object: THREE.Object3D) => boolean): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((object) => {
    if (!found && predicate(object)) found = object;
  });
  return found;
}

function loadCharacterTemplate(avatarId: AvatarId): Promise<CharacterTemplate> {
  const existing = templates.get(avatarId);
  if (existing) return existing;
  const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const path = avatarDefinition(avatarId).assetPath;
  const loading = new GLTFLoader().loadAsync(`${baseUrl}${path}`).then((gltf) => ({
    scene: gltf.scene,
    animations: gltf.animations
  }));
  templates.set(avatarId, loading);
  return loading;
}
