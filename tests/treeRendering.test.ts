import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createLevelData } from "../src/game/levelData";
import { SeededRandom } from "../src/game/random";
import {
  WorldBuilder,
  resolveTreeTrunkHeight,
  treeVisualMassing,
  type GameMaterials
} from "../src/game/rendering/WorldBuilder";
import type { MappedTree } from "../src/game/types";

describe("tree rendering batches", () => {
  const tree = (overrides: Partial<MappedTree> = {}): MappedTree => ({
    id: "tree",
    label: "Tree",
    position: { x: 0, z: 0 },
    profile: "elm",
    canopyRadius: 5,
    canopyDensity: 0.7,
    canopyGroup: "mapped",
    ...overrides
  });

  it("enlarges specimens and avenues without scaling mapped or replacement trees", () => {
    expect(treeVisualMassing(tree({ canopyGroup: "specimen" }))).toEqual({ height: 1.24, canopyWidth: 1.12, canopyHeight: 1.06 });
    expect(treeVisualMassing(tree({ canopyGroup: "avenue" }))).toEqual({ height: 1.1, canopyWidth: 1.1, canopyHeight: 1.04 });
    expect(treeVisualMassing(tree())).toEqual({ height: 1, canopyWidth: 1, canopyHeight: 1 });
    expect(treeVisualMassing(tree({ id: "yarra-replacement-tree-1", canopyGroup: "specimen" }))).toEqual({
      height: 1,
      canopyWidth: 1,
      canopyHeight: 1
    });
  });

  it("moves measured specimen crown bases toward recorded height without shrinking or exceeding the sightline cap", () => {
    expect(resolveTreeTrunkHeight(tree({ canopyGroup: "specimen", height: 30 }), 10)).toBeCloseTo(12.4);
    expect(resolveTreeTrunkHeight(tree({ canopyGroup: "specimen", height: 12 }), 10)).toBeCloseTo(10);
    expect(resolveTreeTrunkHeight(tree({ canopyGroup: "avenue", height: 18 }), 10)).toBeCloseTo(11);
    expect(resolveTreeTrunkHeight(tree({ height: 30 }), 10)).toBeCloseTo(10);
    expect(resolveTreeTrunkHeight(tree({ id: "yarra-replacement-tree-1", canopyGroup: "avenue", height: 30 }), 10)).toBeCloseTo(10);
  });

  it("uses spatial full-detail chunks, instance colors, and two-mesh far LOD chunks", () => {
    const level = createLevelData();
    const scene = new THREE.Scene();
    const builder = new WorldBuilder(
      scene,
      level,
      new SeededRandom(0x71ee),
      {} as GameMaterials,
      () => 0,
      () => 0
    );
    (builder as unknown as { addTrees(): void }).addTrees();

    const meshes = scene.children.filter(
      (object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh && typeof object.userData.treeChunk === "string"
    );
    const chunkKeys = new Set(meshes.map((mesh) => mesh.userData.treeChunk as string));
    const fullMeshes = meshes.filter((mesh) => mesh.userData.treeLod === "full");
    const farMeshes = meshes.filter((mesh) => mesh.userData.treeLod === "far");

    expect(chunkKeys.size).toBeGreaterThan(8);
    expect(fullMeshes.every((mesh) => mesh.instanceColor !== null)).toBe(true);
    expect(new Set(fullMeshes.map((mesh) => mesh.material)).size).toBeLessThanOrEqual(5);
    expect(farMeshes).toHaveLength(chunkKeys.size * 2);
    expect(farMeshes.every((mesh) => mesh.visible === false && mesh.castShadow === false)).toBe(true);

    builder.updateTreeLod({ x: 10_000, z: 10_000 });
    expect(meshes.every((mesh) => mesh.visible === false)).toBe(true);

    builder.updateTreeLod(level.trees[0].position);
    expect(fullMeshes.some((mesh) => mesh.visible)).toBe(true);
    expect(farMeshes.some((mesh) => mesh.visible)).toBe(true);
  });
});
