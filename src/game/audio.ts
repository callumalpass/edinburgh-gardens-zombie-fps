import type { MovementSurface, NoiseEvent, NoiseKind } from "./noise";
import type { WeatherState } from "./rendering/weather";
import type { ZombieAiState } from "./state";
import type { Vec2 } from "./types";
import type { WeaponId } from "./weapons";
import type { ZombieType } from "./zombieProfiles";

export interface AudioListenerState {
  position: Vec2;
  yaw: number;
  height?: number;
}

export interface NoisePlaybackOptions {
  surface?: MovementSurface;
  weaponId?: WeaponId;
  volume?: number;
}

export type WorldSoundKind =
  | "dryFire"
  | "equip"
  | "pickup"
  | "weaponPickup"
  | "upgrade"
  | "deny"
  | "drink"
  | "rest"
  | "searchStart"
  | "searchComplete"
  | "searchCancel"
  | "bulletHit"
  | "meleeHit"
  | "shell"
  | "zombieGroan"
  | "zombieStep"
  | "zombieDeath"
  | "zombieAttack"
  | "zombiePain"
  | "playerHit";

export interface WorldSoundOptions {
  zombieType?: ZombieType;
  aiState?: ZombieAiState;
  volume?: number;
}

interface NoiseSoundProfile {
  audibleScale: number;
  baseGain: number;
  duration: number;
}

interface FootstepSoundProfile {
  thumpFrequency: number;
  thumpGain: number;
  noiseGain: number;
  filterFrequency: number;
  brightness: number;
}

interface SoundBus {
  input: GainNode;
  maxDuration: number;
}

export type ZombieVocalCue = "groan" | "attack" | "pain" | "death" | "scream";

export interface ZombieVoiceTreatment {
  playbackRate: number;
  playbackVariance: number;
  highpassFrequency: number;
  lowpassFrequency: number;
  distortion: number;
  sampleGain: number;
}

const SILENCE = 0.0001;
const MIN_SPATIAL_GAIN = 0.003;
const MAX_ACTIVE_SOUND_BUSES = 48;
const NOISE_BUFFER_BUCKET_SECONDS = 0.02;
const MAX_ACTIVE_ZOMBIE_VOICES = 6;
const MAX_ACTIVE_ZOMBIE_GROANS = 3;

const ZOMBIE_VOCAL_SAMPLE_PATHS = [
  "audio/zombies/vocal-01.ogg",
  "audio/zombies/vocal-02.ogg",
  "audio/zombies/vocal-03.ogg",
  "audio/zombies/vocal-04.ogg",
  "audio/zombies/vocal-05.ogg",
  "audio/zombies/vocal-06.ogg",
  "audio/zombies/vocal-07.ogg",
  "audio/zombies/vocal-08.ogg",
  "audio/zombies/vocal-09.ogg",
  "audio/zombies/vocal-10.ogg"
] as const;

const ZOMBIE_VOCAL_SAMPLES_BY_CUE: Record<ZombieVocalCue, readonly number[]> = {
  groan: [6, 7, 8, 9, 4, 5],
  attack: [0, 1, 2, 3, 4, 5],
  pain: [0, 1, 2, 3],
  death: [4, 5, 6, 7, 8, 9],
  scream: [1, 2, 3, 5]
};

export const NOISE_SOUND_PROFILES: Record<NoiseKind, NoiseSoundProfile> = {
  footstep: { audibleScale: 1.35, baseGain: 0.22, duration: 0.11 },
  sprint: { audibleScale: 1.25, baseGain: 0.34, duration: 0.14 },
  gunshot: { audibleScale: 1.18, baseGain: 0.78, duration: 0.24 },
  melee: { audibleScale: 1.2, baseGain: 0.24, duration: 0.16 },
  reload: { audibleScale: 1.15, baseGain: 0.2, duration: 0.34 },
  climb: { audibleScale: 1.05, baseGain: 0.28, duration: 0.42 },
  scream: { audibleScale: 1.28, baseGain: 0.68, duration: 1.2 },
  distraction: { audibleScale: 1.14, baseGain: 0.32, duration: 0.34 },
  scavenge: { audibleScale: 1.12, baseGain: 0.2, duration: 0.28 },
  flashlight: { audibleScale: 1.08, baseGain: 0.12, duration: 0.08 },
  skateboard: { audibleScale: 1.16, baseGain: 0.3, duration: 0.18 }
};

export const SURFACE_FOOTSTEP_PROFILES: Record<MovementSurface, FootstepSoundProfile> = {
  grass: { thumpFrequency: 82, thumpGain: 0.24, noiseGain: 0.16, filterFrequency: 720, brightness: 0.28 },
  dirt: { thumpFrequency: 92, thumpGain: 0.3, noiseGain: 0.22, filterFrequency: 960, brightness: 0.36 },
  gravel: { thumpFrequency: 118, thumpGain: 0.24, noiseGain: 0.58, filterFrequency: 2300, brightness: 0.82 },
  asphalt: { thumpFrequency: 124, thumpGain: 0.32, noiseGain: 0.34, filterFrequency: 1700, brightness: 0.58 },
  concrete: { thumpFrequency: 112, thumpGain: 0.3, noiseGain: 0.3, filterFrequency: 1450, brightness: 0.48 },
  rail: { thumpFrequency: 138, thumpGain: 0.22, noiseGain: 0.46, filterFrequency: 2600, brightness: 0.9 }
};

export function footstepProfileForSurface(surface: MovementSurface): FootstepSoundProfile {
  return SURFACE_FOOTSTEP_PROFILES[surface];
}

export function audibleRadiusForNoise(event: Pick<NoiseEvent, "kind" | "radius">): number {
  return Math.max(6, event.radius * NOISE_SOUND_PROFILES[event.kind].audibleScale);
}

export function soundGainAtDistance(distance: number, radius: number, intensity = 1): number {
  if (radius <= 0 || distance >= radius) {
    return 0;
  }
  const proximity = 1 - Math.max(0, distance) / radius;
  return Math.min(1.5, Math.pow(proximity, 1.55) * Math.max(0, intensity));
}

export function soundPanForSource(listener: AudioListenerState, source: Vec2): number {
  const dx = source.x - listener.position.x;
  const dz = source.z - listener.position.z;
  if (Math.abs(dx) + Math.abs(dz) < 0.001) {
    return 0;
  }
  const sourceAngle = Math.atan2(dx, dz);
  const relative = normalizeAngle(sourceAngle - listener.yaw);
  return Math.max(-1, Math.min(1, Math.sin(relative)));
}

export function worldSoundAudibleRadius(kind: WorldSoundKind, options: WorldSoundOptions = {}): number {
  if (kind === "zombieGroan") {
    const alertRadius = options.aiState === "chase" ? 158 : options.aiState === "investigate" || options.aiState === "search" ? 130 : 98;
    if (options.zombieType === "screamer") return alertRadius * 1.28;
    if (options.zombieType === "bloater") return alertRadius * 1.08;
    if (options.zombieType === "crawler") return alertRadius * 0.74;
    return alertRadius;
  }
  if (kind === "zombieStep") {
    if (options.zombieType === "bloater") return 68;
    if (options.zombieType === "sprinter") return 52;
    if (options.zombieType === "crawler") return 30;
    return 42;
  }
  if (kind === "zombieDeath") return options.zombieType === "bloater" ? 86 : options.zombieType === "screamer" ? 92 : 72;
  if (kind === "zombieAttack") return options.zombieType === "bloater" ? 58 : options.zombieType === "screamer" ? 64 : 42;
  if (kind === "zombiePain") return options.zombieType === "bloater" ? 54 : options.zombieType === "screamer" ? 58 : 38;
  if (kind === "bulletHit") return 36;
  if (kind === "meleeHit") return 32;
  if (kind === "shell") return 10;
  return 18;
}

export function worldSoundBaseGain(kind: WorldSoundKind, options: WorldSoundOptions = {}): number {
  if (kind === "playerHit") return 0.62;
  if (kind === "zombieGroan") {
    if (options.zombieType === "screamer") return 0.9;
    if (options.zombieType === "bloater") return 0.62;
    if (options.zombieType === "sprinter") return 0.5;
    if (options.zombieType === "crawler") return 0.42;
    return 0.46;
  }
  if (kind === "zombieStep") {
    if (options.zombieType === "bloater") return 0.38;
    if (options.zombieType === "sprinter") return 0.24;
    if (options.zombieType === "crawler") return 0.14;
    return 0.2;
  }
  if (kind === "zombieDeath") return options.zombieType === "screamer" ? 0.52 : options.zombieType === "bloater" ? 0.48 : 0.38;
  if (kind === "zombieAttack") return options.zombieType === "screamer" ? 0.54 : options.zombieType === "bloater" ? 0.44 : 0.34;
  if (kind === "zombiePain") return options.zombieType === "bloater" ? 0.38 : options.zombieType === "screamer" ? 0.44 : 0.3;
  if (kind === "bulletHit") return 0.26;
  if (kind === "meleeHit") return 0.34;
  if (kind === "shell") return 0.12;
  if (kind === "deny") return 0.24;
  return 0.22;
}

export function zombieVoiceTreatment(zombieType: ZombieType, cue: ZombieVocalCue): ZombieVoiceTreatment {
  const cueRate = cue === "attack" || cue === "pain" ? 1.06 : cue === "death" ? 0.88 : cue === "scream" ? 1.12 : 1;
  const cueGain = cue === "scream" ? 1.12 : cue === "death" ? 0.96 : cue === "pain" ? 0.88 : 1;
  switch (zombieType) {
    case "bloater":
      return {
        playbackRate: 0.61 * cueRate,
        playbackVariance: 0.045,
        highpassFrequency: 34,
        lowpassFrequency: 1550,
        distortion: 18,
        sampleGain: 1.05 * cueGain
      };
    case "sprinter":
      return {
        playbackRate: 1.05 * cueRate,
        playbackVariance: 0.075,
        highpassFrequency: 150,
        lowpassFrequency: 4300,
        distortion: 9,
        sampleGain: 0.86 * cueGain
      };
    case "crawler":
      return {
        playbackRate: 0.83 * cueRate,
        playbackVariance: 0.065,
        highpassFrequency: 90,
        lowpassFrequency: 2350,
        distortion: 22,
        sampleGain: 0.78 * cueGain
      };
    case "screamer":
      return {
        playbackRate: 1.16 * cueRate,
        playbackVariance: 0.09,
        highpassFrequency: 210,
        lowpassFrequency: 6200,
        distortion: 15,
        sampleGain: 0.98 * cueGain
      };
    default:
      return {
        playbackRate: 0.79 * cueRate,
        playbackVariance: 0.055,
        highpassFrequency: 70,
        lowpassFrequency: 2800,
        distortion: 12,
        sampleGain: 0.9 * cueGain
      };
  }
}

export class GameAudio {
  private readonly enabled: boolean;
  private masterVolume: number;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientRainGain: GainNode | null = null;
  private ambientWindGain: GainNode | null = null;
  private ambientSources: AudioBufferSourceNode[] = [];
  private readonly noiseBuffers = new Map<number, AudioBuffer>();
  private zombieVocalBuffers: Array<AudioBuffer | null> = [];
  private zombieVocalLoad: Promise<void> | null = null;
  private readonly lastZombieSampleByCue = new Map<string, number>();
  private activeSoundBuses = 0;
  private activeZombieVoices = 0;
  private activeZombieGroans = 0;
  private nextZombieGroanAt = 0;
  private listener: AudioListenerState = { position: { x: 0, z: 0 }, yaw: 0, height: 0 };
  private disposed = false;

  constructor(options: { enabled?: boolean; masterVolume?: number } = {}) {
    this.enabled = options.enabled ?? true;
    this.masterVolume = options.masterVolume ?? 0.72;
  }

  get active(): boolean {
    return Boolean(this.context && this.context.state === "running");
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.04);
    }
  }

  async unlock(): Promise<boolean> {
    if (!this.enabled || this.disposed) {
      return false;
    }
    const context = this.ensureContext();
    if (!context) {
      return false;
    }
    if (context.state === "suspended") {
      await context.resume();
    }
    this.startAmbient();
    void this.preloadZombieVocals();
    return context.state === "running";
  }

  dispose(): void {
    this.disposed = true;
    this.stopAmbient();
    if (this.context && this.context.state !== "closed") {
      void this.context.close();
    }
    this.noiseBuffers.clear();
    this.zombieVocalBuffers = [];
    this.zombieVocalLoad = null;
    this.lastZombieSampleByCue.clear();
    this.activeSoundBuses = 0;
    this.activeZombieVoices = 0;
    this.activeZombieGroans = 0;
    this.context = null;
    this.master = null;
    this.ambientGain = null;
  }

  setListener(listener: AudioListenerState): void {
    this.listener = {
      position: { ...listener.position },
      yaw: listener.yaw,
      height: listener.height ?? 0
    };
  }

  update(dt: number, state: { health: number; scoped: boolean; crouching: boolean; weather?: WeatherState }): void {
    if (!this.context || !this.ambientGain) {
      return;
    }
    const danger = state.health < 35 ? 1 : 0;
    const focusDip = state.scoped ? 0.74 : 1;
    const stanceDip = state.crouching ? 0.92 : 1;
    const target = (0.048 + danger * 0.018) * focusDip * stanceDip;
    const now = this.context.currentTime;
    const current = this.ambientGain.gain.value;
    const smoothing = 1 - Math.pow(0.01, dt);
    this.ambientGain.gain.setTargetAtTime(current + (target - current) * smoothing, now, 0.18);

    if (state.weather) {
      this.ambientRainGain?.gain.setTargetAtTime(0.03 + state.weather.precipitation * 0.56 + state.weather.thunder * 0.08, now, 0.65);
      this.ambientWindGain?.gain.setTargetAtTime(0.05 + state.weather.wind * 0.36 + state.weather.precipitation * 0.04, now, 0.8);
    }
  }

  playNoise(event: NoiseEvent, options: NoisePlaybackOptions = {}): void {
    const profile = NOISE_SOUND_PROFILES[event.kind];
    const bus = this.createSpatialBus(
      event.position,
      audibleRadiusForNoise(event),
      profile.baseGain * soundGainAtDistance(this.distanceToListener(event.position), audibleRadiusForNoise(event), event.intensity) * (options.volume ?? 1),
      profile.duration
    );
    if (!bus) {
      return;
    }

    switch (event.kind) {
      case "footstep":
      case "sprint":
        this.playFootstep(bus, options.surface ?? "grass", event.kind === "sprint");
        break;
      case "gunshot":
        this.playGunshot(bus, options.weaponId ?? "carbine");
        break;
      case "melee":
        this.playMeleeSwing(bus, options.weaponId ?? "knife");
        break;
      case "reload":
        this.playReload(bus, options.weaponId ?? "carbine");
        break;
      case "climb":
        this.playClimb(bus);
        break;
      case "scream":
        this.playScream(bus);
        break;
      case "distraction":
        this.playClick(bus, 1180, 0.05, 0.28);
        this.playNoiseBurst(bus, 0.12, 0.24, 2200, "bandpass", 0.04);
        break;
      case "scavenge":
        this.playNoiseBurst(bus, 0.16, 0.2, 1700, "bandpass");
        this.playClick(bus, 360, 0.04, 0.18, 0.08);
        break;
      case "flashlight":
        this.playClick(bus, 880, 0.025, 0.18);
        break;
      case "skateboard":
        this.playNoiseBurst(bus, 0.14, 0.26, 1500, "bandpass");
        this.playTone(bus, 108, 0.08, "sine", 0.12);
        this.playClick(bus, 2100, 0.025, 0.14, 0.06);
        break;
    }
  }

  playWorld(kind: WorldSoundKind, position?: Vec2, options: WorldSoundOptions = {}): void {
    const local = !position;
    const radius = worldSoundAudibleRadius(kind, options);
    const source = position ?? this.listener.position;
    const volume = worldSoundBaseGain(kind, options) * (options.volume ?? 1);
    const gain = local ? volume : volume * soundGainAtDistance(this.distanceToListener(source), radius, 1);
    const zombieVoice = kind === "zombieGroan" || kind === "zombieAttack" || kind === "zombiePain" || kind === "zombieDeath";
    if (zombieVoice && gain <= (local ? SILENCE : MIN_SPATIAL_GAIN)) {
      return;
    }
    if (zombieVoice && !this.reserveZombieVoice(kind, this.distanceToListener(source))) {
      return;
    }
    const bus = this.createSpatialBus(source, radius, gain, this.worldSoundDuration(kind), local);
    if (!bus) {
      if (zombieVoice) this.releaseZombieVoice(kind);
      return;
    }
    if (zombieVoice) this.releaseZombieVoiceLater(kind, bus.maxDuration + 0.12);

    switch (kind) {
      case "dryFire":
        this.playClick(bus, 1020, 0.025, 0.6);
        this.playClick(bus, 190, 0.04, 0.18, 0.025);
        break;
      case "equip":
        this.playClick(bus, 480, 0.055, 0.32);
        this.playClick(bus, 760, 0.035, 0.22, 0.05);
        break;
      case "pickup":
        this.playPickup(bus, 520, 740);
        break;
      case "weaponPickup":
        this.playPickup(bus, 410, 820);
        this.playClick(bus, 1220, 0.03, 0.22, 0.08);
        break;
      case "upgrade":
        this.playPickup(bus, 620, 980);
        this.playTone(bus, 1240, 0.08, "triangle", 0.15, 0.08);
        break;
      case "deny":
        this.playClick(bus, 155, 0.055, 0.5);
        break;
      case "drink":
        this.playNoiseBurst(bus, 0.24, 0.28, 1500, "bandpass");
        this.playTone(bus, 600, 0.08, "sine", 0.2, 0.04);
        break;
      case "rest":
        this.playTone(bus, 260, 0.16, "sine", 0.18);
        this.playNoiseBurst(bus, 0.14, 0.09, 700, "lowpass");
        break;
      case "searchStart":
        this.playNoiseBurst(bus, 0.12, 0.22, 1900, "bandpass");
        this.playClick(bus, 360, 0.05, 0.22, 0.06);
        break;
      case "searchComplete":
        this.playNoiseBurst(bus, 0.13, 0.18, 1800, "bandpass");
        this.playPickup(bus, 460, 690);
        break;
      case "searchCancel":
        this.playClick(bus, 170, 0.04, 0.34);
        break;
      case "bulletHit":
        this.playNoiseBurst(bus, 0.07, 0.36, 760, "lowpass");
        this.playClick(bus, 520, 0.026, 0.12);
        break;
      case "meleeHit":
        this.playNoiseBurst(bus, 0.08, 0.46, 680, "lowpass");
        this.playTone(bus, 115, 0.06, "sawtooth", 0.24);
        break;
      case "shell":
        this.playClick(bus, 1680, 0.028, 0.18);
        this.playClick(bus, 980, 0.024, 0.11, 0.09);
        break;
      case "zombieStep":
        this.playZombieStep(bus, options.zombieType ?? "shambler", options.aiState ?? "wander");
        break;
      case "zombieGroan":
        this.playZombieGroan(bus, options.zombieType ?? "shambler", options.aiState ?? "wander");
        break;
      case "zombieDeath":
        this.playZombieDeath(bus, options.zombieType ?? "shambler");
        break;
      case "zombieAttack":
        this.playZombieAttack(bus, options.zombieType ?? "shambler");
        break;
      case "zombiePain":
        this.playZombiePain(bus, options.zombieType ?? "shambler");
        break;
      case "playerHit":
        this.playTone(bus, 82, 0.09, "sawtooth", 0.44);
        this.playNoiseBurst(bus, 0.16, 0.26, 520, "lowpass");
        break;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context || !this.enabled || this.disposed || typeof window === "undefined") {
      return this.context;
    }
    const windowWithFallback = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? windowWithFallback.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }
    this.context = new AudioContextCtor();
    this.master = this.context.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.context.destination);
    return this.context;
  }

  private preloadZombieVocals(): Promise<void> {
    if (this.zombieVocalLoad) {
      return this.zombieVocalLoad;
    }
    const context = this.context;
    if (!context) {
      return Promise.resolve();
    }
    this.zombieVocalLoad = Promise.all(
      ZOMBIE_VOCAL_SAMPLE_PATHS.map(async (path) => {
        try {
          const response = await fetch(new URL(path, window.location.href));
          if (!response.ok) return null;
          return await context.decodeAudioData(await response.arrayBuffer());
        } catch {
          return null;
        }
      })
    ).then((buffers) => {
      if (!this.disposed && this.context === context) {
        this.zombieVocalBuffers = buffers;
      }
    });
    return this.zombieVocalLoad;
  }

  private startAmbient(): void {
    if (!this.context || !this.master || this.ambientSources.length > 0) {
      return;
    }
    this.ambientGain = this.context.createGain();
    this.ambientGain.gain.value = 0.048;
    this.ambientGain.connect(this.master);

    const rain = this.context.createBufferSource();
    rain.buffer = this.createNoiseBuffer(2.2);
    rain.loop = true;
    const rainFilter = this.context.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 1300;
    const rainGain = this.context.createGain();
    rainGain.gain.value = 0.26;
    rain.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(this.ambientGain);
    rain.start();

    const wind = this.context.createBufferSource();
    wind.buffer = this.createNoiseBuffer(3.6);
    wind.loop = true;
    const windFilter = this.context.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 420;
    const windGain = this.context.createGain();
    windGain.gain.value = 0.22;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.ambientGain);
    wind.start();

    this.ambientRainGain = rainGain;
    this.ambientWindGain = windGain;
    this.ambientSources = [rain, wind];
  }

  private stopAmbient(): void {
    for (const source of this.ambientSources) {
      try {
        source.stop();
      } catch {
        // Source may already have stopped during context teardown.
      }
      source.disconnect();
    }
    this.ambientSources = [];
    this.ambientGain?.disconnect();
    this.ambientGain = null;
    this.ambientRainGain = null;
    this.ambientWindGain = null;
  }

  private createSpatialBus(position: Vec2, radius: number, gainValue: number, maxDuration: number, local = false): SoundBus | null {
    const minimumGain = local ? SILENCE : MIN_SPATIAL_GAIN;
    if (!this.context || !this.master || gainValue <= minimumGain) {
      return null;
    }
    if (!local && this.activeSoundBuses >= MAX_ACTIVE_SOUND_BUSES) {
      return null;
    }
    const input = this.context.createGain();
    input.gain.value = Math.min(1.4, gainValue);
    this.activeSoundBuses += 1;
    this.releaseBusLater(maxDuration + 0.25);
    if (local) {
      input.connect(this.master);
      this.disconnectLater(input, maxDuration + 0.2);
      return { input, maxDuration };
    }

    const panner = this.context.createStereoPanner();
    const distance = this.distanceToListener(position);
    const distanceNarrowing = Math.min(1, distance / Math.max(1, radius * 0.3));
    panner.pan.value = soundPanForSource(this.listener, position) * distanceNarrowing;
    input.connect(panner);
    panner.connect(this.master);
    this.disconnectLater(input, maxDuration + 0.2);
    this.disconnectLater(panner, maxDuration + 0.2);
    return { input, maxDuration };
  }

  private distanceToListener(position: Vec2): number {
    const dx = position.x - this.listener.position.x;
    const dz = position.z - this.listener.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private playFootstep(bus: SoundBus, surface: MovementSurface, sprinting: boolean): void {
    const profile = footstepProfileForSurface(surface);
    const stride = sprinting ? 1.28 : 1;
    this.playTone(bus, profile.thumpFrequency, 0.055 * stride, "sine", profile.thumpGain * stride);
    this.playNoiseBurst(bus, 0.075 * stride, profile.noiseGain * stride, profile.filterFrequency, profile.brightness > 0.6 ? "bandpass" : "lowpass");
    if (profile.brightness > 0.55) {
      this.playClick(bus, 1900 + profile.brightness * 460, 0.024, 0.16 * profile.brightness, 0.035);
    }
  }

  private playGunshot(bus: SoundBus, weaponId: WeaponId): void {
    const weaponTone: Record<WeaponId, { thump: number; crack: number; boom: number; tail: number }> = {
      knife: { thump: 90, crack: 500, boom: 0.4, tail: 0.08 },
      machete: { thump: 90, crack: 500, boom: 0.4, tail: 0.08 },
      carbine: { thump: 142, crack: 840, boom: 0.74, tail: 0.1 },
      shotgun: { thump: 82, crack: 560, boom: 1.1, tail: 0.16 },
      flareGun: { thump: 96, crack: 720, boom: 0.82, tail: 0.22 },
      smg: { thump: 176, crack: 1020, boom: 0.55, tail: 0.075 },
      rifle: { thump: 118, crack: 1320, boom: 0.9, tail: 0.13 }
    };
    const tone = weaponTone[weaponId];
    this.playNoiseBurst(bus, 0.045, 0.88 * tone.boom, tone.crack, "bandpass");
    this.playNoiseBurst(bus, 0.12 + tone.tail, 0.42 * tone.boom, 620, "lowpass", 0.018);
    this.playTone(bus, tone.thump, 0.1 + tone.tail, "sawtooth", 0.34 * tone.boom);
    this.playTone(bus, tone.crack, 0.028, "square", 0.14, 0.004);
  }

  private playMeleeSwing(bus: SoundBus, weaponId: WeaponId): void {
    const machete = weaponId === "machete";
    this.playNoiseBurst(bus, machete ? 0.18 : 0.13, machete ? 0.42 : 0.3, machete ? 950 : 1350, "bandpass");
    this.playToneSweep(bus, machete ? 330 : 420, machete ? 190 : 260, machete ? 0.13 : 0.09, "triangle", machete ? 0.12 : 0.08);
  }

  private playReload(bus: SoundBus, weaponId: WeaponId): void {
    const singleShell = weaponId === "shotgun" || weaponId === "flareGun";
    this.playClick(bus, singleShell ? 420 : 620, 0.04, singleShell ? 0.38 : 0.28);
    this.playNoiseBurst(bus, 0.07, singleShell ? 0.18 : 0.12, singleShell ? 1200 : 1800, "bandpass", 0.055);
    this.playClick(bus, singleShell ? 980 : 1320, 0.035, singleShell ? 0.2 : 0.24, singleShell ? 0.15 : 0.1);
    if (!singleShell) {
      this.playClick(bus, 360, 0.05, 0.16, 0.18);
    }
  }

  private playClimb(bus: SoundBus): void {
    this.playToneSweep(bus, 210, 165, 0.28, "triangle", 0.16);
    this.playNoiseBurst(bus, 0.11, 0.18, 820, "bandpass");
    this.playClick(bus, 960, 0.03, 0.2, 0.1);
    this.playClick(bus, 640, 0.035, 0.16, 0.22);
  }

  private playScream(bus: SoundBus): void {
    if (this.playZombieVocalSample(bus, "screamer", "scream")) {
      this.playNoiseBurst(bus, 0.18, 0.16, 5200, "highpass", 0.03);
      this.playToneSweep(bus, 380, 1120, 0.28, "sawtooth", 0.08, 0.05);
      return;
    }
    this.playScreamerShriek(bus, 1.05);
  }

  private playZombieGroan(bus: SoundBus, zombieType: ZombieType, aiState: ZombieAiState): void {
    const chase = aiState === "chase" || aiState === "investigate";
    const cue: ZombieVocalCue = zombieType === "screamer" && chase ? "scream" : "groan";
    if (this.playZombieVocalSample(bus, zombieType, cue)) {
      if (zombieType === "bloater") {
        this.playTone(bus, 39, 0.42, "sine", chase ? 0.2 : 0.14, 0.05);
        this.playNoiseBurst(bus, 0.38, 0.1, 240, "lowpass", 0.08);
      } else if (zombieType === "sprinter") {
        this.playBreathPulses(bus, chase ? 5 : 3, 0.04, 0.07, 1900, chase ? 0.075 : 0.045);
      } else if (zombieType === "crawler") {
        this.playNoiseBurst(bus, 0.3, 0.085, 390, "lowpass", 0.08);
        this.playClick(bus, 175, 0.028, 0.08, 0.2);
      } else if (zombieType === "screamer") {
        this.playNoiseBurst(bus, 0.2, chase ? 0.12 : 0.065, 4600, "highpass", 0.06);
      } else {
        this.playNoiseBurst(bus, 0.24, 0.055, 680, "bandpass", 0.06);
      }
      return;
    }

    const profile = zombieVoiceProfile(zombieType);
    const top = chase ? profile.baseFrequency * profile.alertPitchMultiplier : profile.baseFrequency * 1.12;
    const duration = chase ? profile.alertDuration : profile.idleDuration;
    this.playToneSweep(bus, profile.baseFrequency, top, duration, profile.wave, chase ? profile.voiceGain : profile.voiceGain * 0.68);
    this.playToneSweep(bus, profile.baseFrequency * 0.52, top * 0.46, duration * 0.9, "sine", profile.voiceGain * 0.36, 0.035);
    this.playNoiseBurst(bus, duration * 0.62, profile.breathGain, profile.breathFrequency, "bandpass", 0.035);
    if (zombieType === "bloater") {
      this.playTone(bus, 42, 0.2, "sine", 0.18, 0.08);
      this.playNoiseBurst(bus, 0.3, 0.12, 260, "lowpass", 0.12);
    }
    if (zombieType === "sprinter") {
      this.playBreathPulses(bus, 4, 0.045, 0.075, 1800, 0.08);
    }
    if (zombieType === "crawler") {
      this.playNoiseBurst(bus, 0.34, 0.08, 420, "lowpass", 0.12);
      this.playClick(bus, 190, 0.035, 0.1, 0.22);
    }
  }

  private playZombieStep(bus: SoundBus, zombieType: ZombieType, aiState: ZombieAiState): void {
    const alerted = aiState === "chase" || aiState === "investigate";
    if (zombieType === "bloater") {
      this.playTone(bus, 45, 0.11, "sine", alerted ? 0.32 : 0.24);
      this.playNoiseBurst(bus, 0.16, alerted ? 0.2 : 0.15, 310, "lowpass", 0.02);
      this.playClick(bus, 96, 0.045, 0.16, 0.06);
      return;
    }
    if (zombieType === "sprinter") {
      this.playNoiseBurst(bus, 0.055, alerted ? 0.2 : 0.14, 1300, "bandpass");
      this.playClick(bus, 620, 0.026, 0.09, 0.03);
      this.playClick(bus, 760, 0.022, 0.07, 0.08);
      return;
    }
    if (zombieType === "crawler") {
      this.playNoiseBurst(bus, 0.12, 0.12, 360, "lowpass");
      this.playNoiseBurst(bus, 0.06, 0.08, 1300, "bandpass", 0.06);
      return;
    }
    this.playNoiseBurst(bus, 0.09, alerted ? 0.18 : 0.14, zombieType === "screamer" ? 980 : 620, "lowpass");
    this.playTone(bus, zombieType === "screamer" ? 94 : 76, 0.055, "sine", zombieType === "screamer" ? 0.14 : 0.11);
  }

  private playZombieAttack(bus: SoundBus, zombieType: ZombieType): void {
    if (this.playZombieVocalSample(bus, zombieType, "attack")) {
      if (zombieType === "bloater") {
        this.playToneSweep(bus, 72, 42, 0.36, "sawtooth", 0.14, 0.04);
        this.playNoiseBurst(bus, 0.18, 0.18, 360, "lowpass", 0.05);
      } else if (zombieType === "sprinter") {
        this.playNoiseBurst(bus, 0.09, 0.13, 2100, "bandpass", 0.02);
      } else if (zombieType === "crawler") {
        this.playNoiseBurst(bus, 0.13, 0.14, 470, "lowpass", 0.04);
      } else if (zombieType === "screamer") {
        this.playNoiseBurst(bus, 0.14, 0.17, 4800, "highpass", 0.03);
      }
      return;
    }
    if (zombieType === "screamer") {
      this.playScreamerShriek(bus, 0.62);
      this.playClick(bus, 2400, 0.025, 0.22, 0.08);
      return;
    }
    if (zombieType === "bloater") {
      this.playToneSweep(bus, 86, 48, 0.28, "sawtooth", 0.32);
      this.playNoiseBurst(bus, 0.16, 0.28, 420, "lowpass", 0.04);
      this.playClick(bus, 130, 0.055, 0.24, 0.12);
      return;
    }
    if (zombieType === "sprinter") {
      this.playToneSweep(bus, 260, 190, 0.11, "sawtooth", 0.2);
      this.playNoiseBurst(bus, 0.08, 0.2, 1500, "bandpass");
      return;
    }
    if (zombieType === "crawler") {
      this.playToneSweep(bus, 130, 82, 0.18, "sawtooth", 0.18);
      this.playNoiseBurst(bus, 0.1, 0.16, 520, "lowpass");
      return;
    }
    this.playToneSweep(bus, 150, 96, 0.18, "sawtooth", 0.22);
    this.playNoiseBurst(bus, 0.08, 0.18, 1100, "bandpass");
  }

  private playZombieDeath(bus: SoundBus, zombieType: ZombieType): void {
    if (this.playZombieVocalSample(bus, zombieType, "death")) {
      const low = zombieType === "bloater" ? 42 : zombieType === "crawler" ? 68 : 54;
      this.playToneSweep(bus, low * 1.8, low, zombieType === "bloater" ? 0.72 : 0.5, "sawtooth", zombieType === "bloater" ? 0.16 : 0.1, 0.08);
      this.playNoiseBurst(bus, 0.3, zombieType === "bloater" ? 0.18 : 0.12, zombieType === "sprinter" ? 780 : 430, "lowpass", 0.16);
      return;
    }
    if (zombieType === "screamer") {
      this.playToneSweep(bus, 540, 130, 0.56, "sawtooth", 0.3);
      this.playNoiseBurst(bus, 0.42, 0.24, 2400, "bandpass", 0.04);
      this.playNoiseBurst(bus, 0.28, 0.2, 520, "lowpass", 0.18);
      return;
    }
    if (zombieType === "bloater") {
      this.playToneSweep(bus, 92, 38, 0.68, "sawtooth", 0.3);
      this.playNoiseBurst(bus, 0.42, 0.28, 300, "lowpass", 0.08);
      this.playClick(bus, 72, 0.05, 0.16, 0.32);
      return;
    }
    this.playToneSweep(bus, zombieType === "crawler" ? 96 : 130, zombieType === "crawler" ? 62 : 52, 0.46, "sawtooth", 0.24);
    this.playNoiseBurst(bus, 0.22, 0.22, zombieType === "sprinter" ? 760 : 540, "lowpass", 0.08);
  }

  private playZombiePain(bus: SoundBus, zombieType: ZombieType): void {
    if (this.playZombieVocalSample(bus, zombieType, "pain")) {
      this.playNoiseBurst(
        bus,
        zombieType === "bloater" ? 0.22 : 0.12,
        zombieType === "bloater" ? 0.16 : 0.1,
        zombieType === "sprinter" || zombieType === "screamer" ? 1900 : 520,
        zombieType === "sprinter" || zombieType === "screamer" ? "bandpass" : "lowpass",
        0.025
      );
      return;
    }
    const base = zombieVoiceProfile(zombieType).baseFrequency;
    this.playToneSweep(bus, base * 1.7, base * 0.82, 0.24, "sawtooth", 0.2);
    this.playNoiseBurst(bus, 0.12, 0.16, zombieType === "sprinter" ? 1700 : 620, "bandpass", 0.02);
  }

  private playZombieVocalSample(bus: SoundBus, zombieType: ZombieType, cue: ZombieVocalCue): boolean {
    if (!this.context || this.zombieVocalBuffers.length === 0) {
      return false;
    }
    const available = ZOMBIE_VOCAL_SAMPLES_BY_CUE[cue].filter((index) => Boolean(this.zombieVocalBuffers[index]));
    if (available.length === 0) {
      return false;
    }
    const key = `${zombieType}:${cue}`;
    const previous = this.lastZombieSampleByCue.get(key);
    const choices = available.length > 1 ? available.filter((index) => index !== previous) : available;
    const sampleIndex = choices[Math.floor(Math.random() * choices.length)] ?? available[0];
    const buffer = this.zombieVocalBuffers[sampleIndex];
    if (!buffer) {
      return false;
    }
    this.lastZombieSampleByCue.set(key, sampleIndex);

    const treatment = zombieVoiceTreatment(zombieType, cue);
    const variance = (Math.random() * 2 - 1) * treatment.playbackVariance;
    const playbackRate = Math.max(0.42, treatment.playbackRate + variance);
    const start = this.context.currentTime;
    const duration = Math.min(bus.maxDuration - 0.04, buffer.duration / playbackRate);
    const source = this.context.createBufferSource();
    const highpass = this.context.createBiquadFilter();
    const lowpass = this.context.createBiquadFilter();
    const distortion = this.context.createWaveShaper();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, start);
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(treatment.highpassFrequency * (0.94 + Math.random() * 0.12), start);
    highpass.Q.setValueAtTime(0.62, start);
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(treatment.lowpassFrequency * (0.94 + Math.random() * 0.12), start);
    lowpass.Q.setValueAtTime(zombieType === "crawler" ? 1.1 : 0.72, start);
    distortion.curve = distortionCurve(treatment.distortion);
    distortion.oversample = "2x";
    gain.gain.setValueAtTime(SILENCE, start);
    gain.gain.linearRampToValueAtTime(treatment.sampleGain, start + 0.018);
    gain.gain.setValueAtTime(treatment.sampleGain, start + Math.max(0.02, duration - 0.1));
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + duration);
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(distortion);
    distortion.connect(gain);
    gain.connect(bus.input);
    source.start(start);
    source.stop(start + duration + 0.02);
    return true;
  }

  private reserveZombieVoice(kind: WorldSoundKind, distance: number): boolean {
    const groan = kind === "zombieGroan";
    const now = this.context?.currentTime ?? 0;
    if (this.activeZombieVoices >= MAX_ACTIVE_ZOMBIE_VOICES) {
      return false;
    }
    if (groan) {
      if (this.activeZombieGroans >= MAX_ACTIVE_ZOMBIE_GROANS || now < this.nextZombieGroanAt) {
        return false;
      }
      this.activeZombieGroans += 1;
      this.nextZombieGroanAt = now + (distance > 90 ? 0.34 : distance > 45 ? 0.22 : 0.12);
    }
    this.activeZombieVoices += 1;
    return true;
  }

  private releaseZombieVoice(kind: WorldSoundKind): void {
    this.activeZombieVoices = Math.max(0, this.activeZombieVoices - 1);
    if (kind === "zombieGroan") {
      this.activeZombieGroans = Math.max(0, this.activeZombieGroans - 1);
    }
  }

  private releaseZombieVoiceLater(kind: WorldSoundKind, delay: number): void {
    window.setTimeout(() => this.releaseZombieVoice(kind), Math.ceil(delay * 1000));
  }

  private playScreamerShriek(bus: SoundBus, intensity: number): void {
    const gain = Math.max(0.18, intensity);
    this.playNoiseBurst(bus, 0.16, 0.12 * gain, 700, "bandpass");
    this.playToneSweep(bus, 260, 1180, 0.42, "sawtooth", 0.24 * gain, 0.08);
    this.playToneSweep(bus, 411, 1640, 0.34, "square", 0.12 * gain, 0.12);
    this.playToneSweep(bus, 92, 210, 0.72, "sawtooth", 0.18 * gain, 0.1);
    this.playNoiseBurst(bus, 0.62, 0.24 * gain, 2600, "bandpass", 0.1);
    this.playNoiseBurst(bus, 0.42, 0.12 * gain, 5200, "highpass", 0.16);
  }

  private playBreathPulses(bus: SoundBus, count: number, duration: number, gap: number, frequency: number, gain: number): void {
    for (let index = 0; index < count; index += 1) {
      this.playNoiseBurst(bus, duration, gain, frequency, "bandpass", index * gap);
    }
  }

  private playPickup(bus: SoundBus, low: number, high: number): void {
    this.playTone(bus, low, 0.07, "sine", 0.2);
    this.playTone(bus, high, 0.08, "triangle", 0.18, 0.055);
  }

  private playClick(bus: SoundBus, frequency: number, duration: number, gain: number, startOffset = 0): void {
    this.playTone(bus, frequency, duration, "square", gain, startOffset);
    this.playNoiseBurst(bus, Math.min(0.045, duration), gain * 0.24, frequency * 1.6, "bandpass", startOffset);
  }

  private playTone(
    bus: SoundBus,
    frequency: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    startOffset = 0
  ): void {
    if (!this.context) {
      return;
    }
    const start = this.context.currentTime + startOffset;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    this.applyEnvelope(gain.gain, start, duration, gainValue);
    oscillator.connect(gain);
    gain.connect(bus.input);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private playToneSweep(
    bus: SoundBus,
    fromFrequency: number,
    toFrequency: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    startOffset = 0
  ): void {
    if (!this.context) {
      return;
    }
    const start = this.context.currentTime + startOffset;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toFrequency), start + duration);
    this.applyEnvelope(gain.gain, start, duration, gainValue);
    oscillator.connect(gain);
    gain.connect(bus.input);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private playNoiseBurst(
    bus: SoundBus,
    duration: number,
    gainValue: number,
    filterFrequency: number,
    filterType: BiquadFilterType,
    startOffset = 0
  ): void {
    if (!this.context) {
      return;
    }
    const start = this.context.currentTime + startOffset;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.createNoiseBuffer(duration + 0.02);
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, start);
    filter.Q.setValueAtTime(filterType === "bandpass" ? 1.6 : 0.72, start);
    this.applyEnvelope(gain.gain, start, duration, gainValue, 0.004);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus.input);
    source.start(start);
    source.stop(start + duration + 0.03);
  }

  private applyEnvelope(param: AudioParam, start: number, duration: number, gainValue: number, attack = 0.006): void {
    const releaseStart = start + Math.max(attack + 0.001, duration * 0.48);
    const end = start + duration;
    param.cancelScheduledValues(start);
    param.setValueAtTime(SILENCE, start);
    param.linearRampToValueAtTime(Math.max(SILENCE, gainValue), start + attack);
    param.exponentialRampToValueAtTime(Math.max(SILENCE, gainValue * 0.28), releaseStart);
    param.exponentialRampToValueAtTime(SILENCE, end);
  }

  private createNoiseBuffer(duration: number): AudioBuffer {
    const context = this.context!;
    const bucket = Math.max(1, Math.ceil(duration / NOISE_BUFFER_BUCKET_SECONDS));
    const cached = this.noiseBuffers.get(bucket);
    if (cached) {
      return cached;
    }
    const length = Math.max(1, Math.floor(context.sampleRate * bucket * NOISE_BUFFER_BUCKET_SECONDS));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    this.noiseBuffers.set(bucket, buffer);
    return buffer;
  }

  private worldSoundDuration(kind: WorldSoundKind): number {
    if (kind === "zombieGroan") return 2.65;
    if (kind === "zombieAttack") return 1.55;
    if (kind === "zombiePain") return 1.35;
    if (kind === "zombieDeath") return 2.85;
    if (kind === "zombieStep") return 0.24;
    if (kind === "playerHit") return 0.18;
    if (kind === "drink") return 0.32;
    if (kind === "searchComplete") return 0.24;
    return 0.28;
  }

  private disconnectLater(node: AudioNode, delay: number): void {
    window.setTimeout(() => {
      try {
        node.disconnect();
      } catch {
        // Nodes may already be disconnected when a context is closed.
      }
    }, Math.ceil(delay * 1000));
  }

  private releaseBusLater(delay: number): void {
    window.setTimeout(() => {
      this.activeSoundBuses = Math.max(0, this.activeSoundBuses - 1);
    }, Math.ceil(delay * 1000));
  }
}

function zombieVoiceProfile(zombieType: ZombieType): {
  baseFrequency: number;
  alertPitchMultiplier: number;
  idleDuration: number;
  alertDuration: number;
  voiceGain: number;
  breathGain: number;
  breathFrequency: number;
  wave: OscillatorType;
} {
  if (zombieType === "bloater") {
    return {
      baseFrequency: 58,
      alertPitchMultiplier: 1.34,
      idleDuration: 0.62,
      alertDuration: 0.48,
      voiceGain: 0.27,
      breathGain: 0.18,
      breathFrequency: 520,
      wave: "sawtooth"
    };
  }
  if (zombieType === "sprinter") {
    return {
      baseFrequency: 128,
      alertPitchMultiplier: 1.62,
      idleDuration: 0.36,
      alertDuration: 0.28,
      voiceGain: 0.2,
      breathGain: 0.13,
      breathFrequency: 1500,
      wave: "triangle"
    };
  }
  if (zombieType === "crawler") {
    return {
      baseFrequency: 98,
      alertPitchMultiplier: 1.24,
      idleDuration: 0.58,
      alertDuration: 0.44,
      voiceGain: 0.18,
      breathGain: 0.12,
      breathFrequency: 620,
      wave: "triangle"
    };
  }
  return {
    baseFrequency: 92,
    alertPitchMultiplier: zombieType === "screamer" ? 2.2 : 1.48,
    idleDuration: 0.5,
    alertDuration: 0.36,
    voiceGain: zombieType === "screamer" ? 0.3 : 0.2,
    breathGain: zombieType === "screamer" ? 0.2 : 0.1,
    breathFrequency: zombieType === "screamer" ? 2200 : 740,
    wave: zombieType === "screamer" ? "sawtooth" : "triangle"
  };
}

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 512;
  const curve = new Float32Array(samples);
  const drive = Math.max(0, amount);
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / (samples - 1) - 1;
    curve[index] = ((3 + drive) * x * 20 * (Math.PI / 180)) / (Math.PI + drive * Math.abs(x));
  }
  return curve;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized <= -Math.PI) normalized += Math.PI * 2;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  return normalized;
}
