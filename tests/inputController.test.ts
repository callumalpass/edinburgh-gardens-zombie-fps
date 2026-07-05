import { describe, expect, it } from "vitest";
import { crouchInputFromKeys, movementInputFromKeys, sprintInputFromKeys } from "../src/game/input/InputController";

function keys(...codes: string[]): (code: string) => boolean {
  return (code) => codes.includes(code);
}

describe("InputController movement", () => {
  it("normalizes diagonal movement while preserving intent length", () => {
    const movement = movementInputFromKeys(keys("KeyW", "KeyD"));

    expect(movement.length).toBeCloseTo(Math.SQRT2);
    expect(movement.x).toBeCloseTo(Math.SQRT1_2);
    expect(movement.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it("returns a zero vector when no movement keys are pressed", () => {
    expect(movementInputFromKeys(keys())).toEqual({ x: 0, z: 0, length: 0 });
  });

  it("detects sprint and crouch intent from all supported modifier keys", () => {
    expect(sprintInputFromKeys(keys("ShiftRight"))).toBe(true);
    expect(crouchInputFromKeys(keys("ControlLeft"))).toBe(true);
    expect(crouchInputFromKeys(keys("KeyC"))).toBe(true);
    expect(sprintInputFromKeys(keys("KeyW"))).toBe(false);
    expect(crouchInputFromKeys(keys("ShiftLeft"))).toBe(false);
  });
});
