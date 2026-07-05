export interface PlayerCondition {
  stamina: number;
  bleedTimer: number;
  limpTimer: number;
  blurTimer: number;
  bikePumpTimer: number;
  throwables: number;
  flashlightOn: boolean;
}

export interface StaminaFrame {
  sprinting: boolean;
  scoped: boolean;
  resting: boolean;
  searching: boolean;
  crouching: boolean;
  bleeding: boolean;
  bikePumpBoosted?: boolean;
  sheltered?: boolean;
}

export const MAX_STAMINA = 100;
export const MAX_THROWABLES = 5;
export const BIKE_PUMP_BOOST_SECONDS = 75;
export const BIKE_PUMP_SPEED_MULTIPLIER = 1.18;

export function createInitialPlayerCondition(): PlayerCondition {
  return {
    stamina: MAX_STAMINA,
    bleedTimer: 0,
    limpTimer: 0,
    blurTimer: 0,
    bikePumpTimer: 0,
    throwables: 2,
    flashlightOn: true
  };
}

export function nextStamina(stamina: number, dt: number, frame: StaminaFrame): number {
  let next = stamina;
  if (frame.sprinting) {
    next -= 17 * (frame.bikePumpBoosted ? 0.62 : 1) * (frame.sheltered ? 0.94 : 1) * dt;
  }
  if (frame.scoped) {
    next -= 5.5 * dt;
  }

  if (!frame.sprinting && !frame.scoped) {
    const recovery =
      frame.resting ? 28 :
      frame.searching ? 8 :
      frame.crouching ? 18 :
      14;
    const shelterRecovery = frame.sheltered ? 2.5 : 0;
    next += (recovery + shelterRecovery) * (frame.bleeding ? 0.78 : 1) * (frame.bikePumpBoosted ? 1.16 : 1) * dt;
  }

  return clampStamina(next);
}

export function applyBikePumpBoost(
  condition: PlayerCondition,
  duration = BIKE_PUMP_BOOST_SECONDS
): PlayerCondition {
  return {
    ...condition,
    bikePumpTimer: Math.max(condition.bikePumpTimer, duration),
    stamina: Math.min(MAX_STAMINA, condition.stamina + 18)
  };
}

export function bikePumpSpeedMultiplier(condition: Pick<PlayerCondition, "bikePumpTimer">): number {
  return condition.bikePumpTimer > 0 ? BIKE_PUMP_SPEED_MULTIPLIER : 1;
}

export function spendStamina(stamina: number, cost: number): { stamina: number; spent: boolean } {
  if (stamina < cost) {
    return { stamina, spent: false };
  }
  return { stamina: clampStamina(stamina - cost), spent: true };
}

export function speedMultiplierForCondition(condition: Pick<PlayerCondition, "stamina" | "limpTimer">): number {
  const staminaScale = condition.stamina <= 0 ? 0.78 : condition.stamina < 20 ? 0.9 : 1;
  const limpScale = condition.limpTimer > 0 ? 0.74 : 1;
  return staminaScale * limpScale;
}

export function bleedDamagePerSecond(bleedTimer: number): number {
  return bleedTimer > 0 ? 0.72 : 0;
}

export function injuryStatus(condition: Pick<PlayerCondition, "bleedTimer" | "limpTimer" | "blurTimer">): string | null {
  if (condition.bleedTimer > 0) return "Bleeding";
  if (condition.limpTimer > 0) return "Limping";
  if (condition.blurTimer > 0) return "Blurred";
  return null;
}

function clampStamina(stamina: number): number {
  return Math.max(0, Math.min(MAX_STAMINA, stamina));
}
