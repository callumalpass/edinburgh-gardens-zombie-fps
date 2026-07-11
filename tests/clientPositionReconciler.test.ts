import { describe, expect, it } from "vitest";
import { ClientPositionReconciler } from "../src/game/multiplayer/ClientPositionReconciler";

describe("ClientPositionReconciler", () => {
  const input = (sequence: number) => ({
    sequence,
    duration: 1 / 30,
    moveX: 0,
    moveZ: -1,
    sprint: false,
    crouch: false,
    aim: false,
    yaw: 0,
    pitch: 0
  });

  it("returns only commands that the host has not acknowledged", () => {
    const reconciler = new ClientPositionReconciler();
    reconciler.record(input(1));
    reconciler.record(input(2));
    reconciler.record(input(3));

    expect(reconciler.acknowledge(1).map((command) => command.sequence)).toEqual([2, 3]);
    expect(reconciler.acknowledge(2).map((command) => command.sequence)).toEqual([3]);
  });

  it("ignores stale acknowledgements and does not reintroduce processed commands", () => {
    const reconciler = new ClientPositionReconciler();
    reconciler.record(input(1));
    reconciler.record(input(2));
    expect(reconciler.acknowledge(2)).toEqual([]);

    reconciler.record(input(1));
    reconciler.record(input(3));
    expect(reconciler.acknowledge(1).map((command) => command.sequence)).toEqual([3]);
  });
});
