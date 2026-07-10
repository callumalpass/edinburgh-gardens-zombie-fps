import { WebSocketServer, WebSocket } from "ws";
import { pathToFileURL } from "node:url";

export function startMultiplayerRelay(options = {}) {
  const port = Number.parseInt(String(options.port ?? process.env.MULTIPLAYER_PORT ?? "5488"), 10);
  const host = String(options.host ?? process.env.MULTIPLAYER_HOST ?? "0.0.0.0");
  const logger = options.logger ?? console;
  const rooms = new Map();
  let nextPeerId = 1;
  const wss = new WebSocketServer({ host, port });

  const ready = new Promise((resolve, reject) => {
    wss.once("listening", () => {
      const address = wss.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      logger.log?.(`Edinburgh Gardens LAN relay listening on ws://${host}:${actualPort}`);
      resolve({
        host,
        port: actualPort,
        url: `ws://${host}:${actualPort}`
      });
    });
    wss.once("error", reject);
  });

  wss.on("connection", (socket, request) => {
    let peer = null;

    socket.on("message", (data) => {
      const message = parseMessage(data);
      if (!message) return;

      if (!peer) {
        if (message.kind !== "hello") {
          send(socket, { kind: "error", message: "Send hello before game messages." });
          return;
        }
        peer = registerPeer(rooms, () => nextPeerId++, socket, message, request.socket.remoteAddress ?? "unknown", logger);
        return;
      }

      if (message.kind === "ping") {
        send(socket, { kind: "pong", sentAt: message.sentAt });
        return;
      }

      const room = rooms.get(peer.roomId);
      if (!room) return;

      if (message.kind === "input" || message.kind === "action") {
        if (peer.role !== "client") return;
        const hostPeer = room.hostId ? room.peers.get(room.hostId) : null;
        if (!hostPeer) return;
        send(hostPeer.socket, {
          kind: message.kind,
          playerId: peer.id,
          [message.kind]: message[message.kind]
        });
        return;
      }

      if (message.kind === "snapshot") {
        if (peer.role !== "host") return;
        for (const candidate of room.peers.values()) {
          if (candidate.role === "client") {
            send(candidate.socket, { kind: "snapshot", snapshot: message.snapshot });
          }
        }
      }
    });

    socket.on("close", () => {
      if (!peer) return;
      unregisterPeer(rooms, peer, logger);
      peer = null;
    });
  });

  return {
    wss,
    ready,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function runCli() {
  const relay = startMultiplayerRelay();
  try {
    await relay.ready;
  } catch (error) {
    if (error && error.code === "EADDRINUSE") {
      console.error(`LAN relay port ${process.env.MULTIPLAYER_PORT ?? "5488"} is already in use. Set MULTIPLAYER_PORT to use a different port.`);
    } else {
      console.error("LAN relay failed:", error);
    }
    process.exitCode = 1;
  }
}

function registerPeer(rooms, nextPeerId, socket, hello, remoteAddress, logger) {
  const roomId = String(hello.roomId || "edinburgh-gardens");
  const role = hello.role === "host" ? "host" : "client";
  const room = getRoom(rooms, roomId);
  const id = `${role}-${nextPeerId()}`;
  const peer = {
    id,
    role,
    roomId,
    name: String(hello.name || id).slice(0, 32),
    avatarId: String(hello.avatarId || "milo").slice(0, 32),
    socket,
    remoteAddress
  };

  if (role === "host") {
    if (room.hostId && room.peers.has(room.hostId)) {
      send(socket, { kind: "error", message: `Room "${roomId}" already has a host.` });
      socket.close(1008, "room already has host");
      return peer;
    }
    room.hostId = id;
  }

  room.peers.set(id, peer);
  send(socket, { kind: "welcome", playerId: id, role, roomId });

  if (role === "client") {
    const hostPeer = room.hostId ? room.peers.get(room.hostId) : null;
    if (hostPeer) {
      send(hostPeer.socket, { kind: "peerJoined", playerId: id, name: peer.name, avatarId: peer.avatarId });
      send(socket, { kind: "status", message: `Joined LAN room "${roomId}".` });
    } else {
      send(socket, { kind: "status", message: `Waiting for a host in LAN room "${roomId}".` });
    }
  } else {
    send(socket, { kind: "status", message: `Hosting LAN room "${roomId}".` });
    for (const candidate of room.peers.values()) {
      if (candidate.role === "client") {
        send(socket, { kind: "peerJoined", playerId: candidate.id, name: candidate.name, avatarId: candidate.avatarId });
        send(candidate.socket, { kind: "status", message: `Host joined LAN room "${roomId}".` });
      }
    }
  }

  logger.log?.(`${role} ${id} joined room "${roomId}" from ${remoteAddress}`);
  return peer;
}

function unregisterPeer(rooms, peer, logger) {
  const room = rooms.get(peer.roomId);
  if (!room) return;
  room.peers.delete(peer.id);

  if (room.hostId === peer.id) {
    room.hostId = null;
    for (const candidate of room.peers.values()) {
      send(candidate.socket, { kind: "status", message: "LAN host disconnected." });
    }
  } else if (room.hostId) {
    const hostPeer = room.peers.get(room.hostId);
    if (hostPeer) {
      send(hostPeer.socket, { kind: "peerLeft", playerId: peer.id });
    }
  }

  if (room.peers.size === 0) {
    rooms.delete(peer.roomId);
  }
  logger.log?.(`${peer.role} ${peer.id} left room "${peer.roomId}"`);
}

function getRoom(rooms, roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = { hostId: null, peers: new Map() };
    rooms.set(roomId, room);
  }
  return room;
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseMessage(data) {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
