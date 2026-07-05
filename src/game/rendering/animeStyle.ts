import * as THREE from "three";

export const ANIME_OUTLINE_COLOR = 0x07131a;

export function createAnimeToonRamp(): THREE.DataTexture {
  const data = new Uint8Array([
    54, 54, 54, 255,
    116, 116, 116, 255,
    196, 196, 196, 255,
    255, 255, 255, 255
  ]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function tuneAnimeStandardMaterial(material: THREE.MeshStandardMaterial): void {
  material.flatShading = true;
  material.roughness = Math.max(material.roughness, 0.72);
  material.color.offsetHSL(0, 0.025, 0.02);
  material.emissive.lerp(material.color, 0.12);
  material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.1);
  material.needsUpdate = true;
}

export function tuneAnimeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    if (entry instanceof THREE.MeshStandardMaterial) {
      tuneAnimeStandardMaterial(entry);
    }
  }
}
