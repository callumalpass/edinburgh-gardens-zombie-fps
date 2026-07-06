import * as THREE from "three";
import type { HitZone } from "../state";
import type { WeaponId } from "../weapons";
import type { ZombieType } from "../waves";

export interface CombatTarget {
  id: number;
  type: ZombieType;
  position: THREE.Vector3;
  radius: number;
}

export interface CombatHit<TTarget extends CombatTarget = CombatTarget> {
  target: TTarget;
  point: THREE.Vector3;
  distance: number;
  zone: HitZone;
}

export interface RaySphereHit {
  point: THREE.Vector3;
  distance: number;
}

export interface ZombieMeleeReachContext {
  zombieType: ZombieType;
  zombieRadius: number;
  targetRadius: number;
  horizontalDistance: number;
  targetElevation: number;
}

const STANDARD_ZOMBIE_MELEE_ELEVATION_LIMIT = 1.4;
const BLOATER_MELEE_ELEVATION_LIMIT = 4.75;
const ZOMBIE_MELEE_REACH_PADDING = 0.8;

export function canZombieMeleeCombatant(context: ZombieMeleeReachContext): boolean {
  const maxHorizontalReach = context.zombieRadius + context.targetRadius + ZOMBIE_MELEE_REACH_PADDING;
  if (context.horizontalDistance >= maxHorizontalReach) {
    return false;
  }

  const elevationLimit =
    context.zombieType === "bloater" ? BLOATER_MELEE_ELEVATION_LIMIT : STANDARD_ZOMBIE_MELEE_ELEVATION_LIMIT;
  return context.targetElevation < elevationLimit;
}

export function findZombieHits<TTarget extends CombatTarget>(
  targets: readonly TTarget[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  range: number,
  limit: number
): Array<CombatHit<TTarget>> {
  const closestByTarget = new Map<number, CombatHit<TTarget>>();
  for (const target of targets) {
    for (const zone of zombieHitZones(target)) {
      const hit = raySphereHit(origin, direction, zone.center, zone.radius, range);
      const previous = closestByTarget.get(target.id);
      if (hit && (!previous || hit.distance < previous.distance)) {
        closestByTarget.set(target.id, {
          target,
          point: hit.point,
          distance: hit.distance,
          zone: zone.zone
        });
      }
    }
  }
  return [...closestByTarget.values()].sort((a, b) => a.distance - b.distance).slice(0, Math.max(1, limit));
}

export function findMeleeHits<TTarget extends CombatTarget>(
  targets: readonly TTarget[],
  originPosition: THREE.Vector3,
  direction: THREE.Vector3,
  range: number,
  limit: number,
  crouching: boolean,
  weaponId: WeaponId
): Array<CombatHit<TTarget>> {
  const forward = direction.clone();
  forward.y = 0;
  if (forward.lengthSq() > 0.001) {
    forward.normalize();
  }
  const arcCos = Math.cos(meleeArcRadians(weaponId));

  return targets
    .map((target) => {
      const toTarget = new THREE.Vector3(target.position.x - originPosition.x, 0, target.position.z - originPosition.z);
      const targetDistance = toTarget.length();
      if (targetDistance > range + target.radius) {
        return null;
      }
      if (targetDistance > 0.001) {
        toTarget.normalize();
      }
      if (forward.dot(toTarget) < arcCos) {
        return null;
      }

      const zone: HitZone = crouching || target.type === "crawler" ? "legs" : targetDistance < range * 0.62 ? "body" : "head";
      const point = target.position.clone().add(new THREE.Vector3(0, zone === "head" ? 2.2 : zone === "legs" ? 0.72 : 1.4, 0));
      return {
        target,
        point,
        distance: targetDistance,
        zone
      };
    })
    .filter((hit): hit is CombatHit<TTarget> => Boolean(hit))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, limit));
}

export function raySphereHit(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
  range: number
): RaySphereHit | null {
  const toCenter = center.clone().sub(origin);
  const projection = toCenter.dot(direction);
  if (projection < 0 || projection > range) {
    return null;
  }
  const closestPoint = origin.clone().addScaledVector(direction, projection);
  const missDistance = closestPoint.distanceTo(center);
  if (missDistance > radius) {
    return null;
  }
  const offset = Math.sqrt(Math.max(0, radius * radius - missDistance * missDistance));
  const distanceAlongRay = Math.max(0, projection - offset);
  return {
    point: origin.clone().addScaledVector(direction, distanceAlongRay),
    distance: distanceAlongRay
  };
}

function zombieHitZones(target: CombatTarget): Array<{ zone: HitZone; center: THREE.Vector3; radius: number }> {
  const bodyScale = target.type === "bloater" ? 1.45 : target.type === "sprinter" ? 0.84 : target.type === "crawler" ? 0.62 : 1;
  const crouchOffset = target.type === "crawler" ? -0.58 : 0;
  return [
    {
      zone: "head",
      center: target.position.clone().add(new THREE.Vector3(0.06 * bodyScale, 2.88 * bodyScale + crouchOffset, -0.02)),
      radius: 0.42 * bodyScale
    },
    {
      zone: "body",
      center: target.position.clone().add(new THREE.Vector3(0, 1.58 * bodyScale + crouchOffset, 0)),
      radius: 0.72 * bodyScale
    },
    {
      zone: "legs",
      center: target.position.clone().add(new THREE.Vector3(0, 0.62 * bodyScale, 0)),
      radius: 0.44 * bodyScale
    }
  ];
}

function meleeArcRadians(weaponId: WeaponId): number {
  return weaponId === "machete" ? 0.72 : 0.42;
}
