import * as THREE from "three";
import {
  START_HEALTH,
  START_PITCH,
  START_POSITION,
  START_SCRAP,
  START_YAW
} from "../gameConfig";
import { createInitialPlayerCondition } from "../playerCondition";
import type { NetworkRemotePlayer } from "../runtimeTypes";
import type { Vec2 } from "../types";
import { createInitialLoadout, type WeaponId } from "../weapons";
import { disposeThreeResources } from "../rendering/disposeThreeResources";

export interface RemotePlayerMeshFactory {
  createWeaponMesh(weaponId: WeaponId, firstPerson?: boolean): THREE.Object3D;
}

export interface RemotePlayerRosterOptions {
  scene: THREE.Scene;
  meshFactory: RemotePlayerMeshFactory;
  groundY: (point: Vec2) => number;
  now?: () => number;
}

const REMOTE_PLAYER_OFFSET_X = 3.2;
const REMOTE_PLAYER_OFFSET_Z = 2.2;

export class RemotePlayerRoster {
  private readonly playersById = new Map<string, NetworkRemotePlayer>();
  private readonly scene: THREE.Scene;
  private readonly meshFactory: RemotePlayerMeshFactory;
  private readonly groundY: (point: Vec2) => number;
  private readonly now: () => number;

  constructor(options: RemotePlayerRosterOptions) {
    this.scene = options.scene;
    this.meshFactory = options.meshFactory;
    this.groundY = options.groundY;
    this.now = options.now ?? (() => performance.now() / 1000);
  }

  get size(): number {
    return this.playersById.size;
  }

  get(id: string): NetworkRemotePlayer | undefined {
    return this.playersById.get(id);
  }

  values(): IterableIterator<NetworkRemotePlayer> {
    return this.playersById.values();
  }

  keys(): IterableIterator<string> {
    return this.playersById.keys();
  }

  add(id: string, name: string): NetworkRemotePlayer {
    const existing = this.playersById.get(id);
    if (existing) {
      existing.name = name;
      return existing;
    }

    const offsetIndex = this.playersById.size + 1;
    const position = remoteSpawnPosition(offsetIndex, this.groundY);
    const loadout = createInitialLoadout();
    const player: NetworkRemotePlayer = {
      id,
      name,
      mesh: this.createMesh(loadout.weaponId),
      weaponIdRendered: loadout.weaponId,
      position,
      velocity: new THREE.Vector3(),
      yaw: START_YAW,
      pitch: START_PITCH,
      health: START_HEALTH,
      scrap: START_SCRAP,
      loadout,
      condition: createInitialPlayerCondition(),
      input: {
        sequence: 0,
        moveX: 0,
        moveZ: 0,
        sprint: false,
        crouch: false,
        aim: false,
        yaw: START_YAW,
        pitch: START_PITCH
      },
      lastInputAt: this.now(),
      lastShotAt: 0,
      shotBloom: 0,
      movementNoiseTimer: 0,
      isSprinting: false,
      crouching: false,
      crouchAmount: 0,
      height: 0,
      heightTarget: 0,
      jumpHeight: 0,
      jumpVelocity: 0,
      activeFixtureId: null
    };
    this.scene.add(player.mesh);
    this.updateMesh(player);
    this.playersById.set(id, player);
    return player;
  }

  remove(id: string): void {
    const player = this.playersById.get(id);
    if (!player) {
      return;
    }
    this.scene.remove(player.mesh);
    disposeThreeResources(player.mesh);
    this.playersById.delete(id);
  }

  clear(): void {
    for (const id of [...this.playersById.keys()]) {
      this.remove(id);
    }
  }

  reset(): void {
    let offsetIndex = 1;
    for (const player of this.playersById.values()) {
      const position = remoteSpawnPosition(offsetIndex, this.groundY);
      player.position.copy(position);
      player.velocity.set(0, 0, 0);
      player.yaw = START_YAW;
      player.pitch = START_PITCH;
      player.health = START_HEALTH;
      player.scrap = START_SCRAP;
      player.loadout = createInitialLoadout();
      player.condition = createInitialPlayerCondition();
      player.lastShotAt = 0;
      player.shotBloom = 0;
      player.movementNoiseTimer = 0;
      player.isSprinting = false;
      player.crouching = false;
      player.crouchAmount = 0;
      player.height = 0;
      player.heightTarget = 0;
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
      player.activeFixtureId = null;
      player.input = {
        ...player.input,
        moveX: 0,
        moveZ: 0,
        sprint: false,
        crouch: false,
        aim: false,
        yaw: player.yaw,
        pitch: player.pitch
      };
      this.updateMesh(player);
      offsetIndex += 1;
    }
  }

  updateMesh(player: NetworkRemotePlayer): void {
    if (player.weaponIdRendered !== player.loadout.weaponId) {
      this.rebuildWeapon(player);
    }
    player.mesh.position.set(player.position.x, player.position.y + player.height + player.jumpHeight, player.position.z);
    player.mesh.rotation.y = player.yaw + Math.PI;
    const crouchScale = 1 - player.crouchAmount * 0.16;
    player.mesh.scale.set(1, Math.max(0.82, crouchScale), 1);
    player.mesh.visible = player.health > 0;
  }

  private createMesh(weaponId: WeaponId): THREE.Group {
    const group = new THREE.Group();
    group.userData.dynamic = true;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8f93, roughness: 0.78, metalness: 0.02 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1e282b, roughness: 0.84, metalness: 0.04 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xcaa47c, roughness: 0.74 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.08, 4, 9), bodyMaterial);
    body.position.y = 1.34;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skinMaterial);
    head.position.y = 2.18;
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.72, 3, 7), darkMaterial);
    leftLeg.position.set(-0.19, 0.52, 0);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.19;
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.78, 3, 7), bodyMaterial);
    leftArm.position.set(-0.5, 1.38, -0.1);
    leftArm.rotation.z = 0.22;
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.5;
    rightArm.rotation.z = -0.22;
    const weapon = this.meshFactory.createWeaponMesh(weaponId, false);
    weapon.name = "remote-weapon";
    weapon.position.set(0.34, 1.25, -0.62);
    weapon.rotation.set(0.2, Math.PI, -0.08);
    weapon.scale.setScalar(0.74);
    group.add(body, head, leftLeg, rightLeg, leftArm, rightArm, weapon);
    return group;
  }

  private rebuildWeapon(player: NetworkRemotePlayer): void {
    const previous = player.mesh.getObjectByName("remote-weapon");
    if (previous) {
      player.mesh.remove(previous);
      disposeThreeResources(previous);
    }
    const weapon = this.meshFactory.createWeaponMesh(player.loadout.weaponId, false);
    weapon.name = "remote-weapon";
    weapon.position.set(0.34, 1.25, -0.62);
    weapon.rotation.set(0.2, Math.PI, -0.08);
    weapon.scale.setScalar(0.74);
    player.mesh.add(weapon);
    player.weaponIdRendered = player.loadout.weaponId;
  }
}

function remoteSpawnPosition(offsetIndex: number, groundY: (point: Vec2) => number): THREE.Vector3 {
  const x = START_POSITION.x + offsetIndex * REMOTE_PLAYER_OFFSET_X;
  const z = START_POSITION.z + offsetIndex * REMOTE_PLAYER_OFFSET_Z;
  return new THREE.Vector3(x, groundY({ x, z }), z);
}
