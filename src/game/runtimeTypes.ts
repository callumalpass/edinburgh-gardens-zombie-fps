import type * as THREE from "three";
import type { Loadout, WeaponId } from "./weapons";
import type { PlayerCondition } from "./playerCondition";
import type { NetworkInputState } from "./multiplayer/types";
import type { AvatarId } from "./characters";
import type { AmenityPoint, InteractableFixture, ParkLifeDetail, UpgradeStation, Vec2 } from "./types";
import type { WorldItemId } from "./items";

export interface PlayerRuntimeState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  scrap: number;
  kills: number;
  intermissionUpgradeWave: number;
  reviveProtectionTimer: number;
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
  state: "available" | "flat-tyres" | "locked";
  requiredItem?: WorldItemId;
  linkedDetailId?: string;
  rackId?: string;
}

export interface DroppedWorldItem {
  id: number;
  itemId: WorldItemId;
  label: string;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  angle: number;
  ttl: number;
}

export interface PlacedLadder {
  id: string;
  fixtureId: string;
  mesh: THREE.Object3D;
  accessPosition: Vec2;
  landingPosition: Vec2;
  angle: number;
}

export interface NetworkRemotePlayer {
  id: string;
  name: string;
  avatarId: AvatarId;
  mesh: THREE.Group;
  avatarVisual: THREE.Group | null;
  animationMixer: THREE.AnimationMixer | null;
  animationActions: Map<string, THREE.AnimationAction>;
  activeAnimation: string;
  animationOverride: { name: string; remaining: number } | null;
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
  intermissionUpgradeWave: number;
  reviveProtectionTimer: number;
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
  reviveProtectionTimer: number;
  condition: PlayerCondition;
  loadout: Loadout;
}

export type NearbyInteractable =
  | UpgradeStation
  | InteractableFixture
  | AmenityPoint
  | RideableBike
  | DroppedWorldItem
  | ParkLifeDetail
  | null;
