import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface AssetManifest {
  assetId: string;
  blenderVersion: string;
  sourceFiles: { blend: string; glb: string; generator: string };
  primaryEvidence: string[];
  statistics: { objectCount: number; meshObjectCount: number; materialCount: number; triangleCount: number };
  navigationContract: Record<string, unknown>;
  uncertainty: string[];
}

const assets = [
  "assets/blender/rotunda/edinburgh-gardens-rotunda.asset.json",
  "assets/blender/entrance-pavilion/edinburgh-gardens-entrance-pavilion.asset.json",
  "assets/blender/bowling-club/edinburgh-gardens-bowling-club.asset.json",
  "assets/blender/kevin-murray-stand/edinburgh-gardens-kevin-murray-stand.asset.json",
  "assets/blender/emely-baker-centre/edinburgh-gardens-emely-baker-centre.asset.json",
  "assets/blender/alfred-crescent-pavilion/edinburgh-gardens-alfred-crescent-pavilion.asset.json",
  "assets/blender/north-toilets/edinburgh-gardens-north-toilets.asset.json",
  "assets/blender/sportsmans-war-memorial/edinburgh-gardens-sportsmans-war-memorial.asset.json"
];

describe("Blender building assets", () => {
  for (const manifestPath of assets) {
    it(`keeps ${manifestPath} editable, source-linked and runtime-loadable`, async () => {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as AssetManifest;
      const blend = await readFile(path.resolve(manifest.sourceFiles.blend));
      const glb = await readFile(path.resolve(manifest.sourceFiles.glb));
      const generator = await readFile(path.resolve(manifest.sourceFiles.generator), "utf8");

      expect(manifest.blenderVersion).toContain("4.5.10");
      expect(manifest.primaryEvidence.length).toBeGreaterThanOrEqual(2);
      expect(manifest.uncertainty.length).toBeGreaterThanOrEqual(3);
      expect(Object.keys(manifest.navigationContract).length).toBeGreaterThanOrEqual(3);
      expect(manifest.statistics.objectCount).toBeGreaterThan(100);
      expect(manifest.statistics.meshObjectCount).toBeGreaterThan(100);
      expect(manifest.statistics.materialCount).toBeGreaterThanOrEqual(8);
      expect(manifest.statistics.triangleCount).toBeGreaterThan(5_000);
      expect(manifest.statistics.triangleCount).toBeLessThan(25_000);
      expect(blend.byteLength).toBeGreaterThan(100_000);
      expect(glb.byteLength).toBeGreaterThan(50_000);
      expect(glb.byteLength).toBeLessThan(2_000_000);
      expect(glb.toString("ascii", 0, 4)).toBe("glTF");
      expect(glb.readUInt32LE(4)).toBe(2);
      expect(glb.readUInt32LE(8)).toBe(glb.byteLength);
      expect(generator).toContain(manifest.assetId);
    });
  }
});
