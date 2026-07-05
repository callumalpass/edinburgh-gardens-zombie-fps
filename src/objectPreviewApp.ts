import * as THREE from "three";
import { createLevelData } from "./game/levelData";
import { SeededRandom } from "./game/random";
import { createGameMaterials } from "./game/rendering/materials";
import { createObjectPreviewTargets, type ObjectPreviewTarget } from "./game/rendering/objectPreview";
import { WorldBuilder } from "./game/rendering/WorldBuilder";
import { TerrainSampler } from "./game/terrain";

const CANVAS_SIZE = 640;
const ANGLES = ["front", "right", "rear", "left"] as const;

interface PreviewSignal {
  nonBlank: number;
  varied: number;
}

interface PreviewRenderResult {
  target: ObjectPreviewTarget;
  angle: string;
  dataUrl: string;
  signal: PreviewSignal;
}

interface ObjectPreviewApi {
  ready: true;
  targets: () => ObjectPreviewTarget[];
  render: (targetId: string, angleIndex: number) => Promise<PreviewRenderResult>;
}

declare global {
  interface Window {
    __OBJECT_PREVIEW__?: ObjectPreviewApi;
  }
}

const level = createLevelData();
const terrain = new TerrainSampler(level);
const targets = createObjectPreviewTargets(level);
const targetById = new Map(targets.map((target) => [target.id, target]));
const root = document.querySelector<HTMLDivElement>("#preview-root") ?? document.body;
const canvas = document.createElement("canvas");
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;
canvas.style.display = "block";
canvas.style.width = `${CANVAS_SIZE}px`;
canvas.style.height = `${CANVAS_SIZE}px`;
root.append(canvas);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance"
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xd8d6c8, 1);
renderer.setPixelRatio(1);
renderer.setSize(CANVAS_SIZE, CANVAS_SIZE, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

window.__OBJECT_PREVIEW__ = {
  ready: true,
  targets: () => targets,
  render: async (targetId: string, angleIndex: number) => renderTarget(targetId, angleIndex)
};

async function renderTarget(targetId: string, angleIndex: number): Promise<PreviewRenderResult> {
  const target = targetById.get(targetId);
  if (!target) {
    throw new Error(`Unknown preview target ${targetId}`);
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8d6c8);
  const materials = createGameMaterials(new SeededRandom(0x51f00d));
  const builder = new WorldBuilder(
    scene,
    level,
    new SeededRandom(seedFromString(`${target.id}:${target.sourceIndex ?? 0}`)),
    materials,
    (point) => terrain.groundY(point),
    (points) => terrain.averageGroundY(points)
  );
  builder.createObjectPreview(target);

  const camera = createCamera(target, angleIndex);
  renderer.render(scene, camera);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  renderer.render(scene, camera);

  const result = {
    target,
    angle: ANGLES[((angleIndex % ANGLES.length) + ANGLES.length) % ANGLES.length],
    dataUrl: canvas.toDataURL("image/png"),
    signal: readCanvasSignal()
  };
  disposeScene(scene);
  return result;
}

function createCamera(target: ObjectPreviewTarget, angleIndex: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
  const angle = angleIndex * (Math.PI / 2) - Math.PI / 4;
  const radius = Math.max(3.2, target.radius);
  const centerY = terrain.groundY(target.position) + Math.max(0.55, target.height * 0.38);
  const lookAt = new THREE.Vector3(target.position.x, centerY, target.position.z);
  const distance = Math.max(radius * 2.35, target.height * 1.55, 7);
  const cameraY = centerY + Math.max(target.height * 0.72, radius * 0.62, 3.2);
  camera.position.set(
    target.position.x + Math.cos(angle) * distance,
    cameraY,
    target.position.z + Math.sin(angle) * distance
  );
  camera.lookAt(lookAt);
  camera.far = Math.max(1200, distance * 5);
  camera.updateProjectionMatrix();
  return camera;
}

function readCanvasSignal(): PreviewSignal {
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) {
    return { nonBlank: 0, varied: 0 };
  }
  const pixels = new Uint8Array(4);
  let nonBlank = 0;
  const buckets = new Set<string>();
  for (let yStep = 1; yStep <= 12; yStep += 1) {
    for (let xStep = 1; xStep <= 12; xStep += 1) {
      const x = Math.floor((canvas.width * xStep) / 13);
      const y = Math.floor((canvas.height * yStep) / 13);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const r = pixels[0];
      const g = pixels[1];
      const b = pixels[2];
      if (Math.abs(r - 216) + Math.abs(g - 214) + Math.abs(b - 200) > 18) {
        nonBlank += 1;
      }
      buckets.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
    }
  }
  return { nonBlank, varied: buckets.size };
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
  scene.clear();
}

function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
