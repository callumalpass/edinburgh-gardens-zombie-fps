import { describe, expect, it } from "vitest";
import { timeOfDayFromElapsed, type TimeOfDayState } from "../src/game/rendering/timeOfDay";

const FIELDS: Array<keyof Pick<TimeOfDayState, "daylight" | "night" | "dawnDusk" | "exposure">> = ["daylight", "night", "dawnDusk", "exposure"];

describe("accelerated day/night cycle", () => {
  it("moves from dawn through daylight and back into night", () => {
    const dawn = timeOfDayFromElapsed(105);
    const noon = timeOfDayFromElapsed((12 - 4.25) * 60);
    const lateNight = timeOfDayFromElapsed((22 - 4.25) * 60);

    expect(dawn.dawnDusk).toBeGreaterThan(0.45);
    expect(noon.daylight).toBeGreaterThan(0.95);
    expect(noon.night).toBeLessThan(0.1);
    expect(lateNight.night).toBeGreaterThan(0.95);
    expect(lateNight.daylight).toBeLessThan(0.1);
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
