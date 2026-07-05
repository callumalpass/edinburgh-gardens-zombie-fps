import { distance } from "./geo";
import type { Vec2 } from "./types";

export type NoiseKind = "footstep" | "sprint" | "gunshot" | "melee" | "reload" | "climb" | "objective" | "scream";

export interface NoiseEvent {
  id: number;
  kind: NoiseKind;
  position: Vec2;
  radius: number;
  intensity: number;
  ttl: number;
}

export interface NoiseProfile {
  radius: number;
  intensity: number;
  ttl: number;
}

export const NOISE_PROFILES: Record<NoiseKind, NoiseProfile> = {
  footstep: { radius: 13, intensity: 0.34, ttl: 1.2 },
  sprint: { radius: 31, intensity: 0.72, ttl: 1.65 },
  gunshot: { radius: 210, intensity: 1.18, ttl: 5.2 },
  melee: { radius: 10, intensity: 0.22, ttl: 0.9 },
  reload: { radius: 16, intensity: 0.28, ttl: 1.4 },
  climb: { radius: 44, intensity: 0.68, ttl: 2.2 },
  objective: { radius: 58, intensity: 0.78, ttl: 2.6 },
  scream: { radius: 98, intensity: 0.95, ttl: 3.4 }
};

export class NoiseSystem {
  private nextId = 1;
  private readonly events: NoiseEvent[] = [];

  update(dt: number): void {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      this.events[index].ttl -= dt;
      if (this.events[index].ttl <= 0) {
        this.events.splice(index, 1);
      }
    }
  }

  clear(): void {
    this.events.length = 0;
  }

  emit(kind: NoiseKind, position: Vec2, multiplier = 1): void {
    const profile = NOISE_PROFILES[kind];
    this.events.push({
      id: this.nextId++,
      kind,
      position: { ...position },
      radius: profile.radius * multiplier,
      intensity: profile.intensity * multiplier,
      ttl: profile.ttl
    });
    if (this.events.length > 32) {
      this.events.shift();
    }
  }

  strongestAt(position: Vec2, hearingMultiplier = 1): NoiseEvent | null {
    let strongest: NoiseEvent | null = null;
    let strongestScore = 0;

    for (const event of this.events) {
      const eventDistance = distance(position, event.position);
      const effectiveRadius = event.radius * hearingMultiplier;
      if (eventDistance > effectiveRadius) {
        continue;
      }
      const score = event.intensity * (1 - eventDistance / Math.max(1, effectiveRadius));
      if (score > strongestScore) {
        strongest = event;
        strongestScore = score;
      }
    }

    return strongest;
  }
}

export function movementNoiseKind(speed: number, crouching: boolean, sprinting: boolean): NoiseKind | null {
  if (speed < 0.8) return null;
  if (sprinting && !crouching) return "sprint";
  return "footstep";
}

export function movementNoiseMultiplier(crouching: boolean, onPath: boolean): number {
  const stance = crouching ? 0.28 : 1;
  const surface = onPath ? 1.22 : 0.78;
  return stance * surface;
}
