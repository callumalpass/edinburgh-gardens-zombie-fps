import { describe, expect, it } from "vitest";
import { separateCircularAgents, type CircularAgent } from "../src/game/spatial/AgentSeparation";

describe("agent separation", () => {
  it("pushes overlapping circular agents apart", () => {
    const agents: CircularAgent[] = [
      { id: 1, position: { x: 0, z: 0 }, radius: 1 },
      { id: 2, position: { x: 1, z: 0 }, radius: 1 }
    ];

    const overlap = separateCircularAgents(agents, { gap: 0, iterations: 1 });

    expect(overlap).toBeCloseTo(1);
    expect(distance(agents[0], agents[1])).toBeGreaterThanOrEqual(2 - 0.001);
  });

  it("uses deterministic pressure when agents share the same centre", () => {
    const agents: CircularAgent[] = [
      { id: "a", position: { x: 4, z: -2 }, radius: 1.2 },
      { id: "b", position: { x: 4, z: -2 }, radius: 1.2 }
    ];

    separateCircularAgents(agents, { gap: 0.2, iterations: 1 });

    expect(Number.isFinite(agents[0].position.x)).toBe(true);
    expect(Number.isFinite(agents[0].position.z)).toBe(true);
    expect(distance(agents[0], agents[1])).toBeGreaterThanOrEqual(2.6 - 0.001);
  });

  it("leaves distant agents unchanged", () => {
    const agents: CircularAgent[] = [
      { id: 1, position: { x: 0, z: 0 }, radius: 1 },
      { id: 2, position: { x: 18, z: -7 }, radius: 1 }
    ];

    const overlap = separateCircularAgents(agents, { gap: 0.2, iterations: 2 });

    expect(overlap).toBe(0);
    expect(agents).toEqual([
      { id: 1, position: { x: 0, z: 0 }, radius: 1 },
      { id: 2, position: { x: 18, z: -7 }, radius: 1 }
    ]);
  });

  it("settles agents after each pressure pass when a callback is provided", () => {
    const agents: CircularAgent[] = [
      { id: 1, position: { x: -0.2, z: 0 }, radius: 1 },
      { id: 2, position: { x: 0.2, z: 0 }, radius: 1 }
    ];
    let callbackCount = 0;

    separateCircularAgents(agents, {
      gap: 0,
      iterations: 2,
      afterIteration: (settledAgents) => {
        callbackCount += 1;
        for (const agent of settledAgents) {
          agent.position.z = Math.max(agent.position.z, -10);
        }
      }
    });

    expect(callbackCount).toBeGreaterThan(0);
  });
});

function distance(a: CircularAgent, b: CircularAgent): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}
