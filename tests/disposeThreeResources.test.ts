import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { disposeThreeResources } from "../src/game/rendering/disposeThreeResources";

describe("disposeThreeResources", () => {
  it("retains shared zombie buffers until the template cache is explicitly disposed", () => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    geometry.userData.sharedZombieAsset = true;
    material.userData.sharedZombieAsset = true;
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));

    disposeThreeResources(root);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    disposeThreeResources(root, { includeShared: true });
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
