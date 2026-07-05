import * as THREE from "three";
import type { RandomSource, Vec2 } from "../types";
import { timeOfDayFromElapsed, type TimeOfDayState } from "./timeOfDay";
import { weatherFromElapsed, type WeatherState } from "./weather";

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

export interface AtmosphereFrameState {
  timeOfDay: TimeOfDayState;
  weather: WeatherState;
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
  private readonly skyColors = {
    top: new THREE.Color(),
    mid: new THREE.Color(),
    horizon: new THREE.Color(),
    bottom: new THREE.Color(),
    fog: new THREE.Color(),
    background: new THREE.Color()
  };
  private readonly nightPalette = {
    top: new THREE.Color(0x172f46),
    mid: new THREE.Color(0x0b2029),
    horizon: new THREE.Color(0x553a35),
    bottom: new THREE.Color(0x061013),
    fog: new THREE.Color(0x172d33),
    background: new THREE.Color(0x0b1821)
  };
  private readonly dayPalette = {
    top: new THREE.Color(0x79a3bf),
    mid: new THREE.Color(0x86a39a),
    horizon: new THREE.Color(0xd2a06d),
    bottom: new THREE.Color(0x3e5a45),
    fog: new THREE.Color(0x8fa69d),
    background: new THREE.Color(0x718a92)
  };
  private readonly dawnPalette = {
    top: new THREE.Color(0x3a4f69),
    mid: new THREE.Color(0x616a70),
    horizon: new THREE.Color(0xd98757),
    bottom: new THREE.Color(0x24362c),
    fog: new THREE.Color(0x8d755e),
    background: new THREE.Color(0x3c4b55)
  };
  private readonly cloudNightColor = new THREE.Color(0x789096);
  private readonly cloudDayColor = new THREE.Color(0xb4bcae);
  private readonly cloudDawnColor = new THREE.Color(0xa78671);
  private readonly cloudStormColor = new THREE.Color(0x465d67);
  private readonly stormSkyColor = new THREE.Color(0x1a3140);
  private readonly stormHorizonColor = new THREE.Color(0x455661);
  private readonly stormGroundColor = new THREE.Color(0x0a1518);
  private readonly stormFogColor = new THREE.Color(0x53666b);
  private readonly cloudColor = new THREE.Color();
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private starMaterial: THREE.PointsMaterial | null = null;
  private moonMaterial: THREE.SpriteMaterial | null = null;
  private rainMaterial: THREE.LineBasicMaterial | null = null;
  private currentWeather: WeatherState = weatherFromElapsed(0);
  private elapsedSeconds = 0;
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

    this.scene.background = new THREE.Color(0x0b1821);
    this.scene.fog = new THREE.FogExp2(0x172d33, smokeMode ? 0.00135 : 0.00175);

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
    const initialTimeOfDay = timeOfDayFromElapsed(this.elapsedSeconds);
    this.currentWeather = weatherFromElapsed(this.elapsedSeconds);
    this.applyTimeOfDay(initialTimeOfDay, this.currentWeather);
  }

  update(dt: number, cameraPosition: THREE.Vector3, now: number): AtmosphereFrameState {
    this.elapsedSeconds += dt;
    const timeOfDay = timeOfDayFromElapsed(this.elapsedSeconds);
    const weather = weatherFromElapsed(this.elapsedSeconds);
    this.currentWeather = weather;
    this.applyTimeOfDay(timeOfDay, weather);
    this.root.position.set(cameraPosition.x, 0, cameraPosition.z);

    const windDrift = 0.62 + weather.wind * 0.86;
    this.cloudLayers.forEach((layer, index) => {
      layer.rotation.z += dt * (index === 0 ? 0.003 : -0.0018) * windDrift;
      layer.position.x = Math.sin(now * (0.014 + weather.wind * 0.012) + index) * (18 + weather.wind * 15);
      layer.position.z = Math.cos(now * (0.012 + weather.wind * 0.009) + index * 1.7) * (16 + weather.wind * 12);
    });
    this.groundMistLayers.forEach((layer, index) => {
      const baseX = (layer.userData.baseX as number) ?? 0;
      const baseZ = (layer.userData.baseZ as number) ?? 0;
      const drift = (layer.userData.drift as number) ?? 1;
      layer.rotation.z += dt * (index === 0 ? 0.0022 : -0.0015) * windDrift;
      layer.position.x = baseX + Math.sin(now * (0.018 + weather.wind * 0.014) + index * 1.4) * drift * windDrift;
      layer.position.z = baseZ + Math.cos(now * (0.015 + weather.wind * 0.01) + index * 1.9) * drift * windDrift;
    });
    const mistWeather = THREE.MathUtils.clamp(0.34 + weather.fog * 0.82 + weather.wetness * 0.22, 0.24, 1.32);
    this.groundMistBanks.forEach((bank, index) => {
      const baseX = bank.userData.baseX as number;
      const baseZ = bank.userData.baseZ as number;
      const drift = bank.userData.drift as number;
      const opacity = bank.userData.opacity as number;
      bank.position.x = baseX + Math.sin(now * (0.11 + weather.wind * 0.08) + index * 1.9) * drift * windDrift;
      bank.position.z = baseZ + Math.cos(now * (0.09 + weather.wind * 0.06) + index * 1.3) * drift * windDrift;
      bank.position.y = (bank.userData.baseY as number) + Math.sin(now * 0.2 + index) * 0.08;
      (bank.material as THREE.SpriteMaterial).opacity =
        opacity *
        mistWeather *
        (0.72 + timeOfDay.night * 0.26) *
        (0.86 + Math.sin(now * 0.34 + index * 0.7) * 0.14);
    });

    if (this.lightningTimer > 0) {
      this.lightningTimer -= dt;
      this.lightning.intensity = this.lightningTimer > 0 ? weather.thunder * (5.8 + Math.sin(now * 96) * 2.8) : 0;
    } else if (!this.smokeMode && weather.thunder > 0.2 && now > this.nextLightningAt) {
      this.lightningTimer = 0.06 + weather.thunder * 0.055;
      this.nextLightningAt = now + this.rng.range(7, 18) / Math.max(0.35, weather.thunder);
    } else if (weather.thunder <= 0.2) {
      this.lightning.intensity = 0;
    }

    this.updateRain(dt, weather);
    return { timeOfDay, weather };
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

  getWeatherState(): WeatherState {
    return this.currentWeather;
  }

  private applyTimeOfDay(timeOfDay: TimeOfDayState, weather: WeatherState): void {
    const dawnMix = timeOfDay.dawnDusk * 0.72;
    this.skyColors.top.lerpColors(this.nightPalette.top, this.dayPalette.top, timeOfDay.daylight).lerp(this.dawnPalette.top, dawnMix);
    this.skyColors.mid.lerpColors(this.nightPalette.mid, this.dayPalette.mid, timeOfDay.daylight).lerp(this.dawnPalette.mid, dawnMix);
    this.skyColors.horizon.lerpColors(this.nightPalette.horizon, this.dayPalette.horizon, timeOfDay.daylight).lerp(this.dawnPalette.horizon, dawnMix);
    this.skyColors.bottom.lerpColors(this.nightPalette.bottom, this.dayPalette.bottom, timeOfDay.daylight).lerp(this.dawnPalette.bottom, dawnMix * 0.55);
    this.skyColors.fog.lerpColors(this.nightPalette.fog, this.dayPalette.fog, timeOfDay.daylight).lerp(this.dawnPalette.fog, dawnMix * 0.48);
    this.skyColors.background.lerpColors(this.nightPalette.background, this.dayPalette.background, timeOfDay.daylight).lerp(this.dawnPalette.background, dawnMix * 0.45);
    const stormSkyMix = THREE.MathUtils.clamp(weather.cloudCover * 0.12 + weather.precipitation * 0.18 + weather.thunder * 0.1, 0, 0.5);
    const stormHorizonMix = THREE.MathUtils.clamp(weather.cloudCover * 0.08 + weather.precipitation * 0.14 + weather.fog * 0.1, 0, 0.36);
    this.skyColors.top.lerp(this.stormSkyColor, stormSkyMix);
    this.skyColors.mid.lerp(this.stormSkyColor, stormSkyMix * 0.86);
    this.skyColors.horizon.lerp(this.stormHorizonColor, stormHorizonMix);
    this.skyColors.bottom.lerp(this.stormGroundColor, weather.fog * 0.18 + weather.precipitation * 0.08);
    this.skyColors.fog.lerp(this.stormFogColor, THREE.MathUtils.clamp(weather.fog * 0.42 + weather.precipitation * 0.18, 0, 0.64));
    this.skyColors.background.lerp(this.stormSkyColor, stormSkyMix * 0.74);

    if (this.skyMaterial) {
      (this.skyMaterial.uniforms.topColor.value as THREE.Color).copy(this.skyColors.top);
      (this.skyMaterial.uniforms.midColor.value as THREE.Color).copy(this.skyColors.mid);
      (this.skyMaterial.uniforms.horizonColor.value as THREE.Color).copy(this.skyColors.horizon);
      (this.skyMaterial.uniforms.bottomColor.value as THREE.Color).copy(this.skyColors.bottom);
    }

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.skyColors.background);
    } else {
      this.scene.background = this.skyColors.background.clone();
    }

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.skyColors.fog);
      const baseDensity = this.smokeMode ? 0.00135 : 0.00175;
      this.scene.fog.density = baseDensity * (0.76 + timeOfDay.night * 0.28 + timeOfDay.dawnDusk * 0.1 + weather.fog * 0.46 + weather.precipitation * 0.16);
    }

    const cloudOcclusion = 1 - weather.cloudCover * 0.86;
    if (this.starMaterial) {
      this.starMaterial.opacity = (this.smokeMode ? 0.42 : 0.62) * (0.16 + timeOfDay.night * 0.84) * cloudOcclusion;
    }
    if (this.moonMaterial) {
      this.moonMaterial.opacity = (0.08 + timeOfDay.night * 0.74) * (0.18 + cloudOcclusion * 0.82);
    }

    this.cloudLayers.forEach((layer) => {
      const material = layer.material as THREE.MeshBasicMaterial;
      const baseOpacity = (layer.userData.baseOpacity as number) ?? material.opacity;
      const weatherOpacity = THREE.MathUtils.clamp(0.56 + weather.cloudCover * 0.72 + weather.precipitation * 0.18, 0.5, 1.5);
      const stormMix = THREE.MathUtils.clamp(weather.cloudCover * 0.24 + weather.precipitation * 0.28 + weather.thunder * 0.2, 0, 0.72);
      material.opacity = baseOpacity * weatherOpacity * (0.76 + timeOfDay.night * 0.24 + timeOfDay.dawnDusk * 0.08);
      material.color.copy(
        this.cloudColor
          .copy(this.cloudNightColor)
          .lerp(this.cloudDayColor, timeOfDay.daylight)
          .lerp(this.cloudDawnColor, dawnMix * 0.28)
          .lerp(this.cloudStormColor, stormMix)
      );
    });

    this.groundMistLayers.forEach((layer) => {
      const material = layer.material as THREE.MeshBasicMaterial;
      const baseOpacity = (layer.userData.baseOpacity as number) ?? material.opacity;
      const weatherOpacity = THREE.MathUtils.clamp(0.42 + weather.fog * 0.94 + weather.wetness * 0.18, 0.34, 1.34);
      material.opacity = baseOpacity * weatherOpacity * (0.72 + timeOfDay.night * 0.35 + timeOfDay.dawnDusk * 0.16);
    });
  }

  private addSkyDome(): void {
    const geometry = new THREE.SphereGeometry(SKY_RADIUS, 48, 24);
    const brushTexture = this.createSkyBrushTexture();
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x274563) },
        midColor: { value: new THREE.Color(0x132936) },
        horizonColor: { value: new THREE.Color(0x614936) },
        bottomColor: { value: new THREE.Color(0x081116) },
        brushMap: { value: brushTexture }
      },
      vertexShader: `
        varying vec3 vDirection;
        varying vec2 vUv;

        void main() {
          vDirection = normalize(position);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDirection;
        varying vec2 vUv;
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform sampler2D brushMap;

        void main() {
          float y = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 lower = mix(bottomColor, horizonColor, smoothstep(0.1, 0.42, y));
          vec3 upper = mix(midColor, topColor, smoothstep(0.46, 1.0, y));
          vec3 color = mix(lower, upper, smoothstep(0.32, 0.72, y));
          vec2 brushUv = vec2(fract(vUv.x * 1.65 + vDirection.y * 0.08), clamp(vUv.y * 1.08, 0.0, 1.0));
          vec4 brush = texture2D(brushMap, brushUv);
          float painterMask = smoothstep(0.12, 0.34, y) * (1.0 - smoothstep(0.86, 1.0, y));
          float horizonWarmth = smoothstep(0.22, 0.38, y) * (1.0 - smoothstep(0.52, 0.72, y));
          float paperLift = (brush.r + brush.g + brush.b) * 0.33;
          color = mix(color, brush.rgb, brush.a * painterMask * 0.34);
          color += vec3(0.088, 0.046, 0.016) * horizonWarmth * (0.42 + brush.a * 0.52);
          color += vec3(0.012, 0.018, 0.014) * paperLift * painterMask;
          color = floor(color * 32.0) / 32.0 + 0.012;
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    this.skyMaterial = material;
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
      color.setHSL(this.rng.range(0.1, 0.17), this.rng.range(0.08, 0.2), this.rng.range(0.7, 0.96));
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
    this.starMaterial = material;
    const stars = new THREE.Points(geometry, material);
    stars.name = "Cloud-broken stars";
    stars.frustumCulled = false;
    this.root.add(stars);
  }

  private addMoon(): void {
    const texture = this.createMoonTexture();
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending
      });
    this.moonMaterial = material;
    const glow = new THREE.Sprite(material);
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
      { texture: textureA, y: 138, scale: 620, opacity: 0.32, color: 0x9aaba7 },
      { texture: textureB, y: 92, scale: 470, opacity: 0.24, color: 0x6f8790 }
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
      mesh.userData.baseOpacity = layer.opacity;
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
      { texture: textureA, y: 0.42, scale: 250, opacity: this.smokeMode ? 0.1 : 0.16, color: 0xb0b2a0, drift: 9 },
      { texture: textureB, y: 1.05, scale: 190, opacity: this.smokeMode ? 0.07 : 0.11, color: 0x78908d, drift: 7 }
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
      mist.userData.baseOpacity = layer.opacity;
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
        color: index % 2 === 0 ? 0xc7c5ab : 0x9db1aa,
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
    this.rainMaterial = material;
    const rain = new THREE.LineSegments(this.rainGeometry, material);
    rain.name = "Wind-blown rain";
    rain.frustumCulled = false;
    rain.renderOrder = 30;
    rain.userData.kind = "world-rain";
    this.worldWeatherRoot.add(rain);
    this.writeRainPositions(this.currentWeather);
  }

  private updateRain(dt: number, weather: WeatherState): void {
    if (this.rainMaterial) {
      const baseOpacity = this.smokeMode ? 0.22 : 0.34;
      this.rainMaterial.opacity = baseOpacity * weather.precipitation;
    }
    const speedScale = 0.35 + weather.precipitation * 0.86 + weather.wind * 0.32;
    const driftScale = 0.42 + weather.wind * 1.18;
    for (const drop of this.rainDrops) {
      drop.y -= drop.speed * speedScale * dt;
      drop.x += drop.drift * driftScale * dt;
      drop.z += drop.drift * 0.34 * driftScale * dt;
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
    this.writeRainPositions(weather);
  }

  private writeRainPositions(weather: WeatherState): void {
    const lengthScale = 0.72 + weather.precipitation * 0.48 + weather.wind * 0.24;
    const slantScale = 0.65 + weather.wind * 0.8;
    for (let i = 0; i < this.rainDrops.length; i += 1) {
      const drop = this.rainDrops[i];
      const offset = i * 6;
      this.rainPositions[offset] = drop.x;
      this.rainPositions[offset + 1] = drop.y;
      this.rainPositions[offset + 2] = drop.z;
      this.rainPositions[offset + 3] = drop.x - drop.drift * 0.028 * slantScale;
      this.rainPositions[offset + 4] = drop.y + drop.length * lengthScale;
      this.rainPositions[offset + 5] = drop.z - drop.drift * 0.01 * slantScale;
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

  private createSkyBrushTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const palette = [
      "rgba(55, 89, 113, 0.34)",
      "rgba(86, 118, 119, 0.28)",
      "rgba(128, 101, 85, 0.24)",
      "rgba(208, 132, 78, 0.2)",
      "rgba(28, 55, 62, 0.34)",
      "rgba(120, 105, 116, 0.18)"
    ];

    for (let i = 0; i < 96; i += 1) {
      const y = this.rng.range(92, 420);
      const x = this.rng.range(-180, 1024);
      const length = this.rng.range(150, 460);
      const lift = this.rng.range(-20, 20);
      ctx.strokeStyle = this.rng.pick(palette);
      ctx.lineWidth = this.rng.range(4, 20);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + length * 0.28,
        y + this.rng.range(-18, 18),
        x + length * 0.68,
        y + lift,
        x + length,
        y + this.rng.range(-14, 14)
      );
      ctx.stroke();
    }

    for (let band = 0; band < 6; band += 1) {
      const y = 290 + band * 21 + this.rng.range(-6, 6);
      const gradient = ctx.createLinearGradient(0, y - 18, 0, y + 18);
      gradient.addColorStop(0, "rgba(207, 132, 74, 0)");
      gradient.addColorStop(0.5, "rgba(207, 132, 74, 0.13)");
      gradient.addColorStop(1, "rgba(207, 132, 74, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y - 18, canvas.width, 36);
    }

    for (let i = 0; i < 210; i += 1) {
      ctx.fillStyle =
        this.rng.next() > 0.5
          ? `rgba(241, 220, 178, ${this.rng.range(0.014, 0.035)})`
          : `rgba(17, 39, 47, ${this.rng.range(0.012, 0.032)})`;
      ctx.fillRect(this.rng.range(0, 1024), this.rng.range(0, 512), this.rng.range(1, 3), this.rng.range(1, 3));
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private createMoonTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const glow = ctx.createRadialGradient(128, 128, 5, 128, 128, 128);
    glow.addColorStop(0, "rgba(247, 229, 187, 1)");
    glow.addColorStop(0.18, "rgba(238, 219, 178, 0.88)");
    glow.addColorStop(0.42, "rgba(156, 198, 205, 0.28)");
    glow.addColorStop(1, "rgba(156, 198, 205, 0)");
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
      gradient.addColorStop(0, `rgba(204, 222, 215, ${this.rng.range(0.04, 0.14) * alphaScale})`);
      gradient.addColorStop(1, "rgba(204, 222, 215, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, this.rng.range(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = "round";
    for (let i = 0; i < 44; i += 1) {
      const y = this.rng.range(70, 442);
      const x = this.rng.range(-60, 420);
      const length = this.rng.range(110, 260);
      ctx.strokeStyle = `rgba(236, 219, 182, ${this.rng.range(0.018, 0.052) * alphaScale})`;
      ctx.lineWidth = this.rng.range(2, 9);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + length * 0.25,
        y + this.rng.range(-10, 10),
        x + length * 0.72,
        y + this.rng.range(-16, 16),
        x + length,
        y + this.rng.range(-8, 8)
      );
      ctx.stroke();
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
    floorFade.addColorStop(0, "rgba(218, 222, 203, 0)");
    floorFade.addColorStop(0.32, "rgba(218, 222, 203, 0.13)");
    floorFade.addColorStop(0.72, "rgba(218, 222, 203, 0.28)");
    floorFade.addColorStop(1, "rgba(218, 222, 203, 0)");
    ctx.fillStyle = floorFade;
    ctx.fillRect(0, 0, 512, 256);

    for (let i = 0; i < 72; i += 1) {
      const x = this.rng.range(-40, 552);
      const y = this.rng.range(64, 226);
      const radiusX = this.rng.range(36, 126);
      const radiusY = this.rng.range(8, 32);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radiusX);
      gradient.addColorStop(0, `rgba(235, 226, 200, ${this.rng.range(0.18, 0.4)})`);
      gradient.addColorStop(0.45, `rgba(202, 220, 212, ${this.rng.range(0.08, 0.17)})`);
      gradient.addColorStop(1, "rgba(202, 220, 212, 0)");
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
