import { describe, expect, it } from "vitest";
import { START_HEALTH, START_PITCH, START_SCRAP, START_YAW } from "../src/game/gameConfig";
import { createInitialPlayerState, resetPlayerState } from "../src/game/playerState";

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

    resetPlayerState(player, 1.5);

    expect(player.position).toBe(position);
    expect(player.velocity).toBe(velocity);
    expect(player.position.y).toBe(1.5);
    expect(player.velocity.lengthSq()).toBe(0);
    expect(player.health).toBe(START_HEALTH);
    expect(player.scrap).toBe(START_SCRAP);
    expect(player.crouching).toBe(false);
    expect(player.activeFixtureId).toBeNull();
  });
});
