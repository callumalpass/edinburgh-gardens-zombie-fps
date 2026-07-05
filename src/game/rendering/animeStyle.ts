import * as THREE from "three";

export const MELBOURNE_ANIME_PALETTE = {
  ink: 0x07131a,
  nightInk: 0x0b1a1e,
  deepBluegum: 0x1f3b39,
  wetBluestone: 0x5d747b,
  stormTeal: 0x21484d,
  eucalyptus: 0x76906c,
  silverGum: 0x9aa990,
  dryGrass: 0xb8a46f,
  couchGrass: 0x8d935d,
  tramOchre: 0xf0c66f,
  brick: 0xb35f4a,
  terraceCream: 0xd9caa7,
  dawnMauve: 0x7b6874
} as const;

export const ANIME_OUTLINE_COLOR = MELBOURNE_ANIME_PALETTE.ink;

const STANDARD_SHADOW_TINT = new THREE.Color(MELBOURNE_ANIME_PALETTE.wetBluestone);
const STANDARD_HIGHLIGHT_TINT = new THREE.Color(MELBOURNE_ANIME_PALETTE.tramOchre);

export function createAnimeToonRamp(): THREE.DataTexture {
  const data = new Uint8Array([
    16, 31, 32, 255,
    37, 70, 68, 255,
    104, 128, 93, 255,
    184, 169, 104, 255,
    246, 218, 158, 255
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
  material.roughness = Math.max(material.roughness, 0.78);
  material.metalness = Math.min(material.metalness, 0.5);
  material.color.lerp(STANDARD_HIGHLIGHT_TINT, 0.018);
  material.color.offsetHSL(-0.006, 0.024, 0.018);
  material.emissive.lerp(STANDARD_SHADOW_TINT, 0.18).lerp(material.color, 0.06);
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
