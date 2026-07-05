import { describe, expect, it } from "vitest";
import { playerVisibilityMultiplier, weatherNoiseMaskForKind, zombieFacingThreshold } from "../src/game/stealth";

const dryWeather = { precipitation: 0, fog: 0, cloudCover: 0.2 };
const rainyWeather = { precipitation: 0.8, fog: 0.25, cloudCover: 0.85 };

describe("stealth tuning", () => {
  it("rewards crouching in cover and penalizes flashlight use", () => {
    const crouchedInCover = playerVisibilityMultiplier({
      surface: "grass",
      crouching: true,
      inCover: true,
      elevatedHeight: 0,
      flashlightOn: false,
      weather: rainyWeather
    });
    const standingWithLight = playerVisibilityMultiplier({
      surface: "asphalt",
      crouching: false,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: true,
      weather: dryWeather
    });

    expect(crouchedInCover).toBeLessThan(standingWithLight);
    expect(zombieFacingThreshold(true, true, false)).toBeGreaterThan(zombieFacingThreshold(false, false, false));
  });

  it("makes powered structure floodlights a visibility tradeoff", () => {
    const unlit = playerVisibilityMultiplier({
      surface: "concrete",
      crouching: false,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: false,
      structureLit: false,
      weather: rainyWeather
    });
    const lit = playerVisibilityMultiplier({
      surface: "concrete",
      crouching: false,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: false,
      structureLit: true,
      weather: rainyWeather
    });

    expect(lit).toBeGreaterThan(unlit);
  });

  it("masks subtle noises in rain but keeps hard alerts loud", () => {
    expect(weatherNoiseMaskForKind("scavenge", rainyWeather)).toBeLessThan(weatherNoiseMaskForKind("scavenge", dryWeather));
    expect(weatherNoiseMaskForKind("gunshot", rainyWeather)).toBe(1);
    expect(weatherNoiseMaskForKind("distraction", rainyWeather)).toBe(1);
  });
});
