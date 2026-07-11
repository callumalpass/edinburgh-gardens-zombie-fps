import * as THREE from "three";

export interface DisposeThreeResourcesOptions {
  includeShared?: boolean;
}

export function disposeThreeResources(root: THREE.Object3D, options: DisposeThreeResourcesOptions = {}): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry && (options.includeShared || mesh.geometry.userData.sharedZombieAsset !== true)) {
      geometries.add(mesh.geometry);
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => {
        if (options.includeShared || entry.userData.sharedZombieAsset !== true) materials.add(entry);
      });
    } else if (material && (options.includeShared || material.userData.sharedZombieAsset !== true)) {
      materials.add(material);
    }
  });

  for (const material of materials) {
    collectMaterialTextures(material, textures);
    material.dispose();
  }
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
}

function collectMaterialTextures(material: THREE.Material, textures: Set<THREE.Texture>): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      textures.add(value);
    }
  }
}
