export interface TimeOfDayState {
  hour: number;
  daylight: number;
  night: number;
  dawnDusk: number;
  dayProgress: number;
  sunAzimuthDegrees: number;
  sunAltitudeDegrees: number;
  exposure: number;
}

const GAME_SECONDS_PER_HOUR = 60;
const START_HOUR = 5.75;

export const MELBOURNE_WINTER_SOLAR = {
  startHour: START_HOUR,
  civilDawnHour: 7 + 6 / 60,
  sunriseHour: 7 + 35 / 60,
  solarNoonHour: 12 + 24 / 60,
  sunsetHour: 17 + 13 / 60,
  civilDuskHour: 17 + 43 / 60,
  sunriseAzimuthDegrees: 61,
  sunsetAzimuthDegrees: 298,
  noonAltitudeDegrees: 29.5
} as const;

export function timeOfDayFromElapsed(elapsedSeconds: number): TimeOfDayState {
  const hour = (START_HOUR + elapsedSeconds / GAME_SECONDS_PER_HOUR) % 24;
  const morning = smoothstep(MELBOURNE_WINTER_SOLAR.sunriseHour - 0.18, MELBOURNE_WINTER_SOLAR.sunriseHour + 0.62, hour);
  const evening = 1 - smoothstep(MELBOURNE_WINTER_SOLAR.sunsetHour - 0.62, MELBOURNE_WINTER_SOLAR.sunsetHour + 0.18, hour);
  const daylight = morning * evening;
  const dawnDusk = Math.max(
    intervalPeak(hour, MELBOURNE_WINTER_SOLAR.civilDawnHour - 0.2, MELBOURNE_WINTER_SOLAR.sunriseHour, MELBOURNE_WINTER_SOLAR.sunriseHour + 0.95),
    intervalPeak(hour, MELBOURNE_WINTER_SOLAR.sunsetHour - 0.95, MELBOURNE_WINTER_SOLAR.sunsetHour, MELBOURNE_WINTER_SOLAR.civilDuskHour + 0.2)
  );
  const night = 1 - daylight;
  const dayProgress = clamp01((hour - MELBOURNE_WINTER_SOLAR.sunriseHour) / (MELBOURNE_WINTER_SOLAR.sunsetHour - MELBOURNE_WINTER_SOLAR.sunriseHour));
  const sunAltitudeDegrees = Math.sin(dayProgress * Math.PI) * MELBOURNE_WINTER_SOLAR.noonAltitudeDegrees * daylight;
  const sunAzimuthDegrees = lerp(MELBOURNE_WINTER_SOLAR.sunriseAzimuthDegrees, MELBOURNE_WINTER_SOLAR.sunsetAzimuthDegrees, dayProgress);

  return {
    hour,
    daylight,
    night,
    dawnDusk,
    dayProgress,
    sunAzimuthDegrees,
    sunAltitudeDegrees,
    exposure: 0.82 + daylight * 0.38 + dawnDusk * 0.12
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function intervalPeak(value: number, start: number, peak: number, end: number): number {
  if (value <= start || value >= end) return 0;
  if (value <= peak) return smoothstep(start, peak, value);
  return 1 - smoothstep(peak, end, value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
