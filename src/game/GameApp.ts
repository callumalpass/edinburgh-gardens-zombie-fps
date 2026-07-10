import * as THREE from "three";
import {
  addAmmo,
  addWeapon,
  applyUpgrade,
  canUpgrade,
  consumeRound,
  createInitialLoadout,
  effectiveFirearmSpread,
  finishReloadIfReady,
  getWeaponStats,
  switchWeapon,
  startReload,
  UPGRADE_DEFINITIONS,
  WEAPON_DEFINITIONS,
  upgradeCost,
  type Loadout,
  type UpgradeId,
  type WeaponId
} from "./weapons";
import { resolveObstacle, shouldBypassObstacle as shouldBypassObstacleByContext } from "./collision";
import { applyDirectedZombieHit } from "./combat/damage";
import {
  canZombieMeleeCombatant,
  findMeleeHits as findMeleeTargetHits,
  findZombieHits as findZombieTargetHits
} from "./combat/targeting";
import { clampToPolygon, distance, nearestPointOnPolygon, pointInPolygon } from "./geo";
import { pointInInteractableRaisedFootprint, pointInRaisedFootprint } from "./interactables";
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
  applyBikePumpBoost,
  bleedDamagePerSecond,
  bikePumpSpeedMultiplier,
  createInitialPlayerCondition,
  hydrateCondition,
  hydrationStatus,
  injuryStatus,
  nextHydration,
  nextStamina,
  spendStamina
} from "./playerCondition";
import { SeededRandom } from "./random";
import { AtmosphereSystem } from "./rendering/AtmosphereSystem";
import { MeshFactory } from "./rendering/MeshFactory";
import { PostProcessingPipeline } from "./rendering/PostProcessingPipeline";
import { PainterlyContactShadows, type ContactShadowAnchor } from "./rendering/PainterlyContactShadows";
import { SceneDecals } from "./rendering/SceneDecals";
import { WorldBuilder, type GameMaterials } from "./rendering/WorldBuilder";
import { createGameMaterials } from "./rendering/materials";
import { timeOfDayFromElapsed, type TimeOfDayState } from "./rendering/timeOfDay";
import { weatherFromElapsed, type WeatherState } from "./rendering/weather";
import { freezeStaticScene } from "./rendering/staticScene";
import { collectWeatherAnchors } from "./rendering/weatherAnchors";
import { disposeThreeResources } from "./rendering/disposeThreeResources";
import { AdaptiveRenderQuality, RENDER_QUALITY_SETTINGS, type RenderQualityLevel } from "./rendering/renderQuality";
import {
  attachZombieAnimation,
  disposeZombieAssetAnimation,
  instantiateZombieAsset,
  triggerZombieAssetAnimation,
  updateZombieAssetAnimation,
  zombieAssetState
} from "./rendering/ZombieAsset";
import type { GameStateName, GameTestApi, HitZone, Pickup, ShellCasing, SmokePuff, Snapshot, Tracer, WavePhase, WeaponDrop, Zombie } from "./state";
import { installGameTestDriver, uninstallGameTestDriver } from "./testing/GameTestDriver";
import { InputController } from "./input/InputController";
import { TerrainSampler } from "./terrain";
import { MovementSurfaceSampler } from "./movement";
import {
  isLineOfSightBlocked as isLineOfSightBlockedByContext,
  isPointVisibleToPlayer as isPointVisibleToPlayerByContext
} from "./visibility";
import { createZombieSpawn, getWaveConfig, type ZombieSpawn, type ZombieType } from "./waves";
import { zombieEnvironmentalHearingMultiplier, zombieEnvironmentalSpeedMultiplier, zombieProfile } from "./zombieProfiles";
import { HudController } from "./ui/HudController";
import { MiniMapRenderer, type MiniMapZombie } from "./ui/MiniMapRenderer";
import { claimIntermissionUpgrade, intermissionUpgradeChoices } from "./intermissionChoices";
import { loadGameSettings, normalizeGameSettings, saveGameSettings, type GameSettings } from "./gameSettings";
import { playerVisibilityMultiplier, weatherNoiseMaskForKind, zombieFacingThreshold } from "./stealth";
import { separateCircularAgents } from "./spatial/AgentSeparation";
import { ObstacleIndex } from "./spatial/ObstacleIndex";
import { WaveDirector } from "./systems/WaveDirector";
import {
  BOTTLE_BOMB_FUSE_SECONDS,
  BOTTLE_BOMB_PULSE_MAX_SECONDS,
  BOTTLE_BOMB_PULSE_MIN_SECONDS,
  bottleBombEffectAtDistance
} from "./throwables";
import {
  FLARE_BEACON_PULSE_SECONDS,
  FLARE_BEACON_SECONDS,
  flareBurstEffectAtDistance
} from "./flareGun";
import { NetworkSession, type NetworkInputFrame } from "./multiplayer/NetworkSession";
import { RemotePlayerRoster } from "./multiplayer/RemotePlayerRoster";
import type {
  NetworkAction,
  NetworkGameSnapshot,
  NetworkPickupSnapshot,
  NetworkPlayerSnapshot,
  NetworkWeaponDropSnapshot,
  NetworkZombieSnapshot
} from "./multiplayer/types";
import {
  BIKE_ALLOWED_WEAPONS,
  BIKE_CAMERA_HEIGHT_BONUS,
  BIKE_INTERACTION_RADIUS,
  CLIMB_STAMINA_COST,
  DISTRACTION_STAMINA_COST,
  INTERMISSION_SECONDS,
  JUMP_STAMINA_COST,
  MACHETE_STAMINA_COST,
  MELEE_STAMINA_COST,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  REST_SECONDS,
  SKATEBOARD_CAMERA_HEIGHT_BONUS,
  START_POSITION,
  ZOMBIE_SEPARATION_GAP,
  ZOMBIE_SEPARATION_GRID_SIZE,
  ZOMBIE_SEPARATION_ITERATIONS,
  ZOMBIE_STATIC_COLLISION_PASSES
} from "./gameConfig";
import { createInitialPlayerState, resetPlayerState, reviveFallenSquadForIntermission } from "./playerState";
import type {
  AmenityRest,
  AmenitySearch,
  CombatantRef,
  NetworkRemotePlayer,
  DroppedWorldItem,
  PlacedLadder,
  RideableBike,
  ThrownDistraction
} from "./runtimeTypes";
import { FrameLoop } from "./runtime/FrameLoop";
import { GameEntityStore } from "./runtime/GameEntityStore";
import { PlayerLocomotion, type LocomotionInput } from "./systems/PlayerLocomotion";
import type {
  AmenityPoint,
  CollisionObstacle,
  InteractableFixture,
  InteractableRaisedFootprint,
  LevelData,
  ParkLifeDetail,
  StructureShelter,
  UpgradeStation,
  Vec2,
  WeaponSpawn
} from "./types";
import {
  INVENTORY_CAPACITY,
  ITEM_DEFINITIONS,
  isInventoryItem,
  isNoiseItem,
  type InventoryItemId,
  type LargeCarryItemId,
  type WorldItemId
} from "./items";

const STRUCTURE_FLOODLIGHT_RADIUS = 34;
const STRUCTURE_LIGHT_EXPOSURE_RADIUS = 28;
const SCREAMER_RALLY_RADIUS = 94;
const SCREAMER_RALLY_SEARCH_RADIUS = 28;
const PLACED_LADDER_PICKUP_RADIUS = 4.8;
const HIT_FLASH_SECONDS = 0.12;
const HIT_SPARK_SECONDS = 0.075;
const HIT_SPARK_BASE_SIZE = 0.42;
const HIT_SPARK_POOL_SIZE = 12;
const MAX_HIT_SPARKS_PER_SHOT = 2;
const MINI_MAP_ZOMBIE_UPDATE_INTERVAL_SECONDS = 0.5;

interface StructureUtilityEffect {
  root: THREE.Group;
  position: Vec2;
}

function normalizeRadians(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function formatGameTime(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const hours = Math.floor(normalized);
  const minutes = Math.floor((normalized - hours) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

interface ActiveFlareBeacon {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  position: Vec2;
  ttl: number;
  maxTtl: number;
  pulseTimer: number;
}

interface HitSpark {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  ttl: number;
  active: boolean;
}

type ConditionClassKey = "bleeding" | "limping" | "blurred";

export class GameApp {
  private readonly root: HTMLElement;
  private readonly level: LevelData;
  private readonly obstacleIndex: ObstacleIndex;
  private readonly terrain: TerrainSampler;
  private readonly movementSurfaces: MovementSurfaceSampler;
  private readonly locomotion: PlayerLocomotion;
  private readonly interactableById: Map<string, InteractableFixture>;
  private readonly toggleInteractables: InteractableFixture[];
  private readonly brokenBikeDetails: ParkLifeDetail[];
  private readonly inventoryCapacity = INVENTORY_CAPACITY;
  private readonly activeStructureUtilityEffects = new Map<string, StructureUtilityEffect>();
  private readonly activeFlareBeacons: ActiveFlareBeacon[] = [];
  private readonly hitSparks: HitSpark[] = [];
  private readonly conditionClassState = {
    bleeding: false,
    limping: false,
    blurred: false
  };
  private readonly entities = new GameEntityStore();
  private readonly noise = new NoiseSystem();
  private readonly rng = new SeededRandom(0xed1b97);
  private readonly waveDirector: WaveDirector;
  private readonly network = new NetworkSession();
  private readonly smokeMode = new URLSearchParams(window.location.search).has("smoke");
  private readonly adaptiveQuality = new AdaptiveRenderQuality(this.smokeMode ? "low" : "high");
  private settings: GameSettings = loadGameSettings();
  private readonly audio = new GameAudio({ enabled: !this.smokeMode, masterVolume: this.settings.masterVolume });
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
  private contactShadows!: PainterlyContactShadows;
  private currentWeather: WeatherState = weatherFromElapsed(0);
  private currentTimeOfDay: TimeOfDayState = timeOfDayFromElapsed(0);
  private state: GameStateName = "ready";
  private paused = false;
  private testApi: GameTestApi | null = null;
  private readonly events = new AbortController();
  private readonly frameLoop = new FrameLoop((tick) => this.tick(tick.dt, tick.elapsedSeconds));
  private disposed = false;
  private frame = 0;
  private player = createInitialPlayerState();
  private loadout: Loadout = createInitialLoadout();
  private lastShotAt = 0;
  private intermissionThreatTimer = 0;
  private intermissionThreatsSpawned = 0;
  private movementNoiseTimer = 0;
  private elevatedNoiseTimer = 0;
  private testCrouchOverride: boolean | null = null;
  private testCameraOverride = false;
  private testZombieSpawnIndex = 0;
  private lastDamageAt = 0;
  private damageDirection = 0;
  private damageDirectionTimer = 0;
  private hudNoiseLevel = 0;
  private hitFlashTimer = 0;
  private hitFlashActive = false;
  private hitSparkCursor = 0;
  private nearestStation: UpgradeStation | null = null;
  private nearestFixture: InteractableFixture | null = null;
  private nearestAmenity: AmenityPoint | null = null;
  private nearestWeaponDrop: WeaponDrop | null = null;
  private nearestBike: RideableBike | null = null;
  private nearestBrokenBike: ParkLifeDetail | null = null;
  private nearestWorldItem: DroppedWorldItem | null = null;
  private nearestPlacedLadder: PlacedLadder | null = null;
  private activeAmenitySearch: AmenitySearch | null = null;
  private activeAmenityRest: AmenityRest | null = null;
  private condition = createInitialPlayerCondition();
  private isSprinting = false;
  private distractionCooldown = 0;
  private flashlightNoiseTimer = 0;
  private playerTorch: THREE.SpotLight | null = null;
  private scratchVector = new THREE.Vector3();
  private readonly frameCombatants: CombatantRef[] = [];
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
  private miniMapZombieDots: MiniMapZombie[] = [];
  private lastMiniMapZombieUpdateAt = Number.NEGATIVE_INFINITY;
  private lastHitZone: HitZone | null = null;
  private readonly plinthClockMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly plinthClockLights: THREE.PointLight[] = [];
  private readonly contactShadowAnchors: ContactShadowAnchor[] = [];
  private materials!: GameMaterials;
  private bike: RideableBike | null = null;
  private bikes: RideableBike[] = [];
  private bikePedalPhase = 0;
  private inventory: InventoryItemId[] = [];
  private inventoryMenuOpen = false;
  private carriedItem: LargeCarryItemId | null = null;
  private placedLadders: PlacedLadder[] = [];
  private skateboardMounted = false;
  private skateboardMesh: THREE.Group | null = null;
  private remotePlayers!: RemotePlayerRoster;

  private get zombies(): Zombie[] {
    return this.entities.zombies;
  }

  private set zombies(zombies: Zombie[]) {
    this.entities.zombies = zombies;
  }

  private get pickups(): Pickup[] {
    return this.entities.pickups;
  }

  private set pickups(pickups: Pickup[]) {
    this.entities.pickups = pickups;
  }

  private get weaponDrops(): WeaponDrop[] {
    return this.entities.weaponDrops;
  }

  private set weaponDrops(weaponDrops: WeaponDrop[]) {
    this.entities.weaponDrops = weaponDrops;
  }

  private get tracers(): Tracer[] {
    return this.entities.tracers;
  }

  private set tracers(tracers: Tracer[]) {
    this.entities.tracers = tracers;
  }

  private get shells(): ShellCasing[] {
    return this.entities.shells;
  }

  private set shells(shells: ShellCasing[]) {
    this.entities.shells = shells;
  }

  private get smokePuffs(): SmokePuff[] {
    return this.entities.smokePuffs;
  }

  private set smokePuffs(smokePuffs: SmokePuff[]) {
    this.entities.smokePuffs = smokePuffs;
  }

  private get distractions(): ThrownDistraction[] {
    return this.entities.distractions;
  }

  private get droppedItems(): DroppedWorldItem[] {
    return this.entities.droppedItems;
  }

  private set droppedItems(items: DroppedWorldItem[]) {
    this.entities.droppedItems = items;
  }

  private get searchedAmenityIds(): Set<string> {
    return this.entities.searchedAmenityIds;
  }

  private get repairedBrokenBikeIds(): Set<string> {
    return this.entities.repairedBrokenBikeIds;
  }

  private get aimHeld(): boolean {
    return this.input?.aimHeld ?? false;
  }

  private set aimHeld(value: boolean) {
    this.input?.setAimHeld(value);
  }

  private get wave(): number {
    if (this.isNetworkClient) {
      return this.network.wave;
    }
    return this.waveDirector.wave;
  }

  private get wavePhase(): WavePhase {
    if (this.isNetworkClient) {
      return this.network.wavePhase;
    }
    return this.waveDirector.phase;
  }

  private get intermissionTimer(): number {
    if (this.isNetworkClient) {
      return this.network.intermissionTimer;
    }
    return this.waveDirector.intermissionTimer;
  }

  private get isNetworkHost(): boolean {
    return this.network.isHost;
  }

  private get isNetworkClient(): boolean {
    return this.network.isClient;
  }

  constructor(root: HTMLElement) {
    this.root = root;
    this.level = createLevelData();
    this.obstacleIndex = new ObstacleIndex(this.level.obstacles);
    this.terrain = new TerrainSampler(this.level);
    this.movementSurfaces = new MovementSurfaceSampler(this.level);
    this.locomotion = new PlayerLocomotion({
      boundary: this.level.boundary,
      skateBowls: this.level.skateBowls,
      interactables: this.level.interactables,
      obstacleIndex: this.obstacleIndex,
      groundY: (point) => this.groundY(point),
      movementSurfaceAt: (point) => this.movementSurfaceAt(point),
      surfaceSpeedMultiplier: (surface) => this.movementSurfaces.speedMultiplier(surface),
      bikeSurfaceSpeedMultiplier: (surface) => this.movementSurfaces.bikeSpeedMultiplier(surface),
      skateboardSurfaceSpeedMultiplier: (surface) => this.movementSurfaces.skateboardSpeedMultiplier(surface)
    });
    this.interactableById = new Map(this.level.interactables.map((fixture) => [fixture.id, fixture]));
    this.toggleInteractables = this.level.interactables.filter((fixture) => fixture.mode === "toggle");
    this.brokenBikeDetails = this.level.parkLifeDetails.filter((detail) => detail.kind === "broken-bike");
    this.waveDirector = new WaveDirector(this.level.spawnPoints, this.rng, {
      intermissionSeconds: INTERMISSION_SECONDS,
      initialSpawnDelay: 0.4
    });
    this.player.position.set(START_POSITION.x, this.groundY({ x: START_POSITION.x, z: START_POSITION.z }), START_POSITION.z);
  }

  init(): void {
    this.hud = HudController.mount(this.root, {
      resume: () => this.setPaused(false),
      restart: () => {
        this.setPaused(false);
        this.restart();
      },
      exitToMenu: () => this.exitToMainMenu(),
      chooseIntermissionUpgrade: (upgradeId) => this.chooseIntermissionUpgrade(upgradeId),
      changeSettings: (settings) => this.updateSettings(settings)
    }, this.events.signal);
    this.hud.setSettings(this.settings);
    this.root.classList.toggle("high-contrast-hud", this.settings.highContrastHud);
    this.canvas = this.root.querySelector<HTMLCanvasElement>(".game-canvas")!;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.smokeMode,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    if (this.rendererUsesSoftwareWebGL()) {
      this.adaptiveQuality.set("low");
    }
    const initialQuality = RENDER_QUALITY_SETTINGS[this.adaptiveQuality.current];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.smokeMode ? 1 : initialQuality.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = !this.smokeMode;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = !this.smokeMode;

    this.camera = new THREE.PerspectiveCamera(this.settings.fieldOfView, 1, 0.1, 1800);
    this.camera.userData.dynamic = true;
    this.weaponModel.userData.dynamic = true;
    this.scene = new THREE.Scene();
    this.contactShadows = new PainterlyContactShadows();
    this.scene.add(this.contactShadows.root);
    this.atmosphere = new AtmosphereSystem(this.scene, this.rng, this.smokeMode, this.weatherAnchors());
    this.postProcessing = new PostProcessingPipeline(this.renderer, this.scene, this.camera, this.smokeMode);
    this.materials = createGameMaterials(this.rng);
    this.meshFactory = new MeshFactory(this.materials);
    this.remotePlayers = new RemotePlayerRoster({
      scene: this.scene,
      meshFactory: this.meshFactory,
      groundY: (point) => this.groundY(point)
    });
    this.miniMap = new MiniMapRenderer(this.hud.miniMap, this.level);
    this.scene.add(this.camera);
    this.camera.add(this.weaponModel);
    this.addPlayerTorch();
    this.rebuildViewWeapon();
    this.createWorld();
    this.world.createUpgradeStations();
    this.applyRenderQuality(this.adaptiveQuality.current, false);
    freezeStaticScene(this.scene, [this.camera, this.atmosphere.root, this.atmosphere.worldWeatherRoot, this.contactShadows.root]);
    this.collectPlinthClockFlashTargets();
    this.spawnRideableBikes();
    this.spawnWorldItems();
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
      testSetRenderQuality: (level) => {
        this.adaptiveQuality.set(level);
        this.applyRenderQuality(level);
        return this.snapshot();
      },
      testTeleport: (position) => this.testTeleport(position),
      testShoot: () => this.shoot(performance.now() / 1000, true),
      testUpgrade: (stationId?: string) => this.buyUpgrade(stationId),
      testSpawn: (type) => this.forceSpawnZombie(type),
      testPickupWeapon: (weaponId?: WeaponId) => this.testPickupWeapon(weaponId),
      testScope: (weaponId?: WeaponId) => this.testScope(weaponId),
      testInteract: (fixtureId?: string) => this.testInteract(fixtureId),
      testUseAmenity: (kind?: AmenityPoint["kind"]) => this.testUseAmenity(kind),
      testRepairFlatBike: () => this.testRepairFlatBike(),
      testUnlockLockedBike: () => this.testUnlockLockedBike(),
      testPickupItem: (itemId?: string) => this.testPickupItem(itemId),
      testDropItem: () => this.dropItem(),
      testInspectInventory: () => this.inspectInventory(),
      testPlaceLadder: (fixtureId?: string) => this.testPlaceLadder(fixtureId),
      testPickupPlacedLadder: () => this.testPickupPlacedLadder(),
      testToggleSkateboard: () => this.toggleSkateboard(),
      testThrowDistraction: () => this.throwDistraction(),
      testToggleFlashlight: () => this.toggleFlashlight(),
      testMiniMapVisibility: () => this.testMiniMapVisibility(),
      testGrounding: () => this.testGrounding(),
      testZombieStates: () => this.testZombieStates(),
      testZombieAssetStates: () => this.zombies.map((zombie) => ({
        id: zombie.id,
        type: zombie.type,
        assetLoaded: zombieAssetState(zombie.mesh).loaded,
        animation: zombieAssetState(zombie.mesh).animation
      })),
      testZombieFacing: () => this.testZombieFacing(),
      testSetCrouching: (crouching: boolean) => this.testSetCrouching(crouching),
      testStartIntermission: () => this.testStartIntermission(),
      testChooseIntermissionUpgrade: (upgradeId?: UpgradeId) => this.chooseIntermissionUpgrade(upgradeId ?? this.currentIntermissionChoices()[0]?.id ?? "damage"),
      testAddTeammate: (name, avatarId) => {
        this.remotePlayers.add(`test-peer-${this.remotePlayers.size + 1}`, name ?? "Test survivor", avatarId);
        this.updateHud();
        return true;
      },
      testAvatarStates: () => [...this.remotePlayers.values()].map((player) => ({
        id: player.id,
        avatarId: player.avatarId,
        assetLoaded: player.avatarVisual?.userData.kind === "blender-player-avatar",
        animation: player.activeAnimation,
        weaponAttachedToSocket: player.mesh.getObjectByName("remote-weapon")?.parent?.name === "WeaponSocket"
      })),
      testToggleBike: () => this.testToggleBike(),
      dispose: () => this.dispose()
    };
    installGameTestDriver(this.testApi);

    this.frameLoop.start();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.events.abort();
    this.frameLoop.stop();
    if (this.testApi) {
      uninstallGameTestDriver(this.testApi);
      this.testApi = null;
    }
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    this.network.close();
    this.remotePlayers?.clear();
    this.audio.dispose();
    this.clearActiveFlareBeacons();

    disposeThreeResources(this.scene);
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
        takeItem: () => this.handleTakeInput(),
        toggleInventory: () => this.toggleInventoryMenu(),
        dropItem: () => this.dropItem(),
        jump: () => this.handleJumpInput(),
        toggleSkateboard: () => this.toggleSkateboard(),
        equipSlot: (index) => this.handleEquipSlotInput(index),
        look: (movementX, movementY) => this.handleLook(movementX, movementY),
        cancel: () => {
          if (this.closeInventoryMenu()) {
            return;
          }
          if (this.state === "playing") {
            this.setPaused(!this.paused);
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

  private setPaused(paused: boolean): void {
    if (this.state !== "playing") return;
    this.paused = paused;
    this.input?.setEnabled(!paused);
    this.aimHeld = false;
    this.hud.setPaused(paused, this.network.enabled);
    if (paused) {
      document.exitPointerLock?.();
    } else {
      this.canvas.requestPointerLock?.();
      void this.audio.unlock();
    }
  }

  private updateSettings(patch: Partial<GameSettings>): void {
    this.settings = normalizeGameSettings({ ...this.settings, ...patch });
    saveGameSettings(this.settings);
    this.audio.setMasterVolume(this.settings.masterVolume);
    this.root.classList.toggle("high-contrast-hud", this.settings.highContrastHud);
    this.hud.setSettings(this.settings);
    if (this.camera) {
      this.camera.fov = this.scopeAmount > 0.01
        ? THREE.MathUtils.clamp(this.settings.fieldOfView / Math.max(1, getWeaponStats(this.loadout).scopeZoom), 24, this.settings.fieldOfView)
        : this.settings.fieldOfView;
      this.camera.updateProjectionMatrix();
    }
  }

  private exitToMainMenu(): void {
    this.dispose();
    window.location.assign(window.location.pathname);
  }

  private setupMultiplayer(): void {
    const connected = this.network.connect(
      {
        status: (message) => this.flashStatus(message),
        peerLeft: (playerId) => this.remotePlayers.remove(playerId),
        peerJoined: (playerId, name, avatarId) => this.remotePlayers.add(playerId, name, avatarId),
        input: (playerId, input) => {
          const player = this.remotePlayers.get(playerId) ?? this.remotePlayers.add(playerId, `Player ${playerId}`);
          player.input = input;
          player.yaw = input.yaw;
          player.pitch = input.pitch;
          player.lastInputAt = performance.now() / 1000;
        },
        action: (playerId, action) => this.handleNetworkPlayerAction(playerId, action),
        snapshot: (snapshot) => this.applyNetworkSnapshot(snapshot)
      },
      { disabled: this.smokeMode }
    );

    if (connected && this.isNetworkClient) {
      this.clearNetworkAuthoritativeEntities();
    }
  }

  private handleShootInput(now: number): void {
    if (this.paused) return;
    if (this.sendNetworkAction("shoot")) {
      this.hudNoiseLevel = Math.max(this.hudNoiseLevel, 0.9);
      return;
    }
    this.shoot(now);
  }

  private handleReloadInput(now: number): void {
    if (this.paused) return;
    if (this.sendNetworkAction("reload")) {
      return;
    }
    this.reload(now);
  }

  private handleInteractInput(): boolean {
    if (this.paused) return false;
    if (this.sendNetworkAction("interact")) {
      return true;
    }
    return this.handleInteract();
  }

  private handleToggleFlashlightInput(): boolean {
    if (this.paused) return false;
    if (this.sendNetworkAction("toggleFlashlight")) {
      return true;
    }
    return this.toggleFlashlight();
  }

  private handleThrowDistractionInput(): boolean {
    if (this.paused) return false;
    if (this.sendNetworkAction("throwDistraction")) {
      return true;
    }
    return this.throwDistraction();
  }

  private handleTakeInput(): boolean {
    if (this.paused) return false;
    if (this.nearestWeaponDrop && !this.nearestWorldItem && this.sendNetworkAction("take")) {
      return true;
    }
    return this.handleTakeOrRemove();
  }

  private handleJumpInput(): boolean {
    if (this.paused) return false;
    if (this.sendNetworkAction("jump")) {
      return true;
    }
    return this.jump();
  }

  private handleEquipSlotInput(index: number): void {
    if (this.paused) return;
    const choice = this.currentIntermissionChoices()[index];
    if (choice && this.wavePhase === "intermission" && this.player.intermissionUpgradeWave !== this.wave) {
      this.chooseIntermissionUpgrade(choice.id);
      return;
    }
    if (this.sendNetworkAction("equipSlot", index)) {
      return;
    }
    this.equipSlot(index);
  }

  private sendNetworkAction(type: NetworkAction["type"], slot?: number, upgradeId?: UpgradeId): boolean {
    return this.network.sendAction(type, {
      slot,
      upgradeId,
      yaw: this.player.yaw,
      pitch: this.player.pitch
    });
  }

  private start(): void {
    this.state = "playing";
    this.paused = false;
    this.hud.setPaused(false, this.network.enabled);
    this.lastMiniMapZombieUpdateAt = Number.NEGATIVE_INFINITY;
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
    resetPlayerState(this.player, this.groundY({ x: START_POSITION.x, z: START_POSITION.z }));
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
    this.clearTransientEffects();
    this.entities.clearSceneEntities(this.scene);
    this.clearStructureUtilityEffects();
    this.clearActiveFlareBeacons();
    this.clearPlacedLadders();
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
    this.clearConditionClasses();
    this.clearHitFlash();
    this.noise.clear();
    this.activeAmenitySearch = null;
    this.activeAmenityRest = null;
    this.entities.clearInteractionMemory();
    this.inventory = [];
    this.inventoryMenuOpen = false;
    this.carriedItem = null;
    this.skateboardMounted = false;
    this.syncSkateboardMesh();
    this.nearestBike = null;
    this.nearestBrokenBike = null;
    this.nearestWorldItem = null;
    this.nearestPlacedLadder = null;
    this.resetRideableBikes();
    this.spawnWorldItems();
    if (this.isNetworkHost) {
      this.remotePlayers.reset();
    }
    this.hud.setRestartVisible(false);
    this.state = "playing";
    this.paused = false;
    this.hud.setPaused(false, this.network.enabled);
    this.hudNoiseLevel = 0;
    this.damageDirectionTimer = 0;
    this.miniMapZombieDots = [];
    this.lastMiniMapZombieUpdateAt = Number.NEGATIVE_INFINITY;
    this.miniMap.resetDiscovery();
    this.spawnInitialWeapons();
    this.updateHud();
    this.sendNetworkSnapshotNow();
  }

  private tick(dt: number, now: number): void {
    if (this.disposed) {
      return;
    }
    this.frame += 1;

    const lanContinues = this.paused && this.network.enabled;
    if (this.state === "playing" && (!this.paused || lanContinues)) {
      this.update(dt, now);
    } else if (this.smokeMode) {
      this.camera.position.set(42, 42, 82);
      this.camera.lookAt(0, 0, 0);
    }

    const simulationDt = this.paused && !this.network.enabled ? 0 : dt;
    this.remotePlayers?.updateAnimations(simulationDt);
    if (this.isNetworkClient) {
      for (const zombie of this.zombies) {
        this.animateZombie(zombie, now, zombie.position.distanceTo(this.player.position), simulationDt);
      }
    }
    const atmosphere = this.atmosphere.update(simulationDt, this.camera.position, now);
    const { timeOfDay, weather } = atmosphere;
    this.currentWeather = weather;
    this.currentTimeOfDay = timeOfDay;
    this.world.updateTimeOfDay(timeOfDay, weather);
    if (this.world.updateShadowFocus({ x: this.player.position.x, z: this.player.position.z }, now)) {
      this.renderer.shadowMap.needsUpdate = !this.smokeMode;
    }
    this.updatePainterlyContactShadows();
    this.updatePlinthClockFlash(now);
    this.postProcessing.setTimeOfDay(timeOfDay);
    this.postProcessing.setWeather(weather);
    this.renderer.toneMappingExposure = timeOfDay.exposure * weather.exposureMultiplier;
    this.renderer.info.reset();
    this.postProcessing.render(simulationDt, this.renderer, this.scene, this.camera);
    if (!this.smokeMode) {
      const nextQuality = this.adaptiveQuality.update(dt);
      if (nextQuality) {
        this.applyRenderQuality(nextQuality);
      }
    }
  }

  private updatePainterlyContactShadows(): void {
    this.contactShadowAnchors.length = this.zombies.length;
    for (let index = 0; index < this.zombies.length; index += 1) {
      const zombie = this.zombies[index];
      const anchor = this.contactShadowAnchors[index] ?? { x: 0, y: 0, z: 0, radius: 1 };
      anchor.x = zombie.position.x;
      anchor.y = this.groundY(zombie.position);
      anchor.z = zombie.position.z;
      anchor.radius = zombie.radius * (zombie.type === "bloater" ? 1.42 : 1.18);
      anchor.stretch = zombie.type === "crawler" ? 1.9 : zombie.type === "sprinter" ? 1.34 : 1.12;
      this.contactShadowAnchors[index] = anchor;
    }
    this.contactShadows.update(this.contactShadowAnchors);
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
    this.updateActiveFlareBeacons(dt);
    this.updateNetworkHostPlayers(dt, now);
    this.updateWavePacing(dt);
    this.updateZombies(dt, now);
    this.updatePickups(dt);
    this.updateWeaponDrops(dt);
    this.updateWorldItems(dt);
    this.updateBikes(dt);
    this.updateSkateboard(dt);
    this.updateAmenityRest(dt);
    this.updateAmenitySearch(dt);
    this.updateTracers(dt);
    this.updateShells(dt);
    this.updateSmokePuffs(dt);
    this.updateHitSparks(dt);
    this.updateHitFlash(dt);
    this.updateHudSignals(dt);
    this.updateNearestStation();
    this.updateNearestAmenity();
    this.updateNearestWorldItem();
    this.updateNearestBrokenBike();
    this.updateNearestFixture();
    this.updateNearestPlacedLadder();
    this.updateScope(dt, now);
    this.updatePlayerCondition(dt);
    this.updateWeaponModel(dt);
    this.updateCamera();
    this.updateAudio(dt);
    this.updateHud();
    this.updateMiniMap(now);
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
    this.updateWorldItems(dt);
    this.updateSkateboard(dt);
    this.updateTracers(dt);
    this.updateShells(dt);
    this.updateSmokePuffs(dt);
    this.updateHitSparks(dt);
    this.updateHitFlash(dt);
    this.updateHudSignals(dt);
    this.updateNearestStation();
    this.updateNearestAmenity();
    this.updateNearestWorldItem();
    this.updateNearestBrokenBike();
    this.updateNearestFixture();
    this.updateNearestPlacedLadder();
    this.updateScope(dt, now);
    this.updateWeaponModel(dt);
    this.updateCamera();
    this.updateAudio(dt);
    this.updateHud();
    this.updateMiniMap(now);
  }

  private updateNetworkClientBikeTarget(): void {
    if (this.mountedBike()) {
      this.nearestBike = null;
      return;
    }
    this.nearestBike = this.bikes
      .filter((bike) => bike.position.distanceTo(this.player.position) < BIKE_INTERACTION_RADIUS)
      .sort((a, b) => a.position.distanceTo(this.player.position) - b.position.distanceTo(this.player.position))[0] ?? null;
  }

  private sendNetworkInputFrame(dt: number): void {
    this.network.sendInputFrame(dt, this.state, this.currentNetworkInput());
  }

  private currentNetworkInput(): NetworkInputFrame {
    const movement = this.input?.movement() ?? { x: 0, z: 0, length: 0 };
    return {
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
    this.network.sendSnapshotFrame(dt, () => this.buildNetworkSnapshot());
  }

  private sendNetworkSnapshotNow(): void {
    if (this.isNetworkHost) {
      this.network.sendSnapshot(this.buildNetworkSnapshot());
    }
  }

  private buildNetworkSnapshot(): NetworkGameSnapshot {
    return {
      frame: this.frame,
      sentAt: performance.now(),
      roomId: this.network.config.roomId,
      hostId: this.network.localId,
      state: this.state,
      wave: this.wave,
      wavePhase: this.wavePhase,
      intermissionTimer: this.intermissionTimer,
      remainingSpawns: this.waveDirector.remainingSpawns,
      players: [this.localPlayerNetworkSnapshot(), ...[...this.remotePlayers.values()].map((player) => this.remotePlayerNetworkSnapshot(player))],
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
      id: this.network.localId,
      name: this.network.config.playerName,
      avatarId: this.network.config.avatarId,
      lastProcessedInputSequence: 0,
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      health: this.player.health,
      scrap: this.player.scrap,
      stamina: this.condition.stamina,
      hydration: this.condition.hydration,
      bleedTimer: this.condition.bleedTimer,
      limpTimer: this.condition.limpTimer,
      blurTimer: this.condition.blurTimer,
      bikePumpTimer: this.condition.bikePumpTimer,
      crouching: this.player.crouching,
      aim: this.aimHeld,
      moveSpeed: Math.hypot(this.player.velocity.x, this.player.velocity.z),
      sprinting: this.isSprinting,
      height: this.player.height,
      jumpHeight: this.player.jumpHeight,
      activeFixtureId: this.player.activeFixtureId,
      flashlightOn: this.condition.flashlightOn,
      throwables: this.condition.throwables,
      loadout: this.loadout,
      bikeMounted: this.mountedBike() !== null,
      alive: this.player.health > 0,
      intermissionUpgradeWave: this.player.intermissionUpgradeWave,
      reviveProtectionTimer: this.player.reviveProtectionTimer
    };
  }

  private remotePlayerNetworkSnapshot(player: NetworkRemotePlayer): NetworkPlayerSnapshot {
    return {
      id: player.id,
      name: player.name,
      avatarId: player.avatarId,
      lastProcessedInputSequence: player.input.sequence,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health,
      scrap: player.scrap,
      stamina: player.condition.stamina,
      hydration: player.condition.hydration,
      bleedTimer: player.condition.bleedTimer,
      limpTimer: player.condition.limpTimer,
      blurTimer: player.condition.blurTimer,
      bikePumpTimer: player.condition.bikePumpTimer,
      crouching: player.crouching,
      aim: player.input.aim,
      moveSpeed: Math.hypot(player.velocity.x, player.velocity.z),
      sprinting: player.isSprinting,
      height: player.height,
      jumpHeight: player.jumpHeight,
      activeFixtureId: player.activeFixtureId,
      flashlightOn: player.condition.flashlightOn,
      throwables: player.condition.throwables,
      loadout: player.loadout,
      bikeMounted: false,
      alive: player.health > 0,
      intermissionUpgradeWave: player.intermissionUpgradeWave,
      reviveProtectionTimer: player.reviveProtectionTimer
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
    for (const player of this.remotePlayers.values()) {
      player.loadout = finishReloadIfReady(player.loadout, now);
      if (player.health <= 0) {
        player.velocity.multiplyScalar(0.72);
        this.remotePlayers.updateMesh(player);
        continue;
      }
      this.updateNetworkPlayerCrouch(player, dt);
      this.updateNetworkPlayerJumpState(player, dt);
      this.updateNetworkPlayerMovement(player, dt, now);
      this.updateNetworkPlayerVerticalState(player, dt);
      this.updateNetworkPlayerCondition(player, dt);
      this.remotePlayers.updateMesh(player);
    }
  }

  private updateNetworkPlayerCrouch(player: NetworkRemotePlayer, dt: number): void {
    this.locomotion.updateCrouch(player, dt, player.input.crouch);
  }

  private updateNetworkPlayerMovement(player: NetworkRemotePlayer, dt: number, now: number): void {
    const stale = now - player.lastInputAt > 1.5;
    const input = {
      x: stale ? 0 : player.input.moveX,
      z: stale ? 0 : player.input.moveZ,
      length: stale ? 0 : Math.hypot(player.input.moveX, player.input.moveZ)
    };
    const movement = this.locomotion.moveOnFoot(player, dt, input, {
      wantsSprint: !stale && player.input.sprint,
      condition: player.condition
    });
    player.isSprinting = movement.sprinting;
    if (movement.moved) {
      this.emitNetworkPlayerMovementNoise(player, dt, movement.sprinting);
    }
  }

  private updateNetworkPlayerCondition(player: NetworkRemotePlayer, dt: number): void {
    player.reviveProtectionTimer = Math.max(0, player.reviveProtectionTimer - dt);
    player.condition.bleedTimer = Math.max(0, player.condition.bleedTimer - dt);
    player.condition.limpTimer = Math.max(0, player.condition.limpTimer - dt);
    player.condition.blurTimer = Math.max(0, player.condition.blurTimer - dt);
    player.condition.bikePumpTimer = Math.max(0, player.condition.bikePumpTimer - dt);
    player.condition.hydration = nextHydration(player.condition.hydration, dt, {
      sprinting: player.isSprinting,
      elevated: player.height + player.jumpHeight > 1.2 || Boolean(player.activeFixtureId),
      bleeding: player.condition.bleedTimer > 0,
      daylight: this.currentTimeOfDay.daylight,
      sheltered: this.structureShelterProtectionForCombatant(this.combatantRefForNetworkPlayer(player)) >= 0.56
    });
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
      bleeding: player.condition.bleedTimer > 0,
      hydration: player.condition.hydration,
      sheltered: this.structureShelterProtectionForCombatant(this.combatantRefForNetworkPlayer(player)) >= 0.56
    });
  }

  private updateNetworkPlayerJumpState(player: NetworkRemotePlayer, dt: number): void {
    this.locomotion.updateJumpState(player, dt);
  }

  private updateNetworkPlayerVerticalState(player: NetworkRemotePlayer, dt: number): void {
    this.locomotion.updateFixtureElevation(player, dt);
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

  private handleNetworkPlayerAction(playerId: string, action: NetworkAction): void {
    const player = this.remotePlayers.get(playerId);
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
    if (action.type === "take") this.takeNetworkPlayer(player);
    if (action.type === "toggleFlashlight") this.toggleNetworkPlayerFlashlight(player);
    if (action.type === "throwDistraction") this.throwNetworkPlayerDistraction(player);
    if (action.type === "jump") this.jumpNetworkPlayer(player);
    if (action.type === "equipSlot" && typeof action.slot === "number") this.equipNetworkPlayerSlot(player, action.slot);
    if (action.type === "chooseIntermissionUpgrade" && action.upgradeId) {
      this.chooseIntermissionUpgradeForNetworkPlayer(player, action.upgradeId);
    }
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
    const totalSpread = effectiveFirearmSpread(stats, {
      movementSpeed: player.velocity.length(),
      shotBloom: player.shotBloom,
      crouching: player.crouching,
      aimAmount: player.input.aim ? 1 : 0,
      aimHeld: player.input.aim,
      stamina: player.condition.stamina,
      hydration: player.condition.hydration,
      weather: this.currentWeather,
      weatherProtection: this.structureShelterProtectionForCombatant(this.combatantRefForNetworkPlayer(player))
    });
    if (player.loadout.weaponId === "flareGun") {
      const direction = this.directionFromYawPitch(player.yaw, player.pitch);
      direction.x += this.rng.range(-totalSpread, totalSpread);
      direction.y += this.rng.range(-totalSpread, totalSpread) * 0.55;
      direction.z += this.rng.range(-totalSpread, totalSpread);
      direction.normalize();
      this.fireFlareRound(origin, direction, stats, { x: player.position.x, z: player.position.z }, player);
      return;
    }
    for (let pellet = 0; pellet < stats.pellets; pellet += 1) {
      const direction = this.directionFromYawPitch(player.yaw, player.pitch);
      direction.x += this.rng.range(-totalSpread, totalSpread);
      direction.y += this.rng.range(-totalSpread, totalSpread) * 0.55;
      direction.z += this.rng.range(-totalSpread, totalSpread);
      direction.normalize();
      const hits = this.findZombieHits(origin, direction, stats.range, stats.penetration);
      const endPoint = hits[0]?.point ?? origin.clone().addScaledVector(direction, stats.range);
      for (const hit of hits) {
        const result = applyDirectedZombieHit(hit.zombie, hit, stats, { x: player.position.x, z: player.position.z }, this.rng, {
          memorySeconds: { min: 2.6, max: 4.4 },
          staggerBonusByZone: { legs: 0.22 }
        });
        this.createHitSpark(hit.point);
        if (result.killed) {
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
    this.remotePlayers.triggerAnimation(player, "Melee");
    this.emitNoise("melee", { x: player.position.x, z: player.position.z }, stats.noiseMultiplier * (player.crouching ? 0.7 : 1), {
      weaponId: player.loadout.weaponId
    });
    const direction = this.directionFromYawPitch(player.yaw, player.pitch);
    const hits = this.findMeleeHitsFor(player.position, direction, stats.range, Math.max(1, stats.penetration), player.crouching, player.loadout.weaponId);
    for (const hit of hits) {
      const result = applyDirectedZombieHit(hit.zombie, hit, stats, { x: player.position.x, z: player.position.z }, this.rng, {
        memorySeconds: { min: 2, max: 3.6 },
        staggerBonusByZone: { head: 0.18 }
      });
      this.createHitSpark(hit.point);
      if (result.killed) {
        this.killZombie(hit.zombie, player);
      }
    }
  }

  private reloadNetworkPlayer(player: NetworkRemotePlayer, now: number): void {
    player.loadout = startReload(player.loadout, now);
    if (player.loadout.reloadingUntil > 0) {
      this.remotePlayers.triggerAnimation(player, "Reload");
      this.emitNoise("reload", { x: player.position.x, z: player.position.z }, player.crouching ? 0.55 : 1, {
        weaponId: player.loadout.weaponId
      });
    }
  }

  private jumpNetworkPlayer(player: NetworkRemotePlayer): boolean {
    if (!this.locomotion.canStartJump(player)) {
      return false;
    }
    const stamina = spendStamina(player.condition.stamina, JUMP_STAMINA_COST);
    if (!stamina.spent) {
      return false;
    }
    player.condition.stamina = stamina.stamina;
    this.locomotion.startJump(player);
    this.remotePlayers.triggerAnimation(player, "Jump");
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
    target = this.resolveNearbyObstacles(target, 0.5);
    this.distractions.push(this.createThrownCharge(target, player));
    this.emitNoise("distraction", target, 1.05);
    return true;
  }

  private interactNetworkPlayer(player: NetworkRemotePlayer): boolean {
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

  private takeNetworkPlayer(player: NetworkRemotePlayer): boolean {
    const drop = this.nearestWeaponDropForPoint(player.position, 8.2);
    if (!drop) {
      return false;
    }
    player.loadout = addWeapon(player.loadout, drop.weaponId);
    this.scene.remove(drop.mesh);
    this.weaponDrops = this.weaponDrops.filter((candidate) => candidate !== drop);
    return true;
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
      player.condition = hydrateCondition(player.condition);
      return true;
    }
    if (amenity.kind === "bench" || amenity.kind === "picnic_table") {
      player.health = Math.min(100, player.health + (amenity.kind === "bench" ? 10 : 12));
      return true;
    }
    if (amenity.kind === "memorial_plaque") {
      if (this.searchedAmenityIds.has(amenity.id)) {
        return false;
      }
      this.searchedAmenityIds.add(amenity.id);
      player.condition.blurTimer = Math.max(0, player.condition.blurTimer - 4);
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
    if (loot.bikePump) {
      player.condition = applyBikePumpBoost(player.condition);
    }
    player.condition.throwables = Math.min(MAX_THROWABLES, player.condition.throwables + loot.throwables);
    if (amenity.kind === "utility_box") {
      this.activateStructureUtility(amenity);
      this.emitNoise("scavenge", amenity.position, loot.noiseMultiplier * 1.05, { volume: 0.78 });
    }
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
    if (!this.network.acceptSnapshot(snapshot)) {
      return;
    }
    this.state = snapshot.state;

    const self = snapshot.players.find((player) => player.id === this.network.localId);
    if (self) {
      this.applyLocalPlayerSnapshot(self);
    }
    this.applyRemotePlayerSnapshots(snapshot.players.filter((player) => player.id !== this.network.localId));
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
    const previousHealth = this.player.health;
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
    this.player.intermissionUpgradeWave = snapshot.intermissionUpgradeWave ?? 0;
    this.player.reviveProtectionTimer = snapshot.reviveProtectionTimer ?? 0;
    this.loadout = snapshot.loadout;
    this.condition.stamina = snapshot.stamina;
    this.condition.hydration = snapshot.hydration;
    this.condition.bleedTimer = snapshot.bleedTimer;
    this.condition.limpTimer = snapshot.limpTimer;
    this.condition.blurTimer = snapshot.blurTimer;
    this.condition.bikePumpTimer = snapshot.bikePumpTimer;
    this.condition.throwables = snapshot.throwables;
    this.condition.flashlightOn = snapshot.flashlightOn;
    if (previousHealth <= 0 && snapshot.health > 0) {
      this.clearHitFlash();
      this.flashStatus(`Revived — regroup for wave ${this.wave + 1}`);
    }
    if (snapshot.health < previousHealth) {
      const nearestThreat = [...this.zombies].sort((a, b) => a.position.distanceTo(this.player.position) - b.position.distanceTo(this.player.position))[0];
      if (nearestThreat) this.showDamageDirection({ x: nearestThreat.position.x, z: nearestThreat.position.z });
    }
    this.applyFlashlightVisibility();
    if (previousWeapon !== this.loadout.weaponId) {
      this.rebuildViewWeapon();
    }
  }

  private applyRemotePlayerSnapshots(snapshots: NetworkPlayerSnapshot[]): void {
    const seen = new Set<string>();
    for (const snapshot of snapshots) {
      seen.add(snapshot.id);
      const player = this.remotePlayers.get(snapshot.id) ?? this.remotePlayers.add(snapshot.id, snapshot.name, snapshot.avatarId);
      player.name = snapshot.name;
      player.position.set(snapshot.x, snapshot.y, snapshot.z);
      player.yaw = snapshot.yaw;
      this.remotePlayers.setAvatar(player, snapshot.avatarId);
      player.pitch = snapshot.pitch;
      player.health = snapshot.health;
      player.scrap = snapshot.scrap;
      player.loadout = snapshot.loadout;
      player.condition.stamina = snapshot.stamina;
      player.condition.hydration = snapshot.hydration;
      player.condition.bleedTimer = snapshot.bleedTimer;
      player.condition.limpTimer = snapshot.limpTimer;
      player.condition.blurTimer = snapshot.blurTimer;
      player.condition.bikePumpTimer = snapshot.bikePumpTimer;
      player.condition.throwables = snapshot.throwables;
      player.condition.flashlightOn = snapshot.flashlightOn;
      player.crouching = snapshot.crouching;
      player.crouchAmount = snapshot.crouching ? 1 : 0;
      player.height = snapshot.height;
      player.jumpHeight = snapshot.jumpHeight;
      player.activeFixtureId = snapshot.activeFixtureId;
      player.intermissionUpgradeWave = snapshot.intermissionUpgradeWave ?? 0;
      player.reviveProtectionTimer = snapshot.reviveProtectionTimer ?? 0;
      player.input.aim = snapshot.aim;
      this.remotePlayers.updateMesh(player);
      player.isSprinting = snapshot.sprinting ?? false;
    }
    for (const id of [...this.remotePlayers.keys()]) {
      if (!seen.has(id)) {
        this.remotePlayers.remove(id);
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
        void this.installBlenderZombie(zombie);
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
        this.removeZombieVisual(zombie);
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
    this.syncBikeMesh(this.bike);
  }

  private clearNetworkAuthoritativeEntities(): void {
    this.entities.clearSceneEntities(this.scene);
  }

  private updateCrouch(dt: number): void {
    const inputCrouching =
      !this.mountedBike() &&
      !this.skateboardMounted &&
      (this.input?.isCrouching() ?? false);
    this.locomotion.updateCrouch(this.player, dt, this.testCrouchOverride ?? inputCrouching);
    this.root.classList.toggle("is-crouched", this.player.crouching);
  }

  private updateWavePacing(dt: number): void {
    const update = this.waveDirector.update(dt, {
      activeZombies: this.zombies.length,
      canSpawn: this.state === "playing",
      spawn: (anchor) => this.spawnWaveZombie(anchor)
    });

    if (update.startedIntermission) {
      this.onIntermissionStarted();
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
      this.onIntermissionStarted();
    }
    return this.wavePhase === "intermission";
  }

  private onIntermissionStarted(): void {
    this.beginIntermissionThreats();
    const revivedNames = this.reviveFallenPlayersForIntermission();
    const status = revivedNames.length === 0
      ? `Regroup before wave ${this.wave + 1}`
      : revivedNames.length === 1
        ? `${revivedNames[0]} revived — regroup before wave ${this.wave + 1}`
        : `${revivedNames.length} survivors revived — regroup before wave ${this.wave + 1}`;
    this.flashStatus(status);
    this.sendNetworkSnapshotNow();
  }

  private reviveFallenPlayersForIntermission(): string[] {
    if (!this.isNetworkHost) {
      return [];
    }

    const remotePlayers = [...this.remotePlayers.values()];
    const localWasFallen = this.player.health <= 0;
    const revivedNames = reviveFallenSquadForIntermission([
      {
        name: this.network.config.playerName,
        player: this.player,
        condition: this.condition
      },
      ...remotePlayers.map((player) => ({ name: player.name, player, condition: player.condition }))
    ]);
    if (localWasFallen && this.player.health > 0) {
      this.activeAmenityRest = null;
      this.activeAmenitySearch = null;
    }
    for (const player of remotePlayers) {
      this.remotePlayers.updateMesh(player);
    }
    return revivedNames;
  }

  private currentIntermissionChoices() {
    return intermissionUpgradeChoices(this.loadout, this.wave);
  }

  private chooseIntermissionUpgrade(upgradeId: UpgradeId): boolean {
    if (this.wavePhase !== "intermission" || this.player.intermissionUpgradeWave === this.wave) {
      return false;
    }
    const choice = this.currentIntermissionChoices().find((candidate) => candidate.id === upgradeId);
    if (!choice) return false;

    if (this.isNetworkClient) {
      this.sendNetworkAction("chooseIntermissionUpgrade", undefined, upgradeId);
    }
    this.loadout = claimIntermissionUpgrade(this.loadout, upgradeId);
    this.player.intermissionUpgradeWave = this.wave;
    this.audio.playWorld("upgrade");
    this.flashStatus(`${choice.label} fitted`);
    this.updateHud();
    this.sendNetworkSnapshotNow();
    return true;
  }

  private chooseIntermissionUpgradeForNetworkPlayer(player: NetworkRemotePlayer, upgradeId: UpgradeId): boolean {
    if (this.wavePhase !== "intermission" || player.intermissionUpgradeWave === this.wave) return false;
    const choice = intermissionUpgradeChoices(player.loadout, this.wave).find((candidate) => candidate.id === upgradeId);
    if (!choice) return false;
    player.loadout = claimIntermissionUpgrade(player.loadout, upgradeId);
    player.intermissionUpgradeWave = this.wave;
    return true;
  }

  private updateMovement(dt: number): void {
    if (this.activeAmenityRest) {
      this.player.velocity.set(0, 0, 0);
      this.isSprinting = false;
      return;
    }

    const movement = this.input?.movement() ?? { x: 0, z: 0, length: 0 };

    if (this.mountedBike()) {
      this.updateBikeMovement(dt, movement);
      return;
    }

    if (this.skateboardMounted) {
      this.updateSkateboardMovement(dt, movement);
      return;
    }

    const movementResult = this.locomotion.moveOnFoot(this.player, dt, movement, {
      wantsSprint: this.input?.isSprinting() ?? false,
      condition: this.condition
    });
    this.isSprinting = movementResult.sprinting;
    if (movementResult.moved) {
      this.emitMovementNoise(dt, movementResult.sprinting);
    }
  }

  private jump(): boolean {
    if (this.state !== "playing" || this.mountedBike() || this.skateboardMounted || this.activeAmenityRest || this.activeAmenitySearch) {
      return false;
    }
    if (!this.locomotion.canStartJump(this.player)) {
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
    this.locomotion.startJump(this.player);
    this.flashStatus("Jumped");
    this.emitNoise("footstep", { x: this.player.position.x, z: this.player.position.z }, 0.46, { volume: 0.38 });
    return true;
  }

  private updateBikeMovement(dt: number, input: LocomotionInput): void {
    const movement = this.locomotion.moveOnBike(this.player, dt, input, {
      wantsSprint: this.input?.isSprinting() ?? false,
      condition: this.condition,
      pumpSpeedMultiplier: bikePumpSpeedMultiplier(this.condition)
    });
    this.isSprinting = movement.sprinting;
    if (movement.moved) {
      this.emitMovementNoise(dt, movement.sprinting);
    }
  }

  private updateSkateboardMovement(dt: number, input: LocomotionInput): void {
    const movement = this.locomotion.moveOnSkateboard(this.player, dt, input, {
      wantsSprint: this.input?.isSprinting() ?? false,
      condition: this.condition
    });
    this.isSprinting = movement.sprinting;
    if (!movement.usable) {
      this.skateboardMounted = false;
      this.carriedItem = "skateboard";
      this.player.velocity.multiplyScalar(0.2);
      this.syncSkateboardMesh();
      this.flashStatus("Skateboard bogged down on grass");
      return;
    }
    if (movement.moved) {
      this.emitSkateboardNoise(dt, movement.sprinting, movement.surface);
    }
  }

  private toggleSkateboard(): boolean {
    if (this.skateboardMounted) {
      this.skateboardMounted = false;
      this.carriedItem = "skateboard";
      this.player.velocity.multiplyScalar(0.42);
      this.syncSkateboardMesh();
      this.flashStatus("Picked up skateboard");
      this.audio.playWorld("equip");
      return true;
    }

    if (this.carriedItem !== "skateboard") {
      this.flashStatus("Need to carry the skateboard");
      this.audio.playWorld("deny");
      return false;
    }
    if (this.mountedBike() || this.playerElevation() > 0.4 || this.player.activeFixtureId) {
      this.flashStatus("Get down before skating");
      this.audio.playWorld("deny");
      return false;
    }
    const surface = this.movementSurfaceAt({ x: this.player.position.x, z: this.player.position.z });
    if (surface === "grass") {
      this.flashStatus("Skateboard needs a hard surface");
      this.audio.playWorld("deny");
      return false;
    }
    this.carriedItem = null;
    this.skateboardMounted = true;
    this.player.crouching = false;
    this.player.crouchAmount = 0;
    this.player.height = 0;
    this.player.heightTarget = 0;
    this.player.jumpHeight = 0;
    this.player.jumpVelocity = 0;
    this.player.activeFixtureId = null;
    this.aimHeld = false;
    this.scopeAmount = 0;
    this.syncSkateboardMesh();
    this.flashStatus("Stepped onto skateboard");
    this.audio.playWorld("equip");
    return true;
  }

  private updateSkateboard(_dt: number): void {
    this.syncSkateboardMesh();
  }

  private syncSkateboardMesh(): void {
    if (!this.skateboardMounted) {
      if (this.skateboardMesh) {
        this.skateboardMesh.visible = false;
      }
      return;
    }
    if (!this.skateboardMesh) {
      this.skateboardMesh = this.meshFactory.createSkateboardMesh();
      this.skateboardMesh.scale.setScalar(1.2);
      this.skateboardMesh.userData.dynamic = true;
      this.scene.add(this.skateboardMesh);
    }
    this.skateboardMesh.visible = true;
    this.skateboardMesh.position.set(this.player.position.x, this.groundY({ x: this.player.position.x, z: this.player.position.z }) + 0.04, this.player.position.z);
    this.skateboardMesh.rotation.y = this.player.yaw;
  }

  private emitSkateboardNoise(dt: number, sprinting: boolean, surface: MovementSurface): void {
    this.movementNoiseTimer -= dt;
    if (this.movementNoiseTimer > 0) {
      return;
    }
    const surfaceMultiplier = surface === "gravel" ? 1.28 : surface === "dirt" ? 1.12 : surface === "rail" ? 1.18 : 1;
    this.emitNoise("skateboard", { x: this.player.position.x, z: this.player.position.z }, (sprinting ? 1.18 : 0.96) * surfaceMultiplier, { surface, volume: 0.62 });
    this.movementNoiseTimer = sprinting ? 0.24 : 0.34;
  }

  private updatePlayerCondition(dt: number): void {
    this.player.reviveProtectionTimer = Math.max(0, this.player.reviveProtectionTimer - dt);
    this.condition.bleedTimer = Math.max(0, this.condition.bleedTimer - dt);
    this.condition.limpTimer = Math.max(0, this.condition.limpTimer - dt);
    this.condition.blurTimer = Math.max(0, this.condition.blurTimer - dt);
    this.condition.bikePumpTimer = Math.max(0, this.condition.bikePumpTimer - dt);
    this.distractionCooldown = Math.max(0, this.distractionCooldown - dt);
    const sheltered = this.structureShelterProtectionForLocalPlayer() >= 0.56;
    this.condition.hydration = nextHydration(this.condition.hydration, dt, {
      sprinting: this.isSprinting,
      elevated: this.playerElevation() > 1.2 || Boolean(this.player.activeFixtureId),
      bleeding: this.condition.bleedTimer > 0,
      daylight: this.currentTimeOfDay.daylight,
      sheltered
    });

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
      bleeding: this.condition.bleedTimer > 0,
      hydration: this.condition.hydration,
      bikePumpBoosted: this.mountedBike() !== null && this.condition.bikePumpTimer > 0,
      sheltered
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
    this.applyConditionClasses(bleeding, limping, blurred);
  }

  private applyConditionClasses(bleeding: boolean, limping: boolean, blurred: boolean): void {
    this.applyConditionClass("bleeding", bleeding);
    this.applyConditionClass("limping", limping);
    this.applyConditionClass("blurred", blurred);
  }

  private applyConditionClass(condition: ConditionClassKey, active: boolean): void {
    if (this.conditionClassState[condition] === active) {
      return;
    }
    this.conditionClassState[condition] = active;
    const className = `is-${condition}`;
    this.root.classList.toggle(className, active);
    document.body.classList.toggle(className, active);
  }

  private clearConditionClasses(): void {
    this.applyConditionClasses(false, false, false);
  }

  private throwDistraction(): boolean {
    if (this.state !== "playing") {
      return false;
    }
    const inventoryNoiseItem = this.inventory.find((itemId) => isNoiseItem(itemId)) ?? null;
    if (!inventoryNoiseItem && this.condition.throwables <= 0) {
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
    if (inventoryNoiseItem) {
      this.consumeInventoryItem(inventoryNoiseItem);
    } else {
      this.condition.throwables -= 1;
    }
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
    target = this.resolveNearbyObstacles(target, 0.5);

    this.distractions.push(this.createThrownCharge(target));
    this.emitNoise("distraction", target, 1.05);
    this.flashStatus(inventoryNoiseItem === "noise-radio" ? "Threw wind-up radio" : "Threw bottle bomb");
    return true;
  }

  private createThrownCharge(position: Vec2, killer?: NetworkRemotePlayer): ThrownDistraction {
    const material = new THREE.MeshStandardMaterial({
      color: 0x6f8f93,
      emissive: 0xff9d4a,
      emissiveIntensity: 0.18,
      metalness: 0.18,
      roughness: 0.72
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.42, 10), material);
    mesh.position.set(position.x, this.groundY(position) + 0.21, position.z);
    mesh.rotation.set(this.rng.range(-0.4, 0.4), this.rng.range(0, Math.PI), this.rng.range(-0.8, 0.8));
    mesh.userData.dynamic = true;
    this.scene.add(mesh);
    return {
      mesh,
      position: { ...position },
      ttl: BOTTLE_BOMB_FUSE_SECONDS + 0.45,
      fuseTimer: BOTTLE_BOMB_FUSE_SECONDS,
      pulseTimer: BOTTLE_BOMB_PULSE_MIN_SECONDS,
      killer
    };
  }

  private updateDistractions(dt: number): void {
    for (const distraction of [...this.distractions]) {
      distraction.ttl -= dt;
      distraction.fuseTimer -= dt;
      distraction.pulseTimer -= dt;
      const fuseProgress = THREE.MathUtils.clamp(1 - distraction.fuseTimer / BOTTLE_BOMB_FUSE_SECONDS, 0, 1);
      distraction.mesh.rotation.y += dt * (2.6 + fuseProgress * 4.4);
      distraction.mesh.position.y = this.groundY(distraction.position) + 0.21 + Math.sin(this.frame * 0.16) * 0.035;
      distraction.mesh.scale.setScalar(1 + fuseProgress * 0.22);
      const material = distraction.mesh.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.18 + fuseProgress * 0.96 + Math.max(0, Math.sin(this.frame * 0.38)) * 0.22;
      if (distraction.pulseTimer <= 0 && distraction.fuseTimer > 0.22) {
        this.emitNoise("distraction", distraction.position, 0.52 + fuseProgress * 0.34, { volume: 0.45 + fuseProgress * 0.22 });
        distraction.pulseTimer = this.rng.range(BOTTLE_BOMB_PULSE_MIN_SECONDS, BOTTLE_BOMB_PULSE_MAX_SECONDS) * (1 - fuseProgress * 0.34);
      }
      if (distraction.fuseTimer <= 0) {
        this.detonateBottleBomb(distraction);
        this.removeDistraction(distraction);
      } else if (distraction.ttl <= 0) {
        this.removeDistraction(distraction);
      }
    }
  }

  private detonateBottleBomb(distraction: ThrownDistraction): void {
    this.emitNoise("distraction", distraction.position, 1.46, { volume: 1.08 });
    this.createBottleBombBurst(distraction.position);

    let hitCount = 0;
    const now = performance.now() / 1000;
    for (const zombie of [...this.zombies]) {
      const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
      const effect = bottleBombEffectAtDistance(distance(distraction.position, zombiePoint), zombie.radius);
      if (effect.damage <= 0) {
        continue;
      }

      hitCount += 1;
      zombie.health -= effect.damage;
      const profile = zombieProfile(zombie.type);
      zombie.staggerTimer = Math.max(zombie.staggerTimer, effect.staggerSeconds / profile.staggerResistance);
      zombie.aiState = "search";
      zombie.lastKnownPlayer = { ...distraction.position };
      zombie.target = this.chooseWanderTarget(distraction.position, zombie.radius, 18);
      zombie.memoryTimer = 0;
      zombie.searchTimer = Math.max(zombie.searchTimer, this.rng.range(4.5, 7.2));

      const shove = new THREE.Vector3(zombie.position.x - distraction.position.x, 0, zombie.position.z - distraction.position.z);
      if (shove.lengthSq() < 0.001) {
        shove.set(Math.cos(zombie.walkOffset), 0, Math.sin(zombie.walkOffset));
      }
      shove.normalize().multiplyScalar(effect.shoveDistance);
      zombie.position.add(shove);
      this.settleZombiePosition(zombie);
      this.syncZombieMeshPosition(zombie, now);
      this.createHitSpark(zombie.position.clone().add(new THREE.Vector3(0, 1.35, 0)));

      if (zombie.health <= 0) {
        this.killZombie(zombie, distraction.killer);
      }
    }

    this.flashStatus(hitCount > 0 ? `Bottle bomb hit ${hitCount}` : "Bottle bomb burst");
  }

  private fireFlareRound(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    stats: ReturnType<typeof getWeaponStats>,
    shooterPosition: Vec2,
    killer?: NetworkRemotePlayer
  ): { directHitZone: HitZone | null; hitCount: number } {
    const directHit = this.findZombieHits(origin, direction, stats.range, 1)[0] ?? null;
    const impactPoint = directHit?.point ?? origin.clone().addScaledVector(direction, stats.range);
    let directHitZone: HitZone | null = null;
    let hitCount = 0;

    if (directHit) {
      directHitZone = directHit.zone;
      hitCount += 1;
      const result = applyDirectedZombieHit(directHit.zombie, directHit, stats, shooterPosition, this.rng, {
        memorySeconds: { min: 2, max: 3.4 }
      });
      this.createHitSpark(directHit.point);
      if (result.killed) {
        this.killZombie(directHit.zombie, killer);
      }
    }

    this.addTracer(origin, impactPoint);
    hitCount += this.detonateFlareRound({ x: impactPoint.x, z: impactPoint.z }, killer);
    return { directHitZone, hitCount };
  }

  private detonateFlareRound(position: Vec2, killer?: NetworkRemotePlayer): number {
    this.emitNoise("distraction", position, 1.2, { volume: 0.82 });
    this.createFlareBeacon(position);

    let hitCount = 0;
    const now = performance.now() / 1000;
    for (const zombie of [...this.zombies]) {
      const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
      const effect = flareBurstEffectAtDistance(distance(position, zombiePoint), zombie.radius);
      if (effect.damage <= 0) {
        continue;
      }

      hitCount += 1;
      zombie.health -= effect.damage;
      const profile = zombieProfile(zombie.type);
      zombie.staggerTimer = Math.max(zombie.staggerTimer, effect.staggerSeconds / profile.staggerResistance);
      zombie.aiState = "search";
      zombie.lastKnownPlayer = { ...position };
      zombie.target = this.chooseWanderTarget(position, zombie.radius, 20);
      zombie.memoryTimer = 0;
      zombie.searchTimer = Math.max(zombie.searchTimer, this.rng.range(5.2, 8.4));

      const shove = new THREE.Vector3(zombie.position.x - position.x, 0, zombie.position.z - position.z);
      if (shove.lengthSq() < 0.001) {
        shove.set(Math.cos(zombie.walkOffset), 0, Math.sin(zombie.walkOffset));
      }
      shove.normalize().multiplyScalar(effect.shoveDistance);
      zombie.position.add(shove);
      this.settleZombiePosition(zombie);
      this.syncZombieMeshPosition(zombie, now);
      this.createHitSpark(zombie.position.clone().add(new THREE.Vector3(0, 1.25, 0)));

      if (zombie.health <= 0) {
        this.killZombie(zombie, killer);
      }
    }

    this.flashStatus(hitCount > 0 ? `Flare scattered ${hitCount}` : "Flare burning");
    return hitCount;
  }

  private createBottleBombBurst(position: Vec2): void {
    const center = new THREE.Vector3(position.x, this.groundY(position) + 0.42, position.z);
    const light = new THREE.PointLight(0xffa85d, 5.8, 34);
    light.position.copy(center);
    this.scene.add(light);
    window.setTimeout(() => this.scene.remove(light), 120);

    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 14, 9),
      new THREE.MeshBasicMaterial({ color: 0xd99a58, transparent: true, opacity: 0.42, depthWrite: false })
    );
    puff.position.copy(center);
    this.scene.add(puff);
    this.smokePuffs.push({
      mesh: puff,
      velocity: new THREE.Vector3(0, 0.55, 0),
      ttl: 0.5,
      maxTtl: 0.5
    });
  }

  private createFlareBeacon(position: Vec2): void {
    const ground = this.groundY(position);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff6b42,
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), material);
    mesh.position.set(position.x, ground + 0.18, position.z);
    mesh.userData.dynamic = true;
    this.scene.add(mesh);

    const light = new THREE.PointLight(0xff6b42, 5.2, 44);
    light.position.set(position.x, ground + 0.55, position.z);
    light.userData.dynamic = true;
    this.scene.add(light);

    this.smokePuffs.push({
      mesh: new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xdf7a4f, transparent: true, opacity: 0.36, depthWrite: false })
      ),
      velocity: new THREE.Vector3(0, 0.7, 0),
      ttl: 0.7,
      maxTtl: 0.7
    });
    this.smokePuffs[this.smokePuffs.length - 1].mesh.position.set(position.x, ground + 0.4, position.z);
    this.scene.add(this.smokePuffs[this.smokePuffs.length - 1].mesh);

    this.activeFlareBeacons.push({
      mesh,
      light,
      position: { ...position },
      ttl: FLARE_BEACON_SECONDS,
      maxTtl: FLARE_BEACON_SECONDS,
      pulseTimer: FLARE_BEACON_PULSE_SECONDS
    });
  }

  private updateActiveFlareBeacons(dt: number): void {
    for (const beacon of [...this.activeFlareBeacons]) {
      beacon.ttl -= dt;
      beacon.pulseTimer -= dt;
      const life = Math.max(0, beacon.ttl / beacon.maxTtl);
      const flicker = 0.88 + Math.max(0, Math.sin(this.frame * 0.47)) * 0.18;
      const ground = this.groundY(beacon.position);
      beacon.mesh.position.y = ground + 0.18 + Math.sin(this.frame * 0.24) * 0.025;
      beacon.mesh.scale.setScalar(0.92 + (1 - life) * 0.8 + flicker * 0.14);
      const material = beacon.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, (0.28 + life * 0.54) * flicker);
      beacon.light.position.y = ground + 0.55;
      beacon.light.intensity = Math.max(0, (1.2 + life * 4.2) * flicker);
      beacon.light.distance = 24 + life * 24;

      if (beacon.pulseTimer <= 0 && beacon.ttl > 0.45) {
        this.emitNoise("distraction", beacon.position, 0.46 + life * 0.18, { volume: 0.22 + life * 0.22 });
        beacon.pulseTimer = FLARE_BEACON_PULSE_SECONDS * this.rng.range(0.85, 1.18);
      }

      if (beacon.ttl <= 0) {
        this.removeActiveFlareBeacon(beacon);
      }
    }
  }

  private removeActiveFlareBeacon(beacon: ActiveFlareBeacon): void {
    this.scene.remove(beacon.mesh);
    this.scene.remove(beacon.light);
    const index = this.activeFlareBeacons.indexOf(beacon);
    if (index >= 0) {
      this.activeFlareBeacons.splice(index, 1);
    }
  }

  private clearActiveFlareBeacons(): void {
    for (const beacon of [...this.activeFlareBeacons]) {
      this.removeActiveFlareBeacon(beacon);
    }
  }

  private removeDistraction(distraction: ThrownDistraction): void {
    this.scene.remove(distraction.mesh);
    const index = this.distractions.indexOf(distraction);
    if (index >= 0) {
      this.distractions.splice(index, 1);
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
    if (distance(position, { x: this.player.position.x, z: this.player.position.z }) < 8) {
      this.hudNoiseLevel = Math.max(this.hudNoiseLevel, THREE.MathUtils.clamp(event.intensity / 1.32, 0, 1));
    }
    this.audio.playNoise(event, audioOptions);
    return event;
  }

  private updateHudSignals(dt: number): void {
    this.hudNoiseLevel = Math.max(0, this.hudNoiseLevel - dt * 0.42);
    this.damageDirectionTimer = Math.max(0, this.damageDirectionTimer - dt);
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
    return this.movementSurfaces.at(point);
  }

  private groundY(point: Vec2): number {
    return this.terrain.groundY(point);
  }

  private averageGroundY(points: readonly Vec2[]): number {
    return this.terrain.averageGroundY(points);
  }

  private weatherAnchors(): Vec2[] {
    return collectWeatherAnchors(this.level, START_POSITION);
  }

  private handleLook(movementX: number, movementY: number): void {
    if (this.paused) return;
    this.player.yaw -= movementX * 0.0022 * this.settings.mouseSensitivity;
    this.player.pitch -= movementY * 0.002 * this.settings.mouseSensitivity;
    this.player.pitch = THREE.MathUtils.clamp(this.player.pitch, -1.18, 1.1);
  }

  private updateCamera(): void {
    if (this.smokeMode && !this.testCameraOverride && document.pointerLockElement !== this.canvas) {
      const t = this.frame * 0.005;
      this.player.yaw = -2.2 + Math.sin(t) * 0.18;
      this.player.pitch = -0.1 + Math.sin(t * 0.7) * 0.04;
    }
    this.camera.position.set(
      this.player.position.x,
      this.player.position.y + PLAYER_HEIGHT + this.playerElevation() + (this.mountedBike() ? BIKE_CAMERA_HEIGHT_BONUS : this.skateboardMounted ? SKATEBOARD_CAMERA_HEIGHT_BONUS : 0) - this.player.crouchAmount * 0.58,
      this.player.position.z
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.player.yaw + this.recoilYaw * 0.006;
    this.camera.rotation.x = this.player.pitch - this.recoil * 0.012;
  }

  private forceSpawnZombie(type?: ZombieType): void {
    if (!type) {
      this.addZombie(createZombieSpawn(getWaveConfig(this.wave), this.level.spawnPoints, this.rng));
      return;
    }
    const profile = zombieProfile(type);
    const index = this.testZombieSpawnIndex++ % 5;
    this.addZombie({
      type,
      position: { x: this.player.position.x + (index - 2) * 3.6, z: this.player.position.z - 12 },
      health: profile.health,
      speed: profile.speed,
      reward: profile.reward
    });
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
    const zombie: Zombie = {
      id: this.entities.nextZombieId(),
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
    };
    this.zombies.push(zombie);
    void this.installBlenderZombie(zombie);
  }

  private updateZombies(dt: number, now: number): void {
    const combatants = this.collectCombatants(this.frameCombatants);
    for (const zombie of this.zombies) {
      const profile = zombieProfile(zombie.type);
      const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
      const zombieSurface = this.movementSurfaceAt(zombiePoint);
      const localPlayerPoint = { x: this.player.position.x, z: this.player.position.z };
      const localDistance = distance(zombiePoint, localPlayerPoint);
      const nearestCombatant = this.nearestCombatant(zombiePoint, combatants);
      const visibleCombatant = this.visibleCombatantForZombie(zombie, zombiePoint, combatants);
      const distanceToPlayer = nearestCombatant ? distance(zombiePoint, nearestCombatant.position) : localDistance;
      const heardNoise = this.noise.strongestAt(
        zombiePoint,
        zombieEnvironmentalHearingMultiplier(profile, {
          weather: this.currentWeather,
          timeOfDay: this.currentTimeOfDay,
          surface: zombieSurface
        })
      );
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
        this.triggerScreamerCall(zombie, zombiePoint);
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
      const speed =
        zombie.speed *
        stateSpeed *
        staggerScale *
        zombieEnvironmentalSpeedMultiplier(zombie.type, {
          weather: this.currentWeather,
          timeOfDay: this.currentTimeOfDay,
          surface: zombieSurface
        });
      let next = clampToPolygon(
        { x: zombie.position.x + toTarget.x * speed * dt, z: zombie.position.z + toTarget.z * speed * dt },
        this.level.boundary,
        2.5
      );
      next = this.resolveNearbyObstacles(next, zombie.radius);
      const groundY = this.groundY(next);
      zombie.position.set(next.x, groundY, next.z);
      if (distanceToTarget > 0.1) {
        zombie.mesh.rotation.y = Math.atan2(toTarget.x, toTarget.z) + Math.PI;
      }
      this.syncZombieMeshPosition(zombie, now);
      this.animateZombie(zombie, now, localDistance, dt);
      this.updateZombieAudio(zombie, dt, localDistance, distanceToTarget);
      const attackTarget = this.attackableCombatantForZombie(zombie, zombiePoint, combatants);
      if (attackTarget && zombie.attackCooldown <= 0) {
        triggerZombieAssetAnimation(zombie.mesh, "Attack");
        const hitApplied = this.applyZombieHit(zombie, profile, now, attackTarget);
        zombie.attackCooldown = profile.attackCooldown;
        this.audio.playWorld("zombieAttack", zombiePoint, { zombieType: zombie.type });
        if (hitApplied && attackTarget.isLocal) {
          this.audio.playWorld("playerHit");
        }
      }
    }
    this.resolveZombieCrowding(now);
  }

  private triggerScreamerCall(zombie: Zombie, zombiePoint: Vec2): void {
    triggerZombieAssetAnimation(zombie.mesh, "Scream");
    const target = zombie.lastKnownPlayer ?? { x: this.player.position.x, z: this.player.position.z };
    this.emitNoise("scream", zombiePoint, 1.18, { volume: 1.12 });
    const rallied = this.rallyZombiesFromScream(zombie, zombiePoint, target);
    const reinforcements = this.waveDirector.rushSpawnPack(
      zombiePoint,
      this.zombies.length,
      (anchor) => this.spawnWaveZombie(anchor)
    );
    this.createScreamerPulse(zombiePoint, reinforcements > 0);
    zombie.screamCooldown = reinforcements > 0 ? this.rng.range(11.5, 15.5) : this.rng.range(8.5, 12);

    if (reinforcements > 0) {
      this.flashStatus(`Screamer called ${reinforcements} from the park edge`);
    } else if (rallied > 0) {
      this.flashStatus(`Screamer rallied ${rallied} nearby`);
    } else {
      this.flashStatus("Screamer shrieked");
    }
  }

  private rallyZombiesFromScream(screamer: Zombie, origin: Vec2, target: Vec2): number {
    let rallied = 0;
    for (const zombie of this.zombies) {
      if (zombie === screamer || zombie.health <= 0) {
        continue;
      }
      const zombiePoint = { x: zombie.position.x, z: zombie.position.z };
      const callDistance = distance(origin, zombiePoint);
      if (callDistance > SCREAMER_RALLY_RADIUS) {
        continue;
      }

      const wasIdle = zombie.aiState === "wander" || zombie.aiState === "search";
      zombie.aiState = zombie.aiState === "chase" ? "chase" : "investigate";
      zombie.target =
        callDistance < SCREAMER_RALLY_SEARCH_RADIUS
          ? this.chooseWanderTarget(target, zombie.radius, 10)
          : { ...target };
      zombie.lastKnownPlayer = { ...target };
      zombie.memoryTimer = Math.max(zombie.memoryTimer, this.rng.range(3.4, 5.8));
      zombie.searchTimer = Math.max(zombie.searchTimer, this.rng.range(5.8, 8.4));
      zombie.wanderTimer = Math.min(zombie.wanderTimer, this.rng.range(0.4, 1.1));
      zombie.vocalCooldown = Math.min(zombie.vocalCooldown, this.rng.range(0.15, 0.7));
      if (wasIdle) {
        rallied += 1;
      }
    }
    return rallied;
  }

  private createScreamerPulse(position: Vec2, reinforced: boolean): void {
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.68, reinforced ? 1.18 : 1.02, 30),
      new THREE.MeshBasicMaterial({
        color: reinforced ? 0xffd36c : 0xfff0a2,
        transparent: true,
        opacity: reinforced ? 0.56 : 0.44,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    pulse.position.set(position.x, this.groundY(position) + 0.1, position.z);
    pulse.rotation.x = -Math.PI / 2;
    this.scene.add(pulse);
    this.smokePuffs.push({
      mesh: pulse,
      velocity: new THREE.Vector3(0, 0.04, 0),
      ttl: 0.62,
      maxTtl: 0.62
    });
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

  private resolveNearbyObstacles(
    point: Vec2,
    radius: number,
    shouldSkip?: (obstacle: CollisionObstacle, point: Vec2) => boolean
  ): Vec2 {
    let next = point;
    this.obstacleIndex.forNearby(
      point,
      radius,
      (obstacle) => {
        if (shouldSkip?.(obstacle, next)) {
          return;
        }
        next = resolveObstacle(next, radius, obstacle);
      },
      2.4
    );
    return next;
  }

  private syncZombieMeshPosition(zombie: Zombie, now: number): void {
    zombie.mesh.position.set(zombie.position.x, this.zombieVisualY(zombie, now), zombie.position.z);
  }

  private zombieVisualY(zombie: Zombie, now: number): number {
    return zombie.position.y + (Math.sin(now * 7 + zombie.walkOffset) + 1) * 0.035;
  }

  private applyZombieHit(zombie: Zombie, profile: ReturnType<typeof zombieProfile>, now: number, combatant: CombatantRef): boolean {
    if (combatant.reviveProtectionTimer > 0) {
      return false;
    }
    if (combatant.isLocal) {
      this.player.health -= profile.attackDamage;
      combatant.health = this.player.health;
      this.lastDamageAt = now;
    } else if (combatant.remote) {
      combatant.remote.health -= profile.attackDamage;
      combatant.health = combatant.remote.health;
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
      return true;
    }
    this.showDamageDirection({ x: zombie.position.x, z: zombie.position.z });
    this.triggerHitFlash();
    return true;
  }

  private showDamageDirection(source: Vec2): void {
    const dx = source.x - this.player.position.x;
    const dz = source.z - this.player.position.z;
    this.damageDirection = normalizeRadians(Math.atan2(dx, -dz) - this.player.yaw);
    this.damageDirectionTimer = 0.72;
  }

  private triggerHitFlash(): void {
    this.hitFlashTimer = HIT_FLASH_SECONDS;
    this.applyHitFlash(true);
  }

  private updateHitFlash(dt: number): void {
    if (this.hitFlashTimer <= 0) {
      return;
    }
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.hitFlashTimer === 0) {
      this.applyHitFlash(false);
    }
  }

  private clearHitFlash(): void {
    this.hitFlashTimer = 0;
    this.applyHitFlash(false);
  }

  private applyHitFlash(active: boolean): void {
    if (this.hitFlashActive === active) {
      return;
    }
    this.hitFlashActive = active;
    document.body.classList.toggle("hit", active);
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
    return this.collectCombatants([]);
  }

  private collectCombatants(combatants: CombatantRef[]): CombatantRef[] {
    combatants.length = 0;
    if (this.player.health > 0) {
      combatants.push({
        id: this.network.localId,
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
        reviveProtectionTimer: this.player.reviveProtectionTimer,
        condition: this.condition,
        loadout: this.loadout
      });
    }
    for (const player of this.remotePlayers.values()) {
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
        reviveProtectionTimer: player.reviveProtectionTimer,
        condition: player.condition,
        loadout: player.loadout
      });
    }
    return combatants;
  }

  private combatantRefForNetworkPlayer(player: NetworkRemotePlayer): CombatantRef {
    return {
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
      reviveProtectionTimer: player.reviveProtectionTimer,
      condition: player.condition,
      loadout: player.loadout
    };
  }

  private combatantPoint(combatant: CombatantRef): Vec2 {
    return { x: combatant.position.x, z: combatant.position.z };
  }

  private combatantElevation(combatant: CombatantRef): number {
    return combatant.height + combatant.jumpHeight;
  }

  private nearestCombatant(point: Vec2, combatants = this.combatants()): CombatantRef | null {
    let nearest: CombatantRef | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const combatant of combatants) {
      if (combatant.health <= 0) continue;
      const combatantDistance = distance(point, this.combatantPoint(combatant));
      if (combatantDistance < nearestDistance) {
        nearest = combatant;
        nearestDistance = combatantDistance;
      }
    }
    return nearest;
  }

  private visibleCombatantForZombie(zombie: Zombie, zombiePoint: Vec2, combatants = this.combatants()): { combatant: CombatantRef; distance: number } | null {
    let visible: { combatant: CombatantRef; distance: number } | null = null;
    for (const combatant of combatants) {
      if (combatant.health <= 0) continue;
      const combatantDistance = distance(zombiePoint, this.combatantPoint(combatant));
      if (this.canZombieSeeCombatant(zombie, combatant, combatantDistance) && (!visible || combatantDistance < visible.distance)) {
        visible = { combatant, distance: combatantDistance };
      }
    }
    return visible;
  }

  private attackableCombatantForZombie(zombie: Zombie, zombiePoint: Vec2, combatants = this.combatants()): CombatantRef | null {
    let target: CombatantRef | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const combatant of combatants) {
      if (combatant.health <= 0) continue;
      const combatantDistance = distance(zombiePoint, this.combatantPoint(combatant));
      if (
        canZombieMeleeCombatant({
          zombieType: zombie.type,
          zombieRadius: zombie.radius,
          targetRadius: PLAYER_RADIUS,
          horizontalDistance: combatantDistance,
          targetElevation: this.combatantElevation(combatant)
        }) &&
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
      structureLit: this.isPointInStructureUtilityLight(playerPoint),
      structureShelter: this.structureShelterProtectionForCombatant(combatant),
      weather: this.currentWeather,
      timeOfDay: this.currentTimeOfDay
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
    if (!this.isPointInStructureUtilityLight(playerPoint) && this.structureShelterProtectionForCombatant(combatant) >= 0.56) {
      return true;
    }
    return surface === "dirt" && this.currentWeather.fog > 0.25;
  }

  private isCoverNearPoint(point: Vec2, obstaclePadding = 4.2, treePadding = 5.8): boolean {
    let covered = false;
    this.obstacleIndex.forNearby(point, Math.max(obstaclePadding, treePadding), (obstacle) => {
      const radius = this.obstacleIndex.coverRadius(obstacle);
      const coverPadding = obstacle.sourceObjectKind === "tree-collider" ? treePadding : obstaclePadding;
      const dx = point.x - obstacle.center.x;
      const dz = point.z - obstacle.center.z;
      const range = radius + coverPadding;
      if (dx * dx + dz * dz <= range * range) {
        covered = true;
        return true;
      }
      return false;
    }, 0);
    return covered;
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
      point = this.resolveNearbyObstacles(point, zombieRadius + 0.2);

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
    if ((this.mountedBike() || this.skateboardMounted) && !this.weaponCanFireOnBike(this.loadout.weaponId)) {
      this.flashStatus("Cannot fire this safely while riding");
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

    const totalSpread = effectiveFirearmSpread(stats, {
      movementSpeed: this.player.velocity.length(),
      shotBloom: this.shotBloom,
      crouching: this.player.crouching,
      aimAmount: this.scopeAmount,
      aimHeld: this.aimHeld,
      stamina: this.condition.stamina,
      hydration: this.condition.hydration,
      weather: this.currentWeather,
      weatherProtection: this.structureShelterProtectionForLocalPlayer()
    });
    if (this.loadout.weaponId === "flareGun") {
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      direction.x += this.rng.range(-totalSpread, totalSpread);
      direction.y += this.rng.range(-totalSpread, totalSpread) * 0.55;
      direction.z += this.rng.range(-totalSpread, totalSpread);
      direction.normalize();
      const result = this.fireFlareRound(this.camera.position, direction, stats, { x: this.player.position.x, z: this.player.position.z });
      this.lastHitZone = result.directHitZone;
      return;
    }
    let registeredHit = false;
    let playedImpact = false;
    let hitSparksThisShot = 0;
    for (let pellet = 0; pellet < stats.pellets; pellet += 1) {
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      direction.x += this.rng.range(-totalSpread, totalSpread);
      direction.y += this.rng.range(-totalSpread, totalSpread) * 0.55;
      direction.z += this.rng.range(-totalSpread, totalSpread);
      direction.normalize();
      const hits = this.findZombieHits(this.camera.position, direction, stats.range, stats.penetration);
      const endPoint = hits[0]?.point ?? this.camera.position.clone().addScaledVector(direction, stats.range);
      for (const hit of hits) {
        const result = applyDirectedZombieHit(hit.zombie, hit, stats, { x: this.player.position.x, z: this.player.position.z }, this.rng, {
          memorySeconds: { min: 2.6, max: 4.4 },
          staggerBonusByZone: { legs: 0.22 }
        });
        this.lastHitZone = hit.zone;
        registeredHit = true;
        if (hitSparksThisShot < MAX_HIT_SPARKS_PER_SHOT) {
          this.createHitSpark(hit.point);
          hitSparksThisShot += 1;
        }
        if (!playedImpact) {
          this.audio.playWorld("bulletHit", { x: hit.point.x, z: hit.point.z }, { volume: hit.zone === "head" ? 1.12 : 0.9 });
          playedImpact = true;
        }
        if (hit.zone === "head") {
          this.flashStatus("Headshot");
        }
        if (result.killed) {
          this.hud.flashHit("kill");
          this.killZombie(hit.zombie);
        } else {
          this.hud.flashHit(hit.zone === "head" ? "headshot" : "hit");
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
      const result = applyDirectedZombieHit(hit.zombie, hit, stats, { x: this.player.position.x, z: this.player.position.z }, this.rng, {
        memorySeconds: { min: 2, max: 3.6 },
        staggerBonusByZone: { head: 0.18 }
      });
      this.lastHitZone = hit.zone;
      this.createHitSpark(hit.point);
      this.audio.playWorld("meleeHit", { x: hit.point.x, z: hit.point.z }, { volume: this.loadout.weaponId === "machete" ? 1.15 : 0.9 });
      if (hit.zone === "head") {
        this.flashStatus("Clean strike");
      }
      if (result.killed) {
        this.hud.flashHit("kill");
        this.killZombie(hit.zombie);
      } else {
        this.hud.flashHit(hit.zone === "head" ? "headshot" : "hit");
      }
    }
  }

  private findZombieHits(origin: THREE.Vector3, direction: THREE.Vector3, range: number, limit: number): Array<{ zombie: Zombie; point: THREE.Vector3; distance: number; zone: HitZone }> {
    return findZombieTargetHits(this.zombies, origin, direction, range, limit).map((hit) => ({
      zombie: hit.target,
      point: hit.point,
      distance: hit.distance,
      zone: hit.zone
    }));
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
    return findMeleeTargetHits(this.zombies, originPosition, direction, range, limit, crouching, weaponId).map((hit) => ({
      zombie: hit.target,
      point: hit.point,
      distance: hit.distance,
      zone: hit.zone
    }));
  }

  private killZombie(zombie: Zombie, killer?: NetworkRemotePlayer): void {
    this.audio.playWorld("zombieDeath", { x: zombie.position.x, z: zombie.position.z }, { zombieType: zombie.type });
    this.removeZombieVisual(zombie);
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
      id: this.entities.nextPickupId(),
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
    for (const player of this.remotePlayers.values()) {
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
      id: this.entities.nextPickupId(),
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

  private spawnRideableBikes(): void {
    this.clearRideableBikes();
    for (const spawn of this.level.rideableBikes) {
      const mesh = this.meshFactory.createBikeMesh({ issue: spawn.state === "available" ? undefined : spawn.state });
      mesh.scale.setScalar(1.45);
      mesh.userData.dynamic = true;
      this.scene.add(mesh);
      const bike: RideableBike = {
        id: spawn.id,
        label: spawn.label,
        mesh,
        position: new THREE.Vector3(spawn.position.x, this.groundY(spawn.position), spawn.position.z),
        angle: spawn.angle,
        mounted: false,
        state: spawn.state ?? "available",
        requiredItem: spawn.requiredItem,
        linkedDetailId: spawn.linkedDetailId,
        rackId: spawn.rackId
      };
      this.bikes.push(bike);
      this.syncBikeMesh(bike);
    }
    this.bike = this.bikes.find((candidate) => candidate.id === this.level.rideableBike.id) ?? this.bikes[0] ?? null;
  }

  private clearRideableBikes(): void {
    for (const bike of this.bikes) {
      this.scene?.remove(bike.mesh);
    }
    this.bikes = [];
    this.bike = null;
  }

  private resetRideableBikes(): void {
    if (this.bikes.length === 0) {
      this.spawnRideableBikes();
      return;
    }
    for (const bike of this.bikes) {
      const spawn = this.level.rideableBikes.find((candidate) => candidate.id === bike.id);
      if (!spawn) continue;
      bike.mounted = false;
      bike.state = spawn.state ?? "available";
      bike.requiredItem = spawn.requiredItem;
      bike.position.set(spawn.position.x, this.groundY(spawn.position), spawn.position.z);
      bike.angle = spawn.angle;
      this.rebuildBikeMesh(bike);
    }
    this.bike = this.bikes.find((candidate) => candidate.id === this.level.rideableBike.id) ?? this.bikes[0] ?? null;
  }

  private updateBikes(dt: number): void {
    if (this.bikes.length === 0) {
      this.nearestBike = null;
      this.bike = null;
      return;
    }

    const mounted = this.mountedBike();
    if (mounted) {
      mounted.position.set(this.player.position.x, this.groundY({ x: this.player.position.x, z: this.player.position.z }), this.player.position.z);
      mounted.angle = this.player.yaw;
      const speed = this.player.velocity.length();
      if (speed > 0.15) {
        this.bikePedalPhase += speed * dt * 0.9;
        const wheels = (mounted.mesh.userData.wheels as THREE.Mesh[] | undefined) ?? [];
        for (const wheel of wheels) {
          wheel.rotation.z += speed * dt * 0.52;
        }
      }
      this.syncBikeMesh(mounted);
      this.bike = mounted;
      this.nearestBike = mounted;
      return;
    }

    let nearest: RideableBike | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const bike of this.bikes) {
      const distanceToBike = bike.position.distanceTo(this.player.position);
      if (distanceToBike < nearestDistance && distanceToBike < BIKE_INTERACTION_RADIUS) {
        nearest = bike;
        nearestDistance = distanceToBike;
      }
      this.syncBikeMesh(bike);
    }
    this.nearestBike = nearest;
    this.bike = this.bikes.find((candidate) => candidate.id === this.level.rideableBike.id) ?? nearest;
  }

  private mountedBike(): RideableBike | null {
    return this.bikes.find((candidate) => candidate.mounted) ?? null;
  }

  private syncBikeMesh(bike: RideableBike): void {
    bike.mesh.position.copy(bike.position);
    bike.mesh.rotation.y = bike.angle;
    bike.mesh.rotation.z = bike.mounted ? Math.sin(this.bikePedalPhase * 0.65) * 0.035 : 0;
    bike.mesh.visible = true;
  }

  private rebuildBikeMesh(bike: RideableBike): void {
    this.scene.remove(bike.mesh);
    const mesh = this.meshFactory.createBikeMesh({ issue: bike.state === "available" ? undefined : bike.state });
    mesh.scale.setScalar(1.45);
    mesh.userData.dynamic = true;
    this.scene.add(mesh);
    bike.mesh = mesh;
    this.syncBikeMesh(bike);
  }

  private toggleBike(target = this.nearestBike ?? this.mountedBike()): boolean {
    const bike = target;
    if (!bike) {
      return false;
    }

    if (bike.mounted) {
      bike.mounted = false;
      bike.position.set(this.player.position.x, this.groundY({ x: this.player.position.x, z: this.player.position.z }), this.player.position.z);
      bike.angle = this.player.yaw;
      this.player.velocity.multiplyScalar(0.35);
      this.syncBikeMesh(bike);
      this.flashStatus("Dismounted bike");
      this.audio.playWorld("equip");
      return true;
    }

    if (bike.state !== "available") {
      return this.inspectBikeState(bike);
    }

    if (this.playerElevation() > 0.4 || this.player.activeFixtureId) {
      this.flashStatus("Get down before riding");
      this.audio.playWorld("deny");
      return false;
    }

    if (this.carriedItem === "ladder") {
      this.flashStatus("Drop or place the ladder before riding");
      this.audio.playWorld("deny");
      return false;
    }

    if (this.skateboardMounted) {
      this.toggleSkateboard();
    }
    for (const other of this.bikes) {
      other.mounted = false;
    }
    bike.mounted = true;
    this.bike = bike;
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
    this.flashStatus(`Mounted ${bike.label}`);
    this.audio.playWorld("equip");
    return true;
  }

  private inspectBikeState(bike: RideableBike): boolean {
    if (bike.state === "flat-tyres") {
      if (this.hasInventoryItem("tyre-kit")) {
        this.consumeInventoryItem("tyre-kit");
        bike.state = "available";
        this.repairedBrokenBikeIds.add(bike.linkedDetailId ?? bike.id);
        this.rebuildBikeMesh(bike);
        this.nearestBrokenBike = null;
        this.nearestBike = bike;
        this.emitNoise("scavenge", { x: bike.position.x, z: bike.position.z }, 0.64, { volume: 0.58 });
        this.flashStatus("Patched the flat tyre. Bike rideable.");
        this.audio.playWorld("equip", bike.position);
        return true;
      }
      if (this.condition.bikePumpTimer > 0) {
        bike.state = "available";
        this.repairedBrokenBikeIds.add(bike.linkedDetailId ?? bike.id);
        this.rebuildBikeMesh(bike);
        this.flashStatus("Inflated flat tyres. Bike rideable.");
        return true;
      }
      this.flashStatus("Flat tyre. Find a tyre kit.");
      this.audio.playWorld("deny");
      return true;
    }

    if (bike.state === "locked") {
      if (this.hasInventoryItem("bolt-cutters")) {
        bike.state = "available";
        this.repairedBrokenBikeIds.add(bike.linkedDetailId ?? bike.id);
        this.rebuildBikeMesh(bike);
        this.nearestBrokenBike = null;
        this.nearestBike = bike;
        this.emitNoise("scavenge", { x: bike.position.x, z: bike.position.z }, 1.24, { volume: 0.82 });
        this.flashStatus("Cut the chain. Bike rideable.");
        this.audio.playWorld("equip", bike.position);
        return true;
      }
      this.flashStatus("Locked to the rack. Need bolt cutters.");
      this.audio.playWorld("deny");
      return true;
    }

    this.flashStatus("Bike is rideable");
    return true;
  }

  private inspectBrokenBike(detail: ParkLifeDetail): boolean {
    const bike = this.bikes.find((candidate) => candidate.linkedDetailId === detail.id);
    if (bike) {
      return this.inspectBikeState(bike);
    }
    this.flashStatus(detail.bikeIssue === "broken-chain" ? "Broken chain. This bike is going nowhere." : "Bike inspected");
    return true;
  }

  private spawnWorldItems(): void {
    for (const item of [...this.droppedItems]) {
      this.scene.remove(item.mesh);
    }
    this.droppedItems = [];
    for (const spawn of this.level.itemSpawns) {
      this.addDroppedWorldItem(spawn.itemId, spawn.position, {
        label: spawn.label,
        angle: spawn.angle,
        ttl: Number.POSITIVE_INFINITY
      });
    }
  }

  private addDroppedWorldItem(
    itemId: WorldItemId,
    position: Vec2,
    options: { label?: string; angle?: number; ttl?: number } = {}
  ): DroppedWorldItem {
    const mesh = this.meshFactory.createWorldItemMesh(itemId);
    mesh.userData.dynamic = true;
    const item: DroppedWorldItem = {
      id: this.entities.nextWorldItemId(),
      itemId,
      label: options.label ?? ITEM_DEFINITIONS[itemId].label,
      mesh,
      position: new THREE.Vector3(position.x, this.groundY(position), position.z),
      angle: options.angle ?? this.player.yaw,
      ttl: options.ttl ?? Number.POSITIVE_INFINITY
    };
    mesh.position.copy(item.position);
    mesh.rotation.y = item.angle;
    if (itemId === "ladder") {
      mesh.rotation.x = -0.42;
      mesh.position.y += 0.18;
    }
    this.scene.add(mesh);
    this.droppedItems.push(item);
    return item;
  }

  private updateWorldItems(dt: number): void {
    for (const item of [...this.droppedItems]) {
      if (Number.isFinite(item.ttl)) {
        item.ttl -= dt;
      }
      item.mesh.rotation.y += item.itemId === "ladder" ? 0 : dt * 0.35;
      item.mesh.position.y = this.groundY({ x: item.position.x, z: item.position.z }) + (item.itemId === "ladder" ? 0.18 : 0.12 + Math.sin(this.frame * 0.045 + item.id) * 0.035);
      if (item.ttl <= 0) {
        this.scene.remove(item.mesh);
        this.droppedItems = this.droppedItems.filter((candidate) => candidate !== item);
      }
    }
  }

  private updateNearestWorldItem(): void {
    if (this.mountedBike()) {
      this.nearestWorldItem = null;
      return;
    }
    let nearest: DroppedWorldItem | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const item of this.droppedItems) {
      const itemDistance = item.position.distanceTo(this.player.position);
      const reach = item.itemId === "ladder" ? 5.2 : 4.4;
      if (itemDistance < nearestDistance && itemDistance < reach) {
        nearest = item;
        nearestDistance = itemDistance;
      }
    }
    this.nearestWorldItem = nearest;
  }

  private updateNearestPlacedLadder(): void {
    if (this.mountedBike() || this.skateboardMounted || this.player.activeFixtureId) {
      this.nearestPlacedLadder = null;
      return;
    }
    let nearest: PlacedLadder | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    for (const ladder of this.placedLadders) {
      const ladderDistance = distance(playerPoint, ladder.accessPosition);
      if (ladderDistance < nearestDistance && ladderDistance < PLACED_LADDER_PICKUP_RADIUS) {
        nearest = ladder;
        nearestDistance = ladderDistance;
      }
    }
    this.nearestPlacedLadder = nearest;
  }

  private pickupWorldItem(item: DroppedWorldItem): boolean {
    if (isInventoryItem(item.itemId)) {
      if (!this.addInventoryItem(item.itemId)) {
        this.flashStatus("Inventory full");
        this.audio.playWorld("deny");
        return false;
      }
    } else {
      if (this.skateboardMounted) {
        this.flashStatus("Step off skateboard before carrying that");
        this.audio.playWorld("deny");
        return false;
      }
      if (this.carriedItem) {
        this.flashStatus(`Already carrying ${ITEM_DEFINITIONS[this.carriedItem].label}`);
        this.audio.playWorld("deny");
        return false;
      }
      this.carriedItem = item.itemId;
    }
    this.scene.remove(item.mesh);
    this.droppedItems = this.droppedItems.filter((candidate) => candidate !== item);
    this.nearestWorldItem = null;
    this.flashStatus(`Picked up ${ITEM_DEFINITIONS[item.itemId].label}`);
    this.audio.playWorld("pickup");
    return true;
  }

  private pickupPlacedLadder(ladder: PlacedLadder): boolean {
    if (this.player.activeFixtureId === ladder.fixtureId || this.playerElevation() > 0.4) {
      this.flashStatus("Climb down before removing ladder");
      this.audio.playWorld("deny");
      return false;
    }
    if (this.carriedItem) {
      this.flashStatus(`Already carrying ${ITEM_DEFINITIONS[this.carriedItem].label}`);
      this.audio.playWorld("deny");
      return false;
    }
    this.scene.remove(ladder.mesh);
    disposeThreeResources(ladder.mesh);
    this.placedLadders = this.placedLadders.filter((candidate) => candidate !== ladder);
    this.nearestPlacedLadder = null;
    this.carriedItem = "ladder";
    this.emitNoise("climb", ladder.accessPosition, 0.42, { volume: 0.42 });
    this.flashStatus("Picked up portable ladder");
    this.audio.playWorld("pickup", ladder.accessPosition);
    return true;
  }

  private handleTakeOrRemove(): boolean {
    if (this.nearestWorldItem) {
      return this.pickupWorldItem(this.nearestWorldItem);
    }
    if (this.nearestWeaponDrop) {
      return this.pickupWeapon(this.nearestWeaponDrop);
    }
    if (this.nearestPlacedLadder) {
      return this.pickupPlacedLadder(this.nearestPlacedLadder);
    }
    this.flashStatus("Nothing to take");
    this.audio.playWorld("deny");
    return false;
  }

  private addInventoryItem(itemId: InventoryItemId): boolean {
    if (this.inventory.length >= this.inventoryCapacity) {
      return false;
    }
    this.inventory.push(itemId);
    return true;
  }

  private hasInventoryItem(itemId: InventoryItemId): boolean {
    return this.inventory.includes(itemId);
  }

  private consumeInventoryItem(itemId: InventoryItemId): boolean {
    const index = this.inventory.indexOf(itemId);
    if (index < 0) {
      return false;
    }
    this.inventory.splice(index, 1);
    return true;
  }

  private dropItem(): boolean {
    const forward = this.forwardPoint(3.2);
    if (this.carriedItem) {
      const itemId = this.carriedItem;
      this.carriedItem = null;
      this.addDroppedWorldItem(itemId, forward, { angle: this.player.yaw });
      this.flashStatus(`Dropped ${ITEM_DEFINITIONS[itemId].label}`);
      this.audio.playWorld("pickup");
      return true;
    }
    const itemId = this.inventory.pop();
    if (!itemId) {
      this.flashStatus("Nothing to drop");
      this.audio.playWorld("deny");
      return false;
    }
    this.addDroppedWorldItem(itemId, forward, { angle: this.player.yaw, ttl: Number.POSITIVE_INFINITY });
    this.flashStatus(`Dropped ${ITEM_DEFINITIONS[itemId].label}`);
    this.audio.playWorld("pickup");
    return true;
  }

  private inspectInventory(): string {
    const slots = this.inventory.length > 0
      ? this.inventory.map((itemId) => ITEM_DEFINITIONS[itemId].label).join(", ")
      : "empty";
    const carried = this.carriedItem ? ITEM_DEFINITIONS[this.carriedItem].label : "hands free";
    const message = `Inventory ${this.inventory.length}/${this.inventoryCapacity}: ${slots}. Carrying: ${carried}.`;
    this.flashStatus(message);
    this.inventoryMenuOpen = true;
    return message;
  }

  private toggleInventoryMenu(): boolean {
    if (this.state !== "playing") {
      return false;
    }
    this.inventoryMenuOpen = !this.inventoryMenuOpen;
    this.flashStatus(this.inventoryMenuOpen ? "Inventory open" : "Inventory closed");
    return true;
  }

  private closeInventoryMenu(): boolean {
    if (!this.inventoryMenuOpen) {
      return false;
    }
    this.inventoryMenuOpen = false;
    this.flashStatus("Inventory closed");
    return true;
  }

  private forwardPoint(range: number): Vec2 {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) {
      forward.set(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    }
    forward.normalize();
    return this.resolveNearbyObstacles(
      clampToPolygon(
        {
          x: this.player.position.x + forward.x * range,
          z: this.player.position.z + forward.z * range
        },
        this.level.boundary,
        4
      ),
      0.5
    );
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
    if (this.mountedBike()) {
      return this.toggleBike();
    }
    if (this.nearestBike) {
      return this.toggleBike();
    }
    if (this.nearestBrokenBike) {
      return this.inspectBrokenBike(this.nearestBrokenBike);
    }
    if (this.nearestFixture) {
      if (this.nearestFixture.accessKind === "ladder" && this.carriedItem === "ladder" && !this.placedLadderForFixture(this.nearestFixture.id)) {
        return this.placeLadderForFixture(this.nearestFixture);
      }
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
      this.condition = hydrateCondition(this.condition);
      this.flashStatus("Filled up at drinking fountain");
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
    if (amenity.kind === "memorial_plaque") {
      if (alreadySearched) {
        this.flashStatus("Plaque already read");
        this.audio.playWorld("deny");
        return false;
      }
      this.searchedAmenityIds.add(amenity.id);
      this.shotBloom *= 0.28;
      this.condition.blurTimer = Math.max(0, this.condition.blurTimer - 4);
      this.player.velocity.multiplyScalar(0.1);
      this.flashStatus("Regained focus at memorial plaque");
      this.audio.playWorld("rest", amenity.position, { volume: 0.7 });
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
    if (loot.bikePump) {
      this.condition = applyBikePumpBoost(this.condition);
    }
    for (const itemId of loot.items) {
      if (!this.addInventoryItem(itemId)) {
        this.addDroppedWorldItem(itemId, amenity.position, { angle: this.structureUtilityAngle(amenity), ttl: Number.POSITIVE_INFINITY });
      }
    }
    this.condition.throwables = Math.min(MAX_THROWABLES, this.condition.throwables + loot.throwables);
    if (amenity.kind === "utility_box") {
      this.activateStructureUtility(amenity);
      this.emitNoise("scavenge", amenity.position, loot.noiseMultiplier * 1.05, { volume: 0.78 });
    }
    this.emitNoise("scavenge", amenity.position, loot.noiseMultiplier * 0.75);
    this.flashStatus(loot.status);
    this.audio.playWorld("searchComplete", amenity.position);
    return true;
  }

  private activateStructureUtility(amenity: AmenityPoint): void {
    if (this.activeStructureUtilityEffects.has(amenity.id)) {
      return;
    }

    const angle = this.structureUtilityAngle(amenity);
    const root = new THREE.Group();
    root.position.set(amenity.position.x, this.groundY(amenity.position), amenity.position.z);
    root.rotation.y = angle;

    const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x59615d, roughness: 0.48, metalness: 0.36 });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0b85d,
      emissive: 0xf0a64d,
      emissiveIntensity: 0.68,
      roughness: 0.36,
      metalness: 0.08
    });
    const spillMaterial = new THREE.MeshBasicMaterial({ color: 0xf6bd68, transparent: true, opacity: 0.18, depthWrite: false });

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.15, 8), mastMaterial);
    mast.position.set(0, 1.08, 0.28);
    mast.castShadow = true;
    root.add(mast);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.24), headMaterial);
    head.position.set(0, 2.16, -0.04);
    head.castShadow = true;
    root.add(head);

    const spill = new THREE.Mesh(new THREE.CircleGeometry(5.8, 24), spillMaterial);
    spill.position.set(0, 0.035, -2.8);
    spill.rotation.x = -Math.PI / 2;
    root.add(spill);

    const light = new THREE.PointLight(0xffc777, this.smokeMode ? 1.75 : 3.25, STRUCTURE_FLOODLIGHT_RADIUS, 1.35);
    light.position.set(0, 2.05, -0.55);
    root.add(light);

    this.scene.add(root);
    this.activeStructureUtilityEffects.set(amenity.id, { root, position: amenity.position });
  }

  private clearStructureUtilityEffects(): void {
    for (const effect of this.activeStructureUtilityEffects.values()) {
      this.scene.remove(effect.root);
      disposeThreeResources(effect.root);
    }
    this.activeStructureUtilityEffects.clear();
  }

  private structureUtilityAngle(amenity: AmenityPoint): number {
    let hash = 0;
    for (const char of amenity.id) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return ((hash % 6283) / 1000) - Math.PI;
  }

  private isPointInStructureUtilityLight(point: Vec2): boolean {
    for (const effect of this.activeStructureUtilityEffects.values()) {
      if (distance(point, effect.position) < STRUCTURE_LIGHT_EXPOSURE_RADIUS) {
        return true;
      }
    }
    return false;
  }

  private structureShelterAtPoint(point: Vec2): StructureShelter | null {
    let best: StructureShelter | null = null;
    for (const shelter of this.level.structureShelters) {
      if (!pointInRaisedFootprint(point, shelter.footprint, 0.15)) {
        continue;
      }
      if (!best || shelter.weatherProtection > best.weatherProtection) {
        best = shelter;
      }
    }
    return best;
  }

  private structureShelterProtectionAtPoint(point: Vec2): number {
    return this.structureShelterAtPoint(point)?.weatherProtection ?? 0;
  }

  private structureShelterProtectionForCombatant(combatant: CombatantRef): number {
    if (combatant.activeFixtureId?.endsWith("-roof")) {
      return 0;
    }
    return this.structureShelterProtectionAtPoint(this.combatantPoint(combatant));
  }

  private structureShelterProtectionForLocalPlayer(): number {
    return this.structureShelterProtectionForCombatant({
      id: this.network.localId,
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
      reviveProtectionTimer: this.player.reviveProtectionTimer,
      condition: this.condition,
      loadout: this.loadout
    });
  }

  private lootSearchContext(amenity: AmenityPoint): LootSearchContext {
    const nearbyZombies = this.zombies.filter((zombie) => distance({ x: zombie.position.x, z: zombie.position.z }, amenity.position) < 56).length;
    const surface = this.movementSurfaceAt(amenity.position);
    const exposedSurface = surface === "asphalt" || surface === "concrete" || surface === "rail" || surface === "gravel";
    const sheltered = this.structureShelterProtectionAtPoint(amenity.position) >= 0.56;
    const exposed = !sheltered && (nearbyZombies >= 2 || exposedSurface || !this.isCoverNearPoint(amenity.position, 8, 9));
    return {
      nearbyZombies,
      exposed,
      wave: this.wave
    };
  }

  private amenitySearchDuration(amenity: AmenityPoint): number {
    if (amenity.kind === "maintenance_room") return 1.85;
    if (amenity.kind === "kitchenette") return 1.65;
    if (amenity.kind === "first_aid_room") return 1.45;
    if (amenity.kind === "kiosk_hatch") return 1.55;
    if (amenity.kind === "utility_box") return 2.05;
    if (amenity.kind === "umpire_room") return 1.55;
    if (amenity.kind === "clubroom" || amenity.kind === "changeroom" || amenity.kind === "community_room") return 1.7;
    if (amenity.kind === "gatehouse") return 1.25;
    if (amenity.kind === "bbq") return 1.75;
    if (amenity.kind === "bicycle_parking") return 1.45;
    if (amenity.kind === "toilets") return 1.35;
    if (amenity.kind === "waste_basket") return 0.95;
    if (amenity.kind === "post_box") return 1.0;
    return 1.1;
  }

  private amenityPrompt(amenity: AmenityPoint): string {
    if (this.activeAmenityRest?.amenity.id === amenity.id) {
      return `Resting ${Math.ceil(this.activeAmenityRest.remaining)}s`;
    }
    if (this.activeAmenitySearch?.amenity.id === amenity.id) {
      return `Searching ${Math.ceil(this.activeAmenitySearch.remaining)}s`;
    }
    if (amenity.kind === "drinking_water") {
      return this.condition.hydration < 92 ? "E: drink and refill" : "E: drink";
    }
    if (amenity.kind === "bench") return `E: rest ${REST_SECONDS}s`;
    if (amenity.kind === "picnic_table") return `E: rest ${REST_SECONDS}s`;
    if (amenity.kind === "table_tennis") return "E: play";
    if (amenity.kind === "memorial_plaque") return this.searchedAmenityIds.has(amenity.id) ? "Plaque read" : "E: read plaque";
    if (amenity.kind === "waste_basket") return this.searchedAmenityIds.has(amenity.id) ? "Bin searched" : "E: search bin";
    if (amenity.kind === "bicycle_parking") return this.searchedAmenityIds.has(amenity.id) ? "Bike racks searched" : "E: search bike racks";
    if (amenity.kind === "bbq") return this.searchedAmenityIds.has(amenity.id) ? "BBQ searched" : "E: search BBQ";
    if (amenity.kind === "post_box") return this.searchedAmenityIds.has(amenity.id) ? "Post box searched" : "E: search post box";
    if (amenity.kind === "toilets") return this.searchedAmenityIds.has(amenity.id) ? "Toilets searched" : `E: search ${amenity.label}`;
    if (isStructureAmenityKind(amenity.kind)) {
      return this.searchedAmenityIds.has(amenity.id) ? "Structure searched" : `E: search ${amenity.label}`;
    }
    return this.searchedAmenityIds.has(amenity.id) ? "Shelter used" : "E: shelter";
  }

  private updateNearestFixture(): void {
    if (this.mountedBike() || this.skateboardMounted) {
      this.nearestFixture = null;
      return;
    }

    let nearest: InteractableFixture | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    for (const fixture of this.toggleInteractables) {
      const active = this.player.activeFixtureId === fixture.id;
      if (active) {
        if (pointInInteractableRaisedFootprint(playerPoint, fixture, 2.2)) {
          nearest = fixture;
          nearestDistance = 0;
        }
        continue;
      }
      const placedLadder = fixture.accessKind === "ladder" ? this.placedLadderForFixture(fixture.id) : null;
      const canPlaceLadder = fixture.accessKind === "ladder" && this.carriedItem === "ladder";
      if (fixture.accessKind === "ladder" && !placedLadder && !canPlaceLadder) {
        continue;
      }
      const interactionPoint = placedLadder?.accessPosition ?? fixture.accessPosition ?? fixture.position;
      const reach =
        canPlaceLadder && fixture.raisedFootprint && pointInInteractableRaisedFootprint(playerPoint, fixture, 3.2)
          ? Number.POSITIVE_INFINITY
          : fixture.accessRadius ?? fixture.radius + 3;
      const fixtureDistance = canPlaceLadder && reach === Number.POSITIVE_INFINITY ? 0 : distance(playerPoint, interactionPoint);
      if (fixtureDistance < nearestDistance && fixtureDistance < reach) {
        nearest = fixture;
        nearestDistance = fixtureDistance;
      }
    }
    this.nearestFixture = nearest;
  }

  private updateNearestBrokenBike(): void {
    if (this.mountedBike()) {
      this.nearestBrokenBike = null;
      return;
    }

    let nearest: ParkLifeDetail | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    for (const detail of this.brokenBikeDetails) {
      if (this.repairedBrokenBikeIds.has(detail.id)) {
        continue;
      }
      const detailDistance = distance(playerPoint, detail.position);
      if (detailDistance < nearestDistance && detailDistance < BIKE_INTERACTION_RADIUS) {
        nearest = detail;
        nearestDistance = detailDistance;
      }
    }
    this.nearestBrokenBike = nearest;
  }

  private placedLadderForFixture(fixtureId: string): PlacedLadder | null {
    return this.placedLadders.find((ladder) => ladder.fixtureId === fixtureId) ?? null;
  }

  private placeLadderForFixture(fixture: InteractableFixture): boolean {
    if (this.carriedItem !== "ladder") {
      this.flashStatus("Need a ladder");
      this.audio.playWorld("deny");
      return false;
    }
    if (this.placedLadderForFixture(fixture.id)) {
      this.flashStatus("Ladder already placed");
      return true;
    }
    const placement = this.ladderPlacementForFixture(fixture);
    const mesh = this.meshFactory.createPlacedLadderMesh();
    mesh.userData.dynamic = true;
    mesh.position.set(placement.accessPosition.x, this.groundY(placement.accessPosition), placement.accessPosition.z);
    mesh.rotation.set(0, placement.angle, 0);
    this.scene.add(mesh);
    this.placedLadders.push({
      id: `placed-ladder-${fixture.id}`,
      fixtureId: fixture.id,
      mesh,
      accessPosition: placement.accessPosition,
      landingPosition: placement.landingPosition,
      angle: placement.angle
    });
    this.carriedItem = null;
    this.emitNoise("climb", placement.accessPosition, 0.58, { volume: 0.5 });
    this.flashStatus(`Placed ladder at ${fixture.label}`);
    this.audio.playWorld("equip", placement.accessPosition);
    return true;
  }

  private ladderPlacementForFixture(fixture: InteractableFixture): { accessPosition: Vec2; landingPosition: Vec2; angle: number } {
    const playerPoint = { x: this.player.position.x, z: this.player.position.z };
    if (fixture.raisedFootprint?.shape === "polygon") {
      return this.polygonFootprintLadderPlacement(fixture, fixture.raisedFootprint, playerPoint);
    }
    if (fixture.raisedFootprint?.shape === "box") {
      return this.boxFootprintLadderPlacement(fixture, fixture.raisedFootprint, playerPoint);
    }

    const target = fixture.position;
    const dx = target.x - playerPoint.x;
    const dz = target.z - playerPoint.z;
    const length = Math.hypot(dx, dz) || 1;
    const accessPosition = {
      x: playerPoint.x + (dx / length) * 0.85,
      z: playerPoint.z + (dz / length) * 0.85
    };
    const landingPosition = fixture.landingPosition ?? {
      x: accessPosition.x + (dx / length) * 3.1,
      z: accessPosition.z + (dz / length) * 3.1
    };
    return {
      accessPosition,
      landingPosition,
      angle: Math.atan2(landingPosition.x - accessPosition.x, landingPosition.z - accessPosition.z)
    };
  }

  private boxFootprintLadderPlacement(
    fixture: InteractableFixture,
    footprint: Extract<InteractableRaisedFootprint, { shape: "box" }>,
    playerPoint: Vec2
  ): { accessPosition: Vec2; landingPosition: Vec2; angle: number } {
    const local = this.footprintLocalPoint(playerPoint, footprint);
    const distanceToXSide = Math.abs(Math.abs(local.x) - footprint.halfX);
    const distanceToZSide = Math.abs(Math.abs(local.z) - footprint.halfZ);
    const useXSide = distanceToXSide <= distanceToZSide;
    const sideMargin = fixture.kind === "tennis" ? 1.3 : 0.75;
    const outsideOffset = fixture.kind === "tennis" ? 0.95 : 0.72;
    const insideOffset = fixture.kind === "tennis" ? 1.1 : 0.82;

    const edgeLocal = useXSide
      ? {
          x: (local.x >= 0 ? 1 : -1) * footprint.halfX,
          z: THREE.MathUtils.clamp(local.z, -Math.max(0, footprint.halfZ - sideMargin), Math.max(0, footprint.halfZ - sideMargin))
        }
      : {
          x: THREE.MathUtils.clamp(local.x, -Math.max(0, footprint.halfX - sideMargin), Math.max(0, footprint.halfX - sideMargin)),
          z: (local.z >= 0 ? 1 : -1) * footprint.halfZ
        };
    const normalLocal = useXSide
      ? { x: edgeLocal.x >= 0 ? 1 : -1, z: 0 }
      : { x: 0, z: edgeLocal.z >= 0 ? 1 : -1 };
    const edge = this.footprintWorldPoint(edgeLocal, footprint);
    const normal = this.footprintWorldVector(normalLocal, footprint);
    const accessPosition = {
      x: edge.x + normal.x * outsideOffset,
      z: edge.z + normal.z * outsideOffset
    };
    const landingPosition = {
      x: edge.x - normal.x * insideOffset,
      z: edge.z - normal.z * insideOffset
    };
    return {
      accessPosition,
      landingPosition,
      angle: Math.atan2(landingPosition.x - accessPosition.x, landingPosition.z - accessPosition.z)
    };
  }

  private polygonFootprintLadderPlacement(
    fixture: InteractableFixture,
    footprint: Extract<InteractableRaisedFootprint, { shape: "polygon" }>,
    playerPoint: Vec2
  ): { accessPosition: Vec2; landingPosition: Vec2; angle: number } {
    const edge = nearestPointOnPolygon(playerPoint, footprint.polygon);
    const center = footprint.center;
    const playerOutside = !pointInPolygon(playerPoint, footprint.polygon);
    let normal = playerOutside
      ? {
          x: playerPoint.x - edge.x,
          z: playerPoint.z - edge.z
        }
      : {
          x: edge.x - center.x,
          z: edge.z - center.z
        };
    let normalLength = Math.hypot(normal.x, normal.z);
    if (normalLength < 0.001) {
      normal = {
        x: edge.x - center.x,
        z: edge.z - center.z
      };
      normalLength = Math.hypot(normal.x, normal.z) || 1;
    }
    const outward = {
      x: normal.x / normalLength,
      z: normal.z / normalLength
    };
    const outsideOffset = fixture.kind === "tennis" ? 0.18 : 0.72;
    const insideOffset = fixture.kind === "tennis" ? 0.95 : 0.82;
    const accessPosition = {
      x: edge.x + outward.x * outsideOffset,
      z: edge.z + outward.z * outsideOffset
    };
    const landingPosition = {
      x: edge.x - outward.x * insideOffset,
      z: edge.z - outward.z * insideOffset
    };
    return {
      accessPosition,
      landingPosition,
      angle: Math.atan2(landingPosition.x - accessPosition.x, landingPosition.z - accessPosition.z)
    };
  }

  private footprintLocalPoint(point: Vec2, footprint: Extract<InteractableRaisedFootprint, { shape: "box" }>): Vec2 {
    const dx = point.x - footprint.center.x;
    const dz = point.z - footprint.center.z;
    const cos = Math.cos(footprint.angle);
    const sin = Math.sin(footprint.angle);
    return {
      x: dx * cos + dz * sin,
      z: -dx * sin + dz * cos
    };
  }

  private footprintWorldPoint(local: Vec2, footprint: Extract<InteractableRaisedFootprint, { shape: "box" }>): Vec2 {
    const cos = Math.cos(footprint.angle);
    const sin = Math.sin(footprint.angle);
    return {
      x: footprint.center.x + local.x * cos - local.z * sin,
      z: footprint.center.z + local.x * sin + local.z * cos
    };
  }

  private footprintWorldVector(local: Vec2, footprint: Extract<InteractableRaisedFootprint, { shape: "box" }>): Vec2 {
    const cos = Math.cos(footprint.angle);
    const sin = Math.sin(footprint.angle);
    return {
      x: local.x * cos - local.z * sin,
      z: local.x * sin + local.z * cos
    };
  }

  private clearPlacedLadders(): void {
    for (const ladder of this.placedLadders) {
      this.scene.remove(ladder.mesh);
      disposeThreeResources(ladder.mesh);
    }
    this.placedLadders = [];
    this.nearestPlacedLadder = null;
  }

  private toggleFixture(fixture: InteractableFixture): boolean {
    if (this.mountedBike() || this.skateboardMounted) {
      this.flashStatus("Dismount before climbing");
      this.audio.playWorld("deny");
      return false;
    }

    const placedLadder = fixture.accessKind === "ladder" ? this.placedLadderForFixture(fixture.id) : null;
    if (fixture.accessKind === "ladder" && !placedLadder) {
      if (this.carriedItem === "ladder") {
        return this.placeLadderForFixture(fixture);
      }
      this.flashStatus("Find and place a ladder first");
      this.audio.playWorld("deny");
      return false;
    }

    if (this.player.activeFixtureId === fixture.id) {
      this.player.activeFixtureId = null;
      this.player.heightTarget = 0;
      const exit = placedLadder?.accessPosition ?? fixture.exitPosition ?? fixture.accessPosition;
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
      const landing = placedLadder?.landingPosition ?? fixture.landingPosition ?? fixture.position;
      this.player.position.set(landing.x, this.groundY(landing), landing.z);
      this.flashStatus(`${this.climbStatusVerb(fixture)} ${fixture.label}`);
      this.emitNoise("climb", placedLadder?.accessPosition ?? fixture.accessPosition ?? fixture.position);
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
    this.locomotion.updateFixtureElevation(this.player, dt, { forceGrounded: this.mountedBike() !== null || this.skateboardMounted });
  }

  private updateJumpState(dt: number): void {
    this.locomotion.updateJumpState(this.player, dt, { disabled: this.mountedBike() !== null || this.skateboardMounted });
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
    return shouldBypassObstacleByContext(obstacleId, point, {
      activeFixtureId,
      interactables: this.level.interactables
    });
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
    if (this.mountedBike()) {
      const fixture = (fixtureId ? this.interactableById.get(fixtureId) : undefined) ?? this.level.interactables[0] ?? null;
      return fixture ? this.toggleFixture(fixture) : false;
    }

    const fixture = fixtureId ? this.interactableById.get(fixtureId) ?? null : this.level.interactables[0] ?? null;
    if (!fixture) {
      return false;
    }
    const access = fixture.accessPosition ?? fixture.position;
    this.player.position.set(access.x, this.groundY(access), access.z);
    if (fixture.accessKind === "ladder" && !this.placedLadderForFixture(fixture.id)) {
      this.carriedItem = "ladder";
      this.placeLadderForFixture(fixture);
    }
    const toggled = this.toggleFixture(fixture);
    if (toggled && this.player.activeFixtureId === fixture.id) {
      this.player.heightTarget = fixture.height;
      this.player.height = fixture.height;
    }
    return toggled;
  }

  private testToggleBike(): boolean {
    const bike = this.bike ?? this.bikes.find((candidate) => candidate.state === "available") ?? null;
    if (!bike) {
      return false;
    }
    if (!bike.mounted) {
      this.player.position.set(bike.position.x, this.groundY({ x: bike.position.x, z: bike.position.z }), bike.position.z);
      this.player.height = 0;
      this.player.heightTarget = 0;
      this.player.activeFixtureId = null;
      this.updateBikes(0);
    }
    return this.toggleBike(bike);
  }

  private testRepairFlatBike(): boolean {
    const detail = this.brokenBikeDetails.find((candidate) => candidate.bikeIssue === "flat-tyres") ?? null;
    if (!detail) {
      return false;
    }
    if (!this.hasInventoryItem("tyre-kit")) {
      this.addInventoryItem("tyre-kit");
    }
    this.player.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    this.updateNearestBrokenBike();
    const wasRepaired = this.repairedBrokenBikeIds.has(detail.id);
    this.inspectBrokenBike(detail);
    return !wasRepaired && this.repairedBrokenBikeIds.has(detail.id);
  }

  private testUnlockLockedBike(): boolean {
    const detail = this.brokenBikeDetails.find((candidate) => candidate.bikeIssue === "locked") ?? null;
    if (!detail) {
      return false;
    }
    if (!this.hasInventoryItem("bolt-cutters")) {
      this.addInventoryItem("bolt-cutters");
    }
    this.player.position.set(detail.position.x, this.groundY(detail.position), detail.position.z);
    this.updateNearestBrokenBike();
    const wasUnlocked = this.repairedBrokenBikeIds.has(detail.id);
    this.inspectBrokenBike(detail);
    return !wasUnlocked && this.repairedBrokenBikeIds.has(detail.id);
  }

  private testPickupItem(itemId?: string): boolean {
    const item = itemId
      ? this.droppedItems.find((candidate) => candidate.itemId === itemId) ?? null
      : this.droppedItems[0] ?? null;
    if (!item) {
      return false;
    }
    this.player.position.set(item.position.x, this.groundY({ x: item.position.x, z: item.position.z }), item.position.z);
    this.updateNearestWorldItem();
    return this.pickupWorldItem(item);
  }

  private testPlaceLadder(fixtureId?: string): boolean {
    if (this.carriedItem !== "ladder") {
      this.carriedItem = "ladder";
    }
    const fixture = (fixtureId ? this.interactableById.get(fixtureId) : undefined) ?? this.level.interactables.find((candidate) => candidate.accessKind === "ladder") ?? null;
    if (!fixture) {
      return false;
    }
    const access = fixture.accessPosition ?? fixture.position;
    this.player.position.set(access.x, this.groundY(access), access.z);
    return this.placeLadderForFixture(fixture);
  }

  private testPickupPlacedLadder(): boolean {
    const ladder = this.placedLadders[0] ?? null;
    if (!ladder) {
      return false;
    }
    this.player.activeFixtureId = null;
    this.player.height = 0;
    this.player.heightTarget = 0;
    this.player.position.set(ladder.accessPosition.x, this.groundY(ladder.accessPosition), ladder.accessPosition.z);
    this.updateNearestPlacedLadder();
    return this.pickupPlacedLadder(ladder);
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

  private testTeleport(position: { x: number; z: number; yaw?: number; pitch?: number }): Snapshot {
    const x = Number.isFinite(position.x) ? position.x : this.player.position.x;
    const z = Number.isFinite(position.z) ? position.z : this.player.position.z;
    this.player.position.set(x, this.groundY({ x, z }), z);
    this.player.velocity.set(0, 0, 0);
    this.player.height = 0;
    this.player.heightTarget = 0;
    this.player.jumpHeight = 0;
    this.player.jumpVelocity = 0;
    this.player.activeFixtureId = null;
    if (Number.isFinite(position.yaw)) {
      this.player.yaw = position.yaw!;
      this.testCameraOverride = true;
    }
    if (Number.isFinite(position.pitch)) {
      this.player.pitch = THREE.MathUtils.clamp(position.pitch!, -1.18, 1.1);
      this.testCameraOverride = true;
    }
    this.updateNearestStation();
    this.updateNearestAmenity();
    this.updateNearestWorldItem();
    this.updateNearestBrokenBike();
    this.updateNearestPlacedLadder();
    return this.snapshot();
  }

  private testStartIntermission(): boolean {
    for (const zombie of this.zombies) {
      this.removeZombieVisual(zombie);
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
    this.paused = false;
    this.hud.setPaused(false, this.network.enabled);
    this.hud.setRestartVisible(true);
    this.hud.setStatus(`Overrun at wave ${this.wave}`);
    document.exitPointerLock?.();
    this.sendNetworkSnapshotNow();
  }

  private snapshot(): Snapshot {
    const shelterProtection = this.structureShelterProtectionForLocalPlayer();
    return {
      ready: true,
      state: this.state,
      frame: this.frame,
      playerX: Number(this.player.position.x.toFixed(2)),
      playerZ: Number(this.player.position.z.toFixed(2)),
      playerYaw: Number(this.player.yaw.toFixed(3)),
      playerPitch: Number(this.player.pitch.toFixed(3)),
      wave: this.wave,
      paused: this.paused,
      zombies: this.zombies.length,
      ammo: this.loadout.ammoInMagazine,
      health: Math.max(0, Math.round(this.player.health)),
      scrap: this.player.scrap,
      weapon: this.loadout.weaponId,
      upgrades: { ...this.loadout.upgrades },
      weaponDrops: this.weaponDrops.length,
      elevation: Number(this.playerElevation().toFixed(2)),
      jumpHeight: Number(this.player.jumpHeight.toFixed(2)),
      renderedTrees: this.renderedTreeCount,
      renderedGrassClumps: this.renderedGrassClumpCount,
      renderedWetPathSheens: this.renderedWetPathSheenCount,
      renderedLampSpills: this.renderedLampSpillCount,
      renderQuality: this.adaptiveQuality.current,
      renderPixelRatio: Number(this.renderer.getPixelRatio().toFixed(2)),
      rendererCalls: this.renderer.info.render.calls,
      rendererTriangles: this.renderer.info.render.triangles,
      renderedMistBanks: this.atmosphere.getGroundMistBankCount(),
      renderedRainDrops: this.atmosphere.getRainDropCount(),
      renderedWeatherAnchors: this.atmosphere.getWeatherAnchorCount(),
      weatherKind: this.currentWeather.kind,
      weatherRain: Number(this.currentWeather.precipitation.toFixed(2)),
      weatherCloudCover: Number(this.currentWeather.cloudCover.toFixed(2)),
      weatherFog: Number(this.currentWeather.fog.toFixed(2)),
      weatherWind: Number(this.currentWeather.wind.toFixed(2)),
      sheltered: shelterProtection >= 0.56,
      shelterProtection: Number(shelterProtection.toFixed(2)),
      lastHitZone: this.lastHitZone,
      meleeSwing: Number(this.meleeSwing.toFixed(3)),
      shotBloom: Number(this.shotBloom.toFixed(4)),
      reloadProgress: Number(this.reloadProgress(performance.now() / 1000).toFixed(2)),
      scope: Number(this.scopeAmount.toFixed(2)),
      fov: Number(this.camera.fov.toFixed(1)),
      miniMapVisibleZombies: this.miniMapVisibleZombieCount,
      visibility: Number(this.localVisibilityLevel().toFixed(2)),
      noise: Number(this.hudNoiseLevel.toFixed(2)),
      crouching: this.player.crouching,
      wavePhase: this.wavePhase,
      intermissionTimer: Number(this.intermissionTimer.toFixed(2)),
      intermissionUpgradeWave: this.player.intermissionUpgradeWave,
      amenityAction: this.activeAmenityRest ? "rest" : this.activeAmenitySearch ? "search" : null,
      amenityActionRemaining: Number((this.activeAmenityRest?.remaining ?? this.activeAmenitySearch?.remaining ?? 0).toFixed(2)),
      stamina: Number(this.condition.stamina.toFixed(1)),
      hydration: Number(this.condition.hydration.toFixed(1)),
      bleeding: this.condition.bleedTimer > 0,
      limp: this.condition.limpTimer > 0,
      blur: this.condition.blurTimer > 0,
      throwables: this.condition.throwables,
      flashlightOn: this.condition.flashlightOn,
      activeDistractions: this.distractions.length,
      activeStructureUtilities: this.activeStructureUtilityEffects.size,
      bikeMounted: this.mountedBike() !== null,
      skateboardMounted: this.skateboardMounted,
      inventory: [...this.inventory],
      inventoryCapacity: this.inventoryCapacity,
      carriedItem: this.carriedItem,
      droppedItems: this.droppedItems.length,
      availableBikes: this.bikes.filter((bike) => bike.state === "available").length,
      lockedBikes: this.bikes.filter((bike) => bike.state === "locked").length,
      flatBikes: this.bikes.filter((bike) => bike.state === "flat-tyres").length,
      placedLadders: this.placedLadders.length,
      bikePumpBoostRemaining: Number(this.condition.bikePumpTimer.toFixed(1)),
      repairedBrokenBikes: this.repairedBrokenBikeIds.size
    };
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.root;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.postProcessing.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private applyRenderQuality(level: RenderQualityLevel, resize = true): void {
    const settings = RENDER_QUALITY_SETTINGS[level];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.smokeMode ? 1 : settings.maxPixelRatio));
    this.postProcessing.setPixelRatio(this.renderer.getPixelRatio());
    this.world.setQualityLevel(level);
    // A quality transition can dispose the old depth texture while resizing the
    // shadow map. Force Three.js to create and populate its replacement before
    // shadow-receiving terrain and tree materials sample it.
    this.renderer.shadowMap.needsUpdate = !this.smokeMode;
    this.atmosphere.setQualityLevel(level);
    this.postProcessing.setQualityLevel(level);
    if (resize) {
      this.resize();
    }
  }

  private rendererUsesSoftwareWebGL(): boolean {
    const context = this.renderer.getContext();
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
    const rendererName = String(context.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER));
    return /swiftshader|llvmpipe|software/i.test(rendererName);
  }

  private reloadProgress(now: number): number {
    if (this.loadout.reloadingUntil <= now || this.loadout.reloadStartedAt <= 0) {
      return 0;
    }
    const span = Math.max(0.001, this.loadout.reloadingUntil - this.loadout.reloadStartedAt);
    return THREE.MathUtils.clamp((now - this.loadout.reloadStartedAt) / span, 0, 1);
  }

  private updateHud(): void {
    const remainingSpawns = this.isNetworkClient ? this.network.remainingSpawns : this.waveDirector.remainingSpawns;
    const waveTotal = getWaveConfig(this.wave).total;
    const alertedZombies = this.zombies.filter((zombie) => zombie.aiState === "chase").length;
    const searchingZombies = this.zombies.filter((zombie) => zombie.aiState === "investigate" || zombie.aiState === "search").length;
    const threat = alertedZombies > 0 ? "hunted" : searchingZombies > 0 ? "searching" : "quiet";
    const shelterProtection = this.structureShelterProtectionForLocalPlayer();
    this.hud.update({
      health: this.player.health,
      wave: this.wave,
      scrap: this.player.scrap,
      activeZombies: this.zombies.length,
      remainingSpawns,
      waveTotal,
      loadout: this.loadout,
      reloadProgress: this.reloadProgress(performance.now() / 1000),
      playerHeight: this.playerElevation(),
      activeFixtureId: this.player.activeFixtureId,
      nearestWeaponDrop: this.nearestWeaponDrop,
      nearestBike: this.nearestBike,
      nearestBrokenBike: this.nearestBrokenBike,
      nearestWorldItem: this.nearestWorldItem,
      nearestPlacedLadder: this.nearestPlacedLadder
        ? { label: `Placed ladder at ${this.interactableById.get(this.nearestPlacedLadder.fixtureId)?.label ?? "fixture"}` }
        : null,
      nearestFixture: this.nearestFixture,
      nearestAmenity: this.nearestAmenity,
      nearestStation: this.nearestStation,
      wavePhase: this.wavePhase,
      intermissionTimer: this.intermissionTimer,
      intermissionChoices: this.currentIntermissionChoices(),
      intermissionChoiceClaimed: this.player.intermissionUpgradeWave === this.wave,
      isCrouching: this.player.crouching,
      stamina: this.condition.stamina,
      hydration: this.condition.hydration,
      throwables: this.condition.throwables,
      flashlightOn: this.condition.flashlightOn,
      inventoryOpen: this.inventoryMenuOpen,
      inventory: this.inventory,
      inventoryCapacity: this.inventoryCapacity,
      carriedItem: this.carriedItem,
      bikePumpBoostRemaining: this.condition.bikePumpTimer,
      bikeMounted: this.mountedBike() !== null,
      skateboardMounted: this.skateboardMounted,
      injuryStatus: injuryStatus(this.condition),
      hydrationStatus: hydrationStatus(this.condition),
      visibility: this.localVisibilityLevel(),
      noise: this.hudNoiseLevel,
      threat,
      alertedZombies,
      weatherLabel: this.currentWeather.label,
      timeLabel: formatGameTime(this.currentTimeOfDay.hour),
      sheltered: shelterProtection >= 0.56,
      areaLabel: this.miniMap.currentAreaLabel({ x: this.player.position.x, z: this.player.position.z }),
      damageDirection: this.damageDirection,
      damageActive: this.damageDirectionTimer > 0,
      teammates: [...this.remotePlayers.values()].map((player) => ({
        id: player.id,
        name: player.name,
        health: player.health,
        stamina: player.condition.stamina,
        distance: player.position.distanceTo(this.player.position),
        alive: player.health > 0,
        weaponName: WEAPON_DEFINITIONS[player.loadout.weaponId].name
      })),
      amenityPrompt: (amenity) => this.amenityPrompt(amenity)
    });
  }

  private localVisibilityLevel(): number {
    const point = { x: this.player.position.x, z: this.player.position.z };
    const surface = this.movementSurfaceAt(point);
    const multiplier = playerVisibilityMultiplier({
      surface,
      crouching: this.player.crouching,
      inCover: this.playerInCover(surface),
      elevatedHeight: this.playerElevation(),
      flashlightOn: this.condition.flashlightOn,
      structureLit: this.isPointInStructureUtilityLight(point),
      structureShelter: this.structureShelterProtectionForLocalPlayer(),
      weather: this.currentWeather,
      timeOfDay: this.currentTimeOfDay
    });
    return THREE.MathUtils.clamp((multiplier - 0.18) / 1.22, 0, 1);
  }

  private flashStatus(message: string): void {
    this.hud.flashStatus(message);
  }

  private updateMiniMap(now: number): void {
    if (now - this.lastMiniMapZombieUpdateAt >= MINI_MAP_ZOMBIE_UPDATE_INTERVAL_SECONDS) {
      this.refreshMiniMapZombieDots(now);
    }

    this.miniMapVisibleZombieCount = this.miniMap.render({
      playerPosition: { x: this.player.position.x, z: this.player.position.z },
      playerYaw: this.player.yaw,
      zombies: this.miniMapZombieDots,
      weaponDrops: this.weaponDrops,
      teammates: [...this.remotePlayers.values()].map((player) => ({
        position: { x: player.position.x, z: player.position.z },
        alive: player.health > 0
      })),
      isVisible: () => true
    });
  }

  private refreshMiniMapZombieDots(now: number): void {
    const visibilityContext = this.visibilityContext();
    this.miniMapZombieDots = this.zombies.flatMap((zombie) => {
      if (!isPointVisibleToPlayerByContext(zombie.position, visibilityContext, zombie.radius)) {
        return [];
      }
      return [
        {
          position: { x: zombie.position.x, z: zombie.position.z },
          radius: zombie.radius
        }
      ];
    });
    this.lastMiniMapZombieUpdateAt = now;
  }

  private isPointVisibleToPlayer(point: Vec2, padding = 0): boolean {
    return isPointVisibleToPlayerByContext(point, this.visibilityContext(), padding);
  }

  private isLineOfSightBlocked(a: Vec2, b: Vec2, padding = 0): boolean {
    return isLineOfSightBlockedByContext(a, b, this.visibilityContext(), padding);
  }

  private visibilityContext() {
    return this.visibilityContextForCombatant({
      id: this.network.localId,
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
      reviveProtectionTimer: this.player.reviveProtectionTimer,
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

  private collectPlinthClockFlashTargets(): void {
    this.plinthClockMaterials.length = 0;
    this.plinthClockLights.length = 0;
    this.scene.traverse((object) => {
      if (object.userData.kind === "plinth-apocalypse-clock" && object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshBasicMaterial && !this.plinthClockMaterials.includes(material)) {
            material.transparent = true;
            material.depthWrite = false;
            this.plinthClockMaterials.push(material);
          }
        }
      }
      if (object.userData.kind === "plinth-apocalypse-clock-light" && object instanceof THREE.PointLight) {
        this.plinthClockLights.push(object);
      }
    });
  }

  private updatePlinthClockFlash(now: number): void {
    if (this.plinthClockMaterials.length === 0 && this.plinthClockLights.length === 0) {
      return;
    }
    const bright = Math.sin(now * Math.PI * 4.2) > -0.18;
    const opacity = bright ? 1 : 0.22;
    for (const material of this.plinthClockMaterials) {
      material.opacity = opacity;
    }
    for (const light of this.plinthClockLights) {
      light.intensity = bright ? 0.9 : 0.08;
    }
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
    const weapon = this.meshFactory.createWeaponMesh(this.loadout.weaponId, true, this.network.config.avatarId);
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
    const bikeAllowsWeapon = (!this.mountedBike() && !this.skateboardMounted) || this.weaponCanFireOnBike(this.loadout.weaponId);
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
    const nextFov = THREE.MathUtils.clamp(this.settings.fieldOfView / zoom, 24, this.settings.fieldOfView);
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
    const weatherProtection = this.structureShelterProtectionForLocalPlayer();
    const weatherGripSway =
      1 +
      this.currentWeather.precipitation * (1 - weatherProtection * 0.72) * 0.08 +
      this.currentWeather.wind * (1 - weatherProtection * 0.42) * 0.05;
    const stanceSway = (this.player.crouching ? 0.48 : 1) * weatherGripSway;
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
    const shells = this.shells;
    for (let index = shells.length - 1; index >= 0; index -= 1) {
      const shell = shells[index];
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
        this.removeAndDisposeTransient(shell.mesh);
        shells.splice(index, 1);
      }
    }
  }

  private updateSmokePuffs(dt: number): void {
    const puffs = this.smokePuffs;
    for (let index = puffs.length - 1; index >= 0; index -= 1) {
      const puff = puffs[index];
      puff.ttl -= dt;
      puff.velocity.y += dt * 0.18;
      puff.mesh.position.addScaledVector(puff.velocity, dt);
      puff.mesh.scale.addScalar(dt * 0.8);
      const material = puff.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.28 * (puff.ttl / puff.maxTtl));
      if (puff.ttl <= 0) {
        this.removeAndDisposeTransient(puff.mesh);
        puffs.splice(index, 1);
      }
    }
  }

  private async installBlenderZombie(zombie: Zombie): Promise<void> {
    try {
      const asset = await instantiateZombieAsset(zombie.type);
      if (!this.zombies.includes(zombie) || zombie.mesh.parent !== this.scene) {
        disposeThreeResources(asset.root);
        return;
      }
      for (const child of [...zombie.mesh.children]) {
        zombie.mesh.remove(child);
        disposeThreeResources(child);
      }
      zombie.mesh.scale.set(1, 1, 1);
      delete zombie.mesh.userData.arms;
      delete zombie.mesh.userData.head;
      zombie.mesh.add(asset.root);
      zombie.mesh.userData.kind = "blender-zombie-wrapper";
      zombie.mesh.userData.zombieType = zombie.type;
      attachZombieAnimation(zombie.mesh, asset);
      this.renderer.shadowMap.needsUpdate = !this.smokeMode;
    } catch {
      // The existing procedural zombie remains a deterministic load fallback.
    }
  }

  private removeZombieVisual(zombie: Zombie): void {
    this.scene.remove(zombie.mesh);
    disposeZombieAssetAnimation(zombie.mesh);
    disposeThreeResources(zombie.mesh);
  }

  private animateZombie(zombie: Zombie, now: number, distanceToPlayer: number, dt: number): void {
    if (updateZombieAssetAnimation(zombie.mesh, {
      dt,
      type: zombie.type,
      aiState: zombie.aiState,
      staggered: zombie.staggerTimer > 0,
      distanceToPlayer
    })) {
      return;
    }
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
    const tracers = this.tracers;
    for (let index = tracers.length - 1; index >= 0; index -= 1) {
      const tracer = tracers[index];
      tracer.ttl -= dt;
      const material = tracer.mesh.material as THREE.LineBasicMaterial;
      material.opacity = Math.max(0, tracer.ttl / 0.08);
      if (tracer.ttl <= 0) {
        this.removeAndDisposeTransient(tracer.mesh);
        tracers.splice(index, 1);
      }
    }
  }

  private createHitSpark(position: THREE.Vector3): void {
    const spark = this.acquireHitSpark();
    spark.sprite.position.copy(position);
    spark.sprite.scale.setScalar(HIT_SPARK_BASE_SIZE);
    spark.material.opacity = 0.86;
    spark.sprite.visible = true;
    spark.ttl = HIT_SPARK_SECONDS;
    spark.active = true;
  }

  private updateHitSparks(dt: number): void {
    for (const spark of this.hitSparks) {
      if (!spark.active) {
        continue;
      }
      spark.ttl = Math.max(0, spark.ttl - dt);
      const progress = spark.ttl / HIT_SPARK_SECONDS;
      spark.material.opacity = 0.86 * progress;
      spark.sprite.scale.setScalar(HIT_SPARK_BASE_SIZE * (1 + (1 - progress) * 0.65));
      if (spark.ttl === 0) {
        spark.active = false;
        spark.sprite.visible = false;
      }
    }
  }

  private acquireHitSpark(): HitSpark {
    const inactive = this.hitSparks.find((spark) => !spark.active);
    if (inactive) {
      return inactive;
    }
    if (this.hitSparks.length < HIT_SPARK_POOL_SIZE) {
      const spark = this.createHitSparkPoolEntry();
      this.hitSparks.push(spark);
      return spark;
    }
    const spark = this.hitSparks[this.hitSparkCursor];
    this.hitSparkCursor = (this.hitSparkCursor + 1) % this.hitSparks.length;
    return spark;
  }

  private createHitSparkPoolEntry(): HitSpark {
    const material = new THREE.SpriteMaterial({
      color: 0xf0c96a,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.setScalar(HIT_SPARK_BASE_SIZE);
    this.scene.add(sprite);
    return {
      sprite,
      material,
      ttl: 0,
      active: false
    };
  }

  private clearHitSparks(): void {
    this.hitSparkCursor = 0;
    for (const spark of this.hitSparks) {
      spark.ttl = 0;
      spark.active = false;
      spark.material.opacity = 0;
      spark.sprite.visible = false;
    }
  }

  private clearTransientEffects(): void {
    for (const tracer of this.tracers) {
      this.removeAndDisposeTransient(tracer.mesh);
    }
    for (const shell of this.shells) {
      this.removeAndDisposeTransient(shell.mesh);
    }
    for (const puff of this.smokePuffs) {
      this.removeAndDisposeTransient(puff.mesh);
    }
    this.tracers = [];
    this.shells = [];
    this.smokePuffs = [];
    this.clearHitSparks();
  }

  private removeAndDisposeTransient(object: THREE.Object3D): void {
    this.scene.remove(object);
    disposeThreeResources(object);
  }

}
