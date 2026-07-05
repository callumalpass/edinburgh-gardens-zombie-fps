import type * as THREE from "three";
import type { AmenityPoint } from "./types";
import type { WeaponId } from "./weapons";
import type { ZombieType } from "./waves";

export type GameStateName = "ready" | "playing" | "gameover";
export type HitZone = "head" | "body" | "legs";

export interface Zombie {
  id: number;
  type: ZombieType;
  mesh: THREE.Group;
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  speed: number;
  radius: number;
  reward: number;
  attackCooldown: number;
  walkOffset: number;
}

export interface Pickup {
  id: number;
  type: "scrap" | "health" | "ammo";
  amount: number;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  ttl: number;
}

export interface WeaponDrop {
  id: number;
  weaponId: WeaponId;
  label: string;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  ttl: number;
  source: "cache" | "zombie";
}

export interface Tracer {
  mesh: THREE.Line;
  ttl: number;
}

export interface ShellCasing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
}

export interface SmokePuff {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
  maxTtl: number;
}

export interface Snapshot {
  ready: boolean;
  state: string;
  frame: number;
  wave: number;
  zombies: number;
  ammo: number;
  health: number;
  scrap: number;
  weapon: WeaponId;
  weaponDrops: number;
  elevation: number;
  renderedTrees: number;
  lastHitZone: HitZone | null;
  shotBloom: number;
  reloadProgress: number;
  scope: number;
  fov: number;
  miniMapVisibleZombies: number;
}

export interface GameTestApi {
  ready: boolean;
  snapshot: () => Snapshot;
  testShoot: () => void;
  testUpgrade: (stationId?: string) => boolean;
  testSpawn: () => void;
  testPickupWeapon: (weaponId?: WeaponId) => boolean;
  testScope: (weaponId?: WeaponId) => boolean;
  testInteract: (fixtureId?: string) => boolean;
  testUseAmenity: (kind?: AmenityPoint["kind"]) => boolean;
  testMiniMapVisibility: () => { front: boolean; behind: boolean; occluded: boolean };
}

