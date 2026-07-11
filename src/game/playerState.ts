import * as THREE from "three";
import {
  INTERMISSION_REVIVE_HEALTH,
  INTERMISSION_REVIVE_PROTECTION_SECONDS,
  START_HEALTH,
  START_PITCH,
  START_POSITION,
  START_SCRAP,
  START_YAW
} from "./gameConfig";
import { createInitialPlayerCondition, type PlayerCondition } from "./playerCondition";
import type { AuthoritativePlayerState, PlayerRuntimeState } from "./runtimeTypes";
import { createInitialLoadout } from "./weapons";

export function createInitialPlayerState(groundY = START_POSITION.y): PlayerRuntimeState {
  return {
    position: new THREE.Vector3(START_POSITION.x, groundY, START_POSITION.z),
    velocity: new THREE.Vector3(),
    yaw: START_YAW,
    pitch: START_PITCH,
    health: START_HEALTH,
    scrap: START_SCRAP,
    kills: 0,
    intermissionUpgradeWave: 0,
    reviveProtectionTimer: 0,
    height: 0,
    heightTarget: 0,
    jumpHeight: 0,
    jumpVelocity: 0,
    crouching: false,
    crouchAmount: 0,
    activeFixtureId: null
  };
}

export function createInitialAuthoritativePlayerState(groundY = START_POSITION.y): AuthoritativePlayerState {
  return {
    ...createInitialPlayerState(groundY),
    loadout: createInitialLoadout(),
    condition: createInitialPlayerCondition(),
    inventory: [],
    carriedItem: null,
    skateboardMounted: false,
    isSprinting: false,
    lastShotAt: 0,
    shotSequence: 0,
    shotBloom: 0,
    movementNoiseTimer: 0
  };
}

export function resetPlayerState(player: PlayerRuntimeState, groundY = START_POSITION.y): void {
  const initial = createInitialPlayerState(groundY);
  player.position.copy(initial.position);
  player.velocity.copy(initial.velocity);
  player.yaw = initial.yaw;
  player.pitch = initial.pitch;
  player.health = initial.health;
  player.scrap = initial.scrap;
  player.kills = initial.kills;
  player.intermissionUpgradeWave = initial.intermissionUpgradeWave;
  player.reviveProtectionTimer = initial.reviveProtectionTimer;
  player.height = initial.height;
  player.heightTarget = initial.heightTarget;
  player.jumpHeight = initial.jumpHeight;
  player.jumpVelocity = initial.jumpVelocity;
  player.crouching = initial.crouching;
  player.crouchAmount = initial.crouchAmount;
  player.activeFixtureId = initial.activeFixtureId;
}

export function revivePlayerForIntermission(
  player: Pick<PlayerRuntimeState, "health" | "velocity" | "reviveProtectionTimer">,
  condition: PlayerCondition
): boolean {
  if (player.health > 0) {
    return false;
  }

  player.health = INTERMISSION_REVIVE_HEALTH;
  player.velocity.set(0, 0, 0);
  player.reviveProtectionTimer = INTERMISSION_REVIVE_PROTECTION_SECONDS;
  condition.stamina = Math.max(condition.stamina, INTERMISSION_REVIVE_HEALTH);
  condition.bleedTimer = 0;
  condition.limpTimer = 0;
  condition.blurTimer = 0;
  return true;
}

export interface IntermissionReviveCandidate {
  name: string;
  player: Pick<PlayerRuntimeState, "health" | "velocity" | "reviveProtectionTimer">;
  condition: PlayerCondition;
}

export function reviveFallenSquadForIntermission(candidates: readonly IntermissionReviveCandidate[]): string[] {
  if (!candidates.some((candidate) => candidate.player.health > 0)) {
    return [];
  }

  return candidates.flatMap((candidate) =>
    revivePlayerForIntermission(candidate.player, candidate.condition) ? [candidate.name] : []
  );
}
