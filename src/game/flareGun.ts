export interface FlareBurstEffect {
  damage: number;
  staggerSeconds: number;
  shoveDistance: number;
  falloff: number;
}

export const FLARE_BURST_RADIUS = 18.5;
export const FLARE_BEACON_SECONDS = 8.5;
export const FLARE_BEACON_PULSE_SECONDS = 1.15;

const FLARE_MIN_DAMAGE = 6;
const FLARE_MAX_DAMAGE = 42;
const FLARE_MIN_STAGGER_SECONDS = 0.7;
const FLARE_MAX_STAGGER_SECONDS = 3.4;
const FLARE_MAX_SHOVE_DISTANCE = 2.8;

export function flareBurstEffectAtDistance(distance: number, targetRadius = 0): FlareBurstEffect {
  const softenedDistance = Math.max(0, distance - Math.max(0, targetRadius) * 0.5);
  if (softenedDistance > FLARE_BURST_RADIUS) {
    return {
      damage: 0,
      staggerSeconds: 0,
      shoveDistance: 0,
      falloff: 0
    };
  }

  const falloff = 1 - softenedDistance / FLARE_BURST_RADIUS;
  const heat = Math.pow(falloff, 1.18);
  return {
    damage: Math.round(FLARE_MIN_DAMAGE + (FLARE_MAX_DAMAGE - FLARE_MIN_DAMAGE) * heat),
    staggerSeconds: FLARE_MIN_STAGGER_SECONDS + (FLARE_MAX_STAGGER_SECONDS - FLARE_MIN_STAGGER_SECONDS) * Math.pow(falloff, 0.58),
    shoveDistance: FLARE_MAX_SHOVE_DISTANCE * Math.pow(falloff, 1.05),
    falloff
  };
}
