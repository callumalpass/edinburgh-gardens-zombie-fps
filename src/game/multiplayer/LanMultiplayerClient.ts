import type {
  ClientToRelayMessage,
  MultiplayerConfig,
  MultiplayerRole,
  NetworkAction,
  NetworkGameSnapshot,
  NetworkInputState,
  RelayActionMessage,
  RelayInputMessage,
  RelayPeerJoinedMessage,
  RelayPeerLeftMessage,
  RelaySnapshotMessage,
  RelayToClientMessage,
  RelayWelcomeMessage
} from "./types";

type MultiplayerHandlers = {
  welcome?: (message: RelayWelcomeMessage) => void;
  peerJoined?: (message: RelayPeerJoinedMessage) => void;
  peerLeft?: (message: RelayPeerLeftMessage) => void;
  input?: (message: RelayInputMessage) => void;
  action?: (message: RelayActionMessage) => void;
  snapshot?: (message: RelaySnapshotMessage) => void;
  status?: (message: string) => void;
};

export class LanMultiplayerClient {
  private socket: WebSocket | null = null;
  private heartbeatId: number | null = null;
  private readonly handlers: MultiplayerHandlers = {};

  constructor(readonly config: MultiplayerConfig) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  on<K extends keyof MultiplayerHandlers>(kind: K, handler: NonNullable<MultiplayerHandlers[K]>): void {
    this.handlers[kind] = handler;
  }

  connect(): void {
    if (!this.config.enabled || this.config.role === "single") {
      return;
    }
    const role = this.config.role;
    this.close();
    this.socket = new WebSocket(this.config.serverUrl);
    this.socket.addEventListener("open", () => {
      this.send({
        kind: "hello",
        role,
        roomId: this.config.roomId,
        name: this.config.playerName
      });
      this.handlers.status?.(`LAN ${role} connected to ${this.config.serverUrl}`);
      this.heartbeatId = window.setInterval(() => {
        this.send({ kind: "ping", sentAt: performance.now() });
      }, 5000);
    });
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
    this.socket.addEventListener("close", () => {
      this.handlers.status?.("LAN relay disconnected");
      this.clearHeartbeat();
    });
    this.socket.addEventListener("error", () => {
      this.handlers.status?.("LAN relay connection failed");
    });
  }

  close(): void {
    this.clearHeartbeat();
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close();
    }
    this.socket = null;
  }

  sendInput(input: NetworkInputState): void {
    this.send({ kind: "input", input });
  }

  sendAction(action: NetworkAction): void {
    this.send({ kind: "action", action });
  }

  sendSnapshot(snapshot: NetworkGameSnapshot): void {
    this.send({ kind: "snapshot", snapshot });
  }

  private send(message: ClientToRelayMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }

    let message: RelayToClientMessage;
    try {
      message = JSON.parse(raw) as RelayToClientMessage;
    } catch {
      return;
    }

    if (message.kind === "welcome") this.handlers.welcome?.(message);
    if (message.kind === "peerJoined") this.handlers.peerJoined?.(message);
    if (message.kind === "peerLeft") this.handlers.peerLeft?.(message);
    if (message.kind === "input") this.handlers.input?.(message);
    if (message.kind === "action") this.handlers.action?.(message);
    if (message.kind === "snapshot") this.handlers.snapshot?.(message);
    if (message.kind === "status") this.handlers.status?.(message.message);
    if (message.kind === "error") this.handlers.status?.(message.message);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatId !== null) {
      window.clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
  }
}

export function multiplayerConfigFromLocation(location: Location = window.location): MultiplayerConfig {
  const params = new URLSearchParams(location.search);
  const lanParam = params.get("lan") ?? params.get("multiplayer");
  const role = normalizeRole(lanParam);
  const enabled = role === "host" || role === "client";
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const defaultServer = `${protocol}://${location.hostname || "127.0.0.1"}:5488`;
  const rawName = params.get("name")?.trim();
  const playerName = rawName || (role === "host" ? "Host" : `Player ${Math.floor(Math.random() * 900 + 100)}`);

  return {
    enabled,
    role,
    serverUrl: params.get("server") || defaultServer,
    roomId: params.get("room") || "edinburgh-gardens",
    playerName
  };
}

function normalizeRole(value: string | null): MultiplayerRole {
  if (value === "host") return "host";
  if (value === "join" || value === "client") return "client";
  return "single";
}
