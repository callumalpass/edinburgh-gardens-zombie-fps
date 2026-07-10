import { describe, expect, it } from "vitest";
import {
  INTERMISSION_REVIVE_HEALTH,
  INTERMISSION_REVIVE_PROTECTION_SECONDS,
  START_HEALTH,
  START_PITCH,
  START_SCRAP,
  START_YAW
} from "../src/game/gameConfig";
import { createInitialPlayerCondition } from "../src/game/playerCondition";
import { createInitialPlayerState, resetPlayerState, reviveFallenSquadForIntermission } from "../src/game/playerState";

describe("player runtime state", () => {
  it("creates a complete player state at the requested ground height", () => {
    const player = createInitialPlayerState(3.25);

    expect(player.position.y).toBe(3.25);
    expect(player.velocity.lengthSq()).toBe(0);
    expect(player.yaw).toBe(START_YAW);
    expect(player.pitch).toBe(START_PITCH);
    expect(player.health).toBe(START_HEALTH);
    expect(player.scrap).toBe(START_SCRAP);
    expect(player.activeFixtureId).toBeNull();
  });

  it("resets mutable runtime fields without replacing vector instances", () => {
    const player = createInitialPlayerState();
    const position = player.position;
    const velocity = player.velocity;
    player.position.set(99, 5, -40);
    player.velocity.set(1, 2, 3);
    player.health = 12;
    player.scrap = 0;
    player.crouching = true;
    player.activeFixtureId = "grandstand";
    player.reviveProtectionTimer = 3;

    resetPlayerState(player, 1.5);

    expect(player.position).toBe(position);
    expect(player.velocity).toBe(velocity);
    expect(player.position.y).toBe(1.5);
    expect(player.velocity.lengthSq()).toBe(0);
    expect(player.health).toBe(START_HEALTH);
    expect(player.scrap).toBe(START_SCRAP);
    expect(player.crouching).toBe(false);
    expect(player.activeFixtureId).toBeNull();
    expect(player.reviveProtectionTimer).toBe(0);
  });

  it("revives fallen squad members at intermission when a teammate survived", () => {
    const survivor = createInitialPlayerState();
    const fallen = createInitialPlayerState();
    const survivorCondition = createInitialPlayerCondition();
    const fallenCondition = createInitialPlayerCondition();
    fallen.health = -8;
    fallen.velocity.set(2, 0, -4);
    fallenCondition.stamina = 7;
    fallenCondition.bleedTimer = 9;
    fallenCondition.limpTimer = 5;
    fallenCondition.blurTimer = 3;

    const revived = reviveFallenSquadForIntermission([
      { name: "Survivor", player: survivor, condition: survivorCondition },
      { name: "Fallen", player: fallen, condition: fallenCondition }
    ]);

    expect(revived).toEqual(["Fallen"]);
    expect(survivor.health).toBe(START_HEALTH);
    expect(fallen.health).toBe(INTERMISSION_REVIVE_HEALTH);
    expect(fallen.velocity.lengthSq()).toBe(0);
    expect(fallen.reviveProtectionTimer).toBe(INTERMISSION_REVIVE_PROTECTION_SECONDS);
    expect(fallenCondition.stamina).toBe(INTERMISSION_REVIVE_HEALTH);
    expect(fallenCondition.bleedTimer).toBe(0);
    expect(fallenCondition.limpTimer).toBe(0);
    expect(fallenCondition.blurTimer).toBe(0);
  });

  it("does not revive an entirely fallen squad", () => {
    const first = createInitialPlayerState();
    const second = createInitialPlayerState();
    first.health = 0;
    second.health = -2;

    const revived = reviveFallenSquadForIntermission([
      { name: "First", player: first, condition: createInitialPlayerCondition() },
      { name: "Second", player: second, condition: createInitialPlayerCondition() }
    ]);

    expect(revived).toEqual([]);
    expect(first.health).toBe(0);
    expect(second.health).toBe(-2);
  });
});
