export interface PlayerCondition {
  stamina: number;
  bleedTimer: number;
  limpTimer: number;
  blurTimer: number;
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
}

export const MAX_STAMINA = 100;
export const MAX_THROWABLES = 5;

export function createInitialPlayerCondition(): PlayerCondition {
  return {
    stamina: MAX_STAMINA,
    bleedTimer: 0,
    limpTimer: 0,
    blurTimer: 0,
    throwables: 2,
    flashlightOn: true
  };
}

export function nextStamina(stamina: number, dt: number, frame: StaminaFrame): number {
  let next = stamina;
  if (frame.sprinting) {
    next -= 19 * dt;
  }
  if (frame.scoped) {
    next -= 7 * dt;
  }

  if (!frame.sprinting && !frame.scoped) {
    const recovery =
      frame.resting ? 22 :
      frame.searching ? 7 :
      frame.crouching ? 16 :
      12;
    next += recovery * (frame.bleeding ? 0.72 : 1) * dt;
  }

  return clampStamina(next);
}

export function spendStamina(stamina: number, cost: number): { stamina: number; spent: boolean } {
  if (stamina < cost) {
    return { stamina, spent: false };
  }
  return { stamina: clampStamina(stamina - cost), spent: true };
}

export function speedMultiplierForCondition(condition: Pick<PlayerCondition, "stamina" | "limpTimer">): number {
  const staminaScale = condition.stamina <= 0 ? 0.72 : condition.stamina < 20 ? 0.86 : 1;
  const limpScale = condition.limpTimer > 0 ? 0.68 : 1;
  return staminaScale * limpScale;
}

export function bleedDamagePerSecond(bleedTimer: number): number {
  return bleedTimer > 0 ? 0.9 : 0;
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
