import type { NetworkInputState } from "./types";

export const NETWORK_INPUT_STALE_SECONDS = 0.3;
const MAX_PENDING_INPUTS = 12;

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
 * Movement input is state, not elapsed simulation time. The host consumes the
 * newest state once per authoritative frame instead of fast-forwarding a
 * packet backlog in one render frame.
 */
export function consumeLatestAuthoritativeInput(pending: NetworkInputState[]): NetworkInputState | null {
  const latest = pending.at(-1) ?? null;
  pending.length = 0;
  return latest;
}

export function inputForAuthoritativeFrame(
  input: NetworkInputState,
  lastInputAt: number,
  now: number,
  staleAfter = NETWORK_INPUT_STALE_SECONDS
): NetworkInputState {
  if (now - lastInputAt <= staleAfter) return input;
  return {
    ...input,
    moveX: 0,
    moveZ: 0,
    sprint: false,
    crouch: false,
    aim: false
  };
}
