export type RenderQualityLevel = "low" | "medium" | "high";

export interface RenderQualitySettings {
  maxPixelRatio: number;
  grassFraction: number;
  mistFraction: number;
  shadowMapSize: number;
  shadowRadius: number;
  inkStrength: number;
  zombieFullDetailDistance: number;
  zombieRenderDistance: number;
  zombieShadowDistance: number;
  treeFullDetailDistance: number;
  treeRenderDistance: number;
}

export const RENDER_QUALITY_SETTINGS: Record<RenderQualityLevel, RenderQualitySettings> = {
  low: {
    maxPixelRatio: 1,
    grassFraction: 0.56,
    mistFraction: 0.42,
    shadowMapSize: 768,
    shadowRadius: 88,
    inkStrength: 0.72,
    zombieFullDetailDistance: 90,
    zombieRenderDistance: 210,
    zombieShadowDistance: 42,
    treeFullDetailDistance: 105,
    treeRenderDistance: 340
  },
  medium: {
    maxPixelRatio: 1.25,
    grassFraction: 0.78,
    mistFraction: 0.68,
    shadowMapSize: 1024,
    shadowRadius: 98,
    inkStrength: 0.86,
    zombieFullDetailDistance: 120,
    zombieRenderDistance: 255,
    zombieShadowDistance: 56,
    treeFullDetailDistance: 145,
    treeRenderDistance: 470
  },
  high: {
    maxPixelRatio: 1.5,
    grassFraction: 1,
    mistFraction: 1,
    shadowMapSize: 1536,
    shadowRadius: 108,
    inkStrength: 1,
    zombieFullDetailDistance: 155,
    zombieRenderDistance: 320,
    zombieShadowDistance: 72,
    treeFullDetailDistance: 185,
    treeRenderDistance: 620
  }
};

const LEVELS: readonly RenderQualityLevel[] = ["low", "medium", "high"];

export class AdaptiveRenderQuality {
  private smoothedFrameMs = 16.7;
  private slowSeconds = 0;
  private fastSeconds = 0;
  private warmupSeconds = 0;

  constructor(private level: RenderQualityLevel = "high") {}

  get current(): RenderQualityLevel {
    return this.level;
  }

  set(level: RenderQualityLevel): void {
    this.level = level;
    this.smoothedFrameMs = 16.7;
    this.slowSeconds = 0;
    this.fastSeconds = 0;
    this.warmupSeconds = 0;
  }

  update(dt: number): RenderQualityLevel | null {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.75) {
      return null;
    }

    const sampledDt = Math.min(dt, 0.05);
    this.warmupSeconds += sampledDt;
    const frameMs = Math.min(120, dt * 1000);
    this.smoothedFrameMs += (frameMs - this.smoothedFrameMs) * Math.min(1, sampledDt * 1.8);
    if (this.warmupSeconds < 3) {
      return null;
    }

    if (this.smoothedFrameMs > 20.5) {
      this.slowSeconds += sampledDt;
      this.fastSeconds = 0;
    } else if (this.smoothedFrameMs < 15.2) {
      this.fastSeconds += sampledDt;
      this.slowSeconds = Math.max(0, this.slowSeconds - sampledDt * 0.5);
    } else {
      this.slowSeconds = Math.max(0, this.slowSeconds - sampledDt * 0.35);
      this.fastSeconds = Math.max(0, this.fastSeconds - sampledDt * 0.35);
    }

    if (this.slowSeconds >= 2.5) {
      this.slowSeconds = 0;
      this.fastSeconds = 0;
      return this.step(-1);
    }
    if (this.fastSeconds >= 8) {
      this.slowSeconds = 0;
      this.fastSeconds = 0;
      return this.step(1);
    }
    return null;
  }

  private step(direction: -1 | 1): RenderQualityLevel | null {
    const currentIndex = LEVELS.indexOf(this.level);
    const nextIndex = Math.max(0, Math.min(LEVELS.length - 1, currentIndex + direction));
    const next = LEVELS[nextIndex];
    if (next === this.level) {
      return null;
    }
    this.level = next;
    return next;
  }
}
