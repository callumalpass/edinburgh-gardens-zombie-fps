import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLevelData } from "../src/game/levelData";
import { createObjectPreviewTargets } from "../src/game/rendering/objectPreview";

type PhysicalLedger = {
  summary: { physicalObjectCount: number };
  physicalObjects: Array<{ id: string; category: string }>;
};

const level = createLevelData();
const targets = createObjectPreviewTargets(level);
const ledger = JSON.parse(
  readFileSync(new URL("../docs/research/edinburgh-gardens-2026-object-audit-ledger.json", import.meta.url), "utf8")
) as PhysicalLedger;

describe("physical-object visual-audit coverage", () => {
  it("maps every 2026 physical ledger object to exactly one runtime preview", () => {
    expect(ledger.physicalObjects).toHaveLength(ledger.summary.physicalObjectCount);
    expect(ledger.summary.physicalObjectCount).toBe(581);

    const targetCounts = new Map<string, number>();
    for (const target of targets) {
      targetCounts.set(target.sourceId, (targetCounts.get(target.sourceId) ?? 0) + 1);
    }

    for (const object of ledger.physicalObjects) {
      expect(targetCounts.get(object.id), `${object.category}:${object.id} does not have exactly one preview`).toBe(1);
    }
  });

  it("keeps every preview camera envelope finite and positive", () => {
    for (const target of targets) {
      expect(Number.isFinite(target.position.x), `${target.id} has a non-finite x position`).toBe(true);
      expect(Number.isFinite(target.position.z), `${target.id} has a non-finite z position`).toBe(true);
      expect(Number.isFinite(target.radius), `${target.id} has a non-finite radius`).toBe(true);
      expect(Number.isFinite(target.height), `${target.id} has a non-finite height`).toBe(true);
      expect(target.radius, `${target.id} has a non-positive radius`).toBeGreaterThan(0);
      expect(target.height, `${target.id} has a non-positive height`).toBeGreaterThan(0);
    }
  });

  it("allows two-angle inspection without cropping the renderer's variable tree envelope", () => {
    const treeTargets = targets.filter((target) => target.kind === "tree");
    expect(treeTargets).toHaveLength(level.trees.length);

    for (const target of treeTargets) {
      const tree = level.trees[target.sourceIndex!];
      const minimumHeight = tree.height ? Math.max(15.5, tree.height * 1.65) : Math.max(22, tree.canopyRadius * 2.8);
      expect(target.height, `${tree.id} lost its audited crown/trunk framing margin`).toBeGreaterThanOrEqual(minimumHeight);
      expect(target.radius, `${tree.id} lost its audited canopy framing margin`).toBeGreaterThanOrEqual(
        Math.max(3.6, tree.canopyRadius * 1.55)
      );
    }
  });
});
