import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { TimeOfDayState } from "./timeOfDay";
import type { WeatherState } from "./weather";

const ANIME_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    strength: { value: 1 },
    nightAmount: { value: 1 },
    daylight: { value: 0 },
    precipitation: { value: 0 },
    weatherFog: { value: 0 },
    cloudCover: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float strength;
    uniform float nightAmount;
    uniform float daylight;
    uniform float precipitation;
    uniform float weatherFog;
    uniform float cloudCover;
    varying vec2 vUv;

    float animeLuminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 pixel = 1.0 / resolution;
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = base.rgb;

      float center = animeLuminance(color);
      float right = animeLuminance(texture2D(tDiffuse, vUv + vec2(pixel.x, 0.0)).rgb);
      float left = animeLuminance(texture2D(tDiffuse, vUv - vec2(pixel.x, 0.0)).rgb);
      float up = animeLuminance(texture2D(tDiffuse, vUv + vec2(0.0, pixel.y)).rgb);
      float down = animeLuminance(texture2D(tDiffuse, vUv - vec2(0.0, pixel.y)).rgb);
      float edge = smoothstep(0.12, 0.32, abs(center - right) + abs(center - left) + abs(center - up) + abs(center - down));

      vec3 shadowLift = vec3(0.045, 0.074, 0.071);
      vec3 mids = vec3(1.012, 1.01, 0.955);
      vec3 highlights = vec3(1.09, 1.035, 0.82);
      color = color * mids + shadowLift * (1.0 - smoothstep(0.08, 0.62, center)) * 0.54;
      color = mix(color, color * highlights + vec3(0.006, 0.003, 0.0), smoothstep(0.56, 0.98, center) * 0.18);
      color = mix(color, floor(color * 16.0) / 16.0, 0.038 * strength);
      color = mix(color, vec3(0.018, 0.048, 0.052), edge * 0.13 * strength);
      color = mix(color, color * vec3(0.72, 0.84, 0.92) + vec3(0.004, 0.016, 0.022), nightAmount * 0.21 * strength);
      color = mix(color, color * vec3(1.05, 1.03, 0.95) + vec3(0.014, 0.008, 0.0), daylight * 0.11 * strength);
      float weatherAmount = clamp(precipitation * 0.72 + weatherFog * 0.36 + cloudCover * 0.22, 0.0, 1.0);
      color = mix(color, color * vec3(0.8, 0.9, 1.0) + vec3(0.004, 0.014, 0.024), weatherAmount * 0.2 * strength);
      color = mix(color, vec3(animeLuminance(color)) * vec3(0.92, 1.0, 1.06), weatherFog * 0.075 * strength);

      float vignette = smoothstep(0.88, 0.18, distance(vUv, vec2(0.5)));
      float vignetteFloor = mix(0.9, 0.95, daylight);
      vignetteFloor = mix(vignetteFloor, 0.84, cloudCover * 0.12 + precipitation * 0.1);
      color *= mix(vignetteFloor, 1.018, vignette);

      gl_FragColor = vec4(color, base.a);
    }
  `
};

export class PostProcessingPipeline {
  private readonly composer: EffectComposer;
  private readonly gradePass: ShaderPass;
  private enabled: boolean;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    smokeMode: boolean
  ) {
    this.enabled = !smokeMode;
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(scene, camera));

    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), smokeMode ? 0.04 : 0.08, 0.26, 0.84);
    this.composer.addPass(bloom);

    this.gradePass = new ShaderPass(ANIME_GRADE_SHADER);
    this.gradePass.uniforms.strength.value = smokeMode ? 0.45 : 1;
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.gradePass.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
  }

  setTimeOfDay(timeOfDay: TimeOfDayState): void {
    this.gradePass.uniforms.nightAmount.value = timeOfDay.night;
    this.gradePass.uniforms.daylight.value = timeOfDay.daylight;
  }

  setWeather(weather: WeatherState): void {
    this.gradePass.uniforms.precipitation.value = weather.precipitation;
    this.gradePass.uniforms.weatherFog.value = weather.fog;
    this.gradePass.uniforms.cloudCover.value = weather.cloudCover;
  }

  render(dt: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      renderer.render(scene, camera);
      return;
    }
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
