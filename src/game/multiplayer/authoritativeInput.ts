import type { NetworkInputState } from "./types";

const MAX_PENDING_INPUTS = 180;

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
 * Advances queued client commands by at most the host frame's simulation
 * budget. Each command duration is consumed exactly once, and its sequence is
 * acknowledged only after that duration has actually been simulated.
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
    const duration = Math.min(commandDuration, remaining);
    command.duration = Math.max(0, commandDuration - duration);
    remaining = Math.max(0, remaining - duration);
    const completed = command.duration <= 0.000001;
    slices.push({
      input: { ...command, duration },
      completedSequence: completed ? command.sequence : null
    });
    if (completed) pending.shift();
  }
  return slices;
}
