import type { WebSocketServer } from "ws";

export interface MultiplayerRelay {
  wss: WebSocketServer;
  ready: Promise<{ host: string; port: number; url: string }>;
  close(): Promise<void>;
}

export function startMultiplayerRelay(options?: {
  host?: string;
  port?: number;
  logger?: Pick<Console, "log">;
}): MultiplayerRelay;
