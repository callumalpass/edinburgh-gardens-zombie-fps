import type { MovementSurface } from "./noise";
import type { TimeOfDayState } from "./rendering/timeOfDay";
import type { WeatherState } from "./rendering/weather";

export type ZombieType = "shambler" | "sprinter" | "bloater" | "crawler" | "screamer";

export interface ZombieProfile {
  type: ZombieType;
  health: number;
  speed: number;
  radius: number;
  reward: number;
  sightRange: number;
  hearingMultiplier: number;
  attackDamage: number;
  attackCooldown: number;
  staggerResistance: number;
  pickupChance: number;
  weaponDropChance: number;
}

export interface ZombieEnvironmentalContext {
  weather?: Pick<WeatherState, "precipitation" | "wetness" | "fog" | "wind">;
  timeOfDay?: Pick<TimeOfDayState, "daylight" | "night" | "dawnDusk">;
  surface?: MovementSurface;
}

export const ZOMBIE_PROFILES: Record<ZombieType, ZombieProfile> = {
  shambler: {
    type: "shambler",
    health: 68,
    speed: 6.6,
    radius: 1.35,
    reward: 12,
    sightRange: 52,
    hearingMultiplier: 1,
    attackDamage: 10,
    attackCooldown: 1.08,
    staggerResistance: 0.92,
    pickupChance: 0.46,
    weaponDropChance: 0.06
  },
  sprinter: {
    type: "sprinter",
    health: 46,
    speed: 11.2,
    radius: 1.18,
    reward: 15,
    sightRange: 60,
    hearingMultiplier: 1.18,
    attackDamage: 9,
    attackCooldown: 0.78,
    staggerResistance: 0.76,
    pickupChance: 0.38,
    weaponDropChance: 0.1
  },
  bloater: {
    type: "bloater",
    health: 146,
    speed: 4.25,
    radius: 2.2,
    reward: 24,
    sightRange: 48,
    hearingMultiplier: 0.78,
    attackDamage: 17,
    attackCooldown: 1.22,
    staggerResistance: 1.72,
    pickupChance: 0.66,
    weaponDropChance: 0.32
  },
  crawler: {
    type: "crawler",
    health: 40,
    speed: 4.9,
    radius: 0.95,
    reward: 14,
    sightRange: 42,
    hearingMultiplier: 1.32,
    attackDamage: 8,
    attackCooldown: 0.9,
    staggerResistance: 0.68,
    pickupChance: 0.34,
    weaponDropChance: 0.07
  },
  screamer: {
    type: "screamer",
    health: 78,
    speed: 6.05,
    radius: 1.28,
    reward: 20,
    sightRange: 66,
    hearingMultiplier: 1.48,
    attackDamage: 7,
    attackCooldown: 1.02,
    staggerResistance: 0.84,
    pickupChance: 0.54,
    weaponDropChance: 0.2
  }
};

export function zombieProfile(type: ZombieType): ZombieProfile {
  return ZOMBIE_PROFILES[type];
}

export function zombieEnvironmentalHearingMultiplier(profile: ZombieProfile, context: ZombieEnvironmentalContext = {}): number {
  const weather = context.weather ?? { precipitation: 0, wetness: 0, fog: 0, wind: 0 };
  const timeOfDay = context.timeOfDay ?? { daylight: 1, night: 0, dawnDusk: 0 };
  const wetMask = 1 - weather.precipitation * 0.06 - weather.wind * 0.025;
  const nightFocus = 1 + timeOfDay.night * 0.1 + timeOfDay.dawnDusk * 0.035;
  const fogFocus = 1 + weather.fog * (profile.type === "screamer" ? 0.06 : 0.035);
  return profile.hearingMultiplier * clamp(wetMask * nightFocus * fogFocus, 0.86, 1.16);
}

export function zombieEnvironmentalSpeedMultiplier(type: ZombieType, context: ZombieEnvironmentalContext = {}): number {
  const weather = context.weather ?? { precipitation: 0, wetness: 0, fog: 0, wind: 0 };
  const timeOfDay = context.timeOfDay ?? { daylight: 1, night: 0, dawnDusk: 0 };
  const surface = context.surface ?? "grass";
  const softSurface = surface === "grass" || surface === "dirt" ? 1 : surface === "gravel" ? 0.72 : 0.28;
  const wetDragByType: Record<ZombieType, number> = {
    shambler: 0.075,
    sprinter: 0.052,
    bloater: 0.14,
    crawler: 0.12,
    screamer: 0.065
  };
  const windDrag = type === "bloater" ? 0.035 : type === "crawler" ? 0.018 : 0.024;
  const nightUrgency = type === "sprinter" ? 0.034 : type === "screamer" ? 0.026 : 0.018;
  const wetDrag = (weather.wetness * 0.82 + weather.precipitation * 0.18) * softSurface * wetDragByType[type];
  return clamp(1 - wetDrag - weather.wind * windDrag + timeOfDay.night * nightUrgency, 0.78, 1.06);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
