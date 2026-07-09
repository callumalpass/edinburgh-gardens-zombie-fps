import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { TimeOfDayState } from "./timeOfDay";
import type { WeatherState } from "./weather";
import { RENDER_QUALITY_SETTINGS, type RenderQualityLevel } from "./renderQuality";

const ANIME_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    strength: { value: 1 },
    inkStrength: { value: 1 },
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
    uniform float inkStrength;
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
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = base.rgb;
      float center = animeLuminance(color);
      float edge = smoothstep(0.035, 0.125, fwidth(center));
      float skyProtection = smoothstep(0.5, 0.9, vUv.y);
      float worldGrade = strength * (1.0 - skyProtection * 0.72);

      vec3 shadowLift = vec3(0.064, 0.105, 0.1);
      float shadowMask = 1.0 - smoothstep(0.055, 0.48, center);
      color = mix(color, max(color, shadowLift), shadowMask * 0.34 * worldGrade);
      color = mix(color, color * vec3(1.035, 1.018, 0.95) + vec3(0.008, 0.004, 0.0), smoothstep(0.5, 0.96, center) * 0.12 * worldGrade);

      float gradedLuma = max(0.018, animeLuminance(color));
      float bandedLuma = floor(gradedLuma * 9.0 + 0.42) / 9.0;
      vec3 bandedColor = color * (bandedLuma / gradedLuma);
      color = mix(color, bandedColor, 0.055 * worldGrade);
      color = mix(color, color * vec3(0.78, 0.9, 0.96) + vec3(0.008, 0.022, 0.026), nightAmount * 0.16 * worldGrade);
      color = mix(color, color * vec3(1.04, 1.026, 0.966) + vec3(0.012, 0.007, 0.0), daylight * 0.085 * worldGrade);
      float weatherAmount = clamp(precipitation * 0.72 + weatherFog * 0.36 + cloudCover * 0.22, 0.0, 1.0);
      color = mix(color, color * vec3(0.82, 0.92, 1.0) + vec3(0.006, 0.016, 0.022), weatherAmount * 0.17 * worldGrade);
      color = mix(color, vec3(animeLuminance(color)) * vec3(0.9, 1.0, 1.055), weatherFog * 0.065 * worldGrade);

      float horizonBand = smoothstep(0.16, 0.54, vUv.y) * (1.0 - smoothstep(0.76, 0.98, vUv.y));
      float aerialWash = clamp(horizonBand * (0.18 + weatherFog * 0.62 + cloudCover * 0.18 + precipitation * 0.16), 0.0, 1.0);
      vec3 distanceWash = vec3(animeLuminance(color)) * vec3(0.82, 0.96, 1.02) + vec3(0.018, 0.032, 0.028);
      color = mix(color, distanceWash, aerialWash * 0.09 * worldGrade);

      float foregroundInk = smoothstep(0.82, 0.18, vUv.y);
      float darkInk = 1.0 - smoothstep(0.2, 0.58, center);
      float inkWeight = clamp(0.18 + foregroundInk * 0.42 + darkInk * 0.52 - weatherFog * 0.2 - cloudCover * 0.06, 0.1, 1.0);
      color = mix(color, vec3(0.028, 0.062, 0.061), edge * inkWeight * 0.12 * inkStrength * (1.0 - skyProtection * 0.62));

      float vignette = smoothstep(0.88, 0.18, distance(vUv, vec2(0.5)));
      float vignetteFloor = mix(0.935, 0.968, daylight);
      vignetteFloor = mix(vignetteFloor, 0.9, cloudCover * 0.12 + precipitation * 0.1);
      color *= mix(vignetteFloor, 1.012, vignette);

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

    this.gradePass = new ShaderPass(ANIME_GRADE_SHADER);
    this.gradePass.uniforms.strength.value = smokeMode ? 0.45 : 1;
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.gradePass.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
  }

  setPixelRatio(pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
  }

  setQualityLevel(level: RenderQualityLevel): void {
    this.gradePass.uniforms.inkStrength.value = RENDER_QUALITY_SETTINGS[level].inkStrength;
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
