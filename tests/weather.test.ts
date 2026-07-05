import { describe, expect, it } from "vitest";
import { weatherFromElapsed, type WeatherState } from "../src/game/rendering/weather";

const WEATHER_NUMERIC_FIELDS: Array<keyof Pick<WeatherState, "phase" | "cloudCover" | "precipitation" | "wind" | "fog" | "wetness" | "thunder" | "footstepMask" | "exposureMultiplier">> = [
  "phase",
  "cloudCover",
  "precipitation",
  "wind",
  "fog",
  "wetness",
  "thunder",
  "footstepMask",
  "exposureMultiplier"
];

describe("variable weather cycle", () => {
  it("moves through distinct weather states over time", () => {
    const samples = [10, 70, 140, 260, 340].map(weatherFromElapsed);
    const kinds = new Set(samples.map((sample) => sample.kind));

    expect(kinds).toContain("drizzle");
    expect(kinds).toContain("rain");
    expect(kinds).toContain("storm");
    expect(kinds).toContain("overcast");
    expect(kinds).toContain("clear");
  });

  it("keeps weather intensities bounded and makes storms heavier than clear breaks", () => {
    const storm = weatherFromElapsed(140);
    const clear = weatherFromElapsed(340);

    for (const sample of [storm, clear]) {
      for (const field of WEATHER_NUMERIC_FIELDS) {
        expect(sample[field]).toBeGreaterThanOrEqual(0);
        expect(sample[field]).toBeLessThanOrEqual(1);
      }
    }

    expect(storm.precipitation).toBeGreaterThan(clear.precipitation);
    expect(storm.fog).toBeGreaterThan(clear.fog);
    expect(storm.footstepMask).toBeLessThan(clear.footstepMask);
    expect(storm.exposureMultiplier).toBeLessThan(clear.exposureMultiplier);
  });

  it("repeats on a stable cycle", () => {
    const start = weatherFromElapsed(0);
    const nextCycle = weatherFromElapsed(420);

    expect(nextCycle.kind).toBe(start.kind);
    expect(nextCycle.precipitation).toBeCloseTo(start.precipitation, 5);
    expect(nextCycle.cloudCover).toBeCloseTo(start.cloudCover, 5);
  });
});
