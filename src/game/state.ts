import type * as THREE from "three";
import type { RenderQualityLevel } from "./rendering/renderQuality";
import type { WeatherKind } from "./rendering/weather";
import type { AmenityPoint } from "./types";
import type { InventoryItemId, LargeCarryItemId } from "./items";
import type { UpgradeId, WeaponId } from "./weapons";
import type { ZombieType } from "./waves";
import type { AvatarId } from "./characters";

export type GameStateName = "ready" | "playing" | "gameover";
export type HitZone = "head" | "body" | "legs";
export type ZombieAiState = "wander" | "investigate" | "search" | "chase";
export type WavePhase = "active" | "intermission";

export interface Zombie {
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
  aiState: ZombieAiState;
  target: { x: number; z: number } | null;
  lastKnownPlayer: { x: number; z: number } | null;
  wanderTimer: number;
  searchTimer: number;
  memoryTimer: number;
  vocalCooldown: number;
  stepCooldown: number;
  staggerTimer: number;
  screamCooldown: number;
  role?: "caretaker";
}

export interface Pickup {
  id: number;
  type: "scrap" | "health" | "ammo";
  amount: number;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  ttl: number;
}

export interface WeaponDrop {
  id: number;
  weaponId: WeaponId;
  label: string;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  ttl: number;
  source: "cache" | "zombie";
}

export interface Tracer {
  mesh: THREE.Line;
  ttl: number;
}

export interface ShellCasing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
}

export interface SmokePuff {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
  maxTtl: number;
}

export interface Snapshot {
  ready: boolean;
  state: string;
  frame: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  playerPitch: number;
  cameraX: number;
  cameraZ: number;
  wave: number;
  paused: boolean;
  zombies: number;
  ammo: number;
  health: number;
  scrap: number;
  weapon: WeaponId;
  upgrades: Record<UpgradeId, number>;
  weaponDrops: number;
  visibleWeaponDrops: number;
  weaponDropMeshes: number;
  elevation: number;
  jumpHeight: number;
  renderedTrees: number;
  renderedGrassClumps: number;
  renderedWetPathSheens: number;
  renderedLampSpills: number;
  renderQuality: "low" | "medium" | "high";
  renderPixelRatio: number;
  rendererCalls: number;
  rendererTriangles: number;
  contextBuildings: number;
  contextRoads: number;
  contextTrees: number;
  contextMeshes: number;
  contextTriangles: number;
  renderedMistBanks: number;
  renderedRainDrops: number;
  renderedWeatherAnchors: number;
  weatherKind: WeatherKind;
  weatherRain: number;
  weatherCloudCover: number;
  weatherFog: number;
  weatherWind: number;
  sheltered: boolean;
  shelterProtection: number;
  lastHitZone: HitZone | null;
  meleeSwing: number;
  shotBloom: number;
  reloadProgress: number;
  scope: number;
  fov: number;
  miniMapVisibleZombies: number;
  visibility: number;
  noise: number;
  crouching: boolean;
  wavePhase: WavePhase;
  intermissionTimer: number;
  intermissionUpgradeWave: number;
  amenityAction: "rest" | "search" | null;
  amenityActionRemaining: number;
  stamina: number;
  sprinting: boolean;
  hydration: number;
  bleeding: boolean;
  limp: boolean;
  blur: boolean;
  throwables: number;
  flashlightOn: boolean;
  activeDistractions: number;
  activeStructureUtilities: number;
  bikeMounted: boolean;
  skateboardMounted: boolean;
  inventory: InventoryItemId[];
  inventoryCapacity: number;
  carriedItem: LargeCarryItemId | null;
  droppedItems: number;
  availableBikes: number;
  lockedBikes: number;
  flatBikes: number;
  placedLadders: number;
  bikePumpBoostRemaining: number;
  repairedBrokenBikes: number;
  rescueScenarioPhase: string;
  dogFreed: boolean;
  cartRepaired: boolean;
  unlockedScenarioGates: number;
  intactBarricades: number;
  networkReady: boolean;
  lastNetworkActionSequence: number;
  lastNetworkActionSucceeded: boolean;
  lastNetworkActionMessage: string | null;
  networkPlayers: Array<{
    id: string;
    x: number;
    z: number;
    lastProcessedInputSequence: number;
    lastProcessedActionSequence: number;
    weapon: WeaponId;
    ammo: number;
    stamina: number;
    sprinting: boolean;
    bikeMounted: boolean;
    moveSpeed: number;
    weaponVisible: boolean;
    weaponMeshes: number;
  }>;
  viewWeaponVisible: boolean;
  viewWeaponMeshes: number;
  muzzleFlashVisible: boolean;
  networkCorrection: number;
}

export interface GameTestApi {
  ready: boolean;
  snapshot: () => Snapshot;
  testSetRenderQuality: (level: RenderQualityLevel) => Snapshot;
  testTeleport: (position: { x: number; z: number; yaw?: number; pitch?: number }) => Snapshot;
  testShoot: () => void;
  testUpgrade: (stationId?: string) => boolean;
  testSpawn: (type?: ZombieType) => void;
  testPickupWeapon: (weaponId?: WeaponId) => boolean;
  testScope: (weaponId?: WeaponId) => boolean;
  testInteract: (fixtureId?: string) => boolean;
  testUseAmenity: (kind?: AmenityPoint["kind"]) => boolean;
  testRepairFlatBike: () => boolean;
  testUnlockLockedBike: () => boolean;
  testPickupItem: (itemId?: string) => boolean;
  testDropItem: () => boolean;
  testInspectInventory: () => string;
  testPlaceLadder: (fixtureId?: string) => boolean;
  testPickupPlacedLadder: () => boolean;
  testToggleSkateboard: () => boolean;
  testThrowDistraction: () => boolean;
  testToggleFlashlight: () => boolean;
  testMiniMapVisibility: () => { front: boolean; behind: boolean; occluded: boolean };
  testGrounding: () => {
    playerGroundDelta: number;
    maxZombieGroundDelta: number;
    maxZombieFootGap: number;
    maxZombieFootPenetration: number;
    zombiesMeasured: number;
  };
  testZombieStates: () => Array<{ id: number; type: ZombieType; role?: "caretaker"; aiState: ZombieAiState; hasTarget: boolean; targetDistance: number | null; x: number; z: number }>;
  testZombieAssetStates: () => Array<{ id: number; type: ZombieType; assetLoaded: boolean; animation: string }>;
  testZombieFacing: () => Array<{ id: number; faceAlignment: number; targetDistance: number }>;
  testSetCrouching: (crouching: boolean) => boolean;
  testSetHealth: (health: number) => Snapshot;
  testStartIntermission: () => boolean;
  testChooseIntermissionUpgrade: (upgradeId?: UpgradeId) => boolean;
  testAddTeammate: (name?: string, avatarId?: AvatarId) => boolean;
  testAvatarStates: () => Array<{ id: string; avatarId: AvatarId; assetLoaded: boolean; animation: string; weaponAttachedToSocket: boolean }>;
  testToggleBike: () => boolean;
  testPositionNetworkPeerAtBike: (authoritativeDistance?: number) => boolean;
  testPositionNetworkPeerAtWeapon: (weaponId?: WeaponId, authoritativeDistance?: number) => boolean;
  testRequestNetworkWeaponTake: (weaponId?: WeaponId) => boolean;
  testEquipNetworkPeer: (weaponId?: WeaponId) => boolean;
  testStartRescueScenario: () => Snapshot;
  testDefeatCaretaker: () => Snapshot;
  testUnlockDogRoom: () => Snapshot;
  testRepairMaintenanceCart: () => Snapshot;
  testToggleMaintenanceCart: () => boolean;
  dispose: () => void;
}
