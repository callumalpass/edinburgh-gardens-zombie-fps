export interface TimeOfDayState {
  hour: number;
  daylight: number;
  night: number;
  dawnDusk: number;
  exposure: number;
}

const GAME_SECONDS_PER_HOUR = 60;
const START_HOUR = 4.25;

export function timeOfDayFromElapsed(elapsedSeconds: number): TimeOfDayState {
  const hour = (START_HOUR + elapsedSeconds / GAME_SECONDS_PER_HOUR) % 24;
  const morning = smoothstep(5.15, 7.35, hour);
  const evening = 1 - smoothstep(17.55, 19.75, hour);
  const daylight = morning * evening;
  const dawnDusk = Math.max(intervalPeak(hour, 4.75, 6.2, 7.85), intervalPeak(hour, 17.35, 18.65, 20.15));
  const night = 1 - daylight;

  return {
    hour,
    daylight,
    night,
    dawnDusk,
    exposure: 0.94 + daylight * 0.32 + dawnDusk * 0.08
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function intervalPeak(value: number, start: number, peak: number, end: number): number {
  if (value <= start || value >= end) return 0;
  if (value <= peak) return smoothstep(start, peak, value);
  return 1 - smoothstep(peak, end, value);
}
