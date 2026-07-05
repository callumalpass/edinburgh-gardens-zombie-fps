import { distance } from "./geo";
import type { LevelData, Vec2 } from "./types";
import type { Loadout } from "./weapons";
import { addAmmo } from "./weapons";

export type ObjectiveId = "rotunda-relay" | "grandstand-radio" | "rail-cache" | "basketball-hold" | "bbq-supplies";

export interface ObjectiveDefinition {
  id: ObjectiveId;
  label: string;
  position: Vec2;
  radius: number;
  holdSeconds: number;
  rewardScrap: number;
  rewardAmmo: number;
}

export interface ActiveObjective extends ObjectiveDefinition {
  progress: number;
  completed: boolean;
}

export interface ObjectiveReward {
  scrap: number;
  loadout: Loadout;
}

export function createObjectiveCycle(level: LevelData): ObjectiveDefinition[] {
  const station = (id: string) => level.upgradeStations.find((candidate) => candidate.id === id)?.position;
  const weapon = (id: string) => level.weaponSpawns.find((candidate) => candidate.id === id)?.position;
  const amenity = (id: string) => level.amenities.find((candidate) => candidate.id === id)?.position;

  return [
    {
      id: "rotunda-relay",
      label: "Restore the rotunda relay",
      position: station("rotunda-armory") ?? level.spawnPoints[0],
      radius: 10,
      holdSeconds: 5.5,
      rewardScrap: 28,
      rewardAmmo: 18
    },
    {
      id: "grandstand-radio",
      label: "Recover the grandstand radio",
      position: weapon("grandstand-shotgun") ?? level.spawnPoints[1],
      radius: 11,
      holdSeconds: 6,
      rewardScrap: 34,
      rewardAmmo: 12
    },
    {
      id: "rail-cache",
      label: "Unlock the rail trail cache",
      position: weapon("rail-rifle") ?? level.spawnPoints[2],
      radius: 9,
      holdSeconds: 5,
      rewardScrap: 22,
      rewardAmmo: 26
    },
    {
      id: "basketball-hold",
      label: "Hold the basketball half-court",
      position: station("basketball-cache") ?? level.spawnPoints[3],
      radius: 12,
      holdSeconds: 7,
      rewardScrap: 30,
      rewardAmmo: 16
    },
    {
      id: "bbq-supplies",
      label: "Sweep the north BBQ supplies",
      position: amenity("osm-6280110896") ?? station("north-bbq-supplies") ?? level.spawnPoints[4],
      radius: 9,
      holdSeconds: 5,
      rewardScrap: 18,
      rewardAmmo: 22
    }
  ];
}

export function createActiveObjective(definition: ObjectiveDefinition): ActiveObjective {
  return {
    ...definition,
    progress: 0,
    completed: false
  };
}

export function updateObjectiveProgress(objective: ActiveObjective, playerPosition: Vec2, dt: number): ActiveObjective {
  if (objective.completed) return objective;
  const inside = distance(playerPosition, objective.position) <= objective.radius;
  const progress = inside
    ? Math.min(objective.holdSeconds, objective.progress + dt)
    : Math.max(0, objective.progress - dt * 0.55);
  return {
    ...objective,
    progress,
    completed: progress >= objective.holdSeconds
  };
}

export function claimObjectiveReward(objective: ActiveObjective, scrap: number, loadout: Loadout): ObjectiveReward {
  return {
    scrap: scrap + objective.rewardScrap,
    loadout: addAmmo(loadout, objective.rewardAmmo)
  };
}
