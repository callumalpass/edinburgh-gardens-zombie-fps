import { existsSync, readFileSync, statSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  attachZombieAnimation,
  disposeZombieAssetAnimation,
  triggerZombieAssetAnimation,
  updateZombieAssetAnimation,
  zombieAssetState
} from "../src/game/rendering/ZombieAsset";
import type { ZombieAssetInstance } from "../src/game/rendering/ZombieAsset";

interface ZombieManifest {
  blenderVersion: string;
  animationContract: { bipedClips: string[]; crawlerClips: string[] };
  runtimeContract: {
    rootMotion: boolean;
    gameplayHitZonesRemainAuthoritative: boolean;
    contactShadowsRemainInstanced: boolean;
    animationDistanceThrottling: boolean;
  };
  zombies: Array<{
    type: string;
    glb: string;
    triangleCount: number;
    meshObjectCount: number;
    armatureCount: number;
    rigFamily: string;
  }>;
}

const manifest = JSON.parse(
  readFileSync(new URL("../assets/blender/zombies/edinburgh-gardens-zombies.asset.json", import.meta.url), "utf8")
) as ZombieManifest;

describe("Blender zombie assets", () => {
  it("ships a compact single-mesh rig for every gameplay archetype", () => {
    expect(manifest.zombies.map((zombie) => zombie.type).sort()).toEqual([
      "bloater", "crawler", "screamer", "shambler", "sprinter"
    ]);
    for (const zombie of manifest.zombies) {
      expect(zombie.meshObjectCount).toBe(1);
      expect(zombie.armatureCount).toBe(1);
      expect(zombie.triangleCount).toBeGreaterThan(1_500);
      expect(zombie.triangleCount).toBeLessThan(5_000);
      expect(existsSync(zombie.glb)).toBe(true);
      expect(statSync(zombie.glb).size).toBeLessThan(550_000);
    }
    expect(manifest.zombies.find((zombie) => zombie.type === "crawler")?.rigFamily).toBe("crawler");
  });

  it("keeps gameplay authority and runtime performance constraints explicit", () => {
    expect(manifest.blenderVersion).toMatch(/^4\.5\./);
    expect(manifest.animationContract.bipedClips).toEqual(["Idle", "Move", "Chase", "Attack", "Stagger", "Scream"]);
    expect(manifest.animationContract.crawlerClips).toEqual(["Idle", "Move", "Chase", "Attack", "Stagger"]);
    expect(manifest.runtimeContract).toEqual({
      rootMotion: false,
      gameplayHitZonesRemainAuthoritative: true,
      contactShadowsRemainInstanced: true,
      animationDistanceThrottling: true
    });
  });

  it("selects locomotion and one-shot clips without changing the gameplay mesh", () => {
    const wrapper = new THREE.Group();
    const asset: ZombieAssetInstance = {
      root: new THREE.Group(),
      animations: ["Idle", "Move", "Chase", "Attack", "Stagger", "Scream"].map(
        (name) => new THREE.AnimationClip(name, 0.4, [])
      )
    };
    attachZombieAnimation(wrapper, asset);
    expect(zombieAssetState(wrapper)).toEqual({ loaded: true, animation: "Idle" });

    expect(updateZombieAssetAnimation(wrapper, {
      dt: 1 / 30,
      type: "shambler",
      aiState: "wander",
      staggered: false,
      distanceToPlayer: 10
    })).toBe(true);
    expect(zombieAssetState(wrapper).animation).toBe("Move");

    updateZombieAssetAnimation(wrapper, {
      dt: 1 / 30,
      type: "sprinter",
      aiState: "chase",
      staggered: false,
      distanceToPlayer: 10
    });
    expect(zombieAssetState(wrapper).animation).toBe("Chase");

    triggerZombieAssetAnimation(wrapper, "Attack");
    expect(zombieAssetState(wrapper).animation).toBe("Attack");
    updateZombieAssetAnimation(wrapper, {
      dt: 0.5,
      type: "shambler",
      aiState: "chase",
      staggered: false,
      distanceToPlayer: 10
    });
    expect(zombieAssetState(wrapper).animation).toBe("Chase");

    disposeZombieAssetAnimation(wrapper);
    expect(zombieAssetState(wrapper)).toEqual({ loaded: false, animation: "" });
  });
});
