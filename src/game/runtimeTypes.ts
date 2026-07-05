import type * as THREE from "three";
import type { Loadout, WeaponId } from "./weapons";
import type { PlayerCondition } from "./playerCondition";
import type { NetworkInputState } from "./multiplayer/types";
import type { AmenityPoint, InteractableFixture, ParkLifeDetail, UpgradeStation, Vec2 } from "./types";

export interface PlayerRuntimeState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  scrap: number;
  kills: number;
  height: number;
  heightTarget: number;
  jumpHeight: number;
  jumpVelocity: number;
  crouching: boolean;
  crouchAmount: number;
  activeFixtureId: string | null;
}

export interface AmenitySearch {
  amenity: AmenityPoint;
  remaining: number;
  duration: number;
  noiseTimer: number;
  noiseMultiplier: number;
}

export interface AmenityRest {
  amenity: AmenityPoint;
  remaining: number;
  duration: number;
  healthGain: number;
}

export interface ThrownDistraction {
  mesh: THREE.Mesh;
  position: Vec2;
  ttl: number;
  fuseTimer: number;
  pulseTimer: number;
  killer?: NetworkRemotePlayer;
}

export interface RideableBike {
  id: string;
  label: string;
  mesh: THREE.Group;
  position: THREE.Vector3;
  angle: number;
  mounted: boolean;
}

export interface NetworkRemotePlayer {
  id: string;
  name: string;
  mesh: THREE.Group;
  weaponIdRendered: WeaponId;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  scrap: number;
  loadout: Loadout;
  condition: PlayerCondition;
  input: NetworkInputState;
  lastInputAt: number;
  lastShotAt: number;
  shotBloom: number;
  movementNoiseTimer: number;
  isSprinting: boolean;
  crouching: boolean;
  crouchAmount: number;
  height: number;
  heightTarget: number;
  jumpHeight: number;
  jumpVelocity: number;
  activeFixtureId: string | null;
}

export interface CombatantRef {
  id: string;
  isLocal: boolean;
  remote?: NetworkRemotePlayer;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  crouching: boolean;
  crouchAmount: number;
  height: number;
  jumpHeight: number;
  activeFixtureId: string | null;
  condition: PlayerCondition;
  loadout: Loadout;
}

export type NearbyInteractable =
  | UpgradeStation
  | InteractableFixture
  | AmenityPoint
  | RideableBike
  | ParkLifeDetail
  | null;
