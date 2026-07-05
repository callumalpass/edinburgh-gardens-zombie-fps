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
import { clampToPolygon, distance, distanceToSegment, polygonCentroid } from "./geo";
import { pointInInteractableRaisedFootprint } from "./interactables";
import { createLevelData } from "./levelData";
import {
  chooseZombiePickup,
  chooseZombieWeaponDrop,
  isStructureAmenityKind,
  lootNoiseMultiplier,
  lootSearchSecondsMultiplier,
  searchAmenityLoot,
  type LootSearchContext
} from "./loot";
import { GameAudio, type NoisePlaybackOptions } from "./audio";
import { movementNoiseKind, movementNoiseMultiplier, NoiseSystem, type MovementSurface, type NoiseKind } from "./noise";
import {
  MAX_THROWABLES,
  bleedDamagePerSecond,
  createInitialPlayerCondition,
  injuryStatus,
  nextStamina,
  speedMultiplierForCondition,
  spendStamina,
  type PlayerCondition
} from "./playerCondition";
import { SeededRandom } from "./random";
import { AtmosphereSystem } from "./rendering/AtmosphereSystem";
import { MeshFactory } from "./rendering/MeshFactory";
import { PostProcessingPipeline } from "./rendering/PostProcessingPipeline";
import { SceneDecals } from "./rendering/SceneDecals";
import { WorldBuilder, type GameMaterials } from "./rendering/WorldBuilder";
import { createGameMaterials } from "./rendering/materials";
import { weatherFromElapsed, type WeatherState } from "./rendering/weather";
import { freezeStaticScene } from "./rendering/staticScene";
import type { GameStateName, GameTestApi, HitZone, Pickup, ShellCasing, SmokePuff, Snapshot, Tracer, WavePhase, WeaponDrop, Zombie } from "./state";
import { installGameTestDriver, uninstallGameTestDriver } from "./testing/GameTestDriver";
import { InputController } from "./input/InputController";
import { TerrainSampler } from "./terrain";
import {
  isLineOfSightBlocked as isLineOfSightBlockedByContext,
  isPointVisibleToPlayer as isPointVisibleToPlayerByContext
} from "./visibility";
import { createZombieSpawn, getWaveConfig, type ZombieSpawn, type ZombieType } from "./waves";
import { zombieProfile } from "./zombieProfiles";
import { HudController } from "./ui/HudController";
import { MiniMapRenderer } from "./ui/MiniMapRenderer";
import { playerVisibilityMultiplier, weatherNoiseMaskForKind, zombieFacingThreshold } from "./stealth";
import { separateCircularAgents } from "./spatial/AgentSeparation";
import { ObstacleIndex } from "./spatial/ObstacleIndex";
import { WaveDirector } from "./systems/WaveDirector";
import { LanMultiplayerClient, multiplayerConfigFromLocation } from "./multiplayer/LanMultiplayerClient";
import type {
  NetworkAction,
  NetworkGameSnapshot,
  NetworkInputState,
  NetworkPickupSnapshot,
  NetworkPlayerSnapshot,
  NetworkWeaponDropSnapshot,
  NetworkZombieSnapshot
} from "./multiplayer/types";
import type {
  AmenityPoint,
  InteractableFixture,
  LevelData,
  ParkLifeDetail,
  SkateBowlFeature,
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
const REST_SECONDS = 5;
const DISTRACTION_STAMINA_COST = 8;
const CLIMB_STAMINA_COST = 14;
const JUMP_STAMINA_COST = 9;
const JUMP_INITIAL_VELOCITY = 5.1;
const JUMP_GRAVITY = 13.4;
const MELEE_STAMINA_COST = 12;
const MACHETE_STAMINA_COST = 18;
const ZOMBIE_SEPARATION_GAP = 0.16;
const ZOMBIE_SEPARATION_GRID_SIZE = 8;
const ZOMBIE_SEPARATION_ITERATIONS = 3;
const ZOMBIE_STATIC_COLLISION_PASSES = 2;
const BIKE_FORWARD_SPEED = 18.2;
const BIKE_SPRINT_SPEED = 24.6;
const BIKE_REVERSE_SPEED = 5.2;
const BIKE_STRAFE_SPEED = 4.4;
const BIKE_INTERACTION_RADIUS = 5.6;
const BIKE_CAMERA_HEIGHT_BONUS = 0.34;
const BIKE_ALLOWED_WEAPONS = new Set<WeaponId>(["knife", "machete", "carbine", "smg"]);
const NETWORK_INPUT_HZ = 30;
const NETWORK_SNAPSHOT_HZ = 18;

interface AmenitySearch {
  amenity: AmenityPoint;
  remaining: number;
  duration: number;
  noiseTimer: number;
  noiseMultiplier: number;
}

interface AmenityRest {
  amenity: AmenityPoint;
  remaining: number;
  duration: number;
  healthGain: number;
}

interface ThrownDistraction {
  mesh: THREE.Mesh;
  position: Vec2;
  ttl: number;
  pulseTimer: number;
}

interface RideableBike {
  id: string;
  label: string;
  mesh: THREE.Group;
  position: THREE.Vector3;
  angle: number;
  mounted: boolean;
}

interface NetworkRemotePlayer {
  id: string;
  name: string;
  mesh: THREE.Group;
  weaponIdRendered: WeaponId;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  scrap: number;
  loadout: Loadout;
  condition: PlayerCondition;
  input: NetworkInputState;
  lastInputAt: number;
  lastShotAt: number;
  shotBloom: number;
  movementNoiseTimer: number;
  isSprinting: boolean;
  crouching: boolean;
  crouchAmount: number;
  height: number;
  heightTarget: number;
  jumpHeight: number;
  jumpVelocity: number;
  activeFixtureId: string | null;
}

interface CombatantRef {
  id: string;
  isLocal: boolean;
  remote?: NetworkRemotePlayer;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  crouching: boolean;
  crouchAmount: number;
  height: number;
  jumpHeight: number;
  activeFixtureId: string | null;
  condition: PlayerCondition;
  loadout: Loadout;
}

export class GameApp {
  private readonly root: HTMLElement;
  private readonly level: LevelData;
  private readonly obstacleIndex: ObstacleIndex;
  private readonly terrain: TerrainSampler;
  private readonly noise = new NoiseSystem();
  private readonly rng = new SeededRandom(0xed1b97);
  private readonly waveDirector: WaveDirector;
  private readonly multiplayerConfig = multiplayerConfigFromLocation();
  private readonly smokeMode = new URLSearchParams(window.location.search).has("smoke");
  private readonly audio = new GameAudio({ enabled: !this.smokeMode });
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private canvas!: HTMLCanvasElement;
  private input: InputController | null = null;
  private hud!: HudController;
  private miniMap!: MiniMapRenderer;
  private meshFactory!: MeshFactory;
  private world!: WorldBuilder;
  private atmosphere!: AtmosphereSystem;
  private postProcessing!: PostProcessingPipeline;
  private currentWeather: WeatherState = weatherFromElapsed(0);
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
    jumpHeight: 0,
    jumpVelocity: 0,
    crouching: false,
    crouchAmount: 0,
    activeFixtureId: null as string | null
  };
  private loadout: Loadout = createInitialLoadout();
  private lastShotAt = 0;
  private intermissionThreatTimer = 0;
  private intermissionThreatsSpawned = 0;
  private movementNoiseTimer = 0;
  private elevatedNoiseTimer = 0;
  private testCrouchOverride: boolean | null = null;
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
  private nearestBike: RideableBike | null = null;
  private nearestBrokenBike: ParkLifeDetail | null = null;
  private searchedAmenityIds = new Set<string>();
  private activeAmenitySearch: AmenitySearch | null = null;
  private activeAmenityRest: AmenityRest | null = null;
  private condition = createInitialPlayerCondition();
  private isSprinting = false;
  private distractionCooldown = 0;
  private flashlightNoiseTimer = 0;
  private playerTorch: THREE.SpotLight | null = null;
  private readonly distractions: ThrownDistraction[] = [];
  private scratchVector = new THREE.Vector3();
  private weaponModel = new THREE.Group();
  private muzzleFlash: THREE.Object3D | null = null;
  private muzzleLight: THREE.PointLight | null = null;
  private recoil = 0;
  private recoilYaw = 0;
  private meleeSwing = 0;
  private meleeSwingSide = 1;
  private shotBloom = 0;
  private scopeAmount = 0;
  private muzzleTimer = 0;
  private renderedTreeCount = 0;
  private renderedGrassClumpCount = 0;
  private renderedWetPathSheenCount = 0;
  private renderedLampSpillCount = 0;
  private miniMapVisibleZombieCount = 0;
  private lastHitZone: HitZone | null = null;
  private materials!: GameMaterials;
  private bike: RideableBike | null = null;
  private bikePedalPhase = 0;
  private multiplayer: LanMultiplayerClient | null = null;
  private localNetworkId = "local";
  private networkInputSequence = 0;
  private networkActionSequence = 0;
  private networkInputTimer = 0;
  private networkSnapshotTimer = 0;
  private networkRemainingSpawns = 0;
  private networkWave = 1;
  private networkWavePhase: WavePhase = "active";
  private networkIntermissionTimer = 0;
  private readonly networkPlayers = new Map<string, NetworkRemotePlayer>();

  private get aimHeld(): boolean {
    return this.input?.aimHeld ?? false;
  }

  private set aimHeld(value: boolean) {
    this.input?.setAimHeld(value);
  }

  private get wave(): number {
    if (this.isNetworkClient) {
      return this.networkWave;
    }
    return this.waveDirector.wave;
  }

  private get wavePhase(): WavePhase {
    if (this.isNetworkClient) {
      return this.networkWavePhase;
    }
    return this.waveDirector.phase;
  }

  private get intermissionTimer(): number {
    if (this.isNetworkClient) {
      return this.networkIntermissionTimer;
    }
    return this.waveDirector.intermissionTimer;
  }

  private get isNetworkHost(): boolean {
    return this.multiplayerConfig.enabled && this.multiplayerConfig.role === "host";
  }

  private get isNetworkClient(): boolean {
    return this.multiplayerConfig.enabled && this.multiplayerConfig.role === "client";
  }

  constructor(root: HTMLElement) {
    this.root = root;
    this.level = createLevelData();
    this.obstacleIndex = new ObstacleIndex(this.level.obstacles);
    this.terrain = new TerrainSampler(this.level);
    this.waveDirector = new WaveDirector(this.level.spawnPoints, this.rng, {
      intermissionSeconds: INTERMISSION_SECONDS,
      initialSpawnDelay: 0.4
    });
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = !this.smokeMode;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV, 1, 0.1, 1800);
    this.camera.userData.dynamic = true;
    this.weaponModel.userData.dynamic = true;
    this.scene = new THREE.Scene();
    this.atmosphere = new AtmosphereSystem(this.scene, this.rng, this.smokeMode, this.weatherAnchors());
    this.postProcessing = new PostProcessingPipeline(this.renderer, this.scene, this.camera, this.smokeMode);
    this.materials = createGameMaterials(this.rng);
    this.meshFactory = new MeshFactory(this.materials);
    this.miniMap = new MiniMapRenderer(this.hud.miniMap, this.level);
    this.scene.add(this.camera);
    this.camera.add(this.weaponModel);
    this.addPlayerTorch();
    this.rebuildViewWeapon();
    this.createWorld();
    this.world.createUpgradeStations();
    freezeStaticScene(this.scene, [this.camera, this.atmosphere.root, this.atmosphere.worldWeatherRoot]);
    this.spawnRideableBike();
    this.spawnInitialWeapons();
    this.bindEvents();
    this.resize();
    this.resetWaves();
    this.setupMultiplayer();
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
      testThrowDistraction: () => this.throwDistraction(),
      testToggleFlashlight: () => this.toggleFlashlight(),
      testMiniMapVisibility: () => this.testMiniMapVisibility(),
      testGrounding: () => this.testGrounding(),
      testZombieStates: () => this.testZombieStates(),
      testZombieFacing: () => this.testZombieFacing(),
      testSetCrouching: (crouching: boolean) => this.testSetCrouching(crouching),
      testStartIntermission: () => this.testStartIntermission(),
      testToggleBike: () => this.testToggleBike(),
      dispose: () => this.dispose()
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
    this.multiplayer?.close();
    for (const player of this.networkPlayers.values()) {
      this.scene.remove(player.mesh);
    }
    this.networkPlayers.clear();
    this.audio.dispose();

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
    this.postProcessing.dispose();
    this.renderer.dispose();
    this.root.innerHTML = "";
  }

  private bindEvents(): void {
    const { signal } = this.events;
    window.addEventListener("resize", () => this.resize(), { signal });
    document.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
    this.input = new InputController(
      this.canvas,
      {
        unlockAudio: () => void this.audio.unlock(),
        shoot: () => this.handleShootInput(performance.now() / 1000),
        reload: () => this.handleReloadInput(performance.now() / 1000),
        interact: () => this.handleInteractInput(),
        toggleFlashlight: () => this.handleToggleFlashlightInput(),
        throwDistraction: () => this.handleThrowDistractionInput(),
        jump: () => this.handleJumpInput(),
        equipSlot: (index) => this.handleEquipSlotInput(index),
        look: (movementX, movementY) => this.handleLook(movementX, movementY),
        cancel: () => {
          if (this.state === "playing") {
            document.exitPointerLock?.();
          }
        }
      },
      signal,
      window,
      { allowUnlockedLook: this.smokeMode }
    );
    this.input.install();
    this.hud.startButton.addEventListener("click", () => {
      this.start();
      this.canvas.requestPointerLock?.();
    }, { signal });
    this.hud.restartButton.addEventListener("click", () => this.restart(), { signal });
    document.addEventListener("pointerlockchange", () => {
      document.body.classList.toggle("is-locked", document.pointerLockElement === this.canvas);
    }, { signal });
  }

  private setupMultiplayer(): void {
    if (!this.multiplayerConfig.enabled || this.smokeMode) {
      return;
    }

    this.multiplayer = new LanMultiplayerClient(this.multiplayerConfig);
    this.multiplayer.on("welcome", (message) => {
      this.localNetworkId = message.playerId;
      this.flashStatus(message.role === "host" ? "LAN host ready" : "Joined LAN game");
    });
    this.multiplayer.on("status", (message) => this.flashStatus(message));
    this.multiplayer.on("peerJoined", (message) => {
      if (this.isNetworkHost) {
        this.addNetworkPlayer(message.playerId, message.name);
      }
    });
    this.multiplayer.on("peerLeft", (message) => this.removeNetworkPlayer(message.playerId));
    this.multiplayer.on("input", (message) => {
      if (!this.isNetworkHost) return;
      const player = this.networkPlayers.get(message.playerId) ?? this.addNetworkPlayer(message.playerId, `Player ${message.playerId}`);
      player.input = message.input;
      player.yaw = message.input.yaw;
      player.pitch = message.input.pitch;
      player.lastInputAt = performance.now() / 1000;
    });
    this.multiplayer.on("action", (message) => {
      if (this.isNetworkHost) {
        this.handleNetworkPlayerAction(message.playerId, message.action);
      }
    });
    this.multiplayer.on("snapshot", (message) => {
      if (this.isNetworkClient) {
        this.applyNetworkSnapshot(message.snapshot);
      }
    });

    if (this.isNetworkClient) {
      this.clearNetworkAuthoritativeEntities();
      this.flashStatus("Connecting to LAN host");
    } else {
      this.flashStatus("Starting LAN host");
    }
    this.multiplayer.connect();
  }

  private handleShootInput(now: number): void {
    if (this.sendNetworkAction("shoot")) {
      return;
    }
    this.shoot(now);
  }

  private handleReloadInput(now: number): void {
    if (this.sendNetworkAction("reload")) {
      return;
    }
    this.reload(now);
  }

  private handleInteractInput(): boolean {
    if (this.sendNetworkAction("interact")) {
      return true;
    }
    return this.handleInteract();
  }

  private handleToggleFlashlightInput(): boolean {
    if (this.sendNetworkAction("toggleFlashlight")) {
      return true;
    }
    return this.toggleFlashlight();
  }

  private handleThrowDistractionInput(): boolean {
    if (this.sendNetworkAction("throwDistraction")) {
      return true;
    }
    return this.throwDistraction();
  }

  private handleJumpInput(): boolean {
    if (this.sendNetworkAction("jump")) {
      return true;
    }
    return this.jump();
  }

  private handleEquipSlotInput(index: number): void {
    if (this.sendNetworkAction("equipSlot", index)) {
      return;
    }
    this.equipSlot(index);
  }

  private sendNetworkAction(type: NetworkAction["type"], slot?: number): boolean {
    if (!this.isNetworkClient || !this.multiplayer) {
      return false;
    }
    this.multiplayer.sendAction({
      type,
      slot,
      sequence: ++this.networkActionSequence,
      yaw: this.player.yaw,
      pitch: this.player.pitch
    });
    return true;
  }

  private start(): void {
    this.state = "playing";
    this.hud.hideOverlay();
    void this.audio.unlock();
  }

  private reload(now: number): void {
    this.aimHeld = false;
    this.loadout = startReload(this.loadout, now);
    if (this.loadout.reloadingUntil > 0) {
      this.emitNoise("reload", { x: this.player.position.x, z: this.player.position.z }, this.player.crouching ? 0.55 : 1, {
        weaponId: this.loadout.weaponId
      });
    }
  }

  private equipSlot(index: number): void {
    const weaponId = this.loadout.inventory[index];
    if (weaponId) {
      this.equipWeapon(weaponId);
    }
  }

  private restart(): void {
    if (this.isNetworkClient) {
      this.hud.setStatus("Waiting for host restart");
      return;
    }
    this.player.position.set(START_POSITION.x, this.groundY({ x: START_POSITION.x, z: START_POSITION.z }), START_POSITION.z);
    this.player.health = 100;
    this.player.scrap = 70;
    this.player.kills = 0;
    this.player.height = 0;
    this.player.heightTarget = 0;
    this.player.jumpHeight = 0;
    this.player.jumpVelocity = 0;
    this.player.crouching = false;
    this.player.crouchAmount = 0;
    this.player.activeFixtureId = null;
    this.player.yaw = -2.45;
    this.player.pitch = -0.08;
    this.loadout = createInitialLoadout();
    this.rebuildViewWeapon();
    this.resetWaves();
    this.movementNoiseTimer = 0;
    this.elevatedNoiseTimer = 0;
    this.input?.clear();
    this.isSprinting = false;
    this.distractionCooldown = 0;
    this.flashlightNoiseTimer = 0;
    this.condition = createInitialPlayerCondition();
    this.applyFlashlightVisibility();
    this.testCrouchOverride = null;
    this.zombies.forEach((zombie) => this.scene.remove(zombie.mesh));
    this.pickups.forEach((pickup) => this.scene.remove(pickup.mesh));
    this.weaponDrops.forEach((drop) => this.scene.remove(drop.mesh));
    this.tracers.forEach((tracer) => this.scene.remove(tracer.mesh));
    this.shells.forEach((shell) => this.scene.remove(shell.mesh));
    this.smokePuffs.forEach((puff) => this.scene.remove(puff.mesh));
    this.distractions.forEach((distraction) => this.scene.remove(distraction.mesh));
    this.zombies = [];
    this.pickups = [];
    this.weaponDrops = [];
    this.tracers = [];
    this.shells = [];
    this.smokePuffs = [];
    this.distractions.length = 0;
    this.recoil = 0;
    this.recoilYaw = 0;
    this.meleeSwing = 0;
    this.meleeSwingSide = 1;
    this.shotBloom = 0;
    this.aimHeld = false;
    this.scopeAmount = 0;
    this.lastHitZone = null;
    this.root.classList.remove("is-scoped");
    this.root.classList.remove("is-crouched");
    this.root.classList.remove("is-bleeding");
    this.root.classList.remove("is-limping");
    this.root.classList.remove("is-blurred");
    document.body.classList.remove("is-bleeding", "is-limping", "is-blurred");
    this.noise.clear();
    this.activeAmenitySearch = null;
    this.activeAmenityRest = null;
    this.searchedAmenityIds.clear();
    this.nearestBike = null;
    this.nearestBrokenBike = null;
    this.resetRideableBike();
    this.resetNetworkPlayersForHost();
    this.hud.setRestartVisible(false);
    this.state = "playing";
    this.spawnInitialWeapons();
    this.updateHud();
    if (this.isNetworkHost && this.multiplayer?.connected) {
      this.multiplayer.sendSnapshot(this.buildNetworkSnapshot());
    }
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

    const atmosphere = this.atmosphere.update(dt, this.camera.position, time / 1000);
    const { timeOfDay, weather } = atmosphere;
    this.currentWeather = weather;
    this.world.updateTimeOfDay(timeOfDay, weather);
    this.postProcessing.setTimeOfDay(timeOfDay);
    this.postProcessing.setWeather(weather);
    this.renderer.toneMappingExposure = timeOfDay.exposure * weather.exposureMultiplier;
    this.postProcessing.render(dt, this.renderer, this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame((next) => this.tick(next));
  }

  private update(dt: number, now: number): void {
    if (this.isNetworkClient) {
      this.updateNetworkClientFrame(dt, now);
      return;
    }

    this.loadout = finishReloadIfReady(this.loadout, now);
    this.noise.update(dt);
    this.updateCrouch(dt);
    this.updateJumpState(dt);
    this.updateMovement(dt);
    this.updateVerticalState(dt);
    this.updateElevatedNoise(dt);
    this.updateDistractions(dt);
    this.updateNetworkHostPlayers(dt, now);
    this.updateWavePacing(dt);
    this.updateZombies(dt, now);
    this.updatePickups(dt);
    this.updateWeaponDrops(dt);
    this.updateBike(dt);
    this.updateAmenityRest(dt);
    this.updateAmenitySearch(dt);
    this.updateTracers(dt);
    this.updateShells(dt);
    this.updateSmokePuffs(dt);
    this.updateNearestStation();
    this.updateNearestAmenity();
    this.updateNearestBrokenBike();
    this.updateNearestFixture();
    this.updateScope(dt, now);
    this.updatePlayerCondition(dt);
    this.updateWeaponModel(dt);
    this.updateCamera();
    this.updateAudio(dt);
    this.updateHud();
    this.updateMiniMap();
    this.sendNetworkSnapshotFrame(dt);

    if (this.isNetworkHost) {
      if (this.combatants().length === 0) {
        this.gameOver();
      }
    } else if (this.player.health <= 0) {
      this.gameOver();
    }
  }

  private updateNetworkClientFrame(dt: number, now: number): void {
    this.sendNetworkInputFrame(dt);
    this.loadout = finishReloadIfReady(this.loadout, now);
    this.updateCrouch(dt);
    this.updateJumpState(dt);
    this.updateMovement(dt);
    this.updateVerticalState(dt);
    this.updateWeaponDrops(dt);
    this.updateNetworkClientBikeTarget();
    this.updateTracers(dt);
    this.updateShells(dt);
    this.updateSmokePuffs(dt);
    this.updateNearestStation();
    this.updateNearestAmenity();
    this.updateNearestBrokenBike();
    this.updateNearestFixture();
    this.updateScope(dt, now);
    this.updateWeaponModel(dt);
    this.updateCamera();
    this.updateAudio(dt);
    this.updateHud();
    this.updateMiniMap();
  }

  private updateNetworkClientBikeTarget(): void {
    if (!this.bike || this.bike.mounted) {
      this.nearestBike = null;
      return;
    }
    const distanceToBike = this.bike.position.distanceTo(this.player.position);
    this.nearestBike = distanceToBike < BIKE_INTERACTION_RADIUS ? this.bike : null;
  }

  private sendNetworkInputFrame(dt: number): void {
    if (!this.isNetworkClient || !this.multiplayer || this.state !== "playing") {
      return;
    }
    this.networkInputTimer -= dt;
    if (this.networkInputTimer > 0) {
      return;
    }
    this.multiplayer.sendInput(this.currentNetworkInput());
    this.networkInputTimer = 1 / NETWORK_INPUT_HZ;
  }

  private currentNetworkInput(): NetworkInputState {
    const movement = this.input?.movement() ?? { x: 0, z: 0, length: 0 };
    return {
      sequence: ++this.networkInputSequence,
      moveX: movement.x,
      moveZ: movement.z,
      sprint: this.input?.isSprinting() ?? false,
      crouch: this.input?.isCrouching() ?? false,
      aim: this.aimHeld,
      yaw: this.player.yaw,
      pitch: this.player.pitch
    };
  }

  private sendNetworkSnapshotFrame(dt: number): void {
    if (!this.isNetworkHost || !this.multiplayer || !this.multiplayer.connected) {
      return;
    }
    this.networkSnapshotTimer -= dt;
    if (this.networkSnapshotTimer > 0) {
      return;
    }
    this.multiplayer.sendSnapshot(this.buildNetworkSnapshot());
    this.networkSnapshotTimer = 1 / NETWORK_SNAPSHOT_HZ;
  }

  private buildNetworkSnapshot(): NetworkGameSnapshot {
    return {
      frame: this.frame,
      sentAt: performance.now(),
      roomId: this.multiplayerConfig.roomId,
      hostId: this.localNetworkId,
      state: this.state,
      wave: this.wave,
      wavePhase: this.wavePhase,
      intermissionTimer: this.intermissionTimer,
      remainingSpawns: this.waveDirector.remainingSpawns,
      players: [this.localPlayerNetworkSnapshot(), ...[...this.networkPlayers.values()].map((player) => this.remotePlayerNetworkSnapshot(player))],
      zombies: this.zombies.map((zombie) => this.zombieNetworkSnapshot(zombie)),
      pickups: this.pickups.map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        amount: pickup.amount,
        x: pickup.position.x,
        y: pickup.position.y,
        z: pickup.position.z,
        ttl: pickup.ttl
      })),
      weaponDrops: this.weaponDrops.map((drop) => ({
        id: drop.id,
        weaponId: drop.weaponId,
        label: drop.label,
        x: drop.position.x,
        y: drop.position.y,
        z: drop.position.z,
        ttl: drop.ttl,
        source: drop.source
      })),
      bike: this.bike
        ? {
            x: this.bike.position.x,
            y: this.bike.position.y,
            z: this.bike.position.z,
            angle: this.bike.angle,
            mounted: this.bike.mounted
          }
        : null
    };
  }

  private localPlayerNetworkSnapshot(): NetworkPlayerSnapshot {
    return {
      id: this.localNetworkId,
      name: this.multiplayerConfig.playerName,
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      health: this.player.health,
      scrap: this.player.scrap,
      stamina: this.condition.stamina,
      bleedTimer: this.condition.bleedTimer,
      limpTimer: this.condition.limpTimer,
      blurTimer: this.condition.blurTimer,
      crouching: this.player.crouching,
      aim: this.aimHeld,
      height: this.player.height,
      jumpHeight: this.player.jumpHeight,
      activeFixtureId: this.player.activeFixtureId,
      flashlightOn: this.condition.flashlightOn,
      throwables: this.condition.throwables,
      loadout: this.loadout,
      bikeMounted: this.bike?.mounted === true,
      alive: this.player.health > 0
    };
  }

  private remotePlayerNetworkSnapshot(player: NetworkRemotePlayer): NetworkPlayerSnapshot {
    return {
      id: player.id,
      name: player.name,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health,
      scrap: player.scrap,
      stamina: player.condition.stamina,
      bleedTimer: player.condition.bleedTimer,
      limpTimer: player.condition.limpTimer,
      blurTimer: player.condition.blurTimer,
      crouching: player.crouching,
      aim: player.input.aim,
      height: player.height,
      jumpHeight: player.jumpHeight,
      activeFixtureId: player.activeFixtureId,
      flashlightOn: player.condition.flashlightOn,
      throwables: player.condition.throwables,
      loadout: player.loadout,
      bikeMounted: false,
      alive: player.health > 0
    };
  }

  private zombieNetworkSnapshot(zombie: Zombie): NetworkZombieSnapshot {
    return {
      id: zombie.id,
      type: zombie.type,
      x: zombie.position.x,
      y: zombie.position.y,
      z: zombie.position.z,
      rotationY: zombie.mesh.rotation.y,
      health: zombie.health,
      maxHealth: zombie.maxHealth,
      radius: zombie.radius,
      aiState: zombie.aiState
    };
  }

  private updateNetworkHostPlayers(dt: number, now: number): void {
    if (!this.isNetworkHost) {
      return;
    }
    for (const player of this.networkPlayers.values()) {
      player.loadout = finishReloadIfReady(player.loadout, now);
      if (player.health <= 0) {
        player.velocity.multiplyScalar(0.72);
        this.updateRemotePlayerMesh(player);
        continue;
      }
      this.updateNetworkPlayerCrouch(player, dt);
      this.updateNetworkPlayerJumpState(player, dt);
      this.updateNetworkPlayerMovement(player, dt, now);
      this.updateNetworkPlayerVerticalState(player, dt);
      this.updateNetworkPlayerCondition(player, dt);
      this.updateRemotePlayerMesh(player);
    }
  }

  private updateNetworkPlayerCrouch(player: NetworkRemotePlayer, dt: number): void {
    player.crouching = player.input.crouch;
    const target = player.crouching ? 1 : 0;
    const t = 1 - Math.pow(0.0008, dt);
    player.crouchAmount += (target - player.crouchAmount) * t;
    if (player.crouchAmount < 0.01) player.crouchAmount = 0;
  }

  private updateNetworkPlayerMovement(player: NetworkRemotePlayer, dt: number, now: number): void {
    const stale = now - player.lastInputAt > 1.5;
    const input = stale ? new THREE.Vector3() : new THREE.Vector3(player.input.moveX, 0, player.input.moveZ);
    const inputLength = Math.min(1, Math.hypot(input.x, input.z));

    if (inputLength > 0.001) {
      input.normalize();
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const forward = new THREE.Vector3(sin, 0, cos);
      const right = new THREE.Vector3(cos, 0, -sin);
      const wantsSprint = !player.crouching && player.input.sprint;
      const sprinting = wantsSprint && player.condition.stamina > 8 && player.condition.limpTimer <= 0;
      player.isSprinting = sprinting;
      const surface = this.movementSurfaceAt({ x: player.position.x, z: player.position.z });
      const speed =
        (player.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED) *
        this.surfaceSpeedMultiplier(surface) *
        speedMultiplierForCondition(player.condition);
      player.velocity.copy(forward.multiplyScalar(input.z).add(right.multiplyScalar(input.x))).multiplyScalar(speed);
      this.emitNetworkPlayerMovementNoise(player, dt, sprinting);
    } else {
      player.isSprinting = false;
      player.velocity.multiplyScalar(0.78);
      if (player.velocity.lengthSq() < 0.01) {
        player.velocity.set(0, 0, 0);
      }
    }

    const candidate = player.position.clone().addScaledVector(player.velocity, dt);
    let next = clampToPolygon({ x: candidate.x, z: candidate.z }, this.level.boundary, 3);
    for (const obstacle of this.level.obstacles) {
      if (obstacle.jumpable === true && player.jumpHeight >= (obstacle.jumpBypassMinHeight ?? 0.5)) {
        continue;
      }
      if (this.shouldBypassObstacleForFixture(obstacle.id, next, player.activeFixtureId)) {
        continue;
      }
      next = resolveObstacle(next, PLAYER_RADIUS, obstacle);
    }
    next = this.resolveSkateBowlExit({ x: player.position.x, z: player.position.z }, next, player.velocity);
    player.position.set(next.x, this.groundY(next), next.z);
  }

  private updateNetworkPlayerCondition(player: NetworkRemotePlayer, dt: number): void {
    player.condition.bleedTimer = Math.max(0, player.condition.bleedTimer - dt);
    player.condition.limpTimer = Math.max(0, player.condition.limpTimer - dt);
    player.condition.blurTimer = Math.max(0, player.condition.blurTimer - dt);
    const bleedDamage = bleedDamagePerSecond(player.condition.bleedTimer) * dt;
    if (bleedDamage > 0) {
      player.health -= bleedDamage;
    }
    const scoped = player.input.aim;
    player.condition.stamina = nextStamina(player.condition.stamina, dt, {
      sprinting: player.isSprinting,
      scoped,
      resting: false,
      searching: false,
      crouching: player.crouching,
      bleeding: player.condition.bleedTimer > 0
    });
  }

  private updateNetworkPlayerJumpState(player: NetworkRemotePlayer, dt: number): void {
    if (player.activeFixtureId || player.height > 0.2) {
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
      return;
    }
    if (player.jumpHeight <= 0 && player.jumpVelocity <= 0) {
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
      return;
    }
    player.jumpVelocity -= JUMP_GRAVITY * dt;
    player.jumpHeight += player.jumpVelocity * dt;
    if (player.jumpHeight <= 0) {
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
    }
  }

  private updateNetworkPlayerVerticalState(player: NetworkRemotePlayer, dt: number): void {
    let target = 0;
    const playerPoint = { x: player.position.x, z: player.position.z };
    const active = this.level.interactables.find((fixture) => fixture.id === player.activeFixtureId);

    if (active) {
      if (pointInInteractableRaisedFootprint(playerPoint, active, 1.2)) {
        target = Math.max(target, active.height);
      } else {
        player.activeFixtureId = null;
      }
    }

    for (const fixture of this.level.interactables.filter((candidate) => candidate.mode === "auto")) {
      if (pointInInteractableRaisedFootprint(playerPoint, fixture, 0.8)) {
        target = Math.max(target, fixture.height);
      }
    }

    player.heightTarget = target;
    const t = 1 - Math.pow(0.001, dt);
    player.height += (player.heightTarget - player.height) * t;
    if (Math.abs(player.height) < 0.01) {
      player.height = 0;
    }
  }

  private emitNetworkPlayerMovementNoise(player: NetworkRemotePlayer, dt: number, sprinting: boolean): void {
    player.movementNoiseTimer -= dt;
    if (player.movementNoiseTimer > 0) {
      return;
    }
    const kind = movementNoiseKind(player.velocity.length(), player.crouching, sprinting);
    if (!kind) {
      return;
    }
    const playerPoint = { x: player.position.x, z: player.position.z };
    const surface = this.movementSurfaceAt(playerPoint);
    this.emitNoise(kind, playerPoint, movementNoiseMultiplier(player.crouching, surface, this.currentWeather.footstepMask), { surface });
    player.movementNoiseTimer = player.crouching ? 0.82 : sprinting ? 0.28 : 0.46;
  }

  private addNetworkPlayer(id: string, name: string): NetworkRemotePlayer {
    const existing = this.networkPlayers.get(id);
    if (existing) {
      existing.name = name;
      return existing;
    }

    const offsetIndex = this.networkPlayers.size + 1;
    const position = new THREE.Vector3(
      START_POSITION.x + offsetIndex * 3.2,
      this.groundY({ x: START_POSITION.x + offsetIndex * 3.2, z: START_POSITION.z + offsetIndex * 2.2 }),
      START_POSITION.z + offsetIndex * 2.2
    );
    const loadout = createInitialLoadout();
    const player: NetworkRemotePlayer = {
      id,
      name,
      mesh: this.createRemotePlayerMesh(loadout.weaponId),
      weaponIdRendered: loadout.weaponId,
      position,
      velocity: new THREE.Vector3(),
      yaw: -2.45,
      pitch: -0.08,
      health: 100,
      scrap: 70,
      loadout,
      condition: createInitialPlayerCondition(),
      input: {
        sequence: 0,
        moveX: 0,
        moveZ: 0,
        sprint: false,
        crouch: false,
        aim: false,
        yaw: -2.45,
        pitch: -0.08
      },
      lastInputAt: performance.now() / 1000,
      lastShotAt: 0,
      shotBloom: 0,
      movementNoiseTimer: 0,
      isSprinting: false,
      crouching: false,
      crouchAmount: 0,
      height: 0,
      heightTarget: 0,
      jumpHeight: 0,
      jumpVelocity: 0,
      activeFixtureId: null
    };
    this.scene.add(player.mesh);
    this.updateRemotePlayerMesh(player);
    this.networkPlayers.set(id, player);
    return player;
  }

  private removeNetworkPlayer(id: string): void {
    const player = this.networkPlayers.get(id);
    if (!player) {
      return;
    }
    this.scene.remove(player.mesh);
    this.networkPlayers.delete(id);
  }

  private resetNetworkPlayersForHost(): void {
    if (!this.isNetworkHost) {
      return;
    }
    let offsetIndex = 1;
    for (const player of this.networkPlayers.values()) {
      const x = START_POSITION.x + offsetIndex * 3.2;
      const z = START_POSITION.z + offsetIndex * 2.2;
      player.position.set(x, this.groundY({ x, z }), z);
      player.velocity.set(0, 0, 0);
      player.yaw = -2.45;
      player.pitch = -0.08;
      player.health = 100;
      player.scrap = 70;
      player.loadout = createInitialLoadout();
      player.condition = createInitialPlayerCondition();
      player.lastShotAt = 0;
      player.shotBloom = 0;
      player.movementNoiseTimer = 0;
      player.isSprinting = false;
      player.crouching = false;
      player.crouchAmount = 0;
      player.height = 0;
      player.heightTarget = 0;
      player.jumpHeight = 0;
      player.jumpVelocity = 0;
      player.activeFixtureId = null;
      player.input = {
        ...player.input,
        moveX: 0,
        moveZ: 0,
        sprint: false,
        crouch: false,
        aim: false,
        yaw: player.yaw,
        pitch: player.pitch
      };
      this.updateRemotePlayerMesh(player);
      offsetIndex += 1;
    }
  }

  private createRemotePlayerMesh(weaponId: WeaponId): THREE.Group {
    const group = new THREE.Group();
    group.userData.dynamic = true;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8f93, roughness: 0.78, metalness: 0.02 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1e282b, roughness: 0.84, metalness: 0.04 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xcaa47c, roughness: 0.74 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.08, 4, 9), bodyMaterial);
    body.position.y = 1.34;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skinMaterial);
    head.position.y = 2.18;
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.72, 3, 7), darkMaterial);
    leftLeg.position.set(-0.19, 0.52, 0);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.19;
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.78, 3, 7), bodyMaterial);
    leftArm.position.set(-0.5, 1.38, -0.1);
    leftArm.rotation.z = 0.22;
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.5;
    rightArm.rotation.z = -0.22;
    const weapon = this.meshFactory.createWeaponMesh(weaponId, false);
    weapon.name = "remote-weapon";
    weapon.position.set(0.34, 1.25, -0.62);
    weapon.rotation.set(0.2, Math.PI, -0.08);
    weapon.scale.setScalar(0.74);
    group.add(body, head, leftLeg, rightLeg, leftArm, rightArm, weapon);
    return group;
  }

  private updateRemotePlayerMesh(player: NetworkRemotePlayer): void {
    if (player.weaponIdRendered !== player.loadout.weaponId) {
      this.rebuildRemotePlayerWeapon(player);
    }
    player.mesh.position.set(player.position.x, player.position.y + player.height + player.jumpHeight, player.position.z);
    player.mesh.rotation.y = player.yaw + Math.PI;
    const crouchScale = 1 - player.crouchAmount * 0.16;
    player.mesh.scale.set(1, Math.max(0.82, crouchScale), 1);
    player.mesh.visible = player.health > 0;
  }

  private rebuildRemotePlayerWeapon(player: NetworkRemotePlayer): void {
    const previous = player.mesh.getObjectByName("remote-weapon");
    if (previous) {
      player.mesh.remove(previous);
    }
    const weapon = this.meshFactory.createWeaponMesh(player.loadout.weaponId, false);
    weapon.name = "remote-weapon";
    weapon.position.set(0.34, 1.25, -0.62);
    weapon.rotation.set(0.2, Math.PI, -0.08);
    weapon.scale.setScalar(0.74);
    player.mesh.add(weapon);
    player.weaponIdRendered = player.loadout.weaponId;
  }

  private handleNetworkPlayerAction(playerId: string, action: NetworkAction): void {
    const player = this.networkPlayers.get(playerId);
    if (!player || player.health <= 0 || this.state !== "playing") {
      return;
    }
    player.yaw = action.yaw;
    player.pitch = action.pitch;
    player.input = {
      ...player.input,
      yaw: action.yaw,
      pitch: action.pitch,
      aim: player.input.aim
    };
    const now = performance.now() / 1000;
    if (action.type === "shoot") this.shootNetworkPlayer(player, now);
    if (action.type === "reload") this.reloadNetworkPlayer(player, now);
    if (action.type === "interact") this.interactNetworkPlayer(player);
    if (action.type === "toggleFlashlight") this.toggleNetworkPlayerFlashlight(player);
    if (action.type === "throwDistraction") this.throwNetworkPlayerDistraction(player);
    if (action.type === "jump") this.jumpNetworkPlayer(player);
    if (action.type === "equipSlot" && typeof action.slot === "number") this.equipNetworkPlayerSlot(player, action.slot);
  }

  private shootNetworkPlayer(player: NetworkRemotePlayer, now: number): void {
    const stats = getWeaponStats(player.loadout);
    if (now - player.lastShotAt < stats.fireDelay) {
      return;
    }
    if (stats.kind === "melee") {
      this.swingNetworkPlayerMelee(player, now, stats);
      return;
    }
    if (player.loadout.reloadingUntil > now) {
      return;
    }
    if (player.loadout.ammoInMagazine <= 0) {
      player.loadout = startReload(player.loadout, now);
      return;
    }

    player.loadout = consumeRound(player.loadout);
    player.lastShotAt = now;
    player.shotBloom = Math.min(stats.maxBloom, player.shotBloom + stats.bloomPerShot);
    this.emitNoise("gunshot", { x: player.position.x, z: player.position.z }, stats.noiseMultiplier * (player.crouching ? 0.96 : 1), {
      weaponId: player.loadout.weaponId
    });

    const origin = this.networkPlayerCameraPosition(player);
    const movementSpread = Math.min(1, player.velocity.length() / 22) * stats.movingSpread;
    const crouchSpread = player.crouching ? 0.64 : 1;
    const breathControl = player.input.aim ? (player.condition.stamina > 12 ? 0.86 : 1.18) : 1;
    const totalSpread = (stats.spread + movementSpread + player.shotBloom) * (player.input.aim ? stats.aimSpreadMultiplier : 1) * crouchSpread * breathControl;
    for (let pellet = 0; pellet < stats.pellets; pellet += 1) {
      const direction = this.directionFromYawPitch(player.yaw, player.pitch);
      direction.x += this.rng.range(-totalSpread, totalSpread);
      direction.y += this.rng.range(-totalSpread, totalSpread) * 0.55;
      direction.z += this.rng.range(-totalSpread, totalSpread);
      direction.normalize();
      const hits = this.findZombieHits(origin, direction, stats.range, stats.penetration);
      const endPoint = hits[0]?.point ?? origin.clone().addScaledVector(direction, stats.range);
      for (const hit of hits) {
        hit.zombie.health -= damageAtDistance(stats, hit.distance, hit.zone);
        const profile = zombieProfile(hit.zombie.type);
        hit.zombie.staggerTimer = Math.max(hit.zombie.staggerTimer, (stats.staggerPower + (hit.zone === "legs" ? 0.22 : 0)) / profile.staggerResistance);
        hit.zombie.aiState = "chase";
        hit.zombie.target = { x: player.position.x, z: player.position.z };
        hit.zombie.lastKnownPlayer = hit.zombie.target;
        hit.zombie.memoryTimer = this.rng.range(2.6, 4.4);
        this.createHitSpark(hit.point);
        if (hit.zombie.health <= 0) {
          this.killZombie(hit.zombie, player);
        }
      }
      this.addTracer(origin, endPoint);
    }
  }

  private swingNetworkPlayerMelee(player: NetworkRemotePlayer, now: number, stats: ReturnType<typeof getWeaponStats>): void {
    const staminaCost = player.loadout.weaponId === "machete" ? MACHETE_STAMINA_COST : MELEE_STAMINA_COST;
    const stamina = spendStamina(player.condition.stamina, staminaCost);
    if (!stamina.spent) {
      return;
    }
    player.condition.stamina = stamina.stamina;
    player.lastShotAt = now;
    this.emitNoise("melee", { x: player.position.x, z: player.position.z }, stats.noiseMultiplier * (player.crouching ? 0.7 : 1), {
      weaponId: player.loadout.weaponId
    });
    const direction = this.directionFromYawPitch(player.yaw, player.pitch);
    const hits = this.findMeleeHitsFor(player.position, direction, stats.range, Math.max(1, stats.penetration), player.crouching, player.loadout.weaponId);
    for (const hit of hits) {
      hit.zombie.health -= damageAtDistance(stats, hit.distance, hit.zone);
      const profile = zombieProfile(hit.zombie.type);
      hit.zombie.staggerTimer = Math.max(hit.zombie.staggerTimer, (stats.staggerPower + (hit.zone === "head" ? 0.18 : 0)) / profile.staggerResistance);
      hit.zombie.aiState = "chase";
      hit.zombie.target = { x: player.position.x, z: player.position.z };
      hit.zombie.lastKnownPlayer = hit.zombie.target;
      hit.zombie.memoryTimer = this.rng.range(2, 3.6);
      this.createHitSpark(hit.point);
      if (hit.zombie.health <= 0) {
        this.killZombie(hit.zombie, player);
      }
    }
  }

  private reloadNetworkPlayer(player: NetworkRemotePlayer, now: number): void {
    player.loadout = startReload(player.loadout, now);
    if (player.loadout.reloadingUntil > 0) {
      this.emitNoise("reload", { x: player.position.x, z: player.position.z }, player.crouching ? 0.55 : 1, {
        weaponId: player.loadout.weaponId
      });
    }
  }

  private jumpNetworkPlayer(player: NetworkRemotePlayer): boolean {
    if (player.activeFixtureId || player.height > 0.2 || player.jumpHeight > 0.02 || player.crouching) {
      return false;
    }
    const stamina = spendStamina(player.condition.stamina, JUMP_STAMINA_COST);
    if (!stamina.spent) {
      return false;
    }
    player.condition.stamina = stamina.stamina;
    player.jumpVelocity = JUMP_INITIAL_VELOCITY;
    player.jumpHeight = 0.04;
    this.emitNoise("footstep", { x: player.position.x, z: player.position.z }, 0.46, { volume: 0.38 });
    return true;
  }

  private equipNetworkPlayerSlot(player: NetworkRemotePlayer, index: number): void {
    const weaponId = player.loadout.inventory[index];
    if (weaponId) {
      player.loadout = switchWeapon(player.loadout, weaponId);
    }
  }

  private toggleNetworkPlayerFlashlight(player: NetworkRemotePlayer): void {
    player.condition.flashlightOn = !player.condition.flashlightOn;
    this.emitNoise("flashlight", { x: player.position.x, z: player.position.z }, player.condition.flashlightOn ? 0.82 : 0.44, { volume: 0.5 });
  }

  private throwNetworkPlayerDistraction(player: NetworkRemotePlayer): boolean {
    if (player.condition.throwables <= 0) {
      return false;
    }
    const stamina = spendStamina(player.condition.stamina, DISTRACTION_STAMINA_COST);
    if (!stamina.spent) {
      return false;
    }
    player.condition.stamina = stamina.stamina;
    player.condition.throwables -= 1;
    const forward = this.directionFromYawPitch(player.yaw, player.pitch);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) {
      forward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    }
    forward.normalize();
    const range = this.rng.range(22, 31);
    let target = clampToPolygon(
      {
        x: player.position.x + forward.x * range,
        z: player.position.z + forward.z * range
      },
      this.level.boundary,
      4
    );
    for (const obstacle of this.level.obstacles) {
      target = resolveObstacle(target, 0.5, obstacle);
    }
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0x6f8f93, metalness: 0.18, roughness: 0.72 })
    );
    mesh.position.set(target.x, this.groundY(target) + 0.21, target.z);
    mesh.userData.dynamic = true;
    this.scene.add(mesh);
    this.distractions.push({ mesh, position: { ...target }, ttl: 7.2, pulseTimer: 1.35 });
    this.emitNoise("distraction", target, 1.05);
    return true;
  }

  private interactNetworkPlayer(player: NetworkRemotePlayer): boolean {
    const drop = this.nearestWeaponDropForPoint(player.position, 8.2);
    if (drop) {
      player.loadout = addWeapon(player.loadout, drop.weaponId);
      this.scene.remove(drop.mesh);
      this.weaponDrops = this.weaponDrops.filter((candidate) => candidate !== drop);
      return true;
    }

    const station = this.nearestStationForPoint(player.position, 10);
    if (station) {
      return this.buyUpgradeForNetworkPlayer(player, station);
    }

    const amenity = this.nearestAmenityForPoint(player.position);
    if (amenity) {
      return this.useAmenityForNetworkPlayer(player, amenity);
    }
    return false;
  }

  private buyUpgradeForNetworkPlayer(player: NetworkRemotePlayer, station: UpgradeStation): boolean {
    const upgradeId = station.upgradeId;
    const currentLevel = player.loadout.upgrades[upgradeId];
    if (!canUpgrade(player.loadout, upgradeId)) {
      return false;
    }
    const cost = upgradeCost(upgradeId, currentLevel);
    if (player.scrap < cost) {
      return false;
    }
    player.scrap -= cost;
    player.loadout = applyUpgrade(player.loadout, upgradeId);
    return true;
  }

  private useAmenityForNetworkPlayer(player: NetworkRemotePlayer, amenity: AmenityPoint): boolean {
    if (amenity.kind === "drinking_water") {
      player.health = Math.min(100, player.health + 24);
      return true;
    }
    if (amenity.kind === "bench" || amenity.kind === "picnic_table") {
      player.health = Math.min(100, player.health + (amenity.kind === "bench" ? 10 : 12));
      return true;
    }
    if (this.searchedAmenityIds.has(amenity.id)) {
      return false;
    }
    this.searchedAmenityIds.add(amenity.id);
    const loot = searchAmenityLoot(amenity.kind, this.rng, this.lootSearchContext(amenity));
    player.scrap += loot.scrap;
    player.health = Math.min(100, player.health + loot.health);
    player.loadout = addAmmo(player.loadout, loot.ammo);
    if (loot.attachment) {
      if (canUpgrade(player.loadout, loot.attachment)) {
        player.loadout = applyUpgrade(player.loadout, loot.attachment);
      } else {
        player.scrap += 12;
      }
    }
    if (loot.medicine > 0) {
      player.condition.bleedTimer = Math.max(0, player.condition.bleedTimer - loot.medicine);
      player.condition.blurTimer = Math.max(0, player.condition.blurTimer - loot.medicine * 0.35);
      player.condition.limpTimer = Math.max(0, player.condition.limpTimer - loot.medicine * 0.25);
    }
    player.condition.throwables = Math.min(MAX_THROWABLES, player.condition.throwables + loot.throwables);
    this.emitNoise("scavenge", amenity.position, loot.noiseMultiplier * 0.75);
    return true;
  }

  private directionFromYawPitch(yaw: number, pitch: number): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, "YXZ")).normalize();
  }

  private networkPlayerCameraPosition(player: NetworkRemotePlayer): THREE.Vector3 {
    return new THREE.Vector3(
      player.position.x,
      player.position.y + PLAYER_HEIGHT + player.height + player.jumpHeight - player.crouchAmount * 0.58,
      player.position.z
    );
  }

  private applyNetworkSnapshot(snapshot: NetworkGameSnapshot): void {
    if (snapshot.roomId !== this.multiplayerConfig.roomId) {
      return;
    }
    this.state = snapshot.state;
    this.networkWave = snapshot.wave;
    this.networkWavePhase = snapshot.wavePhase;
    this.networkIntermissionTimer = snapshot.intermissionTimer;
    this.networkRemainingSpawns = snapshot.remainingSpawns;

    const self = snapshot.players.find((player) => player.id === this.localNetworkId);
    if (self) {
      this.applyLocalPlayerSnapshot(self);
    }
    this.applyRemotePlayerSnapshots(snapshot.players.filter((player) => player.id !== this.localNetworkId));
    this.applyZombieSnapshots(snapshot.zombies);
    this.applyPickupSnapshots(snapshot.pickups);
    this.applyWeaponDropSnapshots(snapshot.weaponDrops);
    this.applyBikeSnapshot(snapshot.bike);
    if (snapshot.state === "gameover") {
      this.hud.setRestartVisible(true);
      this.hud.setStatus(`Overrun at wave ${snapshot.wave}`);
    }
  }

  private applyLocalPlayerSnapshot(snapshot: NetworkPlayerSnapshot): void {
    const previousWeapon = this.loadout.weaponId;
    this.player.position.set(snapshot.x, snapshot.y, snapshot.z);
    this.player.yaw = snapshot.yaw;
    this.player.pitch = snapshot.pitch;
    this.player.health = snapshot.health;
    this.player.scrap = snapshot.scrap;
    this.player.crouching = snapshot.crouching;
    this.player.crouchAmount = snapshot.crouching ? Math.max(this.player.crouchAmount, 0.75) : this.player.crouchAmount;
    this.player.height = snapshot.height;
    this.player.jumpHeight = snapshot.jumpHeight;
    this.player.activeFixtureId = snapshot.activeFixtureId;
    this.loadout = snapshot.loadout;
    this.condition.stamina = snapshot.stamina;
    this.condition.bleedTimer = snapshot.bleedTimer;
    this.condition.limpTimer = snapshot.limpTimer;
    this.condition.blurTimer = snapshot.blurTimer;
    this.condition.throwables = snapshot.throwables;
    this.condition.flashlightOn = snapshot.flashlightOn;
    this.applyFlashlightVisibility();
    if (previousWeapon !== this.loadout.weaponId) {
      this.rebuildViewWeapon();
    }
  }

  private applyRemotePlayerSnapshots(snapshots: NetworkPlayerSnapshot[]): void {
    const seen = new Set<string>();
    for (const snapshot of snapshots) {
      seen.add(snapshot.id);
      const player = this.networkPlayers.get(snapshot.id) ?? this.addNetworkPlayer(snapshot.id, snapshot.name);
      player.name = snapshot.name;
      player.position.set(snapshot.x, snapshot.y, snapshot.z);
      player.yaw = snapshot.yaw;
      player.pitch = snapshot.pitch;
      player.health = snapshot.health;
      player.scrap = snapshot.scrap;
      player.loadout = snapshot.loadout;
      player.condition.stamina = snapshot.stamina;
      player.condition.bleedTimer = snapshot.bleedTimer;
      player.condition.limpTimer = snapshot.limpTimer;
      player.condition.blurTimer = snapshot.blurTimer;
      player.condition.throwables = snapshot.throwables;
      player.condition.flashlightOn = snapshot.flashlightOn;
      player.crouching = snapshot.crouching;
      player.crouchAmount = snapshot.crouching ? 1 : 0;
      player.height = snapshot.height;
      player.jumpHeight = snapshot.jumpHeight;
      player.activeFixtureId = snapshot.activeFixtureId;
      player.input.aim = snapshot.aim;
      this.updateRemotePlayerMesh(player);
    }
    for (const id of [...this.networkPlayers.keys()]) {
      if (!seen.has(id)) {
        this.removeNetworkPlayer(id);
      }
    }
  }

  private applyZombieSnapshots(snapshots: NetworkZombieSnapshot[]): void {
    const seen = new Set<number>();
    const byId = new Map(this.zombies.map((zombie) => [zombie.id, zombie]));
    for (const snapshot of snapshots) {
      seen.add(snapshot.id);
      let zombie = byId.get(snapshot.id);
      if (!zombie) {
        const mesh = this.meshFactory.createZombieMesh(snapshot.type);
        mesh.userData.dynamic = true;
        this.scene.add(mesh);
        zombie = {
          id: snapshot.id,
          type: snapshot.type,
          mesh,
          position: new THREE.Vector3(),
          health: snapshot.health,
          maxHealth: snapshot.maxHealth,
          speed: 0,
          radius: snapshot.radius,
          reward: 0,
          attackCooldown: 0,
          walkOffset: this.rng.range(0, Math.PI * 2),
          aiState: snapshot.aiState,
          target: null,
          lastKnownPlayer: null,
          wanderTimer: 0,
          searchTimer: 0,
          memoryTimer: 0,
          vocalCooldown: 0,
          stepCooldown: 0,
          staggerTimer: 0,
          screamCooldown: 0
        };
        this.zombies.push(zombie);
      }
      zombie.position.set(snapshot.x, snapshot.y, snapshot.z);
      zombie.health = snapshot.health;
      zombie.maxHealth = snapshot.maxHealth;
      zombie.radius = snapshot.radius;
      zombie.aiState = snapshot.aiState;
      zombie.mesh.position.set(snapshot.x, snapshot.y, snapshot.z);
      zombie.mesh.rotation.y = snapshot.rotationY;
    }
    for (const zombie of [...this.zombies]) {
      if (!seen.has(zombie.id)) {
        this.scene.remove(zombie.mesh);
        this.zombies = this.zombies.filter((candidate) => candidate !== zombie);
      }
    }
  }

  private applyPickupSnapshots(snapshots: NetworkPickupSnapshot[]): void {
    const seen = new Set<number>();
    const byId = new Map(this.pickups.map((pickup) => [pickup.id, pickup]));
    for (const snapshot of snapshots) {
      seen.add(snapshot.id);
      let pickup = byId.get(snapshot.id);
      if (!pickup) {
        const mesh = this.meshFactory.createPickupMesh(snapshot.type);
        mesh.userData.dynamic = true;
        this.scene.add(mesh);
        pickup = {
          id: snapshot.id,
          type: snapshot.type,
          amount: snapshot.amount,
          mesh,
          position: mesh.position,
          ttl: snapshot.ttl
        };
        this.pickups.push(pickup);
      }
      pickup.amount = snapshot.amount;
      pickup.ttl = snapshot.ttl;
      pickup.position.set(snapshot.x, snapshot.y, snapshot.z);
      pickup.mesh.position.copy(pickup.position);
    }
    for (const pickup of [...this.pickups]) {
      if (!seen.has(pickup.id)) {
        this.scene.remove(pickup.mesh);
        this.pickups = this.pickups.filter((candidate) => candidate !== pickup);
      }
    }
  }

  private applyWeaponDropSnapshots(snapshots: NetworkWeaponDropSnapshot[]): void {
    const seen = new Set<number>();
    const byId = new Map(this.weaponDrops.map((drop) => [drop.id, drop]));
    for (const snapshot of snapshots) {
      seen.add(snapshot.id);
      let drop = byId.get(snapshot.id);
      if (!drop) {
        const mesh = this.meshFactory.createWeaponDropMesh(snapshot.weaponId);
        mesh.userData.dynamic = true;
        this.scene.add(mesh);
        drop = {
          id: snapshot.id,
          weaponId: snapshot.weaponId,
          label: snapshot.label,
          mesh,
          position: mesh.position,
          ttl: snapshot.ttl,
          source: snapshot.source
        };
        this.weaponDrops.push(drop);
      }
      drop.weaponId = snapshot.weaponId;
      drop.label = snapshot.label;
      drop.ttl = snapshot.ttl;
      drop.position.set(snapshot.x, snapshot.y, snapshot.z);
      drop.mesh.position.copy(drop.position);
    }
    for (const drop of [...this.weaponDrops]) {
      if (!seen.has(drop.id)) {
        this.scene.remove(drop.mesh);
        this.weaponDrops = this.weaponDrops.filter((candidate) => candidate !== drop);
      }
    }
    this.nearestWeaponDrop = this.nearestWeaponDropForPoint(this.player.position, 8.2);
  }

  private applyBikeSnapshot(snapshot: NetworkGameSnapshot["bike"]): void {
    if (!snapshot || !this.bike) {
      return;
    }
    this.bike.position.set(snapshot.x, snapshot.y, snapshot.z);
    this.bike.angle = snapshot.angle;
    this.bike.mounted = snapshot.mounted;
    this.syncBikeMesh();
  }

  private clearNetworkAuthoritativeEntities(): void {
    for (const zombie of this.zombies) this.scene.remove(zombie.mesh);
    for (const pickup of this.pickups) this.scene.remove(pickup.mesh);
    for (const drop of this.weaponDrops) this.scene.remove(drop.mesh);
    for (const tracer of this.tracers) this.scene.remove(tracer.mesh);
    for (const shell of this.shells) this.scene.remove(shell.mesh);
    for (const puff of this.smokePuffs) this.scene.remove(puff.mesh);
    for (const distraction of this.distractions) this.scene.remove(distraction.mesh);
    this.zombies = [];
    this.pickups = [];
    this.weaponDrops = [];
    this.tracers = [];
    this.shells = [];
    this.smokePuffs = [];
    this.distractions.length = 0;
  }

  private updateCrouch(dt: number): void {
    const inputCrouching =
      !this.bike?.mounted &&
      (this.input?.isCrouching() ?? false);
    this.player.crouching = this.testCrouchOverride ?? inputCrouching;
    const target = this.player.crouching ? 1 : 0;
    const t = 1 - Math.pow(0.0008, dt);
    this.player.crouchAmount += (target - this.player.crouchAmount) * t;
    if (this.player.crouchAmount < 0.01) this.player.crouchAmount = 0;
    this.root.classList.toggle("is-crouched", this.player.crouching);
  }

  private updateWavePacing(dt: number): void {
    const update = this.waveDirector.update(dt, {
      activeZombies: this.zombies.length,
      canSpawn: this.state === "playing",
      spawn: (anchor) => this.spawnWaveZombie(anchor)
    });

    if (update.startedIntermission) {
      this.beginIntermissionThreats();
      this.flashStatus(`Regroup before wave ${this.wave + 1}`);
    }

    if (update.startedWave) {
      this.resetIntermissionThreats();
      this.flashStatus(`Wave ${this.wave}`);
    }

    if (this.wavePhase === "intermission") {
      this.updateIntermissionThreats(dt);
    }
  }

  private resetWaves(): void {
    this.waveDirector.reset();
    this.resetIntermissionThreats();
    this.flashStatus(`Wave ${this.wave}`);
  }

  private spawnWaveZombie(anchor?: Vec2): void {
    this.addZombie(createZombieSpawn(getWaveConfig(this.wave), this.level.spawnPoints, this.rng, anchor));
  }

  private resetIntermissionThreats(): void {
    this.intermissionThreatTimer = 0;
    this.intermissionThreatsSpawned = 0;
  }

  private beginIntermissionThreats(): void {
    this.intermissionThreatTimer = this.rng.range(7, 11);
    this.intermissionThreatsSpawned = 0;
  }

  private updateIntermissionThreats(dt: number): void {
    const maxThreats = Math.min(3, 1 + Math.floor(this.wave / 4));
    if (this.intermissionThreatsSpawned >= maxThreats || this.zombies.length >= 2) {
      return;
    }

    this.intermissionThreatTimer -= dt;
    if (this.intermissionThreatTimer > 0) {
      return;
    }

    const config = getWaveConfig(Math.max(1, this.wave));
    this.addZombie(createZombieSpawn(config, this.level.spawnPoints, this.rng));
    this.intermissionThreatsSpawned += 1;
    this.intermissionThreatTimer = this.rng.range(6.5, 10.5);
  }

  private startIntermission(): boolean {
    const started = this.waveDirector.startIntermission();
    if (started) {
      this.beginIntermissionThreats();
      this.flashStatus(`Regroup before wave ${this.wave + 1}`);
    }
    return this.wavePhase === "intermission";
  }

  private updateMovement(dt: number): void {
    if (this.activeAmenityRest) {
      this.player.velocity.set(0, 0, 0);
      this.isSprinting = false;
      return;
    }

    const movement = this.input?.movement() ?? { x: 0, z: 0, length: 0 };
    const input = new THREE.Vector3(movement.x, 0, movement.z);

    if (this.bike?.mounted) {
      this.updateBikeMovement(dt, input);
      return;
    }

    if (movement.length > 0) {
      const sin = Math.sin(this.player.yaw);
      const cos = Math.cos(this.player.yaw);
      const forward = new THREE.Vector3(sin, 0, cos);
      const right = new THREE.Vector3(cos, 0, -sin);
      const wantsSprint = !this.player.crouching && (this.input?.isSprinting() ?? false);
      const sprinting = wantsSprint && this.condition.stamina > 8 && this.condition.limpTimer <= 0;
      this.isSprinting = sprinting;
      const surface = this.movementSurfaceAt({ x: this.player.position.x, z: this.player.position.z });
      const speed =
        (this.player.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED) *
        this.surfaceSpeedMultiplier(surface) *
        speedMultiplierForCondition(this.condition);
      this.player.velocity.copy(forward.multiplyScalar(input.z).add(right.multiplyScalar(input.x))).multiplyScalar(speed);
      this.emitMovementNoise(dt, sprinting);
    } else {
      this.isSprinting = false;
      this.player.velocity.multiplyScalar(0.78);
      if (this.player.velocity.lengthSq() < 0.01) {
        this.player.velocity.set(0, 0, 0);
      }
    }

    const candidate = this.player.position.clone().addScaledVector(this.player.velocity, dt);
    let next = clampToPolygon({ x: candidate.x, z: candidate.z }, this.level.boundary, 3);
    for (const obstacle of this.level.obstacles) {
      if (this.shouldJumpBypassObstacle(obstacle)) {
        continue;
      }
      if (this.shouldBypassObstacle(obstacle.id, next)) {
        continue;
      }
      next = resolveObstacle(next, PLAYER_RADIUS, obstacle);
    }
    next = this.resolveSkateBowlExit({ x: this.player.position.x, z: this.player.position.z }, next, this.player.velocity);
    this.player.position.set(next.x, this.groundY(next), next.z);
  }

  private jump(): boolean {
    if (this.state !== "playing" || this.bike?.mounted || this.activeAmenityRest || this.activeAmenitySearch) {
      return false;
    }
    if (this.player.activeFixtureId || this.player.height > 0.2 || this.player.jumpHeight > 0.02) {
      return false;
    }
    if (this.player.crouching || this.testCrouchOverride === true) {
      return false;
    }
    const stamina = spendStamina(this.condition.stamina, JUMP_STAMINA_COST);
    if (!stamina.spent) {
      this.flashStatus("Too winded to jump");
      this.audio.playWorld("deny");
      return false;
    }
    this.condition.stamina = stamina.stamina;
    this.player.jumpVelocity = JUMP_INITIAL_VELOCITY;
    this.player.jumpHeight = 0.04;
    this.flashStatus("Jumped");
    this.emitNoise("footstep", { x: this.player.position.x, z: this.player.position.z }, 0.46, { volume: 0.38 });
    return true;
  }

  private updateBikeMovement(dt: number, input: THREE.Vector3): void {
    this.player.activeFixtureId = null;
    this.player.heightTarget = 0;
    this.player.crouching = false;
    const wantsSprint = this.input?.isSprinting() ?? false;
    const sprinting = wantsSprint && this.condition.stamina > 8 && this.condition.limpTimer <= 0;
    this.isSprinting = sprinting;

    const forwardInput = (input.z < 0 ? 1 : 0) - (input.z > 0 ? 1 : 0);
    const sideInput = (input.x > 0 ? 1 : 0) - (input.x < 0 ? 1 : 0);

    if (forwardInput !== 0 || sideInput !== 0) {
      const sin = Math.sin(this.player.yaw);
      const cos = Math.cos(this.player.yaw);
      const forwardSpeed = sprinting && forwardInput > 0 ? BIKE_SPRINT_SPEED : BIKE_FORWARD_SPEED;
      const forward = new THREE.Vector3(-sin, 0, -cos).multiplyScalar(forwardInput >= 0 ? forwardInput * forwardSpeed : forwardInput * BIKE_REVERSE_SPEED);
      const right = new THREE.Vector3(cos, 0, -sin).multiplyScalar(sideInput * BIKE_STRAFE_SPEED);
      const surface = this.movementSurfaceAt({ x: this.player.position.x, z: this.player.position.z });
      const conditionScale = Math.max(0.72, speedMultiplierForCondition(this.condition));
      this.player.velocity.copy(forward.add(right)).multiplyScalar(this.bikeSurfaceSpeedMultiplier(surface) * conditionScale);
      this.emitMovementNoise(dt, sprinting);
    } else {
      this.isSprinting = false;
      this.player.velocity.multiplyScalar(0.9);
      if (this.player.velocity.lengthSq() < 0.01) {
        this.player.velocity.set(0, 0, 0);
      }
    }

    const candidate = this.player.position.clone().addScaledVector(this.player.velocity, dt);
    let next = clampToPolygon({ x: candidate.x, z: candidate.z }, this.level.boundary, 3);
    for (const obstacle of this.level.obstacles) {
      next = resolveObstacle(next, PLAYER_RADIUS + 0.45, obstacle);
    }
    next = this.resolveSkateBowlExit({ x: this.player.position.x, z: this.player.position.z }, next, this.player.velocity);
    this.player.position.set(next.x, this.groundY(next), next.z);
  }

  private bikeSurfaceSpeedMultiplier(surface: MovementSurface): number {
    if (surface === "rail") return 1.2;
    if (surface === "asphalt") return 1.18;
    if (surface === "concrete") return 1.1;
    if (surface === "gravel") return 0.88;
    if (surface === "dirt") return 0.72;
    return 0.82;
  }

  private updatePlayerCondition(dt: number): void {
    this.condition.bleedTimer = Math.max(0, this.condition.bleedTimer - dt);
    this.condition.limpTimer = Math.max(0, this.condition.limpTimer - dt);
    this.condition.blurTimer = Math.max(0, this.condition.blurTimer - dt);
    this.distractionCooldown = Math.max(0, this.distractionCooldown - dt);

    const bleedDamage = bleedDamagePerSecond(this.condition.bleedTimer) * dt;
    if (bleedDamage > 0) {
      this.player.health -= bleedDamage;
    }

    const scoped = this.scopeAmount > 0.58 && this.aimHeld;
    this.condition.stamina = nextStamina(this.condition.stamina, dt, {
      sprinting: this.isSprinting,
      scoped,
      resting: Boolean(this.activeAmenityRest),
      searching: Boolean(this.activeAmenitySearch),
      crouching: this.player.crouching,
      bleeding: this.condition.bleedTimer > 0
    });
    if (scoped && this.condition.stamina <= 1) {
      this.aimHeld = false;
      this.flashStatus("Too winded to hold breath");
    }

    if (this.condition.flashlightOn) {
      this.flashlightNoiseTimer -= dt;
      if (this.flashlightNoiseTimer <= 0) {
        const cloudRisk = 0.55 + this.currentWeather.cloudCover * 0.35 + this.currentWeather.fog * 0.2;
        this.emitNoise("flashlight", { x: this.player.position.x, z: this.player.position.z }, cloudRisk, { volume: 0.25 });
        this.flashlightNoiseTimer = 2.6;
      }
    }

    const bleeding = this.condition.bleedTimer > 0;
    const limping = this.condition.limpTimer > 0;
    const blurred = this.condition.blurTimer > 0;
    this.root.classList.toggle("is-bleeding", bleeding);
    this.root.classList.toggle("is-limping", limping);
    this.root.classList.toggle("is-blurred", blurred);
    document.body.classList.toggle("is-bleeding", bleeding);
    document.body.classList.toggle("is-limping", limping);
    document.body.classList.toggle("is-blurred", blurred);
  }

  private throwDistraction(): boolean {
    if (this.state !== "playing") {
      return false;
    }
    if (this.condition.throwables <= 0) {
      this.flashStatus("No distractions left");
      this.audio.playWorld("deny");
      return false;
    }
    if (this.distractionCooldown > 0) {
      return false;
    }
    const stamina = spendStamina(this.condition.stamina, DISTRACTION_STAMINA_COST);
    if (!stamina.spent) {
      this.flashStatus("Too winded to throw");
      this.audio.playWorld("deny");
      return false;
    }
    this.condition.stamina = stamina.stamina;
    this.condition.throwables -= 1;
    this.distractionCooldown = 1.1;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) {
      forward.set(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    }
    forward.normalize();
    const range = this.rng.range(22, 31);
    let target = clampToPolygon(
      {
        x: this.player.position.x + forward.x * range,
        z: this.player.position.z + forward.z * range
      },
      this.level.boundary,
      4
    );
    for (const obstacle of this.level.obstacles) {
      target = resolveObstacle(target, 0.5, obstacle);
    }

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0x6f8f93, metalness: 0.18, roughness: 0.72 })
    );
    mesh.position.set(target.x, this.groundY(target) + 0.21, target.z);
    mesh.rotation.set(this.rng.range(-0.4, 0.4), this.rng.range(0, Math.PI), this.rng.range(-0.8, 0.8));
    mesh.userData.dynamic = true;
    this.scene.add(mesh);
    this.distractions.push({
      mesh,
      position: { ...target },
      ttl: 7.2,
      pulseTimer: 1.35
    });
    this.emitNoise("distraction", target, 1.05);
    this.flashStatus("Threw distraction");
    return true;
  }

  private updateDistractions(dt: number): void {
    for (const distraction of [...this.distractions]) {
      distraction.ttl -= dt;
      distraction.pulseTimer -= dt;
      distraction.mesh.rotation.y += dt * 2.6;
      distraction.mesh.position.y = this.groundY(distraction.position) + 0.21 + Math.sin(this.frame * 0.16) * 0.035;
      if (distraction.pulseTimer <= 0 && distraction.ttl > 0.8) {
        this.emitNoise("distraction", distraction.position, 0.52, { volume: 0.45 });
        distraction.pulseTimer = this.rng.range(1.2, 1.85);
      }
      if (distraction.ttl <= 0) {
        this.scene.remove(distraction.mesh);
        const index = this.distractions.indexOf(distraction);
        if (index >= 0) {
          this.distractions.splice(index, 1);
        }
      }
    }
  }

  private toggleFlashlight(): boolean {
    if (this.state !== "playing") {
      return false;
    }
    this.condition.flashlightOn = !this.condition.flashlightOn;
    this.applyFlashlightVisibility();
    this.flashlightNoiseTimer = this.condition.flashlightOn ? 0 : 2.6;
    this.emitNoise("flashlight", { x: this.player.position.x, z: this.player.position.z }, this.condition.flashlightOn ? 0.82 : 0.44, { volume: 0.5 });
    this.flashStatus(this.condition.flashlightOn ? "Flashlight on" : "Flashlight off");
    return this.condition.flashlightOn;
  }

  private applyFlashlightVisibility(): void {
    if (this.playerTorch) {
      this.playerTorch.visible = this.condition.flashlightOn;
      this.playerTorch.intensity = this.condition.flashlightOn ? (this.smokeMode ? 1.15 : 1.7) : 0;
    }
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
    const surface = this.movementSurfaceAt(playerPoint);
    this.emitNoise(kind, playerPoint, movementNoiseMultiplier(this.player.crouching, surface, this.currentWeather.footstepMask), { surface });
    this.movementNoiseTimer = this.player.crouching ? 0.82 : sprinting ? 0.28 : 0.46;
  }

  private emitNoise(kind: NoiseKind, position: Vec2, multiplier = 1, audioOptions: NoisePlaybackOptions = {}) {
    const weatherMask = kind === "footstep" || kind === "sprint" ? 1 : weatherNoiseMaskForKind(kind, this.currentWeather);
    const event = this.noise.emit(kind, position, multiplier * weatherMask);
    this.audio.playNoise(event, audioOptions);
    return event;
  }

  private updateAudio(dt: number): void {
    this.audio.setListener({
      position: { x: this.player.position.x, z: this.player.position.z },
      yaw: this.player.yaw,
      height: this.camera.position.y
    });
    this.audio.update(dt, {
      health: this.player.health,
      scoped: this.scopeAmount > 0.55,
      crouching: this.player.crouching,
      weather: this.currentWeather
    });
  }

  private movementSurfaceAt(point: Vec2): MovementSurface {
    let nearestSurface: MovementSurface | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const path of this.level.paths) {
      for (let index = 0; index < path.points.length - 1; index += 1) {
        const pathDistance = distanceToSegment(point, path.points[index], path.points[index + 1]);
        if (pathDistance <= path.width * 0.78 && pathDistance < nearestDistance) {
          nearestDistance = pathDistance;
          nearestSurface = this.pathMovementSurface(path);
        }
      }
    }
    return nearestSurface ?? "grass";
  }

  private pathMovementSurface(path: LevelData["paths"][number]): MovementSurface {
    if (path.kind === "rail") return "rail";
    if (path.surface === "gravel" || path.kind === "perimeter") return "gravel";
    if (path.surface === "asphalt" || path.kind === "cycleway" || path.kind === "service") return "asphalt";
    if (path.surface === "concrete" || path.kind === "steps" || path.kind === "footway") return "concrete";
    return "dirt";
  }

  private surfaceSpeedMultiplier(surface: MovementSurface): number {
    if (surface === "rail") return 1.12;
    if (surface === "asphalt") return 1.08;
    if (surface === "concrete") return 1.03;
    if (surface === "gravel") return 0.94;
    if (surface === "dirt") return 0.84;
    return 0.9;
  }

  private groundY(point: Vec2): number {
    return this.terrain.groundY(point);
  }

  private averageGroundY(points: readonly Vec2[]): number {
    return this.terrain.averageGroundY(points);
  }

  private weatherAnchors(): Vec2[] {
    const anchors: Vec2[] = [{ x: START_POSITION.x, z: START_POSITION.z }];
    const addAnchor = (point: Vec2 | undefined) => {
      if (point) {
        anchors.push({ x: point.x, z: point.z });
      }
    };

    this.level.upgradeStations.forEach((station) => addAnchor(station.position));
    this.level.weaponSpawns.forEach((spawn) => addAnchor(spawn.position));
    addAnchor(this.level.rideableBike.position);
    this.level.landmarks.forEach((landmark) => addAnchor(landmark.position ?? (landmark.polygon ? polygonCentroid(landmark.polygon) : undefined)));
    this.level.amenities.forEach((amenity, index) => {
      if (index % 8 === 0) {
        addAnchor(amenity.position);
      }
    });

    this.level.paths.forEach((path) => {
      if (path.points.length === 0) {
        return;
      }
      addAnchor(path.points[0]);
      addAnchor(path.points[Math.floor(path.points.length * 0.5)]);
      addAnchor(path.points[path.points.length - 1]);
    });

    const uniqueAnchors = new Map<string, Vec2>();
    anchors.forEach((anchor) => {
      const key = `${Math.round(anchor.x / 8)}:${Math.round(anchor.z / 8)}`;
      if (!uniqueAnchors.has(key)) {
        uniqueAnchors.set(key, anchor);
      }
    });

    return [...uniqueAnchors.values()].slice(0, 140);
  }

  private handleLook(movementX: number, movementY: number): void {
    this.player.yaw -= movementX * 0.0022;
    this.player.pitch -= movementY * 0.002;
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
      this.player.position.y + PLAYER_HEIGHT + this.playerElevation() + (this.bike?.mounted ? BIKE_CAMERA_HEIGHT_BONUS : 0) - this.player.crouchAmount * 0.58,
      this.player.position.z
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.player.yaw + this.recoilYaw * 0.006;
    this.camera.rotation.x = this.player.pitch - this.recoil * 0.012;
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
      searchTimer: 0,
      memoryTimer: 0,
      vocalCooldown: this.rng.range(2.5, 8),
      stepCooldown: this.rng.range(0.1, 0.7),
      staggerTimer: 0,
      screamCooldown: this.rng.range(2.5, 6)
    });
  }

  private updateZombies(dt: number, now: number): void {
    for (const zombie of this.zombies) {
      const profile = zombieProfile(zombie.type);
      const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
      const localPlayerPoint = { x: this.player.position.x, z: this.player.position.z };
      const localDistance = distance(zombiePoint, localPlayerPoint);
      const nearestCombatant = this.nearestCombatant(zombiePoint);
      const visibleCombatant = this.visibleCombatantForZombie(zombie, zombiePoint);
      const distanceToPlayer = nearestCombatant ? distance(zombiePoint, nearestCombatant.position) : localDistance;
      const heardNoise = this.noise.strongestAt(zombiePoint, profile.hearingMultiplier);
      const previousAiState = zombie.aiState;

      zombie.attackCooldown -= dt;
      zombie.staggerTimer = Math.max(0, zombie.staggerTimer - dt);
      zombie.screamCooldown = Math.max(0, zombie.screamCooldown - dt);
      zombie.wanderTimer = Math.max(0, zombie.wanderTimer - dt);
      zombie.memoryTimer = Math.max(0, zombie.memoryTimer - dt);
      zombie.vocalCooldown = Math.max(0, zombie.vocalCooldown - dt);
      zombie.stepCooldown = Math.max(0, zombie.stepCooldown - dt);
      if (zombie.aiState === "search") {
        zombie.searchTimer = Math.max(0, zombie.searchTimer - dt);
      }
      const targetReached = zombie.target ? distance(zombiePoint, zombie.target) < (zombie.aiState === "wander" ? 3.8 : 2.8) : true;

      if (visibleCombatant) {
        const playerPoint = this.combatantPoint(visibleCombatant.combatant);
        zombie.aiState = "chase";
        zombie.lastKnownPlayer = playerPoint;
        zombie.target = playerPoint;
        zombie.memoryTimer = this.rng.range(4.2, 7.2) + (visibleCombatant.combatant.condition.flashlightOn ? 1.2 : 0);
        zombie.searchTimer = 0;
      } else if (
        heardNoise &&
        (zombie.aiState !== "chase" || heardNoise.kind === "gunshot" || heardNoise.kind === "scream" || heardNoise.kind === "distraction")
      ) {
        const wasChasing = zombie.aiState === "chase";
        const distraction = heardNoise.kind === "distraction";
        zombie.aiState = "investigate";
        zombie.target = { ...heardNoise.position };
        zombie.lastKnownPlayer = wasChasing && !distraction ? zombie.lastKnownPlayer : { ...heardNoise.position };
        zombie.memoryTimer = 0;
        zombie.searchTimer = distraction ? this.rng.range(6.2, 9.4) : this.rng.range(4.4, 7.2);
      } else if (zombie.aiState === "chase" && zombie.lastKnownPlayer && zombie.memoryTimer > 0) {
        zombie.target = zombie.lastKnownPlayer;
      } else if (zombie.aiState === "chase" && zombie.lastKnownPlayer) {
        this.setZombieSearchTarget(zombie, zombie.lastKnownPlayer);
      } else if (zombie.aiState === "investigate" && targetReached) {
        this.setZombieSearchTarget(zombie, zombie.target ?? zombiePoint);
      } else if (zombie.aiState === "search" && zombie.searchTimer <= 0) {
        this.setZombieWanderTarget(zombie, zombiePoint);
      } else if (zombie.aiState === "search" && targetReached) {
        zombie.target = this.chooseWanderTarget(zombie.lastKnownPlayer ?? zombiePoint, zombie.radius, 24);
      } else if (zombie.aiState === "wander" && (targetReached || zombie.wanderTimer <= 0)) {
        this.setZombieWanderTarget(zombie, zombiePoint);
      } else if (!zombie.target) {
        this.setZombieWanderTarget(zombie, zombiePoint);
      }

      if (this.zombieJustBecameAlerted(previousAiState, zombie.aiState) && localDistance < 180) {
        this.audio.playWorld("zombieGroan", zombiePoint, {
          zombieType: zombie.type,
          aiState: zombie.aiState,
          volume: zombie.aiState === "chase" ? 1.45 : 1.18
        });
        zombie.vocalCooldown = this.rng.range(1.8, 3.6);
      }

      if (zombie.type === "screamer" && zombie.aiState === "chase" && zombie.screamCooldown <= 0) {
        this.emitNoise("scream", zombiePoint);
        zombie.screamCooldown = 9 + this.rng.range(0, 4);
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
            : zombie.aiState === "search"
              ? 0.58
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
        zombie.mesh.rotation.y = Math.atan2(toTarget.x, toTarget.z) + Math.PI;
      }
      this.syncZombieMeshPosition(zombie, now);
      this.animateZombie(zombie, now, localDistance);
      this.updateZombieAudio(zombie, dt, localDistance, distanceToTarget);
      const attackTarget = this.attackableCombatantForZombie(zombie, zombiePoint);
      if (attackTarget && zombie.attackCooldown <= 0) {
        this.applyZombieHit(zombie, profile, now, attackTarget);
        zombie.attackCooldown = profile.attackCooldown;
        this.audio.playWorld("zombieAttack", zombiePoint, { zombieType: zombie.type });
        if (attackTarget.isLocal) {
          this.audio.playWorld("playerHit");
        }
      }
    }
    this.resolveZombieCrowding(now);
  }

  private resolveZombieCrowding(now: number): void {
    const largestOverlap = separateCircularAgents(this.zombies, {
      gap: ZOMBIE_SEPARATION_GAP,
      gridSize: ZOMBIE_SEPARATION_GRID_SIZE,
      iterations: ZOMBIE_SEPARATION_ITERATIONS,
      afterIteration: (zombies) => {
        for (const zombie of zombies) {
          this.settleZombiePosition(zombie);
        }
      }
    });

    if (largestOverlap <= 0) {
      return;
    }

    for (const zombie of this.zombies) {
      this.syncZombieMeshPosition(zombie, now);
    }
  }

  private settleZombiePosition(zombie: Zombie): void {
    let next = clampToPolygon({ x: zombie.position.x, z: zombie.position.z }, this.level.boundary, 2.5);

    for (let pass = 0; pass < ZOMBIE_STATIC_COLLISION_PASSES; pass += 1) {
      let moved = false;
      this.obstacleIndex.forNearby(next, zombie.radius, (obstacle) => {
        const resolved = resolveObstacle(next, zombie.radius, obstacle);
        if (distance(next, resolved) > 0.0001) {
          moved = true;
        }
        next = resolved;
      });
      next = clampToPolygon(next, this.level.boundary, 2.5);
      if (!moved) {
        break;
      }
    }

    zombie.position.set(next.x, this.groundY(next), next.z);
  }

  private syncZombieMeshPosition(zombie: Zombie, now: number): void {
    zombie.mesh.position.set(zombie.position.x, this.zombieVisualY(zombie, now), zombie.position.z);
  }

  private zombieVisualY(zombie: Zombie, now: number): number {
    return zombie.position.y + (Math.sin(now * 7 + zombie.walkOffset) + 1) * 0.035;
  }

  private applyZombieHit(zombie: Zombie, profile: ReturnType<typeof zombieProfile>, now: number, combatant: CombatantRef): void {
    if (combatant.isLocal) {
      this.player.health -= profile.attackDamage;
      this.lastDamageAt = now;
    } else if (combatant.remote) {
      combatant.remote.health -= profile.attackDamage;
    }
    const severity = Math.min(1, profile.attackDamage / 24);
    const roll = this.rng.next();
    const condition = combatant.condition;
    if (zombie.type === "sprinter" || roll < 0.28 + severity * 0.24) {
      condition.bleedTimer = Math.max(condition.bleedTimer, this.rng.range(7, 15) * severity);
    }
    if (zombie.type === "bloater" || roll > 0.46) {
      condition.limpTimer = Math.max(condition.limpTimer, this.rng.range(4.5, 10) * severity);
    }
    if (zombie.type === "screamer" || profile.attackDamage >= 18) {
      condition.blurTimer = Math.max(condition.blurTimer, this.rng.range(2.5, 6.5) * severity);
    }
    if (!combatant.isLocal) {
      return;
    }
    document.body.classList.add("hit");
    window.setTimeout(() => document.body.classList.remove("hit"), 120);
  }

  private updateZombieAudio(zombie: Zombie, _dt: number, distanceToPlayer: number, distanceToTarget: number): void {
    const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
    if (distanceToTarget > 0.3 && distanceToPlayer < 105 && zombie.stepCooldown <= 0) {
      this.audio.playWorld("zombieStep", zombiePoint, {
        zombieType: zombie.type,
        aiState: zombie.aiState,
        volume: zombie.aiState === "wander" ? 0.95 : 1.2
      });
      zombie.stepCooldown =
        zombie.type === "sprinter"
          ? this.rng.range(0.24, 0.38)
          : zombie.type === "bloater"
            ? this.rng.range(0.7, 1.05)
            : zombie.type === "crawler"
              ? this.rng.range(0.52, 0.86)
              : zombie.aiState === "wander"
                ? this.rng.range(0.72, 1.15)
                : this.rng.range(0.42, 0.68);
    }

    if (distanceToPlayer < 160 && zombie.vocalCooldown <= 0) {
      const alerted = zombie.aiState === "chase" || zombie.aiState === "investigate";
      this.audio.playWorld("zombieGroan", zombiePoint, {
        zombieType: zombie.type,
        aiState: zombie.aiState,
        volume: alerted ? 1.28 : distanceToPlayer < 60 ? 1 : 0.78
      });
      zombie.vocalCooldown = alerted ? this.rng.range(1.9, 4.2) : this.rng.range(4.5, 8.5);
    }
  }

  private zombieJustBecameAlerted(previous: Zombie["aiState"], current: Zombie["aiState"]): boolean {
    const wasAlerted = previous === "chase" || previous === "investigate";
    const isAlerted = current === "chase" || current === "investigate";
    return !wasAlerted && isAlerted;
  }

  private combatants(): CombatantRef[] {
    const combatants: CombatantRef[] = [];
    if (this.player.health > 0) {
      combatants.push({
        id: this.localNetworkId,
        isLocal: true,
        position: this.player.position,
        velocity: this.player.velocity,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        health: this.player.health,
        crouching: this.player.crouching,
        crouchAmount: this.player.crouchAmount,
        height: this.player.height,
        jumpHeight: this.player.jumpHeight,
        activeFixtureId: this.player.activeFixtureId,
        condition: this.condition,
        loadout: this.loadout
      });
    }
    for (const player of this.networkPlayers.values()) {
      if (player.health <= 0) {
        continue;
      }
      combatants.push({
        id: player.id,
        isLocal: false,
        remote: player,
        position: player.position,
        velocity: player.velocity,
        yaw: player.yaw,
        pitch: player.pitch,
        health: player.health,
        crouching: player.crouching,
        crouchAmount: player.crouchAmount,
        height: player.height,
        jumpHeight: player.jumpHeight,
        activeFixtureId: player.activeFixtureId,
        condition: player.condition,
        loadout: player.loadout
      });
    }
    return combatants;
  }

  private combatantPoint(combatant: CombatantRef): Vec2 {
    return { x: combatant.position.x, z: combatant.position.z };
  }

  private combatantElevation(combatant: CombatantRef): number {
    return combatant.height + combatant.jumpHeight;
  }

  private nearestCombatant(point: Vec2): CombatantRef | null {
    let nearest: CombatantRef | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const combatant of this.combatants()) {
      const combatantDistance = distance(point, this.combatantPoint(combatant));
      if (combatantDistance < nearestDistance) {
        nearest = combatant;
        nearestDistance = combatantDistance;
      }
    }
    return nearest;
  }

  private visibleCombatantForZombie(zombie: Zombie, zombiePoint: Vec2): { combatant: CombatantRef; distance: number } | null {
    let visible: { combatant: CombatantRef; distance: number } | null = null;
    for (const combatant of this.combatants()) {
      const combatantDistance = distance(zombiePoint, this.combatantPoint(combatant));
      if (this.canZombieSeeCombatant(zombie, combatant, combatantDistance) && (!visible || combatantDistance < visible.distance)) {
        visible = { combatant, distance: combatantDistance };
      }
    }
    return visible;
  }

  private attackableCombatantForZombie(zombie: Zombie, zombiePoint: Vec2): CombatantRef | null {
    let target: CombatantRef | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const combatant of this.combatants()) {
      const combatantDistance = distance(zombiePoint, this.combatantPoint(combatant));
      if (
        this.combatantElevation(combatant) < 1.4 &&
        combatantDistance < zombie.radius + PLAYER_RADIUS + 0.8 &&
        combatantDistance < nearestDistance
      ) {
        target = combatant;
        nearestDistance = combatantDistance;
      }
    }
    return target;
  }

  private canZombieSeeCombatant(zombie: Zombie, combatant: CombatantRef, distanceToPlayer: number): boolean {
    const profile = zombieProfile(zombie.type);
    const playerPoint = this.combatantPoint(combatant);
    const surface = this.movementSurfaceAt(playerPoint);
    const inCover = this.playerInCoverForCombatant(combatant, surface);
    const sightRange = profile.sightRange * playerVisibilityMultiplier({
      surface,
      crouching: combatant.crouching,
      inCover,
      elevatedHeight: this.combatantElevation(combatant),
      flashlightOn: combatant.condition.flashlightOn,
      weather: this.currentWeather
    });
    if (distanceToPlayer > sightRange) {
      return false;
    }
    const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
    if (zombie.aiState === "wander" && distanceToPlayer > 12) {
      const toPlayer = new THREE.Vector3(playerPoint.x - zombiePoint.x, 0, playerPoint.z - zombiePoint.z).normalize();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(zombie.mesh.quaternion);
      forward.y = 0;
      if (forward.lengthSq() > 0.001 && forward.normalize().dot(toPlayer) < zombieFacingThreshold(combatant.crouching, inCover, combatant.condition.flashlightOn)) {
        return false;
      }
    }
    return !isLineOfSightBlockedByContext(zombiePoint, playerPoint, this.visibilityContextForCombatant(combatant), PLAYER_RADIUS);
  }

  private playerInCover(surface = this.movementSurfaceAt({ x: this.player.position.x, z: this.player.position.z })): boolean {
    return this.playerInCoverForCombatant(this.combatants()[0], surface);
  }

  private playerInCoverForCombatant(combatant: CombatantRef | undefined, surface: MovementSurface): boolean {
    if (!combatant?.crouching) {
      return false;
    }
    const playerPoint = this.combatantPoint(combatant);
    if (this.isCoverNearPoint(playerPoint, 4.2, 5.8)) {
      return true;
    }
    return surface === "dirt" && this.currentWeather.fog > 0.25;
  }

  private isCoverNearPoint(point: Vec2, obstaclePadding = 4.2, treePadding = 5.8): boolean {
    for (const obstacle of this.level.obstacles) {
      const radius = this.obstacleCoverRadius(obstacle);
      const coverPadding = obstacle.sourceObjectKind === "tree-collider" ? treePadding : obstaclePadding;
      if (distance(point, obstacle.center) <= radius + coverPadding) {
        return true;
      }
    }
    return false;
  }

  private obstacleCoverRadius(obstacle: LevelData["obstacles"][number]): number {
    if (obstacle.shape === "box") {
      return Math.hypot(obstacle.halfX, obstacle.halfZ);
    }
    if (obstacle.shape === "polygon") {
      return obstacle.polygon.length > 0 ? Math.max(...obstacle.polygon.map((point) => distance(obstacle.center, point))) : 0;
    }
    return obstacle.radius;
  }

  private setZombieWanderTarget(zombie: Zombie, origin: Vec2): void {
    zombie.aiState = "wander";
    zombie.lastKnownPlayer = null;
    zombie.searchTimer = 0;
    zombie.memoryTimer = 0;
    zombie.target = this.chooseWanderTarget(origin, zombie.radius);
    zombie.wanderTimer = this.rng.range(3.5, 8.5);
  }

  private setZombieSearchTarget(zombie: Zombie, origin: Vec2): void {
    zombie.aiState = "search";
    zombie.lastKnownPlayer = { ...origin };
    zombie.memoryTimer = 0;
    zombie.searchTimer = this.rng.range(5.2, 8.6);
    zombie.target = this.chooseWanderTarget(origin, zombie.radius, 24);
  }

  private chooseWanderTarget(origin: Vec2, zombieRadius: number, maxRadius = 42): Vec2 {
    let best = { ...origin };
    let bestDistance = 0;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(Math.min(12, maxRadius * 0.45), maxRadius);
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
    if (this.bike?.mounted && !this.weaponCanFireOnBike(this.loadout.weaponId)) {
      this.flashStatus("Too bulky to fire while riding");
      this.audio.playWorld("deny");
      this.aimHeld = false;
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
      this.audio.playWorld("dryFire");
      return;
    }

    this.loadout = consumeRound(this.loadout);
    this.lastShotAt = now;
    const crouchRecoil = this.player.crouching ? 0.7 : 1;
    const aimRecoil = THREE.MathUtils.lerp(1, stats.aimRecoilMultiplier, this.scopeAmount) * crouchRecoil;
    this.recoil = Math.min(1.75, this.recoil + stats.recoilKick * aimRecoil);
    this.recoilYaw += this.rng.range(-stats.recoilDrift, stats.recoilDrift) * aimRecoil;
    this.shotBloom = Math.min(stats.maxBloom, this.shotBloom + stats.bloomPerShot);
    this.emitNoise("gunshot", { x: this.player.position.x, z: this.player.position.z }, stats.noiseMultiplier * (this.player.crouching ? 0.96 : 1), {
      weaponId: this.loadout.weaponId
    });
    this.muzzleTimer = 0.055;
    if (this.muzzleFlash) this.muzzleFlash.visible = true;
    if (this.muzzleLight) this.muzzleLight.visible = true;
    this.spawnShellCasing();
    this.spawnMuzzleSmoke();
    this.audio.playWorld("shell", { x: this.player.position.x, z: this.player.position.z }, { volume: this.loadout.weaponId === "shotgun" ? 0.55 : 0.75 });

    const movementSpread = Math.min(1, this.player.velocity.length() / 22) * stats.movingSpread;
    const crouchSpread = this.player.crouching ? 0.64 : 1;
    const breathControl = this.scopeAmount > 0.55 && this.aimHeld ? (this.condition.stamina > 12 ? 0.86 : 1.18) : 1;
    const totalSpread = (stats.spread + movementSpread + this.shotBloom) * THREE.MathUtils.lerp(1, stats.aimSpreadMultiplier, this.scopeAmount) * crouchSpread * breathControl;
    let registeredHit = false;
    let playedImpact = false;
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
        hit.zombie.memoryTimer = this.rng.range(2.6, 4.4);
        this.lastHitZone = hit.zone;
        registeredHit = true;
        this.createHitSpark(endPoint);
        if (!playedImpact) {
          this.audio.playWorld("bulletHit", { x: hit.point.x, z: hit.point.z }, { volume: hit.zone === "head" ? 1.12 : 0.9 });
          playedImpact = true;
        }
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

  private weaponCanFireOnBike(weaponId: WeaponId): boolean {
    return BIKE_ALLOWED_WEAPONS.has(weaponId);
  }

  private swingMelee(now: number, stats: ReturnType<typeof getWeaponStats>): void {
    const staminaCost = this.loadout.weaponId === "machete" ? MACHETE_STAMINA_COST : MELEE_STAMINA_COST;
    const stamina = spendStamina(this.condition.stamina, staminaCost);
    if (!stamina.spent) {
      this.flashStatus("Too winded to swing");
      this.audio.playWorld("deny");
      return;
    }
    this.condition.stamina = stamina.stamina;
    this.lastShotAt = now;
    this.aimHeld = false;
    this.meleeSwing = 1;
    this.meleeSwingSide *= -1;
    this.recoil = Math.min(1.25, this.recoil + stats.recoilKick);
    this.recoilYaw += this.rng.range(-stats.recoilDrift, stats.recoilDrift);
    this.emitNoise("melee", { x: this.player.position.x, z: this.player.position.z }, stats.noiseMultiplier * (this.player.crouching ? 0.7 : 1), {
      weaponId: this.loadout.weaponId
    });

    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const hits = this.findMeleeHits(direction, stats.range, Math.max(1, stats.penetration));
    if (hits.length === 0) {
      this.lastHitZone = null;
      return;
    }

    for (const hit of hits) {
      hit.zombie.health -= damageAtDistance(stats, hit.distance, hit.zone);
      const profile = zombieProfile(hit.zombie.type);
      hit.zombie.staggerTimer = Math.max(hit.zombie.staggerTimer, (stats.staggerPower + (hit.zone === "head" ? 0.18 : 0)) / profile.staggerResistance);
      hit.zombie.aiState = "chase";
      hit.zombie.target = { x: this.player.position.x, z: this.player.position.z };
      hit.zombie.lastKnownPlayer = hit.zombie.target;
      hit.zombie.memoryTimer = this.rng.range(2, 3.6);
      this.lastHitZone = hit.zone;
      this.createHitSpark(hit.point);
      this.audio.playWorld("meleeHit", { x: hit.point.x, z: hit.point.z }, { volume: this.loadout.weaponId === "machete" ? 1.15 : 0.9 });
      if (hit.zone === "head") {
        this.flashStatus("Clean strike");
      }
      if (hit.zombie.health <= 0) {
        this.killZombie(hit.zombie);
      }
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

  private findMeleeHits(direction: THREE.Vector3, range: number, limit: number): Array<{ zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone }> {
    return this.findMeleeHitsFor(this.player.position, direction, range, limit, this.player.crouching, this.loadout.weaponId);
  }

  private findMeleeHitsFor(
    originPosition: THREE.Vector3,
    direction: THREE.Vector3,
    range: number,
    limit: number,
    crouching: boolean,
    weaponId: WeaponId
  ): Array<{ zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone }> {
    const forward = direction.clone();
    forward.y = 0;
    if (forward.lengthSq() > 0.001) {
      forward.normalize();
    }
    const origin = { x: originPosition.x, z: originPosition.z };
    const arcCos = Math.cos(weaponId === "machete" ? 0.72 : 0.42);

    return this.zombies
      .map((zombie) => {
        const toZombie = new THREE.Vector3(zombie.position.x - origin.x, 0, zombie.position.z - origin.z);
        const zombieDistance = toZombie.length();
        if (zombieDistance > range + zombie.radius) {
          return null;
        }
        if (zombieDistance > 0.001) {
          toZombie.normalize();
        }
        if (forward.dot(toZombie) < arcCos) {
          return null;
        }
        const zone: HitZone = crouching || zombie.type === "crawler" ? "legs" : zombieDistance < range * 0.62 ? "body" : "head";
        const point = zombie.position.clone().add(new THREE.Vector3(0, zone === "head" ? 2.2 : zone === "legs" ? 0.72 : 1.4, 0));
        return { zombie, point, distance: zombieDistance, zone };
      })
      .filter((hit): hit is { zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone } => Boolean(hit))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
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

  private killZombie(zombie: Zombie, killer?: NetworkRemotePlayer): void {
    this.audio.playWorld("zombieDeath", { x: zombie.position.x, z: zombie.position.z }, { zombieType: zombie.type });
    this.scene.remove(zombie.mesh);
    this.zombies = this.zombies.filter((candidate) => candidate !== zombie);
    if (killer) {
      killer.scrap += zombie.reward;
    } else {
      this.player.kills += 1;
      this.player.scrap += zombie.reward;
    }
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
        this.collectPickupForLocalPlayer(pickup);
      } else if (this.isNetworkHost && this.collectPickupForNetworkPlayer(pickup)) {
        this.scene.remove(pickup.mesh);
        this.pickups = this.pickups.filter((candidate) => candidate !== pickup);
      } else if (pickup.ttl <= 0) {
        this.scene.remove(pickup.mesh);
        this.pickups = this.pickups.filter((candidate) => candidate !== pickup);
      }
    }
  }

  private collectPickupForLocalPlayer(pickup: Pickup): void {
    if (pickup.type === "ammo") {
      this.loadout = addAmmo(this.loadout, pickup.amount);
    } else if (pickup.type === "health") {
      this.player.health = Math.min(100, this.player.health + pickup.amount);
    } else {
      this.player.scrap += pickup.amount;
    }
    this.scene.remove(pickup.mesh);
    this.pickups = this.pickups.filter((candidate) => candidate !== pickup);
    this.audio.playWorld("pickup");
  }

  private collectPickupForNetworkPlayer(pickup: Pickup): boolean {
    for (const player of this.networkPlayers.values()) {
      if (player.health <= 0 || pickup.position.distanceTo(player.position) >= 4.2) {
        continue;
      }
      if (pickup.type === "ammo") {
        player.loadout = addAmmo(player.loadout, pickup.amount);
      } else if (pickup.type === "health") {
        player.health = Math.min(100, player.health + pickup.amount);
      } else {
        player.scrap += pickup.amount;
      }
      return true;
    }
    return false;
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
    for (const drop of [...this.weaponDrops]) {
      if (Number.isFinite(drop.ttl)) {
        drop.ttl -= dt;
      }
      drop.mesh.rotation.y += dt * 1.05;
      drop.mesh.position.y =
        this.groundY({ x: drop.position.x, z: drop.position.z }) +
        (drop.source === "cache" ? 0.82 : 0.62) +
        Math.sin(this.frame * 0.045 + drop.id) * 0.08;
      if (drop.ttl <= 0) {
        this.scene.remove(drop.mesh);
        this.weaponDrops = this.weaponDrops.filter((candidate) => candidate !== drop);
      }
    }

    this.nearestWeaponDrop = this.nearestWeaponDropForPoint(this.player.position, 8.2);
  }

  private nearestWeaponDropForPoint(position: THREE.Vector3, reach: number): WeaponDrop | null {
    let nearest: WeaponDrop | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const drop of this.weaponDrops) {
      const dropDistance = drop.position.distanceTo(position);
      if (dropDistance < nearestDistance && dropDistance < reach) {
        nearest = drop;
        nearestDistance = dropDistance;
      }
    }
    return nearest;
  }

  private spawnRideableBike(): void {
    const spawn = this.level.rideableBike;
    const mesh = this.meshFactory.createBikeMesh();
    mesh.scale.setScalar(1.45);
    mesh.userData.dynamic = true;
    this.scene.add(mesh);
    this.bike = {
      id: spawn.id,
      label: spawn.label,
      mesh,
      position: new THREE.Vector3(),
      angle: spawn.angle,
      mounted: false
    };
    this.resetRideableBike();
  }

  private resetRideableBike(): void {
    if (!this.bike) {
      return;
    }
    const spawn = this.level.rideableBike;
    this.bike.mounted = false;
    this.bike.position.set(spawn.position.x, this.groundY(spawn.position), spawn.position.z);
    this.bike.angle = spawn.angle;
    this.syncBikeMesh();
  }

  private updateBike(dt: number): void {
    if (!this.bike) {
      this.nearestBike = null;
      return;
    }

    if (this.bike.mounted) {
      this.bike.position.set(this.player.position.x, this.groundY({ x: this.player.position.x, z: this.player.position.z }), this.player.position.z);
      this.bike.angle = this.player.yaw;
      const speed = this.player.velocity.length();
      if (speed > 0.15) {
        this.bikePedalPhase += speed * dt * 0.9;
        const wheels = (this.bike.mesh.userData.wheels as THREE.Mesh[] | undefined) ?? [];
        for (const wheel of wheels) {
          wheel.rotation.z += speed * dt * 0.52;
        }
      }
      this.syncBikeMesh();
      this.nearestBike = this.bike;
      return;
    }

    const distanceToBike = this.bike.position.distanceTo(this.player.position);
    this.nearestBike = distanceToBike < BIKE_INTERACTION_RADIUS ? this.bike : null;
  }

  private syncBikeMesh(): void {
    if (!this.bike) {
      return;
    }
    this.bike.mesh.position.copy(this.bike.position);
    this.bike.mesh.rotation.y = this.bike.angle;
    this.bike.mesh.rotation.z = this.bike.mounted ? Math.sin(this.bikePedalPhase * 0.65) * 0.035 : 0;
    this.bike.mesh.visible = true;
  }

  private toggleBike(): boolean {
    if (!this.bike) {
      return false;
    }

    if (this.bike.mounted) {
      this.bike.mounted = false;
      this.bike.position.set(this.player.position.x, this.groundY({ x: this.player.position.x, z: this.player.position.z }), this.player.position.z);
      this.bike.angle = this.player.yaw;
      this.player.velocity.multiplyScalar(0.35);
      this.syncBikeMesh();
      this.flashStatus("Dismounted bike");
      this.audio.playWorld("equip");
      return true;
    }

    if (this.playerElevation() > 0.4 || this.player.activeFixtureId) {
      this.flashStatus("Get down before riding");
      this.audio.playWorld("deny");
      return false;
    }

    this.bike.mounted = true;
    this.bikePedalPhase = 0;
    this.player.crouching = false;
    this.player.crouchAmount = 0;
    this.player.height = 0;
    this.player.heightTarget = 0;
    this.player.jumpHeight = 0;
    this.player.jumpVelocity = 0;
    this.player.activeFixtureId = null;
    this.aimHeld = false;
    this.scopeAmount = 0;
    this.flashStatus("Mounted hidden bike");
    this.audio.playWorld("equip");
    return true;
  }

  private inspectBrokenBike(detail: ParkLifeDetail): boolean {
    const message =
      detail.bikeIssue === "broken-chain"
        ? "Broken chain. This bike is going nowhere."
        : "Flat tyres. This bike will not outrun anything.";
    this.flashStatus(message);
    this.audio.playWorld("deny");
    return true;
  }

  private pickupWeapon(drop: WeaponDrop): boolean {
    this.loadout = addWeapon(this.loadout, drop.weaponId);
    this.aimHeld = false;
    this.scene.remove(drop.mesh);
    this.weaponDrops = this.weaponDrops.filter((candidate) => candidate !== drop);
    this.nearestWeaponDrop = null;
    this.rebuildViewWeapon();
    this.flashStatus(`${WEAPON_DEFINITIONS[drop.weaponId].name} equipped`);
    this.audio.playWorld("weaponPickup");
    return true;
  }

  private handleInteract(): boolean {
    if (this.bike?.mounted) {
      return this.toggleBike();
    }
    if (this.nearestWeaponDrop) {
      return this.pickupWeapon(this.nearestWeaponDrop);
    }
    if (this.nearestBike) {
      return this.toggleBike();
    }
    if (this.nearestBrokenBike) {
      return this.inspectBrokenBike(this.nearestBrokenBike);
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
    this.nearestAmenity = this.nearestAmenityForPoint(this.player.position);
  }

  private nearestAmenityForPoint(position: THREE.Vector3): AmenityPoint | null {
    let nearest: AmenityPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const playerPoint = { x: position.x, z: position.z };
    for (const amenity of this.level.amenities) {
      const amenityDistance = distance(playerPoint, amenity.position);
      const reach = amenity.kind === "bench" || amenity.kind === "picnic_table" ? 4.8 : isStructureAmenityKind(amenity.kind) ? 6.2 : 5.6;
      if (amenityDistance < nearestDistance && amenityDistance < reach) {
        nearest = amenity;
        nearestDistance = amenityDistance;
      }
    }
    return nearest;
  }

  private useAmenity(amenity: AmenityPoint, completeImmediately = false): boolean {
    const alreadySearched = this.searchedAmenityIds.has(amenity.id);
    if (amenity.kind === "drinking_water") {
      this.player.health = Math.min(100, this.player.health + 24);
      this.flashStatus("Used drinking fountain");
      this.audio.playWorld("drink", amenity.position);
      return true;
    }
    if (amenity.kind === "bench") {
      return completeImmediately ? this.completeAmenityRest(amenity, 10) : this.startAmenityRest(amenity, 10);
    }
    if (amenity.kind === "picnic_table") {
      return completeImmediately ? this.completeAmenityRest(amenity, 12) : this.startAmenityRest(amenity, 12);
    }
    if (amenity.kind === "table_tennis") {
      this.shotBloom *= 0.35;
      this.player.velocity.multiplyScalar(0.15);
      this.flashStatus("Settled aim at table tennis");
      this.audio.playWorld("rest", amenity.position, { volume: 0.85 });
      return true;
    }
    if (alreadySearched) {
      this.flashStatus(`${amenity.label} already searched`);
      this.audio.playWorld("deny");
      return false;
    }

    if (!completeImmediately) {
      const lootContext = this.lootSearchContext(amenity);
      const duration = this.amenitySearchDuration(amenity) * lootSearchSecondsMultiplier(lootContext);
      const noiseMultiplier = lootNoiseMultiplier(amenity.kind, lootContext);
      this.activeAmenitySearch = {
        amenity,
        duration,
        remaining: duration,
        noiseTimer: 0.85,
        noiseMultiplier
      };
      this.player.velocity.multiplyScalar(0.2);
      this.emitNoise("scavenge", amenity.position, noiseMultiplier * 0.72);
      this.flashStatus(`Searching ${amenity.label}`);
      this.audio.playWorld("searchStart", amenity.position);
      return true;
    }

    return this.completeAmenitySearch(amenity);
  }

  private startAmenityRest(amenity: AmenityPoint, healthGain: number): boolean {
    if (this.activeAmenityRest) {
      this.flashStatus("Already resting");
      this.audio.playWorld("deny");
      return false;
    }
    if (this.player.health >= 100) {
      this.flashStatus("Already steady");
      this.audio.playWorld("deny");
      return false;
    }

    this.activeAmenitySearch = null;
    this.activeAmenityRest = {
      amenity,
      duration: REST_SECONDS,
      remaining: REST_SECONDS,
      healthGain
    };
    this.player.velocity.set(0, 0, 0);
    this.emitNoise("reload", amenity.position, 0.34, { volume: 0.55 });
    this.audio.playWorld("rest", amenity.position);
    this.flashStatus(`Resting at ${amenity.label}`);
    return true;
  }

  private updateAmenityRest(dt: number): void {
    if (!this.activeAmenityRest) {
      return;
    }

    this.player.velocity.set(0, 0, 0);
    this.activeAmenityRest.remaining -= dt;
    if (this.activeAmenityRest.remaining <= 0) {
      const rest = this.activeAmenityRest;
      this.activeAmenityRest = null;
      this.completeAmenityRest(rest.amenity, rest.healthGain);
    }
  }

  private completeAmenityRest(amenity: AmenityPoint, healthGain: number): boolean {
    this.player.health = Math.min(100, this.player.health + healthGain);
    this.player.velocity.set(0, 0, 0);
    this.flashStatus(amenity.kind === "picnic_table" ? "Rested at picnic table" : "Caught breath at bench");
    this.audio.playWorld("rest", amenity.position);
    return true;
  }

  private updateAmenitySearch(dt: number): void {
    if (!this.activeAmenitySearch) {
      return;
    }

    const search = this.activeAmenitySearch;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    if (distance(playerPoint, search.amenity.position) > 7.2) {
      this.activeAmenitySearch = null;
      this.flashStatus("Search abandoned");
      this.audio.playWorld("searchCancel");
      return;
    }

    this.player.velocity.multiplyScalar(0.82);
    search.remaining -= dt;
    search.noiseTimer -= dt;
    if (search.noiseTimer <= 0) {
      this.emitNoise("scavenge", search.amenity.position, search.noiseMultiplier, { volume: 0.72 });
      search.noiseTimer = this.rng.range(0.85, 1.25);
    }
    if (search.remaining <= 0) {
      this.activeAmenitySearch = null;
      this.completeAmenitySearch(search.amenity);
    }
  }

  private completeAmenitySearch(amenity: AmenityPoint): boolean {
    this.searchedAmenityIds.add(amenity.id);
    const loot = searchAmenityLoot(amenity.kind, this.rng, this.lootSearchContext(amenity));
    this.player.scrap += loot.scrap;
    this.player.health = Math.min(100, this.player.health + loot.health);
    this.loadout = addAmmo(this.loadout, loot.ammo);
    if (loot.attachment) {
      if (canUpgrade(this.loadout, loot.attachment)) {
        this.loadout = applyUpgrade(this.loadout, loot.attachment);
      } else {
        this.player.scrap += 12;
      }
    }
    if (loot.medicine > 0) {
      this.condition.bleedTimer = Math.max(0, this.condition.bleedTimer - loot.medicine);
      this.condition.blurTimer = Math.max(0, this.condition.blurTimer - loot.medicine * 0.35);
      this.condition.limpTimer = Math.max(0, this.condition.limpTimer - loot.medicine * 0.25);
    }
    this.condition.throwables = Math.min(MAX_THROWABLES, this.condition.throwables + loot.throwables);
    this.emitNoise("scavenge", amenity.position, loot.noiseMultiplier * 0.75);
    this.flashStatus(loot.status);
    this.audio.playWorld("searchComplete", amenity.position);
    return true;
  }

  private lootSearchContext(amenity: AmenityPoint): LootSearchContext {
    const nearbyZombies = this.zombies.filter((zombie) => distance({ x: zombie.position.x, z: zombie.position.z }, amenity.position) < 56).length;
    const surface = this.movementSurfaceAt(amenity.position);
    const exposedSurface = surface === "asphalt" || surface === "concrete" || surface === "rail" || surface === "gravel";
    const exposed = nearbyZombies >= 2 || exposedSurface || !this.isCoverNearPoint(amenity.position, 8, 9);
    return {
      nearbyZombies,
      exposed,
      wave: this.wave
    };
  }

  private amenitySearchDuration(amenity: AmenityPoint): number {
    if (amenity.kind === "maintenance_room") return 1.85;
    if (amenity.kind === "clubroom" || amenity.kind === "changeroom" || amenity.kind === "community_room") return 1.7;
    if (amenity.kind === "gatehouse") return 1.25;
    if (amenity.kind === "bbq") return 1.75;
    if (amenity.kind === "bicycle_parking") return 1.45;
    if (amenity.kind === "toilets") return 1.35;
    if (amenity.kind === "waste_basket") return 0.95;
    return 1.1;
  }

  private amenityPrompt(amenity: AmenityPoint): string {
    if (this.activeAmenityRest?.amenity.id === amenity.id) {
      return `Resting ${Math.ceil(this.activeAmenityRest.remaining)}s`;
    }
    if (this.activeAmenitySearch?.amenity.id === amenity.id) {
      return `Searching ${Math.ceil(this.activeAmenitySearch.remaining)}s`;
    }
    if (amenity.kind === "drinking_water") return "E: drink";
    if (amenity.kind === "bench") return `E: rest ${REST_SECONDS}s`;
    if (amenity.kind === "picnic_table") return `E: rest ${REST_SECONDS}s`;
    if (amenity.kind === "table_tennis") return "E: play";
    if (amenity.kind === "waste_basket") return this.searchedAmenityIds.has(amenity.id) ? "Bin searched" : "E: search bin";
    if (amenity.kind === "bicycle_parking") return this.searchedAmenityIds.has(amenity.id) ? "Bike racks searched" : "E: search bike racks";
    if (amenity.kind === "bbq") return this.searchedAmenityIds.has(amenity.id) ? "BBQ searched" : "E: search BBQ";
    if (isStructureAmenityKind(amenity.kind)) {
      return this.searchedAmenityIds.has(amenity.id) ? "Structure searched" : `E: search ${amenity.label}`;
    }
    return this.searchedAmenityIds.has(amenity.id) ? "Shelter used" : "E: shelter";
  }

  private updateNearestFixture(): void {
    if (this.bike?.mounted) {
      this.nearestFixture = null;
      return;
    }

    let nearest: InteractableFixture | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    for (const fixture of this.level.interactables.filter((candidate) => candidate.mode === "toggle")) {
      const active = this.player.activeFixtureId === fixture.id;
      if (active) {
        if (pointInInteractableRaisedFootprint(playerPoint, fixture, 2.2)) {
          nearest = fixture;
          nearestDistance = 0;
        }
        continue;
      }
      const interactionPoint = active ? fixture.position : fixture.accessPosition ?? fixture.position;
      const reach = active ? fixture.radius + 3 : fixture.accessRadius ?? fixture.radius + 3;
      const fixtureDistance = distance(playerPoint, interactionPoint);
      if (fixtureDistance < nearestDistance && fixtureDistance < reach) {
        nearest = fixture;
        nearestDistance = fixtureDistance;
      }
    }
    this.nearestFixture = nearest;
  }

  private updateNearestBrokenBike(): void {
    if (this.bike?.mounted) {
      this.nearestBrokenBike = null;
      return;
    }

    let nearest: ParkLifeDetail | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    for (const detail of this.level.parkLifeDetails.filter((candidate) => candidate.kind === "broken-bike")) {
      const detailDistance = distance(playerPoint, detail.position);
      if (detailDistance < nearestDistance && detailDistance < BIKE_INTERACTION_RADIUS) {
        nearest = detail;
        nearestDistance = detailDistance;
      }
    }
    this.nearestBrokenBike = nearest;
  }

  private toggleFixture(fixture: InteractableFixture): boolean {
    if (this.bike?.mounted) {
      this.flashStatus("Dismount before climbing");
      this.audio.playWorld("deny");
      return false;
    }

    if (this.player.activeFixtureId === fixture.id) {
      this.player.activeFixtureId = null;
      this.player.heightTarget = 0;
      const exit = fixture.exitPosition ?? fixture.accessPosition;
      if (exit) {
        this.player.position.set(exit.x, this.groundY(exit), exit.z);
      }
      this.flashStatus(`Dropped from ${fixture.label}`);
      this.emitNoise("climb", exit ?? fixture.position, 0.72);
    } else {
      const stamina = spendStamina(this.condition.stamina, CLIMB_STAMINA_COST);
      if (!stamina.spent) {
        this.flashStatus("Too winded to climb");
        this.audio.playWorld("deny");
        return false;
      }
      this.condition.stamina = stamina.stamina;
      this.player.activeFixtureId = fixture.id;
      this.player.heightTarget = fixture.height;
      const landing = fixture.landingPosition ?? fixture.position;
      this.player.position.set(landing.x, this.groundY(landing), landing.z);
      this.flashStatus(`${this.climbStatusVerb(fixture)} ${fixture.label}`);
      this.emitNoise("climb", fixture.accessPosition ?? fixture.position);
    }
    return true;
  }

  private climbStatusVerb(fixture: InteractableFixture): string {
    if (fixture.accessKind === "ladder") return "Climbed ladder to";
    if (fixture.accessKind === "stairs") return "Climbed stairs to";
    if (fixture.accessKind === "ramp") return "Walked onto";
    return "Climbed";
  }

  private updateVerticalState(dt: number): void {
    if (this.bike?.mounted) {
      this.player.activeFixtureId = null;
      this.player.heightTarget = 0;
      const t = 1 - Math.pow(0.001, dt);
      this.player.height += (this.player.heightTarget - this.player.height) * t;
      if (Math.abs(this.player.height) < 0.01) {
        this.player.height = 0;
      }
      return;
    }

    let target = 0;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    const active = this.level.interactables.find((fixture) => fixture.id === this.player.activeFixtureId);

    if (active) {
      if (pointInInteractableRaisedFootprint(playerPoint, active, 1.2)) {
        target = Math.max(target, active.height);
      } else {
        this.player.activeFixtureId = null;
      }
    }

    for (const fixture of this.level.interactables.filter((candidate) => candidate.mode === "auto")) {
      if (pointInInteractableRaisedFootprint(playerPoint, fixture, 0.8)) {
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

  private updateJumpState(dt: number): void {
    if (this.bike?.mounted || this.player.activeFixtureId || this.player.height > 0.2) {
      this.player.jumpHeight = 0;
      this.player.jumpVelocity = 0;
      return;
    }
    if (this.player.jumpHeight <= 0 && this.player.jumpVelocity <= 0) {
      this.player.jumpHeight = 0;
      this.player.jumpVelocity = 0;
      return;
    }
    this.player.jumpVelocity -= JUMP_GRAVITY * dt;
    this.player.jumpHeight += this.player.jumpVelocity * dt;
    if (this.player.jumpHeight <= 0) {
      this.player.jumpHeight = 0;
      this.player.jumpVelocity = 0;
    }
  }

  private updateElevatedNoise(dt: number): void {
    if (this.player.height <= 1.4) {
      this.elevatedNoiseTimer = 0;
      return;
    }
    this.elevatedNoiseTimer -= dt;
    if (this.elevatedNoiseTimer <= 0) {
      this.emitNoise("climb", { x: this.player.position.x, z: this.player.position.z }, 0.7 + Math.min(0.8, this.player.height / 7), {
        volume: 0.55
      });
      this.elevatedNoiseTimer = 1.35;
    }
  }

  private shouldBypassObstacle(obstacleId: string, point: Vec2): boolean {
    return this.shouldBypassObstacleForFixture(obstacleId, point, this.player.activeFixtureId);
  }

  private shouldBypassObstacleForFixture(obstacleId: string, point: Vec2, activeFixtureId: string | null): boolean {
    return shouldBypassCollisionObstacle(obstacleId, point, {
      activeFixtureId,
      interactables: this.level.interactables
    });
  }

  private shouldJumpBypassObstacle(obstacle: LevelData["obstacles"][number]): boolean {
    return obstacle.jumpable === true && this.player.jumpHeight >= (obstacle.jumpBypassMinHeight ?? 0.5);
  }

  private resolveSkateBowlExit(current: Vec2, candidate: Vec2, velocity: THREE.Vector3): Vec2 {
    let next = candidate;
    for (const bowl of this.level.skateBowls) {
      const currentLocal = this.skateBowlLocalPoint(bowl, current);
      const nextLocal = this.skateBowlLocalPoint(bowl, next);
      const currentNorm = this.skateBowlNorm(bowl, currentLocal);
      const nextNorm = this.skateBowlNorm(bowl, nextLocal);
      if (currentNorm < 0.96 && nextNorm >= 1 && !this.isSkateBowlExitGap(bowl, nextLocal)) {
        const scale = 0.94 / Math.max(nextNorm, 0.001);
        next = this.skateBowlWorldPoint(bowl, { x: nextLocal.x * scale, z: nextLocal.z * scale });
        velocity.multiplyScalar(0.28);
      }
    }
    return next;
  }

  private skateBowlLocalPoint(bowl: SkateBowlFeature, point: Vec2): Vec2 {
    const dx = point.x - bowl.center.x;
    const dz = point.z - bowl.center.z;
    const cos = Math.cos(bowl.angle);
    const sin = Math.sin(bowl.angle);
    return {
      x: dx * cos + dz * sin,
      z: -dx * sin + dz * cos
    };
  }

  private skateBowlWorldPoint(bowl: SkateBowlFeature, point: Vec2): Vec2 {
    const cos = Math.cos(bowl.angle);
    const sin = Math.sin(bowl.angle);
    return {
      x: bowl.center.x + point.x * cos - point.z * sin,
      z: bowl.center.z + point.x * sin + point.z * cos
    };
  }

  private skateBowlNorm(bowl: SkateBowlFeature, point: Vec2): number {
    return Math.hypot(point.x / bowl.radiusX, point.z / bowl.radiusZ);
  }

  private isSkateBowlExitGap(bowl: SkateBowlFeature, point: Vec2): boolean {
    const angle = Math.atan2(point.z / bowl.radiusZ, point.x / bowl.radiusX);
    const delta = Math.atan2(Math.sin(angle - bowl.exitAngle), Math.cos(angle - bowl.exitAngle));
    return Math.abs(delta) <= bowl.exitWidth;
  }

  private playerElevation(): number {
    return this.player.height + this.player.jumpHeight;
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
    this.audio.playWorld("equip");
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
    if (this.bike?.mounted) {
      const fixture = this.level.interactables.find((candidate) => candidate.id === fixtureId) ?? this.level.interactables[0] ?? null;
      return fixture ? this.toggleFixture(fixture) : false;
    }

    const fixture = fixtureId
      ? this.level.interactables.find((candidate) => candidate.id === fixtureId) ?? null
      : this.level.interactables[0] ?? null;
    if (!fixture) {
      return false;
    }
    const access = fixture.accessPosition ?? fixture.position;
    this.player.position.set(access.x, this.groundY(access), access.z);
    const toggled = this.toggleFixture(fixture);
    if (toggled && this.player.activeFixtureId === fixture.id) {
      this.player.heightTarget = fixture.height;
      this.player.height = fixture.height;
    }
    return toggled;
  }

  private testToggleBike(): boolean {
    if (!this.bike) {
      return false;
    }
    if (!this.bike.mounted) {
      this.player.position.set(this.bike.position.x, this.groundY({ x: this.bike.position.x, z: this.bike.position.z }), this.bike.position.z);
      this.player.height = 0;
      this.player.heightTarget = 0;
      this.player.activeFixtureId = null;
      this.updateBike(0);
    }
    return this.toggleBike();
  }

  private testUseAmenity(kind?: AmenityPoint["kind"]): boolean {
    const amenity = kind
      ? this.level.amenities.find((candidate) => candidate.kind === kind) ?? null
      : this.level.amenities[0] ?? null;
    if (!amenity) {
      return false;
    }
    this.player.position.set(amenity.position.x, this.groundY(amenity.position), amenity.position.z);
    if (amenity.kind === "bench" || amenity.kind === "picnic_table") {
      this.player.health = Math.min(this.player.health, 70);
      return this.useAmenity(amenity);
    }
    return this.useAmenity(amenity, true);
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

  private testZombieFacing(): ReturnType<GameTestApi["testZombieFacing"]> {
    return this.zombies
      .filter((zombie) => zombie.target)
      .map((zombie) => {
        const target = zombie.target!;
        const toTarget = new THREE.Vector3(target.x - zombie.position.x, 0, target.z - zombie.position.z);
        const targetDistance = toTarget.length();
        if (targetDistance > 0.001) {
          toTarget.normalize();
        }
        const faceForward = new THREE.Vector3(0, 0, -1).applyQuaternion(zombie.mesh.quaternion);
        faceForward.y = 0;
        if (faceForward.lengthSq() > 0.001) {
          faceForward.normalize();
        }
        return {
          id: zombie.id,
          faceAlignment: Number(faceForward.dot(toTarget).toFixed(3)),
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
    for (const zombie of this.zombies) {
      this.scene.remove(zombie.mesh);
    }
    this.zombies = [];
    this.waveDirector.completeActiveWaveForTest();
    return this.startIntermission();
  }

  private updateNearestStation(): void {
    this.nearestStation = this.nearestStationForPoint(this.player.position, 10);
  }

  private nearestStationForPoint(position: THREE.Vector3, reach: number): UpgradeStation | null {
    let nearest: UpgradeStation | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const station of this.level.upgradeStations) {
      const stationDistance = distance({ x: position.x, z: position.z }, station.position);
      if (stationDistance < nearestDistance && stationDistance < reach) {
        nearest = station;
        nearestDistance = stationDistance;
      }
    }
    return nearest;
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
    this.audio.playWorld("upgrade", station.position);
    this.flashStatus(`${UPGRADE_DEFINITIONS[upgradeId].label} upgraded`);
    return true;
  }

  private gameOver(): void {
    this.state = "gameover";
    this.hud.setRestartVisible(true);
    this.hud.setStatus(`Overrun at wave ${this.wave}`);
    document.exitPointerLock?.();
    if (this.isNetworkHost && this.multiplayer?.connected) {
      this.multiplayer.sendSnapshot(this.buildNetworkSnapshot());
    }
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
      elevation: Number(this.playerElevation().toFixed(2)),
      jumpHeight: Number(this.player.jumpHeight.toFixed(2)),
      renderedTrees: this.renderedTreeCount,
      renderedGrassClumps: this.renderedGrassClumpCount,
      renderedWetPathSheens: this.renderedWetPathSheenCount,
      renderedLampSpills: this.renderedLampSpillCount,
      renderedMistBanks: this.atmosphere.getGroundMistBankCount(),
      renderedRainDrops: this.atmosphere.getRainDropCount(),
      renderedWeatherAnchors: this.atmosphere.getWeatherAnchorCount(),
      weatherKind: this.currentWeather.kind,
      weatherRain: Number(this.currentWeather.precipitation.toFixed(2)),
      weatherCloudCover: Number(this.currentWeather.cloudCover.toFixed(2)),
      weatherFog: Number(this.currentWeather.fog.toFixed(2)),
      weatherWind: Number(this.currentWeather.wind.toFixed(2)),
      lastHitZone: this.lastHitZone,
      meleeSwing: Number(this.meleeSwing.toFixed(3)),
      shotBloom: Number(this.shotBloom.toFixed(4)),
      reloadProgress: Number(this.reloadProgress(performance.now() / 1000).toFixed(2)),
      scope: Number(this.scopeAmount.toFixed(2)),
      fov: Number(this.camera.fov.toFixed(1)),
      miniMapVisibleZombies: this.miniMapVisibleZombieCount,
      crouching: this.player.crouching,
      wavePhase: this.wavePhase,
      intermissionTimer: Number(this.intermissionTimer.toFixed(2)),
      amenityAction: this.activeAmenityRest ? "rest" : this.activeAmenitySearch ? "search" : null,
      amenityActionRemaining: Number((this.activeAmenityRest?.remaining ?? this.activeAmenitySearch?.remaining ?? 0).toFixed(2)),
      stamina: Number(this.condition.stamina.toFixed(1)),
      bleeding: this.condition.bleedTimer > 0,
      limp: this.condition.limpTimer > 0,
      blur: this.condition.blurTimer > 0,
      throwables: this.condition.throwables,
      flashlightOn: this.condition.flashlightOn,
      activeDistractions: this.distractions.length,
      bikeMounted: this.bike?.mounted === true
    };
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.root;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.postProcessing.setSize(clientWidth, clientHeight);
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
      zombieCount: this.zombies.length + (this.isNetworkClient ? this.networkRemainingSpawns : this.waveDirector.remainingSpawns),
      loadout: this.loadout,
      reloadProgress: this.reloadProgress(performance.now() / 1000),
      playerHeight: this.playerElevation(),
      activeFixtureId: this.player.activeFixtureId,
      nearestWeaponDrop: this.nearestWeaponDrop,
      nearestBike: this.nearestBike,
      nearestBrokenBike: this.nearestBrokenBike,
      nearestFixture: this.nearestFixture,
      nearestAmenity: this.nearestAmenity,
      nearestStation: this.nearestStation,
      wavePhase: this.wavePhase,
      intermissionTimer: this.intermissionTimer,
      isCrouching: this.player.crouching,
      stamina: this.condition.stamina,
      throwables: this.condition.throwables,
      flashlightOn: this.condition.flashlightOn,
      bikeMounted: this.bike?.mounted === true,
      injuryStatus: injuryStatus(this.condition),
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
    return this.visibilityContextForCombatant({
      id: this.localNetworkId,
      isLocal: true,
      position: this.player.position,
      velocity: this.player.velocity,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      health: this.player.health,
      crouching: this.player.crouching,
      crouchAmount: this.player.crouchAmount,
      height: this.player.height,
      jumpHeight: this.player.jumpHeight,
      activeFixtureId: this.player.activeFixtureId,
      condition: this.condition,
      loadout: this.loadout
    });
  }

  private visibilityContextForCombatant(combatant: CombatantRef) {
    return {
      playerPosition: this.combatantPoint(combatant),
      playerYaw: combatant.yaw,
      playerHeight: this.combatantElevation(combatant),
      cameraFov: this.camera.fov,
      cameraAspect: this.camera.aspect,
      obstacles: this.level.obstacles,
      isObstacleBypassed: (obstacleId: string, point: Vec2) => this.shouldBypassObstacleForFixture(obstacleId, point, combatant.activeFixtureId)
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
    this.renderedGrassClumpCount = this.world.getRenderedGrassClumpCount();
    this.renderedWetPathSheenCount = this.world.getRenderedWetPathSheenCount();
    this.renderedLampSpillCount = this.world.getRenderedLampSpillCount();
    new SceneDecals(this.scene, this.level, this.rng, (point) => this.groundY(point)).addWorldDecals();
  }

  private addPlayerTorch(): void {
    const torch = new THREE.SpotLight(0xffd27d, this.smokeMode ? 1.15 : 1.7, 48, 0.58, 0.82, 1.25);
    torch.position.set(0.1, -0.18, 0.08);
    torch.castShadow = false;
    const target = new THREE.Object3D();
    target.position.set(0, -0.24, -1);
    torch.target = target;
    this.camera.add(torch);
    this.camera.add(target);
    this.playerTorch = torch;
    this.applyFlashlightVisibility();
  }

  private rebuildViewWeapon(): void {
    this.weaponModel.clear();
    this.meleeSwing = 0;
    const stats = getWeaponStats(this.loadout);
    const weapon = this.meshFactory.createWeaponMesh(this.loadout.weaponId, true);
    if (stats.kind === "melee") {
      weapon.position.set(0.44, -0.47, -0.42);
      weapon.rotation.set(-0.46, -0.34, 0.42);
      weapon.scale.setScalar(this.loadout.weaponId === "machete" ? 1.08 : 1.28);
    } else {
      weapon.position.set(0.42, -0.42, -0.78);
      weapon.rotation.set(0.03, -0.08, 0.02);
    }
    this.weaponModel.add(weapon);

    const flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.55, 9),
      new THREE.MeshBasicMaterial({ color: 0xffc35f, transparent: true, opacity: 0.92 })
    );
    flash.position.set(0.5, -0.3, -1.28);
    flash.rotation.x = -Math.PI / 2;
    flash.visible = false;
    this.weaponModel.add(flash);
    this.muzzleFlash = flash;

    const light = new THREE.PointLight(0xffb45d, 2.8, 10);
    light.position.set(0.5, -0.3, -1.12);
    light.visible = false;
    this.weaponModel.add(light);
    this.muzzleLight = light;
  }

  private updateScope(dt: number, now: number): void {
    const stats = getWeaponStats(this.loadout);
    const bikeAllowsWeapon = !this.bike?.mounted || this.weaponCanFireOnBike(this.loadout.weaponId);
    const wantsScope =
      this.state === "playing" &&
      this.aimHeld &&
      bikeAllowsWeapon &&
      stats.scopeZoom > 1.05 &&
      this.loadout.reloadingUntil <= now &&
      this.condition.stamina > 0.5;
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
    this.meleeSwing = Math.max(0, this.meleeSwing - dt * (this.loadout.weaponId === "machete" ? 3.2 : 4.8));
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
    if (stats.kind === "melee") {
      const movement = Math.min(1, this.player.velocity.length() / 18) * stanceSway;
      const step = Math.sin(this.frame * 0.17);
      const attack = THREE.MathUtils.clamp(this.meleeSwing, 0, 1);
      const slash = Math.sin(attack * Math.PI);
      const recovery = attack * attack;
      const side = this.meleeSwingSide;
      this.weaponModel.position.set(
        Math.sin(t * 0.82) * 0.018 + step * 0.03 * movement + slash * 0.22 * side,
        Math.abs(Math.cos(t * 0.7)) * -0.02 - Math.abs(step) * 0.045 * movement - slash * 0.12 - this.player.crouchAmount * 0.035,
        recovery * 0.1 - slash * 0.3
      );
      this.weaponModel.rotation.set(
        -slash * 1.0 + recovery * 0.24 + Math.sin(t * 0.7) * 0.04 * movement,
        side * (slash * 0.76 + recovery * 0.22) - this.recoilYaw * 0.01,
        side * (slash * 1.18 + recovery * 0.18) + Math.sin(t * 0.5) * 0.04 + step * 0.07 * movement
      );
      this.weaponModel.scale.setScalar(1);
      return;
    }
    const reloadProgress = this.reloadProgress(performance.now() / 1000);
    const reloadPose = reloadProgress > 0 ? 0.62 + Math.sin(reloadProgress * Math.PI) * 0.38 : 0;
    const scopeTuck = THREE.MathUtils.smoothstep(this.scopeAmount, 0, 1);
    this.weaponModel.position.set(
      Math.sin(t) * 0.018 * bob + scopeTuck * 0.26,
      Math.abs(Math.cos(t)) * -0.018 * bob - reloadPose * 0.16 - scopeTuck * 0.5 - this.player.crouchAmount * 0.04,
      this.recoil * 0.07 + reloadPose * 0.06 + scopeTuck * 0.14
    );
    this.weaponModel.rotation.set(
      this.recoil * 0.05 + reloadPose * 0.22 - scopeTuck * 0.08,
      -this.recoilYaw * 0.01 - reloadPose * 0.12 - scopeTuck * 0.24,
      Math.sin(t * 0.5) * 0.015 * bob + reloadPose * 0.16 - scopeTuck * 0.12
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

}
