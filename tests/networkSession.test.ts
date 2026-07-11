import { describe, expect, it } from "vitest";
import { NetworkSession, type NetworkInputFrame, type NetworkTransport } from "../src/game/multiplayer/NetworkSession";
import type { MultiplayerConfig, NetworkAction, NetworkGameSnapshot, NetworkInputState } from "../src/game/multiplayer/types";

class FakeTransport {
  connected = true;
  readonly inputs: NetworkInputState[] = [];
  readonly actions: NetworkAction[] = [];
  readonly snapshots: NetworkGameSnapshot[] = [];
  connectCalls = 0;
  closeCalls = 0;
  private readonly handlers = new Map<string, (message: unknown) => void>();

  on(kind: string, handler: (message: never) => void): void {
    this.handlers.set(kind, handler as (message: unknown) => void);
  }

  connect(): void {
    this.connectCalls += 1;
  }

  close(): void {
    this.closeCalls += 1;
    this.connected = false;
  }

  sendInput(input: NetworkInputState): void {
    this.inputs.push(input);
  }

  sendAction(action: NetworkAction): void {
    this.actions.push(action);
  }

  sendSnapshot(snapshot: NetworkGameSnapshot): void {
    this.snapshots.push(snapshot);
  }

  emit(kind: string, message: unknown): void {
    this.handlers.get(kind)?.(message);
  }
}

const clientConfig: MultiplayerConfig = {
  enabled: true,
  role: "client",
  serverUrl: "ws://localhost:5488",
  roomId: "test-room",
  playerName: "Client",
  avatarId: "asha"
};

const inputFrame: NetworkInputFrame = {
  moveX: 0.5,
  moveZ: -1,
  sprint: true,
  crouch: false,
  aim: true,
  yaw: 1.25,
  pitch: -0.1
};

function createSnapshot(roomId = "test-room"): NetworkGameSnapshot {
  return {
    frame: 12,
    sentAt: 100,
    roomId,
    hostId: "host",
    state: "playing",
    wave: 4,
    wavePhase: "intermission",
    intermissionTimer: 8,
    remainingSpawns: 3,
    players: [],
    zombies: [],
    pickups: [],
    weaponDrops: [],
    worldItems: [],
    placedLadders: [],
    distractions: [],
    searchedAmenityIds: [],
    repairedBrokenBikeIds: [],
    bike: null
  };
}

function handlers() {
  const observed = {
    statuses: [] as string[],
    joined: [] as Array<{ playerId: string; avatarId: string }>,
    left: [] as string[],
    inputs: [] as NetworkInputState[],
    actions: [] as NetworkAction[],
    snapshots: [] as NetworkGameSnapshot[]
  };
  return {
    ...observed,
    callbacks: {
      status: (message: string) => observed.statuses.push(message),
      peerJoined: (playerId: string, _name: string, avatarId: MultiplayerConfig["avatarId"]) => observed.joined.push({ playerId, avatarId }),
      peerLeft: (playerId: string) => observed.left.push(playerId),
      input: (_playerId: string, input: NetworkInputState) => observed.inputs.push(input),
      action: (_playerId: string, action: NetworkAction) => observed.actions.push(action),
      snapshot: (snapshot: NetworkGameSnapshot) => observed.snapshots.push(snapshot)
    }
  };
}

describe("NetworkSession", () => {
  it("does not create a transport when multiplayer is disabled or smoke-disabled", () => {
    let created = 0;
    const disabled = new NetworkSession(
      { ...clientConfig, enabled: false, role: "single" },
      { createClient: () => {
        created += 1;
        return new FakeTransport() as unknown as NetworkTransport;
      } }
    );

    expect(disabled.connect(handlers().callbacks)).toBe(false);
    expect(created).toBe(0);

    const smokeDisabled = new NetworkSession(clientConfig, {
      createClient: () => {
        created += 1;
        return new FakeTransport() as unknown as NetworkTransport;
      }
    });

    expect(smokeDisabled.connect(handlers().callbacks, { disabled: true })).toBe(false);
    expect(created).toBe(0);
  });

  it("sequences client actions and throttles input frames", () => {
    const transport = new FakeTransport();
    const observed = handlers();
    const session = new NetworkSession(clientConfig, {
      createClient: () => transport as unknown as NetworkTransport,
      inputHz: 2
    });

    expect(session.connect(observed.callbacks)).toBe(true);
    transport.emit("welcome", { kind: "welcome", playerId: "client-1", role: "client", roomId: "test-room" });

    expect(session.localId).toBe("client-1");
    expect(observed.statuses).toEqual(["Connecting to LAN host", "Joined LAN game"]);
    expect(session.sendAction("jump", { yaw: 1, pitch: -0.2 })).toBe(true);
    expect(session.sendAction("equipSlot", { yaw: 1, pitch: -0.2, slot: 2 })).toBe(true);
    expect(session.sendAction("take", { yaw: 1, pitch: -0.2 })).toBe(true);
    expect(session.sendAction("chooseIntermissionUpgrade", { yaw: 1, pitch: -0.2, upgradeId: "damage" })).toBe(true);
    expect(transport.actions.map((action) => [action.type, action.sequence, action.slot, action.upgradeId])).toEqual([
      ["jump", 1, undefined, undefined],
      ["equipSlot", 2, 2, undefined],
      ["take", 3, undefined, undefined],
      ["chooseIntermissionUpgrade", 4, undefined, "damage"]
    ]);

    expect(session.sendInputFrame(1, "playing", inputFrame)?.sequence).toBe(1);
    expect(session.sendInputFrame(0.1, "playing", inputFrame)).toBeNull();
    expect(session.pendingPredictionFrame(inputFrame)).toMatchObject({ sequence: 2, duration: 0.1 });
    expect(session.sendInputFrame(0.4, "playing", inputFrame)?.sequence).toBe(2);
    expect(session.sendInputFrame(1, "ready", inputFrame)).toBeNull();
    expect(session.pendingPredictionFrame(inputFrame)).toBeNull();
    expect(transport.inputs.map((input) => input.sequence)).toEqual([1, 2]);
    expect(transport.inputs.map((input) => input.duration)).toEqual([0.25, 0.25]);
  });

  it("routes host events and sends authoritative snapshots on cadence", () => {
    const transport = new FakeTransport();
    const observed = handlers();
    const session = new NetworkSession(
      { ...clientConfig, role: "host", playerName: "Host" },
      {
        createClient: () => transport as unknown as NetworkTransport,
        snapshotHz: 2
      }
    );

    expect(session.connect(observed.callbacks)).toBe(true);
    transport.emit("welcome", { kind: "welcome", playerId: "host-1", role: "host", roomId: "test-room" });
    transport.emit("peerJoined", { kind: "peerJoined", playerId: "peer-1", name: "Peer", avatarId: "jules" });
    transport.emit("input", { kind: "input", playerId: "peer-1", input: { sequence: 1, ...inputFrame } });
    transport.emit("action", { kind: "action", playerId: "peer-1", action: { type: "shoot", sequence: 1, yaw: 0, pitch: 0 } });
    transport.emit("snapshot", { kind: "snapshot", snapshot: createSnapshot() });

    expect(observed.statuses).toEqual(["Starting LAN host", "LAN host ready"]);
    expect(observed.joined).toEqual([{ playerId: "peer-1", avatarId: "jules" }]);
    expect(observed.inputs).toHaveLength(1);
    expect(observed.actions.map((action) => action.type)).toEqual(["shoot"]);
    expect(observed.snapshots).toEqual([]);

    expect(session.sendSnapshotFrame(1, () => createSnapshot())).toBe(true);
    expect(session.sendSnapshotFrame(0.1, () => createSnapshot())).toBe(false);
    expect(session.sendSnapshot(createSnapshot())).toBe(true);
    expect(transport.snapshots).toHaveLength(2);
  });

  it("accepts only matching room snapshots into replicated wave state", () => {
    const session = new NetworkSession(clientConfig);

    expect(session.acceptSnapshot(createSnapshot("other-room"))).toBe(false);
    expect(session.wave).toBe(1);

    expect(session.acceptSnapshot(createSnapshot("test-room"))).toBe(true);
    expect(session.wave).toBe(4);
    expect(session.wavePhase).toBe("intermission");
    expect(session.intermissionTimer).toBe(8);
    expect(session.remainingSpawns).toBe(3);
  });

  it("preserves cadence overshoot at common render frame rates", () => {
    const transport = new FakeTransport();
    const session = new NetworkSession(
      { ...clientConfig, role: "host", playerName: "Host" },
      { createClient: () => transport as unknown as NetworkTransport, snapshotHz: 18 }
    );
    session.connect(handlers().callbacks);
    session.sendSnapshotFrame(0, () => createSnapshot());
    transport.snapshots.length = 0;

    for (let frame = 0; frame < 60; frame += 1) {
      session.sendSnapshotFrame(1 / 60, () => createSnapshot());
    }

    expect(transport.snapshots).toHaveLength(18);
  });
});
