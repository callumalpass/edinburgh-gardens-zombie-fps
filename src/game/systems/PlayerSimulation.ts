import type { PlayerCondition } from "../playerCondition";
import { PlayerLocomotion, type LocomotionActor, type LocomotionMoveResult } from "./PlayerLocomotion";

export interface SimulatedPlayerActor extends LocomotionActor {
  health: number;
}

export interface PlayerSimulationInput {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  crouch: boolean;
}

export type PlayerMountState =
  | { kind: "foot" }
  | { kind: "bike"; pumpSpeedMultiplier: number }
  | { kind: "skateboard" };

export interface PlayerMotionFrame {
  input: PlayerSimulationInput;
  mount: PlayerMountState;
  movementDisabled?: boolean;
}

export interface PlayerMotionResult extends LocomotionMoveResult {
  skateboardUsable: boolean;
}

/**
 * Canonical motion simulation shared by the in-process player, authoritative
 * network peers, and client prediction/replay. Rendering and network transport
 * stay outside this class; gameplay rules do not know which kind of player is
 * being advanced.
 */
export class PlayerSimulation {
  constructor(private readonly locomotion: PlayerLocomotion) {}

  simulateMotion(
    actor: SimulatedPlayerActor,
    condition: PlayerCondition,
    dt: number,
    frame: PlayerMotionFrame
  ): PlayerMotionResult {
    let remaining = Math.max(0, dt);
    let aggregate: PlayerMotionResult | null = null;
    do {
      const step = Math.min(1 / 60, remaining);
      const result = this.simulateMotionStep(actor, condition, step, frame);
      aggregate = aggregate
        ? { ...result, moved: aggregate.moved || result.moved, skateboardUsable: aggregate.skateboardUsable && result.skateboardUsable }
        : result;
      remaining = Math.max(0, remaining - step);
    } while (remaining > 0.000001);
    return aggregate!;
  }

  private simulateMotionStep(
    actor: SimulatedPlayerActor,
    condition: PlayerCondition,
    step: number,
    frame: PlayerMotionFrame
  ): PlayerMotionResult {
    const mounted = frame.mount.kind !== "foot";
    this.locomotion.updateCrouch(actor, step, frame.input.crouch && !mounted);
    this.locomotion.updateJumpState(actor, step, { disabled: mounted });

    if (actor.health <= 0) {
      actor.velocity.multiplyScalar(0.72);
      this.locomotion.updateFixtureElevation(actor, step, { forceGrounded: mounted });
      return this.idleResult(actor, false);
    }
    if (frame.movementDisabled) {
      actor.velocity.set(0, 0, 0);
      this.locomotion.updateFixtureElevation(actor, step, { forceGrounded: mounted });
      return this.idleResult(actor, frame.mount.kind !== "skateboard");
    }

    const movement = {
      x: frame.input.moveX,
      z: frame.input.moveZ,
      length: Math.hypot(frame.input.moveX, frame.input.moveZ)
    };
    let result: LocomotionMoveResult;
    let skateboardUsable = true;
    if (frame.mount.kind === "bike") {
      result = this.locomotion.moveOnBike(actor, step, movement, {
        wantsSprint: frame.input.sprint,
        condition,
        pumpSpeedMultiplier: frame.mount.pumpSpeedMultiplier
      });
    } else if (frame.mount.kind === "skateboard") {
      const skateboard = this.locomotion.moveOnSkateboard(actor, step, movement, {
        wantsSprint: frame.input.sprint,
        condition
      });
      result = skateboard;
      skateboardUsable = skateboard.usable;
    } else {
      result = this.locomotion.moveOnFoot(actor, step, movement, {
        wantsSprint: frame.input.sprint,
        condition
      });
    }

    this.locomotion.updateFixtureElevation(actor, step, { forceGrounded: mounted });
    return { ...result, skateboardUsable };
  }

  private idleResult(actor: SimulatedPlayerActor, skateboardUsable: boolean): PlayerMotionResult {
    return {
      moved: false,
      sprinting: false,
      surface: this.locomotion.movementSurfaceAt(actor.position),
      skateboardUsable
    };
  }
}
