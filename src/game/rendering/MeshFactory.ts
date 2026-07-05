import * as THREE from "three";
import type { GameMaterials } from "./WorldBuilder";
import type { WeaponId } from "../weapons";
import type { ZombieType } from "../waves";
import { ANIME_OUTLINE_COLOR, MELBOURNE_ANIME_PALETTE, tuneAnimeMaterial as tuneAnimeMaterialStyle } from "./animeStyle";

export type PickupKind = "scrap" | "health" | "ammo";
export type BikeIssue = "flat-tyres" | "broken-chain";

const ZOMBIE_ACCENT_COLORS: Record<ZombieType, THREE.ColorRepresentation> = {
  shambler: 0xd0a14f,
  sprinter: 0xf2d260,
  bloater: 0xc25d3d,
  crawler: 0x9ebf75,
  screamer: 0xffe477
};

const ZOMBIE_GLOW_COLORS: Record<ZombieType, THREE.ColorRepresentation> = {
  shambler: 0x826437,
  sprinter: 0xffcf6b,
  bloater: 0xb84236,
  crawler: 0x78a45f,
  screamer: 0xfff0a2
};

const WEAPON_STENCIL: Record<WeaponId, string> = {
  knife: "EG",
  machete: "FITZ",
  carbine: "CAR",
  shotgun: "12G",
  smg: "9MM",
  rifle: "RFL"
};

interface ZombieMarkerMaterials {
  skin: THREE.Material;
  shirt: THREE.Material;
  bone: THREE.Material;
  hair: THREE.Material;
  accent: THREE.Material;
  glow: THREE.Material;
}

interface ZombieDetailMaterials extends ZombieMarkerMaterials {
  pants: THREE.Material;
  blood: THREE.Material;
  darkBlood: THREE.Material;
  bruise: THREE.Material;
  tornCloth: THREE.Material;
  shoe: THREE.Material;
}

export class MeshFactory {
  constructor(private readonly materials: GameMaterials) {}

  createWeaponMesh(weaponId: WeaponId, firstPerson = false): THREE.Group {
    const group = new THREE.Group();
    if (weaponId === "knife" || weaponId === "machete") {
      const isMachete = weaponId === "machete";
      const bladeMaterial = this.paintedStandardMaterial({
        color: isMachete ? MELBOURNE_ANIME_PALETTE.weatheredWhite : 0xcac8b6,
        emissive: isMachete ? 0x22251e : 0x35362f,
        emissiveIntensity: isMachete ? 0.11 : 0.18,
        metalness: 0.46,
        roughness: 0.54
      });
      const edgeMaterial = this.paintedStandardMaterial({ color: 0xe1dccb, metalness: 0.54, roughness: 0.38 });
      const gripMaterial = this.paintedStandardMaterial({ color: isMachete ? 0x4d3d28 : 0x273f3a, roughness: 0.9 });
      const guardMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.bluestoneShadow, metalness: 0.26, roughness: 0.62 });
      const length = isMachete ? 1.28 : 0.72;
      const width = isMachete ? 0.16 : 0.095;

      const bladeGeometry = isMachete
        ? new THREE.BoxGeometry(width, 0.035, length)
        : this.createKnifeBladeGeometry(length, width, 0.07);
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
      blade.position.set(0, 0.08, isMachete ? -length * 0.36 : 0);
      blade.rotation.x = isMachete ? -0.08 : -0.02;
      blade.castShadow = true;
      group.add(blade);

      if (isMachete) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.28, 0.018, length * 0.92), edgeMaterial);
        edge.position.set(width * 0.42, 0.105, -length * 0.37);
        edge.rotation.x = blade.rotation.x;
        group.add(edge);
      }

      if (isMachete) {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.52, 0.22, 4), bladeMaterial);
        tip.rotation.x = -Math.PI / 2 + blade.rotation.x;
        tip.rotation.z = Math.PI / 4;
        tip.position.set(0, 0.08, -length * 0.83);
        tip.castShadow = true;
        group.add(tip);
      }

      if (isMachete) {
        const spine = new THREE.Mesh(new THREE.BoxGeometry(width * 0.32, 0.02, length * 0.74), edgeMaterial);
        spine.position.set(-width * 0.28, 0.118, -length * 0.32);
        spine.rotation.x = blade.rotation.x;
        group.add(spine);
      }

      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(width * 0.68, 0.3, 4, 10), gripMaterial);
      grip.position.set(0, -0.02, length * 0.26);
      grip.rotation.x = Math.PI / 2 - 0.16;
      grip.scale.set(1.12, 1, 0.76);
      grip.castShadow = true;
      group.add(grip);

      const guard = new THREE.Mesh(new THREE.BoxGeometry(width * 2.4, 0.055, 0.09), guardMaterial);
      guard.position.set(0, 0.04, length * 0.02);
      guard.castShadow = true;
      group.add(guard);

      for (const z of [length * 0.16, length * 0.29, length * 0.42]) {
        const rivet = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.16, width * 0.16, 0.018, 8), guardMaterial);
        rivet.rotation.x = Math.PI / 2;
        rivet.position.set(width * 0.28, 0.058, z);
        group.add(rivet);
      }
      this.addGripWraps(group, length * 0.26, width, guardMaterial);
      this.addBladeWeathering(group, length, width, isMachete);
      if (!firstPerson) {
        this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, 0.02, 0.15, -length * 0.22, width * 1.6, 0.014, 0.24, 0, -0.08);
        this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.wetBluestone, -width * 0.28, 0.135, -length * 0.54, width * 1.2, 0.012, 0.18, 0, 0.12);
      }

      if (firstPerson) {
        this.addFirstPersonArm(group, 1, { x: 0.12, y: -0.34, z: 0.28 }, { x: -0.62, y: 0.08, z: 0.22 }, { x: 0.05, y: -0.2, z: 0.1 });
      }

      this.applyAnimeMeshStyle(group, firstPerson ? 1.025 : 1.04);
      return group;
    }

    const isLong = weaponId === "rifle";
    const isShotgun = weaponId === "shotgun";
    const isSmg = weaponId === "smg";
    const bodyColor =
      weaponId === "shotgun"
        ? 0x5f4630
        : weaponId === "smg"
          ? MELBOURNE_ANIME_PALETTE.bluestoneShadow
          : weaponId === "rifle"
            ? 0x4f4a37
            : 0x334a44;
    const metalMaterial = this.paintedStandardMaterial({ color: 0x202629, metalness: 0.36, roughness: 0.56 });
    const bodyMaterial = this.paintedStandardMaterial({ color: bodyColor, roughness: 0.74, metalness: isSmg ? 0.18 : 0.06 });
    const accentMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.tramOchre, metalness: 0.12, roughness: 0.68 });
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

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.1, 10), metalMaterial);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.08, -length * 1.08);
    muzzle.castShadow = true;
    group.add(muzzle);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.16), bodyMaterial);
    grip.position.set(0, -0.24, firstPerson ? 0.2 : 0.12);
    grip.rotation.x = -0.28;
    grip.castShadow = true;
    group.add(grip);

    const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 12, Math.PI * 1.45), metalMaterial);
    triggerGuard.position.set(0, -0.12, length * 0.02);
    triggerGuard.rotation.set(Math.PI / 2, 0, Math.PI * 0.08);
    group.add(triggerGuard);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, isSmg ? 0.22 : 0.42), bodyMaterial);
    stock.position.set(0, -0.01, length * 0.48);
    stock.castShadow = true;
    group.add(stock);

    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.13, isShotgun ? 0.12 : 0.28, isShotgun ? 0.5 : 0.18), metalMaterial);
    magazine.position.set(0, isShotgun ? -0.03 : -0.22, isShotgun ? -0.28 : -0.02);
    magazine.rotation.x = isShotgun ? Math.PI / 2 : -0.08;
    magazine.castShadow = true;
    group.add(magazine);

    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, isSmg ? 0.16 : 0.2), new THREE.MeshBasicMaterial({ color: 0x0b1112 }));
    ejectionPort.position.set(0.085, 0.07, -length * 0.22);
    group.add(ejectionPort);

    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.035), metalMaterial);
    trigger.position.set(0, -0.18, length * 0.05);
    trigger.rotation.x = -0.32;
    group.add(trigger);

    const foreEnd = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, isShotgun ? 0.48 : isSmg ? 0.24 : 0.36), accentMaterial);
    foreEnd.position.set(0, -0.03, -length * 0.48);
    foreEnd.castShadow = true;
    group.add(foreEnd);

    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.055), metalMaterial);
    stockPad.position.set(0, -0.01, length * (isSmg ? 0.62 : 0.74));
    stockPad.castShadow = true;
    group.add(stockPad);

    const sightPost = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.095, 0.035), accentMaterial);
    sightPost.position.set(0, 0.24, -length * 0.88);
    sightPost.castShadow = true;
    group.add(sightPost);

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

    this.addFirearmParkDetails(group, weaponId, length);
    if (!firstPerson) {
      this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.02, 0.155, -length * 0.52, 0.26, 0.018, 0.2, 0, -0.03);
      this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.eucalyptus, 0.02, 0.125, length * 0.22, 0.22, 0.016, 0.22, 0, 0.08);
    }

    if (firstPerson) {
      for (const side of [-1, 1]) {
        this.addFirstPersonArm(
          group,
          side,
          { x: side * 0.18, y: -0.3, z: 0.18 },
          { x: side < 0 ? -0.12 : 0.04, y: side * 0.06, z: side * 0.35 },
          { x: side * 0.1, y: -0.21, z: -0.18 }
        );
      }
    }

    this.applyAnimeMeshStyle(group, firstPerson ? 1.025 : 1.04);
    return group;
  }

  private addFirstPersonArm(
    group: THREE.Group,
    side: number,
    sleevePosition: { x: number; y: number; z: number },
    sleeveRotation: { x: number; y: number; z: number },
    handPosition: { x: number; y: number; z: number }
  ): void {
    const handMaterial = this.paintedStandardMaterial({ color: 0xc28f66, roughness: 0.9 });
    const gloveMaterial = this.paintedStandardMaterial({ color: 0x202b2d, roughness: 0.94 });
    const sleeveMaterial = this.paintedStandardMaterial({ color: 0x273f46, roughness: 0.94 });
    const cuffMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.tramOchre, roughness: 0.84, metalness: 0.04 });

    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.5, 4, 8), sleeveMaterial);
    sleeve.position.set(sleevePosition.x, sleevePosition.y, sleevePosition.z);
    sleeve.rotation.set(sleeveRotation.x, sleeveRotation.y, sleeveRotation.z);
    group.add(sleeve);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.092, 0.05, 10), cuffMaterial);
    cuff.position.set(sleevePosition.x - side * 0.018, sleevePosition.y + 0.15, sleevePosition.z - 0.13);
    cuff.rotation.set(Math.PI / 2 + sleeveRotation.x * 0.25, sleeveRotation.y, sleeveRotation.z);
    group.add(cuff);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), handMaterial);
    hand.position.set(handPosition.x, handPosition.y, handPosition.z);
    hand.scale.set(1.16, 0.86, 1.02);
    group.add(hand);

    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.034, 0.07), gloveMaterial);
    knuckle.position.set(handPosition.x + side * 0.018, handPosition.y + 0.022, handPosition.z - 0.07);
    knuckle.rotation.z = side * 0.18;
    group.add(knuckle);
  }

  private addGripWraps(group: THREE.Group, gripZ: number, bladeWidth: number, material: THREE.Material): void {
    for (const offset of [-0.09, 0.02, 0.13]) {
      const wrap = new THREE.Mesh(new THREE.BoxGeometry(bladeWidth * 1.52, 0.018, 0.035), material);
      wrap.position.set(0, 0.066, gripZ + offset);
      wrap.rotation.x = -0.16;
      group.add(wrap);
    }
  }

  private createKnifeBladeGeometry(length: number, width: number, thickness: number): THREE.BufferGeometry {
    const halfWidth = width * 0.5;
    const outline = [
      { y: -thickness * 0.44, z: length * 0.06 },
      { y: thickness * 0.52, z: length * 0.04 },
      { y: thickness * 0.52, z: -length * 0.56 },
      { y: thickness * 0.12, z: -length * 0.82 },
      { y: 0, z: -length * 0.98 },
      { y: -thickness * 0.44, z: -length * 0.6 }
    ];
    const positions: number[] = [];
    const pushPoint = (point: { y: number; z: number }, x: number) => positions.push(x, point.y, point.z);

    for (let index = 1; index < outline.length - 1; index += 1) {
      pushPoint(outline[0], halfWidth);
      pushPoint(outline[index], halfWidth);
      pushPoint(outline[index + 1], halfWidth);
      pushPoint(outline[0], -halfWidth);
      pushPoint(outline[index + 1], -halfWidth);
      pushPoint(outline[index], -halfWidth);
    }

    for (let index = 0; index < outline.length; index += 1) {
      const next = outline[(index + 1) % outline.length];
      const current = outline[index];
      pushPoint(current, halfWidth);
      pushPoint(current, -halfWidth);
      pushPoint(next, -halfWidth);
      pushPoint(current, halfWidth);
      pushPoint(next, -halfWidth);
      pushPoint(next, halfWidth);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  private addTubeBetween(group: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
    const delta = end.clone().sub(start);
    const length = delta.length();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
    tube.position.copy(start).addScaledVector(delta, 0.5);
    if (length > 0.0001) {
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    }
    tube.castShadow = true;
    group.add(tube);
    return tube;
  }

  private addArtifactBrushShadow(
    group: THREE.Group,
    color: THREE.ColorRepresentation,
    radiusX: number,
    radiusZ: number,
    opacity = 0.18,
    y = -0.34,
    rotation = 0
  ): THREE.Mesh {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 22),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    shadow.position.y = y;
    shadow.rotation.x = Math.PI / 2;
    shadow.rotation.z = rotation;
    shadow.scale.set(radiusX, radiusZ, 1);
    shadow.renderOrder = -2;
    group.add(shadow);
    return shadow;
  }

  private addArtifactPaintStroke(
    group: THREE.Group,
    color: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    length: number,
    thickness: number,
    opacity = 0.48,
    rotationY = 0,
    rotationZ = 0
  ): THREE.Mesh {
    const stroke = new THREE.Mesh(
      new THREE.BoxGeometry(length, thickness, thickness),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false
      })
    );
    stroke.position.set(x, y, z);
    stroke.rotation.set(0, rotationY, rotationZ);
    stroke.renderOrder = 2;
    group.add(stroke);
    return stroke;
  }

  createWeaponDropMesh(weaponId: WeaponId): THREE.Object3D {
    const group = this.createWeaponMesh(weaponId, false);
    group.scale.setScalar(2.0);
    group.rotation.x = 0.16;
    this.addArtifactBrushShadow(group, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 0.98, 0.54, 0.2, -0.32, -0.12);
    const haloMaterials = [
      new THREE.MeshBasicMaterial({ color: MELBOURNE_ANIME_PALETTE.tramOchre, transparent: true, opacity: 0.46, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: MELBOURNE_ANIME_PALETTE.wetBluestone, transparent: true, opacity: 0.34, depthWrite: false })
    ];
    for (let ring = 0; ring < 2; ring += 1) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.66 + ring * 0.12, 0.018, 7, 28), haloMaterials[ring]);
      halo.rotation.x = Math.PI / 2;
      halo.rotation.z = ring * 0.34;
      halo.position.y = -0.28 - ring * 0.012;
      halo.scale.set(1.18, 0.74 + ring * 0.08, 1);
      group.add(halo);
    }
    const tag = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.035, 0.22),
      this.artifactLabelMaterial(WEAPON_STENCIL[weaponId], "#2d443d", "#efd18a", "#6e8e75")
    );
    tag.position.set(0.48, -0.22, 0.38);
    tag.rotation.set(0.02, 0.18, -0.08);
    group.add(tag);
    this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.18, -0.2, 0.55, 0.62, 0.02, 0.2, 0.08, -0.06);
    return group;
  }

  createBikeMesh(options: { issue?: BikeIssue } = {}): THREE.Group {
    const root = new THREE.Group();
    const group = new THREE.Group();
    this.addArtifactBrushShadow(root, MELBOURNE_ANIME_PALETTE.bluestoneShadow, 1.36, 0.54, 0.2, 0.018, 0.08);
    const frameMaterial = this.paintedStandardMaterial({ color: 0x244a42, metalness: 0.22, roughness: 0.58 });
    const forkMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.weatheredWhite, metalness: 0.32, roughness: 0.5 });
    const tyreMaterial = this.paintedStandardMaterial({ color: 0x171c1b, roughness: 0.78 });
    const rimMaterial = this.paintedStandardMaterial({ color: 0x9ca9a1, metalness: 0.38, roughness: 0.48 });
    const spokeMaterial = this.paintedStandardMaterial({ color: 0xc5cec6, metalness: 0.34, roughness: 0.44 });
    const rubberMaterial = this.paintedStandardMaterial({ color: 0x101312, roughness: 0.84 });
    const leatherMaterial = this.paintedStandardMaterial({ color: 0x2f211a, roughness: 0.9 });
    const reflectorMaterial = new THREE.MeshBasicMaterial({ color: 0xffbe5d });
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xc7edf2, transparent: true, opacity: 0.82 });

    const rearHub = new THREE.Vector3(-0.78, 0.45, 0);
    const frontHub = new THREE.Vector3(0.82, 0.45, 0);
    const bottomBracket = new THREE.Vector3(-0.12, 0.58, 0);
    const seatCluster = new THREE.Vector3(-0.42, 1.08, 0);
    const headTube = new THREE.Vector3(0.52, 1.02, 0);
    const topTubeRear = new THREE.Vector3(-0.34, 1.0, 0);
    const wheelRadius = 0.43;
    const wheelMeshes: THREE.Mesh[] = [];
    const tyres: THREE.Mesh[] = [];

    for (const hub of [rearHub, frontHub]) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, 0.045, 10, 32), tyreMaterial);
      tyre.position.copy(hub);
      tyre.castShadow = true;
      group.add(tyre);
      tyres.push(tyre);
      wheelMeshes.push(tyre);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 0.82, 0.018, 8, 28), rimMaterial);
      rim.position.copy(hub);
      rim.castShadow = true;
      group.add(rim);
      wheelMeshes.push(rim);

      const fender = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 1.04, 0.018, 6, 24, Math.PI * 0.72), forkMaterial);
      fender.position.copy(hub);
      fender.rotation.z = Math.PI * 0.14;
      fender.castShadow = true;
      group.add(fender);

      const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 10), forkMaterial);
      hubMesh.position.copy(hub);
      hubMesh.rotation.x = Math.PI / 2;
      hubMesh.castShadow = true;
      group.add(hubMesh);

      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const rimPoint = new THREE.Vector3(hub.x + Math.cos(angle) * wheelRadius * 0.78, hub.y + Math.sin(angle) * wheelRadius * 0.78, hub.z);
        this.addTubeBetween(group, hub, rimPoint, 0.008, spokeMaterial);
      }
    }

    for (const [a, b, radius, material] of [
      [rearHub, topTubeRear, 0.035, frameMaterial],
      [topTubeRear, headTube, 0.036, frameMaterial],
      [headTube, frontHub, 0.034, forkMaterial],
      [rearHub, bottomBracket, 0.034, frameMaterial],
      [bottomBracket, seatCluster, 0.036, frameMaterial],
      [bottomBracket, headTube, 0.034, frameMaterial],
      [rearHub, seatCluster, 0.024, forkMaterial],
      [bottomBracket, frontHub, 0.022, forkMaterial]
    ] as Array<[THREE.Vector3, THREE.Vector3, number, THREE.Material]>) {
      this.addTubeBetween(group, a, b, radius, material);
    }
    this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, -0.02, 0.94, -0.035, 0.62, 0.018, 0.26, 0, -0.03);
    this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, 0.16, 0.73, 0.035, 0.54, 0.016, 0.22, 0, 0.08);

    const chainTop = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.026, 0.038), rubberMaterial);
    chainTop.position.set(-0.45, 0.52, -0.08);
    chainTop.rotation.z = -0.06;
    group.add(chainTop);
    const chainBottom = chainTop.clone();
    chainBottom.position.y = 0.44;
    group.add(chainBottom);

    const crank = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 18), forkMaterial);
    crank.position.copy(bottomBracket);
    crank.rotation.y = Math.PI / 2;
    group.add(crank);
    this.addTubeBetween(group, bottomBracket, new THREE.Vector3(-0.12, 0.33, 0.18), 0.018, forkMaterial);
    this.addTubeBetween(group, bottomBracket, new THREE.Vector3(-0.12, 0.81, -0.18), 0.018, forkMaterial);
    for (const pedal of [
      { x: -0.12, y: 0.31, z: 0.26, angle: 0.08 },
      { x: -0.12, y: 0.83, z: -0.26, angle: -0.08 }
    ]) {
      const pedalMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.09), rubberMaterial);
      pedalMesh.position.set(pedal.x, pedal.y, pedal.z);
      pedalMesh.rotation.z = pedal.angle;
      group.add(pedalMesh);
    }

    const seatPostTop = new THREE.Vector3(-0.48, 1.2, 0);
    this.addTubeBetween(group, seatCluster, seatPostTop, 0.026, forkMaterial);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.09, 0.28), leatherMaterial);
    saddle.position.set(-0.54, 1.24, 0);
    saddle.rotation.z = -0.08;
    saddle.castShadow = true;
    group.add(saddle);

    const handleStemTop = new THREE.Vector3(0.66, 1.2, 0);
    this.addTubeBetween(group, headTube, handleStemTop, 0.028, forkMaterial);
    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.86), forkMaterial);
    handlebar.position.set(0.72, 1.22, 0);
    handlebar.rotation.z = 0.18;
    handlebar.castShadow = true;
    group.add(handlebar);
    for (const z of [-0.48, 0.48]) {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.065, 0.16), rubberMaterial);
      grip.position.set(0.75, 1.23, z);
      group.add(grip);
    }

    const crateMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.tramOchre, roughness: 0.88 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.5), crateMaterial);
    crate.position.set(1.02, 0.9, 0);
    crate.castShadow = true;
    group.add(crate);
    for (const z of [-0.18, 0, 0.18]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.035, 0.028), forkMaterial);
      slat.position.set(1.025, 0.97, z);
      group.add(slat);
    }
    const gumLeaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), new THREE.MeshBasicMaterial({ color: MELBOURNE_ANIME_PALETTE.eucalyptus }));
    gumLeaf.position.set(1.25, 1.05, -0.12);
    gumLeaf.rotation.set(0.18, 0, -0.72);
    group.add(gumLeaf);

    const crateTag = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.024, 0.18),
      this.artifactLabelMaterial("FITZ", "#263d45", "#efd18a", "#76906c")
    );
    crateTag.position.set(1.02, 0.92, -0.27);
    crateTag.rotation.x = -0.02;
    group.add(crateTag);

    const rearReflector = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.05), reflectorMaterial);
    rearReflector.position.set(-0.94, 0.96, -0.04);
    group.add(rearReflector);
    const headLamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), lightMaterial);
    headLamp.position.set(0.88, 1.02, -0.04);
    headLamp.scale.set(1, 0.72, 0.72);
    group.add(headLamp);

    const rearRack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.035, 0.42), forkMaterial);
    rearRack.position.set(-0.78, 0.9, 0);
    rearRack.castShadow = true;
    group.add(rearRack);

    if (options.issue === "flat-tyres") {
      for (const tyre of tyres) {
        tyre.scale.y = 0.58;
        tyre.position.y -= 0.1;
        const flattenedRubber = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.1), rubberMaterial);
        flattenedRubber.position.set(tyre.position.x, 0.08, 0);
        flattenedRubber.castShadow = true;
        group.add(flattenedRubber);
      }
    } else if (options.issue === "broken-chain") {
      chainBottom.position.y = 0.34;
      chainBottom.rotation.z = -0.28;
      const droppedChain = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 8, 18), rubberMaterial);
      droppedChain.position.set(-0.35, 0.12, -0.18);
      droppedChain.rotation.set(Math.PI / 2, 0.2, -0.42);
      group.add(droppedChain);
      const looseLink = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.04), rubberMaterial);
      looseLink.position.set(-0.14, 0.2, -0.16);
      looseLink.rotation.z = -0.7;
      group.add(looseLink);
    }

    group.rotation.y = Math.PI / 2;
    root.add(group);
    root.userData.wheels = wheelMeshes;
    this.applyAnimeMeshStyle(root, 1.035);
    return root;
  }

  createZombieMesh(type: ZombieType): THREE.Group {
    if (type === "crawler") {
      return this.createCrawlerZombieMesh();
    }

    const group = new THREE.Group();
    const bodyScale = type === "bloater" ? 1.45 : type === "sprinter" ? 0.84 : type === "screamer" ? 1.04 : 1;
    const lowPosture = false;
    const forwardLean = type === "sprinter" ? -0.16 : type === "screamer" ? -0.08 : type === "bloater" ? 0.06 : -0.04;
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: type === "bloater" ? 0x71815b : type === "sprinter" ? 0x657556 : type === "screamer" ? 0x85795e : 0x6f7752,
      roughness: 0.94
    });
    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: type === "sprinter" ? 0x4d5548 : type === "screamer" ? 0x5a443f : 0x3f4b3b,
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
      color: type === "screamer" ? 0x3f312f : 0x29362e,
      roughness: 0.94
    });
    const accentMaterial = new THREE.MeshBasicMaterial({
      color: ZOMBIE_ACCENT_COLORS[type],
      transparent: true,
      opacity: type === "shambler" ? 0.72 : 0.86,
      depthWrite: false
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: ZOMBIE_GLOW_COLORS[type],
      transparent: true,
      opacity: type === "screamer" ? 0.46 : 0.32,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const torsoRadius = type === "bloater" ? 0.72 : type === "sprinter" ? 0.5 : type === "screamer" ? 0.48 : 0.56;
    const torsoLength = type === "bloater" ? 1.55 : type === "screamer" ? 1.52 : 1.38;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(torsoRadius * bodyScale, torsoLength * bodyScale, 5, 12), shirtMaterial);
    body.position.y = 1.48 * bodyScale;
    body.scale.set(type === "bloater" ? 1.18 : type === "screamer" ? 0.84 : type === "sprinter" ? 0.78 : 0.9, type === "bloater" ? 0.92 : 1.05, type === "bloater" ? 1.08 : 0.68);
    body.rotation.x = forwardLean;
    body.rotation.z = type === "screamer" ? -0.08 : type === "shambler" ? 0.06 : 0;
    body.castShadow = true;
    body.name = "body";
    group.add(body);

    const ribcage = new THREE.Mesh(
      new THREE.BoxGeometry(
        (type === "bloater" ? 0.9 : type === "screamer" ? 0.56 : type === "sprinter" ? 0.58 : 0.72) * bodyScale,
        (type === "bloater" ? 0.58 : 0.72) * bodyScale,
        0.16 * bodyScale
      ),
      shirtMaterial
    );
    ribcage.position.set(0.02 * bodyScale, 1.72 * bodyScale, -0.55 * bodyScale);
    ribcage.rotation.set(forwardLean * 0.35, 0, type === "shambler" ? 0.08 : type === "screamer" ? -0.06 : 0);
    ribcage.castShadow = true;
    group.add(ribcage);

    const pelvis = new THREE.Mesh(
      new THREE.BoxGeometry((type === "bloater" ? 0.82 : type === "sprinter" ? 0.52 : 0.66) * bodyScale, 0.28 * bodyScale, 0.32 * bodyScale),
      pantsMaterial
    );
    pelvis.position.set(0, 0.88 * bodyScale, -0.04 * bodyScale);
    pelvis.rotation.z = type === "shambler" ? -0.06 : type === "sprinter" ? 0.08 : 0;
    pelvis.castShadow = true;
    group.add(pelvis);

    for (const x of [-0.22, 0.22]) {
      const clavicle = new THREE.Mesh(new THREE.BoxGeometry(0.24 * bodyScale, 0.035 * bodyScale, 0.04 * bodyScale), boneMaterial);
      clavicle.position.set(x * bodyScale, 2.09 * bodyScale, -0.61 * bodyScale);
      clavicle.rotation.z = x < 0 ? -0.22 : 0.22;
      group.add(clavicle);
    }

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
    head.scale.set(type === "screamer" ? 0.78 : 0.94, type === "screamer" ? 1.18 : 1.06, 0.9);
    head.rotation.z = type === "sprinter" ? -0.12 : type === "screamer" ? 0.22 : 0.1;
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
      for (const spot of [
        { x: -0.18, y: 1.78, z: -0.82, r: 0.055 },
        { x: 0.34, y: 1.62, z: -0.86, r: 0.044 },
        { x: -0.36, y: 1.35, z: -0.78, r: 0.05 },
        { x: 0.08, y: 1.18, z: -0.9, r: 0.04 }
      ]) {
        const lesion = new THREE.Mesh(new THREE.SphereGeometry(spot.r * bodyScale, 8, 5), bloodMaterial);
        lesion.position.set(spot.x * bodyScale, spot.y * bodyScale, spot.z * bodyScale);
        lesion.scale.z = 0.32;
        group.add(lesion);
      }
    }

    const arms: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const armLength = (side < 0 && type !== "bloater" ? 1.18 : 1.04) * bodyScale;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * bodyScale, armLength, 4, 8), skinMaterial);
      const armZ =
        type === "sprinter" ? (side < 0 ? -0.42 : -0.02) * bodyScale : type === "shambler" ? (side < 0 ? -0.3 : -0.12) * bodyScale : -0.2 * bodyScale;
      arm.position.set(side * 0.76 * bodyScale, 1.68 * bodyScale - (lowPosture ? 0.12 : 0), armZ - (lowPosture ? 0.18 : 0));
      arm.rotation.z = side * (type === "screamer" ? 0.18 : type === "bloater" ? 0.22 : 0.32);
      arm.rotation.x =
        type === "sprinter"
          ? side < 0
            ? -1.16
            : -0.58
          : type === "shambler"
            ? side < 0
              ? -1.04
              : -0.72
            : lowPosture
              ? -1.38
              : type === "screamer"
                ? -1.12
                : -0.88;
      arm.castShadow = true;
      arms.push(arm);
      group.add(arm);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.18 * bodyScale, 0.13 * bodyScale, 0.2 * bodyScale), skinMaterial);
      const handY = (type === "sprinter" && side > 0 ? 1.2 : 1.02) * bodyScale - (lowPosture ? 0.16 : 0);
      const handZ =
        type === "sprinter" ? (side < 0 ? -0.86 : -0.32) * bodyScale : type === "shambler" ? (side < 0 ? -0.72 : -0.46) * bodyScale : -0.58 * bodyScale;
      hand.position.set(side * 0.9 * bodyScale, handY, handZ - (lowPosture ? 0.2 : 0));
      hand.rotation.set(-0.42, 0, side * 0.18);
      hand.castShadow = true;
      group.add(hand);

      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09 * bodyScale, 0.54 * bodyScale, 4, 8), skinMaterial);
      forearm.position.set(side * 0.84 * bodyScale, (arm.position.y + hand.position.y) * 0.5, (arm.position.z + hand.position.z) * 0.5);
      forearm.rotation.x =
        type === "sprinter"
          ? side < 0
            ? -1.02
            : -0.48
          : type === "shambler"
            ? side < 0
              ? -0.88
              : -0.58
            : type === "screamer"
              ? -0.98
              : -0.74;
      forearm.rotation.z = side * (type === "bloater" ? 0.12 : 0.18);
      forearm.castShadow = true;
      group.add(forearm);

      for (const finger of [-1, 0, 1]) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.032 * bodyScale, 0.035 * bodyScale, 0.18 * bodyScale), boneMaterial);
        claw.position.set(
          hand.position.x + finger * 0.045 * bodyScale,
          hand.position.y - 0.035 * bodyScale,
          hand.position.z - 0.14 * bodyScale
        );
        claw.rotation.set(-0.46, side * 0.06, side * 0.08 + finger * 0.06);
        claw.castShadow = true;
        group.add(claw);
      }

      const legRadius = (type === "bloater" ? 0.2 : type === "sprinter" ? 0.145 : 0.17) * bodyScale;
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(legRadius, 1.0 * bodyScale, 4, 8), pantsMaterial);
      const legZ =
        type === "sprinter"
          ? side < 0
            ? -0.22
            : 0.18
          : type === "shambler"
            ? side < 0
              ? 0.12
              : -0.1
            : side < 0
              ? 0.08
              : -0.05;
      leg.position.set(side * (type === "bloater" ? 0.32 : 0.25) * bodyScale, 0.68 * bodyScale, legZ * bodyScale);
      leg.rotation.x =
        type === "sprinter" ? (side < 0 ? -0.26 : 0.34) : type === "shambler" ? (side < 0 ? 0.18 : -0.16) : lowPosture ? 0.72 : side < 0 ? 0.1 : -0.08;
      leg.rotation.z = side * (type === "sprinter" ? 0.12 : type === "bloater" ? 0.02 : 0.04);
      leg.castShadow = true;
      leg.name = side < 0 ? "leftLeg" : "rightLeg";
      group.add(leg);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.28 * bodyScale, 0.12 * bodyScale, (type === "sprinter" ? 0.52 : 0.44) * bodyScale), shoeMaterial);
      const shoeZ = type === "sprinter" ? (side < 0 ? -0.56 : 0.08) : type === "shambler" ? (side < 0 ? -0.04 : -0.28) : -0.16;
      shoe.position.set(side * (type === "bloater" ? 0.32 : 0.25) * bodyScale, 0.1 * bodyScale, shoeZ * bodyScale);
      shoe.rotation.y = side * 0.12;
      shoe.rotation.x = type === "sprinter" && side < 0 ? -0.12 : 0;
      shoe.castShadow = true;
      group.add(shoe);
    }

    this.addZombieSharedWear(group, type, bodyScale, lowPosture, {
      skin: skinMaterial,
      shirt: shirtMaterial,
      pants: pantsMaterial,
      blood: bloodMaterial,
      darkBlood: darkBloodMaterial,
      bone: boneMaterial,
      hair: hairMaterial,
      accent: accentMaterial,
      glow: glowMaterial,
      bruise: bruiseMaterial,
      tornCloth: tornClothMaterial,
      shoe: shoeMaterial
    });

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

    this.addZombieSilhouetteMarkers(group, type, bodyScale, lowPosture, {
      skin: skinMaterial,
      shirt: shirtMaterial,
      bone: boneMaterial,
      hair: hairMaterial,
      accent: accentMaterial,
      glow: glowMaterial
    });

    group.userData.arms = arms;
    group.userData.head = head;
    this.groundObject(group);
    this.applyAnimeMeshStyle(group, 1.035);
    return group;
  }

  private createCrawlerZombieMesh(): THREE.Group {
    const group = new THREE.Group();
    const bodyScale = 0.86;
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0x556642, roughness: 0.96 });
    const shirtMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3b34, roughness: 0.94 });
    const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x242a27, roughness: 0.9 });
    const bloodMaterial = new THREE.MeshBasicMaterial({ color: 0x681d17, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const darkBloodMaterial = new THREE.MeshStandardMaterial({ color: 0x26100e, roughness: 0.96 });
    const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xb9ae8b, roughness: 0.82 });
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x141611, roughness: 0.96 });
    const bruiseMaterial = new THREE.MeshStandardMaterial({ color: 0x303421, roughness: 0.96 });
    const tornClothMaterial = new THREE.MeshStandardMaterial({ color: 0x253029, roughness: 0.95 });
    const accentMaterial = new THREE.MeshBasicMaterial({ color: ZOMBIE_ACCENT_COLORS.crawler, transparent: true, opacity: 0.82, depthWrite: false });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: ZOMBIE_GLOW_COLORS.crawler,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42 * bodyScale, 1.35 * bodyScale, 5, 12), shirtMaterial);
    torso.rotation.x = Math.PI / 2 + 0.12;
    torso.scale.set(1.08, 1, 0.72);
    torso.position.set(0, 0.62, 0.04);
    torso.castShadow = true;
    torso.name = "body";
    group.add(torso);

    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.38 * bodyScale, 10, 8), pantsMaterial);
    pelvis.scale.set(1.14, 0.66, 0.9);
    pelvis.position.set(0, 0.42, 0.68);
    pelvis.castShadow = true;
    group.add(pelvis);

    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.08 * bodyScale, 0.18 * bodyScale, 0.34 * bodyScale), shirtMaterial);
    shoulders.position.set(0, 0.82, -0.48);
    shoulders.rotation.x = 0.18;
    shoulders.castShadow = true;
    group.add(shoulders);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * bodyScale, 0.18 * bodyScale, 0.28 * bodyScale, 10), skinMaterial);
    neck.rotation.x = Math.PI / 2 + 0.18;
    neck.position.set(0.02, 0.79, -0.74);
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36 * bodyScale, 2), skinMaterial);
    head.position.set(0.04, 0.86, -1.02);
    head.scale.set(0.92, 0.82, 1.12);
    head.rotation.set(0.38, 0, -0.22);
    head.castShadow = true;
    head.name = "head";
    group.add(head);

    const socketMaterial = new THREE.MeshBasicMaterial({ color: 0x0c0907 });
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf36a4f });
    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x170706 });
    for (const x of [-0.12, 0.12]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.078 * bodyScale, 8, 6), socketMaterial);
      socket.scale.set(1.25, 0.72, 0.24);
      socket.position.set(x, 0.035, -0.33 * bodyScale);
      head.add(socket);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042 * bodyScale, 8, 6), eyeMaterial);
      eye.position.set(x, 0.038, -0.365 * bodyScale);
      head.add(eye);
    }
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.24 * bodyScale, 0.09 * bodyScale, 0.16 * bodyScale), skinMaterial);
    jaw.position.set(0.03, -0.19, -0.26);
    jaw.rotation.x = -0.18;
    head.add(jaw);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.24 * bodyScale, 0.055 * bodyScale, 0.035 * bodyScale), mouthMaterial);
    mouth.position.set(0.04, -0.14, -0.36);
    head.add(mouth);
    for (const x of [-0.08, 0, 0.08]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.022 * bodyScale, 0.058 * bodyScale, 0.018 * bodyScale), boneMaterial);
      tooth.position.set(x, -0.1, -0.385);
      head.add(tooth);
    }

    const arms: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * bodyScale, 0.78 * bodyScale, 4, 8), skinMaterial);
      upperArm.position.set(side * 0.42, 0.5, -0.66);
      upperArm.rotation.set(-1.28, side * 0.08, side * 0.32);
      upperArm.castShadow = true;
      arms.push(upperArm);
      group.add(upperArm);

      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.092 * bodyScale, 0.68 * bodyScale, 4, 8), skinMaterial);
      forearm.position.set(side * 0.62, 0.27, -1.03);
      forearm.rotation.set(-1.18, side * 0.08, side * 0.16);
      forearm.castShadow = true;
      group.add(forearm);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16 * bodyScale, 0.09 * bodyScale, 0.22 * bodyScale), skinMaterial);
      hand.position.set(side * 0.74, 0.13, -1.38);
      hand.rotation.set(-0.32, side * 0.12, side * 0.08);
      hand.castShadow = true;
      group.add(hand);

      for (const finger of [-1, 0, 1]) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.028 * bodyScale, 0.035 * bodyScale, 0.2 * bodyScale), boneMaterial);
        claw.position.set(side * 0.74 + finger * 0.04, 0.1, -1.54);
        claw.rotation.set(-0.26, side * 0.08, finger * 0.08);
        claw.castShadow = true;
        group.add(claw);
      }

      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * bodyScale, 0.64 * bodyScale, 4, 8), pantsMaterial);
      thigh.position.set(side * 0.28, 0.3, 0.7);
      thigh.rotation.set(1.12, side * 0.08, side * 0.24);
      thigh.castShadow = true;
      group.add(thigh);

      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * bodyScale, 0.58 * bodyScale, 4, 8), pantsMaterial);
      shin.position.set(side * 0.43, 0.18, 1.13);
      shin.rotation.set(Math.PI / 2, side * 0.08, side * -0.18);
      shin.castShadow = true;
      group.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22 * bodyScale, 0.09 * bodyScale, 0.36 * bodyScale), darkBloodMaterial);
      foot.position.set(side * 0.48, 0.08, 1.46);
      foot.rotation.y = side * 0.08;
      foot.castShadow = true;
      group.add(foot);
    }

    for (let ridge = 0; ridge < 5; ridge += 1) {
      const spine = new THREE.Mesh(new THREE.BoxGeometry((0.22 - ridge * 0.016) * bodyScale, 0.055 * bodyScale, 0.1 * bodyScale), boneMaterial);
      spine.position.set(0, 0.98 - ridge * 0.06, -0.3 + ridge * 0.2);
      spine.rotation.x = 0.28;
      spine.castShadow = true;
      group.add(spine);
    }

    for (const x of [-0.22, 0.02, 0.26]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18 * bodyScale, 0.024 * bodyScale, 0.035 * bodyScale), boneMaterial);
      rib.position.set(x, 0.54, -0.48);
      rib.rotation.set(0.22, 0, x * 0.6);
      group.add(rib);
    }

    const wound = new THREE.Mesh(new THREE.CircleGeometry(0.16 * bodyScale, 12), bloodMaterial);
    wound.position.set(-0.18, 0.55, -0.73);
    wound.rotation.x = -0.14;
    group.add(wound);

    for (let tear = 0; tear < 4; tear += 1) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry((0.16 + tear * 0.02) * bodyScale, 0.34 * bodyScale, 0.035 * bodyScale), tornClothMaterial);
      cloth.position.set((-0.34 + tear * 0.22) * bodyScale, 0.52 - tear * 0.02, -0.78);
      cloth.rotation.set(0.32, 0, -0.28 + tear * 0.16);
      cloth.castShadow = true;
      group.add(cloth);
    }

    const glowRidge = new THREE.Mesh(new THREE.BoxGeometry(0.76 * bodyScale, 0.035 * bodyScale, 0.045 * bodyScale), accentMaterial);
    glowRidge.position.set(0, 0.92, -0.1);
    glowRidge.rotation.x = 0.16;
    group.add(glowRidge);

    this.addZombieSilhouetteMarkers(group, "crawler", bodyScale, true, {
      skin: skinMaterial,
      shirt: shirtMaterial,
      bone: boneMaterial,
      hair: hairMaterial,
      accent: accentMaterial,
      glow: glowMaterial
    });

    group.userData.arms = arms;
    group.userData.head = head;
    this.groundObject(group);
    this.applyAnimeMeshStyle(group, 1.035);
    return group;
  }

  private addZombieSharedWear(
    group: THREE.Group,
    type: Exclude<ZombieType, "crawler">,
    bodyScale: number,
    lowPosture: boolean,
    materials: ZombieDetailMaterials
  ): void {
    const frontZ = -0.68 * bodyScale - (lowPosture ? 0.18 : 0);
    const beltY = 1.12 * bodyScale - (lowPosture ? 0.1 : 0);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.92 * bodyScale, 0.075 * bodyScale, 0.045 * bodyScale), materials.darkBlood);
    belt.position.set(0.02 * bodyScale, beltY, frontZ);
    belt.rotation.z = type === "shambler" ? 0.08 : type === "sprinter" ? -0.07 : 0.02;
    group.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.15 * bodyScale, 0.11 * bodyScale, 0.05 * bodyScale), materials.bone);
    buckle.position.set(0.05 * bodyScale, beltY + 0.01 * bodyScale, frontZ - 0.025 * bodyScale);
    group.add(buckle);

    for (let tear = 0; tear < 5; tear += 1) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry((0.1 + tear * 0.012) * bodyScale, (0.2 + (tear % 2) * 0.08) * bodyScale, 0.036 * bodyScale), materials.tornCloth);
      cloth.position.set((-0.36 + tear * 0.18) * bodyScale, (1.03 - tear * 0.018) * bodyScale, frontZ - 0.015 * bodyScale);
      cloth.rotation.z = -0.22 + tear * 0.12;
      cloth.castShadow = true;
      group.add(cloth);
    }

    for (const side of [-1, 1]) {
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.24 * bodyScale, 0.26 * bodyScale, 0.2 * bodyScale), materials.shirt);
      sleeve.position.set(side * 0.72 * bodyScale, 1.96 * bodyScale, -0.28 * bodyScale);
      sleeve.rotation.set(-0.52, 0, side * 0.24);
      sleeve.castShadow = true;
      group.add(sleeve);

      const wristBone = new THREE.Mesh(new THREE.BoxGeometry(0.07 * bodyScale, 0.07 * bodyScale, 0.16 * bodyScale), materials.bone);
      wristBone.position.set(side * 0.85 * bodyScale, 0.88 * bodyScale, -0.7 * bodyScale);
      wristBone.rotation.set(-0.38, side * 0.08, side * 0.12);
      wristBone.castShadow = true;
      group.add(wristBone);

      const kneeTear = new THREE.Mesh(new THREE.BoxGeometry(0.16 * bodyScale, 0.09 * bodyScale, 0.045 * bodyScale), materials.bruise);
      kneeTear.position.set(side * 0.25 * bodyScale, 0.72 * bodyScale, -0.36 * bodyScale);
      kneeTear.rotation.z = side * 0.08;
      group.add(kneeTear);

      const toeCap = new THREE.Mesh(new THREE.BoxGeometry(0.22 * bodyScale, 0.035 * bodyScale, 0.06 * bodyScale), materials.bone);
      toeCap.position.set(side * 0.25 * bodyScale, 0.15 * bodyScale, -0.39 * bodyScale);
      toeCap.rotation.y = side * 0.12;
      group.add(toeCap);
    }

    if (type === "sprinter") {
      for (const side of [-1, 1]) {
        const calfWrap = new THREE.Mesh(new THREE.BoxGeometry(0.11 * bodyScale, 0.38 * bodyScale, 0.04 * bodyScale), materials.accent);
        calfWrap.position.set(side * 0.3 * bodyScale, 0.42 * bodyScale, -0.38 * bodyScale);
        calfWrap.rotation.z = side * 0.1;
        group.add(calfWrap);
      }
    } else if (type === "bloater") {
      for (const spot of [
        { x: -0.28, y: 1.72, z: -0.86, r: 0.09 },
        { x: 0.34, y: 1.38, z: -0.9, r: 0.075 },
        { x: 0.12, y: 2.05, z: -0.78, r: 0.07 }
      ]) {
        const blister = new THREE.Mesh(new THREE.SphereGeometry(spot.r * bodyScale, 8, 6), materials.glow);
        blister.position.set(spot.x * bodyScale, spot.y * bodyScale, spot.z * bodyScale);
        blister.scale.z = 0.35;
        group.add(blister);
      }
    } else if (type === "screamer") {
      const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.12 * bodyScale, 0.58 * bodyScale, 0.035 * bodyScale), materials.bone);
      sternum.position.set(0.02 * bodyScale, 1.74 * bodyScale, frontZ - 0.02 * bodyScale);
      sternum.rotation.z = -0.05;
      group.add(sternum);
    }
  }

  private addZombieSilhouetteMarkers(group: THREE.Group, type: ZombieType, bodyScale: number, lowPosture: boolean, materials: ZombieMarkerMaterials): void {
    const add = (mesh: THREE.Mesh, castShadow = true) => {
      mesh.castShadow = castShadow;
      mesh.userData.zombieSilhouetteMarker = true;
      group.add(mesh);
      return mesh;
    };

    if (type === "shambler") {
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.1 * bodyScale, 1.02 * bodyScale, 0.04 * bodyScale), materials.accent);
      sash.position.set(-0.22 * bodyScale, 1.78 * bodyScale, -0.68 * bodyScale);
      sash.rotation.set(-0.06, 0, -0.44);
      add(sash, false);

      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.34 * bodyScale, 0.22 * bodyScale, 0.04 * bodyScale), materials.glow);
      tag.position.set(0.28 * bodyScale, 1.4 * bodyScale, -0.7 * bodyScale);
      tag.rotation.z = 0.08;
      add(tag, false);

      const droppedShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.48 * bodyScale, 0.16 * bodyScale, 0.34 * bodyScale), materials.shirt);
      droppedShoulder.position.set(-0.43 * bodyScale, 2.06 * bodyScale, 0.02 * bodyScale);
      droppedShoulder.rotation.z = 0.28;
      add(droppedShoulder);
      return;
    }

    if (type === "sprinter") {
      const headband = new THREE.Mesh(new THREE.BoxGeometry(0.62 * bodyScale, 0.055 * bodyScale, 0.045 * bodyScale), materials.accent);
      headband.position.set(0.04 * bodyScale, 3.13 * bodyScale, -0.5 * bodyScale);
      headband.rotation.z = -0.08;
      add(headband, false);

      const backPennant = new THREE.Mesh(new THREE.ConeGeometry(0.14 * bodyScale, 0.48 * bodyScale, 3), materials.accent);
      backPennant.position.set(0.04 * bodyScale, 2.06 * bodyScale, 0.36 * bodyScale);
      backPennant.rotation.set(Math.PI / 2, 0, Math.PI / 6);
      backPennant.scale.z = 0.55;
      add(backPennant, false);

      for (const side of [-1, 1]) {
        const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.13 * bodyScale, 0.42 * bodyScale, 0.045 * bodyScale), materials.accent);
        wrap.position.set(side * 0.3 * bodyScale, 0.56 * bodyScale, -0.36 * bodyScale);
        wrap.rotation.z = side * 0.1;
        add(wrap, false);
      }
      return;
    }

    if (type === "bloater") {
      const hump = new THREE.Mesh(new THREE.SphereGeometry(0.44 * bodyScale, 12, 8), materials.shirt);
      hump.scale.set(1.08, 0.92, 0.62);
      hump.position.set(0, 2.05 * bodyScale, 0.34 * bodyScale);
      add(hump);

      for (const side of [-1, 1]) {
        const growth = new THREE.Mesh(new THREE.SphereGeometry(0.2 * bodyScale, 8, 6), materials.skin);
        growth.scale.set(0.82, 1.06, 0.68);
        growth.position.set(side * 0.78 * bodyScale, 1.62 * bodyScale, -0.14 * bodyScale);
        add(growth);
      }

      const warningBand = new THREE.Mesh(new THREE.BoxGeometry(1.22 * bodyScale, 0.09 * bodyScale, 0.045 * bodyScale), materials.accent);
      warningBand.position.set(0.04 * bodyScale, 1.2 * bodyScale, -0.84 * bodyScale);
      warningBand.rotation.z = -0.05;
      add(warningBand, false);
      return;
    }

    if (type === "crawler") {
      const crawlOffsetY = lowPosture ? -0.08 * bodyScale : 0;
      for (const side of [-1, 1]) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.08 * bodyScale, 0.12 * bodyScale, 0.48 * bodyScale), materials.bone);
        claw.position.set(side * 0.78 * bodyScale, 0.3 * bodyScale + crawlOffsetY, -0.92 * bodyScale);
        claw.rotation.set(-0.18, side * 0.1, side * 0.08);
        add(claw);

        const elbowSpike = new THREE.Mesh(new THREE.ConeGeometry(0.075 * bodyScale, 0.32 * bodyScale, 5), materials.bone);
        elbowSpike.position.set(side * 0.64 * bodyScale, 0.56 * bodyScale + crawlOffsetY, -0.22 * bodyScale);
        elbowSpike.rotation.z = -side * Math.PI / 2;
        add(elbowSpike);
      }

      for (let ridge = 0; ridge < 3; ridge += 1) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry((0.34 - ridge * 0.04) * bodyScale, 0.07 * bodyScale, 0.08 * bodyScale), materials.accent);
        plate.position.set(0, (1.15 + ridge * 0.22) * bodyScale + crawlOffsetY, (0.08 - ridge * 0.1) * bodyScale);
        plate.rotation.x = 0.42;
        add(plate, false);
      }
      return;
    }

    const throatRing = new THREE.Mesh(new THREE.TorusGeometry(0.34 * bodyScale, 0.014 * bodyScale, 6, 24), materials.glow);
    throatRing.position.set(0.03 * bodyScale, 2.62 * bodyScale, -0.6 * bodyScale);
    add(throatRing, false);

    for (let spike = -2; spike <= 2; spike += 1) {
      const hairSpike = new THREE.Mesh(new THREE.ConeGeometry(0.06 * bodyScale, 0.44 * bodyScale, 5), materials.hair);
      hairSpike.position.set(spike * 0.12 * bodyScale, (3.36 - Math.abs(spike) * 0.02) * bodyScale, -0.02 * bodyScale);
      hairSpike.rotation.z = spike * -0.16;
      add(hairSpike);
    }

    const mouthSlash = new THREE.Mesh(new THREE.BoxGeometry(0.46 * bodyScale, 0.055 * bodyScale, 0.04 * bodyScale), materials.accent);
    mouthSlash.position.set(0.03 * bodyScale, 2.72 * bodyScale, -0.58 * bodyScale);
    mouthSlash.rotation.z = 0.08;
    add(mouthSlash, false);
  }

  createPickupMesh(type: PickupKind): THREE.Object3D {
    const group = new THREE.Group();
    this.addPickupBrushMarker(group, type);
    this.addArtifactBrushShadow(
      group,
      type === "ammo" ? MELBOURNE_ANIME_PALETTE.tramOchre : type === "health" ? MELBOURNE_ANIME_PALETTE.brick : MELBOURNE_ANIME_PALETTE.wetBluestone,
      0.88,
      0.52,
      0.12,
      -0.37,
      type === "scrap" ? 0.22 : -0.08
    );

    if (type === "ammo") {
      const boxMaterial = this.paintedStandardMaterial({
        color: MELBOURNE_ANIME_PALETTE.tramOchre,
        emissive: 0x2a1d08,
        emissiveIntensity: 0.16,
        roughness: 0.78,
        metalness: 0.04
      });
      const metalMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.bluestoneShadow, metalness: 0.22, roughness: 0.62 });
      const brassMaterial = this.paintedStandardMaterial({ color: 0xd7a64b, metalness: 0.36, roughness: 0.48 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.52, 1.46), boxMaterial);
      box.position.y = 0.28;
      box.castShadow = true;
      group.add(box);
      for (const x of [-0.53, 0.53]) {
        for (const z of [-0.67, 0.67]) {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.13), metalMaterial);
          cap.position.set(x, 0.3, z);
          cap.castShadow = true;
          group.add(cap);
        }
      }
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.05), metalMaterial);
      latch.position.set(0, 0.43, -0.75);
      group.add(latch);
      const label = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 0.27, 0.036),
        this.artifactLabelMaterial("AMMO", "#2d443d", "#efd18a", "#7aa08b")
      );
      label.position.set(0, 0.3, -0.755);
      group.add(label);
      for (const x of [-0.32, 0, 0.32]) {
        const round = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.52, 10), brassMaterial);
        round.rotation.x = Math.PI / 2;
        round.position.set(x, 0.64, 0.16);
        round.castShadow = true;
        group.add(round);
      }
      const strap = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.055, 0.12), metalMaterial);
      strap.position.set(0, 0.58, -0.12);
      strap.rotation.y = 0.05;
      group.add(strap);
      this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.1, 0.62, -0.52, 0.72, 0.02, 0.2, 0, -0.04);
      this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.eucalyptus, 0.18, 0.22, -0.73, 0.58, 0.018, 0.18, 0, 0.06);
    } else if (type === "health") {
      const caseMaterial = this.paintedStandardMaterial({
        color: MELBOURNE_ANIME_PALETTE.terraceCream,
        emissive: 0x32250f,
        emissiveIntensity: 0.16,
        roughness: 0.82
      });
      const brickMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.brick, roughness: 0.82 });
      const crossMaterial = new THREE.MeshBasicMaterial({ color: 0xf2e8d4 });
      const kit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.82), caseMaterial);
      kit.position.y = 0.38;
      kit.castShadow = true;
      group.add(kit);
      for (const x of [-0.58, 0.58]) {
        const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.66, 0.86), brickMaterial);
        sidePanel.position.set(x, 0.4, 0);
        sidePanel.castShadow = true;
        group.add(sidePanel);
      }
      const frontBand = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.04), brickMaterial);
      frontBand.position.set(0, 0.66, -0.43);
      group.add(frontBand);
      const barA = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.5), crossMaterial);
      barA.position.set(0, 0.76, -0.43);
      group.add(barA);
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.16), crossMaterial);
      barB.position.set(0, 0.76, -0.43);
      group.add(barB);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 18), this.materials.metal);
      handle.position.y = 0.82;
      handle.rotation.x = Math.PI / 2;
      group.add(handle);
      const bandage = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.48, 14),
        this.paintedStandardMaterial({ color: 0xf1e0bd, roughness: 0.9 })
      );
      bandage.rotation.z = Math.PI / 2;
      bandage.position.set(0.34, 0.18, 0.52);
      bandage.castShadow = true;
      group.add(bandage);
      const aidTag = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.03, 0.18),
        this.artifactLabelMaterial("AID", "#b35f4a", "#f2e8d4", "#d9caa7")
      );
      aidTag.position.set(-0.3, 0.24, 0.52);
      aidTag.rotation.set(0.06, 0.08, -0.04);
      group.add(aidTag);
      this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.eucalyptus, -0.12, 0.58, -0.44, 0.68, 0.02, 0.18, 0, 0.05);
    } else {
      const scrapMaterial = this.paintedStandardMaterial({ color: 0x8fa693, metalness: 0.24, roughness: 0.62 });
      const darkMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.wetBluestone, metalness: 0.26, roughness: 0.66 });
      const copperMaterial = this.paintedStandardMaterial({ color: 0xb46a42, metalness: 0.22, roughness: 0.58 });
      for (let index = 0; index < 5; index += 1) {
        const material = index === 3 ? copperMaterial : index % 2 === 0 ? scrapMaterial : darkMaterial;
        const shard = new THREE.Mesh(new THREE.BoxGeometry(0.78 - index * 0.05, 0.11, 0.3 + index * 0.04), material);
        shard.position.set((index - 2) * 0.25, 0.14 + index * 0.045, Math.sin(index) * 0.22);
        shard.rotation.set(0.18 * index, index * 0.44, -0.2 + index * 0.13);
        shard.castShadow = true;
        group.add(shard);
      }
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 20), darkMaterial);
      wire.position.set(0.08, 0.42, -0.06);
      wire.rotation.set(0.8, 0.2, 0.35);
      wire.castShadow = true;
      group.add(wire);
      const ticket = new THREE.Mesh(
        new THREE.BoxGeometry(0.64, 0.034, 0.28),
        this.artifactLabelMaterial("TRAM", "#efd18a", "#263d45", "#b35f4a")
      );
      ticket.position.set(-0.28, 0.34, 0.34);
      ticket.rotation.set(0.12, -0.16, 0.18);
      group.add(ticket);
      this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.tramOchre, 0.2, 0.44, -0.3, 0.62, 0.02, 0.18, 0.2, -0.05);
      this.addArtifactPaintStroke(group, MELBOURNE_ANIME_PALETTE.weatheredWhite, -0.24, 0.2, -0.2, 0.46, 0.018, 0.16, -0.16, 0.08);
    }
    this.applyAnimeMeshStyle(group, 1.08);
    return group;
  }

  private paintedStandardMaterial(options: {
    color: THREE.ColorRepresentation;
    emissive?: THREE.ColorRepresentation;
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
    transparent?: boolean;
    opacity?: number;
  }): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: options.color,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      roughness: options.roughness ?? 0.84,
      metalness: options.metalness ?? 0.06,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1
    });
  }

  private artifactLabelMaterial(text: string, background: string, foreground: string, accent: string): THREE.MeshBasicMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? `${foreground}10` : `${accent}14`;
      ctx.fillRect((i * 47) % canvas.width, (i * 29) % canvas.height, 1 + (i % 3), 1 + (i % 2));
    }

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, canvas.width, 18);
    ctx.fillRect(0, canvas.height - 16, canvas.width, 16);
    ctx.globalAlpha = 1;

    ctx.lineCap = "round";
    for (let i = 0; i < 9; i += 1) {
      const y = 18 + i * 11 + Math.sin(i * 1.7) * 4;
      ctx.strokeStyle = i % 2 === 0 ? `${foreground}24` : `${accent}28`;
      ctx.lineWidth = 2 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(-18, y);
      ctx.bezierCurveTo(52, y - 7, 154, y + 9, 274, y - 5);
      ctx.stroke();
    }

    ctx.strokeStyle = `${accent}55`;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(8, 17);
    ctx.bezierCurveTo(52, 8, 148, 18, 248, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, 111);
    ctx.bezierCurveTo(82, 120, 169, 104, 248, 114);
    ctx.stroke();

    ctx.strokeStyle = foreground;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.strokeStyle = `${background}cc`;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
    ctx.fillStyle = foreground;
    ctx.font = text.length > 3 ? "800 42px system-ui, sans-serif" : "900 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return new THREE.MeshBasicMaterial({ map: texture });
  }

  private addBladeWeathering(group: THREE.Group, length: number, bladeWidth: number, machete: boolean): void {
    const notchMaterial = new THREE.MeshBasicMaterial({ color: MELBOURNE_ANIME_PALETTE.bluestoneShadow });
    const tapeMaterial = new THREE.MeshBasicMaterial({ color: machete ? MELBOURNE_ANIME_PALETTE.tramOchre : MELBOURNE_ANIME_PALETTE.eucalyptus });
    for (let index = 0; index < (machete ? 5 : 3); index += 1) {
      const nick = new THREE.Mesh(new THREE.BoxGeometry(bladeWidth * 0.22, 0.014, length * 0.045), notchMaterial);
      nick.position.set(bladeWidth * 0.45, 0.128, -length * (0.18 + index * 0.13));
      nick.rotation.set(-0.08, 0, 0.22 + index * 0.04);
      group.add(nick);
    }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(bladeWidth * 1.42, 0.018, length * 0.055), tapeMaterial);
    tape.position.set(0, 0.13, length * 0.03);
    tape.rotation.set(-0.08, 0, -0.05);
    group.add(tape);
  }

  private addFirearmParkDetails(group: THREE.Group, weaponId: WeaponId, length: number): void {
    const tapeMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.tramOchre, roughness: 0.9, metalness: 0.02 });
    const greenMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.eucalyptShadow, roughness: 0.92 });
    const blueMaterial = this.paintedStandardMaterial({ color: MELBOURNE_ANIME_PALETTE.wetBluestone, roughness: 0.78, metalness: 0.14 });
    const wrapZ = weaponId === "shotgun" ? -length * 0.42 : weaponId === "smg" ? -length * 0.28 : -length * 0.34;
    for (let index = 0; index < 3; index += 1) {
      const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.035, 0.055), index === 1 ? greenMaterial : tapeMaterial);
      wrap.position.set(0, 0.155 - index * 0.006, wrapZ + index * 0.1);
      wrap.rotation.z = -0.06 + index * 0.05;
      wrap.castShadow = true;
      group.add(wrap);
    }

    const sling = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.032, length * 0.72), greenMaterial);
    sling.position.set(0.135, -0.015, -length * 0.16);
    sling.rotation.set(0.02, 0.04, 0.16);
    group.add(sling);

    const stencil = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.032, 0.34),
      this.artifactLabelMaterial(WEAPON_STENCIL[weaponId], "#263d45", "#efd18a", "#76906c")
    );
    stencil.position.set(-0.092, 0.08, -length * 0.18);
    stencil.rotation.y = Math.PI / 2;
    group.add(stencil);

    if (weaponId === "shotgun" || weaponId === "rifle") {
      const stockPatch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.2), blueMaterial);
      stockPatch.position.set(0, 0.12, length * 0.48);
      stockPatch.rotation.z = 0.04;
      stockPatch.castShadow = true;
      group.add(stockPatch);
    }
  }

  private addPickupBrushMarker(group: THREE.Group, type: PickupKind): void {
    const color =
      type === "ammo" ? MELBOURNE_ANIME_PALETTE.tramOchre : type === "health" ? MELBOURNE_ANIME_PALETTE.brick : MELBOURNE_ANIME_PALETTE.wetBluestone;
    const wash = new THREE.Mesh(
      new THREE.CircleGeometry(0.82, 18),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    wash.rotation.x = Math.PI / 2;
    wash.rotation.z = type === "scrap" ? 0.42 : -0.18;
    wash.position.y = -0.365;
    wash.scale.set(1.34, 0.68, 1);
    group.add(wash);

    for (let arc = 0; arc < 2; arc += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: arc === 0 ? color : MELBOURNE_ANIME_PALETTE.weatheredWhite,
        transparent: true,
        opacity: arc === 0 ? 0.42 : 0.22,
        depthWrite: false
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64 + arc * 0.16, 0.015, 6, 24, Math.PI * (1.18 + arc * 0.22)), material);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = (type === "scrap" ? 0.54 : -0.22) + arc * Math.PI * 0.72;
      ring.position.y = -0.34 - arc * 0.014;
      ring.scale.set(1.2, 0.74, 1);
      group.add(ring);
    }

    const strokeMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, depthWrite: false });
    for (let index = 0; index < 3; index += 1) {
      const stroke = new THREE.Mesh(new THREE.BoxGeometry(0.78 - index * 0.14, 0.006, 0.035), strokeMaterial);
      stroke.position.set(-0.18 + index * 0.2, -0.332 - index * 0.006, 0.34 - index * 0.21);
      stroke.rotation.y = (type === "health" ? -0.34 : 0.22) + index * 0.28;
      group.add(stroke);
    }
  }

  private groundObject(group: THREE.Group): void {
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    if (Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y) > 0.001) {
      for (const child of group.children) {
        child.position.y -= bounds.min.y;
      }
    }
  }

  private applyAnimeMeshStyle(root: THREE.Object3D, outlineScale: number): void {
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: ANIME_OUTLINE_COLOR,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.76,
      depthWrite: false
    });
    const meshes: THREE.Mesh[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.animeOutline) {
        return;
      }
      tuneAnimeMaterialStyle(object.material);
      if (this.shouldOutline(object)) {
        meshes.push(object);
      }
    });

    for (const mesh of meshes) {
      const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
      outline.position.copy(mesh.position);
      outline.quaternion.copy(mesh.quaternion);
      outline.scale.copy(mesh.scale).multiplyScalar(outlineScale);
      outline.renderOrder = -1;
      outline.userData.animeOutline = true;
      mesh.parent?.add(outline);
    }
  }

  private shouldOutline(mesh: THREE.Mesh): boolean {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.every((material) => !(material instanceof THREE.MeshBasicMaterial) && (!material.transparent || material.opacity >= 0.9));
  }
}
