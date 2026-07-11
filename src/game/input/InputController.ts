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
  cycleWeapon: () => void;
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
  private readonly touchMode = shouldUseTouchControls();
  private virtualMovement: MovementInput = { x: 0, z: 0, length: 0 };
  private virtualSprint = false;
  private virtualCrouch = false;
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
    if (this.touchMode) this.installTouchControls();
  }

  get touchEnabled(): boolean {
    return this.touchMode;
  }

  isDown(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  isMoving(): boolean {
    return this.enabled && (this.virtualMovement.length > 0.08 || (["moveForward", "moveBackward", "moveLeft", "moveRight"] as InputAction[])
      .some((action) => this.isActionDown(action)));
  }

  isSprinting(): boolean {
    return this.enabled && (this.virtualSprint || sprintInputFromKeys((code) => this.keys.has(code), this.bindings));
  }

  isCrouching(): boolean {
    return this.enabled && (this.virtualCrouch || crouchInputFromKeys((code) => this.keys.has(code), this.bindings));
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
    const keyboard = movementInputFromKeys((code) => this.keys.has(code), this.bindings);
    return keyboard.length > 0.001 ? keyboard : this.virtualMovement;
  }

  clear(): void {
    this.keys.clear();
    this.aimMouseHeld = false;
    this.aimToggled = false;
    this.virtualMovement = { x: 0, z: 0, length: 0 };
    this.virtualSprint = false;
    this.virtualCrouch = false;
    this.updateTouchState();
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

  private installTouchControls(): void {
    const shell = this.canvas.closest<HTMLElement>(".shell");
    const stick = shell?.querySelector<HTMLElement>("[data-touch-stick]");
    const knob = stick?.querySelector<HTMLElement>("span");
    const lookZone = shell?.querySelector<HTMLElement>("[data-touch-look]");
    if (!shell || !stick || !knob || !lookZone) return;

    shell.classList.add("touch-mode");
    let stickPointer: number | null = null;
    const updateStick = (event: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const radius = Math.max(28, rect.width * 0.34);
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      const scale = distance > radius ? radius / distance : 1;
      const x = (dx * scale) / radius;
      const z = (dy * scale) / radius;
      const length = Math.min(1, Math.hypot(x, z));
      this.virtualMovement = { x, z, length };
      knob.style.setProperty("--stick-x", `${dx * scale}px`);
      knob.style.setProperty("--stick-y", `${dy * scale}px`);
    };
    const releaseStick = (event: PointerEvent) => {
      if (stickPointer !== event.pointerId) return;
      stickPointer = null;
      this.virtualMovement = { x: 0, z: 0, length: 0 };
      knob.style.setProperty("--stick-x", "0px");
      knob.style.setProperty("--stick-y", "0px");
    };
    stick.addEventListener("pointerdown", (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      stickPointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      updateStick(event);
      this.actions.unlockAudio();
    }, { signal: this.signal });
    stick.addEventListener("pointermove", (event) => {
      if (stickPointer === event.pointerId) updateStick(event);
    }, { signal: this.signal });
    stick.addEventListener("pointerup", releaseStick, { signal: this.signal });
    stick.addEventListener("pointercancel", releaseStick, { signal: this.signal });

    let lookPointer: number | null = null;
    let lookX = 0;
    let lookY = 0;
    lookZone.addEventListener("pointerdown", (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      lookPointer = event.pointerId;
      lookX = event.clientX;
      lookY = event.clientY;
      lookZone.setPointerCapture(event.pointerId);
      this.actions.unlockAudio();
    }, { signal: this.signal });
    lookZone.addEventListener("pointermove", (event) => {
      if (lookPointer !== event.pointerId || !this.enabled) return;
      const dx = event.clientX - lookX;
      const dy = event.clientY - lookY;
      lookX = event.clientX;
      lookY = event.clientY;
      this.actions.look(dx * 1.35, dy * 1.35);
    }, { signal: this.signal });
    const releaseLook = (event: PointerEvent) => {
      if (lookPointer === event.pointerId) lookPointer = null;
    };
    lookZone.addEventListener("pointerup", releaseLook, { signal: this.signal });
    lookZone.addEventListener("pointercancel", releaseLook, { signal: this.signal });

    for (const button of shell.querySelectorAll<HTMLButtonElement>("[data-touch-action]")) {
      const action = button.dataset.touchAction;
      button.addEventListener("pointerdown", (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        event.stopPropagation();
        this.actions.unlockAudio();
        if (action === "sprint") this.virtualSprint = true;
        if (action === "crouch") this.virtualCrouch = !this.virtualCrouch;
        if (action === "aim") this.aimToggled = !this.aimToggled;
        if (action === "fire") this.actions.shoot();
        if (action === "interact") this.actions.interact();
        if (action === "take") this.actions.takeItem();
        if (action === "reload") this.actions.reload();
        if (action === "jump") this.actions.jump();
        if (action === "inventory") this.actions.toggleInventory();
        if (action === "flashlight") this.actions.toggleFlashlight();
        if (action === "throw") this.actions.throwDistraction();
        if (action === "skateboard") this.actions.toggleSkateboard();
        if (action === "weapon") this.actions.cycleWeapon();
        this.updateTouchState();
      }, { signal: this.signal });
      const releaseButton = (event: PointerEvent) => {
        if (action === "sprint") this.virtualSprint = false;
        event.preventDefault();
        this.updateTouchState();
      };
      button.addEventListener("pointerup", releaseButton, { signal: this.signal });
      button.addEventListener("pointercancel", releaseButton, { signal: this.signal });
    }
  }

  private updateTouchState(): void {
    const shell = this.canvas.closest<HTMLElement>(".shell");
    shell?.querySelector<HTMLElement>('[data-touch-action="aim"]')?.classList.toggle("active", this.aimToggled);
    shell?.querySelector<HTMLElement>('[data-touch-action="crouch"]')?.classList.toggle("active", this.virtualCrouch);
    shell?.querySelector<HTMLElement>('[data-touch-action="sprint"]')?.classList.toggle("active", this.virtualSprint);
  }
}

export function shouldUseTouchControls(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("touch")
    || navigator.maxTouchPoints > 0
    || window.matchMedia?.("(pointer: coarse)").matches === true;
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
