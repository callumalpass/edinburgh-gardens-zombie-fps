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

const SILENCE = 0.0001;

export const NOISE_SOUND_PROFILES: Record<NoiseKind, NoiseSoundProfile> = {
  footstep: { audibleScale: 1.35, baseGain: 0.22, duration: 0.11 },
  sprint: { audibleScale: 1.25, baseGain: 0.34, duration: 0.14 },
  gunshot: { audibleScale: 1.18, baseGain: 0.78, duration: 0.24 },
  melee: { audibleScale: 1.2, baseGain: 0.24, duration: 0.16 },
  reload: { audibleScale: 1.15, baseGain: 0.2, duration: 0.34 },
  climb: { audibleScale: 1.05, baseGain: 0.28, duration: 0.42 },
  scream: { audibleScale: 1.2, baseGain: 0.52, duration: 0.92 }
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

export class GameAudio {
  private readonly enabled: boolean;
  private readonly masterVolume: number;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientRainGain: GainNode | null = null;
  private ambientWindGain: GainNode | null = null;
  private ambientSources: AudioBufferSourceNode[] = [];
  private listener: AudioListenerState = { position: { x: 0, z: 0 }, yaw: 0, height: 0 };
  private disposed = false;

  constructor(options: { enabled?: boolean; masterVolume?: number } = {}) {
    this.enabled = options.enabled ?? true;
    this.masterVolume = options.masterVolume ?? 0.72;
  }

  get active(): boolean {
    return Boolean(this.context && this.context.state === "running");
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
    return context.state === "running";
  }

  dispose(): void {
    this.disposed = true;
    this.stopAmbient();
    if (this.context && this.context.state !== "closed") {
      void this.context.close();
    }
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
    }
  }

  playWorld(kind: WorldSoundKind, position?: Vec2, options: WorldSoundOptions = {}): void {
    const local = !position;
    const radius = this.worldSoundRadius(kind, options);
    const source = position ?? this.listener.position;
    const volume = this.worldSoundGain(kind, options) * (options.volume ?? 1);
    const gain = local ? volume : volume * soundGainAtDistance(this.distanceToListener(source), radius, 1);
    const bus = this.createSpatialBus(source, radius, gain, this.worldSoundDuration(kind), local);
    if (!bus) {
      return;
    }

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
        this.playNoiseBurst(bus, 0.09, 0.16, 620, "lowpass");
        this.playTone(bus, options.zombieType === "bloater" ? 58 : 76, 0.055, "sine", options.zombieType === "bloater" ? 0.18 : 0.11);
        break;
      case "zombieGroan":
        this.playZombieGroan(bus, options.zombieType ?? "shambler", options.aiState ?? "wander");
        break;
      case "zombieDeath":
        this.playToneSweep(bus, options.zombieType === "bloater" ? 94 : 130, options.zombieType === "crawler" ? 74 : 52, 0.46, "sawtooth", 0.24);
        this.playNoiseBurst(bus, 0.22, 0.22, 540, "lowpass", 0.08);
        break;
      case "zombieAttack":
        this.playToneSweep(bus, 150, 96, 0.18, "sawtooth", 0.22);
        this.playNoiseBurst(bus, 0.08, 0.18, 1100, "bandpass");
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
    if (!this.context || !this.master || gainValue <= SILENCE) {
      return null;
    }
    const input = this.context.createGain();
    input.gain.value = Math.min(1.4, gainValue);
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
    const singleShell = weaponId === "shotgun";
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
    this.playToneSweep(bus, 330, 760, 0.34, "sawtooth", 0.26);
    this.playToneSweep(bus, 190, 390, 0.52, "sawtooth", 0.22, 0.08);
    this.playNoiseBurst(bus, 0.52, 0.18, 2200, "bandpass", 0.04);
  }

  private playZombieGroan(bus: SoundBus, zombieType: ZombieType, aiState: ZombieAiState): void {
    const chase = aiState === "chase" || aiState === "investigate";
    const base =
      zombieType === "bloater"
        ? 62
        : zombieType === "crawler"
          ? 104
          : zombieType === "screamer"
            ? 180
            : zombieType === "sprinter"
              ? 126
              : 92;
    const top = chase ? base * 1.5 : base * 1.16;
    this.playToneSweep(bus, base, top, chase ? 0.34 : 0.48, zombieType === "screamer" ? "sawtooth" : "triangle", chase ? 0.24 : 0.15);
    this.playNoiseBurst(bus, chase ? 0.25 : 0.18, zombieType === "bloater" ? 0.16 : 0.1, zombieType === "screamer" ? 1800 : 740, "bandpass", 0.08);
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
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private worldSoundRadius(kind: WorldSoundKind, options: WorldSoundOptions): number {
    if (kind === "zombieGroan") return options.aiState === "chase" ? 58 : 42;
    if (kind === "zombieStep") return options.zombieType === "bloater" ? 34 : 22;
    if (kind === "zombieDeath") return 64;
    if (kind === "zombieAttack") return 34;
    if (kind === "bulletHit") return 36;
    if (kind === "meleeHit") return 32;
    if (kind === "shell") return 10;
    return 18;
  }

  private worldSoundGain(kind: WorldSoundKind, options: WorldSoundOptions): number {
    if (kind === "playerHit") return 0.62;
    if (kind === "zombieGroan") return options.zombieType === "screamer" ? 0.34 : options.zombieType === "bloater" ? 0.31 : 0.24;
    if (kind === "zombieStep") return options.zombieType === "bloater" ? 0.16 : 0.1;
    if (kind === "zombieDeath") return 0.32;
    if (kind === "zombieAttack") return 0.28;
    if (kind === "bulletHit") return 0.26;
    if (kind === "meleeHit") return 0.34;
    if (kind === "shell") return 0.12;
    if (kind === "deny") return 0.24;
    return 0.22;
  }

  private worldSoundDuration(kind: WorldSoundKind): number {
    if (kind === "zombieGroan") return 0.72;
    if (kind === "zombieDeath") return 0.58;
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
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized <= -Math.PI) normalized += Math.PI * 2;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  return normalized;
}
