import type { GameStateName, WavePhase, ZombieAiState } from "../state";
import type { WeaponDrop } from "../state";
import type { Loadout, UpgradeId, WeaponId } from "../weapons";
import type { ZombieType } from "../waves";
import type { AvatarId } from "../characters";
import type { InventoryItemId, LargeCarryItemId, WorldItemId } from "../items";

export type MultiplayerRole = "single" | "host" | "client";

export interface MultiplayerConfig {
  enabled: boolean;
  role: MultiplayerRole;
  serverUrl: string;
  roomId: string;
  playerName: string;
  avatarId: AvatarId;
}

export interface NetworkInputState {
  sequence: number;
  duration: number;
  moveX: number;
  moveZ: number;
  sprint: boolean;
  crouch: boolean;
  aim: boolean;
  yaw: number;
  pitch: number;
}

export type NetworkActionType =
  | "shoot"
  | "reload"
  | "interact"
  | "take"
  | "toggleFlashlight"
  | "throwDistraction"
  | "dropItem"
  | "jump"
  | "toggleSkateboard"
  | "equipSlot"
  | "chooseIntermissionUpgrade";

export interface NetworkAction {
  type: NetworkActionType;
  sequence: number;
  yaw: number;
  pitch: number;
  slot?: number;
  upgradeId?: UpgradeId;
}

export interface NetworkPlayerSnapshot {
  id: string;
  name: string;
  avatarId: AvatarId;
  lastProcessedInputSequence: number;
  lastProcessedActionSequence: number;
  shotSequence: number;
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  yaw: number;
  pitch: number;
  health: number;
  scrap: number;
  stamina: number;
  hydration: number;
  bleedTimer: number;
  limpTimer: number;
  blurTimer: number;
  bikePumpTimer: number;
  crouching: boolean;
  aim: boolean;
  moveSpeed: number;
  sprinting: boolean;
  height: number;
  jumpHeight: number;
  activeFixtureId: string | null;
  flashlightOn: boolean;
  throwables: number;
  inventory: InventoryItemId[];
  carriedItem: LargeCarryItemId | null;
  loadout: Loadout;
  bikeMounted: boolean;
  skateboardMounted: boolean;
  alive: boolean;
  intermissionUpgradeWave: number;
  reviveProtectionTimer: number;
}

export interface NetworkZombieSnapshot {
  id: number;
  type: ZombieType;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  health: number;
  maxHealth: number;
  radius: number;
  aiState: ZombieAiState;
  role?: "caretaker";
}

export interface NetworkPickupSnapshot {
  id: number;
  type: "scrap" | "health" | "ammo";
  amount: number;
  x: number;
  y: number;
  z: number;
  ttl: number;
}

export interface NetworkWeaponDropSnapshot {
  id: number;
  weaponId: WeaponId;
  label: string;
  x: number;
  y: number;
  z: number;
  /** Null represents a permanent world cache; JSON cannot preserve Infinity. */
  ttl: number | null;
  source: WeaponDrop["source"];
}

export interface NetworkBikeSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  angle: number;
  mounted: boolean;
  mountedByPlayerId: string | null;
  state: "available" | "flat-tyres" | "locked";
  requiredItem?: WorldItemId;
  vehicleKind?: "bike" | "maintenance-cart";
}

export interface NetworkWorldItemSnapshot {
  id: number;
  itemId: WorldItemId;
  label: string;
  x: number;
  y: number;
  z: number;
  angle: number;
  ttl: number | null;
}

export interface NetworkPlacedLadderSnapshot {
  id: string;
  fixtureId: string;
  accessX: number;
  accessZ: number;
  landingX: number;
  landingZ: number;
  angle: number;
}

export interface NetworkDistractionSnapshot {
  id: number;
  x: number;
  z: number;
  ttl: number;
  fuseTimer: number;
}

export interface NetworkGameSnapshot {
  frame: number;
  sentAt: number;
  roomId: string;
  hostId: string;
  state: GameStateName;
  wave: number;
  wavePhase: WavePhase;
  intermissionTimer: number;
  remainingSpawns: number;
  players: NetworkPlayerSnapshot[];
  zombies: NetworkZombieSnapshot[];
  pickups: NetworkPickupSnapshot[];
  weaponDrops: NetworkWeaponDropSnapshot[];
  worldItems: NetworkWorldItemSnapshot[];
  placedLadders: NetworkPlacedLadderSnapshot[];
  distractions: NetworkDistractionSnapshot[];
  searchedAmenityIds: string[];
  repairedBrokenBikeIds: string[];
  bike: NetworkBikeSnapshot | null;
  bikes?: NetworkBikeSnapshot[];
  rescueScenario?: {
    phase: string;
    caretakerZombieId: number | null;
    caretakerSpawned: boolean;
    keyDropped: boolean;
    dogFreed: boolean;
    cartRepaired: boolean;
    unlockedGateIds: string[];
    barricades: Array<{
      id: string;
      x: number;
      z: number;
      angle: number;
      health: number;
      destroyed: boolean;
      grabbedBy: string | null;
    }>;
  };
}

export interface ClientHelloMessage {
  kind: "hello";
  role: Exclude<MultiplayerRole, "single">;
  roomId: string;
  name: string;
  avatarId: AvatarId;
}

export interface ClientInputMessage {
  kind: "input";
  input: NetworkInputState;
}

export interface ClientActionMessage {
  kind: "action";
  action: NetworkAction;
}

export interface ClientSnapshotMessage {
  kind: "snapshot";
  snapshot: NetworkGameSnapshot;
}

export interface ClientPingMessage {
  kind: "ping";
  sentAt: number;
}

export type ClientToRelayMessage =
  | ClientHelloMessage
  | ClientInputMessage
  | ClientActionMessage
  | ClientSnapshotMessage
  | ClientPingMessage;

export interface RelayWelcomeMessage {
  kind: "welcome";
  playerId: string;
  role: Exclude<MultiplayerRole, "single">;
  roomId: string;
}

export interface RelayPeerJoinedMessage {
  kind: "peerJoined";
  playerId: string;
  name: string;
  avatarId: AvatarId;
}

export interface RelayPeerLeftMessage {
  kind: "peerLeft";
  playerId: string;
}

export interface RelayInputMessage {
  kind: "input";
  playerId: string;
  input: NetworkInputState;
}

export interface RelayActionMessage {
  kind: "action";
  playerId: string;
  action: NetworkAction;
}

export interface RelaySnapshotMessage {
  kind: "snapshot";
  snapshot: NetworkGameSnapshot;
}

export interface RelayStatusMessage {
  kind: "status";
  message: string;
}

export interface RelayErrorMessage {
  kind: "error";
  message: string;
}

export interface RelayPongMessage {
  kind: "pong";
  sentAt: number;
}

export type RelayToClientMessage =
  | RelayWelcomeMessage
  | RelayPeerJoinedMessage
  | RelayPeerLeftMessage
  | RelayInputMessage
  | RelayActionMessage
  | RelaySnapshotMessage
  | RelayStatusMessage
  | RelayErrorMessage
  | RelayPongMessage;
