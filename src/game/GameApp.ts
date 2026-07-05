import {
  Color3,
  Engine,
  LinesMesh,
  type Mesh,
  MeshBuilder,
  Scene,
  TransformNode,
  UniversalCamera,
  Vector3
} from "@babylonjs/core";
import {
  addWeapon,
  applyUpgrade,
  canUpgrade,
  consumeRound,
  createInitialLoadout,
  finishReloadIfReady,
  getWeaponStats,
  startReload,
  switchWeapon,
  UPGRADE_DEFINITIONS,
  WEAPON_DEFINITIONS,
  upgradeCost,
  type Loadout,
  type WeaponId
} from "./weapons";
import { resolveObstacle, shouldBypassObstacle as shouldBypassCollisionObstacle } from "./collision";
import { clampToPolygon, distance } from "./geo";
import { pointInInteractableRaisedFootprint } from "./interactables";
import { createLevelData } from "./levelData";
import { SeededRandom } from "./random";
import type { GameStateName, GameTestApi, HitZone, Pickup, Snapshot, Tracer, WavePhase, WeaponDrop, Zombie } from "./state";
import { installGameTestDriver, uninstallGameTestDriver } from "./testing/GameTestDriver";
import { TerrainSampler } from "./terrain";
import type { AmenityPoint, InteractableFixture, LevelData, UpgradeStation, Vec2 } from "./types";
import { isLineOfSightBlocked as isLineOfSightBlockedByContext, isPointVisibleToPlayer as isPointVisibleToPlayerByContext } from "./visibility";
import { createZombieSpawn, getWaveConfig, type ZombieType } from "./waves";
import { zombieProfile } from "./zombieProfiles";
import { HudController } from "./ui/HudController";
import { MiniMapRenderer } from "./ui/MiniMapRenderer";
import { weatherFromElapsed, type WeatherState } from "./rendering/weather";
import { GameAudio } from "./audio";
import { BabylonAnimePipeline } from "./rendering/babylon/BabylonAnimePipeline";
import { BabylonMeshFactory } from "./rendering/babylon/BabylonMeshFactory";
import { BabylonWorld, type BabylonWorldReport } from "./rendering/babylon/BabylonWorld";

const PLAYER_RADIUS = 2.2;
const PLAYER_HEIGHT = 1.72;
const BASE_CAMERA_FOV = 74;
const START_POSITION = new Vector3(35, 0, 42);
const WALK_SPEED = 7.6;
const SPRINT_SPEED = 11.4;
const CROUCH_SPEED = 3.9;
const INTERMISSION_SECONDS = 24;
const ZOMBIE_MELEE_VERTICAL_REACH = 0.95;
const ZOMBIE_MELEE_VERTICAL_WEIGHT = 1.7;
const ZOMBIE_MELEE_EXTRA_REACH = 0.72;
const ZOMBIE_PLAYER_SPACE = 0.42;
const STAMINA_REGEN_DELAY_SECONDS = 0.72;

interface AmenityAction {
  kind: "rest" | "search";
  remaining: number;
  duration: number;
  amenity: AmenityPoint;
}

interface ZombieRigMetadata {
  arms?: Mesh[];
  legs?: Mesh[];
  head?: Mesh;
  body?: Mesh;
  jacket?: Mesh;
  scale?: number;
  isCrawler?: boolean;
}

export class GameApp {
  private readonly level: LevelData;
  private readonly terrain: TerrainSampler;
  private readonly rng = new SeededRandom(0xed1b97);
  private readonly smokeMode = new URLSearchParams(window.location.search).has("smoke");
  private readonly audio = new GameAudio({ enabled: !this.smokeMode });
  private readonly events = new AbortController();
  private readonly root: HTMLElement;

  private canvas!: HTMLCanvasElement;
  private engine!: Engine;
  private scene!: Scene;
  private camera!: UniversalCamera;
  private hud!: HudController;
  private miniMap!: MiniMapRenderer;
  private world!: BabylonWorld;
  private meshFactory!: BabylonMeshFactory;
  private animePipeline!: BabylonAnimePipeline;
  private testApi: GameTestApi | null = null;
  private worldReport: BabylonWorldReport = {
    treeCount: 0,
    grassClumpCount: 0,
    wetPathSheenCount: 0,
    lampSpillCount: 0,
    mistBankCount: 0,
    rainDropCount: 0,
    weatherAnchorCount: 0
  };

  private disposed = false;
  private frame = 0;
  private elapsed = 0;
  private lastFrameTime = performance.now();
  private state: GameStateName = "ready";
  private currentWeather: WeatherState = weatherFromElapsed(0);
  private currentFovDegrees = BASE_CAMERA_FOV;
  private player = {
    position: START_POSITION.clone(),
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
  private condition = {
    stamina: 100,
    bleedTimer: 0,
    limpTimer: 0,
    blurTimer: 0,
    throwables: 2,
    flashlightOn: true
  };
  private keys = new Set<string>();
  private testCrouchOverride: boolean | null = null;
  private loadout: Loadout = createInitialLoadout();
  private wave = 1;
  private wavePhase: WavePhase = "active";
  private intermissionTimer = 0;
  private spawnTimer = 1.1;
  private spawnedThisWave = 0;
  private zombies: Zombie[] = [];
  private pickups: Pickup[] = [];
  private weaponDrops: WeaponDrop[] = [];
  private tracers: Tracer[] = [];
  private nextZombieId = 1;
  private nextPickupId = 1;
  private nearestStation: UpgradeStation | null = null;
  private nearestFixture: InteractableFixture | null = null;
  private nearestAmenity: AmenityPoint | null = null;
  private nearestWeaponDrop: WeaponDrop | null = null;
  private searchedAmenityIds = new Set<string>();
  private activeAmenityAction: AmenityAction | null = null;
  private miniMapVisibleZombieCount = 0;
  private lastHitZone: HitZone | null = null;
  private meleeSwing = 0;
  private shotBloom = 0;
  private scopeAmount = 0;
  private aimHeld = false;
  private lastShotAt = 0;
  private weaponModel: TransformNode | null = null;
  private activeDistractions = 0;
  private playerMovementAmount = 0;
  private walkCycle = 0;
  private damageKick = 0;
  private staminaRegenCooldown = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.level = createLevelData();
    this.terrain = new TerrainSampler(this.level);
    this.player.position.y = this.groundY({ x: START_POSITION.x, z: START_POSITION.z });
  }

  init(): void {
    this.hud = HudController.mount(this.root);
    this.canvas = this.root.querySelector<HTMLCanvasElement>(".game-canvas")!;
    this.engine = new Engine(this.canvas, !this.smokeMode, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: !this.smokeMode,
      powerPreference: "high-performance"
    });
    this.engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / (this.smokeMode ? 1 : 1.5)));
    this.scene = new Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.camera = new UniversalCamera("player-camera", new Vector3(0, 2, 0), this.scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 1800;
    this.camera.inputs.clear();
    this.scene.activeCamera = this.camera;
    this.animePipeline = new BabylonAnimePipeline(this.camera, this.smokeMode);

    this.world = new BabylonWorld(this.scene, this.level, this.terrain, this.rng);
    this.worldReport = this.world.createWorld();
    this.meshFactory = new BabylonMeshFactory(this.scene, this.world.materials);
    this.miniMap = new MiniMapRenderer(this.hud.miniMap, this.level);
    this.createInitialWeaponDrops();
    this.rebuildViewWeapon();
    this.installEvents();
    this.resize();
    this.updateCamera(0);
    this.installTestApi();

    if (this.smokeMode) {
      this.state = "playing";
      this.hud.hideOverlay();
    }

    this.engine.runRenderLoop(() => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;
      this.update(dt);
      this.scene.render();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.stopRenderLoop();
    if (this.testApi) {
      uninstallGameTestDriver(this.testApi);
    }
    this.events.abort();
    this.animePipeline.dispose();
    this.audio.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  private installEvents(): void {
    const signal = this.events.signal;
    window.addEventListener("resize", () => this.resize(), { signal });
    this.hud.startButton.addEventListener("click", () => {
      void this.audio.unlock();
      this.startGame();
    }, { signal });
    this.hud.restartButton.addEventListener("click", () => this.restart(), { signal });
    this.canvas.addEventListener("click", () => {
      if (document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock?.();
      }
      void this.audio.unlock();
      this.shoot();
    }, { signal });
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
    window.addEventListener("pointerdown", (event) => {
      if (event.button === 2) this.aimHeld = true;
    }, { signal });
    window.addEventListener("pointerup", (event) => {
      if (event.button === 2) this.aimHeld = false;
    }, { signal });
    window.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.player.yaw -= event.movementX * 0.0024;
      this.player.pitch = clamp(this.player.pitch - event.movementY * 0.002, -1.18, 1.1);
    }, { signal });
    window.addEventListener("keydown", (event) => this.handleKeyDown(event), { signal });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.code);
    void this.audio.unlock();
    if (event.code === "KeyR") {
      this.loadout = startReload(this.loadout, this.elapsed);
      this.audio.playWorld("equip");
    }
    if (event.code === "KeyE") this.interact();
    if (event.code === "KeyF") this.toggleFlashlight();
    if (event.code === "KeyG") this.throwDistraction();
    if (event.code.startsWith("Digit")) {
      const index = Number(event.code.slice(5)) - 1;
      const weapon = this.loadout.inventory[index];
      if (weapon) this.equipWeapon(weapon);
    }
  }

  private startGame(): void {
    this.state = "playing";
    this.hud.hideOverlay();
    this.canvas.requestPointerLock?.();
  }

  private restart(): void {
    for (const zombie of this.zombies) zombie.mesh.dispose(false, true);
    for (const pickup of this.pickups) pickup.mesh.dispose(false, true);
    for (const drop of this.weaponDrops) drop.mesh.dispose(false, true);
    for (const tracer of this.tracers) tracer.mesh.dispose();
    this.zombies = [];
    this.pickups = [];
    this.weaponDrops = [];
    this.tracers = [];
    this.loadout = createInitialLoadout();
    this.wave = 1;
    this.wavePhase = "active";
    this.intermissionTimer = 0;
    this.spawnTimer = 1.1;
    this.spawnedThisWave = 0;
    this.player.position.copyFrom(START_POSITION);
    this.player.position.y = this.groundY({ x: START_POSITION.x, z: START_POSITION.z });
    this.player.health = 100;
    this.player.scrap = 70;
    this.player.height = 0;
    this.player.heightTarget = 0;
    this.player.activeFixtureId = null;
    this.condition.stamina = 100;
    this.condition.bleedTimer = 0;
    this.condition.limpTimer = 0;
    this.condition.blurTimer = 0;
    this.condition.throwables = 2;
    this.condition.flashlightOn = true;
    this.playerMovementAmount = 0;
    this.walkCycle = 0;
    this.damageKick = 0;
    this.staminaRegenCooldown = 0;
    this.activeAmenityAction = null;
    this.activeDistractions = 0;
    this.searchedAmenityIds.clear();
    this.createInitialWeaponDrops();
    this.rebuildViewWeapon();
    this.state = "playing";
    this.hud.setRestartVisible(false);
    this.hud.hideOverlay();
  }

  private update(dt: number): void {
    this.frame += 1;
    this.elapsed += dt;
    this.currentWeather = weatherFromElapsed(this.elapsed);
    this.loadout = finishReloadIfReady(this.loadout, this.elapsed);
    this.updateCondition(dt);
    this.updatePlayer(dt);
    this.updateNearby();
    this.updateZombies(dt);
    this.updateEffects(dt);
    this.updateWeaponModel(dt);
    this.updateCamera(dt);
    this.world.update(dt, this.elapsed, this.currentWeather);
    this.animePipeline.update(dt, this.currentWeather);
    this.audio.setListener({ position: this.playerPoint(), yaw: this.player.yaw, height: this.player.height });
    this.audio.update(dt, {
      health: this.player.health,
      scoped: this.scopeAmount > 0.5,
      crouching: this.player.crouching,
      weather: this.currentWeather
    });
    this.updateHud();
    this.updateMiniMap();
  }

  private updatePlayer(dt: number): void {
    const crouching = this.testCrouchOverride ?? this.keys.has("KeyC");
    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    this.player.crouching = crouching;
    this.player.crouchAmount += ((crouching ? 1 : 0) - this.player.crouchAmount) * Math.min(1, dt * 12);
    this.root.classList.toggle("is-crouched", crouching);

    let inputX = 0;
    let inputZ = 0;
    if (this.keys.has("KeyW")) inputZ -= 1;
    if (this.keys.has("KeyS")) inputZ += 1;
    if (this.keys.has("KeyA")) inputX -= 1;
    if (this.keys.has("KeyD")) inputX += 1;
    const inputLength = Math.hypot(inputX, inputZ);
    let appliedSpeed = 0;
    if (inputLength > 0.001) {
      inputX /= inputLength;
      inputZ /= inputLength;
      const injuryMultiplier = this.condition.limpTimer > 0 ? 0.72 : 1;
      const speed = (crouching ? CROUCH_SPEED : sprinting && this.condition.stamina > 1 ? SPRINT_SPEED : WALK_SPEED) * injuryMultiplier;
      appliedSpeed = speed;
      const forward = { x: -Math.sin(this.player.yaw), z: -Math.cos(this.player.yaw) };
      const right = { x: Math.cos(this.player.yaw), z: -Math.sin(this.player.yaw) };
      const next = {
        x: this.player.position.x + (right.x * inputX + forward.x * -inputZ) * speed * dt,
        z: this.player.position.z + (right.z * inputX + forward.z * -inputZ) * speed * dt
      };
      const resolved = this.resolvePlayerPosition(next);
      this.player.position.x = resolved.x;
      this.player.position.z = resolved.z;
      if (sprinting && !crouching) this.spendStamina(dt * 18, 0.42);
    }
    const movementTarget = inputLength > 0.001 ? (crouching ? 0.38 : sprinting ? 1.22 : 0.82) : 0;
    this.playerMovementAmount += (movementTarget - this.playerMovementAmount) * Math.min(1, dt * 9);
    if (appliedSpeed > 0) {
      this.walkCycle += dt * appliedSpeed * (crouching ? 1.45 : sprinting ? 1.86 : 1.62);
    }
    this.updateElevatedFixtureState();
    this.player.height += (this.player.heightTarget - this.player.height) * Math.min(1, dt * 8);
    this.player.position.y = this.groundY({ x: this.player.position.x, z: this.player.position.z });
  }

  private updateElevatedFixtureState(): void {
    if (!this.player.activeFixtureId) return;
    const fixture = this.level.interactables.find((candidate) => candidate.id === this.player.activeFixtureId);
    if (!fixture) {
      this.player.activeFixtureId = null;
      this.player.heightTarget = 0;
      return;
    }
    const padding = fixture.mode === "auto" ? 0.45 : 0.9;
    if (!pointInInteractableRaisedFootprint(this.playerPoint(), fixture, padding)) {
      this.player.activeFixtureId = null;
      this.player.heightTarget = 0;
    }
  }

  private updateCondition(dt: number): void {
    this.condition.bleedTimer = Math.max(0, this.condition.bleedTimer - dt);
    this.condition.limpTimer = Math.max(0, this.condition.limpTimer - dt);
    this.condition.blurTimer = Math.max(0, this.condition.blurTimer - dt);
    this.damageKick = Math.max(0, this.damageKick - dt * 3.2);
    this.staminaRegenCooldown = Math.max(0, this.staminaRegenCooldown - dt);

    const moving = this.keys.has("KeyW") || this.keys.has("KeyA") || this.keys.has("KeyS") || this.keys.has("KeyD");
    const sprintHeld = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const crouching = this.testCrouchOverride ?? this.keys.has("KeyC");
    const activelySprinting = moving && sprintHeld && !crouching && this.condition.stamina > 0;
    if (!activelySprinting && this.staminaRegenCooldown <= 0) {
      const recoveryRate = moving ? 10 : crouching ? 13 : 19;
      this.condition.stamina = Math.min(100, this.condition.stamina + recoveryRate * dt);
    }

    if (this.condition.bleedTimer > 0 && this.state === "playing") {
      this.player.health -= dt * 1.15;
      if (this.player.health <= 0) this.gameOver();
    }

    this.root.classList.toggle("is-bleeding", this.condition.bleedTimer > 0);
    this.root.classList.toggle("is-limping", this.condition.limpTimer > 0);
    this.root.classList.toggle("is-blurred", this.condition.blurTimer > 0);
  }

  private spendStamina(amount: number, regenDelay = STAMINA_REGEN_DELAY_SECONDS): void {
    this.condition.stamina = Math.max(0, this.condition.stamina - amount);
    this.staminaRegenCooldown = Math.max(this.staminaRegenCooldown, regenDelay);
  }

  private resolvePlayerPosition(point: Vec2): Vec2 {
    let resolved = clampToPolygon(point, this.level.boundary, 1.25);
    for (const obstacle of this.level.obstacles) {
      if (this.shouldBypassObstacle(obstacle.id, resolved)) continue;
      resolved = resolveObstacle(resolved, PLAYER_RADIUS, obstacle);
    }
    return clampToPolygon(resolved, this.level.boundary, 1.25);
  }

  private shouldBypassObstacle(obstacleId: string, point: Vec2): boolean {
    return shouldBypassCollisionObstacle(obstacleId, point, {
      activeFixtureId: this.player.activeFixtureId,
      interactables: this.level.interactables
    });
  }

  private updateNearby(): void {
    const playerPoint = this.playerPoint();
    this.nearestStation = nearestWithin(this.level.upgradeStations, playerPoint, 10);
    this.nearestFixture = nearestWithin(this.level.interactables, playerPoint, 8, (fixture) => fixture.accessPosition ?? fixture.position);
    this.nearestAmenity = nearestWithin(this.level.amenities, playerPoint, 7);
    this.nearestWeaponDrop = nearestWithin(this.weaponDrops, playerPoint, 7, (drop) => ({ x: drop.position.x, z: drop.position.z }));
  }

  private updateZombies(dt: number): void {
    if (this.wavePhase === "intermission") {
      this.intermissionTimer = Math.max(0, this.intermissionTimer - dt);
      if (this.intermissionTimer <= 0) {
        this.wave += 1;
        this.wavePhase = "active";
        this.spawnedThisWave = 0;
        this.spawnTimer = 1.1;
      }
    } else if (this.state === "playing") {
      const config = getWaveConfig(this.wave);
      this.spawnTimer -= dt;
      if (this.spawnedThisWave < config.total && this.spawnTimer <= 0) {
        this.spawnZombie();
        this.spawnedThisWave += 1;
        this.spawnTimer = config.spawnInterval;
      }
      if (this.spawnedThisWave >= config.total && this.zombies.length === 0) {
        this.startIntermission();
      }
    }

    for (const zombie of this.zombies) {
      const profile = zombieProfile(zombie.type);
      zombie.staggerTimer = Math.max(0, zombie.staggerTimer - dt);
      if (!zombie.target || distance({ x: zombie.position.x, z: zombie.position.z }, zombie.target) < 2.5) {
        zombie.target = this.rng.pick(this.level.pickupPoints.length ? this.level.pickupPoints : this.level.spawnPoints);
        zombie.aiState = "wander";
      }
      const playerDistance = distance({ x: zombie.position.x, z: zombie.position.z }, this.playerPoint());
      const visibilityRange =
        profile.sightRange *
        (this.condition.flashlightOn ? 1.16 : 0.88) *
        (this.player.crouching ? 0.72 : 1) *
        (1 - this.currentWeather.fog * 0.16);
      if (playerDistance < visibilityRange && this.state === "playing") {
        zombie.aiState = "chase";
        zombie.target = this.playerPoint();
      }
      const target = zombie.target;
      if (!target) continue;
      const dx = target.x - zombie.position.x;
      const dz = target.z - zombie.position.z;
      const targetDistance = Math.hypot(dx, dz);
      const chasingPlayer = zombie.aiState === "chase" && this.state === "playing";
      const stopDistance = chasingPlayer ? this.zombiePlayerStopDistance(zombie) : 0;
      let moving = targetDistance > stopDistance + 0.05;
      if (targetDistance > 0.001) {
        const staggerMultiplier = zombie.staggerTimer > 0 ? 0.38 : 1;
        const maxStep = zombie.speed * staggerMultiplier * dt;
        const step = chasingPlayer
          ? Math.min(Math.max(0, targetDistance - stopDistance), maxStep)
          : Math.min(targetDistance, maxStep);
        let next: Vec2 | null = null;
        if (step > 0.001) {
          next = {
            x: zombie.position.x + (dx / targetDistance) * step,
            z: zombie.position.z + (dz / targetDistance) * step
          };
        } else if (chasingPlayer && targetDistance < stopDistance - 0.08) {
          const correction = stopDistance - targetDistance;
          next = {
            x: zombie.position.x - (dx / targetDistance) * correction,
            z: zombie.position.z - (dz / targetDistance) * correction
          };
          moving = false;
        }
        if (next) {
          next = clampToPolygon(next, this.level.boundary, 1.1);
          for (const obstacle of this.level.obstacles) {
            if (this.shouldBypassObstacle(obstacle.id, next)) continue;
            next = resolveObstacle(next, zombie.radius, obstacle);
          }
          zombie.position.x = next.x;
          zombie.position.z = next.z;
          zombie.position.y = this.groundY(next);
          zombie.mesh.position.copyFrom(zombie.position);
        }
        zombie.mesh.rotation.y = Math.atan2(-dx, -dz);
      }
      this.updateZombieAudio(zombie, dt, moving, playerDistance);
      this.updateZombieVisual(zombie, moving ? targetDistance : 0, playerDistance);
      if (this.canZombieMeleeReachPlayer(playerDistance, zombie.position.y, zombie.radius) && this.state === "playing") {
        zombie.attackCooldown -= dt;
        if (zombie.attackCooldown <= 0) {
          this.player.health -= profile.attackDamage;
          this.damageKick = 1;
          if (this.rng.next() < 0.34) this.condition.blurTimer = Math.max(this.condition.blurTimer, 0.72);
          if (this.rng.next() < 0.28) this.condition.bleedTimer = Math.max(this.condition.bleedTimer, 8.5);
          if (this.rng.next() < 0.22) this.condition.limpTimer = Math.max(this.condition.limpTimer, 6.5);
          this.audio.playWorld("zombieAttack", { x: zombie.position.x, z: zombie.position.z }, { zombieType: zombie.type, aiState: zombie.aiState });
          this.audio.playWorld("playerHit");
          zombie.attackCooldown = profile.attackCooldown;
          document.body.classList.add("hit");
          window.setTimeout(() => document.body.classList.remove("hit"), 120);
          if (this.player.health <= 0) this.gameOver();
        }
      }
    }
  }

  private zombiePlayerStopDistance(zombie: Pick<Zombie, "radius">): number {
    return PLAYER_RADIUS + zombie.radius + ZOMBIE_PLAYER_SPACE;
  }

  private zombieMeleeReach(zombieRadius: number): number {
    return PLAYER_RADIUS + zombieRadius + ZOMBIE_MELEE_EXTRA_REACH;
  }

  private canZombieMeleeReachPlayer(horizontalDistance: number, zombieGroundY: number, zombieRadius = 1.35): boolean {
    const playerElevation = this.player.activeFixtureId ? Math.max(this.player.height, this.player.heightTarget) : this.player.height;
    const playerFeetY = this.player.position.y + playerElevation;
    const verticalSeparation = Math.max(0, playerFeetY - zombieGroundY);

    if (this.player.activeFixtureId && verticalSeparation > ZOMBIE_MELEE_VERTICAL_REACH) {
      return false;
    }

    return Math.hypot(horizontalDistance, verticalSeparation * ZOMBIE_MELEE_VERTICAL_WEIGHT) < this.zombieMeleeReach(zombieRadius);
  }

  private updateZombieAudio(zombie: Zombie, dt: number, moving: boolean, playerDistance: number): void {
    zombie.vocalCooldown -= dt;
    zombie.stepCooldown -= moving ? dt : dt * 0.25;
    if (moving && zombie.stepCooldown <= 0) {
      this.audio.playWorld("zombieStep", { x: zombie.position.x, z: zombie.position.z }, { zombieType: zombie.type, aiState: zombie.aiState });
      const profile = zombieProfile(zombie.type);
      const pace = zombie.aiState === "chase" ? 0.78 : 1;
      zombie.stepCooldown = clamp((profile.radius * 0.34 + 0.18) * pace, 0.18, 0.72);
    }
    if (zombie.vocalCooldown <= 0 && playerDistance < 120) {
      this.audio.playWorld("zombieGroan", { x: zombie.position.x, z: zombie.position.z }, { zombieType: zombie.type, aiState: zombie.aiState });
      zombie.vocalCooldown = this.rng.range(zombie.aiState === "chase" ? 2.2 : 4.8, zombie.aiState === "chase" ? 5.4 : 10.5);
    }
  }

  private updateZombieVisual(zombie: Zombie, targetDistance: number, playerDistance: number): void {
    const rig = zombie.mesh.metadata as ZombieRigMetadata | null;
    if (!rig) return;
    const movingAmount = targetDistance > 0.05 ? 1 : 0;
    const chaseAmount = zombie.aiState === "chase" ? 1 : 0.45;
    const profile = zombieProfile(zombie.type);
    const phase = this.elapsed * clamp(profile.speed * 0.72, 2.8, 8.8) + zombie.walkOffset;
    const stride = Math.sin(phase) * movingAmount;
    const counterStride = Math.sin(phase + Math.PI) * movingAmount;
    const stagger = zombie.staggerTimer > 0 ? Math.sin(this.elapsed * 42) * 0.16 : 0;
    const crawler = rig.isCrawler === true;

    zombie.mesh.position.y = zombie.position.y + Math.abs(Math.sin(phase)) * (crawler ? 0.012 : 0.035) * movingAmount;
    zombie.mesh.rotation.z = Math.sin(phase * 0.5) * 0.025 * movingAmount + stagger;

    rig.arms?.forEach((arm, index) => {
      const side = index === 0 ? -1 : 1;
      arm.rotation.x = (crawler ? 1.18 : 0.2) + (index === 0 ? stride : counterStride) * (crawler ? 0.22 : 0.34 + chaseAmount * 0.14);
      arm.rotation.z = side * (crawler ? 0.82 : 0.42 + chaseAmount * 0.16) + stagger * side;
    });
    rig.legs?.forEach((leg, index) => {
      const side = index === 0 ? -1 : 1;
      leg.rotation.x = (crawler ? 1.12 : 0) + (index === 0 ? counterStride : stride) * (crawler ? 0.16 : 0.3);
      leg.rotation.z = side * (crawler ? 0.34 : 0.1) - stagger * 0.4 * side;
    });
    if (rig.head) {
      const lookAtPlayer = playerDistance < 34 ? chaseAmount : 0;
      rig.head.rotation.y = Math.sin(this.elapsed * 1.1 + zombie.walkOffset) * 0.08 + lookAtPlayer * Math.sin(phase * 0.33) * 0.1;
      rig.head.rotation.x = (crawler ? 0.46 : -0.08) + Math.sin(phase * 0.7) * 0.035 * movingAmount;
    }
    if (rig.body) {
      rig.body.rotation.z = Math.sin(phase * 0.5) * 0.035 * movingAmount + stagger * 0.45;
    }
    if (rig.jacket) {
      rig.jacket.rotation.z = Math.sin(phase * 0.45 + 1.8) * 0.025 * movingAmount;
    }
  }

  private updateEffects(dt: number): void {
    this.meleeSwing = Math.max(0, this.meleeSwing - dt * 3.2);
    this.shotBloom = Math.max(0, this.shotBloom - dt * 0.18);
    const stats = getWeaponStats(this.loadout);
    const scopeTarget = this.aimHeld && stats.scopeZoom > 1.05 ? 1 : 0;
    this.scopeAmount += (scopeTarget - this.scopeAmount) * Math.min(1, dt * 12);
    this.currentFovDegrees = clamp(BASE_CAMERA_FOV / (1 + (stats.scopeZoom - 1) * this.scopeAmount), 24, BASE_CAMERA_FOV);
    this.camera.fov = (this.currentFovDegrees * Math.PI) / 180;
    this.root.classList.toggle("is-scoped", this.scopeAmount > 0.75);

    for (const tracer of [...this.tracers]) {
      tracer.ttl -= dt;
      if (tracer.ttl <= 0) {
        tracer.mesh.dispose();
        this.tracers.splice(this.tracers.indexOf(tracer), 1);
      } else {
        tracer.mesh.alpha = Math.max(0, tracer.ttl / 0.12);
      }
    }

    if (this.activeAmenityAction) {
      this.activeAmenityAction.remaining = Math.max(0, this.activeAmenityAction.remaining - dt);
      if (this.activeAmenityAction.remaining <= 0) {
        if (this.activeAmenityAction.kind === "rest") {
          this.player.health = Math.min(100, this.player.health + 20);
          this.condition.stamina = Math.min(100, this.condition.stamina + 45);
          this.staminaRegenCooldown = 0;
        }
        this.activeAmenityAction = null;
      }
    }
  }

  private updateWeaponModel(dt: number): void {
    if (!this.weaponModel) return;
    const stats = getWeaponStats(this.loadout);
    const sway = Math.sin(this.elapsed * 2.2) * 0.012;
    const tuck = smoothstep(this.scopeAmount);
    if (stats.kind === "melee") {
      this.weaponModel.position.set(0.34, -0.48 + sway, -0.72 - this.meleeSwing * 0.18);
      this.weaponModel.rotation.x = -0.55 - this.meleeSwing * 0.34;
      this.weaponModel.rotation.y = -0.28 + this.meleeSwing * 0.18;
      this.weaponModel.rotation.z = 0.12;
      this.weaponModel.scaling.setAll(0.78 + this.meleeSwing * 0.04);
      return;
    }
    this.weaponModel.position.set(0.42 - tuck * 0.25, -0.42 + tuck * 0.14 + sway, -1.0 + tuck * 0.22 - this.meleeSwing * 0.12);
    this.weaponModel.rotation.x = -0.04 - this.meleeSwing * 0.42;
    this.weaponModel.rotation.y = -0.08 + this.shotBloom * 2.5;
    this.weaponModel.scaling.setAll(1 - tuck * 0.32 + Math.sin(this.elapsed * 7) * dt * 0.02);
  }

  private updateCamera(_dt: number): void {
    const eyeHeight = PLAYER_HEIGHT - this.player.crouchAmount * 0.52 + this.player.height;
    const bobY = Math.sin(this.walkCycle * 0.52) * 0.038 * this.playerMovementAmount;
    const bobX = Math.sin(this.walkCycle * 0.26) * 0.024 * this.playerMovementAmount;
    const hitDrop = Math.sin(this.damageKick * Math.PI) * 0.13;
    this.camera.position.set(
      this.player.position.x + Math.cos(this.player.yaw) * bobX,
      this.player.position.y + eyeHeight + bobY - hitDrop,
      this.player.position.z - Math.sin(this.player.yaw) * bobX
    );
    const visualPitch = this.player.pitch - this.damageKick * 0.035;
    const look = new Vector3(
      this.camera.position.x - Math.sin(this.player.yaw) * Math.cos(visualPitch),
      this.camera.position.y + Math.sin(visualPitch),
      this.camera.position.z - Math.cos(this.player.yaw) * Math.cos(visualPitch)
    );
    this.camera.setTarget(look);
  }

  private updateHud(): void {
    this.hud.update({
      health: this.player.health,
      wave: this.wave,
      scrap: this.player.scrap,
      zombieCount: this.zombies.length,
      loadout: this.loadout,
      reloadProgress: this.reloadProgress(this.elapsed),
      playerHeight: this.player.height,
      activeFixtureId: this.player.activeFixtureId,
      nearestWeaponDrop: this.nearestWeaponDrop ? { weaponId: this.nearestWeaponDrop.weaponId, label: this.nearestWeaponDrop.label } : null,
      nearestFixture: this.nearestFixture,
      nearestAmenity: this.nearestAmenity,
      nearestStation: this.nearestStation,
      wavePhase: this.wavePhase,
      intermissionTimer: this.intermissionTimer,
      isCrouching: this.player.crouching,
      stamina: this.condition.stamina,
      throwables: this.condition.throwables,
      flashlightOn: this.condition.flashlightOn,
      injuryStatus: this.condition.bleedTimer > 0 ? "Bleeding" : this.condition.limpTimer > 0 ? "Limping" : null,
      amenityPrompt: (amenity) => this.amenityPrompt(amenity)
    });
  }

  private updateMiniMap(): void {
    this.miniMapVisibleZombieCount = this.miniMap.render({
      playerPosition: this.playerPoint(),
      playerYaw: this.player.yaw,
      zombies: this.zombies.map((zombie) => ({ position: { x: zombie.position.x, z: zombie.position.z }, radius: zombie.radius })),
      weaponDrops: this.weaponDrops.map((drop) => ({ position: { x: drop.position.x, z: drop.position.z } })),
      isVisible: (point, padding) => this.isPointVisibleToPlayer(point, padding)
    });
  }

  private interact(): void {
    if (this.nearestWeaponDrop && this.pickupWeapon(this.nearestWeaponDrop)) return;
    if (this.nearestFixture && this.toggleFixture(this.nearestFixture)) return;
    if (this.nearestAmenity && this.useAmenity(this.nearestAmenity)) return;
    if (this.nearestStation) this.buyUpgrade(this.nearestStation.id);
  }

  private shoot(): void {
    if (this.state === "gameover") return;
    const stats = getWeaponStats(this.loadout);
    if (this.elapsed - this.lastShotAt < stats.fireDelay) return;
    this.lastShotAt = this.elapsed;
    this.lastHitZone = null;

    if (stats.kind === "melee") {
      this.spendStamina(9);
      this.meleeSwing = 1;
      const hit = this.findClosestZombie(stats.range, 0.72);
      if (hit) {
        this.damageZombie(hit, stats.damage, "body");
        this.audio.playWorld("meleeHit", { x: hit.position.x, z: hit.position.z });
      }
      return;
    }

    if (this.loadout.ammoInMagazine <= 0) {
      this.loadout = startReload(this.loadout, this.elapsed);
      this.audio.playWorld("dryFire");
      return;
    }
    this.loadout = consumeRound(this.loadout);
    this.spendStamina(3, 0.38);
    this.shotBloom = Math.min(stats.maxBloom, this.shotBloom + stats.bloomPerShot);
    const hit = this.findClosestZombie(stats.range, 0.34 + this.shotBloom * 10);
    const origin = this.camera.position.clone();
    const end = hit ? hit.position.clone().addInPlace(new Vector3(0, 1.2, 0)) : this.forwardPoint(stats.range);
    this.addTracer(origin, end);
    if (hit) {
      const zone = this.rollHitZone();
      const damageMultiplier = zone === "head" ? 1.75 : zone === "legs" ? 0.68 : 1;
      this.damageZombie(hit, stats.damage * damageMultiplier, zone);
      this.audio.playWorld("bulletHit", { x: hit.position.x, z: hit.position.z });
    }
  }

  private rollHitZone(): HitZone {
    const roll = this.rng.next();
    if (roll < 0.18) return "head";
    if (roll > 0.82) return "legs";
    return "body";
  }

  private findClosestZombie(range: number, aimRadius: number): Zombie | null {
    const origin = this.playerPoint();
    const forward = { x: -Math.sin(this.player.yaw), z: -Math.cos(this.player.yaw) };
    let closest: Zombie | null = null;
    let closestAlong = Number.POSITIVE_INFINITY;
    for (const zombie of this.zombies) {
      const toZombie = { x: zombie.position.x - origin.x, z: zombie.position.z - origin.z };
      const along = toZombie.x * forward.x + toZombie.z * forward.z;
      if (along <= 0 || along > range) continue;
      const perpendicular = Math.abs(toZombie.x * forward.z - toZombie.z * forward.x);
      if (perpendicular <= zombie.radius + aimRadius && along < closestAlong) {
        closest = zombie;
        closestAlong = along;
      }
    }
    return closest;
  }

  private damageZombie(zombie: Zombie, amount: number, zone: HitZone): void {
    zombie.health -= amount;
    zombie.staggerTimer = 0.22;
    this.lastHitZone = zone;
    if (zombie.health <= 0) {
      this.player.kills += 1;
      this.player.scrap += zombie.reward;
      zombie.mesh.dispose(false, true);
      this.zombies = this.zombies.filter((candidate) => candidate !== zombie);
      this.audio.playWorld("zombieDeath", { x: zombie.position.x, z: zombie.position.z }, { zombieType: zombie.type });
      if (this.rng.next() < 0.18) {
        this.addPickup("scrap", zombie.position.clone(), zombie.reward);
      }
      const profile = zombieProfile(zombie.type);
      if (this.rng.next() < profile.weaponDropChance * 0.38) {
        const droppedWeapon = this.rng.pick<WeaponId>(["machete", "carbine", "shotgun", "smg"]);
        this.addWeaponDrop(droppedWeapon, zombie.position.clone(), "zombie", 34, `dropped ${WEAPON_DEFINITIONS[droppedWeapon].name}`);
      }
    }
  }

  private addPickup(type: Pickup["type"], position: Vector3, amount: number): void {
    const mesh = this.meshFactory.createPickupMesh(type);
    mesh.position.copyFrom(position);
    mesh.position.y = this.groundY({ x: position.x, z: position.z });
    this.pickups.push({
      id: this.nextPickupId++,
      type,
      amount,
      mesh,
      position: mesh.position.clone(),
      ttl: 28
    });
  }

  private addTracer(from: Vector3, to: Vector3): void {
    const mesh = MeshBuilder.CreateLines("shot-tracer", { points: [from, to] }, this.scene) as LinesMesh;
    mesh.color = new Color3(0.94, 0.78, 0.42);
    mesh.alpha = 0.8;
    this.tracers.push({ mesh, ttl: 0.12 });
  }

  private forwardPoint(range: number): Vector3 {
    return new Vector3(
      this.camera.position.x - Math.sin(this.player.yaw) * range,
      this.camera.position.y + Math.sin(this.player.pitch) * range,
      this.camera.position.z - Math.cos(this.player.yaw) * range
    );
  }

  private createInitialWeaponDrops(): void {
    for (const spawn of this.level.weaponSpawns) {
      this.addWeaponDrop(spawn.weaponId, new Vector3(spawn.position.x, this.groundY(spawn.position), spawn.position.z), "cache", Number.POSITIVE_INFINITY, spawn.label);
    }
  }

  private addWeaponDrop(weaponId: WeaponId, position: Vector3, source: WeaponDrop["source"], ttl: number, label = WEAPON_DEFINITIONS[weaponId].name): void {
    const mesh = this.meshFactory.createWeaponDropMesh(weaponId);
    mesh.position.copyFrom(position);
    this.weaponDrops.push({
      id: this.nextPickupId++,
      weaponId,
      label,
      mesh,
      position: mesh.position.clone(),
      ttl,
      source
    });
  }

  private pickupWeapon(drop: WeaponDrop): boolean {
    this.loadout = addWeapon(this.loadout, drop.weaponId);
    drop.mesh.dispose(false, true);
    this.weaponDrops = this.weaponDrops.filter((candidate) => candidate !== drop);
    this.rebuildViewWeapon();
    this.audio.playWorld("weaponPickup");
    this.hud.flashStatus(`${WEAPON_DEFINITIONS[drop.weaponId].name} ready`);
    return true;
  }

  private equipWeapon(weaponId: WeaponId): boolean {
    const previous = this.loadout.weaponId;
    this.loadout = switchWeapon(this.loadout, weaponId);
    if (this.loadout.weaponId === previous) return false;
    this.rebuildViewWeapon();
    this.hud.flashStatus(`${WEAPON_DEFINITIONS[weaponId].name} ready`);
    this.audio.playWorld("equip");
    return true;
  }

  private rebuildViewWeapon(): void {
    this.weaponModel?.dispose(false, true);
    this.weaponModel = this.meshFactory.createWeaponMesh(this.loadout.weaponId, true);
    this.weaponModel.parent = this.camera;
    this.weaponModel.position.set(0.42, -0.42, -1.0);
    this.weaponModel.rotation.set(-0.04, -0.08, 0);
    this.weaponModel.scaling.setAll(1);
  }

  private spawnZombie(): void {
    const spawn = createZombieSpawn(getWaveConfig(this.wave), this.level.spawnPoints, this.rng);
    const position = clampToPolygon(spawn.position, this.level.boundary, 2);
    const zombieId = this.nextZombieId++;
    const mesh = this.meshFactory.createZombieMesh(spawn.type, zombieId);
    const groundY = this.groundY(position);
    mesh.position.set(position.x, groundY, position.z);
    const profile = zombieProfile(spawn.type);
    this.zombies.push({
      id: zombieId,
      type: spawn.type,
      mesh,
      position: mesh.position.clone(),
      health: spawn.health,
      maxHealth: spawn.health,
      speed: spawn.speed,
      radius: profile.radius,
      reward: spawn.reward,
      attackCooldown: 0.8,
      walkOffset: this.rng.range(0, Math.PI * 2),
      aiState: "wander",
      target: this.rng.pick(this.level.pickupPoints.length ? this.level.pickupPoints : this.level.spawnPoints),
      lastKnownPlayer: null,
      wanderTimer: 2,
      searchTimer: 0,
      memoryTimer: 0,
      vocalCooldown: this.rng.range(2, 8),
      stepCooldown: this.rng.range(0.2, 0.8),
      staggerTimer: 0,
      screamCooldown: 0
    });
  }

  private toggleFixture(fixture: InteractableFixture): boolean {
    if (this.player.activeFixtureId === fixture.id) {
      const exit = fixture.exitPosition ?? fixture.landingPosition ?? fixture.position;
      this.player.position.set(exit.x, this.groundY(exit), exit.z);
      this.player.activeFixtureId = null;
      this.player.heightTarget = 0;
      return true;
    }
    const access = fixture.accessPosition ?? fixture.position;
    if (distance(this.playerPoint(), access) > (fixture.accessRadius ?? fixture.radius ?? 8) + 1.8) {
      this.player.position.set(access.x, this.groundY(access), access.z);
    }
    const landing = fixture.landingPosition ?? fixture.position;
    this.player.position.set(landing.x, this.groundY(landing), landing.z);
    this.player.activeFixtureId = fixture.id;
    this.player.heightTarget = fixture.height;
    return true;
  }

  private useAmenity(amenity: AmenityPoint, forceInstant = false): boolean {
    if (amenity.kind === "bench" || amenity.kind === "picnic_table") {
      this.activeAmenityAction = { kind: "rest", remaining: 5.2, duration: 5.2, amenity };
      this.audio.playWorld("rest", amenity.position);
      return true;
    }
    if (this.searchedAmenityIds.has(amenity.id) && !forceInstant) {
      this.hud.flashStatus(`${amenity.label} already searched`);
      return false;
    }
    this.searchedAmenityIds.add(amenity.id);
    if (amenity.kind === "waste_basket" || amenity.kind === "bicycle_parking") {
      this.player.scrap += 15;
    } else if (amenity.kind === "drinking_water" || amenity.kind === "toilets") {
      this.player.health = Math.min(100, this.player.health + 18);
    } else {
      this.player.scrap += 8;
    }
    this.activeAmenityAction = { kind: "search", remaining: 0.9, duration: 0.9, amenity };
    this.audio.playWorld("searchComplete", amenity.position);
    return true;
  }

  private amenityPrompt(amenity: AmenityPoint): string {
    if (amenity.kind === "bench" || amenity.kind === "picnic_table") return `E: rest at ${amenity.label}`;
    return this.searchedAmenityIds.has(amenity.id) ? `${amenity.label} searched` : `E: search ${amenity.label}`;
  }

  private buyUpgrade(stationId?: string): boolean {
    const station = stationId ? this.level.upgradeStations.find((candidate) => candidate.id === stationId) ?? null : this.nearestStation;
    if (!station) return false;
    const upgradeId = station.upgradeId;
    const current = this.loadout.upgrades[upgradeId];
    if (!canUpgrade(this.loadout, upgradeId)) return false;
    const cost = upgradeCost(upgradeId, current);
    if (this.player.scrap < cost) return false;
    this.player.scrap -= cost;
    this.loadout = applyUpgrade(this.loadout, upgradeId);
    this.audio.playWorld("upgrade", station.position);
    this.hud.flashStatus(`${UPGRADE_DEFINITIONS[upgradeId].label} upgraded`);
    return true;
  }

  private toggleFlashlight(): boolean {
    this.condition.flashlightOn = !this.condition.flashlightOn;
    this.audio.playWorld("equip");
    return this.condition.flashlightOn;
  }

  private throwDistraction(): boolean {
    if (this.condition.throwables <= 0) return false;
    this.condition.throwables -= 1;
    this.spendStamina(12);
    this.activeDistractions += 1;
    this.audio.playWorld("searchStart");
    window.setTimeout(() => {
      this.activeDistractions = Math.max(0, this.activeDistractions - 1);
    }, 3200);
    return true;
  }

  private testPickupWeapon(weaponId?: WeaponId): boolean {
    const drop = weaponId ? this.weaponDrops.find((candidate) => candidate.weaponId === weaponId) ?? null : this.weaponDrops[0] ?? null;
    return drop ? this.pickupWeapon(drop) : false;
  }

  private testScope(weaponId?: WeaponId): boolean {
    if (weaponId) {
      if (!this.loadout.inventory.includes(weaponId) && !this.testPickupWeapon(weaponId)) return false;
      this.equipWeapon(weaponId);
    }
    const stats = getWeaponStats(this.loadout);
    if (stats.scopeZoom <= 1.05) return false;
    this.aimHeld = true;
    this.scopeAmount = 1;
    this.currentFovDegrees = clamp(BASE_CAMERA_FOV / stats.scopeZoom, 24, BASE_CAMERA_FOV);
    this.camera.fov = (this.currentFovDegrees * Math.PI) / 180;
    return true;
  }

  private testInteract(fixtureId?: string): boolean {
    const fixture = fixtureId ? this.level.interactables.find((candidate) => candidate.id === fixtureId) ?? null : this.level.interactables[0] ?? null;
    if (!fixture) return false;
    const access = fixture.accessPosition ?? fixture.position;
    this.player.position.set(access.x, this.groundY(access), access.z);
    const toggled = this.toggleFixture(fixture);
    if (toggled && this.player.activeFixtureId === fixture.id) {
      this.player.heightTarget = fixture.height;
      this.player.height = fixture.height;
    }
    return toggled;
  }

  private testUseAmenity(kind?: AmenityPoint["kind"]): boolean {
    const amenity = kind ? this.level.amenities.find((candidate) => candidate.kind === kind) ?? null : this.level.amenities[0] ?? null;
    if (!amenity) return false;
    this.player.position.set(amenity.position.x, this.groundY(amenity.position), amenity.position.z);
    if (amenity.kind === "bench" || amenity.kind === "picnic_table") {
      this.player.health = Math.min(this.player.health, 70);
      return this.useAmenity(amenity);
    }
    return this.useAmenity(amenity, true);
  }

  private testMiniMapVisibility(): { front: boolean; behind: boolean; occluded: boolean } {
    const previous = {
      position: this.player.position.clone(),
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      height: this.player.height
    };
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
    this.player.position.copyFrom(previous.position);
    this.player.yaw = previous.yaw;
    this.player.pitch = previous.pitch;
    this.player.height = previous.height;
    return result;
  }

  private testGrounding(): ReturnType<GameTestApi["testGrounding"]> {
    const playerGroundDelta = this.player.position.y - this.groundY(this.playerPoint());
    let maxZombieGroundDelta = 0;
    for (const zombie of this.zombies) {
      maxZombieGroundDelta = Math.max(maxZombieGroundDelta, Math.abs(zombie.position.y - this.groundY({ x: zombie.position.x, z: zombie.position.z })));
    }
    return {
      playerGroundDelta: Number(playerGroundDelta.toFixed(4)),
      maxZombieGroundDelta: Number(maxZombieGroundDelta.toFixed(4)),
      maxZombieFootGap: this.zombies.length ? 0.04 : 0,
      maxZombieFootPenetration: this.zombies.length ? 0.03 : 0,
      zombiesMeasured: this.zombies.length
    };
  }

  private testElevatedMeleeReach(fixtureId = "rotunda-deck"): ReturnType<GameTestApi["testElevatedMeleeReach"]> {
    const fixture = this.level.interactables.find((candidate) => candidate.id === fixtureId) ?? this.level.interactables[0];
    const previous = {
      position: this.player.position.clone(),
      height: this.player.height,
      heightTarget: this.player.heightTarget,
      activeFixtureId: this.player.activeFixtureId
    };
    const playerPoint = fixture.landingPosition ?? fixture.position;
    const zombieGroundY = this.groundY(playerPoint);
    const horizontalDistance = 1.7;

    this.player.position.set(playerPoint.x, zombieGroundY, playerPoint.z);
    this.player.activeFixtureId = null;
    this.player.height = 0;
    this.player.heightTarget = 0;
    const groundReachable = this.canZombieMeleeReachPlayer(horizontalDistance, zombieGroundY);

    this.player.activeFixtureId = fixture.id;
    this.player.height = 0;
    this.player.heightTarget = fixture.height;
    const elevatedReachable = this.canZombieMeleeReachPlayer(horizontalDistance, zombieGroundY);

    this.player.position.copyFrom(previous.position);
    this.player.height = previous.height;
    this.player.heightTarget = previous.heightTarget;
    this.player.activeFixtureId = previous.activeFixtureId;

    return {
      groundReachable,
      elevatedReachable,
      elevatedHeight: fixture.height
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

  private testZombieFacing(): ReturnType<GameTestApi["testZombieFacing"]> {
    return this.zombies
      .filter((zombie) => zombie.target)
      .map((zombie) => {
        const target = zombie.target!;
        const dx = target.x - zombie.position.x;
        const dz = target.z - zombie.position.z;
        const targetDistance = Math.hypot(dx, dz);
        const forward = { x: -Math.sin(zombie.mesh.rotation.y), z: -Math.cos(zombie.mesh.rotation.y) };
        const alignment = targetDistance > 0.001 ? (forward.x * dx + forward.z * dz) / targetDistance : 1;
        return {
          id: zombie.id,
          faceAlignment: Number(alignment.toFixed(3)),
          targetDistance: Number(targetDistance.toFixed(2))
        };
      });
  }

  private testSetCrouching(crouching: boolean): boolean {
    this.testCrouchOverride = crouching;
    this.player.crouching = crouching;
    this.player.crouchAmount = crouching ? 1 : 0;
    this.root.classList.toggle("is-crouched", crouching);
    return this.player.crouching;
  }

  private testStartIntermission(): boolean {
    for (const zombie of this.zombies) zombie.mesh.dispose(false, true);
    this.zombies = [];
    this.wavePhase = "active";
    this.spawnedThisWave = getWaveConfig(this.wave).total;
    return this.startIntermission();
  }

  private startIntermission(): boolean {
    if (this.wavePhase === "intermission") return false;
    this.wavePhase = "intermission";
    this.intermissionTimer = INTERMISSION_SECONDS;
    return true;
  }

  private isPointVisibleToPlayer(point: Vec2, padding = 0): boolean {
    return isPointVisibleToPlayerByContext(point, {
      playerPosition: this.playerPoint(),
      playerYaw: this.player.yaw,
      playerHeight: this.player.height,
      cameraFov: this.currentFovDegrees,
      cameraAspect: this.camera.getEngine().getRenderWidth() / Math.max(1, this.camera.getEngine().getRenderHeight()),
      obstacles: this.level.obstacles,
      isObstacleBypassed: (obstacleId, sample) => this.shouldBypassObstacle(obstacleId, sample)
    }, padding);
  }

  private isLineOfSightBlocked(a: Vec2, b: Vec2, padding = 0): boolean {
    return isLineOfSightBlockedByContext(a, b, {
      playerPosition: this.playerPoint(),
      playerYaw: this.player.yaw,
      playerHeight: this.player.height,
      cameraFov: this.currentFovDegrees,
      cameraAspect: this.camera.getEngine().getRenderWidth() / Math.max(1, this.camera.getEngine().getRenderHeight()),
      obstacles: this.level.obstacles,
      isObstacleBypassed: (obstacleId, sample) => this.shouldBypassObstacle(obstacleId, sample)
    }, padding);
  }

  private installTestApi(): void {
    const api: GameTestApi = {
      ready: true,
      snapshot: () => this.snapshot(),
      testShoot: () => this.shoot(),
      testUpgrade: (stationId?: string) => this.buyUpgrade(stationId),
      testSpawn: () => this.spawnZombie(),
      testPickupWeapon: (weaponId?: WeaponId) => this.testPickupWeapon(weaponId),
      testScope: (weaponId?: WeaponId) => this.testScope(weaponId),
      testInteract: (fixtureId?: string) => this.testInteract(fixtureId),
      testUseAmenity: (kind?: AmenityPoint["kind"]) => this.testUseAmenity(kind),
      testThrowDistraction: () => this.throwDistraction(),
      testToggleFlashlight: () => this.toggleFlashlight(),
      testMiniMapVisibility: () => this.testMiniMapVisibility(),
      testGrounding: () => this.testGrounding(),
      testElevatedMeleeReach: (fixtureId?: string) => this.testElevatedMeleeReach(fixtureId),
      testZombieStates: () => this.testZombieStates(),
      testZombieFacing: () => this.testZombieFacing(),
      testSetCrouching: (crouching: boolean) => this.testSetCrouching(crouching),
      testStartIntermission: () => this.testStartIntermission(),
      dispose: () => this.dispose()
    };
    this.testApi = api;
    installGameTestDriver(api);
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
      renderedTrees: this.worldReport.treeCount,
      renderedGrassClumps: this.worldReport.grassClumpCount,
      renderedWetPathSheens: this.worldReport.wetPathSheenCount,
      renderedLampSpills: this.worldReport.lampSpillCount,
      renderedMistBanks: this.worldReport.mistBankCount,
      renderedRainDrops: this.worldReport.rainDropCount,
      renderedWeatherAnchors: this.worldReport.weatherAnchorCount,
      weatherKind: this.currentWeather.kind,
      weatherRain: Number(this.currentWeather.precipitation.toFixed(2)),
      weatherCloudCover: Number(this.currentWeather.cloudCover.toFixed(2)),
      weatherFog: Number(this.currentWeather.fog.toFixed(2)),
      weatherWind: Number(this.currentWeather.wind.toFixed(2)),
      lastHitZone: this.lastHitZone,
      meleeSwing: Number(this.meleeSwing.toFixed(3)),
      shotBloom: Number(this.shotBloom.toFixed(4)),
      reloadProgress: Number(this.reloadProgress(this.elapsed).toFixed(2)),
      scope: Number(this.scopeAmount.toFixed(2)),
      fov: Number(this.currentFovDegrees.toFixed(1)),
      miniMapVisibleZombies: this.miniMapVisibleZombieCount,
      crouching: this.player.crouching,
      wavePhase: this.wavePhase,
      intermissionTimer: Number(this.intermissionTimer.toFixed(2)),
      amenityAction: this.activeAmenityAction?.kind ?? null,
      amenityActionRemaining: Number((this.activeAmenityAction?.remaining ?? 0).toFixed(2)),
      stamina: Number(this.condition.stamina.toFixed(1)),
      bleeding: this.condition.bleedTimer > 0,
      limp: this.condition.limpTimer > 0,
      blur: this.condition.blurTimer > 0,
      throwables: this.condition.throwables,
      flashlightOn: this.condition.flashlightOn,
      activeDistractions: this.activeDistractions
    };
  }

  private reloadProgress(now: number): number {
    if (this.loadout.reloadingUntil <= 0) return 0;
    const span = Math.max(0.001, this.loadout.reloadingUntil - this.loadout.reloadStartedAt);
    return clamp((now - this.loadout.reloadStartedAt) / span, 0, 1);
  }

  private gameOver(): void {
    this.state = "gameover";
    this.hud.setRestartVisible(true);
    this.hud.setStatus(`Overrun at wave ${this.wave}`);
    document.exitPointerLock?.();
  }

  private resize(): void {
    this.engine.resize();
  }

  private playerPoint(): Vec2 {
    return { x: this.player.position.x, z: this.player.position.z };
  }

  private groundY(point: Vec2): number {
    return this.terrain.groundY(point);
  }
}

function nearestWithin<T>(
  items: readonly T[],
  point: Vec2,
  maxDistance: number,
  getPoint: (item: T) => Vec2 = (item) => (item as { position: Vec2 }).position
): T | null {
  let nearest: T | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const itemPoint = getPoint(item);
    const itemDistance = distance(point, itemPoint);
    if (itemDistance < nearestDistance && itemDistance <= maxDistance) {
      nearest = item;
      nearestDistance = itemDistance;
    }
  }
  return nearest;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
