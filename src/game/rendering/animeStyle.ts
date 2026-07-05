import * as THREE from "three";

export const MELBOURNE_ANIME_PALETTE = {
  ink: 0x07131a,
  deepBluegum: 0x20383a,
  wetBluestone: 0x526c72,
  eucalyptus: 0x78906a,
  dryGrass: 0xb8a46f,
  tramOchre: 0xf0c66f,
  brick: 0xb35f4a,
  dawnMauve: 0x7b6874
} as const;

export const ANIME_OUTLINE_COLOR = MELBOURNE_ANIME_PALETTE.ink;

const STANDARD_SHADOW_TINT = new THREE.Color(MELBOURNE_ANIME_PALETTE.wetBluestone);
const STANDARD_HIGHLIGHT_TINT = new THREE.Color(MELBOURNE_ANIME_PALETTE.tramOchre);

export function createAnimeToonRamp(): THREE.DataTexture {
  const data = new Uint8Array([
    32, 45, 45, 255,
    74, 96, 82, 255,
    166, 168, 122, 255,
    246, 214, 151, 255
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
  material.metalness = Math.min(material.metalness, 0.58);
  material.color.lerp(STANDARD_HIGHLIGHT_TINT, 0.025);
  material.color.offsetHSL(-0.008, 0.032, 0.022);
  material.emissive.lerp(STANDARD_SHADOW_TINT, 0.14).lerp(material.color, 0.08);
  material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.12);
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
