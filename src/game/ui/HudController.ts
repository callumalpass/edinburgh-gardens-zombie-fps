import type { GameSettings } from "../gameSettings";
import {
  INPUT_ACTION_DEFINITIONS,
  bindingLabel,
  type InputAction,
  type InputBindings
} from "../input/inputBindings";
import type { IntermissionUpgradeChoice } from "../intermissionChoices";
import { ITEM_DEFINITIONS, isQuestItem, type InventoryItemId, type LargeCarryItemId, type WorldItemId } from "../items";
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
  objective: HTMLElement;
  objectiveCopy: HTMLElement;
  inventory: HTMLElement;
  team: HTMLElement;
  intermission: HTMLElement;
  damage: HTMLElement;
  hitMarker: HTMLElement;
  start: HTMLButtonElement;
  restart: HTMLButtonElement;
  outcome: HTMLElement;
  outcomeKicker: HTMLElement;
  outcomeTitle: HTMLElement;
  outcomeCopy: HTMLElement;
  outcomeWave: HTMLElement;
  outcomeCount: HTMLElement;
  outcomeTeam: HTMLElement;
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
  vehicleKind?: "bike" | "maintenance-cart";
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
  mountedVehicleKind: "bike" | "maintenance-cart" | null;
  scenarioObjective: string | null;
  scenarioAction: { label: string; action: string } | null;
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
  waitingForRevive: boolean;
  bindings: InputBindings;
}

export interface HudActions {
  resume: () => void;
  restart: () => void;
  exitToMenu: () => void;
  chooseIntermissionUpgrade: (upgradeId: UpgradeId) => void;
  changeSettings: (settings: Partial<GameSettings>) => void;
  equipWeaponSlot: (index: number) => void;
  changeBinding: (action: InputAction, code: string) => void;
  resetBindings: () => void;
  closeInventory: () => void;
}

export class HudController {
  static mount(root: HTMLElement, actions: HudActions, signal: AbortSignal): HudController {
    root.innerHTML = createMarkup();
    return new HudController(root, actions, signal);
  }

  private readonly refs: HudRefs;
  private teamSignature = "";
  private intermissionSignature = "";
  private inventorySignature = "";
  private outcomeMode: "downed" | "gameover" | null = null;
  private hitMarkerTimer = 0;
  private rebindingAction: InputAction | null = null;

  private constructor(
    private readonly root: HTMLElement,
    actions: HudActions,
    signal: AbortSignal
  ) {
    this.refs = findHudRefs(root);
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-action],[data-upgrade-id],[data-weapon-slot],[data-binding-action]")
        : null;
      if (!target) return;
      if (target.dataset.action === "resume") actions.resume();
      if (target.dataset.action === "pause-restart") actions.restart();
      if (target.dataset.action === "exit-menu") actions.exitToMenu();
      if (target.dataset.action === "reset-bindings") actions.resetBindings();
      if (target.dataset.action === "close-inventory") actions.closeInventory();
      if (target.dataset.weaponSlot) actions.equipWeaponSlot(Number(target.dataset.weaponSlot));
      if (target.dataset.bindingAction) {
        this.rebindingAction = target.dataset.bindingAction as InputAction;
        this.renderBindingCaptureState();
      }
      if (target.dataset.upgradeId) actions.chooseIntermissionUpgrade(target.dataset.upgradeId as UpgradeId);
    }, { signal });
    root.addEventListener("keydown", (event) => {
      if (!this.rebindingAction) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        this.rebindingAction = null;
        this.renderBindingCaptureState();
        return;
      }
      const action = this.rebindingAction;
      this.rebindingAction = null;
      actions.changeBinding(action, event.code);
    }, { signal, capture: true });
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

  clearOutcome(): void {
    this.outcomeMode = null;
    this.refs.outcome.hidden = true;
    this.refs.outcome.setAttribute("aria-hidden", "true");
    this.refs.restart.hidden = true;
    this.root.classList.remove("is-downed", "is-gameover");
  }

  showGameOver(wave: number): void {
    this.outcomeMode = "gameover";
    this.refs.outcome.hidden = false;
    this.refs.outcome.setAttribute("aria-hidden", "false");
    this.refs.outcome.dataset.mode = "gameover";
    this.refs.outcomeKicker.textContent = "Squad wiped";
    this.refs.outcomeTitle.textContent = "The gardens are overrun";
    this.refs.outcomeCopy.textContent = "No survivors made it to the regroup. Start a new run and try another route through the park.";
    this.refs.outcomeWave.textContent = `Wave ${wave}`;
    this.refs.outcomeCount.textContent = "Run ended";
    this.refs.outcomeTeam.textContent = "No revival available";
    this.refs.restart.hidden = false;
    this.root.classList.remove("is-downed");
    this.root.classList.add("is-gameover");
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

  setBindings(bindings: InputBindings): void {
    for (const definition of INPUT_ACTION_DEFINITIONS) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-binding-action="${definition.action}"]`);
      if (button) button.textContent = bindingLabel(bindings, definition.action);
    }
    this.renderBindingCaptureState();
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
    const occupiedToolSlots = view.inventory.filter((itemId) => !isQuestItem(itemId)).length;
    this.refs.tools.textContent = `${occupiedToolSlots}/${view.inventoryCapacity}`;
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
    this.refs.objective.hidden = !view.scenarioObjective;
    this.refs.objectiveCopy.textContent = view.scenarioObjective ?? "";
    this.refs.damage.style.setProperty("--damage-angle", `${view.damageDirection}rad`);
    this.refs.damage.classList.toggle("active", view.damageActive);

    this.refs.inventory.hidden = !view.inventoryOpen;
    this.refs.inventory.setAttribute("aria-hidden", view.inventoryOpen ? "false" : "true");
    if (view.inventoryOpen) {
      const inventorySignature = JSON.stringify({
        weapons: view.loadout.inventory,
        magazines: view.loadout.magazines,
        upgrades: view.loadout.upgrades,
        tools: view.inventory,
        carried: view.carriedItem,
        bike: view.bikeMounted,
        skateboard: view.skateboardMounted,
        lures: view.throwables,
        light: view.flashlightOn,
        bindings: view.bindings
      });
      if (inventorySignature !== this.inventorySignature) {
        this.inventorySignature = inventorySignature;
        this.refs.inventory.innerHTML = renderInventoryMenu(view);
      }
      patchInventorySelection(this.refs.inventory, view.loadout);
    } else {
      this.inventorySignature = "";
    }
    this.renderTeam(view.teammates);
    this.renderIntermissionChoices(view);
    this.renderOutcome(view);
    this.updateContextStatus(view, stats.name);
    this.setBindings(view.bindings);
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
    const key = (action: InputAction) => bindingLabel(view.bindings, action);
    if (view.loadout.reloadingUntil > performance.now() / 1000) {
      const percent = Math.round(view.reloadProgress * 100);
      this.refs.status.textContent = view.loadout.weaponId === "shotgun"
        ? `Loading shell ${percent}%`
        : view.loadout.weaponId === "flareGun"
          ? `Loading flare ${percent}%`
          : `Reloading ${percent}%`;
    } else if (view.bikeMounted) {
      this.refs.prompt.textContent = `${key("interact")}  ${view.mountedVehicleKind === "maintenance-cart" ? "Park cart" : "Dismount bike"}`;
      this.refs.status.textContent = view.mountedVehicleKind === "maintenance-cart" ? "Maintenance cart" : view.bikePumpBoostRemaining > 0 ? "Tuned bike" : "Bike";
    } else if (view.scenarioAction) {
      this.refs.prompt.textContent = `${key("interact")}  ${view.scenarioAction.action}`;
      this.refs.status.textContent = view.scenarioAction.label;
    } else if (view.nearestWorldItem) {
      this.refs.prompt.textContent = `${key("take")}  Take ${ITEM_DEFINITIONS[view.nearestWorldItem.itemId].label}`;
      this.refs.status.textContent = view.nearestWorldItem.label;
    } else if (view.nearestWeaponDrop) {
      this.refs.prompt.textContent = `${key("take")}  Take ${WEAPON_DEFINITIONS[view.nearestWeaponDrop.weaponId].name}`;
      this.refs.status.textContent = view.nearestWeaponDrop.label;
    } else if (view.nearestBike) {
      this.refs.prompt.textContent = view.nearestBike.vehicleKind === "maintenance-cart"
        ? `${key("interact")}  ${view.nearestBike.state === "available" ? "Drive maintenance cart" : "Inspect maintenance cart"}`
        : view.nearestBike.state === "flat-tyres"
          ? `${key("interact")}  Repair flat tyre`
        : view.nearestBike.state === "locked"
          ? `${key("interact")}  Cut bike chain`
          : `${key("interact")}  Ride bike`;
      this.refs.status.textContent = view.nearestBike.label;
    } else if (view.nearestBrokenBike) {
      this.refs.prompt.textContent = `${key("interact")}  Inspect bike`;
      this.refs.status.textContent = view.nearestBrokenBike.label;
    } else if (view.nearestFixture) {
      const active = view.activeFixtureId === view.nearestFixture.id;
      const ladderFixture = view.nearestFixture.accessKind === "ladder";
      const needsLadder = ladderFixture && view.carriedItem === "ladder" && !active;
      const placedLadder = ladderFixture && view.nearestPlacedLadder;
      this.refs.prompt.textContent = active
        ? `${key("interact")}  Climb down from ${view.nearestFixture.label}`
        : needsLadder
          ? `${key("interact")}  Place ladder at ${view.nearestFixture.label}`
          : placedLadder
            ? `${key("interact")}  Climb ${view.nearestFixture.label} · ${key("take")}  Remove ladder`
            : view.nearestFixture.prompt.replace(":", " ");
      this.refs.status.textContent = view.nearestFixture.label;
    } else if (view.nearestPlacedLadder) {
      this.refs.prompt.textContent = `${key("take")}  Remove ladder`;
      this.refs.status.textContent = view.nearestPlacedLadder.label;
    } else if (view.nearestAmenity) {
      this.refs.prompt.textContent = view.amenityPrompt(view.nearestAmenity).replace(":", " ");
      this.refs.status.textContent = view.nearestAmenity.label;
    } else if (view.nearestStation) {
      const upgrade = UPGRADE_DEFINITIONS[view.nearestStation.upgradeId];
      const current = view.loadout.upgrades[view.nearestStation.upgradeId];
      this.refs.prompt.textContent = current >= upgrade.maxLevel
        ? `${upgrade.label} maxed`
        : `${key("interact")}  ${upgrade.label} · ${upgradeCost(view.nearestStation.upgradeId, current)} scrap`;
      this.refs.status.textContent = view.nearestStation.label;
    } else if (view.skateboardMounted) {
      this.refs.prompt.textContent = `${key("skateboard")}  Step off skateboard`;
      this.refs.status.textContent = "Skateboard · loud";
    } else if (view.carriedItem === "skateboard") {
      this.refs.prompt.textContent = `${key("skateboard")}  Ride skateboard`;
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

  private renderBindingCaptureState(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-binding-action]")) {
      const capturing = button.dataset.bindingAction === this.rebindingAction;
      button.classList.toggle("is-capturing", capturing);
      button.setAttribute("aria-pressed", capturing ? "true" : "false");
      if (capturing) {
        button.textContent = "Press a key";
        button.focus();
      }
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

  private renderOutcome(view: HudUpdate): void {
    if (!view.waitingForRevive) {
      if (this.outcomeMode === "downed") this.clearOutcome();
      return;
    }
    const standing = view.teammates.filter((teammate) => teammate.alive).length;
    const remaining = view.activeZombies + view.remainingSpawns;
    this.outcomeMode = "downed";
    this.refs.outcome.hidden = false;
    this.refs.outcome.setAttribute("aria-hidden", "false");
    this.refs.outcome.dataset.mode = "downed";
    this.refs.outcomeKicker.textContent = "Down, not out";
    this.refs.outcomeTitle.textContent = "Waiting for the wave to end";
    this.refs.outcomeCopy.textContent = "You will return for the regroup if one teammate survives.";
    this.refs.outcomeWave.textContent = `Wave ${view.wave}`;
    this.refs.outcomeCount.textContent = remaining === 1 ? "1 infected remaining" : `${remaining} infected remaining`;
    this.refs.outcomeTeam.textContent = standing === 1 ? "1 teammate still standing" : `${standing} teammates still standing`;
    this.refs.restart.hidden = true;
    this.root.classList.add("is-downed");
    this.root.classList.remove("is-gameover");
  }
}

function renderInventoryMenu(view: HudUpdate): string {
  const slots = view.inventory.length > 0
    ? view.inventory.map((itemId, index) => `<li class="inventory-slot"><b>T${index + 1}</b><span>${ITEM_DEFINITIONS[itemId].label}</span></li>`).join("")
    : `<li class="inventory-slot empty"><b>T</b><span>No tools carried</span></li>`;
  const carried = view.carriedItem ? ITEM_DEFINITIONS[view.carriedItem] : null;
  const stats = getWeaponStats(view.loadout);
  const transport = view.mountedVehicleKind === "maintenance-cart"
    ? "Maintenance cart"
    : view.bikeMounted
      ? "Bicycle"
      : view.skateboardMounted
        ? "Skateboard"
        : "On foot";
  const modifications = Object.values(UPGRADE_DEFINITIONS).map((upgrade) => {
    const level = view.loadout.upgrades[upgrade.id];
    return `<li><span><b>${escapeHtml(upgrade.label)}</b><small>${escapeHtml(upgrade.description)}</small></span><strong>${level}/${upgrade.maxLevel}</strong></li>`;
  }).join("");
  return `
    <header class="inventory-header"><div><span>Field bag</span><strong>${WEAPON_DEFINITIONS[view.loadout.weaponId].name}</strong></div><button class="inventory-close" type="button" data-action="close-inventory">Close <kbd>${bindingLabel(view.bindings, "inventory")}</kbd></button></header>
    <div class="inventory-workbench">
      <div class="inventory-rail">
        ${renderWeaponInventory(view.loadout)}
        <div class="inventory-section-title"><span>Tools</span><strong>${view.inventory.filter((itemId) => !isQuestItem(itemId)).length}/${view.inventoryCapacity}</strong></div>
        <ul class="inventory-slots">${slots}</ul>
      </div>
      <section class="inventory-detail" aria-label="Equipped weapon details">
        <span class="inventory-eyebrow">Equipped</span>
        <h3>${escapeHtml(stats.name)}</h3>
        <p>${stats.kind === "melee" ? "Quiet close-range fallback" : `${stats.magazineSize}-round ${stats.reloadStyle === "single" ? "single-load" : "magazine"} firearm`}</p>
        <dl>
          <div><dt>Damage</dt><dd>${Math.round(stats.damage * stats.pellets)}</dd></div>
          <div><dt>Range</dt><dd>${Math.round(stats.range)}m</dd></div>
          <div><dt>Cycle</dt><dd>${stats.fireDelay.toFixed(2)}s</dd></div>
          <div><dt>Noise</dt><dd>${stats.noiseMultiplier < 0.4 ? "Low" : stats.noiseMultiplier < 1.15 ? "Medium" : "High"}</dd></div>
        </dl>
        <div class="inventory-section-title"><span>Field modifications</span><strong>${Object.values(view.loadout.upgrades).reduce((sum, level) => sum + level, 0)}</strong></div>
        <ul class="inventory-modifications">${modifications}</ul>
      </section>
    </div>
    <div class="inventory-object-grid">
      <span><b>Carried gear</b><strong>${carried ? carried.label : "None"}</strong></span>
      <span><b>Transport</b><strong>${transport}</strong></span>
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
    return `<li><button type="button" data-weapon-slot="${index}" class="inventory-weapon${active ? " active" : ""}" aria-pressed="${active}"><b>${index + 1}</b><span>${WEAPON_DEFINITIONS[weaponId].name}</span><strong>${ammo}</strong></button></li>`;
  }).join("");
  return `<section class="inventory-weapons"><div class="inventory-section-title"><span>Weapons</span><strong>${loadout.inventory.length}</strong></div><ul>${weapons}</ul></section>`;
}

function patchInventorySelection(root: HTMLElement, loadout: Loadout): void {
  const stats = getWeaponStats(loadout);
  const header = root.querySelector<HTMLElement>(".inventory-header strong");
  if (header) header.textContent = stats.name;
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-weapon-slot]")) {
    const index = Number(button.dataset.weaponSlot);
    const active = loadout.inventory[index] === loadout.weaponId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", `${active}`);
  }
  const detail = root.querySelector<HTMLElement>(".inventory-detail");
  if (!detail) return;
  const title = detail.querySelector<HTMLElement>("h3");
  const summary = detail.querySelector<HTMLElement>("p");
  if (title) title.textContent = stats.name;
  if (summary) {
    summary.textContent = stats.kind === "melee"
      ? "Quiet close-range fallback"
      : `${stats.magazineSize}-round ${stats.reloadStyle === "single" ? "single-load" : "magazine"} firearm`;
  }
  const values = detail.querySelectorAll<HTMLElement>("dl dd");
  const nextValues = [
    `${Math.round(stats.damage * stats.pellets)}`,
    `${Math.round(stats.range)}m`,
    `${stats.fireDelay.toFixed(2)}s`,
    stats.noiseMultiplier < 0.4 ? "Low" : stats.noiseMultiplier < 1.15 ? "Medium" : "High"
  ];
  values.forEach((value, index) => { value.textContent = nextValues[index] ?? ""; });
}

function renderBindingSettings(): string {
  return ["Movement", "Combat", "Field actions", "Weapons"].map((group) => `
    <section class="binding-group">
      <h3>${group}</h3>
      ${INPUT_ACTION_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => `
        <div><span>${definition.label}</span><button type="button" data-binding-action="${definition.action}" aria-pressed="false"></button></div>
      `).join("")}
    </section>
  `).join("");
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
      <section class="hud quest-ribbon" data-hud="objective" aria-label="Current rescue objective" aria-live="polite" hidden>
        <span>Park rescue</span><strong data-hud="objective-copy"></strong>
      </section>
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

      <section class="touch-controls" aria-label="Touch game controls">
        <div class="touch-look-zone" data-touch-look aria-label="Drag to look"></div>
        <div class="touch-movement">
          <div class="touch-stick" data-touch-stick aria-label="Movement joystick"><span></span></div>
          <button type="button" data-touch-action="sprint">Run</button>
          <button type="button" data-touch-action="crouch">Crouch</button>
        </div>
        <div class="touch-actions touch-actions-primary">
          <button class="touch-fire" type="button" data-touch-action="fire">Attack</button>
          <button type="button" data-touch-action="aim">Aim</button>
          <button class="touch-context" type="button" data-touch-action="interact">Use</button>
          <button type="button" data-touch-action="take">Take</button>
          <button type="button" data-touch-action="jump">Jump</button>
          <button type="button" data-touch-action="reload">Reload</button>
        </div>
        <div class="touch-actions touch-actions-utility">
          <button type="button" data-touch-action="weapon">Weapon</button>
          <button type="button" data-touch-action="inventory">Bag</button>
          <button type="button" data-touch-action="flashlight">Light</button>
          <button type="button" data-touch-action="throw">Lure</button>
          <button type="button" data-touch-action="skateboard">Board</button>
        </div>
      </section>

      <section class="outcome-overlay" data-hud="outcome" data-mode="downed" role="status" aria-live="polite" aria-hidden="true" hidden>
        <div class="outcome-panel">
          <p class="kicker" data-hud="outcome-kicker">Down, not out</p>
          <h2 data-hud="outcome-title">Waiting for the wave to end</h2>
          <p class="outcome-copy" data-hud="outcome-copy">You will return for the regroup if one teammate survives.</p>
          <div class="outcome-progress" aria-label="Current wave status">
            <span data-hud="outcome-wave">Wave 1</span>
            <strong data-hud="outcome-count">Infected remaining</strong>
          </div>
          <p class="outcome-team" data-hud="outcome-team">Teammates still standing</p>
          <button class="restart-button" data-action="restart" hidden>Restart run</button>
        </div>
      </section>

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
          <details class="control-reference"><summary>Controls & keybindings</summary><div class="binding-list">${renderBindingSettings()}</div><p class="binding-note"><b>Mouse</b> look · <b>Left click</b> attack · <b>Right click</b> hold aim. Keyboard aim is a toggle for trackpad play.</p><button class="text-action reset-bindings" type="button" data-action="reset-bindings">Reset default bindings</button></details>
          <button class="text-action" type="button" data-action="exit-menu">Exit to main menu</button>
        </div>
      </section>
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
    weather: find('[data-hud="weather"]'), area: find('[data-hud="area"]'), prompt: find('[data-hud="prompt"]'), status: find('[data-hud="status"]'), objective: find('[data-hud="objective"]'), objectiveCopy: find('[data-hud="objective-copy"]'),
    inventory: find('[data-hud="inventory"]'), team: find('[data-hud="team"]'), intermission: find('[data-hud="intermission"]'), damage: find('[data-hud="damage"]'), hitMarker: find('[data-hud="hit-marker"]'),
    start: find('[data-action="start"]'), restart: find('[data-action="restart"]'), overlay: find('[data-hud="overlay"]'),
    outcome: find('[data-hud="outcome"]'), outcomeKicker: find('[data-hud="outcome-kicker"]'), outcomeTitle: find('[data-hud="outcome-title"]'), outcomeCopy: find('[data-hud="outcome-copy"]'), outcomeWave: find('[data-hud="outcome-wave"]'), outcomeCount: find('[data-hud="outcome-count"]'), outcomeTeam: find('[data-hud="outcome-team"]'),
    pause: find('[data-hud="pause"]'), pauseMode: find('[data-hud="pause-mode"]'), miniMap: find('.mini-map')
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
