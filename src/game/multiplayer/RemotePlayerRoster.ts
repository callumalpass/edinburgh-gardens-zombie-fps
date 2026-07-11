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
import { DEFAULT_AVATAR_ID, avatarDefinition, normalizeAvatarId, type AvatarId } from "../characters";
import { instantiateCharacterAsset, type CharacterAssetInstance } from "../rendering/CharacterAsset";

export interface RemotePlayerMeshFactory {
  createWeaponMesh(weaponId: WeaponId, firstPerson?: boolean): THREE.Object3D;
}

export interface RemotePlayerRosterOptions {
  scene: THREE.Scene;
  meshFactory: RemotePlayerMeshFactory;
  groundY: (point: Vec2) => number;
  now?: () => number;
  loadCharacterAsset?: (avatarId: AvatarId) => Promise<CharacterAssetInstance>;
}

const REMOTE_PLAYER_OFFSET_X = 3.2;
const REMOTE_PLAYER_OFFSET_Z = 2.2;

export interface RemotePlayerNetworkTransform {
  position: THREE.Vector3;
  yaw: number;
  height: number;
  jumpHeight: number;
  crouching: boolean;
}

interface RemoteInterpolationState {
  fromPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  fromYaw: number;
  targetYaw: number;
  fromHeight: number;
  targetHeight: number;
  fromJumpHeight: number;
  targetJumpHeight: number;
  fromCrouchAmount: number;
  targetCrouchAmount: number;
  elapsed: number;
  duration: number;
  lastSnapshotAt: number;
}

export class RemotePlayerRoster {
  private readonly playersById = new Map<string, NetworkRemotePlayer>();
  private readonly interpolationById = new Map<string, RemoteInterpolationState>();
  private readonly scene: THREE.Scene;
  private readonly meshFactory: RemotePlayerMeshFactory;
  private readonly groundY: (point: Vec2) => number;
  private readonly now: () => number;
  private readonly loadCharacterAsset: ((avatarId: AvatarId) => Promise<CharacterAssetInstance>) | null;

  constructor(options: RemotePlayerRosterOptions) {
    this.scene = options.scene;
    this.meshFactory = options.meshFactory;
    this.groundY = options.groundY;
    this.now = options.now ?? (() => performance.now() / 1000);
    this.loadCharacterAsset = options.loadCharacterAsset ?? (typeof window === "undefined" ? null : instantiateCharacterAsset);
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

  add(id: string, name: string, avatarValue: unknown = DEFAULT_AVATAR_ID): NetworkRemotePlayer {
    const avatarId = normalizeAvatarId(avatarValue);
    const existing = this.playersById.get(id);
    if (existing) {
      existing.name = name;
      this.setAvatar(existing, avatarId);
      return existing;
    }

    const offsetIndex = this.playersById.size + 1;
    const position = remoteSpawnPosition(offsetIndex, this.groundY);
    const loadout = createInitialLoadout();
    const player: NetworkRemotePlayer = {
      id,
      name,
      avatarId,
      mesh: this.createMesh(loadout.weaponId, avatarId),
      avatarVisual: null,
      animationMixer: null,
      animationActions: new Map(),
      activeAnimation: "",
      animationOverride: null,
      weaponIdRendered: loadout.weaponId,
      position,
      velocity: new THREE.Vector3(),
      yaw: START_YAW,
      pitch: START_PITCH,
      health: START_HEALTH,
      scrap: START_SCRAP,
      kills: 0,
      intermissionUpgradeWave: 0,
      reviveProtectionTimer: 0,
      loadout,
      condition: createInitialPlayerCondition(),
      input: {
        sequence: 0,
        duration: 0,
        moveX: 0,
        moveZ: 0,
        sprint: false,
        crouch: false,
        aim: false,
        yaw: START_YAW,
        pitch: START_PITCH
      },
      pendingInputs: [],
      lastProcessedInputSequence: 0,
      lastProcessedActionSequence: 0,
      lastInputAt: this.now(),
      lastShotAt: 0,
      shotSequence: 0,
      shotFlashTimer: 0,
      shotBloom: 0,
      movementNoiseTimer: 0,
      isSprinting: false,
      crouching: false,
      crouchAmount: 0,
      height: 0,
      heightTarget: 0,
      jumpHeight: 0,
      jumpVelocity: 0,
      activeFixtureId: null,
      mountedBikeId: null,
      skateboardMounted: false,
      inventory: [],
      carriedItem: null
    };
    this.scene.add(player.mesh);
    this.updateMesh(player);
    this.playersById.set(id, player);
    void this.loadAvatar(player, avatarId);
    return player;
  }

  setAvatar(player: NetworkRemotePlayer, avatarValue: unknown): void {
    const avatarId = normalizeAvatarId(avatarValue);
    if (player.avatarId === avatarId) return;
    const weapon = player.mesh.getObjectByName("remote-weapon");
    weapon?.parent?.remove(weapon);
    if (player.avatarVisual) {
      player.mesh.remove(player.avatarVisual);
      disposeThreeResources(player.avatarVisual);
    }
    const previousPlaceholder = player.mesh.getObjectByName("avatar-placeholder");
    if (previousPlaceholder) {
      player.mesh.remove(previousPlaceholder);
      disposeThreeResources(previousPlaceholder);
    }
    player.avatarId = avatarId;
    player.avatarVisual = null;
    player.animationMixer?.stopAllAction();
    player.animationMixer = null;
    player.animationActions.clear();
    player.activeAnimation = "";
    player.animationOverride = null;
    player.mesh.add(this.createPlaceholder(avatarId));
    if (weapon) {
      player.mesh.add(weapon);
      this.positionPlaceholderWeapon(weapon);
    }
    this.updateMesh(player);
    void this.loadAvatar(player, avatarId);
  }

  remove(id: string): void {
    const player = this.playersById.get(id);
    if (!player) {
      return;
    }
    player.animationMixer?.stopAllAction();
    this.scene.remove(player.mesh);
    disposeThreeResources(player.mesh);
    this.playersById.delete(id);
    this.interpolationById.delete(id);
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
      player.kills = 0;
      player.intermissionUpgradeWave = 0;
      player.reviveProtectionTimer = 0;
      player.loadout = createInitialLoadout();
      player.condition = createInitialPlayerCondition();
      player.lastShotAt = 0;
      player.shotSequence = 0;
      player.shotFlashTimer = 0;
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
      player.mountedBikeId = null;
      player.skateboardMounted = false;
      player.animationOverride = null;
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
      player.pendingInputs = [];
      player.lastProcessedInputSequence = player.input.sequence;
      player.lastProcessedActionSequence = 0;
      player.inventory = [];
      player.carriedItem = null;
      this.updateMesh(player);
      this.interpolationById.delete(player.id);
      offsetIndex += 1;
    }
  }

  updateMesh(player: NetworkRemotePlayer): void {
    if (player.weaponIdRendered !== player.loadout.weaponId) {
      this.rebuildWeapon(player);
    }
    player.mesh.position.set(player.position.x, player.position.y + player.height + player.jumpHeight, player.position.z);
    player.mesh.rotation.y = player.yaw;
    const crouchScale = 1 - player.crouchAmount * 0.16;
    player.mesh.scale.set(1, player.avatarVisual ? 1 : Math.max(0.82, crouchScale), 1);
    player.mesh.visible = true;
  }

  updateAnimations(dt: number): void {
    this.updateNetworkTransforms(dt);
    for (const player of this.playersById.values()) {
      player.shotFlashTimer = Math.max(0, player.shotFlashTimer - dt);
      const shotFlash = player.mesh.getObjectByName("remote-shot-flash");
      if (shotFlash) shotFlash.visible = player.shotFlashTimer > 0;
      const mixer = player.animationMixer;
      if (!mixer) continue;
      if (player.animationOverride) {
        player.animationOverride.remaining -= dt;
        if (player.animationOverride.remaining > 0) {
          mixer.update(dt);
          continue;
        }
        player.animationOverride = null;
      }
      const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
      const desired = player.health <= 0
        ? "Downed"
        : player.jumpHeight > 0.04
          ? "Jump"
          : player.mountedBikeId
            ? horizontalSpeed > 0.3 ? "BikeRide" : "BikeIdle"
            : player.skateboardMounted
              ? "Skateboard"
              : player.crouchAmount > 0.45
                ? horizontalSpeed > 0.3 ? "CrouchWalk" : "Crouch"
                : player.input.aim
                  ? aimAnimationForWeapon(player.loadout.weaponId)
                  : horizontalSpeed > 0.3
                    ? player.isSprinting ? "Run" : "Walk"
                    : "Idle";
      this.transitionAnimation(player, desired);
      mixer.update(dt);
    }
  }

  applyNetworkTransform(player: NetworkRemotePlayer, transform: RemotePlayerNetworkTransform, receivedAt = this.now()): void {
    const existing = this.interpolationById.get(player.id);
    if (!existing) {
      player.position.copy(transform.position);
      player.yaw = transform.yaw;
      player.height = transform.height;
      player.jumpHeight = transform.jumpHeight;
      player.crouching = transform.crouching;
      player.crouchAmount = transform.crouching ? 1 : 0;
      player.velocity.set(0, 0, 0);
      this.interpolationById.set(player.id, {
        fromPosition: transform.position.clone(),
        targetPosition: transform.position.clone(),
        fromYaw: transform.yaw,
        targetYaw: transform.yaw,
        fromHeight: transform.height,
        targetHeight: transform.height,
        fromJumpHeight: transform.jumpHeight,
        targetJumpHeight: transform.jumpHeight,
        fromCrouchAmount: player.crouchAmount,
        targetCrouchAmount: player.crouchAmount,
        elapsed: 1,
        duration: 1,
        lastSnapshotAt: receivedAt
      });
      this.updateMesh(player);
      return;
    }

    const snapshotInterval = THREE.MathUtils.clamp(receivedAt - existing.lastSnapshotAt, 1 / 120, 0.15);
    player.velocity.copy(transform.position).sub(existing.targetPosition).divideScalar(snapshotInterval);
    existing.fromPosition.copy(player.position);
    existing.targetPosition.copy(transform.position);
    existing.fromYaw = player.yaw;
    existing.targetYaw = transform.yaw;
    existing.fromHeight = player.height;
    existing.targetHeight = transform.height;
    existing.fromJumpHeight = player.jumpHeight;
    existing.targetJumpHeight = transform.jumpHeight;
    existing.fromCrouchAmount = player.crouchAmount;
    existing.targetCrouchAmount = transform.crouching ? 1 : 0;
    existing.elapsed = 0;
    existing.duration = THREE.MathUtils.clamp(snapshotInterval, 0.045, 0.12);
    existing.lastSnapshotAt = receivedAt;
    player.crouching = transform.crouching;
  }

  private updateNetworkTransforms(dt: number): void {
    for (const [id, interpolation] of this.interpolationById) {
      const player = this.playersById.get(id);
      if (!player) continue;
      interpolation.elapsed = Math.min(interpolation.duration, interpolation.elapsed + dt);
      const alpha = interpolation.duration <= 0 ? 1 : interpolation.elapsed / interpolation.duration;
      player.position.lerpVectors(interpolation.fromPosition, interpolation.targetPosition, alpha);
      player.yaw = lerpAngle(interpolation.fromYaw, interpolation.targetYaw, alpha);
      player.height = THREE.MathUtils.lerp(interpolation.fromHeight, interpolation.targetHeight, alpha);
      player.jumpHeight = THREE.MathUtils.lerp(interpolation.fromJumpHeight, interpolation.targetJumpHeight, alpha);
      player.crouchAmount = THREE.MathUtils.lerp(interpolation.fromCrouchAmount, interpolation.targetCrouchAmount, alpha);
      this.updateMesh(player);
    }
  }

  triggerAnimation(player: NetworkRemotePlayer, name: "Melee" | "Reload" | "Jump"): void {
    const action = player.animationActions.get(name);
    if (!action) return;
    this.transitionAnimation(player, name, true);
    player.animationOverride = { name, remaining: Math.max(0.12, action.getClip().duration) };
  }

  triggerShot(player: NetworkRemotePlayer, melee: boolean): void {
    if (melee) {
      this.triggerAnimation(player, "Melee");
      return;
    }
    const weapon = player.mesh.getObjectByName("remote-weapon");
    if (!weapon) return;
    let flash = weapon.getObjectByName("remote-shot-flash");
    if (!flash) {
      flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 7, 5),
        new THREE.MeshBasicMaterial({ color: 0xffc35f })
      );
      flash.name = "remote-shot-flash";
      flash.position.set(0, 0.08, -1.1);
      flash.renderOrder = 20;
      weapon.add(flash);
    }
    flash.visible = true;
    player.shotFlashTimer = 0.09;
  }

  private createMesh(weaponId: WeaponId, avatarId: AvatarId): THREE.Group {
    const group = new THREE.Group();
    group.userData.dynamic = true;
    group.add(this.createPlaceholder(avatarId));
    const weapon = this.meshFactory.createWeaponMesh(weaponId, false);
    weapon.name = "remote-weapon";
    this.positionPlaceholderWeapon(weapon);
    group.add(weapon);
    return group;
  }

  private createPlaceholder(avatarId: AvatarId): THREE.Group {
    const placeholder = new THREE.Group();
    placeholder.name = "avatar-placeholder";
    const appearance = avatarDefinition(avatarId).appearance;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: appearance.sleeve, roughness: 0.78, metalness: 0.02 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1e282b, roughness: 0.84, metalness: 0.04 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: appearance.skin, roughness: 0.74 });
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
    placeholder.add(body, head, leftLeg, rightLeg, leftArm, rightArm);
    return placeholder;
  }

  private rebuildWeapon(player: NetworkRemotePlayer): void {
    const previous = player.mesh.getObjectByName("remote-weapon");
    if (previous) {
      previous.parent?.remove(previous);
      disposeThreeResources(previous);
    }
    const weapon = this.meshFactory.createWeaponMesh(player.loadout.weaponId, false);
    weapon.name = "remote-weapon";
    this.attachWeapon(player, weapon);
    player.weaponIdRendered = player.loadout.weaponId;
  }

  private positionPlaceholderWeapon(weapon: THREE.Object3D): void {
    weapon.position.set(0.34, 1.25, -0.62);
    weapon.rotation.set(0.2, Math.PI, -0.08);
    weapon.scale.setScalar(0.74);
  }

  private attachWeapon(player: NetworkRemotePlayer, weapon: THREE.Object3D): void {
    const socket = player.avatarVisual?.getObjectByName("WeaponSocket");
    if (!socket) {
      player.mesh.add(weapon);
      this.positionPlaceholderWeapon(weapon);
      return;
    }
    socket.add(weapon);
    weapon.position.set(0, 0, 0);
    weapon.rotation.set(0, 0, 0);
    weapon.scale.setScalar(weaponScale(player.loadout.weaponId));
    weapon.userData.mountProfile = weaponMountProfile(player.loadout.weaponId);
  }

  private async loadAvatar(player: NetworkRemotePlayer, avatarId: AvatarId): Promise<void> {
    if (!this.loadCharacterAsset) return;
    try {
      const asset = await this.loadCharacterAsset(avatarId);
      if (this.playersById.get(player.id) !== player || player.avatarId !== avatarId) {
        disposeThreeResources(asset.root);
        return;
      }
      const weapon = player.mesh.getObjectByName("remote-weapon");
      weapon?.parent?.remove(weapon);
      const placeholder = player.mesh.getObjectByName("avatar-placeholder");
      if (placeholder) {
        player.mesh.remove(placeholder);
        disposeThreeResources(placeholder);
      }
      if (player.avatarVisual) {
        player.mesh.remove(player.avatarVisual);
        disposeThreeResources(player.avatarVisual);
      }
      asset.root.name = "avatar-visual";
      player.avatarVisual = asset.root;
      player.mesh.add(asset.root);
      player.animationMixer = new THREE.AnimationMixer(asset.root);
      player.animationActions = new Map(asset.animations.map((clip) => [clip.name, player.animationMixer!.clipAction(clip)]));
      player.activeAnimation = "";
      this.transitionAnimation(player, "Idle");
      if (weapon) this.attachWeapon(player, weapon);
      this.updateMesh(player);
    } catch {
      // Keep the deterministic placeholder when a character asset cannot load.
    }
  }

  private transitionAnimation(player: NetworkRemotePlayer, name: string, restart = false): void {
    if ((!restart && player.activeAnimation === name) || !player.animationMixer) return;
    const next = player.animationActions.get(name) ?? player.animationActions.get("Idle");
    if (!next) return;
    const previous = player.animationActions.get(player.activeAnimation);
    previous?.fadeOut(0.16);
    next.reset();
    if (["Melee", "Reload", "Jump", "Downed"].includes(name)) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.fadeIn(0.16).play();
    player.activeAnimation = name;
  }
}

function remoteSpawnPosition(offsetIndex: number, groundY: (point: Vec2) => number): THREE.Vector3 {
  const x = START_POSITION.x + offsetIndex * REMOTE_PLAYER_OFFSET_X;
  const z = START_POSITION.z + offsetIndex * REMOTE_PLAYER_OFFSET_Z;
  return new THREE.Vector3(x, groundY({ x, z }), z);
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

function aimAnimationForWeapon(weaponId: WeaponId): "AimLongGun" | "AimSidearm" | "MeleeReady" {
  if (weaponId === "flareGun") return "AimSidearm";
  if (weaponId === "knife" || weaponId === "machete") return "MeleeReady";
  return "AimLongGun";
}

function weaponMountProfile(weaponId: WeaponId): "long-gun" | "sidearm" | "melee" {
  if (weaponId === "flareGun") return "sidearm";
  if (weaponId === "knife" || weaponId === "machete") return "melee";
  return "long-gun";
}

function weaponScale(weaponId: WeaponId): number {
  if (weaponId === "knife") return 0.72;
  if (weaponId === "machete") return 0.64;
  return 0.58;
}
