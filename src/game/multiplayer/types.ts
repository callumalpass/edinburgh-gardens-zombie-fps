import type { GameStateName, WavePhase, ZombieAiState } from "../state";
import type { WeaponDrop } from "../state";
import type { Loadout, WeaponId } from "../weapons";
import type { ZombieType } from "../waves";

export type MultiplayerRole = "single" | "host" | "client";

export interface MultiplayerConfig {
  enabled: boolean;
  role: MultiplayerRole;
  serverUrl: string;
  roomId: string;
  playerName: string;
}

export interface NetworkInputState {
  sequence: number;
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
  | "toggleFlashlight"
  | "throwDistraction"
  | "jump"
  | "equipSlot";

export interface NetworkAction {
  type: NetworkActionType;
  sequence: number;
  yaw: number;
  pitch: number;
  slot?: number;
}

export interface NetworkPlayerSnapshot {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  scrap: number;
  stamina: number;
  bleedTimer: number;
  limpTimer: number;
  blurTimer: number;
  crouching: boolean;
  aim: boolean;
  height: number;
  jumpHeight: number;
  activeFixtureId: string | null;
  flashlightOn: boolean;
  throwables: number;
  loadout: Loadout;
  bikeMounted: boolean;
  alive: boolean;
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
  ttl: number;
  source: WeaponDrop["source"];
}

export interface NetworkBikeSnapshot {
  x: number;
  y: number;
  z: number;
  angle: number;
  mounted: boolean;
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
  bike: NetworkBikeSnapshot | null;
}

export interface ClientHelloMessage {
  kind: "hello";
  role: Exclude<MultiplayerRole, "single">;
  roomId: string;
  name: string;
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
