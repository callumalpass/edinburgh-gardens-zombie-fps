import * as THREE from "three";
import type { RandomSource } from "../types";
import type { GameMaterials } from "./WorldBuilder";

export function createGameMaterials(rng: RandomSource): GameMaterials {
  const grass = new THREE.MeshStandardMaterial({
    map: createCanvasTexture("grass", rng),
    color: 0x789162,
    roughness: 0.94
  });
  const path = new THREE.MeshStandardMaterial({
    map: createCanvasTexture("path", rng),
    color: 0xc4a66e,
    roughness: 0.88
  });
  const gravel = new THREE.MeshStandardMaterial({
    map: createCanvasTexture("gravel", rng),
    color: 0xb59a68,
    roughness: 0.96
  });
  const asphalt = new THREE.MeshStandardMaterial({
    map: createCanvasTexture("asphalt", rng),
    color: 0x30332f,
    roughness: 0.84
  });
  const concrete = new THREE.MeshStandardMaterial({
    map: createCanvasTexture("concrete", rng),
    color: 0x9e9b8d,
    roughness: 0.91
  });
  const court = new THREE.MeshStandardMaterial({ color: 0x396f55, roughness: 0.72 });
  const rubber = new THREE.MeshStandardMaterial({
    map: createCanvasTexture("rubber", rng),
    color: 0x724b3f,
    roughness: 0.86
  });
  const mulch = new THREE.MeshStandardMaterial({
    map: createCanvasTexture("mulch", rng),
    color: 0x6a4c35,
    roughness: 0.96
  });
  const dirt = new THREE.MeshStandardMaterial({ color: 0x655741, roughness: 0.98, transparent: true, opacity: 0.58 });
  const leafLitter = new THREE.MeshStandardMaterial({ color: 0x5f5432, roughness: 0.98, transparent: true, opacity: 0.44 });
  const wornGrass = new THREE.MeshStandardMaterial({ color: 0x75815a, roughness: 0.98, transparent: true, opacity: 0.46 });
  const puddle = new THREE.MeshStandardMaterial({
    color: 0x1e302d,
    metalness: 0.12,
    roughness: 0.18,
    transparent: true,
    opacity: 0.32,
    depthWrite: false
  });
  const hedge = new THREE.MeshStandardMaterial({ color: 0x385a32, roughness: 0.9 });
  const line = new THREE.MeshBasicMaterial({ color: 0xe8e0b6 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x7b5636, roughness: 0.78 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a928a, metalness: 0.35, roughness: 0.48 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x9b5a43, roughness: 0.8 });
  const basalt = new THREE.MeshStandardMaterial({
    map: createCanvasTexture("basalt", rng),
    color: 0x56615d,
    roughness: 0.93
  });
  const darkOpening = new THREE.MeshBasicMaterial({ color: 0x141813 });
  const zombie = new THREE.MeshStandardMaterial({ color: 0x6f7752, roughness: 0.9 });
  const zombieDark = new THREE.MeshStandardMaterial({ color: 0x33402d, roughness: 0.95 });
  return {
    grass,
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

function createCanvasTexture(kind: "grass" | "path" | "gravel" | "asphalt" | "concrete" | "rubber" | "mulch" | "basalt", rng: RandomSource): THREE.CanvasTexture {
  const specs = {
    grass: { base: "#6f865c", fleck: [38, 72, 38], repeat: 34, count: 1050 },
    path: { base: "#b79962", fleck: [83, 63, 42], repeat: 11, count: 900 },
    gravel: { base: "#aa925f", fleck: [93, 78, 55], repeat: 14, count: 1250 },
    asphalt: { base: "#2f332f", fleck: [74, 78, 72], repeat: 18, count: 1100 },
    concrete: { base: "#979486", fleck: [107, 106, 97], repeat: 10, count: 850 },
    rubber: { base: "#704b41", fleck: [54, 40, 36], repeat: 12, count: 1100 },
    mulch: { base: "#644833", fleck: [42, 29, 21], repeat: 13, count: 1000 },
    basalt: { base: "#4e5a56", fleck: [28, 35, 34], repeat: 7, count: 1250 }
  } as const;
  const spec = specs[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < spec.count; i += 1) {
    const alpha = rng.range(0.05, 0.18);
    const [r, g, b] = spec.fleck;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const size = kind === "asphalt" || kind === "gravel" ? rng.range(1, 3) : rng.range(1, 4);
    ctx.fillRect(rng.range(0, 256), rng.range(0, 256), size, size);
  }
  if (kind === "concrete" || kind === "asphalt" || kind === "basalt") {
    ctx.strokeStyle = kind === "concrete" ? "rgba(70, 72, 66, 0.12)" : "rgba(180, 180, 162, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i += 1) {
      ctx.beginPath();
      ctx.moveTo(rng.range(0, 256), rng.range(0, 256));
      ctx.lineTo(rng.range(0, 256), rng.range(0, 256));
      ctx.stroke();
    }
  }
  if (kind === "grass") {
    for (let row = -32; row < 288; row += 18) {
      ctx.fillStyle = row % 36 === 0 ? "rgba(210, 222, 170, 0.035)" : "rgba(24, 48, 29, 0.038)";
      ctx.save();
      ctx.translate(128, row);
      ctx.rotate(-0.12);
      ctx.fillRect(-180, -4, 360, 8);
      ctx.restore();
    }
  }
  if (kind === "path" || kind === "gravel") {
    for (let i = 0; i < 34; i += 1) {
      ctx.strokeStyle = `rgba(55, 45, 32, ${rng.range(0.045, 0.1)})`;
      ctx.lineWidth = rng.range(0.5, 1.6);
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
