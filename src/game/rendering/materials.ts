import * as THREE from "three";
import type { RandomSource } from "../types";
import { MELBOURNE_ANIME_PALETTE, createAnimeToonRamp } from "./animeStyle";
import type { GameMaterials } from "./WorldBuilder";

type TextureKind =
  | "grass"
  | "path"
  | "gravel"
  | "asphalt"
  | "concrete"
  | "rubber"
  | "mulch"
  | "basalt"
  | "brick"
  | "timber"
  | "court";

interface CanvasTextureSpec {
  base: string;
  wash: string;
  shade: string;
  fleck: [number, number, number];
  repeat: number;
  count: number;
  brushLight: string;
  brushDark: string;
  angle: number;
}

const TOON_RAMP = createAnimeToonRamp();

export function createGameMaterials(rng: RandomSource): GameMaterials {
  const grass = createToonMaterial("grass", rng, {
    color: 0x829a70,
    emissive: 0x1c342f,
    emissiveIntensity: 0.14,
    bumpScale: 0.034
  });
  const grassBlade = new THREE.MeshToonMaterial({
    color: 0xffffff,
    emissive: 0x345743,
    emissiveIntensity: 0.2,
    gradientMap: TOON_RAMP,
    side: THREE.DoubleSide,
    vertexColors: true
  });
  const path = createToonMaterial("path", rng, {
    color: 0xc4ad76,
    emissive: 0x302719,
    emissiveIntensity: 0.11,
    bumpScale: 0.03
  });
  const gravel = createToonMaterial("gravel", rng, {
    color: 0xa99f89,
    emissive: 0x1e1f1a,
    emissiveIntensity: 0.1,
    bumpScale: 0.042
  });
  const asphalt = createToonMaterial("asphalt", rng, {
    color: 0x2a4650,
    emissive: 0x0a1c22,
    emissiveIntensity: 0.2,
    bumpScale: 0.052
  });
  const concrete = createToonMaterial("concrete", rng, {
    color: 0xb4b19e,
    emissive: 0x1c2424,
    emissiveIntensity: 0.1,
    bumpScale: 0.026
  });
  const court = createToonMaterial("court", rng, {
    color: 0x3d876e,
    emissive: 0x12342e,
    emissiveIntensity: 0.16,
    bumpScale: 0.024
  });
  const rubber = createToonMaterial("rubber", rng, {
    color: 0xae634e,
    emissive: 0x281014,
    emissiveIntensity: 0.12,
    bumpScale: 0.026
  });
  const mulch = createToonMaterial("mulch", rng, {
    color: 0x785636,
    emissive: 0x1a1009,
    emissiveIntensity: 0.12,
    bumpScale: 0.07
  });
  const dirt = new THREE.MeshToonMaterial({
    map: createCanvasTexture("path", rng),
    color: 0x6c5a43,
    emissive: 0x15100b,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    vertexColors: true,
    transparent: true,
    opacity: 0.62
  });
  const leafLitter = new THREE.MeshToonMaterial({
    map: createCanvasTexture("mulch", rng),
    color: 0x9f9463,
    emissive: 0x161207,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    vertexColors: true,
    transparent: true,
    opacity: 0.56
  });
  const wornGrass = new THREE.MeshToonMaterial({
    map: createCanvasTexture("grass", rng),
    color: 0xa69b70,
    emissive: 0x191b10,
    emissiveIntensity: 0.12,
    gradientMap: TOON_RAMP,
    vertexColors: true,
    transparent: true,
    opacity: 0.48
  });
  const puddle = new THREE.MeshStandardMaterial({
    color: 0x1d5360,
    emissive: 0x061216,
    emissiveIntensity: 0.3,
    metalness: 0.2,
    roughness: 0.06,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const hedge = new THREE.MeshToonMaterial({
    map: createCanvasTexture("grass", rng),
    color: 0x517a50,
    emissive: 0x0f2418,
    emissiveIntensity: 0.11,
    gradientMap: TOON_RAMP
  });
  const line = new THREE.MeshBasicMaterial({ color: MELBOURNE_ANIME_PALETTE.tramOchre });
  const timber = createToonMaterial("timber", rng, {
    color: 0x986a43,
    emissive: 0x1f1208,
    emissiveIntensity: 0.1,
    bumpScale: 0.038
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x9dad9f,
    emissive: 0x10191d,
    emissiveIntensity: 0.1,
    metalness: 0.32,
    roughness: 0.38
  });
  const brick = createToonMaterial("brick", rng, {
    color: 0xb5634a,
    emissive: 0x27100d,
    emissiveIntensity: 0.12,
    bumpScale: 0.04
  });
  const basalt = createToonMaterial("basalt", rng, {
    color: MELBOURNE_ANIME_PALETTE.wetBluestone,
    emissive: 0x0c1d22,
    emissiveIntensity: 0.15,
    bumpScale: 0.052
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
    color: options.color,
    emissive: options.emissive,
    emissiveIntensity: options.emissiveIntensity,
    gradientMap: TOON_RAMP,
    vertexColors: true
  });
}

function createCanvasTexture(kind: TextureKind, rng: RandomSource): THREE.CanvasTexture {
  const specs: Record<TextureKind, CanvasTextureSpec> = {
    grass: { base: "#728d65", wash: "#acba7a", shade: "#203f37", fleck: [224, 231, 157], repeat: 6, count: 320, brushLight: "#c9cb80", brushDark: "#2d624d", angle: -0.18 },
    path: { base: "#bfa66f", wash: "#e2c27f", shade: "#4b3521", fleck: [233, 204, 132], repeat: 4, count: 340, brushLight: "#f1d79a", brushDark: "#72563a", angle: -0.08 },
    gravel: { base: "#9c9583", wash: "#c9be97", shade: "#3a433f", fleck: [226, 217, 184], repeat: 5, count: 420, brushLight: "#dfd2aa", brushDark: "#63645e", angle: 0.04 },
    asphalt: { base: "#2a4650", wash: "#607d86", shade: "#0a1a20", fleck: [143, 174, 172], repeat: 5, count: 390, brushLight: "#7e999f", brushDark: "#132c35", angle: 0.02 },
    concrete: { base: "#a9ada2", wash: "#d9d4bd", shade: "#344a4b", fleck: [235, 229, 200], repeat: 4, count: 310, brushLight: "#ded8bd", brushDark: "#5e706d", angle: -0.05 },
    rubber: { base: "#9f5548", wash: "#cf7358", shade: "#2c1016", fleck: [229, 143, 112], repeat: 4, count: 300, brushLight: "#e9936f", brushDark: "#642d2c", angle: 0.08 },
    mulch: { base: "#705034", wash: "#a97a49", shade: "#24150b", fleck: [184, 130, 70], repeat: 5, count: 340, brushLight: "#bf8950", brushDark: "#3b2514", angle: -0.2 },
    basalt: { base: "#5d747b", wash: "#97a49d", shade: "#152b32", fleck: [190, 203, 192], repeat: 4, count: 390, brushLight: "#a4afa4", brushDark: "#294a51", angle: -0.03 },
    brick: { base: "#ad6049", wash: "#d9825d", shade: "#341715", fleck: [236, 156, 116], repeat: 4, count: 310, brushLight: "#e28d65", brushDark: "#6f2e29", angle: 0.01 },
    timber: { base: "#875f3f", wash: "#bc8954", shade: "#2b170c", fleck: [215, 153, 88], repeat: 4, count: 300, brushLight: "#ce965d", brushDark: "#56351f", angle: 0.04 },
    court: { base: "#3f846d", wash: "#69af89", shade: "#10372f", fleck: [183, 225, 188], repeat: 4, count: 300, brushLight: "#86ca9f", brushDark: "#1e6252", angle: 0.03 }
  };
  const spec = specs[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTransparentWash(ctx, rng, spec);
  drawQuietPaintPlanes(ctx, rng, spec, kind);
  drawBroadBrushFields(ctx, rng, spec, kind);

  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? `${spec.wash}${toAlphaHex(rng.range(0.06, 0.14))}` : `${spec.shade}${toAlphaHex(rng.range(0.045, 0.11))}`;
    ctx.beginPath();
    ctx.ellipse(rng.range(-32, 288), rng.range(-24, 280), rng.range(28, 96), rng.range(8, 34), rng.range(-0.7, 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  drawDryBrush(ctx, rng, spec);
  drawPigmentEdges(ctx, rng, spec);
  drawWatercolourBlooms(ctx, rng, spec, kind);
  drawBrokenInkEdges(ctx, rng, spec, kind);
  drawMelbourneMaterialMarks(ctx, rng, kind);

  const fleckCount = Math.round(spec.count * (kind === "gravel" || kind === "asphalt" || kind === "basalt" ? 0.72 : 0.56));
  for (let i = 0; i < fleckCount; i += 1) {
    const alpha = rng.range(0.025, kind === "gravel" || kind === "basalt" ? 0.13 : 0.105);
    const [r, g, b] = spec.fleck;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const size = kind === "asphalt" || kind === "gravel" ? rng.range(1, 3) : rng.range(1, 4);
    if (rng.next() > 0.72) {
      ctx.beginPath();
      ctx.ellipse(rng.range(0, 256), rng.range(0, 256), size * rng.range(1.2, 2.8), size * rng.range(0.35, 0.9), rng.range(-0.7, 0.7), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(rng.range(0, 256), rng.range(0, 256), size, size);
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "concrete" || kind === "asphalt" || kind === "basalt" || kind === "brick" || kind === "court") {
    ctx.strokeStyle = kind === "brick" ? "rgba(45, 23, 19, 0.18)" : "rgba(218, 230, 216, 0.1)";
    for (let i = 0; i < (kind === "court" ? 11 : 18); i += 1) {
      ctx.lineWidth = rng.range(0.7, 2.2);
      ctx.beginPath();
      ctx.moveTo(rng.range(0, 256), rng.range(0, 256));
      ctx.bezierCurveTo(rng.range(0, 256), rng.range(0, 256), rng.range(0, 256), rng.range(0, 256), rng.range(0, 256), rng.range(0, 256));
      ctx.stroke();
    }
  }
  if (kind === "grass" || kind === "mulch") {
    drawGumLeafMarks(ctx, rng, kind === "grass" ? 40 : 48);
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

function drawTransparentWash(ctx: CanvasRenderingContext2D, rng: RandomSource, spec: CanvasTextureSpec): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 7; i += 1) {
    const x = rng.range(-24, 232);
    const y = rng.range(-18, 236);
    const width = rng.range(86, 180);
    const height = rng.range(38, 118);
    ctx.fillStyle = `${i % 2 === 0 ? spec.wash : spec.shade}${toAlphaHex(rng.range(0.035, 0.075))}`;
    ctx.beginPath();
    ctx.moveTo(x + rng.range(0, 14), y);
    ctx.bezierCurveTo(x + width * 0.38, y + rng.range(-12, 18), x + width * 0.72, y + rng.range(-10, 20), x + width, y + height * 0.22);
    ctx.bezierCurveTo(x + width * 0.92, y + height * 0.82, x + width * 0.38, y + height + rng.range(-8, 12), x + rng.range(-8, 16), y + height);
    ctx.bezierCurveTo(x - rng.range(8, 24), y + height * 0.54, x - rng.range(4, 18), y + height * 0.18, x + rng.range(0, 14), y);
    ctx.fill();
  }
  ctx.restore();
}

function drawQuietPaintPlanes(ctx: CanvasRenderingContext2D, rng: RandomSource, spec: CanvasTextureSpec, kind: TextureKind): void {
  const count = kind === "grass" || kind === "path" ? 6 : 4;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = `${i % 2 === 0 ? spec.brushLight : spec.brushDark}${toAlphaHex(rng.range(0.025, 0.065))}`;
    ctx.beginPath();
    ctx.ellipse(
      rng.range(-36, 292),
      rng.range(-28, 286),
      rng.range(76, 170),
      rng.range(18, 58),
      spec.angle + rng.range(-0.18, 0.18),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawBroadBrushFields(ctx: CanvasRenderingContext2D, rng: RandomSource, spec: CanvasTextureSpec, kind: TextureKind): void {
  const count = kind === "grass" || kind === "path" || kind === "asphalt" ? 9 : 6;
  ctx.save();
  ctx.translate(128, 128);
  ctx.rotate(spec.angle + rng.range(-0.08, 0.08));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < count; i += 1) {
    const y = rng.range(-146, 146);
    const x = rng.range(-188, -40);
    const length = rng.range(190, 340);
    const alpha = rng.range(0.028, kind === "grass" || kind === "path" ? 0.082 : 0.064);
    ctx.strokeStyle = `${i % 2 === 0 ? spec.brushLight : spec.brushDark}${toAlphaHex(alpha)}`;
    ctx.lineWidth = rng.range(7, kind === "grass" || kind === "path" ? 22 : 16);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + length * 0.25,
      y + rng.range(-18, 18),
      x + length * 0.68,
      y + rng.range(-22, 22),
      x + length,
      y + rng.range(-14, 14)
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawPigmentEdges(ctx: CanvasRenderingContext2D, rng: RandomSource, spec: CanvasTextureSpec): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < 4; i += 1) {
    const inset = rng.range(4, 28);
    const alpha = rng.range(0.035, 0.08);
    ctx.strokeStyle = `${i % 2 === 0 ? spec.shade : spec.wash}${toAlphaHex(alpha)}`;
    ctx.lineWidth = rng.range(2.5, 7);
    ctx.beginPath();
    ctx.moveTo(inset, rng.range(0, 256));
    ctx.bezierCurveTo(rng.range(30, 96), rng.range(18, 92), rng.range(138, 220), rng.range(6, 70), 256 - inset, rng.range(0, 256));
    ctx.stroke();
  }
  ctx.restore();
}

function drawWatercolourBlooms(ctx: CanvasRenderingContext2D, rng: RandomSource, spec: CanvasTextureSpec, kind: TextureKind): void {
  const bloomCount = kind === "grass" || kind === "path" ? 10 : kind === "asphalt" || kind === "basalt" ? 7 : 6;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < bloomCount; i += 1) {
    const x = rng.range(-20, 276);
    const y = rng.range(-18, 274);
    const radius = rng.range(14, kind === "grass" ? 44 : 34);
    const gradient = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
    const light = `${spec.brushLight}${toAlphaHex(rng.range(0.018, 0.05))}`;
    const dark = `${spec.brushDark}${toAlphaHex(rng.range(0.018, 0.06))}`;
    gradient.addColorStop(0, i % 2 === 0 ? light : dark);
    gradient.addColorStop(0.68, i % 2 === 0 ? `${spec.wash}${toAlphaHex(0.018)}` : `${spec.shade}${toAlphaHex(0.02)}`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * rng.range(0.8, 1.6), radius * rng.range(0.28, 0.9), rng.range(-0.7, 0.7), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBrokenInkEdges(ctx: CanvasRenderingContext2D, rng: RandomSource, spec: CanvasTextureSpec, kind: TextureKind): void {
  const isHardSurface = kind === "asphalt" || kind === "concrete" || kind === "basalt" || kind === "brick" || kind === "court";
  const count = isHardSurface ? 28 : 18;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < count; i += 1) {
    const y = rng.range(-12, 268);
    const x = rng.range(-22, 238);
    const length = rng.range(isHardSurface ? 26 : 18, isHardSurface ? 92 : 68);
    ctx.strokeStyle = `${spec.shade}${toAlphaHex(rng.range(isHardSurface ? 0.055 : 0.035, isHardSurface ? 0.14 : 0.09))}`;
    ctx.lineWidth = rng.range(0.45, isHardSurface ? 1.6 : 1.1);
    ctx.setLineDash([rng.range(5, 18), rng.range(3, 11), rng.range(1, 4), rng.range(4, 14)]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + length * 0.26,
      y + rng.range(-9, 9),
      x + length * 0.68,
      y + rng.range(-12, 12),
      x + length,
      y + rng.range(-7, 7)
    );
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawDryBrush(
  ctx: CanvasRenderingContext2D,
  rng: RandomSource,
  spec: CanvasTextureSpec
): void {
  ctx.save();
  ctx.translate(128, 128);
  ctx.rotate(spec.angle);
  ctx.lineCap = "round";
  for (let i = 0; i < 26; i += 1) {
    const y = rng.range(-156, 156);
    const x = rng.range(-172, 118);
    const length = rng.range(52, 188);
    ctx.strokeStyle = i % 3 === 0 ? `${spec.brushDark}${toAlphaHex(rng.range(0.022, 0.068))}` : `${spec.brushLight}${toAlphaHex(rng.range(0.028, 0.088))}`;
    ctx.lineWidth = rng.range(1.2, 5.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + length * 0.28, y + rng.range(-7, 7), x + length * 0.7, y + rng.range(-9, 9), x + length, y + rng.range(-5, 5));
    ctx.stroke();
  }
  ctx.restore();
}

function drawMelbourneMaterialMarks(ctx: CanvasRenderingContext2D, rng: RandomSource, kind: TextureKind): void {
  if (kind === "basalt" || kind === "gravel" || kind === "concrete") {
    drawBluestoneChips(ctx, rng, kind === "basalt" ? 54 : 34);
  }
  if (kind === "brick") {
    drawBrickCourses(ctx, rng);
  }
  if (kind === "court" || kind === "asphalt") {
    drawCourtAndBitumenScuffs(ctx, rng, kind === "court");
  }
  if (kind === "grass" || kind === "path") {
    drawDrySeedStrokes(ctx, rng, kind === "grass" ? 24 : 16);
  }
}

function drawBluestoneChips(ctx: CanvasRenderingContext2D, rng: RandomSource, count: number): void {
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = rng.range(-10, 266);
    const y = rng.range(-8, 264);
    const size = rng.range(2.8, 8.5);
    ctx.fillStyle = rng.next() > 0.5 ? `rgba(202, 213, 201, ${rng.range(0.06, 0.16)})` : `rgba(29, 55, 61, ${rng.range(0.05, 0.14)})`;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.46);
    ctx.lineTo(x + size * 0.66, y - size * 0.08);
    ctx.lineTo(x + size * 0.36, y + size * 0.58);
    ctx.lineTo(x - size * 0.56, y + size * 0.34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBrickCourses(ctx: CanvasRenderingContext2D, rng: RandomSource): void {
  ctx.save();
  ctx.strokeStyle = "rgba(54, 22, 18, 0.16)";
  ctx.lineWidth = 1.2;
  for (let y = 18; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(-8, y + rng.range(-1.2, 1.2));
    ctx.bezierCurveTo(64, y + rng.range(-2.5, 2.5), 176, y + rng.range(-2.5, 2.5), 264, y + rng.range(-1.2, 1.2));
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(234, 151, 113, 0.08)";
  for (let x = 0; x < 280; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x + rng.range(-3, 3), 0);
    ctx.lineTo(x + rng.range(-3, 3), 256);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCourtAndBitumenScuffs(ctx: CanvasRenderingContext2D, rng: RandomSource, court: boolean): void {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < (court ? 28 : 18); i += 1) {
    const x = rng.range(-24, 252);
    const y = rng.range(0, 256);
    ctx.strokeStyle = court ? `rgba(222, 234, 190, ${rng.range(0.045, 0.12)})` : `rgba(174, 195, 190, ${rng.range(0.04, 0.1)})`;
    ctx.lineWidth = rng.range(0.8, court ? 2.4 : 1.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + rng.range(24, 68), y + rng.range(-8, 8), x + rng.range(80, 140), y + rng.range(-10, 10), x + rng.range(120, 190), y + rng.range(-7, 7));
    ctx.stroke();
  }
  ctx.restore();
}

function drawDrySeedStrokes(ctx: CanvasRenderingContext2D, rng: RandomSource, count: number): void {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < count; i += 1) {
    const x = rng.range(-18, 268);
    const y = rng.range(-10, 266);
    const length = rng.range(16, 42);
    const angle = rng.range(-0.55, 0.25);
    ctx.strokeStyle = `rgba(221, 194, 111, ${rng.range(0.045, 0.12)})`;
    ctx.lineWidth = rng.range(0.7, 1.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
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

function toAlphaHex(alpha: number): string {
  return Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
}
