import * as THREE from "three";

export interface ContactShadowAnchor {
  x: number;
  y: number;
  z: number;
  radius: number;
  stretch?: number;
}

export class PainterlyContactShadows {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly capacity: number;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(capacity = 192) {
    this.capacity = capacity;
    const material = new THREE.MeshBasicMaterial({
      color: 0x17383b,
      alphaMap: createBrushShadowTexture(),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), material, capacity);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.userData.kind = "dynamic-painterly-contact-shadows";
    this.root.userData.dynamic = true;
    this.root.add(this.mesh);
  }

  update(anchors: readonly ContactShadowAnchor[]): void {
    const count = Math.min(this.capacity, anchors.length);
    for (let index = 0; index < count; index += 1) {
      const anchor = anchors[index];
      const angle = ((anchor.x * 0.071 + anchor.z * 0.047) % 1) * Math.PI;
      this.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, angle));
      this.scale.set(anchor.radius * (anchor.stretch ?? 1.15), anchor.radius * 0.72, 1);
      this.matrix.compose(new THREE.Vector3(anchor.x, anchor.y + 0.045, anchor.z), this.quaternion, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function createBrushShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
  gradient.addColorStop(0, "rgba(255,255,255,0.92)");
  gradient.addColorStop(0.46, "rgba(255,255,255,0.68)");
  gradient.addColorStop(0.78, "rgba(255,255,255,0.2)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(32, 32, 30, 24, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "destination-out";
  for (let index = 0; index < 9; index += 1) {
    const angle = index * 2.17;
    ctx.fillStyle = `rgba(0,0,0,${0.08 + (index % 3) * 0.035})`;
    ctx.fillRect(16 + Math.cos(angle) * 15, 20 + Math.sin(angle) * 11, 7 + (index % 4) * 2, 1 + (index % 2));
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
