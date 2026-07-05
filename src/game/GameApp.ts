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
import { resolveObstacle, shouldBypassObstacle as shouldBypassCollisionObstacle } from "./collision";
import { clampToPolygon, distance, distanceToSegment } from "./geo";
import { createLevelData } from "./levelData";
import { chooseZombiePickup, chooseZombieWeaponDrop, searchAmenityLoot } from "./loot";
import { movementNoiseKind, movementNoiseMultiplier, NoiseSystem } from "./noise";
import {
  claimObjectiveReward,
  createActiveObjective,
  createObjectiveCycle,
  updateObjectiveProgress,
  type ActiveObjective,
  type ObjectiveDefinition
} from "./objectives";
import { SeededRandom } from "./random";
import { AtmosphereSystem } from "./rendering/AtmosphereSystem";
import { MeshFactory } from "./rendering/MeshFactory";
import { WorldBuilder, type GameMaterials } from "./rendering/WorldBuilder";
import { createGameMaterials } from "./rendering/materials";
import { freezeStaticScene } from "./rendering/staticScene";
import type { GameStateName, GameTestApi, HitZone, Pickup, ShellCasing, SmokePuff, Snapshot, Tracer, WavePhase, WeaponDrop, Zombie } from "./state";
import { installGameTestDriver, uninstallGameTestDriver } from "./testing/GameTestDriver";
import { TerrainSampler } from "./terrain";
import {
  isLineOfSightBlocked as isLineOfSightBlockedByContext,
  isPointVisibleToPlayer as isPointVisibleToPlayerByContext
} from "./visibility";
import { createZombieSpawn, getWaveConfig, type ZombieSpawn, type ZombieType } from "./waves";
import { zombieProfile } from "./zombieProfiles";
import { HudController } from "./ui/HudController";
import { MiniMapRenderer } from "./ui/MiniMapRenderer";
import type {
  AmenityPoint,
  InteractableFixture,
  LevelData,
  UpgradeStation,
  Vec2,
  WeaponSpawn
} from "./types";

const PLAYER_RADIUS = 2.2;
const PLAYER_HEIGHT = 1.72;
const BASE_CAMERA_FOV = 74;
const START_POSITION = new THREE.Vector3(35, 0, 42);
const WALK_SPEED = 7.6;
const SPRINT_SPEED = 11.4;
const CROUCH_SPEED = 3.9;
const INTERMISSION_SECONDS = 24;

export class GameApp {
  private readonly root: HTMLElement;
  private readonly level: LevelData;
  private readonly terrain: TerrainSampler;
  private readonly objectiveCycle: ObjectiveDefinition[];
  private readonly noise = new NoiseSystem();
  private readonly rng = new SeededRandom(0xed1b97);
  private readonly smokeMode = new URLSearchParams(window.location.search).has("smoke");
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private canvas!: HTMLCanvasElement;
  private hud!: HudController;
  private miniMap!: MiniMapRenderer;
  private meshFactory!: MeshFactory;
  private world!: WorldBuilder;
  private atmosphere!: AtmosphereSystem;
  private audio: AudioContext | null = null;
  private state: GameStateName = "ready";
  private testApi: GameTestApi | null = null;
  private readonly events = new AbortController();
  private animationFrameId: number | null = null;
  private disposed = false;
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
    crouching: false,
    crouchAmount: 0,
    activeFixtureId: null as string | null
  };
  private keys = new Set<string>();
  private loadout: Loadout = createInitialLoadout();
  private lastShotAt = 0;
  private wave = 1;
  private wavePhase: WavePhase = "active";
  private intermissionTimer = 0;
  private activeObjective: ActiveObjective | null = null;
  private objectiveIndex = 0;
  private objectiveNoiseTimer = 0;
  private movementNoiseTimer = 0;
  private elevatedNoiseTimer = 0;
  private testCrouchOverride: boolean | null = null;
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
  private materials!: GameMaterials;

  constructor(root: HTMLElement) {
    this.root = root;
    this.level = createLevelData();
    this.terrain = new TerrainSampler(this.level);
    this.objectiveCycle = createObjectiveCycle(this.level);
    this.player.position.set(START_POSITION.x, this.groundY({ x: START_POSITION.x, z: START_POSITION.z }), START_POSITION.z);
  }

  init(): void {
    this.hud = HudController.mount(this.root);
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
    this.camera.userData.dynamic = true;
    this.weaponModel.userData.dynamic = true;
    this.scene = new THREE.Scene();
    this.atmosphere = new AtmosphereSystem(this.scene, this.rng, this.smokeMode);
    this.materials = createGameMaterials(this.rng);
    this.meshFactory = new MeshFactory(this.materials);
    this.miniMap = new MiniMapRenderer(this.hud.miniMap, this.level);
    this.scene.add(this.camera);
    this.camera.add(this.weaponModel);
    this.rebuildViewWeapon();
    this.createWorld();
    this.world.createUpgradeStations();
    freezeStaticScene(this.scene, [this.camera, this.atmosphere.root]);
    this.spawnInitialWeapons();
    this.bindEvents();
    this.resize();
    this.startWave(1);
    this.updateHud();

    if (this.smokeMode) {
      this.start();
    }

    this.testApi = {
      ready: true,
      snapshot: () => this.snapshot(),
      testShoot: () => this.shoot(performance.now() / 1000, true),
      testUpgrade: (stationId?: string) => this.buyUpgrade(stationId),
      testSpawn: () => this.forceSpawnZombie(),
      testPickupWeapon: (weaponId?: WeaponId) => this.testPickupWeapon(weaponId),
      testScope: (weaponId?: WeaponId) => this.testScope(weaponId),
      testInteract: (fixtureId?: string) => this.testInteract(fixtureId),
      testUseAmenity: (kind?: AmenityPoint["kind"]) => this.testUseAmenity(kind),
      testMiniMapVisibility: () => this.testMiniMapVisibility(),
      testGrounding: () => this.testGrounding(),
      testZombieStates: () => this.testZombieStates(),
      testSetCrouching: (crouching: boolean) => this.testSetCrouching(crouching),
      testStartIntermission: () => this.testStartIntermission()
    };
    installGameTestDriver(this.testApi);

    this.animationFrameId = requestAnimationFrame((time) => this.tick(time));
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.events.abort();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.testApi) {
      uninstallGameTestDriver(this.testApi);
      this.testApi = null;
    }
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    if (this.audio && this.audio.state !== "closed") {
      void this.audio.close();
      this.audio = null;
    }

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) {
        geometries.add(mesh.geometry);
      }
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => materials.add(entry));
      } else if (material) {
        materials.add(material);
      }
    });
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          textures.add(value);
        }
      }
      material.dispose();
    }
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    this.renderer.dispose();
    this.root.innerHTML = "";
  }

  private bindEvents(): void {
    const { signal } = this.events;
    window.addEventListener("resize", () => this.resize(), { signal });
    document.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
    document.addEventListener("keydown", (event) => {
      this.keys.add(event.code);
      if (event.code === "KeyR") {
        this.aimHeld = false;
        this.loadout = startReload(this.loadout, performance.now() / 1000);
        if (this.loadout.reloadingUntil > 0) {
          this.noise.emit("reload", { x: this.player.position.x, z: this.player.position.z }, this.player.crouching ? 0.55 : 1);
        }
      }
      if (event.code === "KeyE") {
        this.handleInteract();
      }
      if (["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].includes(event.code)) {
        const index = Number(event.code.replace("Digit", "")) - 1;
        const weaponId = this.loadout.inventory[index];
        if (weaponId) {
          this.equipWeapon(weaponId);
        }
      }
      if (event.code === "Escape" && this.state === "playing") {
        document.exitPointerLock();
      }
    }, { signal });
    document.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal });
    document.addEventListener("mousemove", (event) => this.handleMouseMove(event), { signal });
    this.canvas.addEventListener("mousedown", (event) => {
      if (event.button === 2) {
        this.aimHeld = true;
        return;
      }
      if (event.button === 0) {
        this.shoot(performance.now() / 1000);
      }
    }, { signal });
    document.addEventListener("mouseup", (event) => {
      if (event.button === 2) {
        this.aimHeld = false;
      }
    }, { signal });
    this.hud.startButton.addEventListener("click", () => {
      this.start();
      this.canvas.requestPointerLock?.();
    }, { signal });
    this.hud.restartButton.addEventListener("click", () => this.restart(), { signal });
    document.addEventListener("pointerlockchange", () => {
      document.body.classList.toggle("is-locked", document.pointerLockElement === this.canvas);
    }, { signal });
  }

  private start(): void {
    this.state = "playing";
    this.hud.hideOverlay();
    if (!this.audio) {
      this.audio = new AudioContext();
    }
  }

  private restart(): void {
    this.player.position.set(START_POSITION.x, this.groundY({ x: START_POSITION.x, z: START_POSITION.z }), START_POSITION.z);
    this.player.health = 100;
    this.player.scrap = 70;
    this.player.kills = 0;
    this.player.height = 0;
    this.player.heightTarget = 0;
    this.player.crouching = false;
    this.player.crouchAmount = 0;
    this.player.activeFixtureId = null;
    this.player.yaw = -2.45;
    this.player.pitch = -0.08;
    this.loadout = createInitialLoadout();
    this.rebuildViewWeapon();
    this.wave = 1;
    this.wavePhase = "active";
    this.intermissionTimer = 0;
    this.activeObjective = null;
    this.objectiveIndex = 0;
    this.objectiveNoiseTimer = 0;
    this.movementNoiseTimer = 0;
    this.elevatedNoiseTimer = 0;
    this.testCrouchOverride = null;
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
    this.root.classList.remove("is-crouched");
    this.noise.clear();
    this.searchedAmenityIds.clear();
    this.hud.setRestartVisible(false);
    this.state = "playing";
    this.spawnInitialWeapons();
    this.startWave(1);
    this.updateHud();
  }

  private tick(time: number): void {
    if (this.disposed) {
      return;
    }
    const dt = Math.min(0.05, (time - this.lastFrameTime) / 1000);
    this.lastFrameTime = time;
    this.frame += 1;

    if (this.state === "playing") {
      this.update(dt, time / 1000);
    } else if (this.smokeMode) {
      this.camera.position.set(42, 42, 82);
      this.camera.lookAt(0, 0, 0);
    }

    this.atmosphere.update(dt, this.camera.position, time / 1000);
    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame((next) => this.tick(next));
  }

  private update(dt: number, now: number): void {
    this.loadout = finishReloadIfReady(this.loadout, now);
    this.noise.update(dt);
    this.updateCrouch(dt);
    this.updateMovement(dt);
    this.updateVerticalState(dt);
    this.updateElevatedNoise(dt);
    this.updateWavePacing(dt);
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

    if (this.player.health <= 0) {
      this.gameOver();
    }
  }

  private updateCrouch(dt: number): void {
    const inputCrouching =
      this.keys.has("KeyC") ||
      this.keys.has("ControlLeft") ||
      this.keys.has("ControlRight");
    this.player.crouching = this.testCrouchOverride ?? inputCrouching;
    const target = this.player.crouching ? 1 : 0;
    const t = 1 - Math.pow(0.0008, dt);
    this.player.crouchAmount += (target - this.player.crouchAmount) * t;
    if (this.player.crouchAmount < 0.01) this.player.crouchAmount = 0;
    this.root.classList.toggle("is-crouched", this.player.crouching);
  }

  private updateWavePacing(dt: number): void {
    if (this.wavePhase === "active") {
      if (this.zombies.length === 0 && this.spawnQueue.length === 0) {
        this.startIntermission();
      }
      return;
    }

    this.intermissionTimer = Math.max(0, this.intermissionTimer - dt);
    this.updateObjective(dt);
    if (this.intermissionTimer <= 0) {
      this.startWave(this.wave + 1);
    }
  }

  private startIntermission(): ActiveObjective | null {
    if (this.wavePhase === "intermission") {
      return this.activeObjective;
    }
    this.wavePhase = "intermission";
    this.intermissionTimer = INTERMISSION_SECONDS;
    const definition = this.objectiveCycle[this.objectiveIndex % this.objectiveCycle.length];
    this.objectiveIndex += 1;
    this.activeObjective = definition ? createActiveObjective(definition) : null;
    this.objectiveNoiseTimer = 0.4;
    this.flashStatus(this.activeObjective ? this.activeObjective.label : `Regroup before wave ${this.wave + 1}`);
    return this.activeObjective;
  }

  private updateObjective(dt: number): void {
    if (!this.activeObjective || this.activeObjective.completed) {
      return;
    }

    const previousProgress = this.activeObjective.progress;
    this.activeObjective = updateObjectiveProgress(this.activeObjective, { x: this.player.position.x, z: this.player.position.z }, dt);
    if (this.activeObjective.progress > previousProgress) {
      this.objectiveNoiseTimer -= dt;
      if (this.objectiveNoiseTimer <= 0) {
        this.noise.emit("objective", this.activeObjective.position, 0.72);
        this.objectiveNoiseTimer = 1.15;
      }
    }

    if (this.activeObjective.completed) {
      const reward = claimObjectiveReward(this.activeObjective, this.player.scrap, this.loadout);
      this.player.scrap = reward.scrap;
      this.loadout = reward.loadout;
      this.intermissionTimer = Math.min(this.intermissionTimer, 5);
      this.flashStatus(`${this.activeObjective.label} complete`);
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
      const sprinting = !this.player.crouching && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"));
      const speed = this.player.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
      this.player.velocity.copy(forward.multiplyScalar(input.z).add(right.multiplyScalar(input.x))).multiplyScalar(speed);
      this.emitMovementNoise(dt, sprinting);
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
      next = resolveObstacle(next, PLAYER_RADIUS, obstacle);
    }
    this.player.position.set(next.x, this.groundY(next), next.z);
  }

  private emitMovementNoise(dt: number, sprinting: boolean): void {
    this.movementNoiseTimer -= dt;
    if (this.movementNoiseTimer > 0) {
      return;
    }

    const speed = this.player.velocity.length();
    const kind = movementNoiseKind(speed, this.player.crouching, sprinting);
    if (!kind) {
      return;
    }

    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    this.noise.emit(kind, playerPoint, movementNoiseMultiplier(this.player.crouching, this.isNearPath(playerPoint)));
    this.movementNoiseTimer = this.player.crouching ? 0.82 : sprinting ? 0.28 : 0.46;
  }

  private isNearPath(point: Vec2): boolean {
    return this.level.paths.some((path) => {
      for (let index = 0; index < path.points.length - 1; index += 1) {
        if (distanceToSegment(point, path.points[index], path.points[index + 1]) <= path.width * 0.75) {
          return true;
        }
      }
      return false;
    });
  }

  private groundY(point: Vec2): number {
    return this.terrain.groundY(point);
  }

  private averageGroundY(points: readonly Vec2[]): number {
    return this.terrain.averageGroundY(points);
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
    this.camera.position.set(
      this.player.position.x,
      this.player.position.y + PLAYER_HEIGHT + this.player.height - this.player.crouchAmount * 0.58,
      this.player.position.z
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.player.yaw + this.recoilYaw * 0.006;
    this.camera.rotation.x = this.player.pitch - this.recoil * 0.012;
  }

  private startWave(wave: number): void {
    this.wave = wave;
    this.wavePhase = "active";
    this.intermissionTimer = 0;
    this.activeObjective = null;
    const config = getWaveConfig(wave);
    this.spawnQueue = Array.from({ length: config.total }, () => createZombieSpawn(config, this.level.spawnPoints, this.rng));
    this.spawnTimer = 0.4;
    this.flashStatus(`Wave ${wave}`);
  }

  private updateSpawns(dt: number): void {
    if (this.wavePhase !== "active" || this.spawnQueue.length === 0) {
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
    const mesh = this.meshFactory.createZombieMesh(spawn.type);
    const groundY = this.groundY(spawn.position);
    const position = new THREE.Vector3(spawn.position.x, groundY, spawn.position.z);
    mesh.position.copy(position);
    this.scene.add(mesh);
    const maxHealth = spawn.health;
    const profile = zombieProfile(spawn.type);
    const spawnPoint = { x: spawn.position.x, z: spawn.position.z };
    this.zombies.push({
      id: this.nextZombieId++,
      type: spawn.type,
      mesh,
      position,
      health: maxHealth,
      maxHealth,
      speed: spawn.speed,
      radius: profile.radius,
      reward: spawn.reward,
      attackCooldown: 0,
      walkOffset: this.rng.range(0, Math.PI * 2),
      aiState: "wander",
      target: this.chooseWanderTarget(spawnPoint, profile.radius),
      lastKnownPlayer: null,
      wanderTimer: this.rng.range(3.5, 8.5),
      staggerTimer: 0,
      screamCooldown: this.rng.range(2.5, 6)
    });
  }

  private updateZombies(dt: number, now: number): void {
    for (const zombie of this.zombies) {
      const profile = zombieProfile(zombie.type);
      const playerPoint = { x: this.player.position.x, z: this.player.position.z };
      const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
      const distanceToPlayer = distance(zombiePoint, playerPoint);
      const seesPlayer = this.canZombieSeePlayer(zombie, distanceToPlayer);
      const heardNoise = this.noise.strongestAt(zombiePoint, profile.hearingMultiplier);

      zombie.attackCooldown -= dt;
      zombie.staggerTimer = Math.max(0, zombie.staggerTimer - dt);
      zombie.screamCooldown = Math.max(0, zombie.screamCooldown - dt);
      zombie.wanderTimer = Math.max(0, zombie.wanderTimer - dt);
      const targetReached = zombie.target ? distance(zombiePoint, zombie.target) < (zombie.aiState === "wander" ? 3.8 : 2.8) : true;

      if (seesPlayer) {
        zombie.aiState = "chase";
        zombie.lastKnownPlayer = playerPoint;
        zombie.target = playerPoint;
      } else if (zombie.aiState === "chase" && zombie.lastKnownPlayer) {
        zombie.aiState = "investigate";
        zombie.target = zombie.lastKnownPlayer;
      } else if (heardNoise) {
        zombie.aiState = "investigate";
        zombie.target = { ...heardNoise.position };
      } else if (zombie.aiState === "investigate" && targetReached) {
        this.setZombieWanderTarget(zombie, zombiePoint);
      } else if (zombie.aiState === "wander" && (targetReached || zombie.wanderTimer <= 0)) {
        this.setZombieWanderTarget(zombie, zombiePoint);
      } else if (!zombie.target) {
        this.setZombieWanderTarget(zombie, zombiePoint);
      }

      if (zombie.type === "screamer" && zombie.aiState === "chase" && zombie.screamCooldown <= 0) {
        this.noise.emit("scream", zombiePoint);
        zombie.screamCooldown = 9 + this.rng.range(0, 4);
        this.playTone(118, 0.18, "sawtooth", 0.035);
      }

      const target = zombie.target;
      const toTarget = target
        ? this.scratchVector.set(target.x - zombie.position.x, 0, target.z - zombie.position.z)
        : this.scratchVector.set(0, 0, 0);
      const distanceToTarget = toTarget.length();
      if (distanceToTarget > 0.001) {
        toTarget.normalize();
      }
      const stateSpeed =
        zombie.aiState === "wander"
          ? zombie.type === "crawler"
            ? 0.42
            : 0.34
          : zombie.aiState === "investigate"
            ? 0.82
            : distanceToPlayer < 18
              ? 1.18
              : 1;
      const staggerScale = zombie.staggerTimer > 0 ? 0.24 : 1;
      const speed = zombie.speed * stateSpeed * staggerScale;
      const candidate = zombie.position.clone().addScaledVector(toTarget, speed * dt);
      let next = clampToPolygon({ x: candidate.x, z: candidate.z }, this.level.boundary, 2.5);
      for (const obstacle of this.level.obstacles) {
        next = resolveObstacle(next, zombie.radius, obstacle);
      }
      const groundY = this.groundY(next);
      zombie.position.set(next.x, groundY, next.z);
      if (distanceToTarget > 0.1) {
        zombie.mesh.rotation.y = Math.atan2(toTarget.x, toTarget.z);
      }
      zombie.mesh.position.set(next.x, groundY + (Math.sin(now * 7 + zombie.walkOffset) + 1) * 0.035, next.z);
      this.animateZombie(zombie, now, distanceToPlayer);
      if (this.player.height < 1.4 && distanceToPlayer < zombie.radius + PLAYER_RADIUS + 0.8 && zombie.attackCooldown <= 0) {
        this.player.health -= profile.attackDamage;
        zombie.attackCooldown = profile.attackCooldown;
        this.lastDamageAt = now;
        document.body.classList.add("hit");
        window.setTimeout(() => document.body.classList.remove("hit"), 120);
        this.playTone(90, 0.04, "sawtooth", 0.04);
      }
    }
  }

  private canZombieSeePlayer(zombie: Zombie, distanceToPlayer: number): boolean {
    const profile = zombieProfile(zombie.type);
    const crouchPenalty = this.player.crouching ? 0.56 : 1;
    const heightBonus = this.player.height > 1.4 ? 1.35 : 1;
    const sightRange = profile.sightRange * crouchPenalty * heightBonus;
    if (distanceToPlayer > sightRange) {
      return false;
    }
    const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    return !this.isLineOfSightBlocked(zombiePoint, playerPoint, PLAYER_RADIUS);
  }

  private setZombieWanderTarget(zombie: Zombie, origin: Vec2): void {
    zombie.aiState = "wander";
    zombie.lastKnownPlayer = null;
    zombie.target = this.chooseWanderTarget(origin, zombie.radius);
    zombie.wanderTimer = this.rng.range(3.5, 8.5);
  }

  private chooseWanderTarget(origin: Vec2, zombieRadius: number): Vec2 {
    let best = { ...origin };
    let bestDistance = 0;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(12, 42);
      let point = clampToPolygon(
        {
          x: origin.x + Math.cos(angle) * radius,
          z: origin.z + Math.sin(angle) * radius
        },
        this.level.boundary,
        4
      );
      for (const obstacle of this.level.obstacles) {
        point = resolveObstacle(point, zombieRadius + 0.2, obstacle);
      }

      const travelDistance = distance(origin, point);
      if (travelDistance > 6) {
        return point;
      }
      if (travelDistance > bestDistance) {
        best = point;
        bestDistance = travelDistance;
      }
    }

    if (bestDistance > 1) {
      return best;
    }

    const fallbackPoints = this.level.pickupPoints.length > 0 ? this.level.pickupPoints : this.level.spawnPoints;
    if (fallbackPoints.length === 0) {
      return { ...origin };
    }
    return clampToPolygon(this.rng.pick(fallbackPoints), this.level.boundary, 4);
  }

  private shoot(now: number, force = false): void {
    if (this.state !== "playing") {
      return;
    }
    const stats = getWeaponStats(this.loadout);
    if (!force && now - this.lastShotAt < stats.fireDelay) {
      return;
    }
    if (stats.kind === "melee") {
      this.swingMelee(now, stats);
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
    const crouchRecoil = this.player.crouching ? 0.7 : 1;
    const aimRecoil = THREE.MathUtils.lerp(1, stats.aimRecoilMultiplier, this.scopeAmount) * crouchRecoil;
    this.recoil = Math.min(1.75, this.recoil + stats.recoilKick * aimRecoil);
    this.recoilYaw += this.rng.range(-stats.recoilDrift, stats.recoilDrift) * aimRecoil;
    this.shotBloom = Math.min(stats.maxBloom, this.shotBloom + stats.bloomPerShot);
    this.noise.emit("gunshot", { x: this.player.position.x, z: this.player.position.z }, stats.noiseMultiplier * (this.player.crouching ? 0.96 : 1));
    this.muzzleTimer = 0.055;
    if (this.muzzleFlash) this.muzzleFlash.visible = true;
    if (this.muzzleLight) this.muzzleLight.visible = true;
    this.spawnShellCasing();
    this.spawnMuzzleSmoke();
    this.playTone(this.loadout.weaponId === "shotgun" ? 170 : 260 + this.rng.range(-20, 20), 0.055, "square", 0.05);

    const movementSpread = Math.min(1, this.player.velocity.length() / 22) * stats.movingSpread;
    const crouchSpread = this.player.crouching ? 0.64 : 1;
    const totalSpread = (stats.spread + movementSpread + this.shotBloom) * THREE.MathUtils.lerp(1, stats.aimSpreadMultiplier, this.scopeAmount) * crouchSpread;
    let registeredHit = false;
    for (let pellet = 0; pellet < stats.pellets; pellet += 1) {
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      direction.x += this.rng.range(-totalSpread, totalSpread);
      direction.y += this.rng.range(-totalSpread, totalSpread) * 0.55;
      direction.z += this.rng.range(-totalSpread, totalSpread);
      direction.normalize();
      const hits = this.findZombieHits(this.camera.position, direction, stats.range, stats.penetration);
      const endPoint = hits[0]?.point ?? this.camera.position.clone().addScaledVector(direction, stats.range);
      for (const hit of hits) {
        hit.zombie.health -= damageAtDistance(stats, hit.distance, hit.zone);
        const profile = zombieProfile(hit.zombie.type);
        hit.zombie.staggerTimer = Math.max(hit.zombie.staggerTimer, (stats.staggerPower + (hit.zone === "legs" ? 0.22 : 0)) / profile.staggerResistance);
        hit.zombie.aiState = "chase";
        hit.zombie.target = { x: this.player.position.x, z: this.player.position.z };
        hit.zombie.lastKnownPlayer = hit.zombie.target;
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

  private swingMelee(now: number, stats: ReturnType<typeof getWeaponStats>): void {
    this.lastShotAt = now;
    this.aimHeld = false;
    this.recoil = Math.min(1.25, this.recoil + stats.recoilKick);
    this.recoilYaw += this.rng.range(-stats.recoilDrift, stats.recoilDrift);
    this.noise.emit("melee", { x: this.player.position.x, z: this.player.position.z }, stats.noiseMultiplier * (this.player.crouching ? 0.7 : 1));
    this.playTone(this.loadout.weaponId === "machete" ? 210 : 280, 0.045, "triangle", 0.035);

    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const hits = this.findZombieHits(this.camera.position, direction, stats.range, 1);
    const hit = hits[0];
    if (!hit) {
      this.lastHitZone = null;
      return;
    }

    hit.zombie.health -= damageAtDistance(stats, hit.distance, hit.zone);
    const profile = zombieProfile(hit.zombie.type);
    hit.zombie.staggerTimer = Math.max(hit.zombie.staggerTimer, (stats.staggerPower + (hit.zone === "head" ? 0.18 : 0)) / profile.staggerResistance);
    hit.zombie.aiState = "chase";
    hit.zombie.target = { x: this.player.position.x, z: this.player.position.z };
    hit.zombie.lastKnownPlayer = hit.zombie.target;
    this.lastHitZone = hit.zone;
    this.createHitSpark(hit.point);
    this.playTone(this.loadout.weaponId === "machete" ? 130 : 150, 0.05, "sawtooth", 0.025);
    if (hit.zone === "head") {
      this.flashStatus("Clean strike");
    }
    if (hit.zombie.health <= 0) {
      this.killZombie(hit.zombie);
    }
  }

  private findZombieHit(origin: THREE.Vector3, direction: THREE.Vector3, range: number): { zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone } | null {
    return this.findZombieHits(origin, direction, range, 1)[0] ?? null;
  }

  private findZombieHits(origin: THREE.Vector3, direction: THREE.Vector3, range: number, limit: number): Array<{ zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone }> {
    const closestByZombie = new Map<number, { zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone }>();
    for (const zombie of this.zombies) {
      const bodyScale = zombie.type === "bloater" ? 1.45 : zombie.type === "sprinter" ? 0.84 : zombie.type === "crawler" ? 0.62 : 1;
      const crouchOffset = zombie.type === "crawler" ? -0.58 : 0;
      const zones: Array<{ zone: HitZone; center: THREE.Vector3; radius: number }> = [
        { zone: "head", center: zombie.position.clone().add(new THREE.Vector3(0.06 * bodyScale, 2.88 * bodyScale + crouchOffset, -0.02)), radius: 0.42 * bodyScale },
        { zone: "body", center: zombie.position.clone().add(new THREE.Vector3(0, 1.58 * bodyScale + crouchOffset, 0)), radius: 0.72 * bodyScale },
        { zone: "legs", center: zombie.position.clone().add(new THREE.Vector3(0, 0.62 * bodyScale, 0)), radius: 0.44 * bodyScale }
      ];
      for (const zone of zones) {
        const hit = this.raySphereHit(origin, direction, zone.center, zone.radius, range);
        const previous = closestByZombie.get(zombie.id);
        if (hit && (!previous || hit.distance < previous.distance)) {
          closestByZombie.set(zombie.id, { zombie, point: hit.point, distance: hit.distance, zone: zone.zone });
        }
      }
    }
    return [...closestByZombie.values()].sort((a, b) => a.distance - b.distance).slice(0, Math.max(1, limit));
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
    const pickup = chooseZombiePickup(zombie.type, this.rng);
    if (pickup) {
      this.addPickup(pickup.type, zombie.position, pickup.amount);
    }
    const weaponDrop = chooseZombieWeaponDrop(zombie.type, this.wave, this.rng);
    if (weaponDrop) {
      this.addWeaponDrop(weaponDrop, zombie.position, "zombie", 30);
    }
  }

  private addPickup(type: Pickup["type"], position: THREE.Vector3, amount: number): void {
    const mesh = this.meshFactory.createPickupMesh(type);
    mesh.position.set(position.x, this.groundY({ x: position.x, z: position.z }) + 0.75, position.z);
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
      pickup.mesh.position.y = this.groundY({ x: pickup.position.x, z: pickup.position.z }) + 0.75 + Math.sin(this.frame * 0.06 + pickup.id) * 0.12;
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

  private addWeaponDrop(
    weaponId: WeaponId,
    position: THREE.Vector3,
    source: WeaponDrop["source"],
    ttl = 24,
    spawn?: WeaponSpawn
  ): void {
    const mesh = this.meshFactory.createWeaponDropMesh(weaponId);
    const groundY = this.groundY({ x: position.x, z: position.z });
    mesh.position.set(position.x, groundY + (source === "cache" ? 0.8 : 0.65), position.z);
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
      drop.mesh.position.y =
        this.groundY({ x: drop.position.x, z: drop.position.z }) +
        (drop.source === "cache" ? 0.82 : 0.62) +
        Math.sin(this.frame * 0.045 + drop.id) * 0.08;

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
    const loot = searchAmenityLoot(amenity.kind, this.rng);
    this.player.scrap += loot.scrap;
    this.player.health = Math.min(100, this.player.health + loot.health);
    this.loadout = addAmmo(this.loadout, loot.ammo);
    this.noise.emit("reload", amenity.position, amenity.kind === "bbq" ? 0.85 : 0.55);
    this.flashStatus(loot.status);
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
      this.noise.emit("climb", fixture.position);
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

  private updateElevatedNoise(dt: number): void {
    if (this.player.height <= 1.4) {
      this.elevatedNoiseTimer = 0;
      return;
    }
    this.elevatedNoiseTimer -= dt;
    if (this.elevatedNoiseTimer <= 0) {
      this.noise.emit("climb", { x: this.player.position.x, z: this.player.position.z }, 0.7 + Math.min(0.8, this.player.height / 7));
      this.elevatedNoiseTimer = 1.35;
    }
  }

  private shouldBypassObstacle(obstacleId: string, point: Vec2): boolean {
    return shouldBypassCollisionObstacle(obstacleId, point, {
      activeFixtureId: this.player.activeFixtureId,
      interactables: this.level.interactables
    });
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
    this.player.position.set(fixture.position.x, this.groundY(fixture.position), fixture.position.z);
    const toggled = this.toggleFixture(fixture);
    if (toggled && this.player.activeFixtureId === fixture.id) {
      this.player.heightTarget = fixture.height;
      this.player.height = fixture.height;
    }
    return toggled;
  }

  private testUseAmenity(kind?: AmenityPoint["kind"]): boolean {
    const amenity = kind
      ? this.level.amenities.find((candidate) => candidate.kind === kind) ?? null
      : this.level.amenities[0] ?? null;
    if (!amenity) {
      return false;
    }
    this.player.position.set(amenity.position.x, this.groundY(amenity.position), amenity.position.z);
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

  private testGrounding(): ReturnType<GameTestApi["testGrounding"]> {
    const playerGroundDelta = this.player.position.y - this.groundY({ x: this.player.position.x, z: this.player.position.z });
    let maxZombieGroundDelta = 0;
    let maxZombieFootGap = 0;
    let maxZombieFootPenetration = 0;
    const bounds = new THREE.Box3();

    for (const zombie of this.zombies) {
      bounds.setFromObject(zombie.mesh);
      const groundY = this.groundY({ x: zombie.position.x, z: zombie.position.z });
      maxZombieGroundDelta = Math.max(maxZombieGroundDelta, Math.abs(zombie.position.y - groundY));
      const delta = bounds.min.y - groundY;
      maxZombieFootGap = Math.max(maxZombieFootGap, delta);
      maxZombieFootPenetration = Math.max(maxZombieFootPenetration, -delta);
    }

    return {
      playerGroundDelta: Number(playerGroundDelta.toFixed(4)),
      maxZombieGroundDelta: Number(maxZombieGroundDelta.toFixed(4)),
      maxZombieFootGap: Number(maxZombieFootGap.toFixed(4)),
      maxZombieFootPenetration: Number(maxZombieFootPenetration.toFixed(4)),
      zombiesMeasured: this.zombies.length
    };
  }

  private testZombieStates(): ReturnType<GameTestApi["testZombieStates"]> {
    return this.zombies.map((zombie) => ({
      id: zombie.id,
      type: zombie.type,
      aiState: zombie.aiState,
      hasTarget: Boolean(zombie.target),
      targetDistance: zombie.target ? Number(distance({ x: zombie.position.x, z: zombie.position.z }, zombie.target).toFixed(2)) : null,
      x: Number(zombie.position.x.toFixed(2)),
      z: Number(zombie.position.z.toFixed(2))
    }));
  }

  private testSetCrouching(crouching: boolean): boolean {
    this.testCrouchOverride = crouching;
    this.player.crouching = crouching;
    this.player.crouchAmount = crouching ? 1 : 0;
    this.root.classList.toggle("is-crouched", crouching);
    return this.player.crouching;
  }

  private testStartIntermission(): ActiveObjective | null {
    this.spawnQueue = [];
    for (const zombie of this.zombies) {
      this.scene.remove(zombie.mesh);
    }
    this.zombies = [];
    this.wavePhase = "active";
    return this.startIntermission();
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
    this.hud.setRestartVisible(true);
    this.hud.setStatus(`Overrun at wave ${this.wave}`);
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
      miniMapVisibleZombies: this.miniMapVisibleZombieCount,
      crouching: this.player.crouching,
      wavePhase: this.wavePhase,
      intermissionTimer: Number(this.intermissionTimer.toFixed(2)),
      objective: this.activeObjective
        ? {
            id: this.activeObjective.id,
            progress: Number(this.activeObjective.progress.toFixed(2)),
            holdSeconds: this.activeObjective.holdSeconds,
            completed: this.activeObjective.completed
          }
        : null
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
    this.hud.update({
      health: this.player.health,
      wave: this.wave,
      scrap: this.player.scrap,
      zombieCount: this.zombies.length + this.spawnQueue.length,
      loadout: this.loadout,
      reloadProgress: this.reloadProgress(performance.now() / 1000),
      playerHeight: this.player.height,
      activeFixtureId: this.player.activeFixtureId,
      nearestWeaponDrop: this.nearestWeaponDrop,
      nearestFixture: this.nearestFixture,
      nearestAmenity: this.nearestAmenity,
      nearestStation: this.nearestStation,
      wavePhase: this.wavePhase,
      intermissionTimer: this.intermissionTimer,
      activeObjective: this.activeObjective,
      isCrouching: this.player.crouching,
      amenityPrompt: (amenity) => this.amenityPrompt(amenity)
    });
  }

  private flashStatus(message: string): void {
    this.hud.flashStatus(message);
  }

  private updateMiniMap(): void {
    this.miniMapVisibleZombieCount = this.miniMap.render({
      playerPosition: { x: this.player.position.x, z: this.player.position.z },
      playerYaw: this.player.yaw,
      zombies: this.zombies,
      weaponDrops: this.weaponDrops,
      isVisible: (point, padding = 0) => this.isPointVisibleToPlayer(point, padding)
    });
  }

  private isPointVisibleToPlayer(point: Vec2, padding = 0): boolean {
    return isPointVisibleToPlayerByContext(point, this.visibilityContext(), padding);
  }

  private isLineOfSightBlocked(a: Vec2, b: Vec2, padding = 0): boolean {
    return isLineOfSightBlockedByContext(a, b, this.visibilityContext(), padding);
  }

  private visibilityContext() {
    return {
      playerPosition: { x: this.player.position.x, z: this.player.position.z },
      playerYaw: this.player.yaw,
      playerHeight: this.player.height,
      cameraFov: this.camera.fov,
      cameraAspect: this.camera.aspect,
      obstacles: this.level.obstacles,
      isObstacleBypassed: (obstacleId: string, point: Vec2) => this.shouldBypassObstacle(obstacleId, point)
    };
  }

  private createWorld(): void {
    this.world = new WorldBuilder(
      this.scene,
      this.level,
      this.rng,
      this.materials,
      (point) => this.groundY(point),
      (points) => this.averageGroundY(points)
    );
    this.world.createWorld();
    this.renderedTreeCount = this.world.getRenderedTreeCount();
  }

  private rebuildViewWeapon(): void {
    this.weaponModel.clear();
    const stats = getWeaponStats(this.loadout);
    const weapon = this.meshFactory.createWeaponMesh(this.loadout.weaponId, true);
    if (stats.kind === "melee") {
      weapon.position.set(0.46, -0.5, -0.54);
      weapon.rotation.set(-0.34, -0.28, 0.34);
    } else {
      weapon.position.set(0.42, -0.42, -0.78);
      weapon.rotation.set(0.03, -0.08, 0.02);
    }
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
      this.muzzleFlash.visible = this.muzzleTimer > 0 && stats.kind === "firearm";
      this.muzzleFlash.scale.setScalar(0.85 + this.rng.next() * 0.55);
      this.muzzleFlash.rotation.z += dt * 21;
    }
    if (this.muzzleLight) {
      this.muzzleLight.visible = this.muzzleTimer > 0 && stats.kind === "firearm";
      this.muzzleLight.intensity = 2.2 + this.rng.next() * 2.8;
    }
    const stanceSway = this.player.crouching ? 0.48 : 1;
    const bob = Math.min(1, this.player.velocity.length() / 18) * stats.sway * stanceSway;
    const t = this.frame * 0.08;
    const reloadProgress = this.reloadProgress(performance.now() / 1000);
    const reloadPose = reloadProgress > 0 ? 0.62 + Math.sin(reloadProgress * Math.PI) * 0.38 : 0;
    const scopeTuck = THREE.MathUtils.smoothstep(this.scopeAmount, 0, 1);
    const meleeSwing = stats.kind === "melee" ? Math.min(1, this.recoil) : 0;
    this.weaponModel.position.set(
      Math.sin(t) * 0.018 * bob + scopeTuck * 0.26 + meleeSwing * 0.16,
      Math.abs(Math.cos(t)) * -0.018 * bob - reloadPose * 0.16 - scopeTuck * 0.5 - this.player.crouchAmount * 0.04 - meleeSwing * 0.08,
      this.recoil * 0.07 + reloadPose * 0.06 + scopeTuck * 0.14 - meleeSwing * 0.18
    );
    this.weaponModel.rotation.set(
      this.recoil * 0.05 + reloadPose * 0.22 - scopeTuck * 0.08 - meleeSwing * 0.7,
      -this.recoilYaw * 0.01 - reloadPose * 0.12 - scopeTuck * 0.24 - meleeSwing * 0.22,
      Math.sin(t * 0.5) * 0.015 * bob + reloadPose * 0.16 - scopeTuck * 0.12 + meleeSwing * 0.55
    );
    this.weaponModel.scale.setScalar(THREE.MathUtils.lerp(1, 0.56, scopeTuck));
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
      const groundY = this.groundY({ x: shell.mesh.position.x, z: shell.mesh.position.z }) + 0.08;
      if (shell.mesh.position.y < groundY) {
        shell.mesh.position.y = groundY;
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

  private animateZombie(zombie: Zombie, now: number, distanceToPlayer: number): void {
    const arms = zombie.mesh.userData.arms as THREE.Mesh[] | undefined;
    const head = zombie.mesh.userData.head as THREE.Mesh | undefined;
    const basePace = zombie.type === "sprinter" ? 10 : zombie.type === "bloater" ? 4.2 : zombie.type === "crawler" ? 5.4 : zombie.type === "screamer" ? 7.6 : 6.8;
    const pace = basePace * (zombie.aiState === "wander" ? 0.56 : zombie.aiState === "investigate" ? 0.82 : 1);
    const swing = Math.sin(now * pace + zombie.walkOffset);
    if (arms) {
      arms.forEach((arm, index) => {
        const side = index === 0 ? -1 : 1;
        const reach = zombie.type === "crawler" ? -1.45 : zombie.type === "screamer" ? -1.16 : -0.95;
        const aggression = zombie.type === "screamer" ? 0.032 : 0.018;
        arm.rotation.x = reach + swing * 0.18 * side;
        arm.rotation.z = side * (0.28 + Math.max(0, 12 - distanceToPlayer) * aggression);
      });
    }
    if (head) {
      const baseTilt = zombie.type === "sprinter" ? -0.12 : zombie.type === "crawler" ? -0.26 : zombie.type === "screamer" ? 0.22 : 0.1;
      head.rotation.y = Math.sin(now * 2.6 + zombie.walkOffset) * (zombie.type === "screamer" ? 0.28 : 0.18);
      head.rotation.z = baseTilt + Math.cos(now * 2.1 + zombie.walkOffset) * 0.08;
    }
    zombie.mesh.scale.y = 1 + Math.sin(now * pace * 0.5 + zombie.walkOffset) * (zombie.type === "bloater" ? 0.035 : 0.02);
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
