import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { START_HEALTH, START_POSITION, START_SCRAP } from "../src/game/gameConfig";
import { RemotePlayerRoster, type RemotePlayerMeshFactory } from "../src/game/multiplayer/RemotePlayerRoster";
import { addWeapon, switchWeapon, type WeaponId } from "../src/game/weapons";

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

function createRoster() {
  const scene = new THREE.Scene();
  const meshFactory = new FakeMeshFactory();
  const roster = new RemotePlayerRoster({
    scene,
    meshFactory,
    groundY: (point) => point.x * 0.1 + point.z * 0.01,
    now: () => 123
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

    roster.reset();

    expect(player.position).toBe(position);
    expect(player.velocity).toBe(velocity);
    expect(player.position.x).toBeCloseTo(START_POSITION.x + 3.2);
    expect(player.velocity.lengthSq()).toBe(0);
    expect(player.health).toBe(START_HEALTH);
    expect(player.scrap).toBe(START_SCRAP);
    expect(player.input.moveX).toBe(0);
    expect(player.crouching).toBe(false);
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
});
