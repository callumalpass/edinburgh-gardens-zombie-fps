import * as THREE from "three";
import type { WeaponId } from "./weapons";

export const PLAYER_RADIUS = 2.2;
export const PLAYER_HEIGHT = 1.72;
export const BASE_CAMERA_FOV = 74;
export const START_POSITION = new THREE.Vector3(35, 0, 42);
export const START_YAW = -2.45;
export const START_PITCH = -0.08;
export const START_HEALTH = 100;
export const START_SCRAP = 70;

export const WALK_SPEED = 7.6;
export const SPRINT_SPEED = 11.4;
export const CROUCH_SPEED = 3.9;
export const INTERMISSION_SECONDS = 24;
export const REST_SECONDS = 5;

export const DISTRACTION_STAMINA_COST = 8;
export const CLIMB_STAMINA_COST = 14;
export const JUMP_STAMINA_COST = 9;
export const JUMP_INITIAL_VELOCITY = 5.1;
export const JUMP_GRAVITY = 13.4;
export const MELEE_STAMINA_COST = 12;
export const MACHETE_STAMINA_COST = 18;

export const ZOMBIE_SEPARATION_GAP = 0.16;
export const ZOMBIE_SEPARATION_GRID_SIZE = 8;
export const ZOMBIE_SEPARATION_ITERATIONS = 3;
export const ZOMBIE_STATIC_COLLISION_PASSES = 2;

export const BIKE_FORWARD_SPEED = 18.2;
export const BIKE_SPRINT_SPEED = 24.6;
export const BIKE_REVERSE_SPEED = 5.2;
export const BIKE_STRAFE_SPEED = 4.4;
export const BIKE_INTERACTION_RADIUS = 5.6;
export const BIKE_CAMERA_HEIGHT_BONUS = 0.34;
export const BIKE_ALLOWED_WEAPONS = new Set<WeaponId>(["knife", "machete", "carbine", "smg"]);

export const NETWORK_INPUT_HZ = 30;
export const NETWORK_SNAPSHOT_HZ = 18;
