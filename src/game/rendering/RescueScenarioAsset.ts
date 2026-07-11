import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { tuneAnimeMaterial } from "./animeStyle";

type RescueAssetId = "caretaker" | "dog" | "cart";

export interface AnimatedRescueAsset {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}

const ASSET_PATHS: Record<RescueAssetId, string> = {
  caretaker: "models/rescue-scenario/caretaker.glb",
  dog: "models/rescue-scenario/rescue-dog.glb",
  cart: "models/rescue-scenario/maintenance-cart.glb"
};

const templates = new Map<RescueAssetId, Promise<AnimatedRescueAsset>>();

export async function instantiateRescueAsset(assetId: RescueAssetId): Promise<AnimatedRescueAsset> {
  let loading = templates.get(assetId);
  if (!loading) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    loading = new GLTFLoader().loadAsync(`${baseUrl}${ASSET_PATHS[assetId]}`).then((gltf) => prepareTemplate(gltf.scene, gltf.animations, assetId));
    templates.set(assetId, loading);
  }
  const template = await loading;
  const root = cloneSkeleton(template.root) as THREE.Group;
  root.name = `${assetId} rescue scenario asset`;
  root.userData.kind = `blender-rescue-${assetId}`;
  prepareInstance(root);
  return {
    root,
    animations: template.animations.map((source) => {
      const clip = source.clone();
      clip.name = source.name.replace(/^(caretaker|dog)_/, "");
      return clip;
    })
  };
}

export function setMaintenanceCartVisualState(root: THREE.Object3D, repaired: boolean): void {
  root.traverse((object) => {
    const state = object.userData.eg_cart_state as string | undefined;
    if (state === "damaged") object.visible = !repaired;
    if (state === "repaired") object.visible = repaired;
  });
}

function prepareTemplate(root: THREE.Group, sourceAnimations: THREE.AnimationClip[], assetId: RescueAssetId): AnimatedRescueAsset {
  prepareInstance(root);
  return {
    root,
    animations: sourceAnimations.map((source) => {
      const clip = source.clone();
      clip.name = source.name.replace(/^(caretaker|dog)_/, "");
      return clip;
    })
  };
}

function prepareInstance(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    object.castShadow = true;
    object.receiveShadow = false;
    object.frustumCulled = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) tuneAnimeMaterial(material);
  });
}
