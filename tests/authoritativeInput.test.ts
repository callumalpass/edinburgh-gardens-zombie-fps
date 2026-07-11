import { describe, expect, it } from "vitest";
import {
  consumeAuthoritativeInputBudget,
  queueAuthoritativeInput
} from "../src/game/multiplayer/authoritativeInput";
import type { NetworkInputState } from "../src/game/multiplayer/types";

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
  it("consumes queued simulation time once without exceeding the host frame budget", () => {
    const pending: NetworkInputState[] = [];
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      expect(queueAuthoritativeInput(pending, 0, input(sequence))).toBe(true);
    }

    const first = consumeAuthoritativeInputBudget(pending, 1 / 40);
    expect(first.map((slice) => [slice.input.sequence, slice.completedSequence])).toEqual([[1, 1], [2, null]]);
    expect(first[0]!.input.duration).toBeCloseTo(1 / 60);
    expect(first[1]!.input.duration).toBeCloseTo(1 / 120);
    expect(pending).toHaveLength(2);
    expect(pending[0]!.sequence).toBe(2);
    expect(pending[0]!.duration).toBeCloseTo(1 / 120);

    const second = consumeAuthoritativeInputBudget(pending, 1 / 40);
    expect(second.map((slice) => slice.completedSequence)).toEqual([2, 3]);
    expect(second.reduce((total, slice) => total + slice.input.duration, 0)).toBeCloseTo(1 / 40);
    expect(pending).toEqual([]);
  });

  it("rejects acknowledged inputs and keeps a bounded ordered queue", () => {
    const pending: NetworkInputState[] = [];
    expect(queueAuthoritativeInput(pending, 4, input(4))).toBe(false);
    expect(queueAuthoritativeInput(pending, 4, input(5))).toBe(true);
    expect(queueAuthoritativeInput(pending, 4, input(5))).toBe(false);
    expect(pending.map((candidate) => candidate.sequence)).toEqual([5]);
  });
});
