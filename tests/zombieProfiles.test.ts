import { describe, expect, it } from "vitest";
import {
  zombieEnvironmentalHearingMultiplier,
  zombieEnvironmentalSpeedMultiplier,
  zombieProfile
} from "../src/game/zombieProfiles";

const dryDay = {
  weather: { precipitation: 0, wetness: 0, fog: 0, wind: 0 },
  timeOfDay: { daylight: 1, night: 0, dawnDusk: 0 }
};

const wetNight = {
  weather: { precipitation: 0.72, wetness: 0.94, fog: 0.45, wind: 0.68 },
  timeOfDay: { daylight: 0, night: 1, dawnDusk: 0 }
};

describe("zombie environmental realism", () => {
  it("slows heavy zombies more on wet winter lawns than on hard paths", () => {
    const bloaterGrass = zombieEnvironmentalSpeedMultiplier("bloater", { ...wetNight, surface: "grass" });
    const bloaterAsphalt = zombieEnvironmentalSpeedMultiplier("bloater", { ...wetNight, surface: "asphalt" });
    const sprinterGrass = zombieEnvironmentalSpeedMultiplier("sprinter", { ...wetNight, surface: "grass" });

    expect(bloaterGrass).toBeLessThan(bloaterAsphalt);
    expect(bloaterGrass).toBeLessThan(sprinterGrass);
    expect(zombieEnvironmentalSpeedMultiplier("bloater", { ...dryDay, surface: "grass" })).toBeGreaterThan(bloaterGrass);
  });

  it("leans zombie awareness toward hearing at night without overpowering rain masking", () => {
    const screamer = zombieProfile("screamer");
    const day = zombieEnvironmentalHearingMultiplier(screamer, { ...dryDay, surface: "grass" });
    const night = zombieEnvironmentalHearingMultiplier(screamer, { ...wetNight, surface: "grass" });

    expect(night).toBeGreaterThan(day * 0.94);
    expect(night).toBeLessThan(day * 1.16);
  });
});
