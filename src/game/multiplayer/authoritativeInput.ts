import type { NetworkAction, NetworkInputState } from "./types";

const MAX_PENDING_INPUTS = 180;
const MAX_PENDING_ACTIONS = 64;
const TARGET_PENDING_SECONDS = 1 / 60;
const MAX_CATCHUP_SECONDS_PER_FRAME = 0.05;

export interface AuthoritativeInputSlice {
  input: NetworkInputState;
  completedSequence: number | null;
}

export function queueAuthoritativeInput(
  pending: NetworkInputState[],
  lastProcessedSequence: number,
  input: NetworkInputState
): boolean {
  if (input.sequence <= lastProcessedSequence || pending.some((candidate) => candidate.sequence === input.sequence)) {
    return false;
  }
  pending.push({ ...input, duration: Math.min(0.25, Math.max(0, input.duration || 0)) });
  pending.sort((a, b) => a.sequence - b.sequence);
  if (pending.length > MAX_PENDING_INPUTS) pending.splice(0, pending.length - MAX_PENDING_INPUTS);
  return true;
}

/**
 * Advances queued client commands atomically. A snapshot must never contain a
 * partially applied command while reporting that command as unacknowledged:
 * the owning client would replay the whole command on top of the partial move
 * and visibly overshoot. The first pending command may exceed the remaining
 * frame budget so low host frame rates cannot starve ordinary 60 Hz commands.
 */
export function consumeAuthoritativeInputBudget(
  pending: NetworkInputState[],
  budget: number
): AuthoritativeInputSlice[] {
  const slices: AuthoritativeInputSlice[] = [];
  let remaining = Math.max(0, budget);
  while (pending.length > 0 && remaining > 0.000001) {
    const command = pending[0]!;
    const commandDuration = Math.max(0, command.duration);
    if (commandDuration <= 0.000001) {
      pending.shift();
      slices.push({ input: { ...command, duration: 0 }, completedSequence: command.sequence });
      continue;
    }
    if (slices.length > 0 && commandDuration > remaining + 0.000001) break;
    pending.shift();
    slices.push({
      input: { ...command, duration: commandDuration },
      completedSequence: command.sequence
    });
    remaining = Math.max(0, remaining - commandDuration);
  }
  return slices;
}

/**
 * Keeps the usual one-tick command buffer for network jitter, but gives the
 * host a bounded amount of extra simulation time when renderer stalls have
 * allowed client commands to accumulate. Without catch-up, new input arrives
 * as quickly as the ordinary frame budget can consume it, so the host stays
 * permanently behind and every snapshot pulls the owning client backwards.
 */
export function authoritativeInputSimulationBudget(
  pending: readonly NetworkInputState[],
  frameBudget: number
): number {
  const available = pending.reduce((total, input) => total + Math.max(0, input.duration), 0);
  if (available <= 0) return 0;
  const ordinaryBudget = Math.max(0, frameBudget);
  const backlogAfterFrame = Math.max(0, available - ordinaryBudget);
  const catchup = Math.min(
    MAX_CATCHUP_SECONDS_PER_FRAME,
    Math.max(0, backlogAfterFrame - TARGET_PENDING_SECONDS)
  );
  return Math.min(available, ordinaryBudget + catchup);
}

export function queueAuthoritativeAction(
  pending: NetworkAction[],
  lastProcessedSequence: number,
  action: NetworkAction
): boolean {
  if (action.sequence <= lastProcessedSequence || pending.some((candidate) => candidate.sequence === action.sequence)) {
    return false;
  }
  pending.push({ ...action });
  pending.sort((a, b) => a.sequence - b.sequence);
  if (pending.length > MAX_PENDING_ACTIONS) pending.splice(0, pending.length - MAX_PENDING_ACTIONS);
  return true;
}

/**
 * WebSocket ordering guarantees the referenced inputs arrived before the
 * action. Execute only after those inputs are authoritative so interaction
 * range, jump state and weapon origin match what the client saw.
 */
export function takeReadyAuthoritativeActions(
  pending: NetworkAction[],
  lastProcessedInputSequence: number
): NetworkAction[] {
  const ready: NetworkAction[] = [];
  while (pending.length > 0) {
    const action = pending[0]!;
    if ((action.inputSequence ?? 0) > lastProcessedInputSequence) break;
    ready.push(action);
    pending.shift();
  }
  return ready;
}
