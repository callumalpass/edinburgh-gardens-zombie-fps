export interface PlayerCondition {
  stamina: number;
  hydration: number;
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
  hydration?: number;
  bikePumpBoosted?: boolean;
  sheltered?: boolean;
}

export interface HydrationFrame {
  sprinting: boolean;
  elevated: boolean;
  bleeding: boolean;
  daylight: number;
  sheltered?: boolean;
}

export interface PlayerConditionActor {
  health: number;
  reviveProtectionTimer: number;
  height: number;
  jumpHeight: number;
  crouching: boolean;
  activeFixtureId: string | null;
}

export interface PlayerConditionSimulationFrame {
  sprinting: boolean;
  scoped: boolean;
  resting: boolean;
  searching: boolean;
  daylight: number;
  sheltered: boolean;
  bikePumpBoosted: boolean;
}

export interface PlayerConditionSimulationResult {
  bleedDamage: number;
  scopeExhausted: boolean;
}

export const MAX_STAMINA = 100;
export const MAX_HYDRATION = 100;
export const MAX_THROWABLES = 5;
export const BIKE_PUMP_BOOST_SECONDS = 75;
export const BIKE_PUMP_SPEED_MULTIPLIER = 1.18;
export const THIRSTY_HYDRATION = 55;
export const PARCHED_HYDRATION = 30;
export const DEHYDRATED_HYDRATION = 12;
const BASE_HYDRATION_DRAIN_PER_SECOND = MAX_HYDRATION / (24 * 60);

export function createInitialPlayerCondition(): PlayerCondition {
  return {
    stamina: MAX_STAMINA,
    hydration: MAX_HYDRATION,
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
  const hydration = frame.hydration ?? MAX_HYDRATION;
  if (frame.sprinting) {
    next -= 17 * hydrationSprintCostMultiplier(hydration) * (frame.bikePumpBoosted ? 0.62 : 1) * (frame.sheltered ? 0.94 : 1) * dt;
  }
  if (frame.scoped) {
    next -= 5.5 * hydrationFocusCostMultiplier(hydration) * dt;
  }

  if (!frame.sprinting && !frame.scoped) {
    const recovery =
      frame.resting ? 28 :
      frame.searching ? 8 :
      frame.crouching ? 18 :
      14;
    const shelterRecovery = frame.sheltered ? 2.5 : 0;
    next +=
      (recovery + shelterRecovery) *
      hydrationRecoveryMultiplier(hydration) *
      (frame.bleeding ? 0.78 : 1) *
      (frame.bikePumpBoosted ? 1.16 : 1) *
      dt;
  }

  return clampStamina(next);
}

export function nextHydration(hydration: number, dt: number, frame: HydrationFrame): number {
  const exertion = frame.sprinting ? 0.65 : 0;
  const heightPressure = frame.elevated ? 0.55 : 0;
  const injuryPressure = frame.bleeding ? 0.35 : 0;
  const daylightPressure = Math.max(0, Math.min(1, frame.daylight)) * 0.2;
  const shelterRelief = frame.sheltered ? -0.12 : 0;
  const multiplier = Math.max(0.72, 1 + exertion + heightPressure + injuryPressure + daylightPressure + shelterRelief);
  return clampHydration(hydration - BASE_HYDRATION_DRAIN_PER_SECOND * multiplier * dt);
}

/**
 * Advances the authoritative condition state for any player. The host player,
 * network peers, and client-side replay all use this function so time-based
 * condition rules cannot drift between local and multiplayer code paths.
 */
export function simulatePlayerCondition(
  actor: PlayerConditionActor,
  condition: PlayerCondition,
  dt: number,
  frame: PlayerConditionSimulationFrame
): PlayerConditionSimulationResult {
  const step = Math.max(0, dt);
  actor.reviveProtectionTimer = Math.max(0, actor.reviveProtectionTimer - step);
  condition.bleedTimer = Math.max(0, condition.bleedTimer - step);
  condition.limpTimer = Math.max(0, condition.limpTimer - step);
  condition.blurTimer = Math.max(0, condition.blurTimer - step);
  condition.bikePumpTimer = Math.max(0, condition.bikePumpTimer - step);

  condition.hydration = nextHydration(condition.hydration, step, {
    sprinting: frame.sprinting,
    elevated: actor.height + actor.jumpHeight > 1.2 || Boolean(actor.activeFixtureId),
    bleeding: condition.bleedTimer > 0,
    daylight: frame.daylight,
    sheltered: frame.sheltered
  });

  const bleedDamage = bleedDamagePerSecond(condition.bleedTimer) * step;
  if (bleedDamage > 0) actor.health -= bleedDamage;

  condition.stamina = nextStamina(condition.stamina, step, {
    sprinting: frame.sprinting,
    scoped: frame.scoped,
    resting: frame.resting,
    searching: frame.searching,
    crouching: actor.crouching,
    bleeding: condition.bleedTimer > 0,
    hydration: condition.hydration,
    bikePumpBoosted: frame.bikePumpBoosted,
    sheltered: frame.sheltered
  });

  return {
    bleedDamage,
    scopeExhausted: frame.scoped && condition.stamina <= 1
  };
}

export function hydrateCondition(condition: PlayerCondition): PlayerCondition {
  return {
    ...condition,
    hydration: MAX_HYDRATION,
    stamina: Math.min(MAX_STAMINA, condition.stamina + 16),
    blurTimer: Math.max(0, condition.blurTimer - 3)
  };
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

export function speedMultiplierForCondition(condition: Pick<PlayerCondition, "stamina" | "limpTimer"> & Partial<Pick<PlayerCondition, "hydration">>): number {
  const staminaScale = condition.stamina <= 0 ? 0.78 : condition.stamina < 20 ? 0.9 : 1;
  const limpScale = condition.limpTimer > 0 ? 0.74 : 1;
  const hydration = condition.hydration ?? MAX_HYDRATION;
  const hydrationScale = hydration < DEHYDRATED_HYDRATION ? 0.84 : hydration < PARCHED_HYDRATION ? 0.93 : 1;
  return staminaScale * limpScale * hydrationScale;
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

export function hydrationStatus(condition: Pick<PlayerCondition, "hydration">): string | null {
  if (condition.hydration < DEHYDRATED_HYDRATION) return "Dehydrated";
  if (condition.hydration < PARCHED_HYDRATION) return "Parched";
  if (condition.hydration < THIRSTY_HYDRATION) return "Thirsty";
  return null;
}

export function hydrationRecoveryMultiplier(hydration: number): number {
  if (hydration < DEHYDRATED_HYDRATION) return 0.55;
  if (hydration < PARCHED_HYDRATION) return 0.72;
  if (hydration < THIRSTY_HYDRATION) return 0.88;
  return 1;
}

function hydrationSprintCostMultiplier(hydration: number): number {
  if (hydration < DEHYDRATED_HYDRATION) return 1.34;
  if (hydration < PARCHED_HYDRATION) return 1.18;
  if (hydration < THIRSTY_HYDRATION) return 1.08;
  return 1;
}

function hydrationFocusCostMultiplier(hydration: number): number {
  if (hydration < DEHYDRATED_HYDRATION) return 1.28;
  if (hydration < PARCHED_HYDRATION) return 1.14;
  if (hydration < THIRSTY_HYDRATION) return 1.06;
  return 1;
}

function clampStamina(stamina: number): number {
  return Math.max(0, Math.min(MAX_STAMINA, stamina));
}

function clampHydration(hydration: number): number {
  return Math.max(0, Math.min(MAX_HYDRATION, hydration));
}
