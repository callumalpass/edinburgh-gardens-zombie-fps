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
import { clampToPolygon, distance } from "./geo";
import { createLevelData } from "./levelData";
import { SeededRandom } from "./random";
import { MeshFactory } from "./rendering/MeshFactory";
import { WorldBuilder, type GameMaterials } from "./rendering/WorldBuilder";
import { createGameMaterials } from "./rendering/materials";
import type { GameStateName, GameTestApi, HitZone, Pickup, ShellCasing, SmokePuff, Snapshot, Tracer, WeaponDrop, Zombie } from "./state";
import { installGameTestDriver, uninstallGameTestDriver } from "./testing/GameTestDriver";
import { TerrainSampler } from "./terrain";
import {
  isLineOfSightBlocked as isLineOfSightBlockedByContext,
  isPointVisibleToPlayer as isPointVisibleToPlayerByContext
} from "./visibility";
import { createZombieSpawn, getWaveConfig, type ZombieSpawn, type ZombieType } from "./waves";
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

export class GameApp {
  private readonly root: HTMLElement;
  private readonly level: LevelData;
  private readonly terrain: TerrainSampler;
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
  private materials!: GameMaterials;

  constructor(root: HTMLElement) {
    this.root = root;
    this.level = createLevelData();
    this.terrain = new TerrainSampler(this.level);
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
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08100c);
    this.scene.fog = new THREE.FogExp2(0x08100c, 0.0025);
    this.materials = createGameMaterials(this.rng);
    this.meshFactory = new MeshFactory(this.materials);
    this.miniMap = new MiniMapRenderer(this.hud.miniMap, this.level);
    this.scene.add(this.camera);
    this.camera.add(this.weaponModel);
    this.rebuildViewWeapon();
    this.createWorld();
    this.world.createUpgradeStations();
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
      testMiniMapVisibility: () => this.testMiniMapVisibility()
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

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame((next) => this.tick(next));
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
      const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? SPRINT_SPEED : WALK_SPEED;
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
      next = resolveObstacle(next, PLAYER_RADIUS, obstacle);
    }
    this.player.position.set(next.x, this.groundY(next), next.z);
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
    this.camera.position.set(this.player.position.x, this.player.position.y + PLAYER_HEIGHT + this.player.height, this.player.position.z);
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
    const mesh = this.meshFactory.createZombieMesh(spawn.type);
    mesh.position.set(spawn.position.x, this.groundY(spawn.position), spawn.position.z);
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
        next = resolveObstacle(next, zombie.radius, obstacle);
      }
      const groundY = this.groundY(next);
      zombie.position.set(next.x, groundY, next.z);
      zombie.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      zombie.mesh.position.y = groundY + Math.sin(now * 7 + zombie.walkOffset) * 0.07;
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
    return this.toggleFixture(fixture);
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
      zombies: this.zombies.map((zombie) => ({
        position: { x: zombie.position.x, z: zombie.position.z },
        radius: zombie.radius
      })),
      weaponDrops: this.weaponDrops.map((drop) => ({
        position: { x: drop.position.x, z: drop.position.z }
      })),
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
    const weapon = this.meshFactory.createWeaponMesh(this.loadout.weaponId, true);
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
