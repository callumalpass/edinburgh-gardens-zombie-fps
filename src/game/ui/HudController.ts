import {
  UPGRADE_DEFINITIONS,
  WEAPON_DEFINITIONS,
  getWeaponStats,
  upgradeCost,
  type Loadout,
  type WeaponId
} from "../weapons";
import type { AmenityPoint, InteractableFixture, ParkLifeDetail, UpgradeStation } from "../types";
import type { WavePhase } from "../state";
import { ITEM_DEFINITIONS, type InventoryItemId, type LargeCarryItemId, type WorldItemId } from "../items";

interface HudRefs {
  health: HTMLElement;
  ammo: HTMLElement;
  reserve: HTMLElement;
  wave: HTMLElement;
  scrap: HTMLElement;
  zombies: HTMLElement;
  stamina: HTMLElement;
  hydration: HTMLElement;
  tools: HTMLElement;
  prompt: HTMLElement;
  upgrades: HTMLElement;
  status: HTMLElement;
  start: HTMLButtonElement;
  restart: HTMLButtonElement;
  overlay: HTMLElement;
  miniMap: HTMLCanvasElement;
}

export interface HudWeaponDrop {
  weaponId: WeaponId;
  label: string;
}

export interface HudBikeTarget {
  label: string;
  state?: "available" | "flat-tyres" | "locked";
}

export interface HudWorldItemTarget {
  itemId: WorldItemId;
  label: string;
}

export interface HudPlacedLadderTarget {
  label: string;
}

export interface HudUpdate {
  health: number;
  wave: number;
  scrap: number;
  zombieCount: number;
  loadout: Loadout;
  reloadProgress: number;
  playerHeight: number;
  activeFixtureId: string | null;
  nearestWeaponDrop: HudWeaponDrop | null;
  nearestBike: HudBikeTarget | null;
  nearestBrokenBike: ParkLifeDetail | null;
  nearestWorldItem: HudWorldItemTarget | null;
  nearestPlacedLadder: HudPlacedLadderTarget | null;
  nearestFixture: InteractableFixture | null;
  nearestAmenity: AmenityPoint | null;
  nearestStation: UpgradeStation | null;
  wavePhase: WavePhase;
  intermissionTimer: number;
  isCrouching: boolean;
  stamina: number;
  hydration: number;
  throwables: number;
  flashlightOn: boolean;
  inventory: InventoryItemId[];
  inventoryCapacity: number;
  carriedItem: LargeCarryItemId | null;
  bikePumpBoostRemaining: number;
  bikeMounted: boolean;
  skateboardMounted: boolean;
  injuryStatus: string | null;
  hydrationStatus: string | null;
  amenityPrompt: (amenity: AmenityPoint) => string;
}

export class HudController {
  static mount(root: HTMLElement): HudController {
    root.innerHTML = createMarkup();
    return new HudController(root);
  }

  private readonly refs: HudRefs;

  private constructor(root: HTMLElement) {
    this.refs = findHudRefs(root);
  }

  get startButton(): HTMLButtonElement {
    return this.refs.start;
  }

  get restartButton(): HTMLButtonElement {
    return this.refs.restart;
  }

  get miniMap(): HTMLCanvasElement {
    return this.refs.miniMap;
  }

  hideOverlay(): void {
    this.refs.overlay.classList.add("hidden");
  }

  setRestartVisible(visible: boolean): void {
    this.refs.restart.hidden = !visible;
  }

  setStatus(message: string): void {
    this.refs.status.textContent = message;
  }

  update(view: HudUpdate): void {
    const stats = getWeaponStats(view.loadout);
    this.refs.health.textContent = `${Math.max(0, Math.round(view.health))}`;
    this.refs.ammo.textContent = stats.kind === "melee" ? "MELEE" : `${view.loadout.ammoInMagazine}`;
    this.refs.reserve.textContent = stats.kind === "melee" ? "" : `${view.loadout.reserveAmmo}`;
    this.refs.wave.textContent = `${view.wave}`;
    this.refs.scrap.textContent = `${view.scrap}`;
    this.refs.zombies.textContent = `${view.zombieCount}`;
    this.refs.stamina.textContent = `${Math.round(view.stamina)}`;
    this.refs.hydration.textContent = `${Math.round(Math.max(0, 100 - view.hydration))}`;
    const pumpText = view.bikePumpBoostRemaining > 0 ? " pump" : "";
    const carried = view.carriedItem ? ` / ${view.carriedItem === "ladder" ? "ladder" : "board"}` : "";
    this.refs.tools.textContent = `${view.inventory.length}/${view.inventoryCapacity} inv / ${view.throwables} noise / ${view.flashlightOn ? "on" : "off"}${pumpText}${carried}`;

    if (stats.kind !== "melee" && view.loadout.reloadingUntil > performance.now() / 1000) {
      const percent = Math.round(view.reloadProgress * 100);
      this.refs.status.textContent =
        view.loadout.weaponId === "shotgun" ? `Loading shell ${percent}%` :
        view.loadout.weaponId === "flareGun" ? `Loading flare ${percent}%` :
        `Reloading ${percent}%`;
    } else if (view.bikeMounted) {
      this.refs.prompt.textContent = "E: dismount bike";
      this.refs.status.textContent = view.bikePumpBoostRemaining > 0 ? "Riding tuned bike" : "Riding hidden bike";
    } else if (view.skateboardMounted) {
      this.refs.prompt.textContent = "E: pick up skateboard";
      this.refs.status.textContent = "Skateboard rolling loud";
    } else if (view.nearestWorldItem) {
      this.refs.prompt.textContent = `X: pick up ${ITEM_DEFINITIONS[view.nearestWorldItem.itemId].label}`;
      this.refs.status.textContent = view.nearestWorldItem.label;
    } else if (view.nearestWeaponDrop) {
      this.refs.prompt.textContent = `E: pick up ${WEAPON_DEFINITIONS[view.nearestWeaponDrop.weaponId].name}`;
      this.refs.status.textContent = view.nearestWeaponDrop.label;
    } else if (view.nearestBike) {
      this.refs.prompt.textContent =
        view.nearestBike.state === "flat-tyres"
          ? "E: repair flat tyre"
          : view.nearestBike.state === "locked"
            ? "E: cut bike chain"
            : "E: ride bike";
      this.refs.status.textContent = view.nearestBike.label;
    } else if (view.nearestBrokenBike) {
      this.refs.prompt.textContent =
        view.nearestBrokenBike.bikeIssue === "flat-tyres"
          ? "E: inspect flat tyre"
          : view.nearestBrokenBike.bikeIssue === "locked"
            ? "E: inspect locked bike"
          : "E: inspect bike";
      this.refs.status.textContent = view.nearestBrokenBike.label;
    } else if (view.nearestFixture) {
      const active = view.activeFixtureId === view.nearestFixture.id;
      const ladderFixture = view.nearestFixture.accessKind === "ladder";
      const needsLadder = ladderFixture && view.carriedItem === "ladder" && !active;
      const placedLadder = ladderFixture && view.nearestPlacedLadder;
      this.refs.prompt.textContent = active
        ? `E: climb down from ${view.nearestFixture.label}`
        : needsLadder
          ? `E: place ladder at ${view.nearestFixture.label}`
          : placedLadder
            ? `E: climb ${view.nearestFixture.label} / X: remove ladder`
            : view.nearestFixture.prompt;
      this.refs.status.textContent = active ? `${view.nearestFixture.label} elevated` : view.nearestFixture.label;
    } else if (view.nearestPlacedLadder) {
      this.refs.prompt.textContent = "X: remove ladder";
      this.refs.status.textContent = view.nearestPlacedLadder.label;
    } else if (view.nearestAmenity) {
      this.refs.prompt.textContent = view.amenityPrompt(view.nearestAmenity);
      this.refs.status.textContent = view.nearestAmenity.label;
    } else if (view.nearestStation) {
      const upgrade = UPGRADE_DEFINITIONS[view.nearestStation.upgradeId];
      const current = view.loadout.upgrades[view.nearestStation.upgradeId];
      const maxed = current >= upgrade.maxLevel;
      const cost = upgradeCost(view.nearestStation.upgradeId, current);
      this.refs.prompt.textContent = maxed
        ? `${view.nearestStation.label}: ${upgrade.label} maxed`
        : `E: ${upgrade.label} (${cost} scrap)`;
      this.refs.status.textContent = view.nearestStation.label;
    } else if (view.wavePhase === "intermission") {
      this.refs.prompt.textContent = "";
      this.refs.status.textContent = `Regroup before wave ${view.wave + 1}: ${Math.ceil(view.intermissionTimer)}s`;
    } else {
      this.refs.prompt.textContent = "";
      const optic = stats.scopeZoom > 1.05 ? `, ${stats.scopeZoom.toFixed(1)}x optic` : "";
      const stance = view.isCrouching ? ", crouched" : "";
      const injury = view.injuryStatus ? `, ${view.injuryStatus.toLowerCase()}` : "";
      const thirst = view.hydrationStatus ? `, ${view.hydrationStatus.toLowerCase()}` : "";
      const light = view.flashlightOn ? ", light on" : ", light off";
      const pump = view.bikePumpBoostRemaining > 0 ? `, bike pump ${Math.ceil(view.bikePumpBoostRemaining)}s` : "";
      const carriedText = view.carriedItem ? `, carrying ${ITEM_DEFINITIONS[view.carriedItem].label}` : "";
      this.refs.status.textContent = `${stats.name}${optic}${stance}${injury}${thirst}${light}${pump}${carriedText}${view.playerHeight > 0.4 ? `, height ${view.playerHeight.toFixed(1)}m` : ""}`;
    }

    const weapons = view.loadout.inventory
      .map((weaponId, index) => `<span title="Press ${index + 1}">${index + 1}: ${WEAPON_DEFINITIONS[weaponId].name}</span>`)
      .join("");
    const upgrades = Object.values(UPGRADE_DEFINITIONS)
      .map((upgrade) => {
        const level = view.loadout.upgrades[upgrade.id];
        return `<span title="${upgrade.description}">${upgrade.label} ${level}/${upgrade.maxLevel}</span>`;
      })
      .join("");
    this.refs.upgrades.innerHTML = `${weapons}${upgrades}`;
  }

  flashStatus(message: string): void {
    this.refs.status.textContent = message;
    this.refs.status.classList.add("flash");
    window.setTimeout(() => this.refs.status.classList.remove("flash"), 180);
  }
}

function createMarkup(): string {
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
        <div class="meter stamina-meter"><span>Stamina</span><strong data-hud="stamina">100</strong></div>
        <div class="meter hydration-meter"><span>Thirst</span><strong data-hud="hydration">0</strong></div>
        <div class="meter tools-meter"><span>Tools</span><strong data-hud="tools">2 / on</strong></div>
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
          <p class="kicker">Fitzroy North, tram-lit rain</p>
          <h1>Edinburgh Gardens: Last Light</h1>
          <p class="brief">Hold W.T. Peterson Oval, move through bluestone paths and gum shadows, and use the park fixtures before the next wave finds you.</p>
          <div class="controls-grid" aria-label="Controls">
            <span><kbd>WASD</kbd><b>Move</b></span>
            <span><kbd>Mouse</kbd><b>Look</b></span>
            <span><kbd>Click</kbd><b>Fire</b></span>
            <span><kbd>Right</kbd><b>Scope</b></span>
            <span><kbd>R</kbd><b>Reload</b></span>
            <span><kbd>E</kbd><b>Interact</b></span>
            <span><kbd>Shift</kbd><b>Sprint</b></span>
            <span><kbd>C</kbd><b>Crouch</b></span>
            <span><kbd>F</kbd><b>Light</b></span>
            <span><kbd>G</kbd><b>Throw</b></span>
            <span><kbd>X</kbd><b>Take</b></span>
            <span><kbd>Q</kbd><b>Drop</b></span>
            <span><kbd>I</kbd><b>Inventory</b></span>
            <span><kbd>1-6</kbd><b>Weapons</b></span>
          </div>
          <button class="primary-action" data-action="start">Enter the gardens</button>
        </div>
      </section>
      <button class="restart-button" data-action="restart" hidden>Restart</button>
    </main>
  `;
}

function findHudRefs(root: HTMLElement): HudRefs {
  const find = <T extends HTMLElement>(selector: string) => {
    const node = root.querySelector<T>(selector);
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
    stamina: find('[data-hud="stamina"]'),
    hydration: find('[data-hud="hydration"]'),
    tools: find('[data-hud="tools"]'),
    prompt: find('[data-hud="prompt"]'),
    upgrades: find('[data-hud="upgrades"]'),
    status: find('[data-hud="status"]'),
    start: find('[data-action="start"]'),
    restart: find('[data-action="restart"]'),
    overlay: find('[data-hud="overlay"]'),
    miniMap: find(".mini-map")
  };
}
