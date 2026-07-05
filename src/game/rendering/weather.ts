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

const WEATHER_PHASES: WeatherPhase[] = [
  { duration: 52, kind: "drizzle", label: "drizzle", cloudCover: 0.74, precipitation: 0.34, wind: 0.42, fog: 0.52, wetness: 0.72, thunder: 0 },
  { duration: 74, kind: "rain", label: "steady rain", cloudCover: 0.88, precipitation: 0.68, wind: 0.58, fog: 0.64, wetness: 0.88, thunder: 0.08 },
  { duration: 46, kind: "storm", label: "storm cell", cloudCover: 1, precipitation: 1, wind: 0.9, fog: 0.78, wetness: 1, thunder: 1 },
  { duration: 62, kind: "rain", label: "passing rain", cloudCover: 0.82, precipitation: 0.58, wind: 0.66, fog: 0.55, wetness: 0.92, thunder: 0.18 },
  { duration: 76, kind: "overcast", label: "low cloud", cloudCover: 0.7, precipitation: 0.08, wind: 0.46, fog: 0.34, wetness: 0.62, thunder: 0 },
  { duration: 58, kind: "clear", label: "clear break", cloudCover: 0.24, precipitation: 0, wind: 0.26, fog: 0.12, wetness: 0.28, thunder: 0 },
  { duration: 52, kind: "overcast", label: "cloud building", cloudCover: 0.58, precipitation: 0.12, wind: 0.38, fog: 0.28, wetness: 0.46, thunder: 0 }
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
