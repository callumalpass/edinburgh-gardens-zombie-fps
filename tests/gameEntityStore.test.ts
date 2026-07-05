import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GameEntityStore } from "../src/game/runtime/GameEntityStore";

describe("GameEntityStore", () => {
  it("clears all scene-backed runtime collections through one lifecycle boundary", () => {
    const scene = new THREE.Scene();
    const store = new GameEntityStore();
    const zombieMesh = new THREE.Object3D();
    const pickupMesh = new THREE.Object3D();
    const tracerMesh = new THREE.Object3D();
    scene.add(zombieMesh, pickupMesh, tracerMesh);
    store.zombies.push({ mesh: zombieMesh } as never);
    store.pickups.push({ mesh: pickupMesh } as never);
    store.tracers.push({ mesh: tracerMesh } as never);
    store.searchedAmenityIds.add("bin");
    store.repairedBrokenBikeIds.add("flat-bike");

    store.clearSceneEntities(scene);

    expect(scene.children).not.toContain(zombieMesh);
    expect(scene.children).not.toContain(pickupMesh);
    expect(scene.children).not.toContain(tracerMesh);
    expect(store.zombies).toEqual([]);
    expect(store.pickups).toEqual([]);
    expect(store.tracers).toEqual([]);

    store.clearInteractionMemory();
    expect(store.searchedAmenityIds.size).toBe(0);
    expect(store.repairedBrokenBikeIds.size).toBe(0);
  });

  it("keeps entity ids monotonic across scene clears", () => {
    const scene = new THREE.Scene();
    const store = new GameEntityStore();
    const firstZombie = store.nextZombieId();
    const firstPickup = store.nextPickupId();

    store.clearSceneEntities(scene);

    expect(store.nextZombieId()).toBe(firstZombie + 1);
    expect(store.nextPickupId()).toBe(firstPickup + 1);
  });
});
