import * as THREE from "three";
import {
  addAmmo,
  addWeapon,
  applyUpgrade,
  canUpgrade,
  consumeRound,
  createInitialLoadout,
  damageAtDistance,
  finishReloadIfReady,
  getWeaponStats,
  switchWeapon,
  startReload,
  UPGRADE_DEFINITIONS,
  WEAPON_DEFINITIONS,
  upgradeCost,
  type Loadout,
  type WeaponId
} from "./weapons";
import { clampToPolygon, distance, distanceToSegment, geoToWorld, makeCircle, nearestPointOnSegment, pointInPolygon, polygonCentroid } from "./geo";
import { createLevelData } from "./levelData";
import { SeededRandom } from "./random";
import { createZombieSpawn, getWaveConfig, type ZombieSpawn, type ZombieType } from "./waves";
import type {
  AmenityPoint,
  CollisionObstacle,
  InteractableFixture,
  Landmark,
  LevelData,
  LevelPath,
  SignificantTreePoint,
  UpgradeStation,
  Vec2,
  WeaponSpawn
} from "./types";

interface Zombie {
  id: number;
  type: ZombieType;
  mesh: THREE.Group;
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  speed: number;
  radius: number;
  reward: number;
  attackCooldown: number;
  walkOffset: number;
}

interface Pickup {
  id: number;
  type: "scrap" | "health" | "ammo";
  amount: number;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  ttl: number;
}

interface WeaponDrop {
  id: number;
  weaponId: WeaponId;
  label: string;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  ttl: number;
  source: "cache" | "zombie";
}

interface Tracer {
  mesh: THREE.Line;
  ttl: number;
}

interface ShellCasing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
}

interface SmokePuff {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
  maxTtl: number;
}

type TreeProfile = "elm" | "gum" | "oak" | "generic";
type HitZone = "head" | "body" | "legs";

interface HudRefs {
  health: HTMLElement;
  ammo: HTMLElement;
  reserve: HTMLElement;
  wave: HTMLElement;
  scrap: HTMLElement;
  zombies: HTMLElement;
  prompt: HTMLElement;
  upgrades: HTMLElement;
  status: HTMLElement;
  start: HTMLButtonElement;
  restart: HTMLButtonElement;
  overlay: HTMLElement;
  miniMap: HTMLCanvasElement;
}

interface Snapshot {
  ready: boolean;
  state: string;
  frame: number;
  wave: number;
  zombies: number;
  ammo: number;
  health: number;
  scrap: number;
  weapon: WeaponId;
  weaponDrops: number;
  elevation: number;
  renderedTrees: number;
  lastHitZone: HitZone | null;
  shotBloom: number;
  reloadProgress: number;
  scope: number;
  fov: number;
  miniMapVisibleZombies: number;
}

declare global {
  interface Window {
    __EGAME__?: {
      ready: boolean;
      snapshot: () => Snapshot;
      testShoot: () => void;
      testUpgrade: (stationId?: string) => boolean;
      testSpawn: () => void;
      testPickupWeapon: (weaponId?: WeaponId) => boolean;
      testScope: (weaponId?: WeaponId) => boolean;
      testInteract: (fixtureId?: string) => boolean;
      testUseAmenity: (kind?: AmenityPoint["kind"]) => boolean;
      testMiniMapVisibility: () => { front: boolean; behind: boolean; occluded: boolean };
    };
  }
}

const PLAYER_RADIUS = 2.2;
const PLAYER_HEIGHT = 1.72;
const BASE_CAMERA_FOV = 74;
const TREE_SCALE_MULTIPLIER = 1.22;
const START_POSITION = new THREE.Vector3(35, 0, 42);
const COLLISION_Y = 0.04;

export class GameApp {
  private readonly root: HTMLElement;
  private readonly level: LevelData;
  private readonly rng = new SeededRandom(0xed1b97);
  private readonly smokeMode = new URLSearchParams(window.location.search).has("smoke");
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private canvas!: HTMLCanvasElement;
  private hud!: HudRefs;
  private audio: AudioContext | null = null;
  private state: "ready" | "playing" | "gameover" = "ready";
  private frame = 0;
  private lastFrameTime = performance.now();
  private player = {
    position: START_POSITION.clone(),
    velocity: new THREE.Vector3(),
    yaw: -2.45,
    pitch: -0.08,
    health: 100,
    scrap: 70,
    kills: 0,
    height: 0,
    heightTarget: 0,
    activeFixtureId: null as string | null
  };
  private keys = new Set<string>();
  private loadout: Loadout = createInitialLoadout();
  private lastShotAt = 0;
  private wave = 1;
  private spawnQueue: ZombieSpawn[] = [];
  private spawnTimer = 0;
  private nextZombieId = 1;
  private nextPickupId = 1;
  private zombies: Zombie[] = [];
  private pickups: Pickup[] = [];
  private weaponDrops: WeaponDrop[] = [];
  private tracers: Tracer[] = [];
  private shells: ShellCasing[] = [];
  private smokePuffs: SmokePuff[] = [];
  private lastDamageAt = 0;
  private nearestStation: UpgradeStation | null = null;
  private nearestFixture: InteractableFixture | null = null;
  private nearestAmenity: AmenityPoint | null = null;
  private nearestWeaponDrop: WeaponDrop | null = null;
  private searchedAmenityIds = new Set<string>();
  private scratchVector = new THREE.Vector3();
  private weaponModel = new THREE.Group();
  private muzzleFlash: THREE.Object3D | null = null;
  private muzzleLight: THREE.PointLight | null = null;
  private recoil = 0;
  private recoilYaw = 0;
  private shotBloom = 0;
  private aimHeld = false;
  private scopeAmount = 0;
  private muzzleTimer = 0;
  private renderedTreeCount = 0;
  private miniMapVisibleZombieCount = 0;
  private lastHitZone: HitZone | null = null;
  private materials!: ReturnType<GameApp["createMaterials"]>;

  constructor(root: HTMLElement) {
    this.root = root;
    this.level = createLevelData();
  }

  init(): void {
    this.root.innerHTML = this.createMarkup();
    this.hud = this.findHudRefs();
    this.canvas = this.root.querySelector<HTMLCanvasElement>(".game-canvas")!;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.smokeMode,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.smokeMode ? 1 : 1.5));
    this.renderer.shadowMap.enabled = !this.smokeMode;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV, 1, 0.1, 1800);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08100c);
    this.scene.fog = new THREE.FogExp2(0x08100c, 0.0025);
    this.materials = this.createMaterials();
    this.scene.add(this.camera);
    this.camera.add(this.weaponModel);
    this.rebuildViewWeapon();
    this.createWorld();
    this.createUpgradeStations();
    this.spawnInitialWeapons();
    this.bindEvents();
    this.resize();
    this.startWave(1);
    this.updateHud();

    if (this.smokeMode) {
      this.start();
    }

    window.__EGAME__ = {
      ready: true,
      snapshot: () => this.snapshot(),
      testShoot: () => this.shoot(performance.now() / 1000, true),
      testUpgrade: (stationId?: string) => this.buyUpgrade(stationId),
      testSpawn: () => this.forceSpawnZombie(),
      testPickupWeapon: (weaponId?: WeaponId) => this.testPickupWeapon(weaponId),
      testScope: (weaponId?: WeaponId) => this.testScope(weaponId),
      testInteract: (fixtureId?: string) => this.testInteract(fixtureId),
      testUseAmenity: (kind?: AmenityPoint["kind"]) => this.testUseAmenity(kind),
      testMiniMapVisibility: () => this.testMiniMapVisibility()
    };

    requestAnimationFrame((time) => this.tick(time));
  }

  private createMarkup(): string {
    return `
      <main class="shell">
        <canvas class="game-canvas" aria-label="First person zombie shooter set in Edinburgh Gardens"></canvas>
        <div class="vignette" aria-hidden="true"></div>
        <div class="crosshair" aria-hidden="true"><span></span><span></span></div>
        <div class="scope-overlay" aria-hidden="true"><span></span><span></span><i></i></div>
        <section class="hud top-hud" aria-label="Game status">
          <div class="meter health-meter"><span>Health</span><strong data-hud="health">100</strong></div>
          <div class="meter"><span>Wave</span><strong data-hud="wave">1</strong></div>
          <div class="meter"><span>Scrap</span><strong data-hud="scrap">70</strong></div>
          <div class="meter"><span>Zombies</span><strong data-hud="zombies">0</strong></div>
        </section>
        <section class="hud weapon-hud" aria-label="Weapon status">
          <div class="ammo"><strong data-hud="ammo">12</strong><span>/</span><span data-hud="reserve">72</span></div>
          <div class="status-line" data-hud="status">Emergency carbine</div>
          <div class="upgrade-strip" data-hud="upgrades"></div>
        </section>
        <canvas class="mini-map" width="220" height="220" aria-label="Mini map"></canvas>
        <div class="interaction-prompt" data-hud="prompt"></div>
        <section class="start-overlay" data-hud="overlay">
          <div class="start-panel">
            <p class="kicker">Fitzroy North quarantine zone</p>
            <h1>Edinburgh Gardens: Last Light</h1>
            <p class="brief">Hold the oval, cut through the rail trail, and use the park fixtures as upgrade points before the next wave finds you.</p>
            <div class="controls-grid" aria-label="Controls">
              <span>WASD move</span>
              <span>Mouse look</span>
              <span>Click fire</span>
              <span>Right click scope</span>
              <span>R reload</span>
              <span>E interact</span>
              <span>Shift sprint</span>
              <span>1-4 weapons</span>
            </div>
            <button class="primary-action" data-action="start">Enter the gardens</button>
          </div>
        </section>
        <button class="restart-button" data-action="restart" hidden>Restart</button>
      </main>
    `;
  }

  private findHudRefs(): HudRefs {
    const find = <T extends HTMLElement>(selector: string) => {
      const node = this.root.querySelector<T>(selector);
      if (!node) {
        throw new Error(`Missing HUD element ${selector}`);
      }
      return node;
    };

    return {
      health: find('[data-hud="health"]'),
      ammo: find('[data-hud="ammo"]'),
      reserve: find('[data-hud="reserve"]'),
      wave: find('[data-hud="wave"]'),
      scrap: find('[data-hud="scrap"]'),
      zombies: find('[data-hud="zombies"]'),
      prompt: find('[data-hud="prompt"]'),
      upgrades: find('[data-hud="upgrades"]'),
      status: find('[data-hud="status"]'),
      start: find('[data-action="start"]'),
      restart: find('[data-action="restart"]'),
      overlay: find('[data-hud="overlay"]'),
      miniMap: find(".mini-map")
    };
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("contextmenu", (event) => event.preventDefault());
    document.addEventListener("keydown", (event) => {
      this.keys.add(event.code);
      if (event.code === "KeyR") {
        this.aimHeld = false;
        this.loadout = startReload(this.loadout, performance.now() / 1000);
      }
      if (event.code === "KeyE") {
        this.handleInteract();
      }
      if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(event.code)) {
        const index = Number(event.code.replace("Digit", "")) - 1;
        const weaponId = this.loadout.inventory[index];
        if (weaponId) {
          this.equipWeapon(weaponId);
        }
      }
      if (event.code === "Escape" && this.state === "playing") {
        document.exitPointerLock();
      }
    });
    document.addEventListener("keyup", (event) => this.keys.delete(event.code));
    document.addEventListener("mousemove", (event) => this.handleMouseMove(event));
    this.canvas.addEventListener("mousedown", (event) => {
      if (event.button === 2) {
        this.aimHeld = true;
        return;
      }
      if (event.button === 0) {
        this.shoot(performance.now() / 1000);
      }
    });
    document.addEventListener("mouseup", (event) => {
      if (event.button === 2) {
        this.aimHeld = false;
      }
    });
    this.hud.start.addEventListener("click", () => {
      this.start();
      this.canvas.requestPointerLock?.();
    });
    this.hud.restart.addEventListener("click", () => this.restart());
    document.addEventListener("pointerlockchange", () => {
      document.body.classList.toggle("is-locked", document.pointerLockElement === this.canvas);
    });
  }

  private start(): void {
    this.state = "playing";
    this.hud.overlay.classList.add("hidden");
    if (!this.audio) {
      this.audio = new AudioContext();
    }
  }

  private restart(): void {
    this.player.position.copy(START_POSITION);
    this.player.health = 100;
    this.player.scrap = 70;
    this.player.kills = 0;
    this.player.height = 0;
    this.player.heightTarget = 0;
    this.player.activeFixtureId = null;
    this.player.yaw = -2.45;
    this.player.pitch = -0.08;
    this.loadout = createInitialLoadout();
    this.rebuildViewWeapon();
    this.wave = 1;
    this.spawnQueue = [];
    this.zombies.forEach((zombie) => this.scene.remove(zombie.mesh));
    this.pickups.forEach((pickup) => this.scene.remove(pickup.mesh));
    this.weaponDrops.forEach((drop) => this.scene.remove(drop.mesh));
    this.tracers.forEach((tracer) => this.scene.remove(tracer.mesh));
    this.shells.forEach((shell) => this.scene.remove(shell.mesh));
    this.smokePuffs.forEach((puff) => this.scene.remove(puff.mesh));
    this.zombies = [];
    this.pickups = [];
    this.weaponDrops = [];
    this.tracers = [];
    this.shells = [];
    this.smokePuffs = [];
    this.recoil = 0;
    this.recoilYaw = 0;
    this.shotBloom = 0;
    this.aimHeld = false;
    this.scopeAmount = 0;
    this.lastHitZone = null;
    this.root.classList.remove("is-scoped");
    this.searchedAmenityIds.clear();
    this.hud.restart.hidden = true;
    this.state = "playing";
    this.spawnInitialWeapons();
    this.startWave(1);
    this.updateHud();
  }

  private tick(time: number): void {
    const dt = Math.min(0.05, (time - this.lastFrameTime) / 1000);
    this.lastFrameTime = time;
    this.frame += 1;

    if (this.state === "playing") {
      this.update(dt, time / 1000);
    } else if (this.smokeMode) {
      this.camera.position.set(42, 42, 82);
      this.camera.lookAt(0, 0, 0);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((next) => this.tick(next));
  }

  private update(dt: number, now: number): void {
    this.loadout = finishReloadIfReady(this.loadout, now);
    this.updateMovement(dt);
    this.updateVerticalState(dt);
    this.updateSpawns(dt);
    this.updateZombies(dt, now);
    this.updatePickups(dt);
    this.updateWeaponDrops(dt);
    this.updateTracers(dt);
    this.updateShells(dt);
    this.updateSmokePuffs(dt);
    this.updateNearestStation();
    this.updateNearestAmenity();
    this.updateNearestFixture();
    this.updateScope(dt, now);
    this.updateWeaponModel(dt);
    this.updateCamera();
    this.updateHud();
    this.updateMiniMap();

    if (this.zombies.length === 0 && this.spawnQueue.length === 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= -2.4) {
        this.startWave(this.wave + 1);
      }
    }

    if (this.player.health <= 0) {
      this.gameOver();
    }
  }

  private updateMovement(dt: number): void {
    const input = new THREE.Vector3();
    if (this.keys.has("KeyW")) input.z -= 1;
    if (this.keys.has("KeyS")) input.z += 1;
    if (this.keys.has("KeyA")) input.x -= 1;
    if (this.keys.has("KeyD")) input.x += 1;

    if (input.lengthSq() > 0) {
      input.normalize();
      const sin = Math.sin(this.player.yaw);
      const cos = Math.cos(this.player.yaw);
      const forward = new THREE.Vector3(sin, 0, cos);
      const right = new THREE.Vector3(cos, 0, -sin);
      const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 33 : 20;
      this.player.velocity.copy(forward.multiplyScalar(input.z).add(right.multiplyScalar(input.x))).multiplyScalar(speed);
    } else {
      this.player.velocity.multiplyScalar(0.78);
      if (this.player.velocity.lengthSq() < 0.01) {
        this.player.velocity.set(0, 0, 0);
      }
    }

    const candidate = this.player.position.clone().addScaledVector(this.player.velocity, dt);
    let next = clampToPolygon({ x: candidate.x, z: candidate.z }, this.level.boundary, 3);
    for (const obstacle of this.level.obstacles) {
      if (this.shouldBypassObstacle(obstacle.id, next)) {
        continue;
      }
      next = this.resolveObstacle(next, PLAYER_RADIUS, obstacle);
    }
    this.player.position.set(next.x, 0, next.z);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (document.pointerLockElement !== this.canvas && !this.smokeMode) {
      return;
    }
    this.player.yaw -= event.movementX * 0.0022;
    this.player.pitch -= event.movementY * 0.002;
    this.player.pitch = THREE.MathUtils.clamp(this.player.pitch, -1.18, 1.1);
  }

  private updateCamera(): void {
    if (this.smokeMode && document.pointerLockElement !== this.canvas) {
      const t = this.frame * 0.005;
      this.player.yaw = -2.2 + Math.sin(t) * 0.18;
      this.player.pitch = -0.1 + Math.sin(t * 0.7) * 0.04;
    }
    this.camera.position.set(this.player.position.x, PLAYER_HEIGHT + this.player.height, this.player.position.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.player.yaw + this.recoilYaw * 0.006;
    this.camera.rotation.x = this.player.pitch - this.recoil * 0.012;
  }

  private startWave(wave: number): void {
    this.wave = wave;
    const config = getWaveConfig(wave);
    this.spawnQueue = Array.from({ length: config.total }, () => createZombieSpawn(config, this.level.spawnPoints, this.rng));
    this.spawnTimer = 0.4;
  }

  private updateSpawns(dt: number): void {
    if (this.spawnQueue.length === 0) {
      return;
    }
    const config = getWaveConfig(this.wave);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const spawn = this.spawnQueue.shift();
      if (spawn) {
        this.addZombie(spawn);
      }
      this.spawnTimer = config.spawnInterval;
    }
  }

  private forceSpawnZombie(): void {
    this.addZombie(createZombieSpawn(getWaveConfig(this.wave), this.level.spawnPoints, this.rng));
  }

  private addZombie(spawn: ZombieSpawn): void {
    const mesh = this.createZombieMesh(spawn.type);
    mesh.position.set(spawn.position.x, 0, spawn.position.z);
    this.scene.add(mesh);
    const maxHealth = spawn.health;
    this.zombies.push({
      id: this.nextZombieId++,
      type: spawn.type,
      mesh,
      position: mesh.position,
      health: maxHealth,
      maxHealth,
      speed: spawn.speed,
      radius: spawn.type === "bloater" ? 2.2 : 1.35,
      reward: spawn.reward,
      attackCooldown: 0,
      walkOffset: this.rng.range(0, Math.PI * 2)
    });
  }

  private updateZombies(dt: number, now: number): void {
    for (const zombie of this.zombies) {
      const toPlayer = this.scratchVector
        .set(this.player.position.x - zombie.position.x, 0, this.player.position.z - zombie.position.z);
      const distanceToPlayer = toPlayer.length();
      if (distanceToPlayer > 0.001) {
        toPlayer.normalize();
      }
      const speed = zombie.speed * (distanceToPlayer < 18 ? 1.18 : 1);
      const candidate = zombie.position.clone().addScaledVector(toPlayer, speed * dt);
      let next = clampToPolygon({ x: candidate.x, z: candidate.z }, this.level.boundary, 2.5);
      for (const obstacle of this.level.obstacles) {
        next = this.resolveObstacle(next, zombie.radius, obstacle);
      }
      zombie.position.set(next.x, 0, next.z);
      zombie.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      zombie.mesh.position.y = Math.sin(now * 7 + zombie.walkOffset) * 0.07;
      this.animateZombie(zombie, now, distanceToPlayer);
      zombie.attackCooldown -= dt;
      if (this.player.height < 1.4 && distanceToPlayer < zombie.radius + PLAYER_RADIUS + 0.8 && zombie.attackCooldown <= 0) {
        this.player.health -= zombie.type === "bloater" ? 18 : 10;
        zombie.attackCooldown = zombie.type === "sprinter" ? 0.65 : 0.95;
        this.lastDamageAt = now;
        document.body.classList.add("hit");
        window.setTimeout(() => document.body.classList.remove("hit"), 120);
        this.playTone(90, 0.04, "sawtooth", 0.04);
      }
    }
  }

  private shoot(now: number, force = false): void {
    if (this.state !== "playing") {
      return;
    }
    const stats = getWeaponStats(this.loadout);
    if (!force && now - this.lastShotAt < stats.fireDelay) {
      return;
    }
    if (this.loadout.reloadingUntil > now) {
      return;
    }
    if (this.loadout.ammoInMagazine <= 0) {
      this.loadout = startReload(this.loadout, now);
      this.playTone(160, 0.03, "square", 0.03);
      return;
    }

    this.loadout = consumeRound(this.loadout);
    this.lastShotAt = now;
    const aimRecoil = THREE.MathUtils.lerp(1, stats.aimRecoilMultiplier, this.scopeAmount);
    this.recoil = Math.min(1.75, this.recoil + stats.recoilKick * aimRecoil);
    this.recoilYaw += this.rng.range(-stats.recoilDrift, stats.recoilDrift) * aimRecoil;
    this.shotBloom = Math.min(stats.maxBloom, this.shotBloom + stats.bloomPerShot);
    this.muzzleTimer = 0.055;
    if (this.muzzleFlash) this.muzzleFlash.visible = true;
    if (this.muzzleLight) this.muzzleLight.visible = true;
    this.spawnShellCasing();
    this.spawnMuzzleSmoke();
    this.playTone(this.loadout.weaponId === "shotgun" ? 170 : 260 + this.rng.range(-20, 20), 0.055, "square", 0.05);

    const movementSpread = Math.min(1, this.player.velocity.length() / 22) * stats.movingSpread;
    const totalSpread = (stats.spread + movementSpread + this.shotBloom) * THREE.MathUtils.lerp(1, stats.aimSpreadMultiplier, this.scopeAmount);
    let registeredHit = false;
    for (let pellet = 0; pellet < stats.pellets; pellet += 1) {
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      direction.x += this.rng.range(-totalSpread, totalSpread);
      direction.y += this.rng.range(-totalSpread, totalSpread) * 0.55;
      direction.z += this.rng.range(-totalSpread, totalSpread);
      direction.normalize();
      const hit = this.findZombieHit(this.camera.position, direction, stats.range);
      const endPoint = hit?.point ?? this.camera.position.clone().addScaledVector(direction, stats.range);
      if (hit) {
        hit.zombie.health -= damageAtDistance(stats, hit.distance, hit.zone);
        this.lastHitZone = hit.zone;
        registeredHit = true;
        this.createHitSpark(endPoint);
        if (hit.zone === "head") {
          this.flashStatus("Headshot");
        }
        if (hit.zombie.health <= 0) {
          this.killZombie(hit.zombie);
        }
      }
      this.addTracer(this.camera.position, endPoint);
    }
    if (!registeredHit) {
      this.lastHitZone = null;
    }
  }

  private findZombieHit(origin: THREE.Vector3, direction: THREE.Vector3, range: number): { zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone } | null {
    let closest: { zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone } | null = null;
    for (const zombie of this.zombies) {
      const bodyScale = zombie.type === "bloater" ? 1.45 : zombie.type === "sprinter" ? 0.84 : 1;
      const zones: Array<{ zone: HitZone; center: THREE.Vector3; radius: number }> = [
        { zone: "head", center: zombie.position.clone().add(new THREE.Vector3(0.06 * bodyScale, 2.88 * bodyScale, -0.02)), radius: 0.42 * bodyScale },
        { zone: "body", center: zombie.position.clone().add(new THREE.Vector3(0, 1.58 * bodyScale, 0)), radius: 0.72 * bodyScale },
        { zone: "legs", center: zombie.position.clone().add(new THREE.Vector3(0, 0.62 * bodyScale, 0)), radius: 0.44 * bodyScale }
      ];
      for (const zone of zones) {
        const hit = this.raySphereHit(origin, direction, zone.center, zone.radius, range);
        if (hit && (!closest || hit.distance < closest.distance)) {
          closest = { zombie, point: hit.point, distance: hit.distance, zone: zone.zone };
        }
      }
    }
    return closest;
  }

  private raySphereHit(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    center: THREE.Vector3,
    radius: number,
    range: number
  ): { point: THREE.Vector3; distance: number } | null {
    const toCenter = center.clone().sub(origin);
    const projection = toCenter.dot(direction);
    if (projection < 0 || projection > range) {
      return null;
    }
    const closestPoint = origin.clone().addScaledVector(direction, projection);
    const missDistance = closestPoint.distanceTo(center);
    if (missDistance > radius) {
      return null;
    }
    const offset = Math.sqrt(Math.max(0, radius * radius - missDistance * missDistance));
    const distanceAlongRay = Math.max(0, projection - offset);
    return {
      point: origin.clone().addScaledVector(direction, distanceAlongRay),
      distance: distanceAlongRay
    };
  }

  private killZombie(zombie: Zombie): void {
    this.scene.remove(zombie.mesh);
    this.zombies = this.zombies.filter((candidate) => candidate !== zombie);
    this.player.kills += 1;
    this.player.scrap += zombie.reward;
    if (this.rng.next() < 0.48) {
      const type = this.rng.next() < 0.5 ? "ammo" : this.rng.next() < 0.7 ? "health" : "scrap";
      this.addPickup(type, zombie.position, type === "ammo" ? 18 : type === "health" ? 18 : 25);
    }
    if (zombie.type === "bloater" || this.rng.next() < 0.38) {
      this.addWeaponDrop(this.chooseDroppedWeapon(), zombie.position, "zombie", 30);
    }
  }

  private addPickup(type: Pickup["type"], position: THREE.Vector3, amount: number): void {
    const mesh = this.createPickupMesh(type);
    mesh.position.copy(position).setY(0.75);
    this.scene.add(mesh);
    this.pickups.push({
      id: this.nextPickupId++,
      type,
      amount,
      mesh,
      position: mesh.position,
      ttl: 22
    });
  }

  private updatePickups(dt: number): void {
    for (const pickup of [...this.pickups]) {
      pickup.ttl -= dt;
      pickup.mesh.rotation.y += dt * 1.6;
      pickup.mesh.position.y = 0.75 + Math.sin(this.frame * 0.06 + pickup.id) * 0.12;
      if (pickup.position.distanceTo(this.player.position) < 4.2) {
        if (pickup.type === "ammo") {
          this.loadout = addAmmo(this.loadout, pickup.amount);
        } else if (pickup.type === "health") {
          this.player.health = Math.min(100, this.player.health + pickup.amount);
        } else {
          this.player.scrap += pickup.amount;
        }
        this.scene.remove(pickup.mesh);
        this.pickups = this.pickups.filter((candidate) => candidate !== pickup);
        this.playTone(520, 0.05, "sine", 0.04);
      } else if (pickup.ttl <= 0) {
        this.scene.remove(pickup.mesh);
        this.pickups = this.pickups.filter((candidate) => candidate !== pickup);
      }
    }
  }

  private spawnInitialWeapons(): void {
    for (const spawn of this.level.weaponSpawns) {
      this.addWeaponDrop(spawn.weaponId, new THREE.Vector3(spawn.position.x, 0, spawn.position.z), "cache", Number.POSITIVE_INFINITY, spawn);
    }
  }

  private chooseDroppedWeapon(): WeaponId {
    const roll = this.rng.next();
    if (this.wave >= 4 && roll > 0.72) return "rifle";
    if (roll > 0.58) return "shotgun";
    if (roll > 0.32) return "smg";
    return "carbine";
  }

  private addWeaponDrop(
    weaponId: WeaponId,
    position: THREE.Vector3,
    source: WeaponDrop["source"],
    ttl = 24,
    spawn?: WeaponSpawn
  ): void {
    const mesh = this.createWeaponDropMesh(weaponId);
    mesh.position.copy(position).setY(source === "cache" ? 0.8 : 0.65);
    this.scene.add(mesh);
    this.weaponDrops.push({
      id: this.nextPickupId++,
      weaponId,
      label: spawn?.label ?? WEAPON_DEFINITIONS[weaponId].name,
      mesh,
      position: mesh.position,
      ttl,
      source
    });
  }

  private updateWeaponDrops(dt: number): void {
    let nearest: WeaponDrop | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const drop of [...this.weaponDrops]) {
      if (Number.isFinite(drop.ttl)) {
        drop.ttl -= dt;
      }
      drop.mesh.rotation.y += dt * 1.05;
      drop.mesh.position.y = (drop.source === "cache" ? 0.82 : 0.62) + Math.sin(this.frame * 0.045 + drop.id) * 0.08;

      const dropDistance = drop.position.distanceTo(this.player.position);
      if (dropDistance < nearestDistance && dropDistance < 8.2) {
        nearest = drop;
        nearestDistance = dropDistance;
      }

      if (drop.ttl <= 0) {
        this.scene.remove(drop.mesh);
        this.weaponDrops = this.weaponDrops.filter((candidate) => candidate !== drop);
      }
    }

    this.nearestWeaponDrop = nearest;
  }

  private pickupWeapon(drop: WeaponDrop): boolean {
    this.loadout = addWeapon(this.loadout, drop.weaponId);
    this.aimHeld = false;
    this.scene.remove(drop.mesh);
    this.weaponDrops = this.weaponDrops.filter((candidate) => candidate !== drop);
    this.nearestWeaponDrop = null;
    this.rebuildViewWeapon();
    this.flashStatus(`${WEAPON_DEFINITIONS[drop.weaponId].name} equipped`);
    this.playTone(640, 0.08, "triangle", 0.05);
    return true;
  }

  private handleInteract(): boolean {
    if (this.nearestWeaponDrop) {
      return this.pickupWeapon(this.nearestWeaponDrop);
    }
    if (this.nearestFixture) {
      return this.toggleFixture(this.nearestFixture);
    }
    if (this.nearestAmenity) {
      return this.useAmenity(this.nearestAmenity);
    }
    return this.buyUpgrade();
  }

  private updateNearestAmenity(): void {
    let nearest: AmenityPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    for (const amenity of this.level.amenities) {
      const amenityDistance = distance(playerPoint, amenity.position);
      const reach = amenity.kind === "bench" || amenity.kind === "picnic_table" ? 4.8 : 5.6;
      if (amenityDistance < nearestDistance && amenityDistance < reach) {
        nearest = amenity;
        nearestDistance = amenityDistance;
      }
    }
    this.nearestAmenity = nearest;
  }

  private useAmenity(amenity: AmenityPoint): boolean {
    const alreadySearched = this.searchedAmenityIds.has(amenity.id);
    if (amenity.kind === "drinking_water") {
      this.player.health = Math.min(100, this.player.health + 24);
      this.flashStatus("Used drinking fountain");
      this.playTone(580, 0.08, "sine", 0.045);
      return true;
    }
    if (amenity.kind === "bench") {
      this.player.health = Math.min(100, this.player.health + 10);
      this.player.velocity.multiplyScalar(0.25);
      this.flashStatus("Caught breath at bench");
      this.playTone(360, 0.06, "sine", 0.035);
      return true;
    }
    if (amenity.kind === "picnic_table") {
      this.player.health = Math.min(100, this.player.health + 12);
      this.player.velocity.multiplyScalar(0.2);
      this.flashStatus("Rested at picnic table");
      this.playTone(340, 0.06, "sine", 0.035);
      return true;
    }
    if (amenity.kind === "table_tennis") {
      this.shotBloom *= 0.35;
      this.player.velocity.multiplyScalar(0.15);
      this.flashStatus("Settled aim at table tennis");
      this.playTone(460, 0.05, "triangle", 0.035);
      return true;
    }
    if (alreadySearched) {
      this.flashStatus(`${amenity.label} already searched`);
      this.playTone(150, 0.03, "square", 0.025);
      return false;
    }

    this.searchedAmenityIds.add(amenity.id);
    if (amenity.kind === "waste_basket") {
      this.player.scrap += 9 + this.rng.int(0, 8);
      this.flashStatus("Found scrap in bin");
    } else if (amenity.kind === "bicycle_parking") {
      this.player.scrap += 18;
      this.loadout = addAmmo(this.loadout, 8);
      this.flashStatus("Stripped bike rack supplies");
    } else if (amenity.kind === "bbq") {
      this.player.scrap += 14;
      this.loadout = addAmmo(this.loadout, 12);
      this.flashStatus("Searched BBQ supplies");
    } else if (amenity.kind === "toilets") {
      this.player.health = Math.min(100, this.player.health + 14);
      this.flashStatus("Sheltered at toilets");
    }
    this.playTone(520, 0.07, "triangle", 0.045);
    return true;
  }

  private amenityPrompt(amenity: AmenityPoint): string {
    if (amenity.kind === "drinking_water") return "E: drink";
    if (amenity.kind === "bench") return "E: rest";
    if (amenity.kind === "picnic_table") return "E: rest";
    if (amenity.kind === "table_tennis") return "E: play";
    if (amenity.kind === "waste_basket") return this.searchedAmenityIds.has(amenity.id) ? "Bin searched" : "E: search bin";
    if (amenity.kind === "bicycle_parking") return this.searchedAmenityIds.has(amenity.id) ? "Bike racks searched" : "E: search bike racks";
    if (amenity.kind === "bbq") return this.searchedAmenityIds.has(amenity.id) ? "BBQ searched" : "E: search BBQ";
    return this.searchedAmenityIds.has(amenity.id) ? "Shelter used" : "E: shelter";
  }

  private updateNearestFixture(): void {
    let nearest: InteractableFixture | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    for (const fixture of this.level.interactables.filter((candidate) => candidate.mode === "toggle")) {
      const fixtureDistance = distance(playerPoint, fixture.position);
      if (fixtureDistance < nearestDistance && fixtureDistance < fixture.radius + 3) {
        nearest = fixture;
        nearestDistance = fixtureDistance;
      }
    }
    this.nearestFixture = nearest;
  }

  private toggleFixture(fixture: InteractableFixture): boolean {
    if (this.player.activeFixtureId === fixture.id) {
      this.player.activeFixtureId = null;
      this.player.heightTarget = 0;
      this.flashStatus(`Dropped from ${fixture.label}`);
    } else {
      this.player.activeFixtureId = fixture.id;
      this.player.heightTarget = fixture.height;
      this.flashStatus(`Climbed ${fixture.label}`);
    }
    this.playTone(420, 0.07, "sine", 0.04);
    return true;
  }

  private updateVerticalState(dt: number): void {
    let target = 0;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    const active = this.level.interactables.find((fixture) => fixture.id === this.player.activeFixtureId);

    if (active) {
      const activeDistance = distance(playerPoint, active.position);
      if (activeDistance <= active.radius + 5) {
        target = Math.max(target, active.height);
      } else {
        this.player.activeFixtureId = null;
      }
    }

    for (const fixture of this.level.interactables.filter((candidate) => candidate.mode === "auto")) {
      if (distance(playerPoint, fixture.position) <= fixture.radius) {
        target = Math.max(target, fixture.height);
      }
    }

    this.player.heightTarget = target;
    const t = 1 - Math.pow(0.001, dt);
    this.player.height += (this.player.heightTarget - this.player.height) * t;
    if (Math.abs(this.player.height) < 0.01) {
      this.player.height = 0;
    }
  }

  private resolveObstacle(point: Vec2, radius: number, obstacle: CollisionObstacle): Vec2 {
    if (obstacle.shape === "box") {
      const dx = point.x - obstacle.center.x;
      const dz = point.z - obstacle.center.z;
      const cos = Math.cos(obstacle.angle);
      const sin = Math.sin(obstacle.angle);
      let localX = dx * cos + dz * sin;
      let localZ = -dx * sin + dz * cos;
      const expandedX = obstacle.halfX + radius;
      const expandedZ = obstacle.halfZ + radius;

      if (Math.abs(localX) >= expandedX || Math.abs(localZ) >= expandedZ) {
        return point;
      }

      const pushX = expandedX - Math.abs(localX);
      const pushZ = expandedZ - Math.abs(localZ);
      if (pushX < pushZ) {
        localX = (localX < 0 ? -1 : 1) * expandedX;
      } else {
        localZ = (localZ < 0 ? -1 : 1) * expandedZ;
      }

      return {
        x: obstacle.center.x + localX * cos - localZ * sin,
        z: obstacle.center.z + localX * sin + localZ * cos
      };
    }

    if (obstacle.shape === "polygon") {
      let closest = obstacle.polygon[0];
      let closestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < obstacle.polygon.length; i += 1) {
        const candidate = nearestPointOnSegment(point, obstacle.polygon[i], obstacle.polygon[(i + 1) % obstacle.polygon.length]);
        const candidateDistance = distance(point, candidate);
        if (candidateDistance < closestDistance) {
          closest = candidate;
          closestDistance = candidateDistance;
        }
      }

      if (pointInPolygon(point, obstacle.polygon)) {
        const dx = closest.x - obstacle.center.x;
        const dz = closest.z - obstacle.center.z;
        const length = Math.hypot(dx, dz) || 1;
        return {
          x: closest.x + (dx / length) * radius,
          z: closest.z + (dz / length) * radius
        };
      }

      if (closestDistance < radius) {
        const dx = point.x - closest.x;
        const dz = point.z - closest.z;
        const length = Math.hypot(dx, dz) || 1;
        return {
          x: closest.x + (dx / length) * radius,
          z: closest.z + (dz / length) * radius
        };
      }
      return point;
    }

    const dist = distance(point, obstacle.center);
    const minDistance = obstacle.radius + radius;
    if (dist >= minDistance) {
      return point;
    }
    const dx = point.x - obstacle.center.x;
    const dz = point.z - obstacle.center.z;
    const length = Math.hypot(dx, dz) || 1;
    return {
      x: obstacle.center.x + (dx / length) * minDistance,
      z: obstacle.center.z + (dz / length) * minDistance
    };
  }

  private shouldBypassObstacle(obstacleId: string, point: Vec2): boolean {
    const active = this.level.interactables.find((fixture) => fixture.id === this.player.activeFixtureId);
    if (active && distance(point, active.position) <= active.radius + 5) {
      if (active.kind === "rotunda" && obstacleId === "rotunda-core") return true;
      if (active.kind === "grandstand" && obstacleId === "grandstand") return true;
      if (active.kind === "playground" && (obstacleId === "north-playground" || obstacleId === "south-playground")) return true;
      if (active.kind === "toilets" && (obstacleId === "north-toilets" || obstacleId === "south-toilets")) return true;
    }

    const autoFixture = this.level.interactables.find(
      (fixture) => fixture.mode === "auto" && distance(point, fixture.position) <= fixture.radius
    );
    return autoFixture?.kind === "skate" && obstacleId === "skate";
  }

  private equipWeapon(weaponId: WeaponId): boolean {
    const previous = this.loadout.weaponId;
    this.loadout = switchWeapon(this.loadout, weaponId);
    if (this.loadout.weaponId === previous) {
      return false;
    }
    this.aimHeld = false;
    this.rebuildViewWeapon();
    this.flashStatus(`${WEAPON_DEFINITIONS[weaponId].name} ready`);
    return true;
  }

  private testPickupWeapon(weaponId?: WeaponId): boolean {
    const drop = weaponId
      ? this.weaponDrops.find((candidate) => candidate.weaponId === weaponId) ?? null
      : this.weaponDrops[0] ?? null;
    return drop ? this.pickupWeapon(drop) : false;
  }

  private testScope(weaponId?: WeaponId): boolean {
    if (weaponId) {
      if (!this.loadout.inventory.includes(weaponId) && !this.testPickupWeapon(weaponId)) {
        return false;
      }
      this.equipWeapon(weaponId);
    }
    const stats = getWeaponStats(this.loadout);
    if (stats.scopeZoom <= 1.05) {
      return false;
    }
    this.aimHeld = true;
    this.scopeAmount = 1;
    this.updateScope(0.1, performance.now() / 1000);
    return true;
  }

  private testInteract(fixtureId?: string): boolean {
    const fixture = fixtureId
      ? this.level.interactables.find((candidate) => candidate.id === fixtureId) ?? null
      : this.level.interactables[0] ?? null;
    if (!fixture) {
      return false;
    }
    this.player.position.set(fixture.position.x, 0, fixture.position.z);
    return this.toggleFixture(fixture);
  }

  private testUseAmenity(kind?: AmenityPoint["kind"]): boolean {
    const amenity = kind
      ? this.level.amenities.find((candidate) => candidate.kind === kind) ?? null
      : this.level.amenities[0] ?? null;
    if (!amenity) {
      return false;
    }
    this.player.position.set(amenity.position.x, 0, amenity.position.z);
    return this.useAmenity(amenity);
  }

  private testMiniMapVisibility(): { front: boolean; behind: boolean; occluded: boolean } {
    const previousPosition = this.player.position.clone();
    const previousYaw = this.player.yaw;
    const previousPitch = this.player.pitch;
    const previousHeight = this.player.height;
    const obstacle = this.level.obstacles.find((candidate) => candidate.id === "grandstand");

    this.player.position.set(0, 0, 0);
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.player.height = 0;

    const result = {
      front: this.isPointVisibleToPlayer({ x: 0, z: -24 }, 1),
      behind: this.isPointVisibleToPlayer({ x: 0, z: 24 }, 1),
      occluded: obstacle ? this.isLineOfSightBlocked({ x: obstacle.center.x - 16, z: obstacle.center.z }, { x: obstacle.center.x + 16, z: obstacle.center.z }, 1) : false
    };

    this.player.position.copy(previousPosition);
    this.player.yaw = previousYaw;
    this.player.pitch = previousPitch;
    this.player.height = previousHeight;
    return result;
  }

  private updateNearestStation(): void {
    let nearest: UpgradeStation | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const station of this.level.upgradeStations) {
      const stationDistance = distance({ x: this.player.position.x, z: this.player.position.z }, station.position);
      if (stationDistance < nearestDistance && stationDistance < 10) {
        nearest = station;
        nearestDistance = stationDistance;
      }
    }
    this.nearestStation = nearest;
  }

  private buyUpgrade(stationId?: string): boolean {
    const station = stationId
      ? this.level.upgradeStations.find((candidate) => candidate.id === stationId) ?? null
      : this.nearestStation;
    if (!station) {
      return false;
    }
    const upgradeId = station.upgradeId;
    const currentLevel = this.loadout.upgrades[upgradeId];
    if (!canUpgrade(this.loadout, upgradeId)) {
      this.flashStatus(`${UPGRADE_DEFINITIONS[upgradeId].label} is maxed`);
      return false;
    }
    const cost = upgradeCost(upgradeId, currentLevel);
    if (this.player.scrap < cost) {
      this.flashStatus(`${cost} scrap needed`);
      return false;
    }
    this.player.scrap -= cost;
    this.loadout = applyUpgrade(this.loadout, upgradeId);
    this.playTone(720, 0.08, "triangle", 0.055);
    this.flashStatus(`${UPGRADE_DEFINITIONS[upgradeId].label} upgraded`);
    return true;
  }

  private gameOver(): void {
    this.state = "gameover";
    this.hud.restart.hidden = false;
    this.hud.status.textContent = `Overrun at wave ${this.wave}`;
    document.exitPointerLock?.();
  }

  private snapshot(): Snapshot {
    return {
      ready: true,
      state: this.state,
      frame: this.frame,
      wave: this.wave,
      zombies: this.zombies.length,
      ammo: this.loadout.ammoInMagazine,
      health: Math.max(0, Math.round(this.player.health)),
      scrap: this.player.scrap,
      weapon: this.loadout.weaponId,
      weaponDrops: this.weaponDrops.length,
      elevation: Number(this.player.height.toFixed(2)),
      renderedTrees: this.renderedTreeCount,
      lastHitZone: this.lastHitZone,
      shotBloom: Number(this.shotBloom.toFixed(4)),
      reloadProgress: Number(this.reloadProgress(performance.now() / 1000).toFixed(2)),
      scope: Number(this.scopeAmount.toFixed(2)),
      fov: Number(this.camera.fov.toFixed(1)),
      miniMapVisibleZombies: this.miniMapVisibleZombieCount
    };
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.root;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private reloadProgress(now: number): number {
    if (this.loadout.reloadingUntil <= now || this.loadout.reloadStartedAt <= 0) {
      return 0;
    }
    const span = Math.max(0.001, this.loadout.reloadingUntil - this.loadout.reloadStartedAt);
    return THREE.MathUtils.clamp((now - this.loadout.reloadStartedAt) / span, 0, 1);
  }

  private updateHud(): void {
    const stats = getWeaponStats(this.loadout);
    this.hud.health.textContent = `${Math.max(0, Math.round(this.player.health))}`;
    this.hud.ammo.textContent = `${this.loadout.ammoInMagazine}`;
    this.hud.reserve.textContent = `${this.loadout.reserveAmmo}`;
    this.hud.wave.textContent = `${this.wave}`;
    this.hud.scrap.textContent = `${this.player.scrap}`;
    this.hud.zombies.textContent = `${this.zombies.length + this.spawnQueue.length}`;
    const now = performance.now() / 1000;
    if (this.loadout.reloadingUntil > now) {
      const percent = Math.round(this.reloadProgress(now) * 100);
      this.hud.status.textContent = this.loadout.weaponId === "shotgun" ? `Loading shell ${percent}%` : `Reloading ${percent}%`;
    } else if (this.nearestWeaponDrop) {
      this.hud.prompt.textContent = `E: pick up ${WEAPON_DEFINITIONS[this.nearestWeaponDrop.weaponId].name}`;
      this.hud.status.textContent = this.nearestWeaponDrop.label;
    } else if (this.nearestFixture) {
      const active = this.player.activeFixtureId === this.nearestFixture.id;
      this.hud.prompt.textContent = active ? `E: drop from ${this.nearestFixture.label}` : this.nearestFixture.prompt;
      this.hud.status.textContent = active ? `${this.nearestFixture.label} elevated` : this.nearestFixture.label;
    } else if (this.nearestAmenity) {
      this.hud.prompt.textContent = this.amenityPrompt(this.nearestAmenity);
      this.hud.status.textContent = this.nearestAmenity.label;
    } else if (this.nearestStation) {
      const upgrade = UPGRADE_DEFINITIONS[this.nearestStation.upgradeId];
      const current = this.loadout.upgrades[this.nearestStation.upgradeId];
      const maxed = current >= upgrade.maxLevel;
      const cost = upgradeCost(this.nearestStation.upgradeId, current);
      this.hud.prompt.textContent = maxed
        ? `${this.nearestStation.label}: ${upgrade.label} maxed`
        : `E: ${upgrade.label} (${cost} scrap)`;
      this.hud.status.textContent = this.nearestStation.label;
    } else {
      this.hud.prompt.textContent = "";
      const optic = stats.scopeZoom > 1.05 ? `, ${stats.scopeZoom.toFixed(1)}x optic` : "";
      this.hud.status.textContent = `${stats.name}${optic}${this.player.height > 0.4 ? `, height ${this.player.height.toFixed(1)}m` : ""}`;
    }

    const weapons = this.loadout.inventory
      .map((weaponId, index) => `<span title="Press ${index + 1}">${index + 1}: ${WEAPON_DEFINITIONS[weaponId].name}</span>`)
      .join("");
    const upgrades = Object.values(UPGRADE_DEFINITIONS)
      .map((upgrade) => {
        const level = this.loadout.upgrades[upgrade.id];
        return `<span title="${upgrade.description}">${upgrade.label} ${level}/${upgrade.maxLevel}</span>`;
      })
      .join("");
    this.hud.upgrades.innerHTML = `${weapons}${upgrades}`;
  }

  private flashStatus(message: string): void {
    this.hud.status.textContent = message;
    this.hud.status.classList.add("flash");
    window.setTimeout(() => this.hud.status.classList.remove("flash"), 180);
  }

  private updateMiniMap(): void {
    const canvas = this.hud.miniMap;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(9, 18, 13, 0.78)";
    ctx.fillRect(0, 0, w, h);

    const all = this.level.boundary;
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const minZ = Math.min(...all.map((p) => p.z));
    const maxZ = Math.max(...all.map((p) => p.z));
    const mapPoint = (point: Vec2) => ({
      x: ((point.x - minX) / (maxX - minX)) * (w - 24) + 12,
      y: ((point.z - minZ) / (maxZ - minZ)) * (h - 24) + 12
    });

    ctx.strokeStyle = "rgba(197, 214, 168, 0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    this.level.boundary.forEach((point, index) => {
      const mapped = mapPoint(point);
      if (index === 0) ctx.moveTo(mapped.x, mapped.y);
      else ctx.lineTo(mapped.x, mapped.y);
    });
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = "rgba(213, 178, 99, 0.72)";
    for (const path of this.level.paths) {
      ctx.beginPath();
      path.points.forEach((point, index) => {
        const mapped = mapPoint(point);
        if (index === 0) ctx.moveTo(mapped.x, mapped.y);
        else ctx.lineTo(mapped.x, mapped.y);
      });
      ctx.stroke();
    }

    const player = mapPoint({ x: this.player.position.x, z: this.player.position.z });
    this.drawMiniMapFacingIndicator(ctx, player);

    const visibleZombies = this.zombies.filter((zombie) => this.isPointVisibleToPlayer({ x: zombie.position.x, z: zombie.position.z }, zombie.radius));
    this.miniMapVisibleZombieCount = visibleZombies.length;
    ctx.fillStyle = "rgba(207, 69, 55, 0.95)";
    for (const zombie of visibleZombies) {
      const mapped = mapPoint({ x: zombie.position.x, z: zombie.position.z });
      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(235, 192, 92, 0.95)";
    for (const station of this.level.upgradeStations) {
      const mapped = mapPoint(station.position);
      ctx.fillRect(mapped.x - 2, mapped.y - 2, 4, 4);
    }

    for (const amenity of this.level.amenities) {
      const mapped = mapPoint(amenity.position);
      ctx.fillStyle =
        amenity.kind === "drinking_water" || amenity.kind === "toilets"
          ? "rgba(97, 168, 211, 0.78)"
          : amenity.kind === "bench"
            ? "rgba(158, 191, 134, 0.66)"
            : "rgba(208, 163, 67, 0.72)";
      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(97, 168, 211, 0.95)";
    for (const drop of this.weaponDrops) {
      const mapped = mapPoint({ x: drop.position.x, z: drop.position.z });
      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(189, 232, 180, 1)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawMiniMapFacingIndicator(ctx: CanvasRenderingContext2D, player: { x: number; y: number }): void {
    const heading = this.playerForward2D();
    const screenHeading = new THREE.Vector2(heading.x, heading.z);
    if (screenHeading.lengthSq() < 0.001) return;
    screenHeading.normalize();
    const angle = Math.atan2(screenHeading.y, screenHeading.x);
    const coneRadius = 30;
    const halfAngle = 0.48;

    ctx.fillStyle = "rgba(189, 232, 180, 0.16)";
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.arc(player.x, player.y, coneRadius, angle - halfAngle, angle + halfAngle);
    ctx.closePath();
    ctx.fill();

    const tip = { x: player.x + screenHeading.x * 12, y: player.y + screenHeading.y * 12 };
    const side = new THREE.Vector2(-screenHeading.y, screenHeading.x);
    ctx.fillStyle = "rgba(189, 232, 180, 1)";
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(player.x - screenHeading.x * 4 + side.x * 5, player.y - screenHeading.y * 4 + side.y * 5);
    ctx.lineTo(player.x - screenHeading.x * 4 - side.x * 5, player.y - screenHeading.y * 4 - side.y * 5);
    ctx.closePath();
    ctx.fill();
  }

  private playerForward2D(): Vec2 {
    return {
      x: -Math.sin(this.player.yaw),
      z: -Math.cos(this.player.yaw)
    };
  }

  private isPointVisibleToPlayer(point: Vec2, padding = 0): boolean {
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    const dx = point.x - playerPoint.x;
    const dz = point.z - playerPoint.z;
    const range = Math.hypot(dx, dz);
    if (range < 0.001) return true;

    const forward = this.playerForward2D();
    const dot = (dx / range) * forward.x + (dz / range) * forward.z;
    if (dot <= 0) return false;

    const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect);
    const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    if (angle > horizontalFov / 2 + 0.08) return false;

    return !this.isLineOfSightBlocked(playerPoint, point, padding);
  }

  private isLineOfSightBlocked(a: Vec2, b: Vec2, padding = 0): boolean {
    if (this.player.height > 2.6) {
      return false;
    }

    return this.level.obstacles.some((obstacle) => {
      if (this.shouldBypassObstacle(obstacle.id, a)) return false;
      if (obstacle.shape === "box") {
        return this.lineIntersectsBox(a, b, obstacle.center, obstacle.halfX + padding, obstacle.halfZ + padding, obstacle.angle);
      }
      if (obstacle.shape === "polygon") {
        return this.lineIntersectsPolygon(a, b, obstacle.polygon, padding);
      }
      return distanceToSegment(obstacle.center, a, b) <= obstacle.radius + padding;
    });
  }

  private lineIntersectsBox(a: Vec2, b: Vec2, center: Vec2, halfX: number, halfZ: number, angle: number): boolean {
    const toLocal = (point: Vec2) => {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x: dx * cos + dz * sin,
        z: -dx * sin + dz * cos
      };
    };
    const start = toLocal(a);
    const end = toLocal(b);
    let tMin = 0;
    let tMax = 1;

    for (const axis of ["x", "z"] as const) {
      const min = axis === "x" ? -halfX : -halfZ;
      const max = axis === "x" ? halfX : halfZ;
      const delta = end[axis] - start[axis];
      if (Math.abs(delta) < 0.0001) {
        if (start[axis] < min || start[axis] > max) return false;
        continue;
      }
      let t1 = (min - start[axis]) / delta;
      let t2 = (max - start[axis]) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }

    return true;
  }

  private lineIntersectsPolygon(a: Vec2, b: Vec2, polygon: Vec2[], padding: number): boolean {
    if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) {
      return true;
    }

    for (let i = 0; i < polygon.length; i += 1) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      if (this.segmentsIntersect(a, b, start, end) || distanceToSegment(start, a, b) <= padding || distanceToSegment(end, a, b) <= padding) {
        return true;
      }
    }
    return false;
  }

  private segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
    const orientation = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q.z - p.z) * (r.x - q.x) - (q.x - p.x) * (r.z - q.z));
    const onSegment = (p: Vec2, q: Vec2, r: Vec2) =>
      q.x <= Math.max(p.x, r.x) + 0.0001 &&
      q.x + 0.0001 >= Math.min(p.x, r.x) &&
      q.z <= Math.max(p.z, r.z) + 0.0001 &&
      q.z + 0.0001 >= Math.min(p.z, r.z);

    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(a, c, b)) return true;
    if (o2 === 0 && onSegment(a, d, b)) return true;
    if (o3 === 0 && onSegment(c, a, d)) return true;
    if (o4 === 0 && onSegment(c, b, d)) return true;
    return false;
  }

  private createWorld(): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd9c2, 0x1c1a14, 1.4));
    const moon = new THREE.DirectionalLight(0xe6f0d2, 2.25);
    moon.position.set(-150, 205, 75);
    moon.castShadow = true;
    moon.shadow.camera.left = -360;
    moon.shadow.camera.right = 360;
    moon.shadow.camera.top = 360;
    moon.shadow.camera.bottom = -360;
    moon.shadow.mapSize.set(2048, 2048);
    this.scene.add(moon);

    const emergency = new THREE.PointLight(0xd64b36, 7, 165);
    emergency.position.set(22, 7, 48);
    this.scene.add(emergency);

    this.addGround();
    this.addMownLawnBands();
    this.addLawnWearPatches();
    this.addPaths();
    this.addRailTrailRemnants();
    this.addLandmarks();
    this.addAmenities();
    this.addPathLights();
    this.addParkEntranceDetails();
    this.addBoundaryFence();
    this.addTrees();
  }

  private createMaterials() {
    const grass = new THREE.MeshStandardMaterial({
      map: this.createCanvasTexture("grass"),
      color: 0x7d9560,
      roughness: 0.94
    });
    const path = new THREE.MeshStandardMaterial({
      map: this.createCanvasTexture("path"),
      color: 0xc4a66e,
      roughness: 0.88
    });
    const gravel = new THREE.MeshStandardMaterial({
      map: this.createCanvasTexture("gravel"),
      color: 0xb59a68,
      roughness: 0.96
    });
    const asphalt = new THREE.MeshStandardMaterial({
      map: this.createCanvasTexture("asphalt"),
      color: 0x30332f,
      roughness: 0.84
    });
    const concrete = new THREE.MeshStandardMaterial({
      map: this.createCanvasTexture("concrete"),
      color: 0x9e9b8d,
      roughness: 0.91
    });
    const court = new THREE.MeshStandardMaterial({ color: 0x396f55, roughness: 0.72 });
    const rubber = new THREE.MeshStandardMaterial({
      map: this.createCanvasTexture("rubber"),
      color: 0x724b3f,
      roughness: 0.86
    });
    const mulch = new THREE.MeshStandardMaterial({
      map: this.createCanvasTexture("mulch"),
      color: 0x6a4c35,
      roughness: 0.96
    });
    const dirt = new THREE.MeshStandardMaterial({ color: 0x655741, roughness: 0.98, transparent: true, opacity: 0.58 });
    const leafLitter = new THREE.MeshStandardMaterial({ color: 0x5f5432, roughness: 0.98, transparent: true, opacity: 0.44 });
    const wornGrass = new THREE.MeshStandardMaterial({ color: 0x75815a, roughness: 0.98, transparent: true, opacity: 0.46 });
    const hedge = new THREE.MeshStandardMaterial({ color: 0x385a32, roughness: 0.9 });
    const line = new THREE.MeshBasicMaterial({ color: 0xe8e0b6 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x7b5636, roughness: 0.78 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a928a, metalness: 0.35, roughness: 0.48 });
    const brick = new THREE.MeshStandardMaterial({ color: 0x9b5a43, roughness: 0.8 });
    const darkOpening = new THREE.MeshBasicMaterial({ color: 0x141813 });
    const zombie = new THREE.MeshStandardMaterial({ color: 0x6f7752, roughness: 0.9 });
    const zombieDark = new THREE.MeshStandardMaterial({ color: 0x33402d, roughness: 0.95 });
    return {
      grass,
      path,
      gravel,
      asphalt,
      concrete,
      court,
      rubber,
      mulch,
      dirt,
      leafLitter,
      wornGrass,
      hedge,
      line,
      timber,
      metal,
      brick,
      darkOpening,
      zombie,
      zombieDark
    };
  }

  private createCanvasTexture(kind: "grass" | "path" | "gravel" | "asphalt" | "concrete" | "rubber" | "mulch"): THREE.CanvasTexture {
    const specs = {
      grass: { base: "#73845a", fleck: [37, 71, 36], repeat: 34, count: 900 },
      path: { base: "#b79962", fleck: [83, 63, 42], repeat: 11, count: 900 },
      gravel: { base: "#aa925f", fleck: [93, 78, 55], repeat: 14, count: 1250 },
      asphalt: { base: "#2f332f", fleck: [74, 78, 72], repeat: 18, count: 1100 },
      concrete: { base: "#979486", fleck: [107, 106, 97], repeat: 10, count: 850 },
      rubber: { base: "#704b41", fleck: [54, 40, 36], repeat: 12, count: 1100 },
      mulch: { base: "#644833", fleck: [42, 29, 21], repeat: 13, count: 1000 }
    } as const;
    const spec = specs[kind];
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = spec.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < spec.count; i += 1) {
      const alpha = this.rng.range(0.05, 0.18);
      const [r, g, b] = spec.fleck;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      const size = kind === "asphalt" || kind === "gravel" ? this.rng.range(1, 3) : this.rng.range(1, 4);
      ctx.fillRect(this.rng.range(0, 256), this.rng.range(0, 256), size, size);
    }
    if (kind === "concrete" || kind === "asphalt") {
      ctx.strokeStyle = kind === "concrete" ? "rgba(70, 72, 66, 0.12)" : "rgba(180, 180, 162, 0.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i += 1) {
        ctx.beginPath();
        ctx.moveTo(this.rng.range(0, 256), this.rng.range(0, 256));
        ctx.lineTo(this.rng.range(0, 256), this.rng.range(0, 256));
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(spec.repeat, spec.repeat);
    return texture;
  }

  private addGround(): void {
    const shape = new THREE.Shape();
    this.level.boundary.forEach((point, index) => {
      if (index === 0) {
        shape.moveTo(point.x, point.z);
      } else {
        shape.lineTo(point.x, point.z);
      }
    });
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, this.materials.grass);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addLawnWearPatches(): void {
    const highUsePoints = [
      ...this.level.upgradeStations.map((station) => station.position),
      ...this.level.amenities.filter((amenity) => amenity.kind === "bbq" || amenity.kind === "bench").slice(0, 18).map((amenity) => amenity.position)
    ];
    highUsePoints.forEach((point, index) => {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(index % 3 === 0 ? 4.2 : 2.7, 18), this.materials.wornGrass);
      patch.position.set(point.x + this.rng.range(-1.1, 1.1), 0.082, point.z + this.rng.range(-1.1, 1.1));
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = this.rng.range(0, Math.PI);
      patch.scale.set(this.rng.range(0.7, 1.35), this.rng.range(0.45, 0.95), 1);
      patch.receiveShadow = true;
      this.scene.add(patch);
    });
  }

  private addMownLawnBands(): void {
    const lawnBands = [
      { center: { x: 86, z: -24 }, radius: 17, scaleX: 2.5, scaleZ: 0.42, rotation: -0.36 },
      { center: { x: 118, z: 48 }, radius: 20, scaleX: 2.2, scaleZ: 0.5, rotation: -0.55 },
      { center: { x: -68, z: 52 }, radius: 14, scaleX: 2.3, scaleZ: 0.38, rotation: 0.24 },
      { center: { x: 16, z: -112 }, radius: 18, scaleX: 2.9, scaleZ: 0.35, rotation: -0.08 },
      { center: { x: -122, z: -36 }, radius: 13, scaleX: 2.0, scaleZ: 0.42, rotation: 0.56 }
    ];

    lawnBands.forEach((band) => {
      if (!pointInPolygon(band.center, this.level.boundary)) {
        return;
      }
      const stripe = new THREE.Mesh(new THREE.CircleGeometry(band.radius, 36), this.materials.wornGrass);
      stripe.position.set(band.center.x, 0.066, band.center.z);
      stripe.rotation.set(-Math.PI / 2, 0, band.rotation);
      stripe.scale.set(band.scaleX, band.scaleZ, 1);
      stripe.receiveShadow = true;
      this.scene.add(stripe);
    });
  }

  private addPaths(): void {
    for (const path of this.level.paths) {
      const material =
        path.kind === "rail" || path.kind === "cycleway"
          ? this.materials.asphalt
          : path.kind === "perimeter"
            ? this.materials.gravel
            : this.materials.path;
      const shoulderWidth = path.width + (path.kind === "rail" ? 2.1 : path.kind === "cycleway" ? 1.45 : 0.95);
      for (let i = 0; i < path.points.length - 1; i += 1) {
        const a = path.points[i];
        const b = path.points[i + 1];
        this.addPathSegment(a, b, shoulderWidth, this.materials.dirt, COLLISION_Y - 0.014, 0.028);
        this.addPathSegment(a, b, path.width, material, COLLISION_Y + 0.008, 0.05);
      }
      for (const point of path.points) {
        this.addPathCap(point, shoulderWidth * 0.52, this.materials.dirt, COLLISION_Y - 0.014, 0.028);
        this.addPathCap(point, path.width * 0.52, material, COLLISION_Y + 0.01, 0.055);
      }
      this.addPathMarkings(path);
    }
  }

  private addPathSegment(a: Vec2, b: Vec2, width: number, material: THREE.Material, y: number, height: number): void {
    const length = distance(a, b);
    if (length < 0.05) return;
    const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const geometry = new THREE.BoxGeometry(length, height, width);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(center.x, y, center.z);
    mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addPathCap(point: Vec2, radius: number, material: THREE.Material, y: number, height: number): void {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 18), material);
    cap.position.set(point.x, y, point.z);
    cap.receiveShadow = true;
    this.scene.add(cap);
  }

  private addPathMarkings(path: LevelPath): void {
    if (path.kind === "rail") {
      const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xd7cfad, transparent: true, opacity: 0.62 });
      const railMaterial = new THREE.MeshBasicMaterial({ color: 0x6f7268, transparent: true, opacity: 0.52 });
      this.addDashedPathLine(path.points, 0, 4.8, 5.6, 0.16, dashMaterial);
      this.addSolidPathStripe(path.points, -1.65, 0.08, railMaterial);
      this.addSolidPathStripe(path.points, 1.65, 0.08, railMaterial);
      return;
    }

    if (path.kind === "cycleway") {
      const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xe4dfc5, transparent: true, opacity: 0.54 });
      this.addDashedPathLine(path.points, 0, 3.2, 4.7, 0.12, dashMaterial);
    }
  }

  private addDashedPathLine(
    points: Vec2[],
    offset: number,
    dashLength: number,
    gap: number,
    width: number,
    material: THREE.Material
  ): void {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const segmentLength = distance(a, b);
      if (segmentLength < dashLength) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const angle = Math.atan2(dz, dx);
      const nx = -dz / segmentLength;
      const nz = dx / segmentLength;
      for (let along = dashLength * 0.5; along < segmentLength; along += dashLength + gap) {
        const actualLength = Math.min(dashLength, segmentLength - along + dashLength * 0.5);
        const t = along / segmentLength;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(actualLength, 0.018, width), material);
        mesh.position.set(a.x + dx * t + nx * offset, 0.132, a.z + dz * t + nz * offset);
        mesh.rotation.y = -angle;
        this.scene.add(mesh);
      }
    }
  }

  private addSolidPathStripe(points: Vec2[], offset: number, width: number, material: THREE.Material): void {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const segmentLength = distance(a, b);
      if (segmentLength < 0.05) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const nx = -dz / segmentLength;
      const nz = dx / segmentLength;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, 0.014, width), material);
      mesh.position.set((a.x + b.x) / 2 + nx * offset, 0.13, (a.z + b.z) / 2 + nz * offset);
      mesh.rotation.y = -Math.atan2(dz, dx);
      this.scene.add(mesh);
    }
  }

  private addRailTrailRemnants(): void {
    const sleeperMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4731, roughness: 0.86 });
    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xb7af98, roughness: 0.78 });
    let markerCount = 0;

    for (const path of this.level.paths.filter((candidate) => candidate.kind === "rail")) {
      for (let i = 0; i < path.points.length - 1; i += 1) {
        const a = path.points[i];
        const b = path.points[i + 1];
        const segmentLength = distance(a, b);
        if (segmentLength < 6) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const angle = Math.atan2(dz, dx);
        const sleeperCount = Math.floor(segmentLength / 10);

        for (let step = 1; step <= sleeperCount; step += 1) {
          const t = step / (sleeperCount + 1);
          const sleeper = new THREE.Mesh(new THREE.BoxGeometry(path.width * 0.92, 0.065, 0.28), sleeperMaterial);
          sleeper.position.set(a.x + dx * t, 0.145, a.z + dz * t);
          sleeper.rotation.y = -angle + Math.PI / 2;
          sleeper.castShadow = true;
          sleeper.receiveShadow = true;
          this.scene.add(sleeper);
        }

        if (markerCount % 2 === 0) {
          const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 8), markerMaterial);
          marker.position.set(a.x, 0.45, a.z);
          marker.castShadow = true;
          this.scene.add(marker);
        }
        markerCount += 1;
      }
    }
  }

  private addGardenZone(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, this.materials.wornGrass, 0.064, landmark.id === "north-activity-precinct" ? 0.2 : 0.32);
    this.addFeatureOutline(landmark.polygon, 0xb7c99a, 0.32);
    if (landmark.id === "alfred-crescent-open-lawn") {
      this.addUnfencedSportsGround(landmark.polygon);
    }
    if (landmark.id === "north-activity-precinct") {
      this.addActivityPrecinctDetails(landmark.polygon);
    }
  }

  private addFeatureOutline(polygon: Vec2[], color: number, opacity: number): void {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const points = [...polygon, polygon[0]].map((point) => new THREE.Vector3(point.x, 0.17, point.z));
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  private addUnfencedSportsGround(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, -4.5, -3.5);
    const rotation = -0.58;
    const width = Math.min(footprint.halfX * 1.45, 58);
    const depth = Math.min(footprint.halfZ * 1.38, 44);
    this.addFieldLines(footprint.center, width, depth, rotation, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 },
      { x1: -0.5, z1: 0, x2: 0.5, z2: 0 },
      { x1: -0.16, z1: -0.5, x2: -0.16, z2: -0.38 },
      { x1: 0.16, z1: -0.5, x2: 0.16, z2: -0.38 },
      { x1: -0.16, z1: 0.5, x2: -0.16, z2: 0.38 },
      { x1: 0.16, z1: 0.5, x2: 0.16, z2: 0.38 }
    ], 0xd8e0bd);
    this.addCourtCircle(footprint.center, 4.7, 0xd8e0bd);
    for (const z of [-0.53, 0.53]) {
      for (const x of [-0.12, 0.12]) {
        const postPosition = this.localPoint(footprint.center, rotation, x * width, z * depth);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.4, 8), this.materials.line);
        post.position.set(postPosition.x, 1.2, postPosition.z);
        post.castShadow = true;
        this.scene.add(post);
      }
    }
  }

  private addActivityPrecinctDetails(polygon: Vec2[]): void {
    const center = polygonCentroid(polygon);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), this.materials.concrete);
    pad.position.set(center.x - 6.2, 0.07, center.z + 4.4);
    pad.rotation.x = -Math.PI / 2;
    pad.receiveShadow = true;
    this.scene.add(pad);
    for (const offset of [-0.7, 0.7]) {
      const chess = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.65), new THREE.MeshStandardMaterial({ color: offset < 0 ? 0xe6dfc2 : 0x343a34, roughness: 0.6 }));
      chess.position.set(center.x - 6.2 + offset, 0.76, center.z + 4.4);
      chess.castShadow = true;
      this.scene.add(chess);
    }
  }

  private addLandmarks(): void {
    for (const landmark of this.level.landmarks) {
      if (landmark.kind === "park") continue;
      if (landmark.kind === "garden" && landmark.polygon) this.addGardenZone(landmark);
      if (landmark.kind === "oval" && landmark.polygon) this.addOval(landmark);
      if (landmark.kind === "grandstand" && landmark.polygon) this.addGrandstand(landmark);
      if (landmark.kind === "tennis" && landmark.polygon) {
        this.addFenceAround(landmark.polygon, 2.2, 0x93a59a);
        this.addTennisClubDetails(landmark.polygon);
      }
      if (landmark.kind === "court" && landmark.polygon) {
        this.addFlatPolygon(landmark.polygon, this.materials.court, 0.09);
        this.addTennisCourtLines(landmark.polygon);
        this.addTennisNet(landmark.polygon);
      }
      if (landmark.kind === "bowls" && landmark.polygon) {
        this.addFlatPolygon(landmark.polygon, this.materials.court, 0.08, landmark.id.startsWith("bowling-green") ? 0.86 : 0.6);
        if (landmark.id === "bowling") {
          this.addFenceAround(landmark.polygon, 1.15, 0x677362);
          this.addBowlsClubDetails(landmark.polygon);
        }
        if (landmark.id.startsWith("bowling-green")) {
          this.addBowlingRinkLines(landmark.polygon);
          this.addLowHedgeAround(landmark.polygon, 0.52, 0.42);
        }
      }
      if (landmark.kind === "playground" && landmark.polygon) this.addPlayground(landmark);
      if (landmark.kind === "skate" && landmark.polygon) this.addSkatePark(landmark);
      if (landmark.kind === "basketball" && landmark.polygon) this.addBasketball(landmark);
      if (landmark.kind === "toilets") this.addToilets(landmark);
      if (landmark.kind === "bbq" && landmark.position) this.addBbq(landmark.position);
      if (landmark.kind === "rotunda" && landmark.position) this.addRotunda(landmark.position);
      if (landmark.kind === "memorial" && landmark.position) this.addMemorial(landmark);
    }
  }

  private addFlatPolygon(polygon: Vec2[], material: THREE.Material, y = 0.08, opacity = 1): THREE.Mesh {
    const shape = new THREE.Shape();
    polygon.forEach((point, index) => (index === 0 ? shape.moveTo(point.x, point.z) : shape.lineTo(point.x, point.z)));
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    const meshMaterial = opacity < 1 ? material.clone() : material;
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.position.y = y;
    if (opacity < 1) {
      meshMaterial.transparent = true;
      meshMaterial.opacity = opacity;
    }
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addBlockPolygon(polygon: Vec2[], height: number, material: THREE.Material): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0.8, 0.45);
    const center = footprint.center;
    const geometry = new THREE.BoxGeometry(footprint.halfX * 2, height, footprint.halfZ * 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(center.x, height / 2, center.z);
    mesh.rotation.y = -footprint.angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(footprint.halfX * 2 + 1.8, 0.45, footprint.halfZ * 2 + 1.6), this.materials.timber);
    roof.position.set(center.x, height + 0.25, center.z);
    roof.rotation.y = mesh.rotation.y;
    roof.castShadow = true;
    this.scene.add(roof);

    for (let row = 0; row < 4; row += 1) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(footprint.halfX * 1.65, 0.18, 0.34), this.materials.timber);
      seat.position.set(center.x, 1.2 + row * 0.45, center.z);
      seat.rotation.y = mesh.rotation.y;
      const forward = new THREE.Vector3(Math.sin(mesh.rotation.y), 0, Math.cos(mesh.rotation.y));
      seat.position.addScaledVector(forward, -footprint.halfZ + 0.6 + row * 0.35);
      seat.castShadow = true;
      this.scene.add(seat);
    }
  }

  private fitBoxFromPolygon(polygon: Vec2[], paddingX: number, paddingZ: number): { center: Vec2; halfX: number; halfZ: number; angle: number } {
    const center = polygonCentroid(polygon);
    const first = polygon[0];
    const second = polygon[1] ?? first;
    const angle = Math.atan2(second.z - first.z, second.x - first.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let halfX = 0;
    let halfZ = 0;

    for (const point of polygon) {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      halfX = Math.max(halfX, Math.abs(dx * cos + dz * sin));
      halfZ = Math.max(halfZ, Math.abs(-dx * sin + dz * cos));
    }

    return { center, halfX: halfX + paddingX, halfZ: halfZ + paddingZ, angle };
  }

  private localPoint(center: Vec2, rotation: number, localX: number, localZ: number): Vec2 {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: center.x + localX * cos - localZ * sin,
      z: center.z + localX * sin + localZ * cos
    };
  }

  private addLocalBox(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    y: number,
    castShadow = true
  ): THREE.Mesh {
    const position = this.localPoint(center, rotation, localX, localZ);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(position.x, y, position.z);
    mesh.rotation.y = rotation;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addLocalCylinder(
    center: Vec2,
    rotation: number,
    localX: number,
    localZ: number,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    material: THREE.Material
  ): THREE.Mesh {
    const position = this.localPoint(center, rotation, localX, localZ);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 10), material);
    mesh.position.set(position.x, height / 2, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addGrandstand(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addBlockPolygon(landmark.polygon, 5.8, this.materials.brick);
    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0.8, 0.45);
    const rotation = -footprint.angle;
    const center = footprint.center;
    const frontZ = -footprint.halfZ - 0.05;

    this.addLocalBox(center, rotation, 0, frontZ, footprint.halfX * 1.45, 1.35, 0.08, this.materials.darkOpening, 1.75, false);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) {
      this.addLocalCylinder(center, rotation, x * footprint.halfX * 2, frontZ - 0.08, 0.09, 0.12, 2.8, this.materials.metal);
    }
    for (let i = -4; i <= 4; i += 1) {
      this.addLocalBox(center, rotation, (i / 4) * footprint.halfX * 0.9, 0, 0.08, 0.09, footprint.halfZ * 2 + 2.3, this.materials.metal, 6.12);
    }
    for (let step = 0; step < 4; step += 1) {
      this.addLocalBox(center, rotation, footprint.halfX + 0.55, frontZ + 0.55 + step * 0.42, 1.1, 0.16, 0.32, this.materials.concrete, 0.18 + step * 0.18);
    }
    this.addLabel("Kevin Murray Stand", center, 6.7);
  }

  private addFenceAround(
    polygon: Vec2[],
    height: number,
    color: number,
    gaps: Array<{ position: Vec2; radius: number }> = []
  ): void {
    const postMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x5c6d64, metalness: 0.35, roughness: 0.45 });
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const intervals = this.fenceVisibleIntervals(a, b, gaps);
      for (const interval of intervals) {
        this.addFenceSegment(a, b, interval.start, interval.end, height, postMaterial, railMaterial);
      }
    }
  }

  private fenceVisibleIntervals(
    a: Vec2,
    b: Vec2,
    gaps: Array<{ position: Vec2; radius: number }>
  ): Array<{ start: number; end: number }> {
    let intervals: Array<{ start: number; end: number }> = [{ start: 0, end: 1 }];
    if (gaps.length === 0) return intervals;

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segmentLengthSquared = dx * dx + dz * dz;
    const segmentLength = Math.sqrt(segmentLengthSquared);
    if (segmentLength < 0.001) return [];

    for (const gap of gaps) {
      const t = THREE.MathUtils.clamp(((gap.position.x - a.x) * dx + (gap.position.z - a.z) * dz) / segmentLengthSquared, 0, 1);
      const closest = { x: a.x + dx * t, z: a.z + dz * t };
      if (distance(closest, gap.position) > gap.radius) {
        continue;
      }
      const gapStart = Math.max(0, t - gap.radius / segmentLength);
      const gapEnd = Math.min(1, t + gap.radius / segmentLength);
      const nextIntervals: Array<{ start: number; end: number }> = [];
      for (const interval of intervals) {
        if (gapEnd <= interval.start || gapStart >= interval.end) {
          nextIntervals.push(interval);
          continue;
        }
        if (gapStart - interval.start > 0.015) {
          nextIntervals.push({ start: interval.start, end: gapStart });
        }
        if (interval.end - gapEnd > 0.015) {
          nextIntervals.push({ start: gapEnd, end: interval.end });
        }
      }
      intervals = nextIntervals;
    }

    return intervals;
  }

  private addFenceSegment(
    a: Vec2,
    b: Vec2,
    start: number,
    end: number,
    height: number,
    postMaterial: THREE.Material,
    railMaterial: THREE.Material
  ): void {
    const startPoint = { x: a.x + (b.x - a.x) * start, z: a.z + (b.z - a.z) * start };
    const endPoint = { x: a.x + (b.x - a.x) * end, z: a.z + (b.z - a.z) * end };
    const segmentLength = distance(startPoint, endPoint);
    if (segmentLength < 0.45) return;
    const angle = -Math.atan2(endPoint.z - startPoint.z, endPoint.x - startPoint.x);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, 0.16, 0.14), railMaterial);
    rail.position.set((startPoint.x + endPoint.x) / 2, height * 0.55, (startPoint.z + endPoint.z) / 2);
    rail.rotation.y = angle;
    rail.castShadow = true;
    this.scene.add(rail);
    const postCount = Math.max(1, Math.floor(segmentLength / 8));
    for (let postIndex = 0; postIndex <= postCount; postIndex += 1) {
      const t = postIndex / postCount;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, height, 6), postMaterial);
      post.position.set(startPoint.x + (endPoint.x - startPoint.x) * t, height / 2, startPoint.z + (endPoint.z - startPoint.z) * t);
      post.castShadow = true;
      this.scene.add(post);
    }
  }

  private addLowHedgeAround(polygon: Vec2[], height: number, width: number): void {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const segmentLength = distance(a, b);
      if (segmentLength < 0.3) continue;
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, height, width), this.materials.hedge);
      hedge.position.set((a.x + b.x) / 2, height / 2, (a.z + b.z) / 2);
      hedge.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      hedge.castShadow = true;
      hedge.receiveShadow = true;
      this.scene.add(hedge);
    }
  }

  private addTennisClubDetails(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const rotation = -footprint.angle;
    const apronZ = footprint.halfZ + 1.1;
    this.addLocalBox(footprint.center, rotation, 0, apronZ, footprint.halfX * 1.72, 0.055, 1.3, this.materials.concrete, 0.12, false);
    for (const x of [-0.7, 0.7]) {
      for (const z of [-0.82, 0.82]) {
        const point = this.localPoint(footprint.center, rotation, x * footprint.halfX, z * footprint.halfZ);
        this.addLampPost(point, rotation, false);
      }
    }
  }

  private addBowlsClubDetails(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const rotation = -footprint.angle;
    const center = footprint.center;
    this.addLocalBox(center, rotation, -footprint.halfX * 0.28, footprint.halfZ * 0.48, footprint.halfX * 0.9, 0.12, 2.1, this.materials.concrete, 0.12, false);
    this.addLocalBox(center, rotation, -footprint.halfX * 0.28, footprint.halfZ * 0.54, footprint.halfX * 0.82, 1.3, 1.1, this.materials.timber, 0.78);
    this.addLocalBox(center, rotation, -footprint.halfX * 0.28, footprint.halfZ * 0.54, footprint.halfX * 0.9, 0.16, 1.3, this.materials.metal, 1.52);
    for (const x of [-0.55, 0, 0.55]) {
      this.addLocalBox(center, rotation, -footprint.halfX * 0.28 + x * footprint.halfX * 0.42, footprint.halfZ * 0.01, 1.9, 0.18, 0.38, this.materials.timber, 0.48);
    }
  }

  private addOval(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, new THREE.MeshStandardMaterial({ color: 0x5d874d, roughness: 0.9 }), 0.075);
    this.addFenceAround(landmark.polygon, 1.25, 0x8f7b61);
    const center = polygonCentroid(landmark.polygon);
    this.addOvalMowingBands(landmark.polygon, center);
    const ring = makeCircle(center, 34, 64);
    this.addPathRing(ring, 0xebe2bf);
    this.addOvalBoundaryMarkers(center, 38);
    this.addOvalSportsDetails(landmark.polygon, center);
    this.addLabel("W.T. Peterson Oval", center, 7);
  }

  private addOvalMowingBands(polygon: Vec2[], center: Vec2): void {
    const minX = Math.min(...polygon.map((point) => point.x));
    const maxX = Math.max(...polygon.map((point) => point.x));
    const minZ = Math.min(...polygon.map((point) => point.z));
    const maxZ = Math.max(...polygon.map((point) => point.z));
    const radiusX = (maxX - minX) * 0.42;
    const radiusZ = (maxZ - minZ) * 0.42;
    const materials = [
      new THREE.LineBasicMaterial({ color: 0x82a365, transparent: true, opacity: 0.44 }),
      new THREE.LineBasicMaterial({ color: 0x486f3f, transparent: true, opacity: 0.32 })
    ];

    for (let band = 0; band < 6; band += 1) {
      const scale = 1 - band * 0.105;
      const points = Array.from({ length: 80 }, (_, index) => {
        const angle = (index / 80) * Math.PI * 2;
        return new THREE.Vector3(center.x + Math.cos(angle) * radiusX * scale, 0.155, center.z + Math.sin(angle) * radiusZ * scale);
      });
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([...points, points[0]]), materials[band % materials.length]));
    }
  }

  private addOvalBoundaryMarkers(center: Vec2, radius: number): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xd6d0b5, roughness: 0.8 });
    for (let i = 0; i < 20; i += 1) {
      const angle = (i / 20) * Math.PI * 2;
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 8), material);
      marker.position.set(center.x + Math.cos(angle) * radius, 0.28, center.z + Math.sin(angle) * radius);
      marker.castShadow = true;
      this.scene.add(marker);
    }
  }

  private addOvalSportsDetails(polygon: Vec2[], center: Vec2): void {
    const minZ = Math.min(...polygon.map((point) => point.z));
    const maxZ = Math.max(...polygon.map((point) => point.z));
    const pitch = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0xb8a36e, roughness: 0.93 }));
    pitch.position.set(center.x, 0.14, center.z);
    pitch.rotation.y = 0.12;
    pitch.receiveShadow = true;
    this.scene.add(pitch);
    this.addFieldLines(center, 4.8, 20.5, 0.12, [
      { x1: -0.5, z1: -0.32, x2: 0.5, z2: -0.32 },
      { x1: -0.5, z1: 0.32, x2: 0.5, z2: 0.32 },
      { x1: -0.18, z1: -0.42, x2: -0.18, z2: -0.25 },
      { x1: 0.18, z1: -0.42, x2: 0.18, z2: -0.25 },
      { x1: -0.18, z1: 0.42, x2: -0.18, z2: 0.25 },
      { x1: 0.18, z1: 0.42, x2: 0.18, z2: 0.25 }
    ], 0xf0e8c8);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xe7e0bf, transparent: true, opacity: 0.82 });
    const centreCircle = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        makeCircle(center, 9.5, 48).concat([makeCircle(center, 9.5, 48)[0]]).map((point) => new THREE.Vector3(point.x, 0.18, point.z))
      ),
      lineMaterial
    );
    this.scene.add(centreCircle);

    for (const z of [minZ + 8, maxZ - 8]) {
      for (const x of [-2.9, 2.9, -6.4, 6.4]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(x === -2.9 || x === 2.9 ? 0.08 : 0.06, 0.08, x === -2.9 || x === 2.9 ? 5.2 : 3.6, 8), this.materials.line);
        post.position.set(center.x + x, (x === -2.9 || x === 2.9 ? 5.2 : 3.6) / 2, z);
        post.castShadow = true;
        this.scene.add(post);
      }
    }
  }

  private addPathRing(points: Vec2[], color: number): void {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82 });
    const geometry = new THREE.BufferGeometry().setFromPoints(
      [...points, points[0]].map((point) => new THREE.Vector3(point.x, 0.16, point.z))
    );
    this.scene.add(new THREE.Line(geometry, material));
  }

  private addTennisCourtLines(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    this.addFieldLines(footprint.center, footprint.halfX * 1.72, footprint.halfZ * 1.72, -footprint.angle, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 },
      { x1: 0, z1: -0.5, x2: 0, z2: 0.5 },
      { x1: -0.5, z1: 0, x2: 0.5, z2: 0 },
      { x1: -0.32, z1: -0.5, x2: -0.32, z2: 0.5 },
      { x1: 0.32, z1: -0.5, x2: 0.32, z2: 0.5 }
    ]);
  }

  private addTennisNet(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const rotation = -footprint.angle;
    const netAlongX = footprint.halfZ > footprint.halfX;
    const netWidth = netAlongX ? footprint.halfX * 1.55 : 0.08;
    const netDepth = netAlongX ? 0.08 : footprint.halfZ * 1.55;
    const netMaterial = new THREE.MeshBasicMaterial({ color: 0x1e2923, transparent: true, opacity: 0.78 });
    this.addLocalBox(footprint.center, rotation, 0, 0, netWidth, 0.64, netDepth, netMaterial, 0.52, false);

    const postOffset = netAlongX ? footprint.halfX * 0.82 : footprint.halfZ * 0.82;
    for (const side of [-1, 1]) {
      const localX = netAlongX ? side * postOffset : 0;
      const localZ = netAlongX ? 0 : side * postOffset;
      this.addLocalCylinder(footprint.center, rotation, localX, localZ, 0.055, 0.07, 1.05, this.materials.metal);
    }
  }

  private addBowlingRinkLines(polygon: Vec2[]): void {
    const footprint = this.fitBoxFromPolygon(polygon, 0, 0);
    const lines = Array.from({ length: 5 }, (_, index) => {
      const x = -0.4 + index * 0.2;
      return { x1: x, z1: -0.48, x2: x, z2: 0.48 };
    });
    this.addFieldLines(footprint.center, footprint.halfX * 1.8, footprint.halfZ * 1.8, -footprint.angle, lines, 0xaecb9b);
  }

  private addFieldLines(
    center: Vec2,
    width: number,
    depth: number,
    rotation: number,
    lines: Array<{ x1: number; z1: number; x2: number; z2: number }>,
    color = 0xe8e0b6
  ): void {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.88 });
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const toWorld = (x: number, z: number) => {
      const localX = x * width;
      const localZ = z * depth;
      return new THREE.Vector3(center.x + localX * cos - localZ * sin, 0.18, center.z + localX * sin + localZ * cos);
    };
    for (const line of lines) {
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([toWorld(line.x1, line.z1), toWorld(line.x2, line.z2)]), material));
    }
  }

  private addPlayground(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, this.materials.mulch, 0.1);
    const center = polygonCentroid(landmark.polygon);
    const frame = new THREE.Group();
    const colors = [0xd6b85d, 0xb74838, 0x609f8a];
    for (let i = 0; i < 4; i += 1) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 4.2, 8), new THREE.MeshStandardMaterial({ color: colors[i % colors.length] }));
      pole.position.set((i % 2 === 0 ? -2 : 2), 2.1, i < 2 ? -2 : 2);
      pole.castShadow = true;
      frame.add(pole);
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 4.6), this.materials.timber);
    platform.position.y = 2.35;
    platform.castShadow = true;
    frame.add(platform);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 6.8), new THREE.MeshStandardMaterial({ color: 0xb74838, roughness: 0.42 }));
    slide.position.set(0, 1.4, 5);
    slide.rotation.x = -0.38;
    slide.castShadow = true;
    frame.add(slide);
    frame.position.set(center.x, 0, center.z);
    this.scene.add(frame);
    this.addSwingSet({ x: center.x - 5.6, z: center.z - 3.2 }, 0.25);
    this.addBalanceLogs({ x: center.x + 4.5, z: center.z + 3.8 }, -0.45);
  }

  private addSwingSet(position: Vec2, rotation: number): void {
    const group = new THREE.Group();
    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0x5f6f69, metalness: 0.25, roughness: 0.5 });
    for (const x of [-1.8, 1.8]) {
      for (const z of [-0.55, 0.55]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.3, 8), sideMaterial);
        leg.position.set(x, 1.6, z);
        leg.rotation.z = x < 0 ? -0.22 : 0.22;
        leg.castShadow = true;
        group.add(leg);
      }
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.25, 8), sideMaterial);
    beam.position.set(0, 3.18, 0);
    beam.rotation.z = Math.PI / 2;
    beam.castShadow = true;
    group.add(beam);
    for (const x of [-0.8, 0.8]) {
      for (const chainX of [-0.18, 0.18]) {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.65, 6), this.materials.metal);
        chain.position.set(x + chainX, 2.25, 0);
        chain.castShadow = true;
        group.add(chain);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.34), this.materials.rubber);
      seat.position.set(x, 1.42, 0);
      seat.castShadow = true;
      group.add(seat);
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private addBalanceLogs(position: Vec2, rotation: number): void {
    const group = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.3, 8), this.materials.timber);
      log.position.set((i - 1.5) * 1.1, 0.28 + (i % 2) * 0.08, (i % 2) * 0.52);
      log.rotation.z = Math.PI / 2;
      log.castShadow = true;
      group.add(log);
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private addSkatePark(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, this.materials.concrete, 0.1);
    const center = polygonCentroid(landmark.polygon);
    for (const offset of [-6, 6]) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0x6d706c, roughness: 0.76 }));
      ramp.position.set(center.x + offset, 0.65, center.z);
      ramp.rotation.z = offset < 0 ? 0.22 : -0.22;
      ramp.castShadow = true;
      ramp.receiveShadow = true;
      this.scene.add(ramp);
    }
    this.addSkateRail({ x: center.x, z: center.z - 2.3 }, 0.08, 8.5);
    this.addLocalBox(center, 0, 0, 4.2, 6.2, 0.46, 0.72, this.materials.concrete, 0.34);
    this.addLocalBox(center, 0, -4.2, -4.1, 4.6, 0.38, 0.64, this.materials.concrete, 0.28);
  }

  private addSkateRail(position: Vec2, rotation: number, length: number): void {
    const group = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, length, 10), this.materials.metal);
    rail.position.y = 0.82;
    rail.rotation.z = Math.PI / 2;
    rail.castShadow = true;
    group.add(rail);
    for (const x of [-length * 0.36, length * 0.36]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.82, 8), this.materials.metal);
      post.position.set(x, 0.41, 0);
      post.castShadow = true;
      group.add(post);
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private addBasketball(landmark: Landmark): void {
    if (!landmark.polygon) return;
    this.addFlatPolygon(landmark.polygon, this.materials.asphalt, 0.1);
    const center = polygonCentroid(landmark.polygon);
    const footprint = this.fitBoxFromPolygon(landmark.polygon, 0, 0);
    this.addFieldLines(footprint.center, footprint.halfX * 1.75, footprint.halfZ * 1.75, -footprint.angle, [
      { x1: -0.5, z1: -0.5, x2: 0.5, z2: -0.5 },
      { x1: 0.5, z1: -0.5, x2: 0.5, z2: 0.5 },
      { x1: 0.5, z1: 0.5, x2: -0.5, z2: 0.5 },
      { x1: -0.5, z1: 0.5, x2: -0.5, z2: -0.5 },
      { x1: 0, z1: -0.5, x2: 0, z2: 0.5 },
      { x1: -0.18, z1: -0.5, x2: -0.18, z2: -0.25 },
      { x1: 0.18, z1: 0.5, x2: 0.18, z2: 0.25 }
    ]);
    this.addCourtCircle(center, 2.2, 0xe8e0b6);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.6, 10), this.materials.metal);
      pole.position.set(center.x + side * 7.2, 2.3, center.z);
      pole.castShadow = true;
      this.scene.add(pole);
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 0.18), new THREE.MeshStandardMaterial({ color: 0xe6d9b8, roughness: 0.5 }));
      board.position.set(center.x + side * 7.2, 4.2, center.z + side * 1.4);
      this.scene.add(board);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 20), new THREE.MeshStandardMaterial({ color: 0xb94e39, metalness: 0.25, roughness: 0.4 }));
      hoop.position.set(center.x + side * 7.2, 3.6, center.z + side * 2.1);
      hoop.rotation.x = Math.PI / 2;
      this.scene.add(hoop);
    }
  }

  private addCourtCircle(center: Vec2, radius: number, color: number): void {
    const points = makeCircle(center, radius, 40);
    this.scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([...points, points[0]].map((point) => new THREE.Vector3(point.x, 0.18, point.z))),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.86 })
      )
    );
  }

  private addToilets(landmark: Landmark): void {
    const center = landmark.polygon ? polygonCentroid(landmark.polygon) : landmark.position;
    if (!center) return;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.08, 6.2), this.materials.concrete);
    pad.position.set(center.x, 0.07, center.z);
    pad.receiveShadow = true;
    this.scene.add(pad);
    const building = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), new THREE.MeshStandardMaterial({ color: 0xb8a072, roughness: 0.82 }));
    building.position.set(center.x, 1.6, center.z);
    building.castShadow = true;
    building.receiveShadow = true;
    this.scene.add(building);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.34, 5.7), new THREE.MeshStandardMaterial({ color: 0x6f7567, roughness: 0.8 }));
    roof.position.set(center.x, 3.38, center.z);
    roof.castShadow = true;
    this.scene.add(roof);
    for (const x of [-1.65, 0, 1.65]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.72, 0.08), this.materials.darkOpening);
      door.position.set(center.x + x, 1.08, center.z - 2.54);
      this.scene.add(door);
    }
    for (const x of [-2.15, 2.15]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.18, 0.1), this.materials.metal);
      vent.position.set(center.x + x, 2.62, center.z - 2.56);
      this.scene.add(vent);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.1), new THREE.MeshBasicMaterial({ color: 0x2e6c79 }));
    sign.position.set(center.x, 2.7, center.z - 2.56);
    this.scene.add(sign);
  }

  private addBbq(position: Vec2): void {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), this.materials.concrete);
    pad.position.set(position.x, 0.075, position.z);
    pad.rotation.x = -Math.PI / 2;
    pad.receiveShadow = true;
    this.scene.add(pad);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.0, 1.4), this.materials.metal);
    base.position.set(position.x, 0.55, position.z);
    base.castShadow = true;
    this.scene.add(base);
    const shelter = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.32, 4), this.materials.timber);
    shelter.position.set(position.x, 3.2, position.z);
    shelter.rotation.y = Math.PI / 4;
    shelter.castShadow = true;
    this.scene.add(shelter);
    this.addPicnicTable({ x: position.x + 3.1, z: position.z + 1.2 }, -0.28);
  }

  private addAmenities(): void {
    for (const amenity of this.level.amenities) {
      const angle = this.angleFromId(amenity.id);
      if (amenity.kind === "bench") {
        this.addBench(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0x9ebf86, 0.62);
      } else if (amenity.kind === "picnic_table") {
        this.addPicnicTable(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0x9ebf86, 0.62);
      } else if (amenity.kind === "table_tennis") {
        this.addTableTennis(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0x61a8d3, 0.68);
      } else if (amenity.kind === "waste_basket") {
        this.addWasteBasket(amenity.position);
        this.addAmenityHalo(amenity.position, 0xd0a343, 0.5);
      } else if (amenity.kind === "drinking_water") {
        this.addDrinkingFountain(amenity.position);
        this.addAmenityHalo(amenity.position, 0x61a8d3, 0.68);
      } else if (amenity.kind === "bicycle_parking") {
        this.addBikeRack(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0xc2c8ba, 0.58);
      } else if (amenity.kind === "bbq") {
        this.addSupplyCrate(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0xd0a343, 0.64);
      } else if (amenity.kind === "toilets") {
        this.addToiletSign(amenity.position, angle);
        this.addAmenityHalo(amenity.position, 0x61a8d3, 0.52);
      }
    }
  }

  private addPathLights(): void {
    const used = new Set<string>();
    let placed = 0;
    for (const path of this.level.paths.filter((candidate) => candidate.kind !== "footway")) {
      if (placed >= 34) break;
      for (let i = 0; i < path.points.length - 1; i += 1) {
        if (placed >= 34) break;
        const a = path.points[i];
        const b = path.points[i + 1];
        const segmentLength = distance(a, b);
        const count = Math.floor(segmentLength / 88);
        if (count === 0) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const normalLength = Math.hypot(dx, dz) || 1;
        const offset = path.kind === "rail" ? 3.5 : 2.6;

        for (let step = 1; step <= count; step += 1) {
          const t = step / (count + 1);
          const side = (i + step) % 2 === 0 ? 1 : -1;
          const x = a.x + dx * t + (-dz / normalLength) * offset * side;
          const z = a.z + dz * t + (dx / normalLength) * offset * side;
          const key = `${Math.round(x / 16)}:${Math.round(z / 16)}`;
          if (used.has(key) || !pointInPolygon({ x, z }, this.level.boundary)) continue;
          used.add(key);
          this.addLampPost({ x, z }, Math.atan2(dz, dx), placed % 3 === 0);
          placed += 1;
          if (placed >= 34) break;
        }
      }
    }
  }

  private addLampPost(position: Vec2, angle: number, activeLight = true): void {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 8), this.materials.metal);
    post.position.y = 1.8;
    post.castShadow = true;
    group.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), this.materials.metal);
    arm.position.set(0, 3.45, -0.42);
    arm.castShadow = true;
    group.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf0d99b }));
    lamp.position.set(0, 3.32, -0.9);
    group.add(lamp);
    if (activeLight) {
      const glow = new THREE.PointLight(0xf0c96a, 0.55, 18);
      glow.position.set(0, 3.25, -0.9);
      group.add(glow);
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = -angle;
    this.scene.add(group);
  }

  private addBench(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.55), this.materials.concrete);
    pad.position.y = 0.035;
    pad.receiveShadow = true;
    group.add(pad);
    for (const z of [-0.22, 0, 0.22]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.11, 0.12), this.materials.timber);
      slat.position.set(0, 0.72, z);
      slat.castShadow = true;
      group.add(slat);
    }
    for (const y of [0.96, 1.18]) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.12, 0.14), this.materials.timber);
      back.position.set(0, y, 0.43);
      back.rotation.x = -0.18;
      back.castShadow = true;
      group.add(back);
    }
    for (const x of [-0.92, 0.92]) {
      for (const z of [-0.2, 0.28]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), this.materials.metal);
        leg.position.set(x, 0.33, z);
        leg.castShadow = true;
        group.add(leg);
      }
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addPicnicTable(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.055, 2.45), this.materials.concrete);
    pad.position.y = 0.032;
    pad.receiveShadow = true;
    group.add(pad);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.72), this.materials.timber);
    top.position.y = 0.82;
    top.castShadow = true;
    group.add(top);
    for (const z of [-0.85, 0.85]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.32), this.materials.timber);
      bench.position.set(0, 0.52, z);
      bench.castShadow = true;
      group.add(bench);
    }
    for (const x of [-0.72, 0.72]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.12), this.materials.metal);
      leg.position.set(x, 0.38, 0);
      leg.rotation.z = x < 0 ? -0.18 : 0.18;
      leg.castShadow = true;
      group.add(leg);
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addTableTennis(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.055, 2.8), this.materials.concrete);
    pad.position.y = 0.032;
    pad.receiveShadow = true;
    group.add(pad);
    const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6b65, roughness: 0.54 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.12, 1.53), tableMaterial);
    table.position.y = 0.78;
    table.castShadow = true;
    group.add(table);
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 1.62), new THREE.MeshBasicMaterial({ color: 0xe9eee2, transparent: true, opacity: 0.78 }));
    net.position.y = 1.03;
    group.add(net);
    for (const x of [-1.33, 0, 1.33]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 1.55), this.materials.line);
      line.position.set(x, 0.855, 0);
      group.add(line);
    }
    const centre = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.018, 0.035), this.materials.line);
    centre.position.set(0, 0.858, 0);
    group.add(centre);
    for (const x of [-1.05, 1.05]) {
      for (const z of [-0.52, 0.52]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.76, 6), this.materials.metal);
        leg.position.set(x, 0.38, z);
        leg.castShadow = true;
        group.add(leg);
      }
    }
    for (const x of [-1.85, 1.85]) {
      const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 18), new THREE.MeshStandardMaterial({ color: 0xb74838, roughness: 0.48 }));
      paddle.position.set(x, 0.19, -0.9);
      paddle.rotation.x = Math.PI / 2;
      paddle.castShadow = true;
      group.add(paddle);
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addWasteBasket(position: Vec2): void {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 0.82 }));
    body.position.set(position.x, 0.45, position.z);
    body.castShadow = true;
    this.scene.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 12), this.materials.metal);
    lid.position.set(position.x, 0.94, position.z);
    lid.castShadow = true;
    this.scene.add(lid);
  }

  private addDrinkingFountain(position: Vec2): void {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.15, 12), new THREE.MeshStandardMaterial({ color: 0x496e76, roughness: 0.58 }));
    post.position.y = 0.58;
    post.castShadow = true;
    group.add(post);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.32, 0.18, 16), this.materials.metal);
    basin.position.set(0, 1.12, -0.22);
    basin.castShadow = true;
    group.add(basin);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.32), this.materials.metal);
    spout.position.set(0, 1.28, -0.52);
    spout.castShadow = true;
    group.add(spout);
    const glow = new THREE.PointLight(0x5fc6d6, 0.45, 9);
    glow.position.set(0, 1.25, -0.45);
    group.add(glow);
    group.position.set(position.x, 0, position.z);
    group.rotation.y = this.angleFromPoint(position);
    this.scene.add(group);
  }

  private addBikeRack(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    for (const x of [-0.72, 0, 0.72]) {
      const rack = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 8, 18), this.materials.metal);
      rack.position.set(x, 0.46, 0);
      rack.rotation.x = Math.PI / 2;
      rack.castShadow = true;
      group.add(rack);
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addSupplyCrate(position: Vec2, angle: number): void {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.95), new THREE.MeshStandardMaterial({ color: 0x80603b, roughness: 0.76 }));
    crate.position.set(position.x, 0.38, position.z);
    crate.rotation.y = angle;
    crate.castShadow = true;
    crate.receiveShadow = true;
    this.scene.add(crate);
  }

  private addToiletSign(position: Vec2, angle: number): void {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.4, 8), this.materials.metal);
    post.position.y = 0.7;
    post.castShadow = true;
    group.add(post);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0x2e6c79 }));
    sign.position.y = 1.48;
    group.add(sign);
    group.position.set(position.x, 0, position.z);
    group.rotation.y = angle;
    this.scene.add(group);
  }

  private addAmenityHalo(position: Vec2, color: number, radius: number): void {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.022, 8, 26),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32 })
    );
    halo.position.set(position.x, 0.12, position.z);
    halo.rotation.x = Math.PI / 2;
    this.scene.add(halo);
  }

  private angleFromId(id: string): number {
    const value = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return (value % 360) * THREE.MathUtils.DEG2RAD;
  }

  private angleFromPoint(position: Vec2): number {
    return Math.atan2(position.x, position.z);
  }

  private addRotunda(position: Vec2): void {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.45, 24), this.materials.path);
    base.position.y = 0.22;
    group.add(base);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 4.6, 10), new THREE.MeshStandardMaterial({ color: 0xe0d0aa, roughness: 0.55 }));
      column.position.set(Math.cos(angle) * 4.2, 2.55, Math.sin(angle) * 4.2);
      column.castShadow = true;
      group.add(column);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.7, 2.4, 24), new THREE.MeshStandardMaterial({ color: 0x63715f, roughness: 0.72 }));
    roof.position.y = 5.65;
    roof.castShadow = true;
    group.add(roof);
    group.position.set(position.x, 0, position.z);
    this.scene.add(group);
    this.addLabel("Rotunda", position, 7);
  }

  private addMemorial(landmark: Landmark): void {
    const position = landmark.position;
    if (!position) return;
    if (landmark.id === "queen-victoria-plinth") {
      this.addQueenVictoriaPlinth(position);
      return;
    }
    if (landmark.id === "sportsmans-war-memorial") {
      this.addSportsmansMemorial(position);
      return;
    }
    this.addCookMemorialSite(position);
  }

  private addQueenVictoriaPlinth(position: Vec2): void {
    const bed = new THREE.Mesh(new THREE.CircleGeometry(5.7, 40), new THREE.MeshStandardMaterial({ color: 0x4e693f, roughness: 0.96 }));
    bed.position.set(position.x, 0.11, position.z);
    bed.rotation.x = -Math.PI / 2;
    bed.receiveShadow = true;
    this.scene.add(bed);

    const stone = new THREE.MeshStandardMaterial({ color: 0xb8ad91, roughness: 0.72 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.55, 2.9), stone);
    base.position.set(position.x, 0.38, position.z);
    base.castShadow = true;
    base.receiveShadow = true;
    this.scene.add(base);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.45, 2.15), stone);
    plinth.position.set(position.x, 1.35, position.z);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    this.scene.add(plinth);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.28, 2.55), stone);
    cap.position.set(position.x, 2.22, position.z);
    cap.castShadow = true;
    this.scene.add(cap);

    const sculpture = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x191c1a, metalness: 0.4, roughness: 0.38 });
    const ledMaterial = new THREE.MeshBasicMaterial({ color: 0xe04f3e });
    const column = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.65, 0.28), frameMaterial);
    column.position.y = 0.85;
    column.castShadow = true;
    sculpture.add(column);
    for (let row = 0; row < 3; row += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.035), ledMaterial);
      bar.position.set(0, 1.28 - row * 0.34, -0.165);
      sculpture.add(bar);
    }
    sculpture.position.set(position.x, 2.36, position.z);
    sculpture.rotation.y = -0.45;
    this.scene.add(sculpture);
    this.addLabel("Queen Victoria plinth", position, 5.2);
  }

  private addSportsmansMemorial(position: Vec2): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0xd0c2a2, roughness: 0.68 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5d2d, metalness: 0.35, roughness: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.35, 2.2), stone);
    base.position.set(position.x, 0.22, position.z);
    base.castShadow = true;
    this.scene.add(base);
    for (const x of [-1.25, 1.25]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.6, 10), stone);
      column.position.set(position.x + x, 1.5, position.z);
      column.castShadow = true;
      this.scene.add(column);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.28, 0.38), stone);
    lintel.position.set(position.x, 2.88, position.z);
    lintel.castShadow = true;
    this.scene.add(lintel);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.4, 0.12), bronze);
    panel.position.set(position.x, 1.45, position.z - 0.16);
    panel.castShadow = true;
    this.scene.add(panel);
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 24), bronze);
    wreath.position.set(position.x, 2.15, position.z - 0.24);
    this.scene.add(wreath);
    this.addLabel("Sportsman's Memorial", position, 4.5);
  }

  private addCookMemorialSite(position: Vec2): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0xaea58e, roughness: 0.78 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x39403c, metalness: 0.25, roughness: 0.46 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.95, 0.22, 18), stone);
    pad.position.set(position.x, 0.12, position.z);
    pad.castShadow = true;
    pad.receiveShadow = true;
    this.scene.add(pad);
    const remnant = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.38, 0.72), stone);
    remnant.position.set(position.x, 0.48, position.z);
    remnant.rotation.y = 0.35;
    remnant.castShadow = true;
    this.scene.add(remnant);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.48), this.materials.metal);
    plaque.position.set(position.x + 0.08, 0.71, position.z - 0.08);
    plaque.rotation.set(-0.22, 0.35, 0);
    this.scene.add(plaque);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), metal);
      bollard.position.set(position.x + Math.cos(angle) * 2.4, 0.45, position.z + Math.sin(angle) * 2.4);
      bollard.castShadow = true;
      this.scene.add(bollard);
    }
    this.addLabel("Cook memorial site", position, 3.2);
  }

  private addBoundaryFence(): void {
    this.addPerimeterStreetBand();
    const gaps = this.parkEntrances().map((entrance) => ({
      position: entrance.position,
      radius: entrance.width + 1.9
    }));
    this.addFenceAround(this.level.boundary, 1.4, 0x657264, gaps);
  }

  private parkEntrances(): Array<{ position: Vec2; angle: number; width: number; sign: boolean }> {
    return [
      { position: geoToWorld({ lat: -37.78956, lon: 144.98011 }), angle: -0.22, width: 5.2, sign: false },
      { position: geoToWorld({ lat: -37.78735, lon: 144.98554 }), angle: 2.55, width: 4.8, sign: true },
      { position: geoToWorld({ lat: -37.78572, lon: 144.98228 }), angle: 0.32, width: 4.8, sign: false },
      { position: geoToWorld({ lat: -37.78855, lon: 144.98505 }), angle: 2.3, width: 4.6, sign: false }
    ];
  }

  private addParkEntranceDetails(): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0xb6aa8d, roughness: 0.74 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x202622, metalness: 0.45, roughness: 0.42 });
    const entrances = this.parkEntrances();

    for (const entrance of entrances) {
      const tangent = new THREE.Vector3(Math.cos(entrance.angle), 0, Math.sin(entrance.angle));
      const normal = new THREE.Vector3(-Math.sin(entrance.angle), 0, Math.cos(entrance.angle));
      for (const side of [-1, 1]) {
        const pillarPosition = new THREE.Vector3(entrance.position.x, 0, entrance.position.z).addScaledVector(tangent, side * entrance.width);
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.55, 0.46), stone);
        pillar.position.set(pillarPosition.x, 0.78, pillarPosition.z);
        pillar.castShadow = true;
        this.scene.add(pillar);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), stone);
        cap.position.set(pillarPosition.x, 1.68, pillarPosition.z);
        cap.castShadow = true;
        this.scene.add(cap);
      }

      for (let index = -3; index <= 3; index += 1) {
        if (Math.abs(index) < 1) continue;
        const bollardPosition = new THREE.Vector3(entrance.position.x, 0, entrance.position.z)
          .addScaledVector(tangent, index * 1.35)
          .addScaledVector(normal, -1.8);
        const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.74, 8), iron);
        bollard.position.set(bollardPosition.x, 0.37, bollardPosition.z);
        bollard.castShadow = true;
        this.scene.add(bollard);
      }

      if (entrance.sign) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.54, 0.12), new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 0.68 }));
        sign.position.set(entrance.position.x, 1.35, entrance.position.z);
        sign.rotation.y = -entrance.angle;
        sign.castShadow = true;
        this.scene.add(sign);
        this.addLabel("Edinburgh Gardens", entrance.position, 3.4);
      }
    }
  }

  private addPerimeterStreetBand(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0x252a26, roughness: 0.88 });
    for (let i = 0; i < this.level.boundary.length; i += 1) {
      const a = this.level.boundary[i];
      const b = this.level.boundary[(i + 1) % this.level.boundary.length];
      const segmentLength = distance(a, b);
      if (segmentLength < 3) continue;
      const street = new THREE.Mesh(new THREE.BoxGeometry(segmentLength + 1.5, 0.035, 7.4), material);
      street.position.set((a.x + b.x) / 2, 0.018, (a.z + b.z) / 2);
      street.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      street.receiveShadow = true;
      this.scene.add(street);
    }
  }

  private addTrees(): void {
    this.renderedTreeCount = 0;
    const placed: Vec2[] = [];

    this.level.significantTrees
      .filter((tree) => pointInPolygon(tree.position, this.level.boundary))
      .forEach((tree, index) => {
        this.addSignificantTree(tree, index);
        placed.push(tree.position);
        this.renderedTreeCount += 1;
      });

    this.level.treePoints.filter((point) => pointInPolygon(point, this.level.boundary)).forEach((point, index) => {
      if (this.isNearExistingTree(point, placed, 3.5)) {
        return;
      }
      this.addRealisticTree(point, index, "generic");
      placed.push(point);
      this.renderedTreeCount += 1;
    });

    this.addTreeRows(placed);
  }

  private addTreeRows(placed: Vec2[]): void {
    for (const [rowIndex, line] of this.level.treeLines.entries()) {
      for (let index = 0; index < line.length; index += 1) {
        const point = line[index];
        const previous = line[Math.max(0, index - 1)];
        const next = line[Math.min(line.length - 1, index + 1)];
        const dx = next.x - previous.x;
        const dz = next.z - previous.z;
        const length = Math.hypot(dx, dz) || 1;
        const normal = { x: -dz / length, z: dx / length };
        const offset = rowIndex === 1 ? 6.6 : rowIndex === 2 ? 5.4 : 6.1;

        for (const side of [-1, 1]) {
          const rowPoint = {
            x: point.x + normal.x * offset * side,
            z: point.z + normal.z * offset * side
          };
          if (!pointInPolygon(rowPoint, this.level.boundary) || this.isNearExistingTree(rowPoint, placed, 5.4)) {
            continue;
          }
          this.addRealisticTree(rowPoint, this.renderedTreeCount + rowIndex * 100 + index, "elm");
          placed.push(rowPoint);
          this.renderedTreeCount += 1;
        }
      }
    }
  }

  private isNearExistingTree(point: Vec2, placed: Vec2[], minDistance: number): boolean {
    return placed.some((candidate) => distance(point, candidate) < minDistance);
  }

  private addSignificantTree(tree: SignificantTreePoint, index: number): void {
    const genus = tree.genus.toLowerCase();
    const profile: TreeProfile = genus.includes("eucalyptus") ? "gum" : genus.includes("quercus") ? "oak" : genus.includes("ulmus") ? "elm" : "generic";
    this.addRealisticTree(tree.position, index, profile, tree);
  }

  private addRealisticTree(point: Vec2, index: number, profile: TreeProfile, significant?: SignificantTreePoint): void {
    const group = new THREE.Group();
    const heritageScale = significant ? THREE.MathUtils.clamp(significant.height / 20, 0.72, 1.45) : 1;
    const scale = this.rng.range(0.9, 1.35) * heritageScale * TREE_SCALE_MULTIPLIER;
    const trunkHeight =
      profile === "gum"
        ? this.rng.range(6.8, 9.8) * scale
        : profile === "oak"
          ? this.rng.range(4.5, 6.8) * scale
          : this.rng.range(5.2, 8.4) * scale;
    const trunkRadius = this.rng.range(0.3, 0.54) * scale * (significant ? THREE.MathUtils.clamp(significant.dbh / 95, 0.8, 1.45) : 1);
    const baseTrunkColor = profile === "gum" ? 0x746a58 : profile === "oak" ? 0x4b3829 : 0x58432e;
    const baseLeafColor = profile === "gum" ? 0x6f806d : profile === "oak" ? 0x365636 : profile === "elm" ? 0x4d6b38 : 0x4f6f3e;
    const trunkColor = new THREE.Color(baseTrunkColor).offsetHSL(this.rng.range(-0.02, 0.03), this.rng.range(-0.06, 0.06), this.rng.range(-0.08, 0.08));
    const leafColor = new THREE.Color(baseLeafColor).offsetHSL(this.rng.range(-0.025, 0.025), this.rng.range(-0.08, 0.06), this.rng.range(-0.08, 0.05));
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.92 });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.96 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkRadius * 0.72, trunkRadius, trunkHeight, 8), trunkMaterial);
    trunk.position.y = trunkHeight / 2;
    trunk.rotation.z = this.rng.range(-0.05, 0.05);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    const litter = new THREE.Mesh(new THREE.CircleGeometry(trunkRadius * this.rng.range(5.0, 7.8), 18), this.materials.leafLitter);
    litter.position.y = 0.032;
    litter.rotation.x = -Math.PI / 2;
    litter.scale.set(this.rng.range(1, 1.5), this.rng.range(0.65, 1.05), 1);
    litter.receiveShadow = true;
    group.add(litter);

    for (let rootIndex = 0; rootIndex < 5; rootIndex += 1) {
      const angle = (rootIndex / 5) * Math.PI * 2 + this.rng.range(-0.22, 0.22);
      const length = trunkRadius * this.rng.range(2.6, 4.4);
      const root = new THREE.Mesh(new THREE.BoxGeometry(length, trunkRadius * 0.22, trunkRadius * 0.38), trunkMaterial);
      root.position.set(Math.cos(angle) * length * 0.38, trunkRadius * 0.08, Math.sin(angle) * length * 0.38);
      root.rotation.y = -angle;
      root.castShadow = true;
      root.receiveShadow = true;
      group.add(root);
    }

    const branchCount = profile === "gum" ? 5 : profile === "oak" ? 6 : 5;
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const angle = (branchIndex / branchCount) * Math.PI * 2 + this.rng.range(-0.25, 0.25);
      const start = new THREE.Vector3(0, trunkHeight * this.rng.range(0.55, 0.78), 0);
      const end = new THREE.Vector3(
        Math.cos(angle) * this.rng.range(profile === "gum" ? 1.0 : 1.35, profile === "oak" ? 3.2 : 2.6) * scale,
        trunkHeight * this.rng.range(profile === "gum" ? 0.72 : 0.68, 0.96),
        Math.sin(angle) * this.rng.range(profile === "gum" ? 1.0 : 1.35, profile === "oak" ? 3.2 : 2.6) * scale
      );
      group.add(this.createBranch(start, end, trunkRadius * this.rng.range(0.28, 0.42), trunkMaterial));
    }

    const lobeCount = profile === "gum" ? 5 : profile === "oak" ? 7 : 6;
    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
      const angle = (lobeIndex / lobeCount) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(this.rng.range(profile === "gum" ? 1.35 : 1.65, profile === "oak" ? 2.75 : 2.55) * scale, 2), leafMaterial);
      canopy.position.set(
        Math.cos(angle) * this.rng.range(profile === "gum" ? 0.65 : 0.9, profile === "oak" ? 2.8 : 2.25) * scale,
        trunkHeight + this.rng.range(profile === "gum" ? -0.45 : 0.05, profile === "oak" ? 1.0 : 1.45) * scale,
        Math.sin(angle) * this.rng.range(profile === "gum" ? 0.65 : 0.9, profile === "oak" ? 2.8 : 2.25) * scale
      );
      canopy.scale.set(
        this.rng.range(profile === "gum" ? 0.85 : 1.05, profile === "oak" ? 1.75 : 1.55),
        this.rng.range(profile === "gum" ? 1.05 : 0.68, profile === "oak" ? 0.9 : 1.08),
        this.rng.range(profile === "gum" ? 0.85 : 1.05, profile === "oak" ? 1.75 : 1.55)
      );
      canopy.rotation.set(this.rng.range(-0.2, 0.2), this.rng.range(0, Math.PI), this.rng.range(-0.2, 0.2));
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      group.add(canopy);
    }

    if (profile === "gum") {
      const palePatch = new THREE.Mesh(new THREE.CylinderGeometry(trunkRadius * 0.74, trunkRadius * 0.88, trunkHeight * 0.38, 8), new THREE.MeshStandardMaterial({ color: 0xb9aa8e, roughness: 0.9 }));
      palePatch.position.y = trunkHeight * 0.52;
      palePatch.rotation.z = this.rng.range(-0.05, 0.05);
      palePatch.castShadow = true;
      group.add(palePatch);
    }

    group.position.set(point.x, 0, point.z);
    group.rotation.y = this.rng.range(0, Math.PI * 2);
    group.userData.treeIndex = index;
    group.userData.treeSource = significant ? "yarra-significant" : "osm";
    group.userData.treeSpecies = significant?.commonName ?? "Mapped tree";
    this.scene.add(group);
  }

  private createBranch(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius, length, 6), material);
    branch.position.copy(start).add(end).multiplyScalar(0.5);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    branch.castShadow = true;
    return branch;
  }

  private createUpgradeStations(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xd0a343, emissive: 0x392509, emissiveIntensity: 0.4, roughness: 0.55 });
    for (const station of this.level.upgradeStations) {
      const group = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.8), material);
      crate.position.y = 0.75;
      crate.castShadow = true;
      group.add(crate);
      const lamp = new THREE.PointLight(0xd5a948, 1.2, 18);
      lamp.position.y = 2.4;
      group.add(lamp);
      group.position.set(station.position.x, 0, station.position.z);
      this.scene.add(group);
    }
  }

  private rebuildViewWeapon(): void {
    this.weaponModel.clear();
    const weapon = this.createWeaponMesh(this.loadout.weaponId, true);
    weapon.position.set(0.42, -0.42, -0.78);
    weapon.rotation.set(0.03, -0.08, 0.02);
    this.weaponModel.add(weapon);

    const flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.55, 9),
      new THREE.MeshBasicMaterial({ color: 0xf2c86a, transparent: true, opacity: 0.9 })
    );
    flash.position.set(0.5, -0.3, -1.28);
    flash.rotation.x = -Math.PI / 2;
    flash.visible = false;
    this.weaponModel.add(flash);
    this.muzzleFlash = flash;

    const light = new THREE.PointLight(0xf2b85b, 2.6, 10);
    light.position.set(0.5, -0.3, -1.12);
    light.visible = false;
    this.weaponModel.add(light);
    this.muzzleLight = light;
  }

  private updateScope(dt: number, now: number): void {
    const stats = getWeaponStats(this.loadout);
    const wantsScope = this.state === "playing" && this.aimHeld && stats.scopeZoom > 1.05 && this.loadout.reloadingUntil <= now;
    const target = wantsScope ? 1 : 0;
    const t = 1 - Math.pow(0.0008, dt);
    this.scopeAmount += (target - this.scopeAmount) * t;
    if (this.scopeAmount < 0.01) {
      this.scopeAmount = 0;
    }

    const zoom = THREE.MathUtils.lerp(1, stats.scopeZoom, this.scopeAmount);
    const nextFov = THREE.MathUtils.clamp(BASE_CAMERA_FOV / zoom, 24, BASE_CAMERA_FOV);
    if (Math.abs(this.camera.fov - nextFov) > 0.02) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.root.classList.toggle("is-scoped", this.scopeAmount > 0.45);
  }

  private updateWeaponModel(dt: number): void {
    const stats = getWeaponStats(this.loadout);
    this.recoil = Math.max(0, this.recoil - dt * (3.4 / Math.max(0.35, stats.recoilKick)));
    this.recoilYaw *= Math.pow(0.02, dt);
    this.shotBloom = Math.max(0, this.shotBloom - dt * (this.loadout.weaponId === "smg" ? 0.018 : 0.028));
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    if (this.muzzleFlash) {
      this.muzzleFlash.visible = this.muzzleTimer > 0;
      this.muzzleFlash.scale.setScalar(0.85 + this.rng.next() * 0.55);
      this.muzzleFlash.rotation.z += dt * 21;
    }
    if (this.muzzleLight) {
      this.muzzleLight.visible = this.muzzleTimer > 0;
      this.muzzleLight.intensity = 2.2 + this.rng.next() * 2.8;
    }
    const bob = Math.min(1, this.player.velocity.length() / 18);
    const t = this.frame * 0.08;
    const reloadPose = this.loadout.reloadingUntil > performance.now() / 1000 ? 1 : 0;
    this.weaponModel.position.set(
      Math.sin(t) * 0.018 * bob + this.scopeAmount * 0.18,
      Math.abs(Math.cos(t)) * -0.018 * bob - reloadPose * 0.16 - this.scopeAmount * 0.36,
      this.recoil * 0.07 + reloadPose * 0.06 + this.scopeAmount * 0.08
    );
    this.weaponModel.rotation.set(
      this.recoil * 0.05 + reloadPose * 0.22 - this.scopeAmount * 0.04,
      -this.recoilYaw * 0.01 - reloadPose * 0.12 - this.scopeAmount * 0.18,
      Math.sin(t * 0.5) * 0.015 * bob + reloadPose * 0.16 - this.scopeAmount * 0.08
    );
    this.weaponModel.scale.setScalar(THREE.MathUtils.lerp(1, 0.72, this.scopeAmount));
  }

  private createWeaponMesh(weaponId: WeaponId, firstPerson = false): THREE.Group {
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

  private createWeaponDropMesh(weaponId: WeaponId): THREE.Object3D {
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

  private spawnShellCasing(): void {
    const casing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0xc69a4e, metalness: 0.48, roughness: 0.38 })
    );
    const localPosition = new THREE.Vector3(0.48, -0.32, -0.62);
    casing.position.copy(this.camera.localToWorld(localPosition));
    casing.rotation.set(this.rng.range(0, Math.PI), this.rng.range(0, Math.PI), this.rng.range(0, Math.PI));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
    const velocity = right.multiplyScalar(this.rng.range(1.8, 3.6)).add(up.multiplyScalar(this.rng.range(1.4, 2.6))).add(back.multiplyScalar(0.8));
    this.scene.add(casing);
    this.shells.push({ mesh: casing, velocity, ttl: 1.6 });
  }

  private spawnMuzzleSmoke(): void {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x9a978d, transparent: true, opacity: 0.28, depthWrite: false })
    );
    const localPosition = new THREE.Vector3(0.5, -0.28, -1.24);
    puff.position.copy(this.camera.localToWorld(localPosition));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const velocity = forward
      .multiplyScalar(this.rng.range(0.9, 1.6))
      .add(up.multiplyScalar(this.rng.range(0.15, 0.45)))
      .add(side.multiplyScalar(this.rng.range(-0.28, 0.28)));
    this.scene.add(puff);
    this.smokePuffs.push({ mesh: puff, velocity, ttl: 0.9, maxTtl: 0.9 });
  }

  private updateShells(dt: number): void {
    for (const shell of [...this.shells]) {
      shell.ttl -= dt;
      shell.velocity.y -= 8.8 * dt;
      shell.mesh.position.addScaledVector(shell.velocity, dt);
      shell.mesh.rotation.x += dt * 12;
      shell.mesh.rotation.z += dt * 8;
      if (shell.mesh.position.y < 0.08) {
        shell.mesh.position.y = 0.08;
        shell.velocity.multiplyScalar(0.38);
      }
      if (shell.ttl <= 0) {
        this.scene.remove(shell.mesh);
        this.shells = this.shells.filter((candidate) => candidate !== shell);
      }
    }
  }

  private updateSmokePuffs(dt: number): void {
    for (const puff of [...this.smokePuffs]) {
      puff.ttl -= dt;
      puff.velocity.y += dt * 0.18;
      puff.mesh.position.addScaledVector(puff.velocity, dt);
      puff.mesh.scale.addScalar(dt * 0.8);
      const material = puff.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.28 * (puff.ttl / puff.maxTtl));
      if (puff.ttl <= 0) {
        this.scene.remove(puff.mesh);
        this.smokePuffs = this.smokePuffs.filter((candidate) => candidate !== puff);
      }
    }
  }

  private createZombieMesh(type: ZombieType): THREE.Group {
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

  private animateZombie(zombie: Zombie, now: number, distanceToPlayer: number): void {
    const arms = zombie.mesh.userData.arms as THREE.Mesh[] | undefined;
    const head = zombie.mesh.userData.head as THREE.Mesh | undefined;
    const pace = zombie.type === "sprinter" ? 10 : zombie.type === "bloater" ? 4.2 : 6.8;
    const swing = Math.sin(now * pace + zombie.walkOffset);
    if (arms) {
      arms.forEach((arm, index) => {
        const side = index === 0 ? -1 : 1;
        arm.rotation.x = -0.95 + swing * 0.18 * side;
        arm.rotation.z = side * (0.28 + Math.max(0, 12 - distanceToPlayer) * 0.018);
      });
    }
    if (head) {
      head.rotation.y = Math.sin(now * 2.6 + zombie.walkOffset) * 0.18;
      head.rotation.z = (zombie.type === "sprinter" ? -0.12 : 0.1) + Math.cos(now * 2.1 + zombie.walkOffset) * 0.08;
    }
    zombie.mesh.scale.y = 1 + Math.sin(now * pace * 0.5 + zombie.walkOffset) * (zombie.type === "bloater" ? 0.035 : 0.02);
  }

  private createPickupMesh(type: Pickup["type"]): THREE.Object3D {
    const color = type === "ammo" ? 0xd4aa4c : type === "health" ? 0xc84138 : 0x9ebf86;
    const geometry =
      type === "ammo" ? new THREE.BoxGeometry(1.1, 0.7, 1.6) : type === "health" ? new THREE.OctahedronGeometry(0.9) : new THREE.DodecahedronGeometry(0.75);
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.55 }));
  }

  private addTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const material = new THREE.LineBasicMaterial({ color: 0xf0c96a, transparent: true, opacity: 0.8 });
    const geometry = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mesh = new THREE.Line(geometry, material);
    this.scene.add(mesh);
    this.tracers.push({ mesh, ttl: 0.08 });
  }

  private updateTracers(dt: number): void {
    for (const tracer of [...this.tracers]) {
      tracer.ttl -= dt;
      const material = tracer.mesh.material as THREE.LineBasicMaterial;
      material.opacity = Math.max(0, tracer.ttl / 0.08);
      if (tracer.ttl <= 0) {
        this.scene.remove(tracer.mesh);
        this.tracers = this.tracers.filter((candidate) => candidate !== tracer);
      }
    }
  }

  private createHitSpark(position: THREE.Vector3): void {
    const spark = new THREE.PointLight(0xf0c96a, 3.4, 12);
    spark.position.copy(position);
    this.scene.add(spark);
    window.setTimeout(() => this.scene.remove(spark), 65);
  }

  private addLabel(text: string, position: Vec2, height: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(7, 12, 9, 0.72)";
    ctx.fillRect(0, 24, 512, 76);
    ctx.strokeStyle = "rgba(214, 185, 111, 0.8)";
    ctx.strokeRect(8, 30, 496, 64);
    ctx.fillStyle = "#e2d4aa";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.set(position.x, height, position.z);
    sprite.scale.set(18, 4.5, 1);
    this.scene.add(sprite);
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number): void {
    if (!this.audio) return;
    const oscillator = this.audio.createOscillator();
    const gain = this.audio.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gain.gain.setValueAtTime(gainValue, this.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.audio.destination);
    oscillator.start();
    oscillator.stop(this.audio.currentTime + duration);
  }
}
