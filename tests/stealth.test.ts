import { describe, expect, it } from "vitest";
import { playerVisibilityMultiplier, weatherNoiseMaskForKind, zombieFacingThreshold } from "../src/game/stealth";

const dryWeather = { precipitation: 0, fog: 0, cloudCover: 0.2 };
const rainyWeather = { precipitation: 0.8, fog: 0.25, cloudCover: 0.85 };
const winterNoon = { daylight: 1, night: 0, dawnDusk: 0 };
const winterNight = { daylight: 0, night: 1, dawnDusk: 0 };

describe("stealth tuning", () => {
  it("rewards crouching in cover and penalizes flashlight use", () => {
    const crouchedInCover = playerVisibilityMultiplier({
      surface: "grass",
      crouching: true,
      inCover: true,
      elevatedHeight: 0,
      flashlightOn: false,
      weather: rainyWeather,
      timeOfDay: winterNight
    });
    const standingWithLight = playerVisibilityMultiplier({
      surface: "asphalt",
      crouching: false,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: true,
      weather: dryWeather,
      timeOfDay: winterNight
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
      weather: rainyWeather,
      timeOfDay: winterNight
    });
    const lit = playerVisibilityMultiplier({
      surface: "concrete",
      crouching: false,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: false,
      structureLit: true,
      weather: rainyWeather,
      timeOfDay: winterNight
    });

    expect(lit).toBeGreaterThan(unlit);
  });

  it("lets unlit structure shelter help crouched players without beating floodlights", () => {
    const exposed = playerVisibilityMultiplier({
      surface: "concrete",
      crouching: true,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: false,
      structureShelter: 0,
      weather: rainyWeather,
      timeOfDay: winterNight
    });
    const sheltered = playerVisibilityMultiplier({
      surface: "concrete",
      crouching: true,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: false,
      structureShelter: 0.8,
      weather: rainyWeather,
      timeOfDay: winterNight
    });
    const shelteredLit = playerVisibilityMultiplier({
      surface: "concrete",
      crouching: true,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: false,
      structureLit: true,
      structureShelter: 0.8,
      weather: rainyWeather,
      timeOfDay: winterNight
    });

    expect(sheltered).toBeLessThan(exposed);
    expect(shelteredLit).toBeGreaterThan(sheltered);
  });

  it("masks subtle noises in rain but keeps hard alerts loud", () => {
    expect(weatherNoiseMaskForKind("scavenge", rainyWeather)).toBeLessThan(weatherNoiseMaskForKind("scavenge", dryWeather));
    expect(weatherNoiseMaskForKind("gunshot", rainyWeather)).toBe(1);
    expect(weatherNoiseMaskForKind("distraction", rainyWeather)).toBe(1);
  });

  it("makes unlit winter night darker but makes flashlights more obvious", () => {
    const unlitNoon = playerVisibilityMultiplier({
      surface: "grass",
      crouching: false,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: false,
      weather: dryWeather,
      timeOfDay: winterNoon
    });
    const unlitNight = playerVisibilityMultiplier({
      surface: "grass",
      crouching: false,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: false,
      weather: dryWeather,
      timeOfDay: winterNight
    });
    const litNight = playerVisibilityMultiplier({
      surface: "grass",
      crouching: false,
      inCover: false,
      elevatedHeight: 0,
      flashlightOn: true,
      weather: dryWeather,
      timeOfDay: winterNight
    });

    expect(unlitNight).toBeLessThan(unlitNoon);
    expect(litNight).toBeGreaterThan(unlitNoon);
  });
});
