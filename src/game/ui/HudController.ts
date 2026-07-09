import type { GameSettings } from "../gameSettings";
import type { IntermissionUpgradeChoice } from "../intermissionChoices";
import { ITEM_DEFINITIONS, type InventoryItemId, type LargeCarryItemId, type WorldItemId } from "../items";
import type { WavePhase } from "../state";
import type { AmenityPoint, InteractableFixture, ParkLifeDetail, UpgradeStation } from "../types";
import {
  UPGRADE_DEFINITIONS,
  WEAPON_DEFINITIONS,
  getWeaponStats,
  upgradeCost,
  type Loadout,
  type UpgradeId,
  type WeaponId
} from "../weapons";

interface HudRefs {
  health: HTMLElement;
  healthFill: HTMLElement;
  ammo: HTMLElement;
  reserve: HTMLElement;
  wave: HTMLElement;
  waveState: HTMLElement;
  waveCount: HTMLElement;
  waveProgress: HTMLElement;
  scrap: HTMLElement;
  stamina: HTMLElement;
  staminaFill: HTMLElement;
  hydration: HTMLElement;
  hydrationFill: HTMLElement;
  tools: HTMLElement;
  visibility: HTMLElement;
  visibilityFill: HTMLElement;
  noise: HTMLElement;
  noiseFill: HTMLElement;
  threat: HTMLElement;
  weather: HTMLElement;
  area: HTMLElement;
  prompt: HTMLElement;
  status: HTMLElement;
  inventory: HTMLElement;
  team: HTMLElement;
  intermission: HTMLElement;
  damage: HTMLElement;
  hitMarker: HTMLElement;
  start: HTMLButtonElement;
  restart: HTMLButtonElement;
  overlay: HTMLElement;
  pause: HTMLElement;
  pauseMode: HTMLElement;
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

export interface HudTeammate {
  id: string;
  name: string;
  health: number;
  stamina: number;
  distance: number;
  alive: boolean;
  weaponName: string;
}

export type HudThreatState = "quiet" | "searching" | "hunted";

export interface HudUpdate {
  health: number;
  wave: number;
  scrap: number;
  activeZombies: number;
  remainingSpawns: number;
  waveTotal: number;
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
  intermissionChoices: readonly IntermissionUpgradeChoice[];
  intermissionChoiceClaimed: boolean;
  isCrouching: boolean;
  stamina: number;
  hydration: number;
  throwables: number;
  flashlightOn: boolean;
  inventoryOpen: boolean;
  inventory: InventoryItemId[];
  inventoryCapacity: number;
  carriedItem: LargeCarryItemId | null;
  bikePumpBoostRemaining: number;
  bikeMounted: boolean;
  skateboardMounted: boolean;
  injuryStatus: string | null;
  hydrationStatus: string | null;
  visibility: number;
  noise: number;
  threat: HudThreatState;
  alertedZombies: number;
  weatherLabel: string;
  timeLabel: string;
  sheltered: boolean;
  areaLabel: string;
  damageDirection: number;
  damageActive: boolean;
  teammates: readonly HudTeammate[];
  amenityPrompt: (amenity: AmenityPoint) => string;
}

export interface HudActions {
  resume: () => void;
  restart: () => void;
  exitToMenu: () => void;
  chooseIntermissionUpgrade: (upgradeId: UpgradeId) => void;
  changeSettings: (settings: Partial<GameSettings>) => void;
}

export class HudController {
  static mount(root: HTMLElement, actions: HudActions, signal: AbortSignal): HudController {
    root.innerHTML = createMarkup();
    return new HudController(root, actions, signal);
  }

  private readonly refs: HudRefs;
  private teamSignature = "";
  private intermissionSignature = "";
  private hitMarkerTimer = 0;

  private constructor(
    private readonly root: HTMLElement,
    actions: HudActions,
    signal: AbortSignal
  ) {
    this.refs = findHudRefs(root);
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action],[data-upgrade-id]") : null;
      if (!target) return;
      if (target.dataset.action === "resume") actions.resume();
      if (target.dataset.action === "pause-restart") actions.restart();
      if (target.dataset.action === "exit-menu") actions.exitToMenu();
      if (target.dataset.upgradeId) actions.chooseIntermissionUpgrade(target.dataset.upgradeId as UpgradeId);
    }, { signal });
    root.addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.dataset.setting) return;
      if (input.dataset.setting === "highContrastHud") {
        actions.changeSettings({ highContrastHud: input.checked });
        return;
      }
      const value = Number(input.value);
      if (input.dataset.setting === "mouseSensitivity") actions.changeSettings({ mouseSensitivity: value });
      if (input.dataset.setting === "fieldOfView") actions.changeSettings({ fieldOfView: value });
      if (input.dataset.setting === "masterVolume") actions.changeSettings({ masterVolume: value });
    }, { signal });
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

  setPaused(paused: boolean, lanSession: boolean): void {
    this.refs.pause.hidden = !paused;
    this.refs.pause.setAttribute("aria-hidden", paused ? "false" : "true");
    this.refs.pauseMode.textContent = lanSession
      ? "Your controls are paused. The LAN session is still running."
      : "The gardens are holding still.";
    this.root.classList.toggle("is-paused", paused);
  }

  setSettings(settings: GameSettings): void {
    const setInput = (name: keyof GameSettings, value: number | boolean) => {
      const input = this.root.querySelector<HTMLInputElement>(`[data-setting="${name}"]`);
      if (!input) return;
      if (typeof value === "boolean") input.checked = value;
      else input.value = `${value}`;
    };
    setInput("mouseSensitivity", settings.mouseSensitivity);
    setInput("fieldOfView", settings.fieldOfView);
    setInput("masterVolume", settings.masterVolume);
    setInput("highContrastHud", settings.highContrastHud);
  }

  update(view: HudUpdate): void {
    const stats = getWeaponStats(view.loadout);
    const remainingEnemies = view.activeZombies + view.remainingSpawns;
    const waveProgress = view.wavePhase === "intermission"
      ? 1
      : 1 - remainingEnemies / Math.max(1, view.waveTotal);

    this.refs.health.textContent = `${Math.max(0, Math.round(view.health))}`;
    setMeter(this.refs.healthFill, view.health / 100);
    this.refs.ammo.textContent = stats.kind === "melee" ? "MELEE" : `${view.loadout.ammoInMagazine}`;
    this.refs.reserve.textContent = stats.kind === "melee" ? stats.name : `/ ${view.loadout.reserveAmmo}`;
    this.refs.wave.textContent = `${view.wave}`;
    this.refs.waveState.textContent = view.wavePhase === "intermission" ? "Regroup" : "Horde";
    this.refs.waveCount.textContent = view.wavePhase === "intermission"
      ? `${Math.ceil(view.intermissionTimer)}s`
      : `${remainingEnemies} remaining`;
    setMeter(this.refs.waveProgress, waveProgress);
    this.refs.scrap.textContent = `${view.scrap}`;
    this.refs.stamina.textContent = `${Math.round(view.stamina)}`;
    setMeter(this.refs.staminaFill, view.stamina / 100);
    const thirst = Math.max(0, 100 - view.hydration);
    this.refs.hydration.textContent = `${Math.round(thirst)}`;
    setMeter(this.refs.hydrationFill, thirst / 100);
    this.refs.tools.textContent = `${view.inventory.length}/${view.inventoryCapacity}`;
    this.refs.visibility.textContent = visibilityLabel(view.visibility);
    setMeter(this.refs.visibilityFill, view.visibility);
    this.refs.noise.textContent = noiseLabel(view.noise);
    setMeter(this.refs.noiseFill, view.noise);
    this.refs.threat.textContent = view.threat === "hunted"
      ? `${view.alertedZombies} alerted`
      : view.threat === "searching"
        ? "They are searching"
        : "Unnoticed";
    this.refs.threat.dataset.threat = view.threat;
    this.refs.weather.textContent = `${view.weatherLabel} · ${view.timeLabel}${view.sheltered ? " · sheltered" : ""}`;
    this.refs.area.textContent = view.areaLabel;
    this.refs.damage.style.setProperty("--damage-angle", `${view.damageDirection}rad`);
    this.refs.damage.classList.toggle("active", view.damageActive);

    this.refs.inventory.hidden = !view.inventoryOpen;
    this.refs.inventory.setAttribute("aria-hidden", view.inventoryOpen ? "false" : "true");
    if (view.inventoryOpen) this.refs.inventory.innerHTML = renderInventoryMenu(view);
    this.renderTeam(view.teammates);
    this.renderIntermissionChoices(view);
    this.updateContextStatus(view, stats.name);
  }

  flashStatus(message: string): void {
    this.refs.status.textContent = message;
    this.refs.status.classList.add("flash");
    window.setTimeout(() => this.refs.status.classList.remove("flash"), 180);
  }

  flashHit(kind: "hit" | "headshot" | "kill"): void {
    window.clearTimeout(this.hitMarkerTimer);
    this.refs.hitMarker.dataset.kind = kind;
    this.refs.hitMarker.classList.add("active");
    this.hitMarkerTimer = window.setTimeout(() => this.refs.hitMarker.classList.remove("active"), kind === "kill" ? 180 : 110);
  }

  private updateContextStatus(view: HudUpdate, weaponName: string): void {
    if (view.loadout.reloadingUntil > performance.now() / 1000) {
      const percent = Math.round(view.reloadProgress * 100);
      this.refs.status.textContent = view.loadout.weaponId === "shotgun"
        ? `Loading shell ${percent}%`
        : view.loadout.weaponId === "flareGun"
          ? `Loading flare ${percent}%`
          : `Reloading ${percent}%`;
    } else if (view.bikeMounted) {
      this.refs.prompt.textContent = "E  Dismount bike";
      this.refs.status.textContent = view.bikePumpBoostRemaining > 0 ? "Tuned bike" : "Bike";
    } else if (view.nearestWorldItem) {
      this.refs.prompt.textContent = `X  Take ${ITEM_DEFINITIONS[view.nearestWorldItem.itemId].label}`;
      this.refs.status.textContent = view.nearestWorldItem.label;
    } else if (view.nearestWeaponDrop) {
      this.refs.prompt.textContent = `X  Take ${WEAPON_DEFINITIONS[view.nearestWeaponDrop.weaponId].name}`;
      this.refs.status.textContent = view.nearestWeaponDrop.label;
    } else if (view.nearestBike) {
      this.refs.prompt.textContent = view.nearestBike.state === "flat-tyres"
        ? "E  Repair flat tyre"
        : view.nearestBike.state === "locked"
          ? "E  Cut bike chain"
          : "E  Ride bike";
      this.refs.status.textContent = view.nearestBike.label;
    } else if (view.nearestBrokenBike) {
      this.refs.prompt.textContent = "E  Inspect bike";
      this.refs.status.textContent = view.nearestBrokenBike.label;
    } else if (view.nearestFixture) {
      const active = view.activeFixtureId === view.nearestFixture.id;
      const ladderFixture = view.nearestFixture.accessKind === "ladder";
      const needsLadder = ladderFixture && view.carriedItem === "ladder" && !active;
      const placedLadder = ladderFixture && view.nearestPlacedLadder;
      this.refs.prompt.textContent = active
        ? `E  Climb down from ${view.nearestFixture.label}`
        : needsLadder
          ? `E  Place ladder at ${view.nearestFixture.label}`
          : placedLadder
            ? `E  Climb ${view.nearestFixture.label} · X  Remove ladder`
            : view.nearestFixture.prompt.replace(":", " ");
      this.refs.status.textContent = view.nearestFixture.label;
    } else if (view.nearestPlacedLadder) {
      this.refs.prompt.textContent = "X  Remove ladder";
      this.refs.status.textContent = view.nearestPlacedLadder.label;
    } else if (view.nearestAmenity) {
      this.refs.prompt.textContent = view.amenityPrompt(view.nearestAmenity).replace(":", " ");
      this.refs.status.textContent = view.nearestAmenity.label;
    } else if (view.nearestStation) {
      const upgrade = UPGRADE_DEFINITIONS[view.nearestStation.upgradeId];
      const current = view.loadout.upgrades[view.nearestStation.upgradeId];
      this.refs.prompt.textContent = current >= upgrade.maxLevel
        ? `${upgrade.label} maxed`
        : `E  ${upgrade.label} · ${upgradeCost(view.nearestStation.upgradeId, current)} scrap`;
      this.refs.status.textContent = view.nearestStation.label;
    } else if (view.skateboardMounted) {
      this.refs.prompt.textContent = "V  Step off skateboard";
      this.refs.status.textContent = "Skateboard · loud";
    } else if (view.carriedItem === "skateboard") {
      this.refs.prompt.textContent = "V  Ride skateboard";
      this.refs.status.textContent = "Carrying skateboard";
    } else {
      this.refs.prompt.textContent = "";
      const conditions = [
        view.isCrouching ? "crouched" : "",
        view.injuryStatus?.toLowerCase() ?? "",
        view.hydrationStatus?.toLowerCase() ?? "",
        view.flashlightOn ? "light on" : "light off"
      ].filter(Boolean);
      this.refs.status.textContent = `${weaponName}${conditions.length ? ` · ${conditions.join(" · ")}` : ""}`;
    }
  }

  private renderTeam(teammates: readonly HudTeammate[]): void {
    const signature = teammates.map((teammate) => `${teammate.id}:${Math.round(teammate.health)}:${Math.round(teammate.distance)}:${teammate.weaponName}`).join("|");
    if (signature === this.teamSignature) return;
    this.teamSignature = signature;
    this.refs.team.hidden = teammates.length === 0;
    this.refs.team.innerHTML = teammates.map((teammate) => `
      <article class="team-member${teammate.alive ? "" : " down"}">
        <span class="team-initial">${escapeHtml(initials(teammate.name))}</span>
        <div><strong>${escapeHtml(teammate.name)}</strong><small>${teammate.alive ? `${Math.round(teammate.distance)}m · ${escapeHtml(teammate.weaponName)}` : "Down"}</small></div>
        <b>${Math.max(0, Math.round(teammate.health))}</b>
        <i style="--meter-value:${clamp01(teammate.health / 100)}"></i>
      </article>
    `).join("");
  }

  private renderIntermissionChoices(view: HudUpdate): void {
    const visible = view.wavePhase === "intermission" && !view.intermissionChoiceClaimed && view.intermissionChoices.length > 0;
    const signature = visible
      ? `${view.wave}:${view.intermissionChoices.map((choice) => `${choice.id}:${choice.level}`).join("|")}`
      : "hidden";
    if (signature === this.intermissionSignature) return;
    this.intermissionSignature = signature;
    this.refs.intermission.hidden = !visible;
    this.refs.intermission.innerHTML = visible ? `
      <header><span>Field modification</span><strong>Choose one free upgrade</strong></header>
      <div class="intermission-choices">
        ${view.intermissionChoices.map((choice, index) => `
          <button type="button" data-upgrade-id="${choice.id}">
            <kbd>${index + 1}</kbd>
            <span>${escapeHtml(choice.label)}</span>
            <small>${escapeHtml(choice.description)}</small>
            <b>${choice.nextLevel}/${choice.maxLevel}</b>
          </button>
        `).join("")}
      </div>
    ` : "";
  }
}

function renderInventoryMenu(view: HudUpdate): string {
  const slots = view.inventory.length > 0
    ? view.inventory.map((itemId, index) => `<li class="inventory-slot"><b>T${index + 1}</b><span>${ITEM_DEFINITIONS[itemId].label}</span></li>`).join("")
    : `<li class="inventory-slot empty"><b>T</b><span>No tools carried</span></li>`;
  const carried = view.carriedItem ? ITEM_DEFINITIONS[view.carriedItem] : null;
  return `
    <header class="inventory-header"><div><span>Inventory</span><strong>${view.inventory.length}/${view.inventoryCapacity} tools</strong></div><kbd>I</kbd></header>
    ${renderWeaponInventory(view.loadout)}
    <ul class="inventory-slots">${slots}</ul>
    <section class="inventory-upgrades">
      <div class="inventory-section-title"><span>Field modifications</span><strong>${Object.values(view.loadout.upgrades).reduce((sum, level) => sum + level, 0)}</strong></div>
      <p>${Object.values(UPGRADE_DEFINITIONS).map((upgrade) => `${upgrade.label} ${view.loadout.upgrades[upgrade.id]}/${upgrade.maxLevel}`).join(" · ")}</p>
    </section>
    <div class="inventory-object-grid">
      <span><b>Hands</b><strong>${carried ? carried.label : view.skateboardMounted ? "Skateboard" : "Free"}</strong></span>
      <span><b>Lures</b><strong>${view.throwables}</strong></span>
      <span><b>Light</b><strong>${view.flashlightOn ? "On" : "Off"}</strong></span>
    </div>
  `;
}

function renderWeaponInventory(loadout: Loadout): string {
  const weapons = loadout.inventory.map((weaponId, index) => {
    const stats = getWeaponStats({ ...loadout, weaponId });
    const active = loadout.weaponId === weaponId;
    const ammo = stats.kind === "melee" ? "MELEE" : `${Math.min(loadout.magazines[weaponId] ?? 0, stats.magazineSize)}/${stats.magazineSize}`;
    return `<li class="inventory-weapon${active ? " active" : ""}"><b>${index + 1}</b><span>${WEAPON_DEFINITIONS[weaponId].name}</span><strong>${ammo}</strong></li>`;
  }).join("");
  return `<section class="inventory-weapons"><div class="inventory-section-title"><span>Weapons</span><strong>${loadout.inventory.length}</strong></div><ul>${weapons}</ul></section>`;
}

function createMarkup(): string {
  return `
    <main class="shell">
      <canvas class="game-canvas" aria-label="First person zombie shooter set in Edinburgh Gardens"></canvas>
      <div class="vignette" aria-hidden="true"></div>
      <div class="damage-indicator" data-hud="damage" aria-hidden="true"></div>
      <div class="crosshair" aria-hidden="true"><span></span><span></span><i class="hit-marker" data-hud="hit-marker"></i></div>
      <div class="scope-overlay" aria-hidden="true"><span></span><span></span><i></i></div>

      <section class="hud top-hud survival-hud" aria-label="Survivor status">
        <div class="primary-vital health-vital"><span>Health</span><strong data-hud="health">100</strong><i data-hud="health-fill"></i></div>
        <div class="compact-vitals">
          <span><b>Stamina</b><strong data-hud="stamina">100</strong><i data-hud="stamina-fill"></i></span>
          <span><b>Thirst</b><strong data-hud="hydration">0</strong><i data-hud="hydration-fill"></i></span>
        </div>
        <div class="resource-line"><span>Scrap <b data-hud="scrap">70</b></span><span>Tools <b data-hud="tools">0/3</b></span></div>
      </section>

      <section class="hud wave-hud" aria-label="Wave progress">
        <header><span data-hud="wave-state">Horde</span><strong>Wave <b data-hud="wave">1</b></strong><span data-hud="wave-count">9 remaining</span></header>
        <i data-hud="wave-progress"></i>
        <small data-hud="weather">Low cloud · 05:45</small>
      </section>

      <section class="hud stealth-hud" aria-label="Stealth status">
        <strong data-hud="threat" data-threat="quiet">Unnoticed</strong>
        <span><b>Visibility</b><em data-hud="visibility">Low</em><i data-hud="visibility-fill"></i></span>
        <span><b>Noise</b><em data-hud="noise">Quiet</em><i data-hud="noise-fill"></i></span>
      </section>

      <section class="hud team-hud" data-hud="team" aria-label="Co-op team" hidden></section>
      <section class="hud weapon-hud" aria-label="Weapon status">
        <div class="ammo"><strong data-hud="ammo">MELEE</strong><span data-hud="reserve">Emergency knife</span></div>
        <div class="status-line" data-hud="status">Emergency knife · light on</div>
      </section>

      <section class="inventory-menu" data-hud="inventory" aria-label="Inventory" aria-hidden="true" hidden></section>
      <section class="mini-map-shell" aria-label="Park map">
        <header><span data-hud="area">Edinburgh Gardens</span><b>N</b></header>
        <canvas class="mini-map" width="240" height="240" aria-label="Mini map"></canvas>
        <footer><span class="legend-threat">Threat</span><span class="legend-supply">Supply</span><span class="legend-team">Team</span></footer>
      </section>
      <div class="interaction-prompt" data-hud="prompt"></div>
      <section class="intermission-panel" data-hud="intermission" aria-live="polite" hidden></section>

      <section class="start-overlay" data-hud="overlay">
        <div class="start-panel">
          <p class="kicker">Fitzroy North · Predawn</p>
          <h1>Enter the gardens</h1>
          <p class="brief">Stay quiet, search the park, and survive each horde. Weather, light, and every surface change what the dead can hear and see.</p>
          <div class="starter-controls" aria-label="Essential controls">
            <span><kbd>WASD</kbd><b>Move</b></span><span><kbd>Mouse</kbd><b>Look</b></span><span><kbd>Click</kbd><b>Attack</b></span><span><kbd>E</kbd><b>Use</b></span>
          </div>
          <p class="start-tip">Crouch on grass to stay hidden. Press <kbd>Esc</kbd> at any time for controls and settings.</p>
          <button class="primary-action" data-action="start">Start wave one</button>
        </div>
      </section>

      <section class="pause-menu" data-hud="pause" aria-label="Paused game" aria-hidden="true" hidden>
        <div class="pause-panel">
          <header><p class="kicker">Edinburgh Gardens 2030</p><h2>Paused</h2><p data-hud="pause-mode">The gardens are holding still.</p></header>
          <div class="pause-actions"><button class="primary-action" type="button" data-action="resume">Resume</button><button class="secondary-action" type="button" data-action="pause-restart">Restart run</button></div>
          <section class="settings-panel" aria-label="Game settings">
            <label><span>Mouse sensitivity</span><input type="range" min="0.45" max="2" step="0.05" data-setting="mouseSensitivity"></label>
            <label><span>Field of view</span><input type="range" min="60" max="95" step="1" data-setting="fieldOfView"></label>
            <label><span>Volume</span><input type="range" min="0" max="1" step="0.05" data-setting="masterVolume"></label>
            <label class="toggle-setting"><span>High-contrast HUD</span><input type="checkbox" data-setting="highContrastHud"></label>
          </section>
          <details class="control-reference"><summary>Controls</summary><p><b>WASD</b> move · <b>Shift</b> sprint · <b>C</b> crouch · <b>Space</b> jump · <b>Click</b> attack · <b>Right click</b> aim · <b>R</b> reload · <b>E</b> use · <b>X</b> take · <b>Q</b> drop · <b>F</b> light · <b>G</b> throw · <b>I</b> inventory · <b>V</b> skateboard · <b>1–6</b> weapons</p></details>
          <button class="text-action" type="button" data-action="exit-menu">Exit to main menu</button>
        </div>
      </section>
      <button class="restart-button" data-action="restart" hidden>Restart run</button>
    </main>
  `;
}

function findHudRefs(root: HTMLElement): HudRefs {
  const find = <T extends HTMLElement>(selector: string) => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`Missing HUD element ${selector}`);
    return node;
  };
  return {
    health: find('[data-hud="health"]'), healthFill: find('[data-hud="health-fill"]'),
    ammo: find('[data-hud="ammo"]'), reserve: find('[data-hud="reserve"]'),
    wave: find('[data-hud="wave"]'), waveState: find('[data-hud="wave-state"]'), waveCount: find('[data-hud="wave-count"]'), waveProgress: find('[data-hud="wave-progress"]'),
    scrap: find('[data-hud="scrap"]'), stamina: find('[data-hud="stamina"]'), staminaFill: find('[data-hud="stamina-fill"]'),
    hydration: find('[data-hud="hydration"]'), hydrationFill: find('[data-hud="hydration-fill"]'), tools: find('[data-hud="tools"]'),
    visibility: find('[data-hud="visibility"]'), visibilityFill: find('[data-hud="visibility-fill"]'), noise: find('[data-hud="noise"]'), noiseFill: find('[data-hud="noise-fill"]'), threat: find('[data-hud="threat"]'),
    weather: find('[data-hud="weather"]'), area: find('[data-hud="area"]'), prompt: find('[data-hud="prompt"]'), status: find('[data-hud="status"]'),
    inventory: find('[data-hud="inventory"]'), team: find('[data-hud="team"]'), intermission: find('[data-hud="intermission"]'), damage: find('[data-hud="damage"]'), hitMarker: find('[data-hud="hit-marker"]'),
    start: find('[data-action="start"]'), restart: find('[data-action="restart"]'), overlay: find('[data-hud="overlay"]'), pause: find('[data-hud="pause"]'), pauseMode: find('[data-hud="pause-mode"]'), miniMap: find('.mini-map')
  };
}

function setMeter(element: HTMLElement, value: number): void {
  element.style.setProperty("--meter-value", `${clamp01(value)}`);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function visibilityLabel(value: number): string {
  return value < 0.38 ? "Hidden" : value < 0.68 ? "Dim" : value < 0.92 ? "Visible" : "Exposed";
}

function noiseLabel(value: number): string {
  return value < 0.16 ? "Quiet" : value < 0.42 ? "Soft" : value < 0.72 ? "Loud" : "Extreme";
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
