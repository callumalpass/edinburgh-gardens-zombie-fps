import { describe, expect, it } from "vitest";
import { MELBOURNE_WINTER_SOLAR, timeOfDayFromElapsed, type TimeOfDayState } from "../src/game/rendering/timeOfDay";

const FIELDS: Array<keyof Pick<TimeOfDayState, "daylight" | "night" | "dawnDusk" | "dayProgress" | "exposure">> = [
  "daylight",
  "night",
  "dawnDusk",
  "dayProgress",
  "exposure"
];

describe("accelerated day/night cycle", () => {
  it("moves from dawn through daylight and back into night", () => {
    const dawn = timeOfDayFromElapsed(105);
    const noon = timeOfDayFromElapsed((MELBOURNE_WINTER_SOLAR.solarNoonHour - MELBOURNE_WINTER_SOLAR.startHour) * 60);
    const lateNight = timeOfDayFromElapsed((22 - MELBOURNE_WINTER_SOLAR.startHour) * 60);

    expect(dawn.dawnDusk).toBeGreaterThan(0.45);
    expect(noon.daylight).toBeGreaterThan(0.95);
    expect(noon.night).toBeLessThan(0.1);
    expect(lateNight.night).toBeGreaterThan(0.95);
    expect(lateNight.daylight).toBeLessThan(0.1);
  });

  it("matches Melbourne winter sunrise, sunset and low solar altitude", () => {
    const sunrise = timeOfDayFromElapsed((MELBOURNE_WINTER_SOLAR.sunriseHour - MELBOURNE_WINTER_SOLAR.startHour) * 60);
    const noon = timeOfDayFromElapsed((MELBOURNE_WINTER_SOLAR.solarNoonHour - MELBOURNE_WINTER_SOLAR.startHour) * 60);
    const sunset = timeOfDayFromElapsed((MELBOURNE_WINTER_SOLAR.sunsetHour - MELBOURNE_WINTER_SOLAR.startHour) * 60);

    expect(sunrise.dawnDusk).toBeGreaterThan(0.85);
    expect(sunrise.sunAzimuthDegrees).toBeCloseTo(61, 0);
    expect(noon.dayProgress).toBeGreaterThan(0.45);
    expect(noon.dayProgress).toBeLessThan(0.55);
    expect(noon.sunAltitudeDegrees).toBeLessThan(31);
    expect(noon.sunAltitudeDegrees).toBeGreaterThan(28);
    expect(sunset.dawnDusk).toBeGreaterThan(0.85);
    expect(sunset.sunAzimuthDegrees).toBeCloseTo(298, 0);
  });

  it("keeps visual intensity fields bounded and repeats every in-game day", () => {
    const sample = timeOfDayFromElapsed(360);
    const nextDay = timeOfDayFromElapsed(360 + 24 * 60);

    for (const field of FIELDS) {
      expect(sample[field]).toBeGreaterThanOrEqual(0);
      expect(sample[field]).toBeLessThanOrEqual(field === "exposure" ? 1.5 : 1);
      expect(nextDay[field]).toBeCloseTo(sample[field], 5);
    }
    expect(nextDay.hour).toBeCloseTo(sample.hour, 5);
  });
});
