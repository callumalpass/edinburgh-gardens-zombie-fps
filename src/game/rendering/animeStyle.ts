import * as THREE from "three";

export const MELBOURNE_ANIME_PALETTE = {
  ink: 0x07131a,
  nightInk: 0x0b1a1e,
  inkWash: 0x183039,
  weatheredWhite: 0xd9d5bd,
  paperGlow: 0xf1dfad,
  deepBluegum: 0x1f3b39,
  wetBluestone: 0x5d747b,
  bluestoneShadow: 0x263d45,
  stormTeal: 0x21484d,
  eucalyptus: 0x76906c,
  eucalyptShadow: 0x405f4f,
  silverGum: 0x9aa990,
  dryGrass: 0xb8a46f,
  couchGrass: 0x8d935d,
  tramOchre: 0xf0c66f,
  tramCream: 0xf2dfa8,
  brick: 0xb35f4a,
  terraceCream: 0xd9caa7,
  dawnMauve: 0x7b6874,
  winterMauve: 0x6f6674
} as const;

export const ANIME_OUTLINE_COLOR = MELBOURNE_ANIME_PALETTE.ink;

const STANDARD_SHADOW_TINT = new THREE.Color(MELBOURNE_ANIME_PALETTE.wetBluestone);
const STANDARD_HIGHLIGHT_TINT = new THREE.Color(MELBOURNE_ANIME_PALETTE.tramOchre);

export function createAnimeToonRamp(): THREE.DataTexture {
  const data = new Uint8Array([
    9, 21, 26, 255,
    30, 61, 61, 255,
    92, 116, 92, 255,
    165, 155, 101, 255,
    242, 222, 168, 255
  ]);
  const texture = new THREE.DataTexture(data, 5, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function tuneAnimeStandardMaterial(material: THREE.MeshStandardMaterial): void {
  material.flatShading = true;
  material.roughness = Math.max(material.roughness, 0.84);
  material.metalness = Math.min(material.metalness, 0.5);
  material.color.lerp(STANDARD_HIGHLIGHT_TINT, 0.015);
  material.color.offsetHSL(-0.006, 0.024, 0.016);
  material.emissive.lerp(STANDARD_SHADOW_TINT, 0.2).lerp(material.color, 0.04);
  material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.14);
  material.needsUpdate = true;
}

export function tuneAnimeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    if (entry instanceof THREE.MeshStandardMaterial) {
      tuneAnimeStandardMaterial(entry);
    } else if (entry instanceof THREE.MeshToonMaterial) {
      entry.color.offsetHSL(-0.005, 0.018, 0.01);
      entry.emissive.lerp(STANDARD_SHADOW_TINT, 0.1);
      entry.emissiveIntensity = Math.max(entry.emissiveIntensity, 0.08);
      entry.needsUpdate = true;
    }
  }
}
