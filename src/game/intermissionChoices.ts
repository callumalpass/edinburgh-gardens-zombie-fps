import {
  UPGRADE_DEFINITIONS,
  applyUpgrade,
  canUpgrade,
  type Loadout,
  type UpgradeId
} from "./weapons";

export interface IntermissionUpgradeChoice {
  id: UpgradeId;
  label: string;
  description: string;
  level: number;
  nextLevel: number;
  maxLevel: number;
}

const UPGRADE_ORDER: readonly UpgradeId[] = ["damage", "reload", "spread", "magazine", "fireRate"];

export function intermissionUpgradeChoices(
  loadout: Loadout,
  wave: number,
  limit = 3
): IntermissionUpgradeChoice[] {
  const eligible = UPGRADE_ORDER.filter((id) => canUpgrade(loadout, id));
  if (eligible.length === 0 || limit <= 0) {
    return [];
  }

  const start = Math.abs(Math.floor(wave) - 1) % eligible.length;
  const choices: IntermissionUpgradeChoice[] = [];
  for (let offset = 0; offset < eligible.length && choices.length < limit; offset += 1) {
    const id = eligible[(start + offset * 2) % eligible.length];
    if (choices.some((choice) => choice.id === id)) {
      continue;
    }
    const definition = UPGRADE_DEFINITIONS[id];
    const level = loadout.upgrades[id];
    choices.push({
      id,
      label: definition.label,
      description: definition.description,
      level,
      nextLevel: level + 1,
      maxLevel: definition.maxLevel
    });
  }
  return choices;
}

export function claimIntermissionUpgrade(loadout: Loadout, upgradeId: UpgradeId): Loadout {
  return applyUpgrade(loadout, upgradeId);
}
