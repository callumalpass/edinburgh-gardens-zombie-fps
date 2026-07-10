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
    animations: template.animations.map((clip) => clip.clone())
  };
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
