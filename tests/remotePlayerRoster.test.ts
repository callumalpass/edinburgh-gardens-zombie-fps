import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { START_HEALTH, START_POSITION, START_SCRAP } from "../src/game/gameConfig";
import { RemotePlayerRoster, type RemotePlayerMeshFactory } from "../src/game/multiplayer/RemotePlayerRoster";
import { addWeapon, switchWeapon, type WeaponId } from "../src/game/weapons";
import type { AvatarId } from "../src/game/characters";

class FakeMeshFactory implements RemotePlayerMeshFactory {
  readonly weapons: WeaponId[] = [];

  createWeaponMesh(weaponId: WeaponId): THREE.Object3D {
    this.weapons.push(weaponId);
    const group = new THREE.Group();
    group.userData.weaponId = weaponId;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial()));
    return group;
  }
}

function createRoster(
  loadCharacterAsset?: (avatarId: AvatarId) => Promise<{ root: THREE.Group; animations: THREE.AnimationClip[] }>,
  now: () => number = () => 123
) {
  const scene = new THREE.Scene();
  const meshFactory = new FakeMeshFactory();
  const roster = new RemotePlayerRoster({
    scene,
    meshFactory,
    groundY: (point) => point.x * 0.1 + point.z * 0.01,
    now,
    loadCharacterAsset
  });
  return { scene, meshFactory, roster };
}

describe("RemotePlayerRoster", () => {
  it("adds remote players at deterministic co-op spawn offsets", () => {
    const { scene, roster } = createRoster();

    const first = roster.add("peer-1", "One");
    const renamed = roster.add("peer-1", "Renamed");
    const second = roster.add("peer-2", "Two");

    expect(renamed).toBe(first);
    expect(first.name).toBe("Renamed");
    expect(roster.size).toBe(2);
    expect(scene.children).toContain(first.mesh);
    expect(scene.children).toContain(second.mesh);
    expect(first.position.x).toBeCloseTo(START_POSITION.x + 3.2);
    expect(first.position.z).toBeCloseTo(START_POSITION.z + 2.2);
    expect(second.position.x).toBeCloseTo(START_POSITION.x + 6.4);
    expect(second.position.z).toBeCloseTo(START_POSITION.z + 4.4);
    expect(first.health).toBe(START_HEALTH);
    expect(first.scrap).toBe(START_SCRAP);
    expect(first.lastInputAt).toBe(123);
  });

  it("rebuilds the rendered weapon when loadout changes", () => {
    const { meshFactory, roster } = createRoster();
    const player = roster.add("peer-1", "One");

    player.loadout = switchWeapon(addWeapon(player.loadout, "carbine"), "carbine");
    roster.updateMesh(player);

    expect(player.weaponIdRendered).toBe("carbine");
    expect(player.mesh.getObjectByName("remote-weapon")?.userData.weaponId).toBe("carbine");
    expect(meshFactory.weapons).toEqual(["knife", "carbine"]);
  });

  it("resets existing players without replacing vector instances", () => {
    const { roster } = createRoster();
    const player = roster.add("peer-1", "One");
    const position = player.position;
    const velocity = player.velocity;
    player.position.set(99, 5, -10);
    player.velocity.set(1, 2, 3);
    player.health = 3;
    player.scrap = 0;
    player.input.moveX = 1;
    player.crouching = true;
    player.intermissionUpgradeWave = 4;

    roster.reset();

    expect(player.position).toBe(position);
    expect(player.velocity).toBe(velocity);
    expect(player.position.x).toBeCloseTo(START_POSITION.x + 3.2);
    expect(player.velocity.lengthSq()).toBe(0);
    expect(player.health).toBe(START_HEALTH);
    expect(player.scrap).toBe(START_SCRAP);
    expect(player.input.moveX).toBe(0);
    expect(player.crouching).toBe(false);
    expect(player.intermissionUpgradeWave).toBe(0);
    expect(player.loadout.weaponId).toBe("knife");
  });

  it("removes remote meshes from the scene", () => {
    const { scene, roster } = createRoster();
    const first = roster.add("peer-1", "One");
    const second = roster.add("peer-2", "Two");

    roster.remove("peer-1");

    expect(scene.children).not.toContain(first.mesh);
    expect(scene.children).toContain(second.mesh);
    expect(roster.get("peer-1")).toBeUndefined();

    roster.clear();

    expect(scene.children).not.toContain(second.mesh);
    expect(roster.size).toBe(0);
  });

  it("installs Blender avatars, sockets weapons and transitions animation state", async () => {
    const loadCharacterAsset = vi.fn(async () => {
      const root = new THREE.Group();
      root.userData.kind = "blender-player-avatar";
      const socket = new THREE.Group();
      socket.name = "WeaponSocket";
      root.add(socket);
      return {
        root,
        animations: ["Idle", "Walk", "Run", "Crouch", "CrouchWalk", "Aim", "AimLongGun", "AimSidearm", "MeleeReady", "Melee", "Reload", "Jump", "BikeIdle", "BikeRide", "Skateboard", "Downed"]
          .map((name) => new THREE.AnimationClip(name, 0.5, []))
      };
    });
    const { roster } = createRoster(loadCharacterAsset);
    const player = roster.add("peer-1", "Milo", "milo");
    await vi.waitFor(() => expect(player.avatarVisual).not.toBeNull());

    expect(loadCharacterAsset).toHaveBeenCalledWith("milo");
    expect(player.mesh.getObjectByName("remote-weapon")?.parent?.name).toBe("WeaponSocket");
    expect(player.activeAnimation).toBe("Idle");

    player.velocity.set(1, 0, 0);
    roster.updateAnimations(0.1);
    expect(player.activeAnimation).toBe("Walk");
    player.isSprinting = true;
    roster.updateAnimations(0.1);
    expect(player.activeAnimation).toBe("Run");
    player.crouchAmount = 1;
    roster.updateAnimations(0.1);
    expect(player.activeAnimation).toBe("CrouchWalk");
    player.crouchAmount = 0;
    player.velocity.set(0, 0, 0);
    player.input.aim = true;
    player.loadout = switchWeapon(addWeapon(player.loadout, "carbine"), "carbine");
    roster.updateMesh(player);
    roster.updateAnimations(0.1);
    expect(player.activeAnimation).toBe("AimLongGun");
    expect(player.mesh.getObjectByName("remote-weapon")?.userData.mountProfile).toBe("long-gun");
    player.loadout = switchWeapon(addWeapon(player.loadout, "flareGun"), "flareGun");
    roster.updateMesh(player);
    roster.updateAnimations(0.1);
    expect(player.activeAnimation).toBe("AimSidearm");
    player.input.aim = false;
    player.mountedBikeId = "bike-1";
    roster.updateAnimations(0.1);
    expect(player.activeAnimation).toBe("BikeIdle");
    player.velocity.set(2, 0, 0);
    roster.updateAnimations(0.1);
    expect(player.activeAnimation).toBe("BikeRide");
    player.mountedBikeId = null;
    player.skateboardMounted = true;
    roster.updateAnimations(0.1);
    expect(player.activeAnimation).toBe("Skateboard");
    roster.triggerAnimation(player, "Melee");
    expect(player.activeAnimation).toBe("Melee");
    expect(player.animationOverride?.name).toBe("Melee");
  });

  it("reloads only the visual when a teammate changes avatar", async () => {
    const loadCharacterAsset = vi.fn(async (avatarId) => {
      const root = new THREE.Group();
      root.userData.avatarId = avatarId;
      root.add(Object.assign(new THREE.Group(), { name: "WeaponSocket" }));
      return { root, animations: [new THREE.AnimationClip("Idle", 1, [])] };
    });
    const { roster } = createRoster(loadCharacterAsset);
    const player = roster.add("peer-1", "One", "milo");
    const mesh = player.mesh;
    await vi.waitFor(() => expect(player.avatarVisual).not.toBeNull());

    roster.setAvatar(player, "maeve");
    await vi.waitFor(() => expect(player.avatarVisual?.userData.avatarId).toBe("maeve"));
    expect(player.mesh).toBe(mesh);
    expect(player.avatarId).toBe("maeve");
    expect(loadCharacterAsset).toHaveBeenLastCalledWith("maeve");
  });

  it("interpolates network transforms instead of teleporting between snapshots", () => {
    let now = 0;
    const { roster } = createRoster(undefined, () => now);
    const player = roster.add("peer-1", "One");
    roster.applyNetworkTransform(player, {
      position: new THREE.Vector3(0, 1, 0),
      yaw: 3.1,
      height: 0,
      jumpHeight: 0,
      crouching: false
    });

    now = 0.06;
    roster.applyNetworkTransform(player, {
      position: new THREE.Vector3(6, 2, -3),
      yaw: -3.1,
      height: 1,
      jumpHeight: 0.6,
      crouching: true
    });

    expect(player.position.x).toBe(0);
    roster.updateAnimations(0.03);
    expect(player.position.x).toBeCloseTo(3);
    expect(player.position.y).toBeCloseTo(1.5);
    expect(player.height).toBeCloseTo(0.5);
    expect(player.jumpHeight).toBeCloseTo(0.3);
    expect(Math.abs(player.yaw)).toBeGreaterThan(3);
    roster.updateAnimations(0.03);
    expect(player.position.x).toBeCloseTo(6);
    expect(player.position.z).toBeCloseTo(-3);
    expect(player.crouchAmount).toBeCloseTo(1);
  });
});
