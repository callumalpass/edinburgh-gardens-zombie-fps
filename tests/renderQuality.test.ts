import { describe, expect, it } from "vitest";
import { AdaptiveRenderQuality, RENDER_QUALITY_SETTINGS } from "../src/game/rendering/renderQuality";

describe("AdaptiveRenderQuality", () => {
  it("steps down after sustained slow frames instead of reacting to one spike", () => {
    const quality = new AdaptiveRenderQuality("high");
    expect(quality.update(0.08)).toBeNull();
    expect(quality.current).toBe("high");

    let changed = null;
    for (let index = 0; index < 240 && !changed; index += 1) {
      changed = quality.update(1 / 30);
    }
    expect(changed).toBe("medium");
    expect(quality.current).toBe("medium");
  });

  it("steps up only after a longer stable fast interval", () => {
    const quality = new AdaptiveRenderQuality("medium");
    let changed = null;
    for (let index = 0; index < 2_400 && !changed; index += 1) {
      changed = quality.update(1 / 90);
    }
    expect(changed).toBe("high");
  });

  it("keeps progressively cheaper settings at lower levels", () => {
    expect(RENDER_QUALITY_SETTINGS.low.maxPixelRatio).toBeLessThan(RENDER_QUALITY_SETTINGS.medium.maxPixelRatio);
    expect(RENDER_QUALITY_SETTINGS.medium.maxPixelRatio).toBeLessThan(RENDER_QUALITY_SETTINGS.high.maxPixelRatio);
    expect(RENDER_QUALITY_SETTINGS.low.grassFraction).toBeLessThan(RENDER_QUALITY_SETTINGS.high.grassFraction);
    expect(RENDER_QUALITY_SETTINGS.low.shadowMapSize).toBeLessThan(RENDER_QUALITY_SETTINGS.high.shadowMapSize);
    expect(RENDER_QUALITY_SETTINGS.low.zombieFullDetailDistance).toBeLessThan(RENDER_QUALITY_SETTINGS.high.zombieFullDetailDistance);
    expect(RENDER_QUALITY_SETTINGS.low.zombieRenderDistance).toBeLessThan(RENDER_QUALITY_SETTINGS.high.zombieRenderDistance);
    expect(RENDER_QUALITY_SETTINGS.low.treeFullDetailDistance).toBeLessThan(RENDER_QUALITY_SETTINGS.high.treeFullDetailDistance);
    expect(RENDER_QUALITY_SETTINGS.low.treeRenderDistance).toBeLessThan(RENDER_QUALITY_SETTINGS.high.treeRenderDistance);
  });
});
