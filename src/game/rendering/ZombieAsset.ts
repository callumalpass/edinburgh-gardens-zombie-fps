import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { ZombieAiState } from "../state";
import type { ZombieType } from "../waves";
import { tuneAnimeMaterial } from "./animeStyle";

export interface ZombieAssetInstance {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}

interface ZombieAnimationState {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  active: string;
  override: { name: string; remaining: number } | null;
  accumulatedDt: number;
}

const ASSET_PATHS: Record<ZombieType, string> = {
  shambler: "models/zombies/shambler.glb",
  sprinter: "models/zombies/sprinter.glb",
  bloater: "models/zombies/bloater.glb",
  crawler: "models/zombies/crawler.glb",
  screamer: "models/zombies/screamer.glb"
};

const VISUAL_SCALES: Record<ZombieType, number> = {
  shambler: 1.5,
  sprinter: 1.3,
  bloater: 1.68,
  crawler: 1.25,
  screamer: 1.32
};

const templates = new Map<ZombieType, Promise<ZombieAssetInstance>>();

export async function instantiateZombieAsset(type: ZombieType): Promise<ZombieAssetInstance> {
  let loading = templates.get(type);
  if (!loading) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    loading = new GLTFLoader().loadAsync(`${baseUrl}${ASSET_PATHS[type]}`).then((gltf) => ({
      root: gltf.scene,
      animations: gltf.animations
    }));
    templates.set(type, loading);
  }
  const template = await loading;
  const root = cloneSkeleton(template.root) as THREE.Group;
  root.name = `${type} Blender zombie`;
  root.scale.setScalar(VISUAL_SCALES[type]);
  root.userData.kind = "blender-zombie-asset";
  root.userData.zombieType = type;
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
      clip.name = source.name.replace(/^(Zombie|Crawler|shambler|sprinter|bloater|screamer)_/, "");
      return clip;
    })
  };
}

export function attachZombieAnimation(mesh: THREE.Group, asset: ZombieAssetInstance): void {
  const mixer = new THREE.AnimationMixer(asset.root);
  const state: ZombieAnimationState = {
    mixer,
    actions: new Map(asset.animations.map((clip) => [clip.name, mixer.clipAction(clip)])),
    active: "",
    override: null,
    accumulatedDt: 0
  };
  mesh.userData.zombieAnimation = state;
  transition(state, "Idle");
}

export function updateZombieAssetAnimation(
  mesh: THREE.Group,
  options: { dt: number; type: ZombieType; aiState: ZombieAiState; staggered: boolean; distanceToPlayer: number }
): boolean {
  const state = mesh.userData.zombieAnimation as ZombieAnimationState | undefined;
  if (!state) return false;
  state.accumulatedDt += options.dt;
  const minimumStep = options.distanceToPlayer > 100 ? 1 / 6 : options.distanceToPlayer > 55 ? 1 / 15 : 0;
  if (state.accumulatedDt < minimumStep) return true;
  const dt = state.accumulatedDt;
  state.accumulatedDt = 0;
  if (state.override) {
    state.override.remaining -= dt;
    if (state.override.remaining <= 0) state.override = null;
  }
  if (!state.override) {
    const desired = options.staggered
      ? "Stagger"
      : options.aiState === "chase"
        ? "Chase"
        : options.aiState === "wander" || options.aiState === "search" || options.aiState === "investigate"
          ? "Move"
          : "Idle";
    transition(state, desired);
  }
  const pace = options.type === "sprinter" ? 1.38 : options.type === "bloater" ? 0.72 : options.type === "crawler" ? 1.08 : options.type === "screamer" ? 1.16 : 0.92;
  state.mixer.timeScale = pace;
  state.mixer.update(dt);
  return true;
}

export function triggerZombieAssetAnimation(mesh: THREE.Group, name: "Attack" | "Scream"): void {
  const state = mesh.userData.zombieAnimation as ZombieAnimationState | undefined;
  if (!state) return;
  const action = state.actions.get(name);
  if (!action) return;
  transition(state, name, true);
  state.override = { name, remaining: Math.max(0.15, action.getClip().duration) };
}

export function zombieAssetState(mesh: THREE.Group): { loaded: boolean; animation: string } {
  const state = mesh.userData.zombieAnimation as ZombieAnimationState | undefined;
  return { loaded: Boolean(state), animation: state?.active ?? "" };
}

export function disposeZombieAssetAnimation(mesh: THREE.Group): void {
  const state = mesh.userData.zombieAnimation as ZombieAnimationState | undefined;
  if (!state) return;
  state.mixer.stopAllAction();
  state.mixer.uncacheRoot(state.mixer.getRoot());
  delete mesh.userData.zombieAnimation;
}

function transition(state: ZombieAnimationState, name: string, restart = false): void {
  if (!restart && state.active === name) return;
  const next = state.actions.get(name) ?? state.actions.get("Idle") ?? state.actions.get("Move");
  if (!next) return;
  state.actions.get(state.active)?.fadeOut(0.12);
  next.reset();
  if (["Attack", "Stagger", "Scream"].includes(name)) {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
  } else {
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
  }
  next.fadeIn(0.12).play();
  state.active = name;
}
