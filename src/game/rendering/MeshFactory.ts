import * as THREE from "three";
import type { GameMaterials } from "./WorldBuilder";
import type { WeaponId } from "../weapons";
import type { ZombieType } from "../waves";

export type PickupKind = "scrap" | "health" | "ammo";

export class MeshFactory {
  constructor(private readonly materials: GameMaterials) {}

  createWeaponMesh(weaponId: WeaponId, firstPerson = false): THREE.Group {
    const group = new THREE.Group();
    const isLong = weaponId === "rifle";
    const isShotgun = weaponId === "shotgun";
    const isSmg = weaponId === "smg";
    const bodyColor = weaponId === "shotgun" ? 0x5f4630 : weaponId === "smg" ? 0x2e3536 : weaponId === "rifle" ? 0x4f4a37 : 0x363d3b;
    const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x202629, metalness: 0.45, roughness: 0.42 });
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.58, metalness: isSmg ? 0.25 : 0.08 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.25, roughness: 0.44 });
    const length = isLong ? 1.55 : isShotgun ? 1.35 : isSmg ? 0.86 : 1.08;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, length), bodyMaterial);
    body.position.z = -0.24;
    body.castShadow = true;
    group.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, length * 0.9, 10), metalMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.08, -length * 0.62);
    barrel.castShadow = true;
    group.add(barrel);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.16), bodyMaterial);
    grip.position.set(0, -0.24, firstPerson ? 0.2 : 0.12);
    grip.rotation.x = -0.28;
    grip.castShadow = true;
    group.add(grip);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, isSmg ? 0.22 : 0.42), bodyMaterial);
    stock.position.set(0, -0.01, length * 0.48);
    stock.castShadow = true;
    group.add(stock);

    if (isShotgun || isLong) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.48), accentMaterial);
      rail.position.set(0, 0.2, -0.1);
      rail.castShadow = true;
      group.add(rail);
    }

    if (weaponId === "rifle" || weaponId === "carbine") {
      const opticLength = weaponId === "rifle" ? 0.58 : 0.34;
      const opticRadius = weaponId === "rifle" ? 0.085 : 0.068;
      const optic = new THREE.Mesh(new THREE.CylinderGeometry(opticRadius, opticRadius, opticLength, 14), metalMaterial);
      optic.rotation.x = Math.PI / 2;
      optic.position.set(0, 0.27, -0.18);
      optic.castShadow = true;
      group.add(optic);

      const lensMaterial = new THREE.MeshBasicMaterial({ color: 0x78a9a0, transparent: true, opacity: 0.72 });
      for (const z of [-0.18 - opticLength / 2 - 0.012, -0.18 + opticLength / 2 + 0.012]) {
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(opticRadius * 0.9, opticRadius * 0.9, 0.018, 14), lensMaterial);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.27, z);
        group.add(lens);
      }

      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, opticLength * 0.72), metalMaterial);
      mount.position.set(0, 0.19, -0.18);
      mount.castShadow = true;
      group.add(mount);
    }

    if (firstPerson) {
      const handMaterial = new THREE.MeshStandardMaterial({ color: 0xb88962, roughness: 0.74 });
      const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x314038, roughness: 0.86 });
      for (const side of [-1, 1]) {
        const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.42, 4, 8), sleeveMaterial);
        sleeve.position.set(side * 0.18, -0.3, 0.18);
        sleeve.rotation.z = side * 0.35;
        group.add(sleeve);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), handMaterial);
        hand.position.set(side * 0.1, -0.21, -0.18);
        group.add(hand);
      }
    }

    return group;
  }

  createWeaponDropMesh(weaponId: WeaponId): THREE.Object3D {
    const group = this.createWeaponMesh(weaponId, false);
    group.scale.setScalar(2.0);
    group.rotation.x = 0.16;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.025, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0x61a8d3, transparent: true, opacity: 0.7 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.28;
    group.add(halo);
    return group;
  }

  createZombieMesh(type: ZombieType): THREE.Group {
    const group = new THREE.Group();
    const bodyScale = type === "bloater" ? 1.45 : type === "sprinter" ? 0.84 : 1;
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: type === "bloater" ? 0x71815b : type === "sprinter" ? 0x657556 : 0x6f7752,
      roughness: 0.94
    });
    const shirtMaterial = new THREE.MeshStandardMaterial({ color: type === "sprinter" ? 0x4d5548 : 0x3f4b3b, roughness: 0.9 });
    const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x282d2b, roughness: 0.88 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.72 * bodyScale, 1.55 * bodyScale, 5, 12), shirtMaterial);
    body.position.y = 1.48 * bodyScale;
    body.castShadow = true;
    body.name = "body";
    group.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * bodyScale, 2), skinMaterial);
    head.position.set(0.06 * bodyScale, 2.92 * bodyScale, -0.02);
    head.rotation.z = type === "sprinter" ? -0.12 : 0.1;
    head.castShadow = true;
    head.name = "head";
    group.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34 * bodyScale, 0.12 * bodyScale, 0.24 * bodyScale), skinMaterial);
    jaw.position.set(0.04 * bodyScale, 2.72 * bodyScale, -0.28 * bodyScale);
    jaw.castShadow = true;
    group.add(jaw);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: type === "bloater" ? 0xf6a84b : 0xe05b43 });
    for (const x of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMaterial);
      eye.position.set(x * bodyScale, 2.98 * bodyScale, -0.42 * bodyScale);
      group.add(eye);
    }
    const arms: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * bodyScale, 1.1 * bodyScale, 4, 8), skinMaterial);
      arm.position.set(side * 0.78 * bodyScale, 1.68 * bodyScale, -0.18 * bodyScale);
      arm.rotation.z = side * 0.28;
      arm.rotation.x = -0.85;
      arm.castShadow = true;
      arms.push(arm);
      group.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17 * bodyScale, 1.0 * bodyScale, 4, 8), pantsMaterial);
      leg.position.set(side * 0.25 * bodyScale, 0.48 * bodyScale, 0);
      leg.castShadow = true;
      leg.name = side < 0 ? "leftLeg" : "rightLeg";
      group.add(leg);
    }
    const woundMaterial = new THREE.MeshBasicMaterial({ color: 0x7f2d24, transparent: true, opacity: 0.85 });
    const wound = new THREE.Mesh(new THREE.CircleGeometry(0.18 * bodyScale, 12), woundMaterial);
    wound.position.set(-0.22 * bodyScale, 1.84 * bodyScale, -0.68 * bodyScale);
    wound.rotation.x = -0.15;
    group.add(wound);
    group.userData.arms = arms;
    group.userData.head = head;
    return group;
  }

  createPickupMesh(type: PickupKind): THREE.Object3D {
    const color = type === "ammo" ? 0xd4aa4c : type === "health" ? 0xc84138 : 0x9ebf86;
    const geometry =
      type === "ammo" ? new THREE.BoxGeometry(1.1, 0.7, 1.6) : type === "health" ? new THREE.OctahedronGeometry(0.9) : new THREE.DodecahedronGeometry(0.75);
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.55 }));
  }

}
