import type * as THREE from "three";
import type { Pickup, ShellCasing, SmokePuff, Tracer, WeaponDrop, Zombie } from "../state";
import type { ThrownDistraction } from "../runtimeTypes";

export class GameEntityStore {
  zombies: Zombie[] = [];
  pickups: Pickup[] = [];
  weaponDrops: WeaponDrop[] = [];
  tracers: Tracer[] = [];
  shells: ShellCasing[] = [];
  smokePuffs: SmokePuff[] = [];
  distractions: ThrownDistraction[] = [];
  readonly searchedAmenityIds = new Set<string>();
  readonly repairedBrokenBikeIds = new Set<string>();

  private nextZombieIdValue = 1;
  private nextPickupIdValue = 1;

  nextZombieId(): number {
    const id = this.nextZombieIdValue;
    this.nextZombieIdValue += 1;
    return id;
  }

  nextPickupId(): number {
    const id = this.nextPickupIdValue;
    this.nextPickupIdValue += 1;
    return id;
  }

  clearSceneEntities(scene: THREE.Scene): void {
    removeMeshes(scene, this.zombies);
    removeMeshes(scene, this.pickups);
    removeMeshes(scene, this.weaponDrops);
    removeMeshes(scene, this.tracers);
    removeMeshes(scene, this.shells);
    removeMeshes(scene, this.smokePuffs);
    removeMeshes(scene, this.distractions);
    this.zombies = [];
    this.pickups = [];
    this.weaponDrops = [];
    this.tracers = [];
    this.shells = [];
    this.smokePuffs = [];
    this.distractions = [];
  }

  clearInteractionMemory(): void {
    this.searchedAmenityIds.clear();
    this.repairedBrokenBikeIds.clear();
  }
}

function removeMeshes(scene: THREE.Scene, entities: readonly { mesh: THREE.Object3D }[]): void {
  for (const entity of entities) {
    scene.remove(entity.mesh);
  }
}
