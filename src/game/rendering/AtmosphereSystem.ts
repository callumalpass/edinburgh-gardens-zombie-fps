import * as THREE from "three";
import type { RandomSource, Vec2 } from "../types";

const SKY_RADIUS = 920;
const RAIN_ANCHOR_RADIUS = 42;
const RAIN_MIN_Y = 5;
const RAIN_MAX_Y = 62;
const DEFAULT_WEATHER_ANCHORS: Vec2[] = [
  { x: 35, z: 42 },
  { x: 5, z: -8 },
  { x: -58, z: 48 },
  { x: 88, z: -28 },
  { x: 118, z: 48 },
  { x: -118, z: -36 },
  { x: 18, z: -112 },
  { x: -82, z: 86 },
  { x: 126, z: -112 },
  { x: -34, z: -74 },
  { x: 66, z: 82 },
  { x: -132, z: 12 }
];

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
  readonly worldWeatherRoot = new THREE.Group();

  private readonly rainDrops: RainDrop[] = [];
  private readonly rainPositions: Float32Array;
  private readonly rainGeometry: THREE.BufferGeometry;
  private readonly cloudLayers: THREE.Mesh[] = [];
  private readonly groundMistLayers: THREE.Mesh[] = [];
  private readonly groundMistBanks: THREE.Sprite[] = [];
  private readonly lightning = new THREE.PointLight(0x9fb8ff, 0, 520);
  private nextLightningAt = 9.5;
  private lightningTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly rng: RandomSource,
    private readonly smokeMode: boolean,
    private readonly weatherAnchors: readonly Vec2[] = DEFAULT_WEATHER_ANCHORS
  ) {
    this.root.name = "Sky atmosphere";
    this.root.userData.dynamic = true;
    this.root.frustumCulled = false;
    this.worldWeatherRoot.name = "Fixed world weather";
    this.worldWeatherRoot.userData.dynamic = true;
    this.worldWeatherRoot.frustumCulled = false;

    this.scene.background = new THREE.Color(0x101823);
    this.scene.fog = new THREE.FogExp2(0x16262c, smokeMode ? 0.00135 : 0.00175);

    this.addSkyDome();
    this.addStars();
    this.addMoon();
    this.addCloudLayers();
    this.addGroundMistLayers();

    const rainCount = smokeMode ? 360 : 1200;
    this.rainPositions = new Float32Array(rainCount * 2 * 3);
    this.rainGeometry = new THREE.BufferGeometry();
    this.createRain(rainCount);

    this.lightning.position.set(-90, 105, -135);
    this.root.add(this.lightning);
    this.scene.add(this.root);
    this.scene.add(this.worldWeatherRoot);
  }

  update(dt: number, cameraPosition: THREE.Vector3, now: number): void {
    this.root.position.set(cameraPosition.x, 0, cameraPosition.z);

    this.cloudLayers.forEach((layer, index) => {
      layer.rotation.z += dt * (index === 0 ? 0.003 : -0.0018);
      layer.position.x = Math.sin(now * 0.018 + index) * 26;
      layer.position.z = Math.cos(now * 0.014 + index * 1.7) * 22;
    });
    this.groundMistLayers.forEach((layer, index) => {
      const baseX = (layer.userData.baseX as number) ?? 0;
      const baseZ = (layer.userData.baseZ as number) ?? 0;
      const drift = (layer.userData.drift as number) ?? 1;
      layer.rotation.z += dt * (index === 0 ? 0.0022 : -0.0015);
      layer.position.x = baseX + Math.sin(now * 0.022 + index * 1.4) * drift;
      layer.position.z = baseZ + Math.cos(now * 0.017 + index * 1.9) * drift;
    });
    this.groundMistBanks.forEach((bank, index) => {
      const baseX = bank.userData.baseX as number;
      const baseZ = bank.userData.baseZ as number;
      const drift = bank.userData.drift as number;
      const opacity = bank.userData.opacity as number;
      bank.position.x = baseX + Math.sin(now * 0.16 + index * 1.9) * drift;
      bank.position.z = baseZ + Math.cos(now * 0.12 + index * 1.3) * drift;
      bank.position.y = (bank.userData.baseY as number) + Math.sin(now * 0.2 + index) * 0.08;
      (bank.material as THREE.SpriteMaterial).opacity = opacity * (0.86 + Math.sin(now * 0.34 + index * 0.7) * 0.14);
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

  getGroundMistBankCount(): number {
    return this.groundMistBanks.length;
  }

  getRainDropCount(): number {
    return this.rainDrops.length;
  }

  getWeatherAnchorCount(): number {
    return this.anchors().length;
  }

  private addSkyDome(): void {
    const geometry = new THREE.SphereGeometry(SKY_RADIUS, 48, 24);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x274563) },
        midColor: { value: new THREE.Color(0x132936) },
        horizonColor: { value: new THREE.Color(0x614936) },
        bottomColor: { value: new THREE.Color(0x081116) }
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
      { texture: textureA, y: 138, scale: 620, opacity: 0.34, color: 0x8ca3a2 },
      { texture: textureB, y: 92, scale: 470, opacity: 0.25, color: 0x617c84 }
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
    const bankTexture = this.createMistTexture();
    const center = this.mistCenter();
    const layers = [
      { texture: textureA, y: 0.42, scale: 250, opacity: this.smokeMode ? 0.1 : 0.18, color: 0xa5aaa0, drift: 9 },
      { texture: textureB, y: 1.05, scale: 190, opacity: this.smokeMode ? 0.07 : 0.12, color: 0x6f8584, drift: 7 }
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
      mist.position.set(center.x, layer.y, center.z);
      mist.scale.set(layer.scale, layer.scale, 1);
      mist.frustumCulled = false;
      mist.renderOrder = 4;
      mist.userData.baseX = center.x;
      mist.userData.baseZ = center.z;
      mist.userData.drift = layer.drift;
      this.groundMistLayers.push(mist);
      this.worldWeatherRoot.add(mist);
    }

    const anchors = this.anchors();
    const bankCount = Math.min(anchors.length, this.smokeMode ? 32 : 72);
    for (let index = 0; index < bankCount; index += 1) {
      const anchor = anchors[Math.floor((index / bankCount) * anchors.length) % anchors.length];
      const baseX = anchor.x + this.rng.range(-9, 9);
      const baseZ = anchor.z + this.rng.range(-9, 9);
      const baseY = this.rng.range(0.75, 1.45);
      const material = new THREE.SpriteMaterial({
        map: bankTexture,
        color: index % 2 === 0 ? 0xc2c4ad : 0x96a9a4,
        transparent: true,
        opacity: this.smokeMode ? 0.46 : 0.38,
        depthWrite: false,
        depthTest: true,
        fog: false
      });
      const bank = new THREE.Sprite(material);
      bank.name = "Visible low mist bank";
      bank.position.set(baseX, baseY, baseZ);
      bank.scale.set(this.rng.range(14, 34), this.rng.range(2.1, 4.6), 1);
      bank.renderOrder = 8;
      bank.userData.baseX = baseX;
      bank.userData.baseY = baseY;
      bank.userData.baseZ = baseZ;
      bank.userData.drift = this.rng.range(0.8, 2.2);
      bank.userData.opacity = material.opacity;
      this.groundMistBanks.push(bank);
      this.worldWeatherRoot.add(bank);
    }
  }

  private mistCenter(): Vec2 {
    const anchors = this.anchors();
    return anchors.reduce(
      (center, anchor) => ({
        x: center.x + anchor.x / anchors.length,
        z: center.z + anchor.z / anchors.length
      }),
      { x: 0, z: 0 }
    );
  }

  private anchors(): readonly Vec2[] {
    return this.weatherAnchors.length > 0 ? this.weatherAnchors : DEFAULT_WEATHER_ANCHORS;
  }

  private createRain(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.rainDrops.push(this.randomRainDrop());
    }
    this.rainGeometry.setAttribute("position", new THREE.BufferAttribute(this.rainPositions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xaad4df,
      transparent: true,
      opacity: this.smokeMode ? 0.22 : 0.34,
      depthWrite: false,
      fog: false
    });
    const rain = new THREE.LineSegments(this.rainGeometry, material);
    rain.name = "Wind-blown rain";
    rain.frustumCulled = false;
    rain.renderOrder = 30;
    rain.userData.kind = "world-rain";
    this.worldWeatherRoot.add(rain);
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
    const anchors = this.anchors();
    const anchor = anchors[this.rng.int(0, anchors.length - 1)];
    return {
      x: anchor.x + this.rng.range(-RAIN_ANCHOR_RADIUS, RAIN_ANCHOR_RADIUS),
      y: this.rng.range(RAIN_MIN_Y, RAIN_MAX_Y),
      z: anchor.z + this.rng.range(-RAIN_ANCHOR_RADIUS, RAIN_ANCHOR_RADIUS),
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
    glow.addColorStop(0, "rgba(245, 235, 198, 1)");
    glow.addColorStop(0.18, "rgba(235, 228, 188, 0.9)");
    glow.addColorStop(0.42, "rgba(151, 194, 206, 0.3)");
    glow.addColorStop(1, "rgba(151, 194, 206, 0)");
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
      gradient.addColorStop(0, `rgba(196, 220, 218, ${this.rng.range(0.04, 0.14) * alphaScale})`);
      gradient.addColorStop(1, "rgba(196, 220, 218, 0)");
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

  private createMistTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 256);

    const floorFade = ctx.createLinearGradient(0, 0, 0, 256);
    floorFade.addColorStop(0, "rgba(214, 222, 204, 0)");
    floorFade.addColorStop(0.32, "rgba(214, 222, 204, 0.14)");
    floorFade.addColorStop(0.72, "rgba(214, 222, 204, 0.3)");
    floorFade.addColorStop(1, "rgba(214, 222, 204, 0)");
    ctx.fillStyle = floorFade;
    ctx.fillRect(0, 0, 512, 256);

    for (let i = 0; i < 72; i += 1) {
      const x = this.rng.range(-40, 552);
      const y = this.rng.range(64, 226);
      const radiusX = this.rng.range(36, 126);
      const radiusY = this.rng.range(8, 32);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radiusX);
      gradient.addColorStop(0, `rgba(234, 232, 205, ${this.rng.range(0.2, 0.44)})`);
      gradient.addColorStop(0.45, `rgba(198, 220, 213, ${this.rng.range(0.08, 0.18)})`);
      gradient.addColorStop(1, "rgba(198, 220, 213, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, this.rng.range(-0.24, 0.24), 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
