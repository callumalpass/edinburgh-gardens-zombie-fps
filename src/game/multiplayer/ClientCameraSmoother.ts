import * as THREE from "three";

/**
 * Keeps the owning client's presented camera continuous while authoritative
 * snapshots replace and replay predicted player state.
 */
export class ClientCameraSmoother {
  private readonly correction = new THREE.Vector3();

  get offset(): THREE.Vector3 {
    return this.correction;
  }

  presentedAnchor(rawAnchor: THREE.Vector3): THREE.Vector3 {
    return rawAnchor.clone().add(this.correction);
  }

  reconcile(previousPresentedAnchor: THREE.Vector3, authoritativeAnchor: THREE.Vector3): void {
    const correction = previousPresentedAnchor.sub(authoritativeAnchor);
    if (correction.lengthSq() < 0.0004) {
      this.correction.set(0, 0, 0);
      return;
    }
    // Preserve the full presented offset. Clamping here creates an immediate
    // camera step precisely when prediction error is largest (for example
    // after a renderer stall or when movement stops under latency).
    this.correction.copy(correction);
  }

  decay(dt: number): void {
    this.correction.multiplyScalar(Math.exp(-Math.max(0, dt) * 12));
    if (this.correction.lengthSq() < 0.000001) this.correction.set(0, 0, 0);
  }

  reset(): void {
    this.correction.set(0, 0, 0);
  }
}
