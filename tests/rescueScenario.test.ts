import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { START_POSITION } from "../src/game/gameConfig";
import { distance, pointInPolygon } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";
import {
  createInitialRescueScenarioState,
  createRescueScenarioLayout,
  rescueScenarioObjective
} from "../src/game/rescueScenario";

describe("wave-three rescue scenario", () => {
  it("uses the existing north toilets and disperses all scenario equipment away from spawn", () => {
    const level = createLevelData();
    const layout = createRescueScenarioLayout(level);

    expect(layout.gates).toHaveLength(3);
    expect(layout.gates.filter((gate) => gate.unlockItem === "bolt-cutters")).toHaveLength(2);
    expect(layout.gates.find((gate) => gate.objectiveGate)?.unlockItem).toBe("caretaker-key");
    expect(layout.barricades).toHaveLength(3);

    const northToilets = level.landmarks.find((landmark) => landmark.id === "north-toilets");
    const stallBank = level.amenities.find((amenity) => amenity.id === "north-toilets-south-west-stall-bank");
    const dogGate = layout.gates.find((gate) => gate.objectiveGate);
    expect(northToilets?.polygon).toBeTruthy();
    expect(stallBank).toBeTruthy();
    expect(dogGate?.label).toMatch(/north-toilets stall/i);
    expect(pointInPolygon(layout.dogPosition, northToilets!.polygon!)).toBe(true);
    expect(distance(dogGate!.position, stallBank!.position)).toBeLessThan(1.8);

    const hannahGate = level.mappedFences
      .find((fence) => fence.id === "bowling-precinct-perimeter-fence")
      ?.gates?.find((gate) => gate.id === "bowling-hannah-memorial-gate");
    const sportsmansMemorial = level.landmarks.find((landmark) => landmark.id === "sportsmans-war-memorial");
    const coveredGateway = level.mappedBuildings.find((building) => building.id === "osm-building-1475006769");
    const shortcutGates = layout.gates.filter((gate) => gate.unlockItem === "bolt-cutters");
    expect(hannahGate).toBeTruthy();
    expect(sportsmansMemorial?.position).toBeTruthy();
    expect(coveredGateway).toBeTruthy();
    expect(shortcutGates.every((gate) => distance(gate.position, hannahGate!.position) > 4)).toBe(true);
    expect(shortcutGates.every((gate) => distance(gate.position, sportsmansMemorial!.position!) > 4)).toBe(true);
    expect(shortcutGates.every((gate) => !pointInPolygon(gate.position, coveredGateway!.polygon))).toBe(true);

    for (const [label, point] of [
      ["dog", layout.dogPosition],
      ["caretaker", layout.caretakerSpawnPosition],
      ["cart", layout.cartPosition],
      ["battery", layout.batteryPosition],
      ["wheel", layout.wheelPosition],
      ...layout.gates.map((gate) => [gate.id, gate.position] as const),
      ...layout.barricades.map((barricade) => [barricade.id, barricade.position] as const)
    ] as const) {
      expect(pointInPolygon(point, level.boundary), `${label} outside park boundary`).toBe(true);
      expect(distance(point, START_POSITION), `${label} too close to the spawn zone`).toBeGreaterThan(170);
    }

    const routeAnchors = [
      layout.dogPosition,
      layout.caretakerSpawnPosition,
      layout.cartPosition,
      layout.batteryPosition,
      layout.wheelPosition
    ];
    for (let first = 0; first < routeAnchors.length; first += 1) {
      for (let second = first + 1; second < routeAnchors.length; second += 1) {
        expect(distance(routeAnchors[first], routeAnchors[second]), `route anchors ${first}/${second} clustered`).toBeGreaterThan(65);
      }
    }
  });

  it("keeps objective copy specific and progressive", () => {
    const state = createInitialRescueScenarioState();
    expect(rescueScenarioObjective(state)).toBeNull();
    state.phase = "find-caretaker";
    expect(rescueScenarioObjective(state)).toMatch(/infected caretaker/i);
    state.phase = "unlock-dog";
    expect(rescueScenarioObjective(state)).toMatch(/north-toilets stall.*rescue Miso/i);
    state.phase = "find-cart-parts";
    expect(rescueScenarioObjective(state)).toMatch(/battery.*wheel/i);
    state.phase = "complete";
    expect(rescueScenarioObjective(state)).toMatch(/cart running/i);
  });

  it("ships editable Blender sources and compact runtime GLBs for all three authored designs", () => {
    const manifestPath = "assets/blender/rescue-scenario/edinburgh-gardens-rescue-scenario.asset.json";
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      blenderVersion: string;
      blend: string;
      designBasis: string;
      runtimeContract: { caretakerClips: string[]; dogClips: string[]; cartStateTags: string[] };
      assets: Array<{ id: string; glb: string; triangleCount: number; armatureCount: number }>;
    };
    expect(manifest.blenderVersion).toMatch(/^4\.5\./);
    expect(manifest.designBasis).toMatch(/original/i);
    expect(manifest.assets.map((asset) => asset.id)).toEqual(["caretaker", "dog", "cart"]);
    expect(manifest.runtimeContract.caretakerClips).toContain("Chase");
    expect(manifest.runtimeContract.dogClips).toEqual(["Idle", "Walk", "Sit"]);
    expect(manifest.runtimeContract.cartStateTags).toEqual(["damaged", "repaired"]);
    expect(existsSync(manifest.blend)).toBe(true);
    expect(statSync(manifest.blend).size).toBeGreaterThan(100_000);
    for (const asset of manifest.assets) {
      expect(existsSync(asset.glb)).toBe(true);
      expect(statSync(asset.glb).size).toBeGreaterThan(20_000);
      expect(statSync(asset.glb).size).toBeLessThan(1_000_000);
      expect(asset.triangleCount).toBeGreaterThan(500);
      expect(asset.triangleCount).toBeLessThan(20_000);
      expect(asset.armatureCount).toBe(asset.id === "cart" ? 0 : 1);
    }
  });
});
