export type InputAction =
  | "moveForward"
  | "moveBackward"
  | "moveLeft"
  | "moveRight"
  | "sprint"
  | "crouch"
  | "jump"
  | "reload"
  | "interact"
  | "take"
  | "dropCarried"
  | "flashlight"
  | "throwDistraction"
  | "inventory"
  | "skateboard"
  | "scopeToggle"
  | "weapon1"
  | "weapon2"
  | "weapon3"
  | "weapon4"
  | "weapon5"
  | "weapon6";

export type InputBindings = Record<InputAction, string[]>;

export interface InputActionDefinition {
  action: InputAction;
  label: string;
  group: "Movement" | "Combat" | "Field actions" | "Weapons";
}

export const INPUT_ACTION_DEFINITIONS: readonly InputActionDefinition[] = [
  { action: "moveForward", label: "Move forward", group: "Movement" },
  { action: "moveBackward", label: "Move backward", group: "Movement" },
  { action: "moveLeft", label: "Move left", group: "Movement" },
  { action: "moveRight", label: "Move right", group: "Movement" },
  { action: "sprint", label: "Sprint", group: "Movement" },
  { action: "crouch", label: "Crouch", group: "Movement" },
  { action: "jump", label: "Jump", group: "Movement" },
  { action: "scopeToggle", label: "Toggle aim / scope", group: "Combat" },
  { action: "reload", label: "Reload", group: "Combat" },
  { action: "interact", label: "Use / mount", group: "Field actions" },
  { action: "take", label: "Take / remove", group: "Field actions" },
  { action: "dropCarried", label: "Drop carried gear", group: "Field actions" },
  { action: "flashlight", label: "Flashlight", group: "Field actions" },
  { action: "throwDistraction", label: "Throw distraction", group: "Field actions" },
  { action: "inventory", label: "Field bag", group: "Field actions" },
  { action: "skateboard", label: "Ride / carry skateboard", group: "Field actions" },
  { action: "weapon1", label: "Weapon slot 1", group: "Weapons" },
  { action: "weapon2", label: "Weapon slot 2", group: "Weapons" },
  { action: "weapon3", label: "Weapon slot 3", group: "Weapons" },
  { action: "weapon4", label: "Weapon slot 4", group: "Weapons" },
  { action: "weapon5", label: "Weapon slot 5", group: "Weapons" },
  { action: "weapon6", label: "Weapon slot 6", group: "Weapons" }
] as const;

export const DEFAULT_INPUT_BINDINGS: InputBindings = {
  moveForward: ["KeyW"],
  moveBackward: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  sprint: ["ShiftLeft", "ShiftRight"],
  crouch: ["KeyC", "ControlLeft"],
  jump: ["Space"],
  reload: ["KeyR"],
  interact: ["KeyE"],
  take: ["KeyX"],
  dropCarried: ["KeyQ"],
  flashlight: ["KeyF"],
  throwDistraction: ["KeyG"],
  inventory: ["KeyI"],
  skateboard: ["KeyV"],
  scopeToggle: ["KeyZ"],
  weapon1: ["Digit1"],
  weapon2: ["Digit2"],
  weapon3: ["Digit3"],
  weapon4: ["Digit4"],
  weapon5: ["Digit5"],
  weapon6: ["Digit6"]
};

const STORAGE_KEY = "egll.inputBindings";
const ACTIONS = INPUT_ACTION_DEFINITIONS.map(({ action }) => action);

export function normalizeInputBindings(value: Partial<Record<InputAction, unknown>> | null | undefined): InputBindings {
  return Object.fromEntries(ACTIONS.map((action) => {
    const candidate = value?.[action];
    const codes = Array.isArray(candidate)
      ? candidate.filter((code): code is string => typeof code === "string" && code.length > 0).slice(0, 2)
      : [];
    return [action, codes.length > 0 ? [...new Set(codes)] : [...DEFAULT_INPUT_BINDINGS[action]]];
  })) as InputBindings;
}

export function loadInputBindings(storage: Pick<Storage, "getItem"> | null = safeStorage()): InputBindings {
  if (!storage) return normalizeInputBindings(null);
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalizeInputBindings(JSON.parse(raw) as Partial<Record<InputAction, unknown>>) : normalizeInputBindings(null);
  } catch {
    return normalizeInputBindings(null);
  }
}

export function saveInputBindings(bindings: InputBindings, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeInputBindings(bindings)));
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

export function rebindInputAction(bindings: InputBindings, action: InputAction, code: string): InputBindings {
  const next = normalizeInputBindings(bindings);
  const displacedCode = next[action][0];
  if (next[action].includes(code)) return next;
  for (const candidate of ACTIONS) {
    if (candidate === action || !next[candidate].includes(code)) continue;
    next[candidate] = next[candidate].map((boundCode) => boundCode === code ? displacedCode : boundCode);
  }
  next[action] = [code];
  return next;
}

export function actionUsesCode(bindings: InputBindings, action: InputAction, code: string): boolean {
  return bindings[action].includes(code);
}

export function bindingLabel(bindings: InputBindings, action: InputAction): string {
  return bindings[action].map(keyCodeLabel).join(" / ");
}

export function keyCodeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const labels: Record<string, string> = {
    Space: "Space",
    ShiftLeft: "L Shift",
    ShiftRight: "R Shift",
    ControlLeft: "L Ctrl",
    ControlRight: "R Ctrl",
    AltLeft: "L Alt",
    AltRight: "R Alt",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→"
  };
  return labels[code] ?? code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
