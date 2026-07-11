import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { boundingRadius, distance, polygonCentroid } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";
import { SeededRandom } from "../src/game/random";
import type { GameMaterials } from "../src/game/rendering/WorldBuilder";
import { WorldBuilder } from "../src/game/rendering/WorldBuilder";
import { createObjectPreviewTargets } from "../src/game/rendering/objectPreview";

const level = createLevelData();
const previewTargets = createObjectPreviewTargets(level);
const buildingTargets = previewTargets.filter((target) => target.kind === "mapped-building");

describe("mapped-building render geometry", () => {
  it("builds every surveyed footprint into finite, elevated preview geometry", () => {
    expect(buildingTargets).toHaveLength(level.mappedBuildings.length);

    for (const target of buildingTargets) {
      const building = level.mappedBuildings.find((candidate) => candidate.id === target.sourceId);
      if (!building) throw new Error(`Missing building ${target.sourceId}`);

      const scene = buildPreview(target.id);
      const meshes = scene.children.flatMap(flattenMeshes);
      const structureMeshes = meshes.filter((mesh) => meshBounds(mesh).max.y > 0.24);
      expect(structureMeshes.length, `${building.id} emitted no elevated structure meshes`).toBeGreaterThan(0);

      const bounds = aggregateBounds(structureMeshes);
      expectFiniteBox(bounds, building.id);

      const renderedCenter = { x: bounds.getCenter(new THREE.Vector3()).x, z: bounds.getCenter(new THREE.Vector3()).z };
      const footprintCenter = polygonCentroid(building.polygon);
      const footprintRadius = boundingRadius(building.polygon, footprintCenter);
      expect(distance(renderedCenter, footprintCenter), `${building.id} render drifted away from its footprint`).toBeLessThan(
        Math.max(2.8, footprintRadius * 0.72)
      );

      const renderedRadius = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.5;
      expect(renderedRadius, `${building.id} render envelope exploded`).toBeLessThan(target.radius * 2.15);
      expect(bounds.max.y, `${building.id} render is implausibly short`).toBeGreaterThan(building.height * 0.72);
      const maximumPlausibleHeight = building.detailProfile === "rotunda-pavilion" ? 10.5 : Math.max(7.8, building.height * 2.25);
      expect(bounds.max.y, `${building.id} render is implausibly tall`).toBeLessThan(maximumPlausibleHeight);
    }
  });

  it("retains the documented architectural detail density of major structures", () => {
    const minimumElevatedMeshCounts: Record<string, number> = {
      "osm-building-242003562": 2,
      "osm-building-403753784": 18,
      "osm-building-543505638": 18,
      "osm-building-543505639": 38,
      "osm-building-543505640": 18,
      "osm-building-543505702": 18
    };

    for (const [buildingId, minimumCount] of Object.entries(minimumElevatedMeshCounts)) {
      const scene = buildPreview(`mapped-building:${buildingId}`);
      const elevatedCount = scene.children.flatMap(flattenMeshes).filter((mesh) => meshBounds(mesh).max.y > 0.24).length;
      expect(elevatedCount, `${buildingId} lost documented facade/roof structure`).toBeGreaterThanOrEqual(minimumCount);
    }
  });

  it("places directional facade details on the researched frontage side", () => {
    const frontageDetails: Record<string, string> = {
      "osm-building-403753784": "tennis-pavilion-ochre-weatherboards",
      "osm-building-543505639": "bowls-solar-panel",
      "osm-building-543505702": "emely-baker-tan-brick"
    };

    for (const [buildingId, materialName] of Object.entries(frontageDetails)) {
      const building = level.mappedBuildings.find((candidate) => candidate.id === buildingId);
      if (!building?.facade?.frontagePoint) throw new Error(`${buildingId} is missing its documented frontage`);
      const scene = buildPreview(`mapped-building:${buildingId}`);
      const detailMeshes = scene.children.flatMap(flattenMeshes).filter((mesh) => meshMaterialNames(mesh).includes(materialName));
      expect(detailMeshes.length, `${buildingId} is missing ${materialName}`).toBeGreaterThan(0);

      const footprintCenter = polygonCentroid(building.polygon);
      const frontageVector = {
        x: building.facade.frontagePoint.x - footprintCenter.x,
        z: building.facade.frontagePoint.z - footprintCenter.z
      };
      const frontageLength = Math.hypot(frontageVector.x, frontageVector.z);
      const detailCenter = aggregateBounds(detailMeshes).getCenter(new THREE.Vector3());
      const frontageProjection =
        ((detailCenter.x - footprintCenter.x) * frontageVector.x + (detailCenter.z - footprintCenter.z) * frontageVector.z) / frontageLength;
      expect(frontageProjection, `${buildingId} ${materialName} was mirrored behind the building`).toBeGreaterThan(0.2);
    }
  });

  it("does not invent unresolved facade details on the south amenities envelope", () => {
    const scene = buildPreview("mapped-building:osm-building-242003562");
    const materialNames = scene.children.flatMap(flattenMeshes).flatMap(meshMaterialNames);
    expect(materialNames).not.toContain("amenities-painted-door");
    expect(materialNames.some((name) => name.includes("building-text-TOILETS"))).toBe(false);
  });

  it("keeps Emely Baker tan-brick with an exact-footprint skillion roof and tiled yard coping", () => {
    const scene = buildPreview("mapped-building:osm-building-543505702");
    const meshes = scene.children.flatMap(flattenMeshes);
    const roof = meshes.find((mesh) => meshMaterialNames(mesh).includes("emely-baker-metal-tray-deck"));
    expect(roof).toBeTruthy();
    expect(meshBounds(roof!).max.y - meshBounds(roof!).min.y).toBeGreaterThan(0.35);
    expect(meshes.filter((mesh) => meshMaterialNames(mesh).includes("emely-baker-tile-coping")).length).toBeGreaterThanOrEqual(4);
    expect(meshes.filter((mesh) => meshMaterialNames(mesh).includes("emely-baker-tan-brick")).length).toBeGreaterThanOrEqual(5);
  });

  it("keeps the bowling club's cream lower wing, green curtain-wall framing and zincalume roof", () => {
    const scene = buildPreview("mapped-building:osm-building-543505639");
    const meshes = scene.children.flatMap(flattenMeshes);
    expect(meshes.filter((mesh) => meshMaterialNames(mesh).includes("bowls-lower-storey-cream"))).toHaveLength(1);
    expect(meshes.filter((mesh) => meshMaterialNames(mesh).includes("bowls-green-glazing-frame")).length).toBeGreaterThanOrEqual(10);
    expect(meshes.filter((mesh) => meshMaterialNames(mesh).includes("bowls-zincalume-roof-sheets")).length).toBeGreaterThanOrEqual(2);
  });

  it("renders the other major architectural landmarks as substantial scene geometry", () => {
    const landmarkExpectations: Record<string, { minimumElevatedMeshes: number; maximumHeight: number }> = {
      grandstand: { minimumElevatedMeshes: 30, maximumHeight: 12 },
      rotunda: { minimumElevatedMeshes: 18, maximumHeight: 10.5 },
      "north-toilets": { minimumElevatedMeshes: 10, maximumHeight: 7 },
      "sportsmans-war-memorial": { minimumElevatedMeshes: 5, maximumHeight: 8 },
      "cook-memorial-site": { minimumElevatedMeshes: 4, maximumHeight: 8 },
      "queen-victoria-plinth": { minimumElevatedMeshes: 4, maximumHeight: 8 }
    };

    for (const [landmarkId, expectation] of Object.entries(landmarkExpectations)) {
      const landmark = level.landmarks.find((candidate) => candidate.id === landmarkId);
      expect(landmark?.source, `${landmarkId} has no research source`).toBeTruthy();
      const scene = buildPreview(`landmark:${landmarkId}`);
      const elevatedMeshes = scene.children.flatMap(flattenMeshes).filter((mesh) => meshBounds(mesh).max.y > 0.24);
      expect(elevatedMeshes.length, `${landmarkId} lost architectural geometry`).toBeGreaterThanOrEqual(expectation.minimumElevatedMeshes);
      const bounds = aggregateBounds(elevatedMeshes);
      expectFiniteBox(bounds, landmarkId);
      expect(bounds.max.y, `${landmarkId} render is implausibly tall`).toBeLessThan(expectation.maximumHeight);
    }
  });

  it("aligns the grandstand climb interaction with a photographed external stair flight", () => {
    const fixture = level.interactables.find((candidate) => candidate.id === "grandstand-seats");
    if (!fixture?.accessPosition) throw new Error("Missing grandstand stair interaction");
    const scene = buildPreview("landmark:grandstand");
    const stairMeshes = scene.children.flatMap(flattenMeshes).filter((mesh) => mesh.userData.kind === "grandstand-external-stair");
    expect(stairMeshes).toHaveLength(20);
    const rightFlight = stairMeshes.filter((mesh) => mesh.userData.side === 1);
    expect(rightFlight).toHaveLength(10);
    const closestStepDistance = Math.min(
      ...rightFlight.map((mesh) => {
        const center = meshBounds(mesh).getCenter(new THREE.Vector3());
        return distance(center, fixture.accessPosition!);
      })
    );
    expect(closestStepDistance).toBeLessThan(1.5);
  });

  it("keeps the north toilet roof split, translucent and visibly skillion-sloped", () => {
    const scene = buildPreview("landmark:north-toilets");
    const meshes = scene.children.flatMap(flattenMeshes);
    const metalRoof = meshes.find((mesh) => meshMaterialNames(mesh).includes("north-toilet-sheet-metal-roof"));
    const clearRoof = meshes.find((mesh) => meshMaterialNames(mesh).includes("north-toilet-clear-roof-sheet"));
    expect(metalRoof).toBeTruthy();
    expect(clearRoof).toBeTruthy();
    expect(meshBounds(metalRoof!).max.y - meshBounds(metalRoof!).min.y).toBeGreaterThan(0.3);
    expect(meshBounds(clearRoof!).max.y - meshBounds(clearRoof!).min.y).toBeGreaterThan(0.15);
    expect((clearRoof!.material as THREE.Material).transparent).toBe(true);
    expect(meshes.flatMap(meshMaterialNames)).not.toContain("toilet-accessible-sign");
    expect(meshes.flatMap(meshMaterialNames)).not.toContain("north-toilet-mural-yellow");
    expect(meshes.flatMap(meshMaterialNames)).toContain("north-toilet-current-grey-doors");
    expect(meshes.flatMap(meshMaterialNames)).toContain("north-toilet-stainless-hand-basin");
  });

  it("aligns the Rotunda climb interaction with its visible stair and retained steel gate", () => {
    const fixture = level.interactables.find((candidate) => candidate.id === "rotunda-deck");
    if (!fixture?.accessPosition) throw new Error("Missing Rotunda stair interaction");
    const scene = buildPreview("landmark:rotunda");
    const meshes = scene.children.flatMap(flattenMeshes);
    const stairs = meshes.filter((mesh) => mesh.userData.kind === "rotunda-stair");
    const gateBars = meshes.filter((mesh) => mesh.userData.kind === "rotunda-stair-gate");
    expect(stairs).toHaveLength(5);
    expect(gateBars).toHaveLength(5);
    const closestStairDistance = Math.min(
      ...stairs.map((mesh) => distance(meshBounds(mesh).getCenter(new THREE.Vector3()), fixture.accessPosition!))
    );
    expect(closestStairDistance).toBeLessThan(1.5);
  });

  it("matches playground blockers and raised floors to the rendered tower decks", () => {
    for (const [landmarkId, fixtureId, playgroundKey] of [
      ["north-playground", "north-playground-tower", "north-toddler-a"],
      ["south-playground", "south-playground-tower", "south-main"]
    ] as const) {
      const fixture = level.interactables.find((candidate) => candidate.id === fixtureId);
      const blocker = level.obstacles.find((candidate) => candidate.id === landmarkId);
      if (!fixture || fixture.raisedFootprint?.shape !== "box" || blocker?.shape !== "box") {
        throw new Error(`Missing aligned playground geometry for ${landmarkId}`);
      }
      const scene = buildPreview(`landmark:${landmarkId}`);
      const deck = scene.children
        .flatMap(flattenMeshes)
        .find((mesh) => mesh.userData.kind === "playground-tower-deck" && mesh.userData.playgroundKey === playgroundKey);
      expect(deck, `${landmarkId} has no tagged tower deck`).toBeTruthy();
      const bounds = meshBounds(deck!);
      const center = bounds.getCenter(new THREE.Vector3());

      expect(distance({ x: center.x, z: center.z }, fixture.position)).toBeLessThan(0.01);
      expect(bounds.max.y).toBeCloseTo(fixture.height, 2);
      expect(blocker.center).toEqual(fixture.raisedFootprint.center);
      expect(blocker.halfX).toBeCloseTo(fixture.raisedFootprint.halfX, 3);
      expect(blocker.halfZ).toBeCloseTo(fixture.raisedFootprint.halfZ, 3);
      expect(blocker.angle).toBeCloseTo(fixture.raisedFootprint.angle, 5);
    }
  });

  it("renders the Hannah memorial entrance as an open architectural gate, not an empty fence gap", () => {
    const fence = level.mappedFences.find((candidate) => candidate.id === "bowling-precinct-perimeter-fence");
    const gate = fence?.gates?.find((candidate) => candidate.id === "bowling-hannah-memorial-gate");
    expect(gate?.source).toContain("Figure 72");

    const scene = buildPreview("mapped-fence:bowling-precinct-perimeter-fence");
    const meshes = scene.children.flatMap(flattenMeshes);
    const brickPiers = meshes.filter((mesh) => meshMaterialNames(mesh).includes("hannah-memorial-gate-red-brick"));
    const gateLeaves = meshes.filter((mesh) => meshMaterialNames(mesh).includes("hannah-memorial-gate-green-metal"));
    expect(brickPiers).toHaveLength(2);
    expect(gateLeaves.length).toBeGreaterThanOrEqual(8);
    expect(distance(aggregateBounds(brickPiers).getCenter(new THREE.Vector3()), gate!.position)).toBeLessThan(0.3);
  });

  it("keeps the Sportsman's Memorial inscription, pediment and urns on its east end", () => {
    const scene = buildPreview("landmark:sportsmans-war-memorial");
    const meshes = scene.children.flatMap(flattenMeshes);
    expect(meshes.filter((mesh) => mesh.userData.kind === "sportsmans-east-inscription")).toHaveLength(1);
    expect(meshes.filter((mesh) => mesh.userData.kind === "sportsmans-east-pediment")).toHaveLength(1);
    expect(meshes.filter((mesh) => mesh.userData.kind === "sportsmans-east-urn-finial")).toHaveLength(2);
    const pediment = meshes.find((mesh) => mesh.userData.kind === "sportsmans-east-pediment");
    expect(pediment && meshBounds(pediment).max.y - meshBounds(pediment).min.y).toBeGreaterThan(0.6);
  });

  it("keeps the Cook Memorial's arched bronze portrait and pyramidal granite cap", () => {
    const scene = buildPreview("landmark:cook-memorial-site");
    const meshes = scene.children.flatMap(flattenMeshes);
    expect(meshes.filter((mesh) => mesh.userData.kind === "cook-memorial-portrait-panel")).toHaveLength(1);
    expect(meshes.filter((mesh) => mesh.userData.kind === "cook-memorial-portrait-arch")).toHaveLength(1);
    expect(meshes.filter((mesh) => mesh.userData.kind === "cook-memorial-relief")).toHaveLength(2);
    expect(meshes.filter((mesh) => mesh.userData.kind === "cook-memorial-pyramidal-cap")).toHaveLength(1);
  });
});

function buildPreview(targetId: string): THREE.Scene {
  const target = previewTargets.find((candidate) => candidate.id === targetId);
  if (!target) throw new Error(`Unknown preview target ${targetId}`);

  const scene = new THREE.Scene();
  const builder = new WorldBuilder(scene, level, new SeededRandom(seedFromString(targetId)), createHeadlessMaterials(), () => 0, () => 0);
  builder.createObjectPreview(target);
  scene.updateMatrixWorld(true);
  return scene;
}

function flattenMeshes(object: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  object.traverse((candidate) => {
    if (candidate instanceof THREE.Mesh) meshes.push(candidate);
  });
  return meshes;
}

function meshBounds(mesh: THREE.Mesh): THREE.Box3 {
  mesh.geometry.computeBoundingBox();
  if (!mesh.geometry.boundingBox) throw new Error(`Mesh ${mesh.uuid} has no bounding box`);
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}

function meshMaterialNames(mesh: THREE.Mesh): string[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.map((material) => material.name).filter(Boolean);
}

function aggregateBounds(meshes: THREE.Mesh[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const mesh of meshes) bounds.union(meshBounds(mesh));
  return bounds;
}

function expectFiniteBox(bounds: THREE.Box3, id: string): void {
  for (const value of [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z]) {
    expect(Number.isFinite(value), `${id} has non-finite render bounds`).toBe(true);
  }
  expect(bounds.isEmpty(), `${id} has empty render bounds`).toBe(false);
}

function createHeadlessMaterials(): GameMaterials {
  const toon = (color: number) => new THREE.MeshToonMaterial({ color });
  return {
    grass: toon(0x829a70),
    grassBlade: toon(0x78966a),
    path: toon(0xc4ad76),
    gravel: toon(0xa99f89),
    asphalt: toon(0x2a4650),
    concrete: toon(0xb4b19e),
    court: toon(0x3d876e),
    rubber: toon(0xae634e),
    mulch: toon(0x785636),
    dirt: toon(0x6c5a43),
    leafLitter: toon(0x9f9463),
    wornGrass: toon(0xa69b70),
    puddle: new THREE.MeshStandardMaterial({ color: 0x1d5360 }),
    hedge: toon(0x517a50),
    line: new THREE.MeshBasicMaterial({ color: 0xe0b14e }),
    timber: toon(0x986a43),
    metal: new THREE.MeshStandardMaterial({ color: 0x9dad9f }),
    brick: toon(0xb5634a),
    basalt: toon(0x5d747b),
    darkOpening: new THREE.MeshBasicMaterial({ color: 0x071217 }),
    zombie: toon(0x8b9a68),
    zombieDark: toon(0x3e4d39)
  };
}

function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
