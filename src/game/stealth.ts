import type { NoiseKind, MovementSurface } from "./noise";
import type { WeatherState } from "./rendering/weather";

export interface PlayerVisibilityContext {
  surface: MovementSurface;
  crouching: boolean;
  inCover: boolean;
  elevatedHeight: number;
  flashlightOn: boolean;
  structureLit?: boolean;
  structureShelter?: number;
  weather: Pick<WeatherState, "precipitation" | "fog" | "cloudCover">;
}

export function playerVisibilityMultiplier(context: PlayerVisibilityContext): number {
  const surfaceCover = context.surface === "grass" || context.surface === "dirt"
    ? 0.88
    : context.surface === "rail" || context.surface === "asphalt"
      ? 1.08
      : 1;
  const crouchCover = context.crouching ? (context.inCover ? 0.32 : 0.46) : 1;
  const elevation = context.elevatedHeight > 1.4 ? 1.35 : 1;
  const weatherConcealment = 1 - context.weather.fog * 0.18 - context.weather.precipitation * 0.08;
  const flashlightRisk = context.flashlightOn ? 1.18 + context.weather.cloudCover * 0.2 + context.weather.fog * 0.08 : 1;
  const structureLightRisk = context.structureLit ? 1.16 + context.weather.cloudCover * 0.08 : 1;
  const shelter = Math.max(0, Math.min(1, context.structureShelter ?? 0));
  const shelterCover = context.structureLit ? 1 : 1 - shelter * (context.crouching ? 0.16 : 0.05);
  return Math.max(0.24, surfaceCover * crouchCover * elevation * weatherConcealment * flashlightRisk * structureLightRisk * shelterCover);
}

export function zombieFacingThreshold(crouching: boolean, inCover: boolean, flashlightOn: boolean): number {
  if (flashlightOn) {
    return crouching && inCover ? -0.02 : -0.18;
  }
  if (crouching && inCover) {
    return 0.1;
  }
  return crouching ? -0.1 : -0.32;
}

export function weatherNoiseMaskForKind(kind: NoiseKind, weather: Pick<WeatherState, "precipitation" | "fog">): number {
  if (kind === "gunshot" || kind === "scream" || kind === "distraction") {
    return 1;
  }
  return Math.max(0.58, 1 - weather.precipitation * 0.26 - weather.fog * 0.08);
}
