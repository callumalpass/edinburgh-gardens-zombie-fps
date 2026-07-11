import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Zombie } from "../src/game/state";
import { RENDER_QUALITY_SETTINGS } from "../src/game/rendering/renderQuality";
import { ZombieRenderLod, zombieRenderTier, zombieSimulationInterval } from "../src/game/rendering/ZombieRenderLod";

describe("zombie render and simulation distance tiers", () => {
  it("uses full rigs nearby, instanced far LODs at range, and hides beyond the budget", () => {
    const settings = RENDER_QUALITY_SETTINGS.high;
    expect(zombieRenderTier(settings.zombieFullDetailDistance - 1, settings)).toBe("full");
    expect(zombieRenderTier(settings.zombieFullDetailDistance + 1, settings)).toBe("far");
    expect(zombieRenderTier(settings.zombieRenderDistance + 1, settings)).toBe("hidden");
  });

  it("matches AI cadence to the visible detail tier", () => {
    const settings = RENDER_QUALITY_SETTINGS.medium;
    expect(zombieSimulationInterval(10, settings)).toBe(0);
    expect(zombieSimulationInterval(settings.zombieFullDetailDistance + 1, settings)).toBeCloseTo(1 / 15);
    expect(zombieSimulationInterval(settings.zombieRenderDistance + 1, settings)).toBeCloseTo(1 / 6);
  });

  it("collapses a distant crowd into character-shaped archetype batches and disables full-rig shadows", () => {
    const settings = RENDER_QUALITY_SETTINGS.high;
    const system = new ZombieRenderLod();
    const zombies = Array.from({ length: 100 }, (_, index) => {
      const mesh = new THREE.Group();
      const visual = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      mesh.add(visual);
      return {
        id: index,
        type: index % 2 === 0 ? "shambler" : "sprinter",
        mesh,
        position: new THREE.Vector3(settings.zombieFullDetailDistance + 20 + index * 0.1, 0, 0)
      } as Zombie;
    });

    system.update(zombies, new THREE.Vector3(), settings);
    expect(zombies.every((zombie) => zombie.mesh.visible === false)).toBe(true);
    expect(zombies.every((zombie) => zombie.mesh.children.every((child) => child.castShadow === false))).toBe(true);
    const farCount = system.root.children.reduce(
      (count, child) => count + (child instanceof THREE.InstancedMesh ? child.count : 0),
      0
    );
    expect(farCount).toBe(100);
    const archetypeMeshes = system.root.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    expect(archetypeMeshes.every((mesh) => mesh.geometry.getAttribute("position").count > 100)).toBe(true);
    expect(archetypeMeshes.every((mesh) => mesh.geometry.hasAttribute("color"))).toBe(true);
  });
});
