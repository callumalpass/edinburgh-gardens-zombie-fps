import type { Vec2 } from "../types";
import { gridCellKey, type GridCellKey } from "./gridKey";

export interface CircularAgent {
  id: number | string;
  position: Vec2;
  radius: number;
}

export interface AgentSeparationOptions<T extends CircularAgent> {
  gap?: number;
  gridSize?: number;
  iterations?: number;
  strength?: number;
  afterIteration?: (agents: readonly T[]) => void;
}

const DEFAULT_GAP = 0.12;
const DEFAULT_GRID_SIZE = 8;
const DEFAULT_ITERATIONS = 2;
const DEFAULT_STRENGTH = 1;

export function separateCircularAgents<T extends CircularAgent>(agents: readonly T[], options: AgentSeparationOptions<T> = {}): number {
  if (agents.length < 2) {
    return 0;
  }

  const gap = options.gap ?? DEFAULT_GAP;
  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;
  const iterations = Math.max(1, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
  const strength = options.strength ?? DEFAULT_STRENGTH;
  let maxRadius = 0;
  for (const agent of agents) {
    if (agent.radius > maxRadius) {
      maxRadius = agent.radius;
    }
  }
  let largestOverlap = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const index = new CircularAgentIndex(agents, gridSize);
    let moved = false;
    let iterationLargestOverlap = 0;

    for (let agentIndex = 0; agentIndex < agents.length; agentIndex += 1) {
      const agent = agents[agentIndex];
      const queryRadius = agent.radius + maxRadius + gap;
      index.forNearby(agent, queryRadius, (other, otherIndex) => {
        if (otherIndex <= agentIndex) {
          return;
        }

        const minDistance = agent.radius + other.radius + gap;
        const dx = agent.position.x - other.position.x;
        const dz = agent.position.z - other.position.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= minDistance * minDistance) {
          return;
        }

        const dist = Math.sqrt(distanceSq);
        const overlap = minDistance - dist;
        iterationLargestOverlap = Math.max(iterationLargestOverlap, overlap);
        largestOverlap = Math.max(largestOverlap, overlap);
        let normalX: number;
        let normalZ: number;
        if (dist > 0.0001) {
          const invDistance = 1 / dist;
          normalX = dx * invDistance;
          normalZ = dz * invDistance;
        } else {
          const angle = deterministicPairAngle(agent.id, other.id);
          normalX = Math.cos(angle);
          normalZ = Math.sin(angle);
        }
        const push = overlap * 0.5 * strength;

        agent.position.x += normalX * push;
        agent.position.z += normalZ * push;
        other.position.x -= normalX * push;
        other.position.z -= normalZ * push;
        moved = true;
      });
    }

    if (!moved) {
      break;
    }

    options.afterIteration?.(agents);

    if (iterationLargestOverlap < 0.001) {
      break;
    }
  }

  return largestOverlap;
}

class CircularAgentIndex<T extends CircularAgent> {
  private readonly grid = new Map<GridCellKey, number[]>();

  constructor(
    private readonly agents: readonly T[],
    private readonly gridSize: number
  ) {
    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      const bucket = this.ensureBucket(this.cellIndex(agent.position.x), this.cellIndex(agent.position.z));
      bucket.push(index);
    }
  }

  private ensureBucket(x: number, z: number): number[] {
    const key = gridCellKey(x, z);
    const bucket = this.grid.get(key);
    if (bucket) {
      return bucket;
    }

    const nextBucket: number[] = [];
    this.grid.set(key, nextBucket);
    return nextBucket;
  }

  private bucketAt(x: number, z: number): number[] | undefined {
    return this.grid.get(gridCellKey(x, z));
  }

  forNearby(agent: T, radius: number, visit: (other: T, otherIndex: number) => void): void {
    const minX = this.cellIndex(agent.position.x - radius);
    const maxX = this.cellIndex(agent.position.x + radius);
    const minZ = this.cellIndex(agent.position.z - radius);
    const maxZ = this.cellIndex(agent.position.z + radius);

    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const bucket = this.bucketAt(x, z);
        if (bucket) {
          for (let index = 0; index < bucket.length; index += 1) {
            const otherIndex = bucket[index];
            visit(this.agents[otherIndex], otherIndex);
          }
        }
      }
    }
  }

  private cellIndex(value: number): number {
    return Math.floor(value / this.gridSize);
  }
}

function deterministicPairAngle(a: CircularAgent["id"], b: CircularAgent["id"]): number {
  const key = `${a}:${b}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}
