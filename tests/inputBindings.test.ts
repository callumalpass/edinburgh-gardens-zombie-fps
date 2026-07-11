import { describe, expect, it } from "vitest";
import {
  DEFAULT_INPUT_BINDINGS,
  bindingLabel,
  loadInputBindings,
  normalizeInputBindings,
  rebindInputAction,
  saveInputBindings
} from "../src/game/input/inputBindings";

describe("input bindings", () => {
  it("loads safe defaults when storage is invalid", () => {
    expect(loadInputBindings({ getItem: () => "not-json" })).toEqual(DEFAULT_INPUT_BINDINGS);
    expect(normalizeInputBindings({ scopeToggle: [] })).toEqual(DEFAULT_INPUT_BINDINGS);
  });

  it("swaps conflicting primary bindings instead of duplicating them", () => {
    const rebound = rebindInputAction(DEFAULT_INPUT_BINDINGS, "moveForward", "KeyS");
    expect(rebound.moveForward).toEqual(["KeyS"]);
    expect(rebound.moveBackward).toEqual(["KeyW"]);
  });

  it("persists normalized bindings and formats readable labels", () => {
    let stored = "";
    const rebound = rebindInputAction(DEFAULT_INPUT_BINDINGS, "scopeToggle", "AltLeft");
    saveInputBindings(rebound, { setItem: (_key, value) => { stored = value; } });
    const parsed = JSON.parse(stored);
    expect(parsed.scopeToggle).toEqual(["AltLeft"]);
    expect(bindingLabel(parsed, "scopeToggle")).toBe("L Alt");
  });
});
