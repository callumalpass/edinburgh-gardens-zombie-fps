import * as THREE from "three";
import { distance } from "../geo";
import type { LevelData, RandomSource, Vec2 } from "../types";

type DecalKind = "wet" | "mud" | "leaf" | "scuff" | "paint" | "blood";

interface DecalSpec {
  position: Vec2;
  angle: number;
  length: number;
  width: number;
  kind: DecalKind;
  opacity: number;
}

export class SceneDecals {
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly level: LevelData,
    private readonly rng: RandomSource,
    private readonly groundYAt: (point: Vec2) => number
  ) {}

  addWorldDecals(): void {
    for (const spec of this.collectDecals()) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.length, spec.width, 1, 1), this.materialFor(spec.kind, spec.opacity));
      mesh.position.set(spec.position.x, this.groundYAt(spec.position) + 0.128, spec.position.z);
      mesh.rotation.set(-Math.PI / 2, 0, spec.angle);
      mesh.renderOrder = 12;
      mesh.userData.kind = `decal-${spec.kind}`;
      this.scene.add(mesh);
    }
  }

  private collectDecals(): DecalSpec[] {
    return [
      ...this.pathDecals(),
      ...this.amenityDecals(),
      ...this.buildingThresholdDecals(),
      ...this.parkLifeDecals(),
      ...this.spawnDecals()
    ];
  }

  private pathDecals(): DecalSpec[] {
    const decals: DecalSpec[] = [];
    for (const path of this.level.paths) {
      const stride = path.kind === "rail" || path.kind === "cycleway" ? 2 : 3;
      for (let i = 0; i < path.points.length - 1; i += stride) {
        const a = path.points[i];
        const b = path.points[i + 1];
        const segmentLength = distance(a, b);
        if (segmentLength < 5 || this.rng.next() < 0.42) continue;
        const angle = Math.atan2(b.z - a.z, b.x - a.x);
        const t = this.rng.range(0.22, 0.78);
        const normalOffset = this.rng.range(-0.35, 0.35) * path.width;
        const point = {
          x: a.x + (b.x - a.x) * t + Math.cos(angle + Math.PI / 2) * normalOffset,
          z: a.z + (b.z - a.z) * t + Math.sin(angle + Math.PI / 2) * normalOffset
        };
        decals.push({
          position: point,
          angle: angle + this.rng.range(-0.1, 0.1),
          length: Math.min(segmentLength * this.rng.range(0.28, 0.58), 10),
          width: path.width * this.rng.range(0.28, 0.72),
          kind: path.surface === "asphalt" || path.kind === "cycleway" || path.kind === "rail" ? "wet" : this.rng.next() > 0.55 ? "mud" : "scuff",
          opacity: this.rng.range(0.22, 0.42)
        });
      }
    }
    return decals.slice(0, 90);
  }

  private amenityDecals(): DecalSpec[] {
    return this.level.amenities.slice(0, 55).map((amenity, index) => ({
      position: {
        x: amenity.position.x + this.rng.range(-0.6, 0.6),
        z: amenity.position.z + this.rng.range(-0.6, 0.6)
      },
      angle: this.rng.range(0, Math.PI),
      length: amenity.kind === "bench" || amenity.kind === "picnic_table" ? this.rng.range(2.2, 3.6) : this.rng.range(1.1, 2.4),
      width: amenity.kind === "bench" || amenity.kind === "picnic_table" ? this.rng.range(0.75, 1.4) : this.rng.range(0.6, 1.1),
      kind: index % 4 === 0 ? "leaf" : amenity.kind === "waste_basket" ? "scuff" : "mud",
      opacity: this.rng.range(0.18, 0.34)
    }));
  }

  private buildingThresholdDecals(): DecalSpec[] {
    return this.level.mappedBuildings
      .filter((building) => building.detailProfile)
      .slice(0, 12)
      .map((building) => {
        const center = building.polygon.reduce(
          (sum, point) => ({ x: sum.x + point.x / building.polygon.length, z: sum.z + point.z / building.polygon.length }),
          { x: 0, z: 0 }
        );
        return {
          position: center,
          angle: this.rng.range(0, Math.PI),
          length: this.rng.range(3.4, 7.2),
          width: this.rng.range(0.9, 1.7),
          kind: "scuff" as const,
          opacity: this.rng.range(0.2, 0.36)
        };
      });
  }

  private parkLifeDecals(): DecalSpec[] {
    return this.level.parkLifeDetails
      .filter((detail) => detail.kind === "chalk-mark" || detail.kind === "training-cones" || detail.kind === "sports-bag")
      .slice(0, 18)
      .map((detail) => ({
        position: detail.position,
        angle: detail.angle + this.rng.range(-0.22, 0.22),
        length: this.rng.range(1.4, 2.8),
        width: this.rng.range(0.35, 0.9),
        kind: detail.kind === "chalk-mark" ? "paint" : "scuff",
        opacity: this.rng.range(0.24, 0.46)
      }));
  }

  private spawnDecals(): DecalSpec[] {
    return this.level.spawnPoints.slice(0, 16).map((position) => ({
      position: {
        x: position.x + this.rng.range(-1.5, 1.5),
        z: position.z + this.rng.range(-1.5, 1.5)
      },
      angle: this.rng.range(0, Math.PI),
      length: this.rng.range(1.2, 2.6),
      width: this.rng.range(0.35, 0.95),
      kind: "blood",
      opacity: this.rng.range(0.18, 0.32)
    }));
  }

  private materialFor(kind: DecalKind, opacity: number): THREE.MeshBasicMaterial {
    const key = `${kind}-${Math.round(opacity * 100)}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = new THREE.MeshBasicMaterial({
      map: this.createTexture(kind),
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      color: 0xffffff
    });
    this.materials.set(key, material);
    return material;
  }

  private createTexture(kind: DecalKind): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const color =
      kind === "wet" ? [150, 212, 218] :
      kind === "mud" ? [83, 55, 35] :
      kind === "leaf" ? [157, 143, 72] :
      kind === "paint" ? [238, 181, 75] :
      kind === "blood" ? [137, 31, 28] :
      [31, 42, 39];

    this.drawSoftPaintPools(ctx, kind, color);
    this.drawDryBrushStrokes(ctx, kind, color);
    if (kind === "leaf") {
      this.drawLeafMarks(ctx);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private drawSoftPaintPools(ctx: CanvasRenderingContext2D, kind: DecalKind, color: number[]): void {
    const count = kind === "wet" ? 28 : kind === "blood" ? 24 : 18;
    for (let i = 0; i < count; i += 1) {
      const alpha = this.rng.range(0.055, kind === "wet" ? 0.19 : kind === "blood" ? 0.28 : 0.22);
      const x = this.rng.range(18, 238);
      const y = this.rng.range(18, 110);
      const gradient = ctx.createRadialGradient(x, y, 0, x + this.rng.range(-10, 10), y + this.rng.range(-6, 6), this.rng.range(18, 68));
      gradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`);
      gradient.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(this.rng.range(12, 244), this.rng.range(10, 118), this.rng.range(18, 58), this.rng.range(4, 22), this.rng.range(-0.72, 0.72), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawDryBrushStrokes(ctx: CanvasRenderingContext2D, kind: DecalKind, color: number[]): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const count = kind === "paint" ? 26 : kind === "scuff" ? 20 : 16;
    for (let i = 0; i < count; i += 1) {
      const x = this.rng.range(-26, 230);
      const y = this.rng.range(4, 124);
      const length = this.rng.range(44, kind === "wet" ? 170 : 118);
      ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${this.rng.range(0.07, kind === "wet" ? 0.18 : 0.26)})`;
      ctx.lineWidth = this.rng.range(1.1, kind === "paint" ? 4.2 : 3.1);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + length * 0.28, y + this.rng.range(-8, 8), x + length * 0.7, y + this.rng.range(-10, 10), x + length, y + this.rng.range(-6, 6));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawLeafMarks(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 18; i += 1) {
      const x = this.rng.range(0, 250);
      const y = this.rng.range(4, 124);
      const length = this.rng.range(18, 42);
      const bend = this.rng.range(-0.32, 0.32);
      ctx.strokeStyle = `rgba(214, 184, 96, ${this.rng.range(0.12, 0.28)})`;
      ctx.lineWidth = this.rng.range(1.2, 2.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + length * 0.32, y - length * bend, x + length * 0.68, y + length * bend, x + length, y + this.rng.range(-5, 5));
      ctx.stroke();
    }
    ctx.restore();
  }
}
