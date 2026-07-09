import type { GameTestApi } from "../state";
import type { AmenityKind } from "../types";
import type { WorldItemId } from "../items";
import type { WeaponId } from "../weapons";
import type { UpgradeId } from "../weapons";

export interface GameToolCommandParameter {
  name: string;
  required?: boolean;
  description?: string;
  values?: readonly string[];
}

export interface GameToolCommandDefinition {
  name: string;
  description: string;
  parameters?: readonly GameToolCommandParameter[];
  aliases?: readonly string[];
}

export type GameToolCommandArgs = Record<string, unknown> | readonly unknown[] | undefined;

export interface GameToolBridge {
  ready: boolean;
  listCommands: () => readonly GameToolCommandDefinition[];
  runCommand: (command: string, args?: GameToolCommandArgs) => Promise<unknown>;
}

declare global {
  interface Window {
    __EGAME__?: GameTestApi;
    __EGAME_TOOLS__?: GameToolBridge;
  }
}

const WEAPON_IDS = ["knife", "machete", "carbine", "shotgun", "flareGun", "smg", "rifle"] as const satisfies readonly WeaponId[];
const AMENITY_KINDS = [
  "bench",
  "drinking_water",
  "waste_basket",
  "bicycle_parking",
  "bbq",
  "toilets",
  "post_box",
  "picnic_table",
  "table_tennis",
  "clubroom",
  "changeroom",
  "umpire_room",
  "first_aid_room",
  "gatehouse",
  "maintenance_room",
  "community_room",
  "kitchenette",
  "kiosk_hatch",
  "utility_box",
  "memorial_plaque"
] as const satisfies readonly AmenityKind[];
const ITEM_IDS = ["tyre-kit", "bolt-cutters", "noise-bottle", "noise-radio", "ladder", "skateboard"] as const satisfies readonly WorldItemId[];
const UPGRADE_IDS = ["damage", "fireRate", "magazine", "reload", "spread"] as const satisfies readonly UpgradeId[];

const COMMAND_DEFINITIONS: readonly GameToolCommandDefinition[] = [
  { name: "snapshot", description: "Read the current game state snapshot." },
  {
    name: "teleport",
    description: "Move the local player to world coordinates and optionally set yaw/pitch.",
    parameters: [
      { name: "x", required: true, description: "World X coordinate." },
      { name: "z", required: true, description: "World Z coordinate." },
      { name: "yaw", description: "Optional yaw in radians." },
      { name: "pitch", description: "Optional pitch in radians." }
    ]
  },
  { name: "spawn", description: "Force-spawn one or more zombies.", parameters: [{ name: "count", description: "Spawn count. Defaults to 1." }] },
  { name: "shoot", description: "Fire the equipped weapon once." },
  {
    name: "weapon",
    description: "Pick up and equip a weapon from existing weapon drops.",
    aliases: ["pickup-weapon"],
    parameters: [{ name: "weaponId", description: "Weapon id to pick up.", values: WEAPON_IDS }]
  },
  {
    name: "scope",
    description: "Scope/aim with the current weapon, or pick up a scoped weapon first.",
    parameters: [{ name: "weaponId", description: "Optional scoped weapon id.", values: WEAPON_IDS }]
  },
  {
    name: "crouch",
    description: "Set the test crouch override.",
    parameters: [{ name: "active", required: true, description: "true or false." }]
  },
  {
    name: "interact",
    description: "Move to and toggle an interactable fixture.",
    parameters: [{ name: "fixtureId", description: "Optional fixture id." }]
  },
  {
    name: "amenity",
    description: "Move to and use an amenity.",
    parameters: [{ name: "kind", description: "Optional amenity kind.", values: AMENITY_KINDS }]
  },
  { name: "repair-bike", description: "Repair the nearest flat-tyre test bike, adding a tyre kit if needed." },
  { name: "unlock-bike", description: "Unlock the locked test bike, adding bolt cutters if needed." },
  {
    name: "pickup-item",
    description: "Pick up a dropped world item.",
    parameters: [{ name: "itemId", description: "Optional item id.", values: ITEM_IDS }]
  },
  { name: "drop-item", description: "Drop the carried or selected item." },
  { name: "inventory", description: "Inspect inventory and open the inventory HUD state." },
  {
    name: "place-ladder",
    description: "Carry and place a ladder at a ladder-capable fixture.",
    parameters: [{ name: "fixtureId", description: "Optional fixture id." }]
  },
  { name: "pickup-ladder", description: "Pick up the first placed ladder." },
  { name: "skateboard", description: "Toggle the carried skateboard mount state." },
  { name: "bike", description: "Toggle the nearest available bike mount state." },
  { name: "throw", description: "Throw a distraction item.", aliases: ["throw-distraction"] },
  { name: "flashlight", description: "Toggle the flashlight." },
  { name: "intermission", description: "Clear zombies and start intermission." },
  {
    name: "intermission-upgrade",
    description: "Claim a free field modification during intermission.",
    parameters: [{ name: "upgradeId", description: "Optional upgrade id.", values: UPGRADE_IDS }]
  },
  { name: "teammate", description: "Add a synthetic co-op teammate to the HUD.", parameters: [{ name: "name", description: "Optional survivor name." }] },
  { name: "zombies", description: "List zombie AI state summaries.", aliases: ["zombie-states"] },
  { name: "facing", description: "List zombie facing-alignment summaries.", aliases: ["zombie-facing"] },
  { name: "grounding", description: "Measure player and zombie ground alignment." },
  { name: "minimap", description: "Run the minimap visibility probe." },
  {
    name: "key",
    description: "Dispatch a keydown, wait briefly, then dispatch keyup.",
    parameters: [
      { name: "code", required: true, description: "KeyboardEvent code, for example KeyW or Space." },
      { name: "durationMs", description: "Hold duration in milliseconds. Defaults to 80." }
    ]
  },
  { name: "keydown", description: "Dispatch a keydown event.", parameters: [{ name: "code", required: true }] },
  { name: "keyup", description: "Dispatch a keyup event.", parameters: [{ name: "code", required: true }] },
  {
    name: "look",
    description: "Dispatch an unlocked-look mousemove event.",
    parameters: [
      { name: "movementX", required: true, description: "Horizontal mouse delta." },
      { name: "movementY", required: true, description: "Vertical mouse delta." }
    ]
  },
  { name: "wait", description: "Wait and then return a snapshot.", parameters: [{ name: "durationMs", description: "Milliseconds to wait." }] }
];

const COMMAND_ALIASES = new Map<string, string>(
  COMMAND_DEFINITIONS.flatMap((definition) => (definition.aliases ?? []).map((alias) => [alias, definition.name]))
);

export function installGameTestDriver(api: GameTestApi): void {
  window.__EGAME__ = api;
  window.__EGAME_TOOLS__ = createGameToolBridge(api);
}

export function uninstallGameTestDriver(api: GameTestApi): void {
  if (window.__EGAME__ === api) {
    delete window.__EGAME__;
    delete window.__EGAME_TOOLS__;
  }
}

function createGameToolBridge(api: GameTestApi): GameToolBridge {
  return {
    ready: true,
    listCommands: () => COMMAND_DEFINITIONS,
    runCommand: async (command, args) => runGameToolCommand(api, command, args)
  };
}

async function runGameToolCommand(api: GameTestApi, commandName: string, args?: GameToolCommandArgs): Promise<unknown> {
  const command = normalizeCommandName(commandName);
  switch (command) {
    case "snapshot":
      return api.snapshot();
    case "teleport":
      return api.testTeleport({
        x: numberArg(args, "x", 0, true),
        z: numberArg(args, "z", 1, true),
        yaw: optionalNumberArg(args, "yaw", 2),
        pitch: optionalNumberArg(args, "pitch", 3)
      });
    case "spawn": {
      const count = Math.max(1, Math.min(250, Math.floor(optionalNumberArg(args, "count", 0) ?? 1)));
      for (let index = 0; index < count; index += 1) {
        api.testSpawn();
      }
      return withSnapshot(api, { spawned: count });
    }
    case "shoot":
      api.testShoot();
      return api.snapshot();
    case "weapon":
      return withSnapshot(api, { ok: api.testPickupWeapon(optionalStringArg(args, "weaponId", 0) as WeaponId | undefined) });
    case "scope":
      return withSnapshot(api, { ok: api.testScope(optionalStringArg(args, "weaponId", 0) as WeaponId | undefined) });
    case "crouch":
      return withSnapshot(api, { ok: api.testSetCrouching(booleanArg(args, "active", 0, true)) });
    case "interact":
      return withSnapshot(api, { ok: api.testInteract(optionalStringArg(args, "fixtureId", 0)) });
    case "amenity":
      return withSnapshot(api, { ok: api.testUseAmenity(optionalStringArg(args, "kind", 0) as AmenityKind | undefined) });
    case "repair-bike":
      return withSnapshot(api, { ok: api.testRepairFlatBike() });
    case "unlock-bike":
      return withSnapshot(api, { ok: api.testUnlockLockedBike() });
    case "pickup-item":
      return withSnapshot(api, { ok: api.testPickupItem(optionalStringArg(args, "itemId", 0)) });
    case "drop-item":
      return withSnapshot(api, { ok: api.testDropItem() });
    case "inventory":
      return withSnapshot(api, { message: api.testInspectInventory() });
    case "place-ladder":
      return withSnapshot(api, { ok: api.testPlaceLadder(optionalStringArg(args, "fixtureId", 0)) });
    case "pickup-ladder":
      return withSnapshot(api, { ok: api.testPickupPlacedLadder() });
    case "skateboard":
      return withSnapshot(api, { ok: api.testToggleSkateboard() });
    case "bike":
      return withSnapshot(api, { ok: api.testToggleBike() });
    case "throw":
      return withSnapshot(api, { ok: api.testThrowDistraction() });
    case "flashlight":
      return withSnapshot(api, { on: api.testToggleFlashlight() });
    case "intermission":
      return withSnapshot(api, { ok: api.testStartIntermission() });
    case "intermission-upgrade":
      return withSnapshot(api, { ok: api.testChooseIntermissionUpgrade(optionalStringArg(args, "upgradeId", 0) as UpgradeId | undefined) });
    case "teammate":
      return withSnapshot(api, { ok: api.testAddTeammate(optionalStringArg(args, "name", 0)) });
    case "zombies":
      return api.testZombieStates();
    case "facing":
      return api.testZombieFacing();
    case "grounding":
      return api.testGrounding();
    case "minimap":
      return api.testMiniMapVisibility();
    case "key": {
      const code = stringArg(args, "code", 0, true);
      const durationMs = Math.max(0, Math.min(10_000, Math.floor(optionalNumberArg(args, "durationMs", 1) ?? 80)));
      dispatchKeyboardEvent("keydown", code);
      await wait(durationMs);
      dispatchKeyboardEvent("keyup", code);
      return api.snapshot();
    }
    case "keydown":
      dispatchKeyboardEvent("keydown", stringArg(args, "code", 0, true));
      return api.snapshot();
    case "keyup":
      dispatchKeyboardEvent("keyup", stringArg(args, "code", 0, true));
      return api.snapshot();
    case "look":
      dispatchMouseMove(numberArg(args, "movementX", 0, true), numberArg(args, "movementY", 1, true));
      return api.snapshot();
    case "wait":
      await wait(Math.max(0, Math.min(60_000, Math.floor(optionalNumberArg(args, "durationMs", 0) ?? 250))));
      return api.snapshot();
    default:
      throw new Error(`Unknown game tool command "${commandName}".`);
  }
}

function normalizeCommandName(commandName: string): string {
  const normalized = commandName.trim();
  return COMMAND_ALIASES.get(normalized) ?? normalized;
}

function withSnapshot(api: GameTestApi, result: Record<string, unknown>): Record<string, unknown> {
  return {
    ...result,
    snapshot: api.snapshot()
  };
}

function argValue(args: GameToolCommandArgs, key: string, index: number): unknown {
  if (Array.isArray(args)) {
    return args[index];
  }
  if (args && typeof args === "object") {
    return (args as Record<string, unknown>)[key];
  }
  return undefined;
}

function optionalStringArg(args: GameToolCommandArgs, key: string, index: number): string | undefined {
  const value = argValue(args, key, index);
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
}

function stringArg(args: GameToolCommandArgs, key: string, index: number, required = false): string {
  const value = optionalStringArg(args, key, index);
  if (value === undefined && required) {
    throw new Error(`Missing required argument "${key}".`);
  }
  return value ?? "";
}

function optionalNumberArg(args: GameToolCommandArgs, key: string, index: number): number | undefined {
  const value = argValue(args, key, index);
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Argument "${key}" must be a finite number.`);
  }
  return numberValue;
}

function numberArg(args: GameToolCommandArgs, key: string, index: number, required = false): number {
  const value = optionalNumberArg(args, key, index);
  if (value === undefined && required) {
    throw new Error(`Missing required argument "${key}".`);
  }
  return value ?? 0;
}

function booleanArg(args: GameToolCommandArgs, key: string, index: number, required = false): boolean {
  const value = argValue(args, key, index);
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new Error(`Missing required argument "${key}".`);
    }
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`Argument "${key}" must be true or false.`);
}

function dispatchKeyboardEvent(type: "keydown" | "keyup", code: string): void {
  window.dispatchEvent(new KeyboardEvent(type, {
    code,
    key: keyForCode(code),
    bubbles: true,
    cancelable: true
  }));
}

function keyForCode(code: string): string {
  if (code === "Space") {
    return " ";
  }
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }
  return code;
}

function dispatchMouseMove(movementX: number, movementY: number): void {
  const event = new MouseEvent("mousemove", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "movementX", { value: movementX });
  Object.defineProperty(event, "movementY", { value: movementY });
  window.dispatchEvent(event);
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
