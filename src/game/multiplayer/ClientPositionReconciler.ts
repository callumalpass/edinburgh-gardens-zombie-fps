import type { NetworkInputState } from "./types";

/**
 * Retains discrete input commands until the host acknowledges processing them.
 * The owning client installs the authoritative player snapshot, then replays
 * the commands returned by acknowledge() to rebuild its predicted position.
 */
export class ClientPositionReconciler {
  private readonly pendingInputs = new Map<number, NetworkInputState>();
  private lastAcknowledgedSequence = 0;

  record(input: NetworkInputState): void {
    if (input.sequence <= this.lastAcknowledgedSequence) return;
    this.pendingInputs.set(input.sequence, { ...input });
    while (this.pendingInputs.size > 180) {
      const oldest = this.pendingInputs.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.pendingInputs.delete(oldest);
    }
  }

  acknowledge(lastProcessedInputSequence: number): NetworkInputState[] {
    if (lastProcessedInputSequence > this.lastAcknowledgedSequence) {
      this.lastAcknowledgedSequence = lastProcessedInputSequence;
    }
    for (const sequence of [...this.pendingInputs.keys()]) {
      if (sequence <= this.lastAcknowledgedSequence) this.pendingInputs.delete(sequence);
    }
    return [...this.pendingInputs.values()].sort((a, b) => a.sequence - b.sequence);
  }

  reset(lastProcessedInputSequence = 0): void {
    this.lastAcknowledgedSequence = lastProcessedInputSequence;
    this.pendingInputs.clear();
  }
}
