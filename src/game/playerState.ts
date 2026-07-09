import * as THREE from "three";
import {
  START_HEALTH,
  START_PITCH,
  START_POSITION,
  START_SCRAP,
  START_YAW
} from "./gameConfig";
import type { PlayerRuntimeState } from "./runtimeTypes";

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
    height: 0,
    heightTarget: 0,
    jumpHeight: 0,
    jumpVelocity: 0,
    crouching: false,
    crouchAmount: 0,
    activeFixtureId: null
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
  player.height = initial.height;
  player.heightTarget = initial.heightTarget;
  player.jumpHeight = initial.jumpHeight;
  player.jumpVelocity = initial.jumpVelocity;
  player.crouching = initial.crouching;
  player.crouchAmount = initial.crouchAmount;
  player.activeFixtureId = initial.activeFixtureId;
}
