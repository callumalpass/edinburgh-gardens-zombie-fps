import { Effect, PostProcess, Texture, UniversalCamera } from "@babylonjs/core";
import type { WeatherState } from "../weather";

Effect.ShadersStore.egAnimeGradeFragmentShader = `
  precision highp float;

  varying vec2 vUV;
  uniform sampler2D textureSampler;
  uniform float time;
  uniform vec2 resolution;
  uniform float strength;
  uniform float precipitation;
  uniform float weatherFog;
  uniform float cloudCover;

  float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main(void) {
    vec2 pixel = 1.0 / resolution;
    float rainAmount = clamp(precipitation * 0.85 + weatherFog * 0.16, 0.0, 1.0);
    vec2 uv = vUV;
    float sheet = noise(vec2(vUV.x * 24.0 + time * 0.08, vUV.y * 96.0 - time * 4.2));
    float bead = smoothstep(0.91, 1.0, sheet) * rainAmount;
    uv.y += bead * 0.0045;
    uv.x += sin(vUV.y * 40.0 + time * 1.7) * precipitation * 0.0009;

    vec4 base = texture2D(textureSampler, uv);
    vec3 color = base.rgb;

    float center = luminance(color);
    vec3 coolNight = vec3(0.055, 0.082, 0.096);
    vec3 sodium = vec3(1.06, 0.86, 0.54);
    color = mix(color, color * vec3(0.83, 0.93, 1.04) + coolNight * 0.34, (cloudCover * 0.16 + precipitation * 0.18) * strength);
    color = mix(color, color * sodium, smoothstep(0.58, 0.98, center) * 0.1);
    color = max(color - vec3(0.012, 0.01, 0.008) * strength, vec3(0.0));
    color = pow(color, vec3(0.96));

    float weatherAmount = clamp(precipitation * 0.66 + weatherFog * 0.48 + cloudCover * 0.18, 0.0, 1.0);
    color = mix(color, vec3(luminance(color)) * vec3(0.78, 0.9, 1.0) + coolNight * 0.32, weatherFog * 0.18 * strength);
    color = mix(color, color * vec3(0.86, 0.94, 1.02), weatherAmount * 0.16 * strength);

    float vignette = smoothstep(0.82, 0.22, distance(vUV, vec2(0.5)));
    color *= mix(0.68, 1.04, vignette);

    vec3 bloomSample = texture2D(textureSampler, uv + pixel * vec2(1.5, -1.2)).rgb;
    color += bloomSample * smoothstep(0.72, 1.0, luminance(bloomSample)) * (0.035 + rainAmount * 0.045);

    float grain = hash(vUV * resolution + time * 41.0) - 0.5;
    color += grain * (0.009 + precipitation * 0.009 + weatherFog * 0.004) * strength;
    color = mix(color, color * (0.96 + bead * 0.12), rainAmount * 0.2);
    gl_FragColor = vec4(color, base.a);
  }
`;

export class BabylonAnimePipeline {
  private readonly postProcess: PostProcess;
  private time = 0;
  private precipitation = 0;
  private weatherFog = 0;
  private cloudCover = 0;

  constructor(camera: UniversalCamera, smokeMode: boolean) {
    this.postProcess = new PostProcess(
      "eg-realism-grade",
      "egAnimeGrade",
      ["time", "resolution", "strength", "precipitation", "weatherFog", "cloudCover"],
      null,
      1,
      camera,
      Texture.NEAREST_SAMPLINGMODE,
      camera.getScene().getEngine()
    );
    this.postProcess.onApply = (effect) => {
      effect.setFloat("time", this.time);
      effect.setFloat2("resolution", Math.max(1, this.postProcess.width), Math.max(1, this.postProcess.height));
      effect.setFloat("strength", smokeMode ? 0.7 : 1);
      effect.setFloat("precipitation", this.precipitation);
      effect.setFloat("weatherFog", this.weatherFog);
      effect.setFloat("cloudCover", this.cloudCover);
    };
  }

  update(dt: number, weather: WeatherState): void {
    this.time += dt;
    this.precipitation = weather.precipitation;
    this.weatherFog = weather.fog;
    this.cloudCover = weather.cloudCover;
  }

  dispose(): void {
    this.postProcess.dispose();
  }
}
