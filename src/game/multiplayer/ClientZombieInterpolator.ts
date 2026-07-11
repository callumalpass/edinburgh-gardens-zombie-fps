import * as THREE from "three";
import type { Zombie } from "../state";

export interface ClientZombieNetworkTransform {
  position: THREE.Vector3;
  rotationY: number;
}

interface ZombieInterpolationState {
  fromPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  fromRotationY: number;
  targetRotationY: number;
  elapsed: number;
  duration: number;
  lastSnapshotAt: number;
}

const MIN_INTERPOLATION_SECONDS = 1 / 120;
const MAX_SNAPSHOT_INTERVAL_SECONDS = 0.15;
const MIN_PRESENTATION_SECONDS = 0.04;
const MAX_PRESENTATION_SECONDS = 0.12;
const TELEPORT_DISTANCE = 8;

/**
 * Presents authoritative zombie snapshots continuously on network clients.
 *
 * Zombie AI remains host-owned. The client only blends visual/gameplay query
 * positions between consecutive authoritative transforms, one snapshot
 * interval behind the host, rather than leaving zombies frozen between packets.
 */
export class ClientZombieInterpolator {
  private readonly interpolationById = new Map<number, ZombieInterpolationState>();

  reset(zombie: Zombie, transform: ClientZombieNetworkTransform, receivedAt: number): void {
    zombie.position.copy(transform.position);
    zombie.mesh.rotation.y = transform.rotationY;
    this.interpolationById.set(zombie.id, {
      fromPosition: transform.position.clone(),
      targetPosition: transform.position.clone(),
      fromRotationY: transform.rotationY,
      targetRotationY: transform.rotationY,
      elapsed: 1,
      duration: 1,
      lastSnapshotAt: receivedAt
    });
  }

  push(zombie: Zombie, transform: ClientZombieNetworkTransform, receivedAt: number): void {
    const interpolation = this.interpolationById.get(zombie.id);
    if (!interpolation || zombie.position.distanceTo(transform.position) >= TELEPORT_DISTANCE) {
      this.reset(zombie, transform, receivedAt);
      return;
    }

    const snapshotInterval = THREE.MathUtils.clamp(
      receivedAt - interpolation.lastSnapshotAt,
      MIN_INTERPOLATION_SECONDS,
      MAX_SNAPSHOT_INTERVAL_SECONDS
    );
    interpolation.fromPosition.copy(zombie.position);
    interpolation.targetPosition.copy(transform.position);
    interpolation.fromRotationY = zombie.mesh.rotation.y;
    interpolation.targetRotationY = transform.rotationY;
    interpolation.elapsed = 0;
    interpolation.duration = THREE.MathUtils.clamp(
      snapshotInterval,
      MIN_PRESENTATION_SECONDS,
      MAX_PRESENTATION_SECONDS
    );
    interpolation.lastSnapshotAt = receivedAt;
  }

  update(zombies: readonly Zombie[], dt: number): void {
    for (const zombie of zombies) {
      const interpolation = this.interpolationById.get(zombie.id);
      if (!interpolation) continue;
      interpolation.elapsed = Math.min(interpolation.duration, interpolation.elapsed + Math.max(0, dt));
      const alpha = interpolation.duration <= 0 ? 1 : interpolation.elapsed / interpolation.duration;
      zombie.position.lerpVectors(interpolation.fromPosition, interpolation.targetPosition, alpha);
      zombie.mesh.rotation.y = lerpAngle(interpolation.fromRotationY, interpolation.targetRotationY, alpha);
    }
  }

  remove(id: number): void {
    this.interpolationById.delete(id);
  }

  clear(): void {
    this.interpolationById.clear();
  }
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * alpha;
}
