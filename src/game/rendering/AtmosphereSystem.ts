import * as THREE from "three";
import type { RandomSource } from "../types";

const SKY_RADIUS = 920;
const RAIN_RADIUS = 82;
const RAIN_MIN_Y = 5;
const RAIN_MAX_Y = 62;

interface RainDrop {
  x: number;
  y: number;
  z: number;
  speed: number;
  drift: number;
  length: number;
}

export class AtmosphereSystem {
  readonly root = new THREE.Group();

  private readonly rainDrops: RainDrop[] = [];
  private readonly rainPositions: Float32Array;
  private readonly rainGeometry: THREE.BufferGeometry;
  private readonly cloudLayers: THREE.Mesh[] = [];
  private readonly groundMistLayers: THREE.Mesh[] = [];
  private readonly lightning = new THREE.PointLight(0x9fb8ff, 0, 520);
  private nextLightningAt = 9.5;
  private lightningTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly rng: RandomSource,
    private readonly smokeMode: boolean
  ) {
    this.root.name = "Atmosphere";
    this.root.userData.dynamic = true;
    this.root.frustumCulled = false;

    this.scene.background = new THREE.Color(0x0d1112);
    this.scene.fog = new THREE.FogExp2(0x151815, smokeMode ? 0.00145 : 0.00195);

    this.addSkyDome();
    this.addStars();
    this.addMoon();
    this.addCloudLayers();
    this.addGroundMistLayers();

    const rainCount = smokeMode ? 150 : 420;
    this.rainPositions = new Float32Array(rainCount * 2 * 3);
    this.rainGeometry = new THREE.BufferGeometry();
    this.createRain(rainCount);

    this.lightning.position.set(-90, 105, -135);
    this.root.add(this.lightning);
    this.scene.add(this.root);
  }

  update(dt: number, cameraPosition: THREE.Vector3, now: number): void {
    this.root.position.set(cameraPosition.x, 0, cameraPosition.z);

    this.cloudLayers.forEach((layer, index) => {
      layer.rotation.z += dt * (index === 0 ? 0.003 : -0.0018);
      layer.position.x = Math.sin(now * 0.018 + index) * 26;
      layer.position.z = Math.cos(now * 0.014 + index * 1.7) * 22;
    });
    this.groundMistLayers.forEach((layer, index) => {
      layer.rotation.z += dt * (index === 0 ? 0.0022 : -0.0015);
      layer.position.x = Math.sin(now * 0.022 + index * 1.4) * 14;
      layer.position.z = Math.cos(now * 0.017 + index * 1.9) * 16;
    });

    if (this.lightningTimer > 0) {
      this.lightningTimer -= dt;
      this.lightning.intensity = this.lightningTimer > 0 ? 4.5 + Math.sin(now * 90) * 2.2 : 0;
    } else if (!this.smokeMode && now > this.nextLightningAt) {
      this.lightningTimer = 0.09;
      this.nextLightningAt = now + this.rng.range(18, 34);
    }

    this.updateRain(dt);
  }

  private addSkyDome(): void {
    const geometry = new THREE.SphereGeometry(SKY_RADIUS, 48, 24);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1f2e3a) },
        midColor: { value: new THREE.Color(0x151d1d) },
        horizonColor: { value: new THREE.Color(0x3c392f) },
        bottomColor: { value: new THREE.Color(0x0b0f0e) }
      },
      vertexShader: `
        varying vec3 vDirection;

        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDirection;
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;

        void main() {
          float y = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 lower = mix(bottomColor, horizonColor, smoothstep(0.1, 0.42, y));
          vec3 upper = mix(midColor, topColor, smoothstep(0.46, 1.0, y));
          vec3 color = mix(lower, upper, smoothstep(0.32, 0.72, y));
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(geometry, material);
    sky.name = "Storm sky dome";
    sky.frustumCulled = false;
    sky.renderOrder = -100;
    this.root.add(sky);
  }

  private addStars(): void {
    const starCount = this.smokeMode ? 90 : 240;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const color = new THREE.Color();
    for (let i = 0; i < starCount; i += 1) {
      const theta = this.rng.range(0, Math.PI * 2);
      const y = this.rng.range(0.28, 0.92);
      const radius = SKY_RADIUS * this.rng.range(0.78, 0.94);
      const planar = Math.sqrt(1 - y * y) * radius;
      positions[i * 3] = Math.cos(theta) * planar;
      positions[i * 3 + 1] = y * radius;
      positions[i * 3 + 2] = Math.sin(theta) * planar;
      color.setHSL(this.rng.range(0.12, 0.18), this.rng.range(0.08, 0.22), this.rng.range(0.68, 0.96));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 1.45,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      fog: false
    });
    const stars = new THREE.Points(geometry, material);
    stars.name = "Cloud-broken stars";
    stars.frustumCulled = false;
    this.root.add(stars);
  }

  private addMoon(): void {
    const texture = this.createMoonTexture();
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending
      })
    );
    glow.name = "Moon glow";
    glow.position.set(-245, 210, -345);
    glow.scale.set(92, 92, 1);
    glow.frustumCulled = false;
    this.root.add(glow);
  }

  private addCloudLayers(): void {
    const textureA = this.createCloudTexture(0.42);
    const textureB = this.createCloudTexture(0.28);
    const layers = [
      { texture: textureA, y: 138, scale: 620, opacity: 0.38, color: 0x7d8278 },
      { texture: textureB, y: 92, scale: 470, opacity: 0.28, color: 0x5c665f }
    ];

    for (const layer of layers) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: layer.texture,
          color: layer.color,
          transparent: true,
          opacity: layer.opacity,
          depthWrite: false,
          fog: false
        })
      );
      mesh.name = "Moving storm cloud layer";
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = layer.y;
      mesh.scale.set(layer.scale, layer.scale, 1);
      mesh.frustumCulled = false;
      mesh.renderOrder = -20;
      this.cloudLayers.push(mesh);
      this.root.add(mesh);
    }
  }

  private addGroundMistLayers(): void {
    const textureA = this.createCloudTexture(0.3);
    const textureB = this.createCloudTexture(0.22);
    const layers = [
      { texture: textureA, y: 0.42, scale: 230, opacity: this.smokeMode ? 0.08 : 0.13, color: 0x9a9987 },
      { texture: textureB, y: 1.05, scale: 175, opacity: this.smokeMode ? 0.055 : 0.09, color: 0x747b70 }
    ];

    for (const layer of layers) {
      const mist = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: layer.texture,
          color: layer.color,
          transparent: true,
          opacity: layer.opacity,
          depthWrite: false,
          fog: false
        })
      );
      mist.name = "Low wet-ground mist";
      mist.rotation.x = -Math.PI / 2;
      mist.position.y = layer.y;
      mist.scale.set(layer.scale, layer.scale, 1);
      mist.frustumCulled = false;
      mist.renderOrder = 4;
      this.groundMistLayers.push(mist);
      this.root.add(mist);
    }
  }

  private createRain(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.rainDrops.push(this.randomRainDrop());
    }
    this.rainGeometry.setAttribute("position", new THREE.BufferAttribute(this.rainPositions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x9fb2ae,
      transparent: true,
      opacity: this.smokeMode ? 0.22 : 0.34,
      depthWrite: false,
      fog: false
    });
    const rain = new THREE.LineSegments(this.rainGeometry, material);
    rain.name = "Wind-blown rain";
    rain.frustumCulled = false;
    rain.renderOrder = 30;
    this.root.add(rain);
    this.writeRainPositions();
  }

  private updateRain(dt: number): void {
    for (const drop of this.rainDrops) {
      drop.y -= drop.speed * dt;
      drop.x += drop.drift * dt;
      drop.z += drop.drift * 0.34 * dt;
      if (drop.y < RAIN_MIN_Y) {
        const next = this.randomRainDrop();
        drop.x = next.x;
        drop.y = RAIN_MAX_Y;
        drop.z = next.z;
        drop.speed = next.speed;
        drop.drift = next.drift;
        drop.length = next.length;
      } else if (drop.x > RAIN_RADIUS) {
        drop.x = -RAIN_RADIUS;
      } else if (drop.x < -RAIN_RADIUS) {
        drop.x = RAIN_RADIUS;
      }
    }
    this.writeRainPositions();
  }

  private writeRainPositions(): void {
    for (let i = 0; i < this.rainDrops.length; i += 1) {
      const drop = this.rainDrops[i];
      const offset = i * 6;
      this.rainPositions[offset] = drop.x;
      this.rainPositions[offset + 1] = drop.y;
      this.rainPositions[offset + 2] = drop.z;
      this.rainPositions[offset + 3] = drop.x - drop.drift * 0.028;
      this.rainPositions[offset + 4] = drop.y + drop.length;
      this.rainPositions[offset + 5] = drop.z - drop.drift * 0.01;
    }
    this.rainGeometry.attributes.position.needsUpdate = true;
  }

  private randomRainDrop(): RainDrop {
    return {
      x: this.rng.range(-RAIN_RADIUS, RAIN_RADIUS),
      y: this.rng.range(RAIN_MIN_Y, RAIN_MAX_Y),
      z: this.rng.range(-RAIN_RADIUS, RAIN_RADIUS),
      speed: this.rng.range(38, 58),
      drift: this.rng.range(8, 15),
      length: this.rng.range(1.25, 2.15)
    };
  }

  private createMoonTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const glow = ctx.createRadialGradient(128, 128, 5, 128, 128, 128);
    glow.addColorStop(0, "rgba(238, 234, 205, 1)");
    glow.addColorStop(0.18, "rgba(225, 224, 196, 0.86)");
    glow.addColorStop(0.42, "rgba(156, 177, 167, 0.26)");
    glow.addColorStop(1, "rgba(156, 177, 167, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createCloudTexture(alphaScale: number): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 512);
    for (let i = 0; i < 165; i += 1) {
      const x = this.rng.range(-40, 552);
      const y = this.rng.range(-20, 532);
      const radiusX = this.rng.range(28, 120);
      const radiusY = this.rng.range(12, 58);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radiusX);
      gradient.addColorStop(0, `rgba(220, 226, 204, ${this.rng.range(0.04, 0.14) * alphaScale})`);
      gradient.addColorStop(1, "rgba(220, 226, 204, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, this.rng.range(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.2, 1.2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
