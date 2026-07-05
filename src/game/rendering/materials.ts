import * as THREE from "three";
import type { RandomSource } from "../types";
import type { GameMaterials } from "./WorldBuilder";

type TextureKind = "grass" | "path" | "gravel" | "asphalt" | "concrete" | "rubber" | "mulch" | "basalt" | "brick" | "timber";

const TOON_RAMP = createToonRamp();

export function createGameMaterials(rng: RandomSource): GameMaterials {
  const grass = createToonMaterial("grass", rng, {
    color: 0x6f8f62,
    emissive: 0x15251e,
    emissiveIntensity: 0.18,
    bumpScale: 0.075
  });
  const grassBlade = new THREE.MeshToonMaterial({
    color: 0xffffff,
    emissive: 0x344f38,
    emissiveIntensity: 0.22,
    gradientMap: TOON_RAMP,
    side: THREE.DoubleSide,
    vertexColors: true
  });
  const path = createToonMaterial("path", rng, {
    color: 0xa48f68,
    emissive: 0x221b12,
    emissiveIntensity: 0.12,
    bumpScale: 0.05
  });
  const gravel = createToonMaterial("gravel", rng, {
    color: 0x8f846d,
    emissive: 0x191914,
    emissiveIntensity: 0.1,
    bumpScale: 0.09
  });
  const asphalt = createToonMaterial("asphalt", rng, {
    color: 0x293c45,
    emissive: 0x09161b,
    emissiveIntensity: 0.22,
    bumpScale: 0.07
  });
  const concrete = createToonMaterial("concrete", rng, {
    color: 0x9ca19a,
    emissive: 0x171d1e,
    emissiveIntensity: 0.1,
    bumpScale: 0.045
  });
  const court = new THREE.MeshToonMaterial({
    color: 0x3f8068,
    emissive: 0x102b27,
    emissiveIntensity: 0.16,
    gradientMap: TOON_RAMP
  });
  const rubber = createToonMaterial("rubber", rng, {
    color: 0x8c4944,
    emissive: 0x1f0e12,
    emissiveIntensity: 0.12,
    bumpScale: 0.05
  });
  const mulch = createToonMaterial("mulch", rng, {
    color: 0x725033,
    emissive: 0x1a1009,
    emissiveIntensity: 0.12,
    bumpScale: 0.1
  });
  const dirt = new THREE.MeshToonMaterial({
    color: 0x64523d,
    emissive: 0x15100b,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    transparent: true,
    opacity: 0.62
  });
  const leafLitter = new THREE.MeshToonMaterial({
    color: 0x756b43,
    emissive: 0x161207,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    transparent: true,
    opacity: 0.56
  });
  const wornGrass = new THREE.MeshToonMaterial({
    color: 0x858563,
    emissive: 0x191b10,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    transparent: true,
    opacity: 0.48
  });
  const puddle = new THREE.MeshStandardMaterial({
    color: 0x15343c,
    emissive: 0x061216,
    emissiveIntensity: 0.26,
    metalness: 0.24,
    roughness: 0.06,
    transparent: true,
    opacity: 0.46,
    depthWrite: false
  });
  const hedge = new THREE.MeshToonMaterial({
    color: 0x416d42,
    emissive: 0x0d2116,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP
  });
  const line = new THREE.MeshBasicMaterial({ color: 0xf0e0a8 });
  const timber = createToonMaterial("timber", rng, {
    color: 0x8c613d,
    emissive: 0x1f1208,
    emissiveIntensity: 0.1,
    bumpScale: 0.055
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x94a3a2,
    emissive: 0x10191d,
    emissiveIntensity: 0.1,
    metalness: 0.32,
    roughness: 0.38
  });
  const brick = createToonMaterial("brick", rng, {
    color: 0xa95846,
    emissive: 0x20100d,
    emissiveIntensity: 0.12,
    bumpScale: 0.06
  });
  const basalt = createToonMaterial("basalt", rng, {
    color: 0x5c7278,
    emissive: 0x0b171b,
    emissiveIntensity: 0.16,
    bumpScale: 0.075
  });
  const darkOpening = new THREE.MeshBasicMaterial({ color: 0x071217 });
  const zombie = new THREE.MeshToonMaterial({
    color: 0x8b9a68,
    emissive: 0x182317,
    emissiveIntensity: 0.16,
    gradientMap: TOON_RAMP
  });
  const zombieDark = new THREE.MeshToonMaterial({
    color: 0x3e4d39,
    emissive: 0x0a120e,
    emissiveIntensity: 0.16,
    gradientMap: TOON_RAMP
  });
  return {
    grass,
    grassBlade,
    path,
    gravel,
    asphalt,
    concrete,
    court,
    rubber,
    mulch,
    dirt,
    leafLitter,
    wornGrass,
    puddle,
    hedge,
    line,
    timber,
    metal,
    brick,
    basalt,
    darkOpening,
    zombie,
    zombieDark
  };
}

interface ToonMaterialOptions {
  color: THREE.ColorRepresentation;
  emissive: THREE.ColorRepresentation;
  emissiveIntensity: number;
  bumpScale: number;
}

function createToonMaterial(kind: TextureKind, rng: RandomSource, options: ToonMaterialOptions): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    map: createCanvasTexture(kind, rng),
    bumpMap: createBumpTexture(kind, rng),
    bumpScale: options.bumpScale,
    color: options.color,
    emissive: options.emissive,
    emissiveIntensity: options.emissiveIntensity,
    gradientMap: TOON_RAMP
  });
}

function createCanvasTexture(kind: TextureKind, rng: RandomSource): THREE.CanvasTexture {
  const specs = {
    grass: { base: "#5f7c58", wash: "#7d9969", shade: "#243b36", fleck: [201, 220, 154], repeat: 30, count: 760 },
    path: { base: "#9a8463", wash: "#c3a872", shade: "#44301f", fleck: [219, 194, 128], repeat: 11, count: 760 },
    gravel: { base: "#827969", wash: "#aaa085", shade: "#3b3934", fleck: [217, 209, 176], repeat: 15, count: 980 },
    asphalt: { base: "#233540", wash: "#3e5a62", shade: "#0c161b", fleck: [118, 151, 153], repeat: 18, count: 920 },
    concrete: { base: "#929a96", wash: "#c3c6b4", shade: "#39484b", fleck: [226, 222, 198], repeat: 10, count: 760 },
    rubber: { base: "#7e4442", wash: "#b1564b", shade: "#261018", fleck: [215, 131, 111], repeat: 12, count: 800 },
    mulch: { base: "#63462d", wash: "#8d6840", shade: "#24150b", fleck: [172, 121, 68], repeat: 13, count: 820 },
    basalt: { base: "#4d646b", wash: "#7b8c89", shade: "#18272d", fleck: [173, 190, 181], repeat: 7, count: 960 },
    brick: { base: "#94503f", wash: "#c66b50", shade: "#2e1815", fleck: [225, 151, 116], repeat: 8, count: 780 },
    timber: { base: "#755136", wash: "#a9784b", shade: "#28160c", fleck: [201, 142, 86], repeat: 9, count: 720 }
  } as const;
  const spec = specs[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 32; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? `${spec.wash}${toAlphaHex(rng.range(0.06, 0.14))}` : `${spec.shade}${toAlphaHex(rng.range(0.045, 0.11))}`;
    ctx.beginPath();
    ctx.ellipse(rng.range(-32, 288), rng.range(-24, 280), rng.range(28, 96), rng.range(8, 34), rng.range(-0.7, 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < spec.count; i += 1) {
    const alpha = rng.range(0.04, 0.16);
    const [r, g, b] = spec.fleck;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const size = kind === "asphalt" || kind === "gravel" ? rng.range(1, 3) : rng.range(1, 4);
    ctx.fillRect(rng.range(0, 256), rng.range(0, 256), size, size);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "concrete" || kind === "asphalt" || kind === "basalt" || kind === "brick") {
    ctx.strokeStyle = kind === "brick" ? "rgba(45, 23, 19, 0.18)" : "rgba(218, 230, 216, 0.1)";
    for (let i = 0; i < 18; i += 1) {
      ctx.lineWidth = rng.range(0.7, 2.2);
      ctx.beginPath();
      ctx.moveTo(rng.range(0, 256), rng.range(0, 256));
      ctx.bezierCurveTo(rng.range(0, 256), rng.range(0, 256), rng.range(0, 256), rng.range(0, 256), rng.range(0, 256), rng.range(0, 256));
      ctx.stroke();
    }
  }
  if (kind === "grass") {
    for (let row = -32; row < 288; row += 18) {
      ctx.fillStyle = row % 36 === 0 ? "rgba(222, 235, 163, 0.055)" : "rgba(20, 54, 45, 0.07)";
      ctx.save();
      ctx.translate(128, row);
      ctx.rotate(-0.12);
      ctx.fillRect(-180, -4, 360, 8);
      ctx.restore();
    }
  }
  if (kind === "path" || kind === "gravel" || kind === "timber") {
    for (let i = 0; i < 34; i += 1) {
      ctx.strokeStyle = `rgba(33, 26, 20, ${rng.range(0.06, 0.16)})`;
      ctx.lineWidth = rng.range(0.7, 1.9);
      ctx.beginPath();
      const startX = rng.range(-20, 256);
      const startY = rng.range(0, 256);
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(startX + rng.range(20, 80), startY + rng.range(-12, 12), startX + rng.range(80, 170), startY + rng.range(-14, 18), startX + rng.range(120, 270), startY + rng.range(-12, 12));
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(spec.repeat, spec.repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBumpTexture(kind: TextureKind, rng: RandomSource): THREE.CanvasTexture {
  const texture = createCanvasTexture(kind, rng);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function createToonRamp(): THREE.DataTexture {
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

function toAlphaHex(alpha: number): string {
  return Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
}
