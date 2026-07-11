import { describe, expect, it } from "vitest";
import {
  consumeLatestAuthoritativeInput,
  inputForAuthoritativeFrame,
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
  it("collapses a delayed packet burst to the newest state instead of fast-forwarding it", () => {
    const pending: NetworkInputState[] = [];
    for (let sequence = 1; sequence <= 20; sequence += 1) {
      expect(queueAuthoritativeInput(pending, 0, input(sequence))).toBe(true);
    }

    const latest = consumeLatestAuthoritativeInput(pending);
    expect(latest?.sequence).toBe(20);
    expect(pending).toEqual([]);
  });

  it("rejects acknowledged inputs and neutralizes a stale held key", () => {
    const pending: NetworkInputState[] = [];
    expect(queueAuthoritativeInput(pending, 4, input(4))).toBe(false);
    expect(queueAuthoritativeInput(pending, 4, input(5))).toBe(true);

    const active = inputForAuthoritativeFrame(input(5), 10, 10.2);
    const stale = inputForAuthoritativeFrame(input(5), 10, 10.31);
    expect(active.sprint).toBe(true);
    expect(stale).toMatchObject({ moveX: 0, moveZ: 0, sprint: false, aim: false });
  });
});
