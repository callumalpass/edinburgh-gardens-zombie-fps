import * as THREE from "three";
import { resolveObstacle, shouldBypassObstacle } from "../collision";
import {
  BIKE_FORWARD_SPEED,
  BIKE_REVERSE_SPEED,
  BIKE_SPRINT_SPEED,
  BIKE_STRAFE_SPEED,
  CROUCH_SPEED,
  JUMP_GRAVITY,
  JUMP_INITIAL_VELOCITY,
  PLAYER_RADIUS,
  SPRINT_SPEED,
  WALK_SPEED
} from "../gameConfig";
import { clampToPolygon } from "../geo";
import { pointInInteractableRaisedFootprint } from "../interactables";
import type { MovementSurface } from "../noise";
import { speedMultiplierForCondition, type PlayerCondition } from "../playerCondition";
import type { PlayerRuntimeState } from "../runtimeTypes";
import type { CollisionObstacle, InteractableFixture, SkateBowlFeature, Vec2 } from "../types";

export interface LocomotionInput {
  x: number;
  z: number;
  length: number;
}

export interface LocomotionActor {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  crouching: boolean;
  crouchAmount: number;
  height: number;
  heightTarget: number;
  jumpHeight: number;
  jumpVelocity: number;
  activeFixtureId: string | null;
}

export interface LocomotionWorld {
  boundary: readonly Vec2[];
  skateBowls: readonly SkateBowlFeature[];
  interactables: readonly InteractableFixture[];
  obstacleIndex: {
    forNearby(
      point: Vec2,
      radius: number,
      visit: (obstacle: CollisionObstacle) => boolean | void,
      clearance?: number
    ): void;
  };
  groundY(point: Vec2): number;
  movementSurfaceAt(point: Vec2): MovementSurface;
  surfaceSpeedMultiplier(surface: MovementSurface): number;
  bikeSurfaceSpeedMultiplier(surface: MovementSurface): number;
}

export interface LocomotionMoveResult {
  moved: boolean;
  sprinting: boolean;
  surface: MovementSurface;
}

export class PlayerLocomotion {
  private readonly interactableById: Map<string, InteractableFixture>;
  private readonly autoInteractables: InteractableFixture[];
  private readonly inputVector = new THREE.Vector3();
  private readonly forwardVector = new THREE.Vector3();
  private readonly rightVector = new THREE.Vector3();

  constructor(private readonly world: LocomotionWorld) {
    this.interactableById = new Map(world.interactables.map((fixture) => [fixture.id, fixture]));
    this.autoInteractables = world.interactables.filter((fixture) => fixture.mode === "auto");
  }

  updateCrouch(actor: LocomotionActor, dt: number, crouching: boolean): void {
    actor.crouching = crouching;
    const target = actor.crouching ? 1 : 0;
    const t = 1 - Math.pow(0.0008, dt);
    actor.crouchAmount += (target - actor.crouchAmount) * t;
    if (actor.crouchAmount < 0.01) {
      actor.crouchAmount = 0;
    }
  }

  moveOnFoot(actor: LocomotionActor, dt: number, input: LocomotionInput, options: { wantsSprint: boolean; condition: PlayerCondition }): LocomotionMoveResult {
    const actorPoint = { x: actor.position.x, z: actor.position.z };
    const surface = this.world.movementSurfaceAt(actorPoint);
    const inputLength = Math.min(1, Math.hypot(input.x, input.z));
    if (input.length > 0.001 && inputLength > 0.001) {
      const movement = this.inputVector.set(input.x, 0, input.z).normalize();
      const sin = Math.sin(actor.yaw);
      const cos = Math.cos(actor.yaw);
      const forward = this.forwardVector.set(sin, 0, cos);
      const right = this.rightVector.set(cos, 0, -sin);
      const sprinting = !actor.crouching && options.wantsSprint && options.condition.stamina > 8 && options.condition.limpTimer <= 0;
      const speed =
        (actor.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED) *
        this.world.surfaceSpeedMultiplier(surface) *
        speedMultiplierForCondition(options.condition);
      actor.velocity.copy(forward.multiplyScalar(movement.z).add(right.multiplyScalar(movement.x))).multiplyScalar(speed);
      this.applyHorizontalMovement(actor, dt, PLAYER_RADIUS);
      return { moved: true, sprinting, surface };
    }

    actor.velocity.multiplyScalar(0.78);
    if (actor.velocity.lengthSq() < 0.01) {
      actor.velocity.set(0, 0, 0);
    }
    return { moved: false, sprinting: false, surface };
  }

  moveOnBike(
    actor: LocomotionActor,
    dt: number,
    input: LocomotionInput,
    options: { wantsSprint: boolean; condition: PlayerCondition; pumpSpeedMultiplier: number }
  ): LocomotionMoveResult {
    actor.activeFixtureId = null;
    actor.heightTarget = 0;
    actor.crouching = false;
    const surface = this.world.movementSurfaceAt({ x: actor.position.x, z: actor.position.z });
    const sprinting = options.wantsSprint && options.condition.stamina > 8 && options.condition.limpTimer <= 0;
    const forwardInput = (input.z < 0 ? 1 : 0) - (input.z > 0 ? 1 : 0);
    const sideInput = (input.x > 0 ? 1 : 0) - (input.x < 0 ? 1 : 0);

    if (forwardInput !== 0 || sideInput !== 0) {
      const sin = Math.sin(actor.yaw);
      const cos = Math.cos(actor.yaw);
      const forwardSpeed = sprinting && forwardInput > 0 ? BIKE_SPRINT_SPEED : BIKE_FORWARD_SPEED;
      const forward = this.forwardVector
        .set(-sin, 0, -cos)
        .multiplyScalar(forwardInput >= 0 ? forwardInput * forwardSpeed : forwardInput * BIKE_REVERSE_SPEED);
      const right = this.rightVector.set(cos, 0, -sin).multiplyScalar(sideInput * BIKE_STRAFE_SPEED);
      const conditionScale = Math.max(0.72, speedMultiplierForCondition(options.condition));
      actor.velocity.copy(forward.add(right)).multiplyScalar(
        this.world.bikeSurfaceSpeedMultiplier(surface) * conditionScale * options.pumpSpeedMultiplier
      );
      this.applyHorizontalMovement(actor, dt, PLAYER_RADIUS + 0.45, false);
      return { moved: true, sprinting, surface };
    }

    actor.velocity.multiplyScalar(0.9);
    if (actor.velocity.lengthSq() < 0.01) {
      actor.velocity.set(0, 0, 0);
    }
    return { moved: false, sprinting: false, surface };
  }

  canStartJump(actor: LocomotionActor, options: { disabled?: boolean } = {}): boolean {
    return !options.disabled && !actor.activeFixtureId && actor.height <= 0.2 && actor.jumpHeight <= 0.02 && !actor.crouching;
  }

  startJump(actor: LocomotionActor): void {
    actor.jumpVelocity = JUMP_INITIAL_VELOCITY;
    actor.jumpHeight = 0.04;
  }

  updateJumpState(actor: LocomotionActor, dt: number, options: { disabled?: boolean } = {}): void {
    if (options.disabled || actor.activeFixtureId || actor.height > 0.2) {
      actor.jumpHeight = 0;
      actor.jumpVelocity = 0;
      return;
    }
    if (actor.jumpHeight <= 0 && actor.jumpVelocity <= 0) {
      actor.jumpHeight = 0;
      actor.jumpVelocity = 0;
      return;
    }
    actor.jumpVelocity -= JUMP_GRAVITY * dt;
    actor.jumpHeight += actor.jumpVelocity * dt;
    if (actor.jumpHeight <= 0) {
      actor.jumpHeight = 0;
      actor.jumpVelocity = 0;
    }
  }

  updateFixtureElevation(actor: LocomotionActor, dt: number, options: { forceGrounded?: boolean } = {}): void {
    let target = 0;
    const actorPoint = { x: actor.position.x, z: actor.position.z };

    if (options.forceGrounded) {
      actor.activeFixtureId = null;
    } else {
      const active = actor.activeFixtureId ? this.interactableById.get(actor.activeFixtureId) : undefined;
      if (active) {
        if (pointInInteractableRaisedFootprint(actorPoint, active, 1.2)) {
          target = Math.max(target, active.height);
        } else {
          actor.activeFixtureId = null;
        }
      }

      for (const fixture of this.autoInteractables) {
        if (pointInInteractableRaisedFootprint(actorPoint, fixture, 0.8)) {
          target = Math.max(target, fixture.height);
        }
      }
    }

    actor.heightTarget = target;
    const t = 1 - Math.pow(0.001, dt);
    actor.height += (actor.heightTarget - actor.height) * t;
    if (Math.abs(actor.height) < 0.01) {
      actor.height = 0;
    }
  }

  resolveNearbyObstacles(
    point: Vec2,
    radius: number,
    actor: Pick<LocomotionActor, "activeFixtureId" | "jumpHeight">,
    allowJumpBypass = true
  ): Vec2 {
    let next = point;
    this.world.obstacleIndex.forNearby(
      point,
      radius,
      (obstacle) => {
        if (this.shouldBypassObstacle(obstacle, next, actor, allowJumpBypass)) {
          return;
        }
        next = resolveObstacle(next, radius, obstacle);
      },
      2.4
    );
    return next;
  }

  private applyHorizontalMovement(actor: LocomotionActor, dt: number, radius: number, allowJumpBypass = true): void {
    const current = { x: actor.position.x, z: actor.position.z };
    let next = clampToPolygon(
      { x: actor.position.x + actor.velocity.x * dt, z: actor.position.z + actor.velocity.z * dt },
      this.world.boundary,
      3
    );
    next = this.resolveNearbyObstacles(next, radius, actor, allowJumpBypass);
    next = this.resolveSkateBowlExit(current, next, actor.velocity);
    actor.position.set(next.x, this.world.groundY(next), next.z);
  }

  private shouldBypassObstacle(
    obstacle: CollisionObstacle,
    point: Vec2,
    actor: Pick<LocomotionActor, "activeFixtureId" | "jumpHeight">,
    allowJumpBypass: boolean
  ): boolean {
    if (allowJumpBypass && obstacle.jumpable === true && actor.jumpHeight >= (obstacle.jumpBypassMinHeight ?? 0.5)) {
      return true;
    }
    return shouldBypassObstacle(obstacle.id, point, {
      activeFixtureId: actor.activeFixtureId,
      interactables: this.world.interactables
    });
  }

  private resolveSkateBowlExit(current: Vec2, candidate: Vec2, velocity: THREE.Vector3): Vec2 {
    let next = candidate;
    for (const bowl of this.world.skateBowls) {
      const currentLocal = this.skateBowlLocalPoint(bowl, current);
      const nextLocal = this.skateBowlLocalPoint(bowl, next);
      const currentNorm = this.skateBowlNorm(bowl, currentLocal);
      const nextNorm = this.skateBowlNorm(bowl, nextLocal);
      if (currentNorm < 0.96 && nextNorm >= 1 && !this.isSkateBowlExitGap(bowl, nextLocal)) {
        const scale = 0.94 / Math.max(nextNorm, 0.001);
        next = this.skateBowlWorldPoint(bowl, { x: nextLocal.x * scale, z: nextLocal.z * scale });
        velocity.multiplyScalar(0.28);
      }
    }
    return next;
  }

  private skateBowlLocalPoint(bowl: SkateBowlFeature, point: Vec2): Vec2 {
    const dx = point.x - bowl.center.x;
    const dz = point.z - bowl.center.z;
    const cos = Math.cos(bowl.angle);
    const sin = Math.sin(bowl.angle);
    return {
      x: dx * cos + dz * sin,
      z: -dx * sin + dz * cos
    };
  }

  private skateBowlWorldPoint(bowl: SkateBowlFeature, point: Vec2): Vec2 {
    const cos = Math.cos(bowl.angle);
    const sin = Math.sin(bowl.angle);
    return {
      x: bowl.center.x + point.x * cos - point.z * sin,
      z: bowl.center.z + point.x * sin + point.z * cos
    };
  }

  private skateBowlNorm(bowl: SkateBowlFeature, point: Vec2): number {
    return Math.hypot(point.x / bowl.radiusX, point.z / bowl.radiusZ);
  }

  private isSkateBowlExitGap(bowl: SkateBowlFeature, point: Vec2): boolean {
    const angle = Math.atan2(point.z / bowl.radiusZ, point.x / bowl.radiusX);
    const delta = Math.atan2(Math.sin(angle - bowl.exitAngle), Math.cos(angle - bowl.exitAngle));
    return Math.abs(delta) <= bowl.exitWidth;
  }
}

export function asLocomotionActor(player: PlayerRuntimeState): LocomotionActor {
  return player;
}
