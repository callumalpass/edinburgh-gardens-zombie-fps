import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ClientCameraSmoother } from "../src/game/multiplayer/ClientCameraSmoother";

describe("ClientCameraSmoother", () => {
  it("preserves the camera position already presented when another snapshot arrives", () => {
    const smoother = new ClientCameraSmoother();
    const predicted = new THREE.Vector3(12, 2, 0);
    const firstAuthority = new THREE.Vector3(7.4, 2, 0);
    smoother.reconcile(predicted.clone(), firstAuthority.clone());
    smoother.decay(1 / 60);

    const presentedBeforeNextSnapshot = smoother.presentedAnchor(firstAuthority);
    const nextAuthority = new THREE.Vector3(7.55, 2, 0);
    smoother.reconcile(presentedBeforeNextSnapshot.clone(), nextAuthority.clone());

    expect(smoother.presentedAnchor(nextAuthority).distanceTo(presentedBeforeNextSnapshot)).toBeLessThan(0.000001);
  });

  it("settles monotonically once authoritative movement stops", () => {
    const smoother = new ClientCameraSmoother();
    const authority = new THREE.Vector3(10, 2, -4);
    smoother.reconcile(new THREE.Vector3(11, 2, -4), authority.clone());
    let previousDistance = smoother.presentedAnchor(authority).distanceTo(authority);

    for (let frame = 0; frame < 90; frame += 1) {
      smoother.decay(1 / 60);
      const presented = smoother.presentedAnchor(authority);
      const distance = presented.distanceTo(authority);
      expect(distance).toBeLessThanOrEqual(previousDistance + 0.000001);
      if (frame % 3 === 0) {
        smoother.reconcile(presented.clone(), authority.clone());
      }
      previousDistance = distance;
    }

    expect(previousDistance).toBeLessThan(0.001);
  });
});
