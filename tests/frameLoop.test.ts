import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameLoop } from "../src/game/runtime/FrameLoop";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

describe("FrameLoop", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
  });

  it("seeds timing from the first animation frame and never emits negative dt", () => {
    const callbacks: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    const ticks: number[] = [];
    const loop = new FrameLoop((tick) => ticks.push(tick.dt));
    loop.start();

    callbacks.shift()!(100);
    callbacks.shift()!(80);
    callbacks.shift()!(130);
    loop.stop();

    expect(ticks).toEqual([0, 0, 0.05]);
  });

  it("cancels the outstanding animation frame", () => {
    globalThis.requestAnimationFrame = vi.fn(() => 42);
    const cancel = vi.fn();
    globalThis.cancelAnimationFrame = cancel;

    const loop = new FrameLoop(() => undefined);
    loop.start();
    loop.stop();

    expect(cancel).toHaveBeenCalledWith(42);
    expect(loop.running).toBe(false);
  });
});
