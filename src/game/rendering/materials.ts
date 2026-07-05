import * as THREE from "three";
import type { RandomSource } from "../types";
import { MELBOURNE_ANIME_PALETTE, createAnimeToonRamp } from "./animeStyle";
import type { GameMaterials } from "./WorldBuilder";

type TextureKind = "grass" | "path" | "gravel" | "asphalt" | "concrete" | "rubber" | "mulch" | "basalt" | "brick" | "timber";

const TOON_RAMP = createAnimeToonRamp();

export function createGameMaterials(rng: RandomSource): GameMaterials {
  const grass = createToonMaterial("grass", rng, {
    color: 0x78906a,
    emissive: 0x1d342f,
    emissiveIntensity: 0.2,
    bumpScale: 0.075
  });
  const grassBlade = new THREE.MeshToonMaterial({
    color: 0xffffff,
    emissive: 0x3b5d42,
    emissiveIntensity: 0.24,
    gradientMap: TOON_RAMP,
    side: THREE.DoubleSide,
    vertexColors: true
  });
  const path = createToonMaterial("path", rng, {
    color: 0xb39a6b,
    emissive: 0x2d2419,
    emissiveIntensity: 0.12,
    bumpScale: 0.05
  });
  const gravel = createToonMaterial("gravel", rng, {
    color: 0x948a77,
    emissive: 0x1e1f1a,
    emissiveIntensity: 0.1,
    bumpScale: 0.09
  });
  const asphalt = createToonMaterial("asphalt", rng, {
    color: 0x2b4650,
    emissive: 0x0a1c22,
    emissiveIntensity: 0.24,
    bumpScale: 0.07
  });
  const concrete = createToonMaterial("concrete", rng, {
    color: 0xa5aaa0,
    emissive: 0x1c2424,
    emissiveIntensity: 0.1,
    bumpScale: 0.045
  });
  const court = new THREE.MeshToonMaterial({
    color: 0x408a72,
    emissive: 0x12352e,
    emissiveIntensity: 0.18,
    gradientMap: TOON_RAMP
  });
  const rubber = createToonMaterial("rubber", rng, {
    color: 0xa04f43,
    emissive: 0x281014,
    emissiveIntensity: 0.12,
    bumpScale: 0.05
  });
  const mulch = createToonMaterial("mulch", rng, {
    color: 0x7a5739,
    emissive: 0x1a1009,
    emissiveIntensity: 0.12,
    bumpScale: 0.1
  });
  const dirt = new THREE.MeshToonMaterial({
    color: 0x6c5a43,
    emissive: 0x15100b,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    transparent: true,
    opacity: 0.62
  });
  const leafLitter = new THREE.MeshToonMaterial({
    color: 0x8b8050,
    emissive: 0x161207,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    transparent: true,
    opacity: 0.56
  });
  const wornGrass = new THREE.MeshToonMaterial({
    color: 0x97926a,
    emissive: 0x191b10,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    transparent: true,
    opacity: 0.48
  });
  const puddle = new THREE.MeshStandardMaterial({
    color: 0x174854,
    emissive: 0x061216,
    emissiveIntensity: 0.3,
    metalness: 0.2,
    roughness: 0.06,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const hedge = new THREE.MeshToonMaterial({
    color: 0x4c7249,
    emissive: 0x0d2116,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP
  });
  const line = new THREE.MeshBasicMaterial({ color: MELBOURNE_ANIME_PALETTE.tramOchre });
  const timber = createToonMaterial("timber", rng, {
    color: 0x986a43,
    emissive: 0x1f1208,
    emissiveIntensity: 0.1,
    bumpScale: 0.055
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x9aaea9,
    emissive: 0x10191d,
    emissiveIntensity: 0.1,
    metalness: 0.32,
    roughness: 0.38
  });
  const brick = createToonMaterial("brick", rng, {
    color: 0xb5634a,
    emissive: 0x27100d,
    emissiveIntensity: 0.12,
    bumpScale: 0.06
  });
  const basalt = createToonMaterial("basalt", rng, {
    color: 0x637e84,
    emissive: 0x0c1d22,
    emissiveIntensity: 0.18,
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
    grass: { base: "#667f5c", wash: "#91a870", shade: "#203a35", fleck: [216, 226, 158], repeat: 7, count: 620, brushLight: "#c7c87d", brushDark: "#2b5645", angle: -0.18 },
    path: { base: "#aa9067", wash: "#d0ad70", shade: "#4a3322", fleck: [229, 199, 126], repeat: 5, count: 720, brushLight: "#edd08c", brushDark: "#6f5537", angle: -0.08 },
    gravel: { base: "#897f70", wash: "#b8ac88", shade: "#3d3d38", fleck: [222, 213, 180], repeat: 6, count: 920, brushLight: "#d9ceaa", brushDark: "#60615c", angle: 0.04 },
    asphalt: { base: "#263e48", wash: "#486973", shade: "#0a171d", fleck: [132, 165, 164], repeat: 6, count: 860, brushLight: "#78939a", brushDark: "#132831", angle: 0.02 },
    concrete: { base: "#9aa49d", wash: "#cfd0b7", shade: "#3a4d4d", fleck: [232, 225, 198], repeat: 4, count: 720, brushLight: "#d9d5b8", brushDark: "#61706d", angle: -0.05 },
    rubber: { base: "#914943", wash: "#c6644e", shade: "#2d1017", fleck: [225, 137, 110], repeat: 5, count: 760, brushLight: "#e48b68", brushDark: "#642c2b", angle: 0.08 },
    mulch: { base: "#6b4c31", wash: "#9d7345", shade: "#24150b", fleck: [180, 125, 68], repeat: 6, count: 780, brushLight: "#b9854b", brushDark: "#3c2514", angle: -0.2 },
    basalt: { base: "#557079", wash: "#879690", shade: "#172b31", fleck: [184, 198, 188], repeat: 4, count: 880, brushLight: "#9eaaa0", brushDark: "#2e4a50", angle: -0.03 },
    brick: { base: "#a75a45", wash: "#d27352", shade: "#341715", fleck: [232, 151, 113], repeat: 4, count: 720, brushLight: "#df875f", brushDark: "#6f2e29", angle: 0.01 },
    timber: { base: "#825a3a", wash: "#b17d4b", shade: "#2b170c", fleck: [211, 147, 84], repeat: 4, count: 680, brushLight: "#cc9258", brushDark: "#55331e", angle: 0.04 }
  } as const;
  const spec = specs[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawPaperGrain(ctx, rng);

  for (let i = 0; i < 32; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? `${spec.wash}${toAlphaHex(rng.range(0.06, 0.14))}` : `${spec.shade}${toAlphaHex(rng.range(0.045, 0.11))}`;
    ctx.beginPath();
    ctx.ellipse(rng.range(-32, 288), rng.range(-24, 280), rng.range(28, 96), rng.range(8, 34), rng.range(-0.7, 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  drawDryBrush(ctx, rng, spec);

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
  if (kind === "grass" || kind === "mulch") {
    drawGumLeafMarks(ctx, rng, kind === "grass" ? 32 : 42);
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
  texture.anisotropy = 4;
  return texture;
}

function drawPaperGrain(ctx: CanvasRenderingContext2D, rng: RandomSource): void {
  for (let i = 0; i < 210; i += 1) {
    ctx.fillStyle = rng.next() > 0.5 ? `rgba(246, 226, 178, ${rng.range(0.012, 0.034)})` : `rgba(20, 34, 32, ${rng.range(0.012, 0.03)})`;
    ctx.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(1, 2.4), rng.range(1, 2.4));
  }
}

function drawDryBrush(
  ctx: CanvasRenderingContext2D,
  rng: RandomSource,
  spec: { brushLight: string; brushDark: string; angle: number }
): void {
  ctx.save();
  ctx.translate(128, 128);
  ctx.rotate(spec.angle);
  ctx.lineCap = "round";
  for (let i = 0; i < 54; i += 1) {
    const y = rng.range(-156, 156);
    const x = rng.range(-172, 118);
    const length = rng.range(52, 188);
    ctx.strokeStyle = i % 3 === 0 ? `${spec.brushDark}${toAlphaHex(rng.range(0.035, 0.1))}` : `${spec.brushLight}${toAlphaHex(rng.range(0.04, 0.13))}`;
    ctx.lineWidth = rng.range(1.2, 5.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + length * 0.28, y + rng.range(-7, 7), x + length * 0.7, y + rng.range(-9, 9), x + length, y + rng.range(-5, 5));
    ctx.stroke();
  }
  ctx.restore();
}

function drawGumLeafMarks(ctx: CanvasRenderingContext2D, rng: RandomSource, count: number): void {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < count; i += 1) {
    const x = rng.range(-12, 268);
    const y = rng.range(-8, 264);
    const length = rng.range(11, 26);
    const bend = rng.range(-0.35, 0.35);
    ctx.strokeStyle = rng.next() > 0.38 ? `rgba(215, 187, 105, ${rng.range(0.08, 0.17)})` : `rgba(31, 65, 52, ${rng.range(0.06, 0.14)})`;
    ctx.lineWidth = rng.range(0.8, 1.9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + length * 0.34, y - length * bend, x + length * 0.65, y + length * bend, x + length, y + rng.range(-4, 4));
    ctx.stroke();
  }
  ctx.restore();
}

function createBumpTexture(kind: TextureKind, rng: RandomSource): THREE.CanvasTexture {
  const texture = createCanvasTexture(kind, rng);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function toAlphaHex(alpha: number): string {
  return Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
}
