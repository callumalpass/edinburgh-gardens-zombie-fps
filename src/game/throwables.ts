export interface BottleBombEffect {
  damage: number;
  staggerSeconds: number;
  shoveDistance: number;
  falloff: number;
}

export const BOTTLE_BOMB_FUSE_SECONDS = 2.75;
export const BOTTLE_BOMB_PULSE_MIN_SECONDS = 0.58;
export const BOTTLE_BOMB_PULSE_MAX_SECONDS = 0.95;
export const BOTTLE_BOMB_EFFECT_RADIUS = 15.5;

const BOTTLE_BOMB_MIN_DAMAGE = 10;
const BOTTLE_BOMB_MAX_DAMAGE = 76;
const BOTTLE_BOMB_MIN_STAGGER_SECONDS = 0.45;
const BOTTLE_BOMB_MAX_STAGGER_SECONDS = 2.9;
const BOTTLE_BOMB_MAX_SHOVE_DISTANCE = 4.2;

export function bottleBombEffectAtDistance(distance: number, targetRadius = 0): BottleBombEffect {
  const softenedDistance = Math.max(0, distance - Math.max(0, targetRadius) * 0.45);
  if (softenedDistance > BOTTLE_BOMB_EFFECT_RADIUS) {
    return {
      damage: 0,
      staggerSeconds: 0,
      shoveDistance: 0,
      falloff: 0
    };
  }

  const falloff = 1 - softenedDistance / BOTTLE_BOMB_EFFECT_RADIUS;
  const pressure = Math.pow(falloff, 1.32);
  return {
    damage: Math.round(BOTTLE_BOMB_MIN_DAMAGE + (BOTTLE_BOMB_MAX_DAMAGE - BOTTLE_BOMB_MIN_DAMAGE) * pressure),
    staggerSeconds: BOTTLE_BOMB_MIN_STAGGER_SECONDS + (BOTTLE_BOMB_MAX_STAGGER_SECONDS - BOTTLE_BOMB_MIN_STAGGER_SECONDS) * Math.pow(falloff, 0.62),
    shoveDistance: BOTTLE_BOMB_MAX_SHOVE_DISTANCE * Math.pow(falloff, 1.08),
    falloff
  };
}
