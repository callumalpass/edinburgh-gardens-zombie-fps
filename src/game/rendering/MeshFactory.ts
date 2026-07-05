import * as THREE from "three";
import type { GameMaterials } from "./WorldBuilder";
import type { WeaponId } from "../weapons";
import type { ZombieType } from "../waves";

export type PickupKind = "scrap" | "health" | "ammo";

export class MeshFactory {
  constructor(private readonly materials: GameMaterials) {}

  createWeaponMesh(weaponId: WeaponId, firstPerson = false): THREE.Group {
    const group = new THREE.Group();
    if (weaponId === "knife" || weaponId === "machete") {
      const isMachete = weaponId === "machete";
      const bladeMaterial = new THREE.MeshStandardMaterial({ color: isMachete ? 0xb8b4a4 : 0xc4c0b4, metalness: 0.62, roughness: 0.32 });
      const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xe1dccb, metalness: 0.72, roughness: 0.24 });
      const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x30251d, roughness: 0.78 });
      const guardMaterial = new THREE.MeshStandardMaterial({ color: 0x221f1c, metalness: 0.36, roughness: 0.46 });
      const length = isMachete ? 1.28 : 0.72;
      const width = isMachete ? 0.16 : 0.095;

      const blade = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, length), bladeMaterial);
      blade.position.set(0, 0.08, -length * 0.36);
      blade.rotation.x = isMachete ? -0.08 : -0.02;
      blade.castShadow = true;
      group.add(blade);

      const edge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.28, 0.018, length * 0.92), edgeMaterial);
      edge.position.set(width * 0.42, 0.105, -length * 0.37);
      edge.rotation.x = blade.rotation.x;
      group.add(edge);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.52, 0.22, 4), bladeMaterial);
      tip.rotation.x = Math.PI / 2 + blade.rotation.x;
      tip.rotation.z = Math.PI / 4;
      tip.position.set(0, 0.08, -length * 0.83);
      tip.castShadow = true;
      group.add(tip);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(width * 1.35, 0.15, 0.34), gripMaterial);
      grip.position.set(0, -0.02, length * 0.26);
      grip.rotation.x = -0.16;
      grip.castShadow = true;
      group.add(grip);

      const guard = new THREE.Mesh(new THREE.BoxGeometry(width * 2.4, 0.055, 0.09), guardMaterial);
      guard.position.set(0, 0.04, length * 0.02);
      guard.castShadow = true;
      group.add(guard);

      if (firstPerson) {
        const handMaterial = new THREE.MeshStandardMaterial({ color: 0xb88962, roughness: 0.74 });
        const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x314038, roughness: 0.86 });
        const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.48, 4, 8), sleeveMaterial);
        sleeve.position.set(0.12, -0.34, 0.28);
        sleeve.rotation.set(-0.62, 0.08, 0.22);
        group.add(sleeve);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), handMaterial);
        hand.position.set(0.05, -0.2, 0.1);
        group.add(hand);
      }

      return group;
    }

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
    const bodyScale = type === "bloater" ? 1.45 : type === "sprinter" ? 0.84 : type === "crawler" ? 0.62 : type === "screamer" ? 1.04 : 1;
    const lowPosture = type === "crawler";
    const forwardLean = type === "sprinter" ? -0.16 : type === "screamer" ? -0.08 : type === "crawler" ? 0.52 : type === "bloater" ? 0.06 : -0.04;
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: type === "bloater" ? 0x71815b : type === "sprinter" ? 0x657556 : type === "crawler" ? 0x566344 : type === "screamer" ? 0x85795e : 0x6f7752,
      roughness: 0.94
    });
    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: type === "sprinter" ? 0x4d5548 : type === "crawler" ? 0x344139 : type === "screamer" ? 0x5a443f : 0x3f4b3b,
      roughness: 0.9
    });
    const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x282d2b, roughness: 0.88 });
    const bloodMaterial = new THREE.MeshBasicMaterial({ color: 0x6b1e18, transparent: true, opacity: 0.88 });
    const darkBloodMaterial = new THREE.MeshStandardMaterial({ color: 0x2d1412, roughness: 0.96 });
    const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xb9ae8b, roughness: 0.82 });
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x151612, roughness: 0.96 });
    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x171b19, roughness: 0.84 });
    const bruiseMaterial = new THREE.MeshStandardMaterial({ color: 0x343225, roughness: 0.96 });
    const tornClothMaterial = new THREE.MeshStandardMaterial({
      color: type === "screamer" ? 0x3f312f : type === "crawler" ? 0x26302b : 0x29362e,
      roughness: 0.94
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.72 * bodyScale, 1.55 * bodyScale, 5, 12), shirtMaterial);
    body.position.y = 1.48 * bodyScale;
    body.scale.set(type === "bloater" ? 1.18 : type === "screamer" ? 0.74 : type === "sprinter" ? 0.82 : 0.92, type === "bloater" ? 0.92 : 1.05, type === "bloater" ? 1.08 : 0.78);
    body.rotation.x = forwardLean;
    body.rotation.z = type === "screamer" ? -0.08 : type === "shambler" ? 0.06 : 0;
    body.castShadow = true;
    body.name = "body";
    group.add(body);

    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.34 * bodyScale, 0.22 * bodyScale, 0.36 * bodyScale), shirtMaterial);
    shoulders.position.set(0, 2.18 * bodyScale - (lowPosture ? 0.1 : 0), -0.04 * bodyScale - (lowPosture ? 0.18 : 0));
    shoulders.rotation.x = forwardLean * 0.8;
    shoulders.rotation.z = type === "screamer" ? -0.08 : 0.04;
    shoulders.castShadow = true;
    group.add(shoulders);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * bodyScale, 0.2 * bodyScale, 0.34 * bodyScale, 10), skinMaterial);
    neck.position.set(0.02 * bodyScale, 2.46 * bodyScale - (lowPosture ? 0.16 : 0), -0.04 * bodyScale - (lowPosture ? 0.24 : 0));
    neck.rotation.x = forwardLean * 0.55;
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * bodyScale, 2), skinMaterial);
    head.position.set(0.06 * bodyScale, 2.92 * bodyScale - (lowPosture ? 0.18 : 0), lowPosture ? -0.3 : -0.02);
    head.scale.set(type === "screamer" ? 0.78 : 0.94, type === "screamer" ? 1.18 : 1.06, type === "crawler" ? 1.08 : 0.9);
    head.rotation.z = type === "sprinter" ? -0.12 : type === "crawler" ? -0.26 : type === "screamer" ? 0.22 : 0.1;
    head.rotation.x = lowPosture ? 0.28 : type === "screamer" ? -0.12 : 0.04;
    head.castShadow = true;
    head.name = "head";
    group.add(head);

    const face = new THREE.Group();
    const socketMaterial = new THREE.MeshBasicMaterial({ color: 0x0f0b09 });
    const faceBrowMaterial = new THREE.MeshStandardMaterial({ color: 0x272217, roughness: 0.96 });
    const faceBloodMaterial = new THREE.MeshBasicMaterial({ color: 0x7a2119, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    const faceMouthMaterial = new THREE.MeshBasicMaterial({ color: 0x160706 });
    const faceToothMaterial = new THREE.MeshStandardMaterial({ color: 0xe1d8b4, roughness: 0.72 });
    const faceEyeMaterial = new THREE.MeshBasicMaterial({
      color: type === "bloater" ? 0xffb04f : type === "screamer" ? 0xffe477 : 0xf36a4f
    });

    const localFaceZ = -0.51 * bodyScale;
    const browPlate = new THREE.Mesh(new THREE.BoxGeometry(0.58 * bodyScale, 0.085 * bodyScale, 0.08 * bodyScale), faceBrowMaterial);
    browPlate.position.set(0, 0.16 * bodyScale, localFaceZ + 0.02 * bodyScale);
    browPlate.rotation.z = type === "sprinter" ? -0.08 : type === "screamer" ? 0.12 : 0.03;
    face.add(browPlate);

    for (const x of [-0.19, 0.19]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.13 * bodyScale, 10, 7), socketMaterial);
      socket.scale.set(1.2, 0.72, 0.26);
      socket.position.set(x * bodyScale, 0.06 * bodyScale, localFaceZ - 0.005 * bodyScale);
      socket.rotation.z = x < 0 ? 0.16 : -0.12;
      face.add(socket);

      const eye = new THREE.Mesh(new THREE.SphereGeometry((type === "screamer" ? 0.075 : 0.062) * bodyScale, 10, 8), faceEyeMaterial);
      eye.position.set(x * bodyScale, 0.055 * bodyScale, localFaceZ - 0.065 * bodyScale);
      face.add(eye);
    }

    const faceNose = new THREE.Mesh(new THREE.ConeGeometry(0.075 * bodyScale, 0.24 * bodyScale, 5), skinMaterial);
    faceNose.position.set(0.02 * bodyScale, -0.08 * bodyScale, localFaceZ - 0.06 * bodyScale);
    faceNose.rotation.x = Math.PI / 2 + 0.12;
    faceNose.rotation.z = -0.08;
    faceNose.castShadow = true;
    face.add(faceNose);

    const faceMouth = new THREE.Mesh(
      new THREE.BoxGeometry((type === "screamer" ? 0.38 : 0.31) * bodyScale, (type === "screamer" ? 0.14 : 0.095) * bodyScale, 0.04 * bodyScale),
      faceMouthMaterial
    );
    faceMouth.position.set(0.03 * bodyScale, -0.28 * bodyScale, localFaceZ - 0.055 * bodyScale);
    face.add(faceMouth);

    for (const x of [-0.13, -0.045, 0.045, 0.13]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.032 * bodyScale, 0.082 * bodyScale, 0.022 * bodyScale), faceToothMaterial);
      tooth.position.set(x * bodyScale, -0.23 * bodyScale, localFaceZ - 0.085 * bodyScale);
      tooth.rotation.z = x * 1.2;
      face.add(tooth);
    }

    const faceWound = new THREE.Mesh(new THREE.CircleGeometry(0.085 * bodyScale, 10), faceBloodMaterial);
    faceWound.position.set(-0.29 * bodyScale, -0.08 * bodyScale, localFaceZ - 0.075 * bodyScale);
    faceWound.rotation.z = -0.28;
    face.add(faceWound);
    head.add(face);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34 * bodyScale, 0.12 * bodyScale, 0.24 * bodyScale), skinMaterial);
    jaw.position.set(0.04 * bodyScale, 2.72 * bodyScale - (lowPosture ? 0.18 : 0), -0.28 * bodyScale - (lowPosture ? 0.3 : 0));
    jaw.rotation.x = type === "screamer" ? -0.34 : 0;
    jaw.castShadow = true;
    group.add(jaw);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.48 * bodyScale, 0.08 * bodyScale, 0.09 * bodyScale), bruiseMaterial);
    brow.position.set(0.02 * bodyScale, 3.07 * bodyScale - (lowPosture ? 0.18 : 0), -0.41 * bodyScale - (lowPosture ? 0.3 : 0));
    brow.rotation.z = type === "sprinter" ? -0.1 : type === "screamer" ? 0.16 : 0.05;
    group.add(brow);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.075 * bodyScale, 0.22 * bodyScale, 5), skinMaterial);
    nose.position.set(0.02 * bodyScale, 2.91 * bodyScale - (lowPosture ? 0.18 : 0), -0.5 * bodyScale - (lowPosture ? 0.3 : 0));
    nose.rotation.x = Math.PI / 2 + 0.18;
    nose.rotation.z = -0.08;
    nose.castShadow = true;
    group.add(nose);

    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry((type === "screamer" ? 0.34 : 0.25) * bodyScale, (type === "screamer" ? 0.13 : 0.07) * bodyScale, 0.035 * bodyScale),
      darkBloodMaterial
    );
    mouth.position.set(0.04 * bodyScale, (type === "screamer" ? 2.72 : 2.75) * bodyScale - (lowPosture ? 0.18 : 0), -0.43 * bodyScale - (lowPosture ? 0.3 : 0));
    group.add(mouth);

    for (const x of [-0.12, -0.04, 0.06, 0.14]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.022 * bodyScale, 0.065 * bodyScale, 0.018 * bodyScale), boneMaterial);
      tooth.position.set(x * bodyScale, 2.79 * bodyScale - (lowPosture ? 0.18 : 0), -0.455 * bodyScale - (lowPosture ? 0.3 : 0));
      tooth.rotation.z = x * 1.4;
      group.add(tooth);
    }

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: type === "bloater" ? 0xf6a84b : type === "screamer" ? 0xf5dc6a : 0xe05b43 });
    for (const x of [-0.18, 0.18]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry((type === "screamer" ? 0.12 : 0.105) * bodyScale, 8, 6), bruiseMaterial);
      socket.scale.set(1.15, 0.65, 0.24);
      socket.position.set(x * bodyScale, 2.985 * bodyScale - (lowPosture ? 0.18 : 0), -0.435 * bodyScale - (lowPosture ? 0.3 : 0));
      socket.rotation.z = x < 0 ? 0.2 : -0.1;
      group.add(socket);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(type === "screamer" ? 0.072 : 0.052, 8, 8), eyeMaterial);
      eye.position.set(x * bodyScale, 2.98 * bodyScale - (lowPosture ? 0.18 : 0), -0.42 * bodyScale - (lowPosture ? 0.3 : 0));
      group.add(eye);
    }

    for (const patch of [
      { x: -0.14, y: 3.18, z: -0.08, scale: 0.18 },
      { x: 0.1, y: 3.12, z: -0.16, scale: 0.12 }
    ]) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(patch.scale * bodyScale, 6, 5), hairMaterial);
      hair.scale.y = 0.22;
      hair.position.set(patch.x * bodyScale, patch.y * bodyScale - (lowPosture ? 0.18 : 0), patch.z * bodyScale - (lowPosture ? 0.3 : 0));
      hair.rotation.set(0.4, 0.2, -0.25);
      group.add(hair);
    }

    for (const ribX of [-0.22, 0, 0.22]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18 * bodyScale, 0.025 * bodyScale, 0.035 * bodyScale), boneMaterial);
      rib.position.set(ribX * bodyScale, 1.86 * bodyScale - (lowPosture ? 0.1 : 0), -0.58 * bodyScale - (lowPosture ? 0.18 : 0));
      rib.rotation.z = ribX * 0.7;
      group.add(rib);
    }

    for (let tear = 0; tear < 3; tear += 1) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry((0.12 + tear * 0.025) * bodyScale, (0.5 - tear * 0.08) * bodyScale, 0.035 * bodyScale), tornClothMaterial);
      cloth.position.set((-0.32 + tear * 0.28) * bodyScale, (1.55 - tear * 0.08) * bodyScale, -0.63 * bodyScale - (lowPosture ? 0.18 : 0));
      cloth.rotation.set(0.15, 0, -0.24 + tear * 0.19);
      cloth.castShadow = true;
      group.add(cloth);
    }

    if (type === "bloater") {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.62 * bodyScale, 12, 8), shirtMaterial);
      belly.scale.set(1.02, 1.12, 0.74);
      belly.position.set(0, 1.45 * bodyScale, -0.36 * bodyScale);
      belly.castShadow = true;
      group.add(belly);
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.28 * bodyScale, 14), bloodMaterial);
      stain.position.set(0.16 * bodyScale, 1.5 * bodyScale, -0.83 * bodyScale);
      stain.rotation.x = -0.08;
      group.add(stain);
    }

    const arms: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const armLength = (side < 0 && type !== "bloater" ? 1.18 : 1.04) * bodyScale;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * bodyScale, armLength, 4, 8), skinMaterial);
      arm.position.set(side * 0.76 * bodyScale, 1.68 * bodyScale - (lowPosture ? 0.12 : 0), -0.2 * bodyScale - (lowPosture ? 0.18 : 0));
      arm.rotation.z = side * (type === "screamer" ? 0.18 : 0.32);
      arm.rotation.x = lowPosture ? -1.38 : type === "screamer" ? -1.12 : -0.88;
      arm.castShadow = true;
      arms.push(arm);
      group.add(arm);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.18 * bodyScale, 0.13 * bodyScale, 0.2 * bodyScale), skinMaterial);
      hand.position.set(side * 0.9 * bodyScale, 1.02 * bodyScale - (lowPosture ? 0.16 : 0), -0.58 * bodyScale - (lowPosture ? 0.2 : 0));
      hand.rotation.set(-0.42, 0, side * 0.18);
      hand.castShadow = true;
      group.add(hand);

      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17 * bodyScale, 1.0 * bodyScale, 4, 8), pantsMaterial);
      leg.position.set(side * 0.25 * bodyScale, 0.68 * bodyScale, side < 0 ? 0.08 * bodyScale : -0.05 * bodyScale);
      leg.rotation.x = lowPosture ? 0.72 : side < 0 ? 0.1 : -0.08;
      leg.rotation.z = side * (type === "sprinter" ? 0.08 : 0.04);
      leg.castShadow = true;
      leg.name = side < 0 ? "leftLeg" : "rightLeg";
      group.add(leg);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.28 * bodyScale, 0.12 * bodyScale, 0.44 * bodyScale), shoeMaterial);
      shoe.position.set(side * 0.25 * bodyScale, 0.1 * bodyScale, -0.16 * bodyScale);
      shoe.rotation.y = side * 0.12;
      shoe.castShadow = true;
      group.add(shoe);
    }

    const wound = new THREE.Mesh(new THREE.CircleGeometry(0.18 * bodyScale, 12), bloodMaterial);
    wound.position.set(-0.22 * bodyScale, 1.84 * bodyScale - (lowPosture ? 0.12 : 0), -0.68 * bodyScale - (lowPosture ? 0.2 : 0));
    wound.rotation.x = -0.15;
    group.add(wound);

    const cheekWound = new THREE.Mesh(new THREE.CircleGeometry(0.08 * bodyScale, 9), bloodMaterial);
    cheekWound.position.set(-0.2 * bodyScale, 2.92 * bodyScale - (lowPosture ? 0.18 : 0), -0.43 * bodyScale - (lowPosture ? 0.3 : 0));
    cheekWound.rotation.x = -0.2;
    group.add(cheekWound);

    if (type === "screamer") {
      const throat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1 * bodyScale, 0.13 * bodyScale, 0.32 * bodyScale, 10),
        new THREE.MeshBasicMaterial({ color: 0xa74735, transparent: true, opacity: 0.82 })
      );
      throat.position.set(0.02 * bodyScale, 2.48 * bodyScale, -0.36 * bodyScale);
      throat.rotation.x = Math.PI / 2;
      group.add(throat);
    }

    group.userData.arms = arms;
    group.userData.head = head;
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    if (Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y) > 0.001) {
      for (const child of group.children) {
        child.position.y -= bounds.min.y;
      }
    }
    return group;
  }

  createPickupMesh(type: PickupKind): THREE.Object3D {
    const color = type === "ammo" ? 0xd4aa4c : type === "health" ? 0xc84138 : 0x9ebf86;
    const geometry =
      type === "ammo" ? new THREE.BoxGeometry(1.1, 0.7, 1.6) : type === "health" ? new THREE.OctahedronGeometry(0.9) : new THREE.DodecahedronGeometry(0.75);
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.55 }));
  }

}
