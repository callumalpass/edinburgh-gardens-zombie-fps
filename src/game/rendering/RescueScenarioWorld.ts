import * as THREE from "three";
import { resolveObstacle } from "../collision";
import { distance } from "../geo";
import type { Zombie } from "../state";
import type { CollisionObstacle, Vec2 } from "../types";
import type { RescueScenarioLayout, ScenarioGateDefinition } from "../rescueScenario";
import { instantiateRescueAsset } from "./RescueScenarioAsset";
import { tuneAnimeMaterial } from "./animeStyle";
import { disposeThreeResources } from "./disposeThreeResources";

export type ScenarioInteractionTarget =
  | { kind: "gate"; gate: ScenarioGateDefinition }
  | { kind: "barricade"; id: string; grabbed: boolean };

export interface ScenarioBarricadeSnapshot {
  id: string;
  x: number;
  z: number;
  angle: number;
  health: number;
  destroyed: boolean;
  grabbedBy: string | null;
}

interface GateRuntime {
  definition: ScenarioGateDefinition;
  root: THREE.Group;
  panel: THREE.Group;
  unlocked: boolean;
}

interface BarricadeRuntime {
  id: string;
  root: THREE.Group;
  position: Vec2;
  angle: number;
  health: number;
  destroyed: boolean;
  grabbedBy: string | null;
}

export class RescueScenarioWorld {
  private readonly root = new THREE.Group();
  private readonly gates: GateRuntime[] = [];
  private readonly barricades: BarricadeRuntime[] = [];
  private dogRoot: THREE.Group | null = null;
  private dogMixer: THREE.AnimationMixer | null = null;
  private dogActions = new Map<string, THREE.AnimationAction>();
  private dogAnimation = "";
  private dogFreed = false;
  private dogPosition: Vec2;
  private dogYaw = 0;
  private damageStatusCooldown = 0;

  constructor(
    private readonly scene: THREE.Scene,
    readonly layout: RescueScenarioLayout,
    private readonly groundY: (point: Vec2) => number,
    private readonly onBarricadeBroken: (id: string) => void
  ) {
    this.dogPosition = { ...layout.dogPosition };
    this.root.name = "Wave three rescue scenario";
    this.root.userData.dynamic = true;
    this.scene.add(this.root);
    this.createGates();
    this.createBarricades();
    void this.createDog();
  }

  dispose(): void {
    this.dogMixer?.stopAllAction();
    this.scene.remove(this.root);
    disposeThreeResources(this.root);
  }

  reset(): void {
    this.dogFreed = false;
    this.dogPosition = { ...this.layout.dogPosition };
    const dogDoor = this.layout.gates.find((gate) => gate.objectiveGate)?.position ?? this.layout.dogPosition;
    this.dogYaw = Math.atan2(
      dogDoor.x - this.layout.dogBuildingCenter.x,
      dogDoor.z - this.layout.dogBuildingCenter.z
    ) + Math.PI;
    for (const gate of this.gates) {
      gate.unlocked = false;
      gate.panel.rotation.y = 0;
      gate.panel.position.x = gate.definition.objectiveGate ? -gate.definition.width * 0.5 : 0;
    }
    for (let index = 0; index < this.barricades.length; index += 1) {
      const definition = this.layout.barricades[index];
      const barricade = this.barricades[index];
      barricade.position = { ...definition.position };
      barricade.angle = definition.angle;
      barricade.health = 100;
      barricade.destroyed = false;
      barricade.grabbedBy = null;
      barricade.root.visible = true;
      this.syncBarricade(barricade);
    }
    this.syncDog();
    this.transitionDog("Sit");
  }

  setDogFreed(freed: boolean): void {
    if (freed && !this.dogFreed) {
      const dogDoor = this.layout.gates.find((gate) => gate.objectiveGate)?.position;
      if (dogDoor) {
        const dx = dogDoor.x - this.layout.dogBuildingCenter.x;
        const dz = dogDoor.z - this.layout.dogBuildingCenter.z;
        const length = Math.hypot(dx, dz) || 1;
        this.dogPosition = {
          x: dogDoor.x + dx / length * 0.55,
          z: dogDoor.z + dz / length * 0.55
        };
        this.dogYaw = Math.atan2(dx, dz) + Math.PI;
      }
    }
    this.dogFreed = freed;
    this.syncDog();
    this.transitionDog(freed ? "Walk" : "Sit");
  }

  unlockGate(id: string): boolean {
    const gate = this.gates.find((candidate) => candidate.definition.id === id);
    if (!gate || gate.unlocked) return false;
    gate.unlocked = true;
    gate.panel.rotation.y = -Math.PI * 0.48;
    gate.panel.position.x = gate.definition.objectiveGate
      ? -gate.definition.width * 0.5
      : -gate.definition.width * 0.43;
    return true;
  }

  isGateUnlocked(id: string): boolean {
    return this.gates.find((candidate) => candidate.definition.id === id)?.unlocked ?? false;
  }

  nearestInteraction(point: Vec2, reach = 5.2): ScenarioInteractionTarget | null {
    let nearest: ScenarioInteractionTarget | null = null;
    let nearestDistance = reach;
    for (const gate of this.gates) {
      if (gate.unlocked) continue;
      const candidateDistance = distance(point, gate.definition.position);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearest = { kind: "gate", gate: gate.definition };
      }
    }
    for (const barricade of this.barricades) {
      if (barricade.destroyed) continue;
      const candidateDistance = distance(point, barricade.position);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearest = { kind: "barricade", id: barricade.id, grabbed: barricade.grabbedBy !== null };
      }
    }
    return nearest;
  }

  toggleBarricade(id: string, ownerId: string): boolean {
    const barricade = this.barricades.find((candidate) => candidate.id === id && !candidate.destroyed);
    if (!barricade) return false;
    if (barricade.grabbedBy === ownerId) {
      barricade.grabbedBy = null;
      return true;
    }
    const previous = this.barricades.find((candidate) => candidate.grabbedBy === ownerId);
    if (previous) {
      previous.grabbedBy = null;
    }
    if (barricade.grabbedBy !== null) return false;
    barricade.grabbedBy = ownerId;
    return true;
  }

  releaseGrabbedBarricade(ownerId: string): void {
    const barricade = this.barricades.find((candidate) => candidate.grabbedBy === ownerId);
    if (barricade) barricade.grabbedBy = null;
  }

  update(
    dt: number,
    actors: readonly { id: string; position: Vec2; yaw: number }[],
    playerPosition: Vec2,
    playerYaw: number,
    zombies: readonly Zombie[]
  ): void {
    this.damageStatusCooldown = Math.max(0, this.damageStatusCooldown - dt);
    for (const grabbed of this.barricades.filter((candidate) => candidate.grabbedBy !== null && !candidate.destroyed)) {
      const actor = actors.find((candidate) => candidate.id === grabbed.grabbedBy);
      if (!actor) {
        grabbed.grabbedBy = null;
        continue;
      }
      grabbed.position = {
        x: actor.position.x - Math.sin(actor.yaw) * 2.5,
        z: actor.position.z - Math.cos(actor.yaw) * 2.5
      };
      grabbed.angle = actor.yaw;
      this.syncBarricade(grabbed);
    }
    this.updateBarricadeDamage(dt, zombies);
    this.updateDog(dt, playerPosition, playerYaw);
  }

  resolveCollision(point: Vec2, radius: number, options: { ignoreGrabbedBy?: string } = {}): Vec2 {
    let next = point;
    for (const gate of this.gates) {
      if (gate.unlocked) continue;
      next = resolveObstacle(next, radius, gateObstacle(gate.definition));
    }
    for (const barricade of this.barricades) {
      if (barricade.destroyed || (options.ignoreGrabbedBy && barricade.grabbedBy === options.ignoreGrabbedBy)) continue;
      next = resolveObstacle(next, radius, barricadeObstacle(barricade));
    }
    return next;
  }

  get intactBarricadeCount(): number {
    return this.barricades.filter((barricade) => !barricade.destroyed).length;
  }

  get freedDogPosition(): Vec2 | null {
    return this.dogFreed ? { ...this.dogPosition } : null;
  }

  barricadeSnapshots(): ScenarioBarricadeSnapshot[] {
    return this.barricades.map((barricade) => ({
      id: barricade.id,
      x: barricade.position.x,
      z: barricade.position.z,
      angle: barricade.angle,
      health: barricade.health,
      destroyed: barricade.destroyed,
      grabbedBy: barricade.grabbedBy
    }));
  }

  applyBarricadeSnapshots(snapshots: readonly ScenarioBarricadeSnapshot[]): void {
    for (const snapshot of snapshots) {
      const barricade = this.barricades.find((candidate) => candidate.id === snapshot.id);
      if (!barricade) continue;
      barricade.position = { x: snapshot.x, z: snapshot.z };
      barricade.angle = snapshot.angle;
      barricade.health = snapshot.health;
      barricade.destroyed = snapshot.destroyed;
      barricade.grabbedBy = snapshot.grabbedBy;
      barricade.root.visible = !snapshot.destroyed;
      this.syncBarricade(barricade);
    }
  }

  private createGates(): void {
    for (const definition of this.layout.gates) {
      const root = new THREE.Group();
      root.name = definition.label;
      root.position.set(definition.position.x, this.groundY(definition.position), definition.position.z);
      root.rotation.y = definition.angle;
      const panel = createGatePanel(definition.width, definition.objectiveGate ?? false);
      if (definition.objectiveGate) {
        for (const child of panel.children) child.position.x += definition.width * 0.5;
        panel.position.x = -definition.width * 0.5;
      }
      root.add(panel);
      this.root.add(root);
      this.gates.push({ definition, root, panel, unlocked: false });
    }
  }

  private createBarricades(): void {
    for (const definition of this.layout.barricades) {
      const barricade: BarricadeRuntime = {
        id: definition.id,
        root: createBarricadeMesh(),
        position: { ...definition.position },
        angle: definition.angle,
        health: 100,
        destroyed: false,
        grabbedBy: null
      };
      barricade.root.name = `Movable barricade ${definition.id}`;
      this.root.add(barricade.root);
      this.barricades.push(barricade);
      this.syncBarricade(barricade);
    }
  }

  private async createDog(): Promise<void> {
    try {
      const asset = await instantiateRescueAsset("dog");
      asset.root.scale.setScalar(1.02);
      this.dogRoot = asset.root;
      this.root.add(asset.root);
      this.dogMixer = new THREE.AnimationMixer(asset.root);
      this.dogActions = new Map(asset.animations.map((clip) => [clip.name, this.dogMixer!.clipAction(clip)]));
      this.syncDog();
      this.transitionDog(this.dogFreed ? "Walk" : "Sit");
    } catch {
      const fallback = createDogFallback();
      this.dogRoot = fallback;
      this.root.add(fallback);
      this.syncDog();
    }
  }

  private updateDog(dt: number, playerPosition: Vec2, playerYaw: number): void {
    if (this.dogFreed) {
      const desired = {
        x: playerPosition.x + Math.sin(playerYaw + 0.75) * 3.2,
        z: playerPosition.z + Math.cos(playerYaw + 0.75) * 3.2
      };
      const dx = desired.x - this.dogPosition.x;
      const dz = desired.z - this.dogPosition.z;
      const gap = Math.hypot(dx, dz);
      if (gap > 0.18) {
        const speed = Math.min(9.5, 2.8 + gap * 0.58);
        const step = Math.min(gap, speed * dt);
        this.dogPosition.x += (dx / gap) * step;
        this.dogPosition.z += (dz / gap) * step;
        this.dogYaw = Math.atan2(dx, dz);
        this.transitionDog("Walk");
      } else {
        this.transitionDog("Idle");
      }
    }
    this.dogMixer?.update(dt);
    this.syncDog();
  }

  private transitionDog(name: string): void {
    if (this.dogAnimation === name) return;
    const next = this.dogActions.get(name) ?? this.dogActions.get("Idle");
    if (!next) return;
    this.dogActions.get(this.dogAnimation)?.fadeOut(0.16);
    next.reset().fadeIn(0.16).play();
    this.dogAnimation = name;
  }

  private syncDog(): void {
    if (!this.dogRoot) return;
    this.dogRoot.position.set(this.dogPosition.x, this.groundY(this.dogPosition), this.dogPosition.z);
    this.dogRoot.rotation.y = this.dogYaw + Math.PI;
  }

  private updateBarricadeDamage(dt: number, zombies: readonly Zombie[]): void {
    for (const barricade of this.barricades) {
      if (barricade.destroyed || barricade.grabbedBy !== null) continue;
      const attackers = zombies.filter((zombie) => zombie.aiState === "chase" && distance(zombie.position, barricade.position) < 2.1).length;
      if (attackers === 0) continue;
      barricade.health -= dt * attackers * 7.5;
      barricade.root.rotation.z = Math.sin(performance.now() * 0.018 + barricade.health) * 0.025;
      if (barricade.health <= 0) {
        barricade.destroyed = true;
        barricade.root.visible = false;
        this.onBarricadeBroken(barricade.id);
      }
    }
  }

  private syncBarricade(barricade: BarricadeRuntime): void {
    barricade.root.position.set(barricade.position.x, this.groundY(barricade.position), barricade.position.z);
    barricade.root.rotation.y = barricade.angle;
  }
}

function styledMaterial(color: THREE.ColorRepresentation, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  tuneAnimeMaterial(material);
  return material;
}

function createGatePanel(width: number, objective: boolean): THREE.Group {
  const group = new THREE.Group();
  const metal = styledMaterial(0x405955, 0.72, 0.28);
  const accent = styledMaterial(objective ? 0xd1a13f : 0x9f6345, 0.82, 0.08);
  if (objective) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(width, 2.22, 0.105), styledMaterial(0x566d6b, 0.88, 0.12));
    door.position.set(0, 1.11, 0);
    door.castShadow = true;
    group.add(door);
    for (const y of [1.72, 1.86, 2]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(width * 0.46, 0.045, 0.025), metal);
      vent.position.set(0, y, 0.065);
      group.add(vent);
    }
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.11, 0.15), metal);
    jamb.position.set(0, 2.275, 0);
    group.add(jamb);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.12), accent);
    lock.position.set(width * 0.34, 1.08, 0.095);
    lock.castShadow = true;
    group.add(lock);
    return group;
  }
  for (const x of [-width * 0.5, width * 0.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.16), metal);
    post.position.set(x, 1.25, 0);
    post.castShadow = true;
    group.add(post);
  }
  for (let index = 0; index < 7; index += 1) {
    const x = -width * 0.42 + (index / 6) * width * 0.84;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.05, 0.08), index === 3 ? accent : metal);
    bar.position.set(x, 1.2, 0);
    bar.castShadow = true;
    group.add(bar);
  }
  for (const y of [0.32, 1.18, 2.08]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.09, 0.09), metal);
    rail.position.set(0, y, 0);
    rail.castShadow = true;
    group.add(rail);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.16), accent);
  lock.position.set(0.18, 1.12, 0.08);
  group.add(lock);
  return group;
}

function createBarricadeMesh(): THREE.Group {
  const group = new THREE.Group();
  const timber = styledMaterial(0x78563d, 0.94, 0.02);
  const ochre = styledMaterial(0xc9973a, 0.84, 0.04);
  const metal = styledMaterial(0x697a74, 0.64, 0.32);
  for (const y of [0.62, 1.25]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.38, 0.2), y > 1 ? ochre : timber);
    plank.position.set(0, y, 0);
    plank.rotation.z = y > 1 ? -0.035 : 0.045;
    plank.castShadow = true;
    group.add(plank);
  }
  for (const x of [-1.22, 1.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.65, 0.18), metal);
    leg.position.set(x, 0.83, 0);
    leg.rotation.z = x < 0 ? -0.08 : 0.08;
    leg.castShadow = true;
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.78), metal);
    foot.position.set(x, 0.1, 0);
    foot.castShadow = true;
    group.add(foot);
  }
  return group;
}

function createDogFallback(): THREE.Group {
  const group = new THREE.Group();
  const material = styledMaterial(0x263936, 0.92, 0.02);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.72, 4, 8), material);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.62;
  group.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), material);
  head.position.set(0, 0.86, 0.58);
  group.add(head);
  return group;
}

function gateObstacle(gate: ScenarioGateDefinition): CollisionObstacle {
  return {
    id: gate.id,
    label: gate.label,
    shape: "box",
    center: gate.position,
    halfX: gate.width * 0.5,
    halfZ: 0.16,
    angle: gate.angle,
    blocksSight: false,
    sourceObjectId: gate.id,
    sourceObjectKind: "park-life-detail"
  };
}

function barricadeObstacle(barricade: Pick<BarricadeRuntime, "id" | "position" | "angle">): CollisionObstacle {
  return {
    id: barricade.id,
    label: "Movable maintenance barricade",
    shape: "box",
    center: barricade.position,
    halfX: 1.6,
    halfZ: 0.36,
    angle: barricade.angle,
    blocksSight: false,
    jumpable: true,
    jumpBypassMinHeight: 0.65,
    sourceObjectId: barricade.id,
    sourceObjectKind: "park-life-detail"
  };
}
