import type * as THREE from "three";
import type { Loadout, WeaponId } from "./weapons";
import type { PlayerCondition } from "./playerCondition";
import type { NetworkAction, NetworkInputState } from "./multiplayer/types";
import type { AvatarId } from "./characters";
import type { AmenityPoint, InteractableFixture, ParkLifeDetail, UpgradeStation, Vec2 } from "./types";
import type { InventoryItemId, LargeCarryItemId, WorldItemId } from "./items";

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

/** Gameplay state owned by the authoritative simulation for every player. */
export interface AuthoritativePlayerState extends PlayerRuntimeState {
  loadout: Loadout;
  condition: PlayerCondition;
  inventory: InventoryItemId[];
  carriedItem: LargeCarryItemId | null;
  skateboardMounted: boolean;
  isSprinting: boolean;
  lastShotAt: number;
  shotSequence: number;
  shotBloom: number;
  movementNoiseTimer: number;
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
  id: number;
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
  mountedByPlayerId: string | null;
  state: "available" | "flat-tyres" | "locked";
  requiredItem?: WorldItemId;
  linkedDetailId?: string;
  rackId?: string;
  vehicleKind?: "bike" | "maintenance-cart";
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

export interface NetworkRemotePlayer extends AuthoritativePlayerState {
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
  kills: number;
  loadout: Loadout;
  condition: PlayerCondition;
  input: NetworkInputState;
  pendingInputs: NetworkInputState[];
  pendingActions: NetworkAction[];
  lastProcessedInputSequence: number;
  lastProcessedActionSequence: number;
  lastInputAt: number;
  lastShotAt: number;
  shotSequence: number;
  shotFlashTimer: number;
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
  mountedBikeId: string | null;
  skateboardMounted: boolean;
  inventory: InventoryItemId[];
  carriedItem: LargeCarryItemId | null;
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
