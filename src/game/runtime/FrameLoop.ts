export interface FrameLoopTick {
  dt: number;
  timeMs: number;
  elapsedSeconds: number;
}

export class FrameLoop {
  private animationFrameId: number | null = null;
  private lastFrameTime: number | null = null;

  constructor(
    private readonly onTick: (tick: FrameLoopTick) => void,
    private readonly maxDt = 0.05
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

    const rawDt = this.lastFrameTime === null ? 0 : (timeMs - this.lastFrameTime) / 1000;
    const dt = Math.max(0, Math.min(this.maxDt, rawDt));
    this.lastFrameTime = timeMs;
    this.onTick({ dt, timeMs, elapsedSeconds: timeMs / 1000 });

    if (this.animationFrameId !== null) {
      this.animationFrameId = requestAnimationFrame(this.tick);
    }
  };
}
