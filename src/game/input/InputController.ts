export interface MovementInput {
  x: number;
  z: number;
  length: number;
}

export interface InputControllerActions {
  unlockAudio: () => void;
  shoot: () => void;
  reload: () => void;
  interact: () => void;
  toggleFlashlight: () => void;
  throwDistraction: () => void;
  takeItem: () => void;
  toggleInventory: () => void;
  dropItem: () => void;
  jump: () => void;
  toggleSkateboard: () => void;
  equipSlot: (index: number) => void;
  look: (movementX: number, movementY: number) => void;
  cancel: () => void;
}

export interface InputControllerOptions {
  allowUnlockedLook?: boolean;
  bindings?: InputBindings;
}

export class InputController {
  private readonly keys = new Set<string>();
  private aimMouseHeld = false;
  private aimToggled = false;
  private bindings: InputBindings;
  private enabled = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly actions: InputControllerActions,
    private readonly signal: AbortSignal,
    private readonly target: Window = window,
    private readonly options: InputControllerOptions = {}
  ) {
    this.bindings = normalizeInputBindings(options.bindings);
  }

  install(): void {
    this.canvas.addEventListener("mousedown", (event) => {
      if (!this.enabled) return;
      if (event.button === 0) {
        if (document.pointerLockElement !== this.canvas) {
          this.canvas.requestPointerLock?.();
        }
        this.actions.unlockAudio();
        this.actions.shoot();
      }

      if (event.button === 2) {
        this.aimMouseHeld = true;
      }
    }, { signal: this.signal });

    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: this.signal });
    this.target.addEventListener("pointerdown", (event) => {
      if (!this.enabled) return;
      if (event.button === 2) this.aimMouseHeld = true;
    }, { signal: this.signal });
    this.target.addEventListener("pointerup", (event) => {
      if (event.button === 2) this.aimMouseHeld = false;
    }, { signal: this.signal });
    this.target.addEventListener("mousemove", (event) => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== this.canvas && !this.options.allowUnlockedLook) return;
      this.actions.look(event.movementX, event.movementY);
    }, { signal: this.signal });
    this.target.addEventListener("keydown", (event) => this.handleKeyDown(event), { signal: this.signal });
    this.target.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal: this.signal });
  }

  isDown(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  isMoving(): boolean {
    return this.enabled && (["moveForward", "moveBackward", "moveLeft", "moveRight"] as InputAction[])
      .some((action) => this.isActionDown(action));
  }

  isSprinting(): boolean {
    return this.enabled && sprintInputFromKeys((code) => this.keys.has(code), this.bindings);
  }

  isCrouching(): boolean {
    return this.enabled && crouchInputFromKeys((code) => this.keys.has(code), this.bindings);
  }

  get aimHeld(): boolean {
    return this.aimMouseHeld || this.aimToggled;
  }

  setAimHeld(aimHeld: boolean): void {
    this.aimToggled = aimHeld;
    if (!aimHeld) this.aimMouseHeld = false;
  }

  setBindings(bindings: InputBindings): void {
    this.bindings = normalizeInputBindings(bindings);
    this.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  movement(): MovementInput {
    if (!this.enabled) return { x: 0, z: 0, length: 0 };
    return movementInputFromKeys((code) => this.keys.has(code), this.bindings);
  }

  clear(): void {
    this.keys.clear();
    this.aimMouseHeld = false;
    this.aimToggled = false;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) {
      if (!event.repeat && event.code === "Escape") this.actions.cancel();
      return;
    }
    this.keys.add(event.code);
    this.actions.unlockAudio();

    const firstPress = !event.repeat;
    if (firstPress && this.uses("reload", event.code)) this.actions.reload();
    if (firstPress && this.uses("interact", event.code)) this.actions.interact();
    if (firstPress && this.uses("flashlight", event.code)) this.actions.toggleFlashlight();
    if (firstPress && this.uses("throwDistraction", event.code)) this.actions.throwDistraction();
    if (firstPress && this.uses("take", event.code)) this.actions.takeItem();
    if (firstPress && this.uses("inventory", event.code)) this.actions.toggleInventory();
    if (firstPress && this.uses("dropCarried", event.code)) this.actions.dropItem();
    if (firstPress && this.uses("skateboard", event.code)) this.actions.toggleSkateboard();
    if (firstPress && this.uses("scopeToggle", event.code)) this.aimToggled = !this.aimToggled;
    if (this.uses("jump", event.code)) {
      event.preventDefault();
      if (firstPress) this.actions.jump();
    }
    if (firstPress && event.code === "Escape") this.actions.cancel();
    if (firstPress) {
      for (let index = 0; index < 6; index += 1) {
        if (this.uses(`weapon${index + 1}` as InputAction, event.code)) this.actions.equipSlot(index);
      }
    }
  }

  private uses(action: InputAction, code: string): boolean {
    return actionUsesCode(this.bindings, action, code);
  }

  private isActionDown(action: InputAction): boolean {
    return this.bindings[action].some((code) => this.keys.has(code));
  }
}

export function movementInputFromKeys(
  isDown: (code: string) => boolean,
  bindings: InputBindings = DEFAULT_INPUT_BINDINGS
): MovementInput {
  let x = 0;
  let z = 0;
  if (bindings.moveForward.some(isDown)) z -= 1;
  if (bindings.moveBackward.some(isDown)) z += 1;
  if (bindings.moveLeft.some(isDown)) x -= 1;
  if (bindings.moveRight.some(isDown)) x += 1;

  const length = Math.hypot(x, z);
  if (length <= 0.001) {
    return { x: 0, z: 0, length: 0 };
  }

  return {
    x: x / length,
    z: z / length,
    length
  };
}

export function sprintInputFromKeys(
  isDown: (code: string) => boolean,
  bindings: InputBindings = DEFAULT_INPUT_BINDINGS
): boolean {
  return bindings.sprint.some(isDown);
}

export function crouchInputFromKeys(
  isDown: (code: string) => boolean,
  bindings: InputBindings = DEFAULT_INPUT_BINDINGS
): boolean {
  return bindings.crouch.some(isDown);
}
import {
  DEFAULT_INPUT_BINDINGS,
  actionUsesCode,
  normalizeInputBindings,
  type InputAction,
  type InputBindings
} from "./inputBindings";
