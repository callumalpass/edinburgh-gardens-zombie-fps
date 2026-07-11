export interface FrameLoopTick {
  dt: number;
  rawDt: number;
  timeMs: number;
  elapsedSeconds: number;
}

export class FrameLoop {
  private animationFrameId: number | null = null;
  private lastFrameTime: number | null = null;

  constructor(
    private readonly onTick: (tick: FrameLoopTick) => void,
    // World/render systems receive a bounded step. rawDt is also exposed so
    // role-agnostic player simulation can retain more elapsed time and safely
    // substep it without passing a large collision step to the rest of the game.
    private readonly maxDt = 0.1
  ) {}

  get running(): boolean {
    return this.animationFrameId !== null;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.lastFrameTime = null;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.animationFrameId === null) {
      return;
    }
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  private readonly tick = (timeMs: number): void => {
    if (this.animationFrameId === null) {
      return;
    }

    const rawDt = Math.max(0, this.lastFrameTime === null ? 0 : (timeMs - this.lastFrameTime) / 1000);
    const dt = Math.min(this.maxDt, rawDt);
    this.lastFrameTime = timeMs;
    this.onTick({ dt, rawDt, timeMs, elapsedSeconds: timeMs / 1000 });

    if (this.animationFrameId !== null) {
      this.animationFrameId = requestAnimationFrame(this.tick);
    }
  };
}
