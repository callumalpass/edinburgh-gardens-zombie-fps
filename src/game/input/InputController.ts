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
  inspectInventory: () => void;
  dropItem: () => void;
  jump: () => void;
  equipSlot: (index: number) => void;
  look: (movementX: number, movementY: number) => void;
  cancel: () => void;
}

export interface InputControllerOptions {
  allowUnlockedLook?: boolean;
}

const MOVEMENT_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD"] as const;
const SPRINT_KEYS = ["ShiftLeft", "ShiftRight"] as const;
const CROUCH_KEYS = ["KeyC", "ControlLeft", "ControlRight"] as const;

export class InputController {
  private readonly keys = new Set<string>();
  private aimHeldValue = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly actions: InputControllerActions,
    private readonly signal: AbortSignal,
    private readonly target: Window = window,
    private readonly options: InputControllerOptions = {}
  ) {}

  install(): void {
    this.canvas.addEventListener("mousedown", (event) => {
      if (event.button === 0) {
        if (document.pointerLockElement !== this.canvas) {
          this.canvas.requestPointerLock?.();
        }
        this.actions.unlockAudio();
        this.actions.shoot();
      }

      if (event.button === 2) {
        this.aimHeldValue = true;
      }
    }, { signal: this.signal });

    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: this.signal });
    this.target.addEventListener("pointerdown", (event) => {
      if (event.button === 2) this.aimHeldValue = true;
    }, { signal: this.signal });
    this.target.addEventListener("pointerup", (event) => {
      if (event.button === 2) this.aimHeldValue = false;
    }, { signal: this.signal });
    this.target.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement !== this.canvas && !this.options.allowUnlockedLook) return;
      this.actions.look(event.movementX, event.movementY);
    }, { signal: this.signal });
    this.target.addEventListener("keydown", (event) => this.handleKeyDown(event), { signal: this.signal });
    this.target.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal: this.signal });
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  isMoving(): boolean {
    return MOVEMENT_KEYS.some((code) => this.keys.has(code));
  }

  isSprinting(): boolean {
    return sprintInputFromKeys((code) => this.keys.has(code));
  }

  isCrouching(): boolean {
    return crouchInputFromKeys((code) => this.keys.has(code));
  }

  get aimHeld(): boolean {
    return this.aimHeldValue;
  }

  setAimHeld(aimHeld: boolean): void {
    this.aimHeldValue = aimHeld;
  }

  movement(): MovementInput {
    return movementInputFromKeys((code) => this.keys.has(code));
  }

  clear(): void {
    this.keys.clear();
    this.aimHeldValue = false;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.code);
    this.actions.unlockAudio();

    if (event.code === "KeyR") this.actions.reload();
    if (event.code === "KeyE") this.actions.interact();
    if (event.code === "KeyF") this.actions.toggleFlashlight();
    if (event.code === "KeyG") this.actions.throwDistraction();
    if (event.code === "KeyX") this.actions.takeItem();
    if (event.code === "KeyI") this.actions.inspectInventory();
    if (event.code === "KeyQ") this.actions.dropItem();
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) this.actions.jump();
    }
    if (event.code === "Escape") this.actions.cancel();
    if (event.code.startsWith("Digit")) {
      this.actions.equipSlot(Number(event.code.slice(5)) - 1);
    }
  }
}

export function movementInputFromKeys(isDown: (code: string) => boolean): MovementInput {
  let x = 0;
  let z = 0;
  if (isDown("KeyW")) z -= 1;
  if (isDown("KeyS")) z += 1;
  if (isDown("KeyA")) x -= 1;
  if (isDown("KeyD")) x += 1;

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

export function sprintInputFromKeys(isDown: (code: string) => boolean): boolean {
  return SPRINT_KEYS.some((code) => isDown(code));
}

export function crouchInputFromKeys(isDown: (code: string) => boolean): boolean {
  return CROUCH_KEYS.some((code) => isDown(code));
}
