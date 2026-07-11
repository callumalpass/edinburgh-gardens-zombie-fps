import { MACHETE_STAMINA_COST, MELEE_STAMINA_COST } from "../gameConfig";
import { spendStamina, type PlayerCondition } from "../playerCondition";
import {
  consumeRound,
  getWeaponStats,
  startReload,
  type Loadout
} from "../weapons";

export interface AuthoritativeWeaponState {
  loadout: Loadout;
  condition: PlayerCondition;
  lastShotAt: number;
}

export type WeaponTriggerResult =
  | { kind: "firearm"; stats: ReturnType<typeof getWeaponStats> }
  | { kind: "melee"; stats: ReturnType<typeof getWeaponStats> }
  | { kind: "dry"; stats: ReturnType<typeof getWeaponStats> }
  | { kind: "denied"; reason: "cooldown" | "reloading" | "mounted" | "stamina"; stats: ReturnType<typeof getWeaponStats> };

/** Authoritative weapon gate and resource mutation shared by every player. */
export function triggerAuthoritativeWeapon(
  player: AuthoritativeWeaponState,
  now: number,
  options: { mounted?: boolean; canFireMounted?: boolean; ignoreCooldown?: boolean } = {}
): WeaponTriggerResult {
  const stats = getWeaponStats(player.loadout);
  if (!options.ignoreCooldown && now - player.lastShotAt < stats.fireDelay) {
    return { kind: "denied", reason: "cooldown", stats };
  }
  if (options.mounted && !options.canFireMounted) {
    return { kind: "denied", reason: "mounted", stats };
  }
  if (stats.kind === "melee") {
    const staminaCost = player.loadout.weaponId === "machete" ? MACHETE_STAMINA_COST : MELEE_STAMINA_COST;
    const stamina = spendStamina(player.condition.stamina, staminaCost);
    if (!stamina.spent) return { kind: "denied", reason: "stamina", stats };
    player.condition.stamina = stamina.stamina;
    player.lastShotAt = now;
    return { kind: "melee", stats };
  }
  if (player.loadout.reloadingUntil > now) {
    return { kind: "denied", reason: "reloading", stats };
  }
  if (player.loadout.ammoInMagazine <= 0) {
    player.loadout = startReload(player.loadout, now);
    return { kind: "dry", stats };
  }
  player.loadout = consumeRound(player.loadout);
  player.lastShotAt = now;
  return { kind: "firearm", stats };
}
