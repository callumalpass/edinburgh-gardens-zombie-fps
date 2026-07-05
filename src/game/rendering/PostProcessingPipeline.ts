import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const ANIME_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    strength: { value: 1 }
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
    uniform float time;
    uniform vec2 resolution;
    uniform float strength;
    varying vec2 vUv;

    float animeLuminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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

      vec3 shadowLift = vec3(0.042, 0.068, 0.086);
      vec3 mids = vec3(0.96, 0.99, 0.94);
      vec3 highlights = vec3(1.06, 0.98, 0.78);
      color = color * mids + shadowLift * (1.0 - smoothstep(0.08, 0.62, center)) * 0.54;
      color = mix(color, color * highlights, smoothstep(0.6, 0.98, center) * 0.12);
      color = mix(color, floor(color * 12.0) / 12.0, 0.05 * strength);
      color = mix(color, vec3(0.025, 0.055, 0.075), edge * 0.18 * strength);

      float vignette = smoothstep(0.82, 0.22, distance(vUv, vec2(0.5)));
      color *= mix(0.84, 1.03, vignette);

      float grain = hash(vUv * resolution + time * 41.0) - 0.5;
      color += grain * 0.012 * strength;

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

  render(dt: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      renderer.render(scene, camera);
      return;
    }
    this.gradePass.uniforms.time.value += dt;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
