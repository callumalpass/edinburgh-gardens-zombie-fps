import {
  Color3,
  DynamicTexture,
  Material,
  Scene,
  StandardMaterial,
  Texture
} from "@babylonjs/core";
import type { RandomSource } from "../../types";

export type BabylonMaterialKey =
  | "grass"
  | "grassBlade"
  | "path"
  | "gravel"
  | "asphalt"
  | "concrete"
  | "court"
  | "rubber"
  | "mulch"
  | "dirt"
  | "leafLitter"
  | "wornGrass"
  | "puddle"
  | "hedge"
  | "line"
  | "timber"
  | "metal"
  | "brick"
  | "basalt"
  | "darkOpening"
  | "zombie"
  | "zombieDark"
  | "cloth"
  | "clothDark"
  | "blood"
  | "paper"
  | "signPaint"
  | "windowGlow"
  | "water"
  | "glow";

export type BabylonGameMaterials = Record<BabylonMaterialKey, StandardMaterial>;

type TextureKind = "grass" | "path" | "gravel" | "asphalt" | "concrete" | "rubber" | "mulch" | "basalt" | "brick" | "timber";

interface PaintMaterialOptions {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  texture?: TextureKind;
  alpha?: number;
  doubleSided?: boolean;
  specular?: string;
}

export function createBabylonGameMaterials(scene: Scene, rng: RandomSource): BabylonGameMaterials {
  return {
    grass: createPaintMaterial(scene, rng, "grass", {
      color: "#6f8f62",
      emissive: "#15251e",
      emissiveIntensity: 0.2,
      texture: "grass"
    }),
    grassBlade: createPaintMaterial(scene, rng, "grassBlade", {
      color: "#86aa67",
      emissive: "#263f2d",
      emissiveIntensity: 0.28,
      alpha: 0.92,
      doubleSided: true
    }),
    path: createPaintMaterial(scene, rng, "path", {
      color: "#a48f68",
      emissive: "#221b12",
      emissiveIntensity: 0.14,
      texture: "path"
    }),
    gravel: createPaintMaterial(scene, rng, "gravel", {
      color: "#8f846d",
      emissive: "#191914",
      emissiveIntensity: 0.12,
      texture: "gravel"
    }),
    asphalt: createPaintMaterial(scene, rng, "asphalt", {
      color: "#293c45",
      emissive: "#09161b",
      emissiveIntensity: 0.24,
      texture: "asphalt"
    }),
    concrete: createPaintMaterial(scene, rng, "concrete", {
      color: "#9ca19a",
      emissive: "#171d1e",
      emissiveIntensity: 0.12,
      texture: "concrete"
    }),
    court: createPaintMaterial(scene, rng, "court", {
      color: "#3f8068",
      emissive: "#102b27",
      emissiveIntensity: 0.18
    }),
    rubber: createPaintMaterial(scene, rng, "rubber", {
      color: "#8c4944",
      emissive: "#1f0e12",
      emissiveIntensity: 0.14,
      texture: "rubber"
    }),
    mulch: createPaintMaterial(scene, rng, "mulch", {
      color: "#725033",
      emissive: "#1a1009",
      emissiveIntensity: 0.14,
      texture: "mulch"
    }),
    dirt: createPaintMaterial(scene, rng, "dirt", {
      color: "#64523d",
      emissive: "#15100b",
      emissiveIntensity: 0.14,
      alpha: 0.68,
      doubleSided: true
    }),
    leafLitter: createPaintMaterial(scene, rng, "leafLitter", {
      color: "#756b43",
      emissive: "#161207",
      emissiveIntensity: 0.14,
      alpha: 0.58,
      doubleSided: true
    }),
    wornGrass: createPaintMaterial(scene, rng, "wornGrass", {
      color: "#858563",
      emissive: "#191b10",
      emissiveIntensity: 0.14,
      alpha: 0.5,
      doubleSided: true
    }),
    puddle: createPaintMaterial(scene, rng, "puddle", {
      color: "#15343c",
      emissive: "#061216",
      emissiveIntensity: 0.34,
      alpha: 0.46,
      doubleSided: true,
      specular: "#b7f2ff"
    }),
    hedge: createPaintMaterial(scene, rng, "hedge", {
      color: "#416d42",
      emissive: "#0d2116",
      emissiveIntensity: 0.14
    }),
    line: createPaintMaterial(scene, rng, "line", {
      color: "#f0e0a8",
      emissive: "#423117",
      emissiveIntensity: 0.16
    }),
    timber: createPaintMaterial(scene, rng, "timber", {
      color: "#8c613d",
      emissive: "#1f1208",
      emissiveIntensity: 0.12,
      texture: "timber"
    }),
    metal: createPaintMaterial(scene, rng, "metal", {
      color: "#94a3a2",
      emissive: "#10191d",
      emissiveIntensity: 0.12,
      specular: "#6b797a"
    }),
    brick: createPaintMaterial(scene, rng, "brick", {
      color: "#a95846",
      emissive: "#20100d",
      emissiveIntensity: 0.14,
      texture: "brick"
    }),
    basalt: createPaintMaterial(scene, rng, "basalt", {
      color: "#5c7278",
      emissive: "#0b171b",
      emissiveIntensity: 0.18,
      texture: "basalt"
    }),
    darkOpening: createPaintMaterial(scene, rng, "darkOpening", {
      color: "#071217",
      emissive: "#010407",
      emissiveIntensity: 0.18
    }),
    zombie: createPaintMaterial(scene, rng, "zombie", {
      color: "#8a806f",
      emissive: "#191815",
      emissiveIntensity: 0.12
    }),
    zombieDark: createPaintMaterial(scene, rng, "zombieDark", {
      color: "#443c33",
      emissive: "#0b0b0a",
      emissiveIntensity: 0.12
    }),
    cloth: createPaintMaterial(scene, rng, "cloth", {
      color: "#495659",
      emissive: "#0d1214",
      emissiveIntensity: 0.1,
      texture: "timber"
    }),
    clothDark: createPaintMaterial(scene, rng, "clothDark", {
      color: "#242a2b",
      emissive: "#050708",
      emissiveIntensity: 0.12,
      texture: "asphalt"
    }),
    blood: createPaintMaterial(scene, rng, "blood", {
      color: "#56221d",
      emissive: "#150506",
      emissiveIntensity: 0.18,
      alpha: 0.68,
      doubleSided: true,
      specular: "#8d4740"
    }),
    paper: createPaintMaterial(scene, rng, "paper", {
      color: "#d6c9a2",
      emissive: "#352d20",
      emissiveIntensity: 0.12,
      alpha: 0.88,
      doubleSided: true
    }),
    signPaint: createPaintMaterial(scene, rng, "signPaint", {
      color: "#1f4d47",
      emissive: "#061615",
      emissiveIntensity: 0.18,
      texture: "timber"
    }),
    windowGlow: createPaintMaterial(scene, rng, "windowGlow", {
      color: "#f1c579",
      emissive: "#f1a642",
      emissiveIntensity: 0.62,
      alpha: 0.82,
      doubleSided: true,
      specular: "#ffe4a3"
    }),
    water: createPaintMaterial(scene, rng, "water", {
      color: "#2f7585",
      emissive: "#0b2830",
      emissiveIntensity: 0.34,
      alpha: 0.62,
      doubleSided: true,
      specular: "#c9f6ff"
    }),
    glow: createPaintMaterial(scene, rng, "glow", {
      color: "#f0c96a",
      emissive: "#f0a640",
      emissiveIntensity: 0.95,
      alpha: 0.72,
      doubleSided: true,
      specular: "#fff0b0"
    })
  };
}

function createPaintMaterial(scene: Scene, rng: RandomSource, name: string, options: PaintMaterialOptions): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(options.color);
  material.ambientColor = material.diffuseColor.scale(0.38);
  material.emissiveColor = Color3.FromHexString(options.emissive).scale(options.emissiveIntensity + 0.08);
  material.specularColor = options.specular ? Color3.FromHexString(options.specular).scale(0.28) : new Color3(0.018, 0.018, 0.018);
  material.specularPower = 48;
  material.backFaceCulling = false;
  material.disableLighting = false;

  if (options.texture) {
    material.diffuseTexture = createCanvasTexture(scene, options.texture, rng);
  }

  if (options.alpha !== undefined) {
    material.alpha = options.alpha;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.needDepthPrePass = true;
  }

  return material;
}

function createCanvasTexture(scene: Scene, kind: TextureKind, rng: RandomSource): DynamicTexture {
  const specs = {
    grass: { base: "#5f7c58", wash: "#7d9969", shade: "#243b36", fleck: [201, 220, 154], repeat: 8, count: 620 },
    path: { base: "#9a8463", wash: "#c3a872", shade: "#44301f", fleck: [219, 194, 128], repeat: 5, count: 720 },
    gravel: { base: "#827969", wash: "#aaa085", shade: "#3b3934", fleck: [217, 209, 176], repeat: 6, count: 920 },
    asphalt: { base: "#233540", wash: "#3e5a62", shade: "#0c161b", fleck: [118, 151, 153], repeat: 6, count: 860 },
    concrete: { base: "#929a96", wash: "#c3c6b4", shade: "#39484b", fleck: [226, 222, 198], repeat: 4, count: 720 },
    rubber: { base: "#7e4442", wash: "#b1564b", shade: "#261018", fleck: [215, 131, 111], repeat: 5, count: 760 },
    mulch: { base: "#63462d", wash: "#8d6840", shade: "#24150b", fleck: [172, 121, 68], repeat: 6, count: 780 },
    basalt: { base: "#4d646b", wash: "#7b8c89", shade: "#18272d", fleck: [173, 190, 181], repeat: 4, count: 880 },
    brick: { base: "#94503f", wash: "#c66b50", shade: "#2e1815", fleck: [225, 151, 116], repeat: 4, count: 720 },
    timber: { base: "#755136", wash: "#a9784b", shade: "#28160c", fleck: [201, 142, 86], repeat: 4, count: 680 }
  } as const;
  const spec = specs[kind];
  const texture = new DynamicTexture(`${kind}-paint`, { width: 256, height: 256 }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 32; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? withAlpha(spec.wash, rng.range(0.06, 0.14)) : withAlpha(spec.shade, rng.range(0.045, 0.11));
    ctx.beginPath();
    ctx.ellipse(rng.range(-32, 288), rng.range(-24, 280), rng.range(28, 96), rng.range(8, 34), rng.range(-0.7, 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < spec.count; i += 1) {
    const [r, g, b] = spec.fleck;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${rng.range(0.04, 0.16)})`;
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

  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = spec.repeat;
  texture.vScale = spec.repeat;
  return texture;
}

function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
