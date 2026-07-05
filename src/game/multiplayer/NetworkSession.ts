import { NETWORK_INPUT_HZ, NETWORK_SNAPSHOT_HZ } from "../gameConfig";
import type { GameStateName, WavePhase } from "../state";
import { LanMultiplayerClient, multiplayerConfigFromLocation } from "./LanMultiplayerClient";
import type {
  MultiplayerConfig,
  NetworkAction,
  NetworkGameSnapshot,
  NetworkInputState,
  RelayActionMessage,
  RelayInputMessage,
  RelayPeerJoinedMessage,
  RelayPeerLeftMessage,
  RelaySnapshotMessage,
  RelayStatusMessage,
  RelayWelcomeMessage
} from "./types";

export type NetworkInputFrame = Omit<NetworkInputState, "sequence">;

type NetworkTransportHandlers = {
  welcome: (message: RelayWelcomeMessage) => void;
  peerJoined: (message: RelayPeerJoinedMessage) => void;
  peerLeft: (message: RelayPeerLeftMessage) => void;
  input: (message: RelayInputMessage) => void;
  action: (message: RelayActionMessage) => void;
  snapshot: (message: RelaySnapshotMessage) => void;
  status: (message: RelayStatusMessage["message"]) => void;
};

export interface NetworkTransport {
  readonly connected: boolean;
  on<K extends keyof NetworkTransportHandlers>(kind: K, handler: NetworkTransportHandlers[K]): void;
  connect(): void;
  close(): void;
  sendInput(input: NetworkInputState): void;
  sendAction(action: NetworkAction): void;
  sendSnapshot(snapshot: NetworkGameSnapshot): void;
}

export interface NetworkSessionHandlers {
  status: (message: string) => void;
  peerJoined: (playerId: string, name: string) => void;
  peerLeft: (playerId: string) => void;
  input: (playerId: string, input: NetworkInputState) => void;
  action: (playerId: string, action: NetworkAction) => void;
  snapshot: (snapshot: NetworkGameSnapshot) => void;
}

export interface NetworkSessionOptions {
  createClient?: (config: MultiplayerConfig) => NetworkTransport;
  inputHz?: number;
  snapshotHz?: number;
}

export class NetworkSession {
  private readonly createClient: (config: MultiplayerConfig) => NetworkTransport;
  private readonly inputHz: number;
  private readonly snapshotHz: number;
  private client: NetworkTransport | null = null;
  private localPlayerId = "local";
  private inputSequence = 0;
  private actionSequence = 0;
  private inputTimer = 0;
  private snapshotTimer = 0;
  private networkRemainingSpawns = 0;
  private networkWaveValue = 1;
  private networkWavePhaseValue: WavePhase = "active";
  private networkIntermissionTimerValue = 0;

  constructor(readonly config: MultiplayerConfig = multiplayerConfigFromLocation(), options: NetworkSessionOptions = {}) {
    this.createClient = options.createClient ?? ((clientConfig) => new LanMultiplayerClient(clientConfig));
    this.inputHz = options.inputHz ?? NETWORK_INPUT_HZ;
    this.snapshotHz = options.snapshotHz ?? NETWORK_SNAPSHOT_HZ;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  get connected(): boolean {
    return this.client?.connected === true;
  }

  get isHost(): boolean {
    return this.config.enabled && this.config.role === "host";
  }

  get isClient(): boolean {
    return this.config.enabled && this.config.role === "client";
  }

  get localId(): string {
    return this.localPlayerId;
  }

  get wave(): number {
    return this.networkWaveValue;
  }

  get wavePhase(): WavePhase {
    return this.networkWavePhaseValue;
  }

  get intermissionTimer(): number {
    return this.networkIntermissionTimerValue;
  }

  get remainingSpawns(): number {
    return this.networkRemainingSpawns;
  }

  connect(handlers: NetworkSessionHandlers, options: { disabled?: boolean } = {}): boolean {
    if (!this.config.enabled || options.disabled) {
      return false;
    }

    this.client = this.createClient(this.config);
    this.client.on("welcome", (message) => {
      this.localPlayerId = message.playerId;
      handlers.status(message.role === "host" ? "LAN host ready" : "Joined LAN game");
    });
    this.client.on("status", (message) => handlers.status(message));
    this.client.on("peerJoined", (message) => {
      if (this.isHost) {
        handlers.peerJoined(message.playerId, message.name);
      }
    });
    this.client.on("peerLeft", (message) => handlers.peerLeft(message.playerId));
    this.client.on("input", (message) => {
      if (this.isHost) {
        handlers.input(message.playerId, message.input);
      }
    });
    this.client.on("action", (message) => {
      if (this.isHost) {
        handlers.action(message.playerId, message.action);
      }
    });
    this.client.on("snapshot", (message) => {
      if (this.isClient) {
        handlers.snapshot(message.snapshot);
      }
    });

    handlers.status(this.isClient ? "Connecting to LAN host" : "Starting LAN host");
    this.client.connect();
    return true;
  }

  close(): void {
    this.client?.close();
    this.client = null;
  }

  sendAction(type: NetworkAction["type"], frame: { yaw: number; pitch: number; slot?: number }): boolean {
    if (!this.isClient || !this.client) {
      return false;
    }
    this.client.sendAction({
      type,
      slot: frame.slot,
      sequence: ++this.actionSequence,
      yaw: frame.yaw,
      pitch: frame.pitch
    });
    return true;
  }

  sendInputFrame(dt: number, state: GameStateName, frame: NetworkInputFrame): boolean {
    if (!this.isClient || !this.client || state !== "playing") {
      return false;
    }
    this.inputTimer -= dt;
    if (this.inputTimer > 0) {
      return false;
    }
    this.client.sendInput({
      sequence: ++this.inputSequence,
      ...frame
    });
    this.inputTimer = 1 / this.inputHz;
    return true;
  }

  sendSnapshotFrame(dt: number, buildSnapshot: () => NetworkGameSnapshot): boolean {
    if (!this.isHost || !this.connected || !this.client) {
      return false;
    }
    this.snapshotTimer -= dt;
    if (this.snapshotTimer > 0) {
      return false;
    }
    this.client.sendSnapshot(buildSnapshot());
    this.snapshotTimer = 1 / this.snapshotHz;
    return true;
  }

  sendSnapshot(snapshot: NetworkGameSnapshot): boolean {
    if (!this.isHost || !this.connected || !this.client) {
      return false;
    }
    this.client.sendSnapshot(snapshot);
    return true;
  }

  acceptSnapshot(snapshot: NetworkGameSnapshot): boolean {
    if (snapshot.roomId !== this.config.roomId) {
      return false;
    }
    this.networkWaveValue = snapshot.wave;
    this.networkWavePhaseValue = snapshot.wavePhase;
    this.networkIntermissionTimerValue = snapshot.intermissionTimer;
    this.networkRemainingSpawns = snapshot.remainingSpawns;
    return true;
  }
}
