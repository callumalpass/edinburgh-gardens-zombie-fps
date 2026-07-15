import { describe, expect, it } from "vitest";
import {
  authoritativeInputSimulationBudget,
  consumeAuthoritativeInputBudget,
  queueAuthoritativeAction,
  takeReadyAuthoritativeActions,
  queueAuthoritativeInput
} from "../src/game/multiplayer/authoritativeInput";
import type { NetworkAction, NetworkInputState } from "../src/game/multiplayer/types";

const input = (sequence: number, moveZ = -1): NetworkInputState => ({
  sequence,
  duration: 1 / 60,
  moveX: 0,
  moveZ,
  sprint: true,
  crouch: false,
  aim: false,
  yaw: 0,
  pitch: 0
});

describe("authoritative input sampling", () => {
  it("consumes commands atomically so snapshots never expose partial input", () => {
    const pending: NetworkInputState[] = [];
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      expect(queueAuthoritativeInput(pending, 0, input(sequence))).toBe(true);
    }

    const first = consumeAuthoritativeInputBudget(pending, 1 / 40);
    expect(first.map((slice) => [slice.input.sequence, slice.completedSequence])).toEqual([[1, 1]]);
    expect(first[0]!.input.duration).toBeCloseTo(1 / 60);
    expect(pending).toHaveLength(2);
    expect(pending[0]!.sequence).toBe(2);
    expect(pending[0]!.duration).toBeCloseTo(1 / 60);

    const second = consumeAuthoritativeInputBudget(pending, 1 / 40);
    expect(second.map((slice) => slice.completedSequence)).toEqual([2]);
    const third = consumeAuthoritativeInputBudget(pending, 1 / 40);
    expect(third.map((slice) => slice.completedSequence)).toEqual([3]);
    expect(pending).toEqual([]);
  });

  it("allows one complete command to exceed a small host frame budget", () => {
    const pending = [input(1)];

    const slices = consumeAuthoritativeInputBudget(pending, 1 / 144);

    expect(slices).toHaveLength(1);
    expect(slices[0]!.input.duration).toBeCloseTo(1 / 60);
    expect(slices[0]!.completedSequence).toBe(1);
    expect(pending).toEqual([]);
  });

  it("rejects acknowledged inputs and keeps a bounded ordered queue", () => {
    const pending: NetworkInputState[] = [];
    expect(queueAuthoritativeInput(pending, 4, input(4))).toBe(false);
    expect(queueAuthoritativeInput(pending, 4, input(5))).toBe(true);
    expect(queueAuthoritativeInput(pending, 4, input(5))).toBe(false);
    expect(pending.map((candidate) => candidate.sequence)).toEqual([5]);
  });

  it("drains excess input backlog after a host renderer stall", () => {
    const pending = Array.from({ length: 30 }, (_, index) => input(index + 1));
    const normalFrame = 1 / 60;

    const catchupBudget = authoritativeInputSimulationBudget(pending, normalFrame);
    expect(catchupBudget).toBeCloseTo(normalFrame + 0.05);
    consumeAuthoritativeInputBudget(pending, catchupBudget);
    expect(pending.reduce((total, command) => total + command.duration, 0)).toBeCloseTo(0.5 - catchupBudget);

    for (let frame = 0; frame < 7; frame += 1) {
      const budget = authoritativeInputSimulationBudget(pending, normalFrame);
      consumeAuthoritativeInputBudget(pending, budget);
    }

    // New 60 Hz commands can now be consumed normally instead of sitting
    // behind a permanent half-second authority delay.
    expect(pending.reduce((total, command) => total + command.duration, 0)).toBeLessThanOrEqual(normalFrame + 0.000001);
  });

  it("does not accelerate an ordinary one-tick jitter buffer", () => {
    const pending = [input(1), input(2)];
    const budget = authoritativeInputSimulationBudget(pending, 1 / 60);

    expect(budget).toBeCloseTo(1 / 60);
  });

  it("holds actions until their referenced movement input is authoritative", () => {
    const pending: NetworkAction[] = [];
    expect(queueAuthoritativeAction(pending, 0, {
      type: "jump",
      sequence: 1,
      inputSequence: 3,
      yaw: 0,
      pitch: 0
    })).toBe(true);

    expect(takeReadyAuthoritativeActions(pending, 2)).toEqual([]);
    expect(takeReadyAuthoritativeActions(pending, 3).map((action) => action.sequence)).toEqual([1]);
    expect(pending).toEqual([]);
  });

  it("deduplicates queued actions and supports legacy actions without an input prerequisite", () => {
    const pending: NetworkAction[] = [];
    const action = { type: "take" as const, sequence: 4, yaw: 0, pitch: 0 };
    expect(queueAuthoritativeAction(pending, 3, action)).toBe(true);
    expect(queueAuthoritativeAction(pending, 3, action)).toBe(false);
    expect(takeReadyAuthoritativeActions(pending, 0)).toEqual([action]);
    expect(queueAuthoritativeAction(pending, 4, action)).toBe(false);
  });
});
