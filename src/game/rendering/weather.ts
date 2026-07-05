export type WeatherKind = "clear" | "overcast" | "drizzle" | "rain" | "storm";

export interface WeatherState {
  kind: WeatherKind;
  label: string;
  phase: number;
  cloudCover: number;
  precipitation: number;
  wind: number;
  fog: number;
  wetness: number;
  thunder: number;
  footstepMask: number;
  exposureMultiplier: number;
}

interface WeatherPhase {
  duration: number;
  kind: WeatherKind;
  label: string;
  cloudCover: number;
  precipitation: number;
  wind: number;
  fog: number;
  wetness: number;
  thunder: number;
}

const TRANSITION_SECONDS = 18;

// Melbourne Regional Office July normals are cool, cloudy and wet: around 17
// cloudy days, roughly 10 rain days, high morning humidity and stronger 3pm
// winds. Keep the arcade-fast loop, but weight it toward low cloud, drizzle
// and short cold-front squalls rather than constant cinematic thunderstorms.
const WEATHER_PHASES: WeatherPhase[] = [
  { duration: 74, kind: "overcast", label: "anticyclonic gloom", cloudCover: 0.82, precipitation: 0.06, wind: 0.42, fog: 0.4, wetness: 0.56, thunder: 0 },
  { duration: 60, kind: "drizzle", label: "fine drizzle", cloudCover: 0.9, precipitation: 0.3, wind: 0.48, fog: 0.58, wetness: 0.76, thunder: 0 },
  { duration: 60, kind: "rain", label: "cold showers", cloudCover: 0.95, precipitation: 0.62, wind: 0.66, fog: 0.64, wetness: 0.9, thunder: 0.06 },
  { duration: 66, kind: "overcast", label: "low cloud", cloudCover: 0.78, precipitation: 0.1, wind: 0.5, fog: 0.42, wetness: 0.68, thunder: 0 },
  { duration: 58, kind: "clear", label: "brief clear break", cloudCover: 0.36, precipitation: 0, wind: 0.34, fog: 0.18, wetness: 0.42, thunder: 0 },
  { duration: 42, kind: "rain", label: "southerly burst", cloudCover: 0.92, precipitation: 0.72, wind: 0.78, fog: 0.6, wetness: 0.94, thunder: 0.12 },
  { duration: 28, kind: "storm", label: "hail squall", cloudCover: 1, precipitation: 0.88, wind: 0.94, fog: 0.72, wetness: 1, thunder: 0.58 },
  { duration: 32, kind: "overcast", label: "cloud returning", cloudCover: 0.84, precipitation: 0.12, wind: 0.52, fog: 0.42, wetness: 0.64, thunder: 0 }
];

const WEATHER_CYCLE_SECONDS = WEATHER_PHASES.reduce((sum, phase) => sum + phase.duration, 0);

export function weatherFromElapsed(elapsedSeconds: number): WeatherState {
  const cycleTime = positiveModulo(elapsedSeconds, WEATHER_CYCLE_SECONDS);
  let phaseStart = 0;
  let phaseIndex = 0;

  for (; phaseIndex < WEATHER_PHASES.length; phaseIndex += 1) {
    const phase = WEATHER_PHASES[phaseIndex];
    if (cycleTime < phaseStart + phase.duration) {
      break;
    }
    phaseStart += phase.duration;
  }

  const current = WEATHER_PHASES[phaseIndex] ?? WEATHER_PHASES[0];
  const next = WEATHER_PHASES[(phaseIndex + 1) % WEATHER_PHASES.length];
  const phaseElapsed = cycleTime - phaseStart;
  const transition = smoothstep(current.duration - TRANSITION_SECONDS, current.duration, phaseElapsed);
  const mix = <K extends keyof Pick<WeatherPhase, "cloudCover" | "precipitation" | "wind" | "fog" | "wetness" | "thunder">>(key: K) =>
    lerp(current[key], next[key], transition);
  const precipitation = clamp01(mix("precipitation"));
  const fog = clamp01(mix("fog"));
  const thunder = clamp01(mix("thunder"));
  const kind = transition > 0.5 ? next.kind : current.kind;
  const label = transition > 0.5 ? next.label : current.label;

  return {
    kind,
    label,
    phase: cycleTime / WEATHER_CYCLE_SECONDS,
    cloudCover: clamp01(mix("cloudCover")),
    precipitation,
    wind: clamp01(mix("wind")),
    fog,
    wetness: clamp01(mix("wetness")),
    thunder,
    footstepMask: 1 - precipitation * 0.11 - fog * 0.035,
    exposureMultiplier: 1 - precipitation * 0.08 - fog * 0.045 - thunder * 0.03
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
