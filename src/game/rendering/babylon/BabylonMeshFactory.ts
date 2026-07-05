import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode
} from "@babylonjs/core";
import type { WeaponId } from "../../weapons";
import type { ZombieType } from "../../waves";
import { enablePaintedEdges } from "./BabylonGeometry";
import type { BabylonGameMaterials } from "./BabylonMaterials";

export type PickupKind = "scrap" | "health" | "ammo";

const ZOMBIE_ACCENTS: Record<ZombieType, string> = {
  shambler: "#8a806f",
  sprinter: "#9a8c74",
  bloater: "#7f6d5f",
  crawler: "#6f7465",
  screamer: "#a79a7d"
};

const ZOMBIE_CLOTHES = ["#283438", "#3b3832", "#4a4d40", "#34454b", "#4f3f36", "#2b2f34"];
const ZOMBIE_FLESH = ["#8a806f", "#9a8c74", "#817767", "#716f62", "#a2957b"];

export class BabylonMeshFactory {
  private readonly materialCache = new Map<string, StandardMaterial>();

  constructor(
    private readonly scene: Scene,
    private readonly materials: BabylonGameMaterials
  ) {}

  createWeaponMesh(weaponId: WeaponId, firstPerson = false): TransformNode {
    const root = new TransformNode(`${weaponId}-weapon`, this.scene);
    const metal = this.materials.metal;
    const timber = this.materials.timber;
    const accent = this.cachedMaterial(`${weaponId}-accent`, weaponId === "shotgun" ? "#7b5435" : weaponId === "rifle" ? "#4f4a37" : "#304248");
    const isMelee = weaponId === "knife" || weaponId === "machete";

    if (isMelee) {
      const bladeLength = weaponId === "machete" ? (firstPerson ? 0.96 : 1.28) : firstPerson ? 0.5 : 0.72;
      const blade = MeshBuilder.CreateBox(`${weaponId}-blade`, { width: weaponId === "machete" ? 0.18 : 0.1, height: 0.035, depth: bladeLength }, this.scene);
      blade.position.set(0, 0.08, -bladeLength * 0.36);
      blade.rotation.x = -0.06;
      blade.material = metal;
      blade.parent = root;
      enablePaintedEdges(blade);

      const grip = MeshBuilder.CreateCapsule(`${weaponId}-grip`, { radius: 0.07, height: 0.42, tessellation: 10 }, this.scene);
      grip.position.set(0, -0.05, bladeLength * 0.18);
      grip.rotation.x = Math.PI / 2;
      grip.scaling.z = 0.75;
      grip.material = timber;
      grip.parent = root;
      enablePaintedEdges(grip);

      const guard = MeshBuilder.CreateBox(`${weaponId}-guard`, { width: 0.32, height: 0.055, depth: 0.08 }, this.scene);
      guard.position.set(0, 0.035, 0.02);
      guard.material = accent;
      guard.parent = root;
      enablePaintedEdges(guard);
      root.rotation.z = firstPerson ? 0.18 : 0;
    } else {
      const length = weaponId === "rifle" ? 1.55 : weaponId === "shotgun" ? 1.35 : weaponId === "smg" ? 0.86 : 1.08;
      const body = MeshBuilder.CreateBox(`${weaponId}-body`, { width: 0.18, height: 0.18, depth: length }, this.scene);
      body.position.z = -0.24;
      body.material = accent;
      body.parent = root;
      enablePaintedEdges(body);

      const barrel = MeshBuilder.CreateCylinder(`${weaponId}-barrel`, { diameterTop: 0.065, diameterBottom: 0.085, height: length * 0.92, tessellation: 10 }, this.scene);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.08, -length * 0.62);
      barrel.material = metal;
      barrel.parent = root;
      enablePaintedEdges(barrel);

      const grip = MeshBuilder.CreateBox(`${weaponId}-grip`, { width: 0.14, height: 0.36, depth: 0.16 }, this.scene);
      grip.position.set(0, -0.24, firstPerson ? 0.2 : 0.12);
      grip.rotation.x = -0.28;
      grip.material = accent;
      grip.parent = root;
      enablePaintedEdges(grip);

      const stock = MeshBuilder.CreateBox(`${weaponId}-stock`, { width: 0.22, height: 0.2, depth: weaponId === "smg" ? 0.22 : 0.42 }, this.scene);
      stock.position.set(0, -0.01, length * 0.48);
      stock.material = timber;
      stock.parent = root;
      enablePaintedEdges(stock);

      if (weaponId === "rifle" || weaponId === "carbine") {
        const optic = MeshBuilder.CreateCylinder(`${weaponId}-optic`, { diameter: weaponId === "rifle" ? 0.17 : 0.13, height: weaponId === "rifle" ? 0.58 : 0.34, tessellation: 14 }, this.scene);
        optic.rotation.x = Math.PI / 2;
        optic.position.set(0, 0.27, -0.18);
        optic.material = metal;
        optic.parent = root;
        enablePaintedEdges(optic);
      }
    }

    if (firstPerson) {
      const sleeve = this.cachedMaterial("player-sleeve", "#273f46");
      for (const side of isMelee ? [1] : [-1, 1]) {
        const arm = MeshBuilder.CreateCapsule(`arm-${side}`, { radius: 0.085, height: 0.52, tessellation: 8 }, this.scene);
        arm.position.set(side * 0.18, -0.34, isMelee ? 0.28 : 0.1);
        arm.rotation.set(-0.48, side * 0.14, side * 0.24);
        arm.material = sleeve;
        arm.parent = root;
        enablePaintedEdges(arm, new Color3(0.02, 0.03, 0.035), 0.7);
      }
    }

    return root;
  }

  createZombieMesh(type: ZombieType, variant = 0): TransformNode {
    const root = new TransformNode(`${type}-zombie`, this.scene);
    const scale = type === "bloater" ? 1.18 : type === "crawler" ? 0.72 : type === "sprinter" ? 0.92 : 1;
    const isCrawler = type === "crawler";
    const bodyMat = this.cachedMaterial(`${type}-skin-${variant % ZOMBIE_FLESH.length}`, ZOMBIE_FLESH[(variant + type.length) % ZOMBIE_FLESH.length]);
    const faceMat = this.cachedMaterial(`${type}-zombie-accent`, ZOMBIE_ACCENTS[type]);
    const cloth = this.cachedMaterial(`zombie-cloth-${variant % ZOMBIE_CLOTHES.length}`, ZOMBIE_CLOTHES[variant % ZOMBIE_CLOTHES.length]);
    const dark = this.materials.clothDark;
    const blood = this.materials.blood;
    const eyeSocket = this.cachedMaterial("zombie-eye-socket", "#0f100e");
    const bone = this.cachedMaterial("zombie-bone", "#c5b890");

    const body = MeshBuilder.CreateCapsule(`${type}-body`, { radius: 0.43 * scale, height: 1.45 * scale, tessellation: 10 }, this.scene);
    body.position.y = isCrawler ? 0.78 * scale : 1.26 * scale;
    body.rotation.x = isCrawler ? 1.18 : type === "sprinter" ? -0.16 : type === "bloater" ? 0.04 : -0.05;
    body.material = bodyMat;
    body.parent = root;
    enablePaintedEdges(body, new Color3(0.018, 0.02, 0.018), 0.42);

    const jacket = MeshBuilder.CreateBox(`${type}-jacket`, { width: 0.72 * scale, height: 0.72 * scale, depth: 0.18 * scale }, this.scene);
    jacket.position.set(0, isCrawler ? 0.9 * scale : 1.36 * scale, -0.34 * scale);
    jacket.rotation.x = body.rotation.x * 0.6;
    jacket.material = cloth;
    jacket.parent = root;
    enablePaintedEdges(jacket, new Color3(0.015, 0.018, 0.018), 0.34);

    const pelvis = MeshBuilder.CreateBox(`${type}-pelvis-cloth`, { width: 0.58 * scale, height: 0.22 * scale, depth: 0.34 * scale }, this.scene);
    pelvis.position.set(0, isCrawler ? 0.38 * scale : 0.72 * scale, 0.03);
    pelvis.rotation.x = isCrawler ? 0.68 : 0;
    pelvis.material = dark;
    pelvis.parent = root;
    enablePaintedEdges(pelvis, new Color3(0.015, 0.018, 0.018), 0.32);

    const head = MeshBuilder.CreateSphere(`${type}-head`, { diameter: 0.62 * scale, segments: 12 }, this.scene);
    head.position.set(0.06 * scale, isCrawler ? 1.22 * scale : 2.2 * scale, isCrawler ? -0.56 * scale : -0.05);
    head.rotation.x = isCrawler ? 0.46 : -0.08;
    head.material = faceMat;
    head.parent = root;
    enablePaintedEdges(head, new Color3(0.018, 0.018, 0.014), 0.38);

    for (const side of [-1, 1]) {
      const socket = MeshBuilder.CreateSphere(`${type}-eye-socket-${side}`, { diameter: 0.12 * scale, segments: 6 }, this.scene);
      socket.position.set(side * 0.13 * scale, head.position.y + 0.05 * scale, head.position.z - 0.29 * scale);
      socket.scaling.y = 0.58;
      socket.material = eyeSocket;
      socket.parent = root;

      const eye = MeshBuilder.CreateSphere(`${type}-eye-${side}`, { diameter: 0.045 * scale, segments: 5 }, this.scene);
      eye.position.set(side * 0.13 * scale, head.position.y + 0.052 * scale, head.position.z - 0.34 * scale);
      eye.material = bone;
      eye.parent = root;
    }

    const jaw = MeshBuilder.CreateBox(`${type}-jaw`, { width: 0.28 * scale, height: 0.08 * scale, depth: 0.16 * scale }, this.scene);
    jaw.position.set(0.04 * scale, head.position.y - 0.23 * scale, head.position.z - 0.22 * scale);
    jaw.rotation.x = 0.18;
    jaw.material = bodyMat;
    jaw.parent = root;
    enablePaintedEdges(jaw, new Color3(0.018, 0.018, 0.014), 0.28);

    const hairClumpCount = type === "bloater" ? 2 : 4;
    for (let index = 0; index < hairClumpCount; index += 1) {
      const hair = MeshBuilder.CreateBox(`${type}-hair-${index}`, { width: 0.14 * scale, height: 0.08 * scale, depth: 0.18 * scale }, this.scene);
      hair.position.set((index - (hairClumpCount - 1) / 2) * 0.09 * scale, head.position.y + 0.28 * scale, head.position.z - 0.03 * scale);
      hair.rotation.set(0.2 + index * 0.06, 0.12 * index, -0.18 + index * 0.08);
      hair.material = eyeSocket;
      hair.parent = root;
    }

    const arms: Mesh[] = [];
    const legs: Mesh[] = [];
    for (const side of [-1, 1]) {
      const arm = MeshBuilder.CreateCapsule(`${type}-arm-${side}`, { radius: 0.11 * scale, height: 0.9 * scale, tessellation: 8 }, this.scene);
      arm.position.set(side * 0.52 * scale, isCrawler ? 0.66 * scale : 1.42 * scale, isCrawler ? -0.36 * scale : -0.08);
      arm.rotation.z = side * (isCrawler ? 0.82 : 0.42);
      arm.rotation.x = isCrawler ? 1.18 : type === "sprinter" ? -0.28 : 0.2;
      arm.rotation.y = side * 0.08;
      arm.material = dark;
      arm.parent = root;
      arms.push(arm);
      enablePaintedEdges(arm, new Color3(0.015, 0.018, 0.018), 0.34);

      const forearmSkin = MeshBuilder.CreateCapsule(`${type}-forearm-skin-${side}`, { radius: 0.085 * scale, height: 0.48 * scale, tessellation: 7 }, this.scene);
      forearmSkin.position.set(side * 0.72 * scale, isCrawler ? 0.44 * scale : 1.08 * scale, isCrawler ? -0.7 * scale : -0.28 * scale);
      forearmSkin.rotation.z = side * (isCrawler ? 1.06 : 0.58);
      forearmSkin.rotation.x = isCrawler ? 1.28 : 0.42;
      forearmSkin.material = bodyMat;
      forearmSkin.parent = root;
      enablePaintedEdges(forearmSkin, new Color3(0.018, 0.02, 0.018), 0.28);

      const leg = MeshBuilder.CreateCapsule(`${type}-leg-${side}`, { radius: 0.14 * scale, height: 0.9 * scale, tessellation: 8 }, this.scene);
      leg.position.set(side * 0.18 * scale, isCrawler ? 0.18 * scale : 0.45 * scale, isCrawler ? 0.34 * scale : 0);
      leg.rotation.z = side * (isCrawler ? 0.34 : 0.1);
      leg.rotation.x = isCrawler ? 1.12 : 0;
      leg.material = dark;
      leg.parent = root;
      legs.push(leg);
      enablePaintedEdges(leg, new Color3(0.015, 0.018, 0.018), 0.34);
    }

    const woundCount = type === "bloater" ? 5 : type === "crawler" ? 3 : 4;
    for (let index = 0; index < woundCount; index += 1) {
      const wound = MeshBuilder.CreateBox(`${type}-wound-${index}`, { width: (0.12 + (index % 2) * 0.09) * scale, height: 0.028 * scale, depth: 0.018 * scale }, this.scene);
      wound.position.set(
        ((index % 3) - 1) * 0.18 * scale,
        (isCrawler ? 0.78 : 1.2 + index * 0.16) * scale,
        -0.45 * scale
      );
      wound.rotation.set(body.rotation.x + 0.05 * index, 0.04 * index, -0.24 + index * 0.17);
      wound.material = blood;
      wound.parent = root;
    }

    for (let index = 0; index < 3; index += 1) {
      const tear = MeshBuilder.CreateBox(`${type}-cloth-tear-${index}`, { width: 0.055 * scale, height: 0.34 * scale, depth: 0.02 * scale }, this.scene);
      tear.position.set((-0.24 + index * 0.24) * scale, (isCrawler ? 0.72 : 1.05) * scale, -0.48 * scale);
      tear.rotation.z = -0.22 + index * 0.18;
      tear.rotation.x = body.rotation.x;
      tear.material = dark;
      tear.parent = root;
    }

    root.metadata = { arms, legs, head, body, jacket, scale, isCrawler };
    root.scaling.setAll(type === "bloater" ? 1.16 : type === "sprinter" ? 1.08 : 1.12);
    return root;
  }

  createPickupMesh(kind: PickupKind): TransformNode {
    const root = new TransformNode(`${kind}-pickup`, this.scene);
    const material =
      kind === "health"
        ? this.cachedMaterial("pickup-health", "#c85243")
        : kind === "ammo"
          ? this.cachedMaterial("pickup-ammo", "#d1a44f")
          : this.cachedMaterial("pickup-scrap", "#78b2b8");
    const mesh = kind === "health"
      ? MeshBuilder.CreateBox("health-box", { width: 0.42, height: 0.22, depth: 0.42 }, this.scene)
      : MeshBuilder.CreateCylinder(`${kind}-cylinder`, { diameter: 0.34, height: 0.28, tessellation: 10 }, this.scene);
    mesh.position.y = 0.22;
    mesh.material = material;
    mesh.parent = root;
    enablePaintedEdges(mesh);
    return root;
  }

  createWeaponDropMesh(weaponId: WeaponId): TransformNode {
    const root = this.createWeaponMesh(weaponId, false);
    root.name = `${weaponId}-drop`;
    root.scaling.setAll(1.35);
    root.rotation.x = 0.16;
    root.rotation.y = Math.PI * 0.18;
    return root;
  }

  private cachedMaterial(name: string, color: string): StandardMaterial {
    const existing = this.materialCache.get(name);
    if (existing) return existing;
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.emissiveColor = Color3.FromHexString(color).scale(0.12);
    material.specularColor = new Color3(0.02, 0.02, 0.02);
    this.materialCache.set(name, material);
    return material;
  }
}
