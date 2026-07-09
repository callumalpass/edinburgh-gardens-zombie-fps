import { writeFile } from "node:fs/promises";
import { createServer } from "vite";

const OUTPUT_PATH = "docs/research/edinburgh-gardens-2026-object-audit-ledger.json";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const [{ createLevelData }, geo] = await Promise.all([
    server.ssrLoadModule("/src/game/levelData.ts"),
    server.ssrLoadModule("/src/game/geo.ts")
  ]);
  const level = createLevelData();
  const physicalCollections = [
    ["path", level.paths],
    ["landmark", level.landmarks],
    ["tree", level.trees],
    ["building", level.mappedBuildings],
    ["structure-shelter", level.structureShelters],
    ["fence", level.mappedFences],
    ["hardscape", level.hardscapeLines],
    ["ground-surface", level.groundSurfacePolygons],
    ["street-edge", level.streetEdges],
    ["sports-fixture", level.sportsFixtures],
    ["skate-bowl", level.skateBowls],
    ["amenity", level.amenities],
    ["park-detail", level.parkLifeDetails]
  ];
  const gameplayCollections = [
    ["upgrade-station", level.upgradeStations],
    ["weapon-spawn", level.weaponSpawns],
    ["item-spawn", level.itemSpawns],
    ["rideable-bike", level.rideableBikes],
    ["interaction-zone", level.interactables]
  ];
  const renderTreatmentCollections = [
    ["path-surface-treatment", level.pathSurfacePatches]
  ];
  const physicalObjects = physicalCollections.flatMap(([category, objects]) =>
    objects.map((object, index) => ledgerEntry(category, object, index, geo))
  );
  const gameplayObjects = gameplayCollections.flatMap(([category, objects]) =>
    objects.map((object, index) => ledgerEntry(category, object, index, geo, true))
  );
  const renderTreatmentObjects = renderTreatmentCollections.flatMap(([category, objects]) =>
    objects.map((object, index) => ledgerEntry(category, object, index, geo, false, true))
  );
  assertUniqueIds(physicalObjects, "physical");
  assertUniqueIds(gameplayObjects, "gameplay");
  assertUniqueIds(renderTreatmentObjects, "render treatment");

  const statusCounts = countBy(physicalObjects, (entry) => entry.auditStatus);
  const categoryCounts = countBy(physicalObjects, (entry) => entry.category);
  const unresolvedObjects = physicalObjects
    .filter((entry) => entry.auditStatus.startsWith("unresolved"))
    .map(({ id, category, auditStatus, uncertainty }) => ({ id, category, auditStatus, uncertainty }));
  const ledger = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    physicalBaseline: "2026-07-10",
    baselinePolicy: {
      layout: "Physical park condition and active works as documented for 10 July 2026.",
      intentionalAnachronism: "Only the game countdown/date clock displays 2030.",
      style: "Painterly/anime rendering is preserved; this ledger audits placement, identity and real-world design evidence.",
      evidenceRule: "Mapped does not mean survey-grade. Items without exact public point/geometry or facade evidence remain explicitly unresolved.",
      duplicates: "Trees are represented once in physicalObjects; significantTrees, treePoints and treeColliders are supporting views of that tree register and are counted below, not duplicated."
    },
    summary: {
      physicalObjectCount: physicalObjects.length,
      gameplayObjectCount: gameplayObjects.length,
      renderTreatmentCount: renderTreatmentObjects.length,
      categoryCounts,
      statusCounts,
      unresolvedObjectCount: unresolvedObjects.length,
      derivedRegisterCounts: {
        treePoints: level.treePoints.length,
        significantTrees: level.significantTrees.length,
        treeColliders: level.treeColliders.length,
        elevationSamples: level.elevationSamples.length,
        terrainModifiers: level.terrainModifiers.length,
        collisionObstacles: level.obstacles.length,
        spawnPoints: level.spawnPoints.length,
        pickupPoints: level.pickupPoints.length
      }
    },
    unresolvedObjects,
    physicalObjects,
    gameplayObjects,
    renderTreatmentObjects
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}: ${physicalObjects.length} physical objects, ${unresolvedObjects.length} unresolved, ${gameplayObjects.length} gameplay objects, ${renderTreatmentObjects.length} render treatments.`);
} finally {
  await server.close();
}

function ledgerEntry(category, object, index, geo, gameplay = false, renderTreatment = false) {
  const id = object.id ?? `${category}-${index + 1}`;
  const source = object.source ?? null;
  const evidence = classifyEvidence(id, category, source, gameplay, renderTreatment);
  return {
    id,
    category,
    label: object.label ?? id,
    kind: object.kind ?? object.profile ?? null,
    auditStatus: evidence.auditStatus,
    evidenceClass: evidence.evidenceClass,
    uncertainty: evidence.uncertainty,
    source,
    geometry: geometrySummary(object, geo),
    design: designSummary(object)
  };
}

function classifyEvidence(id, category, source, gameplay, renderTreatment) {
  if (renderTreatment) {
    return {
      auditStatus: "render-style-treatment",
      evidenceClass: "painterly-surface-treatment",
      uncertainty: "Non-object painterly surface variation; recorded for completeness but not asserted as surveyed park hardware or exact wear geometry."
    };
  }
  if (gameplay || /Gameplay|zombie|weapon|ammo|armory/i.test(source ?? "")) {
    return {
      auditStatus: "gameplay-fiction",
      evidenceClass: "gameplay",
      uncertainty: "Deliberate game object, not asserted as a fixed 2026 park asset."
    };
  }
  if (!source) {
    return {
      auditStatus: "unresolved-missing-source",
      evidenceClass: "none",
      uncertainty: "No per-object source is attached."
    };
  }
  if (/removed-tree-\d+-stump/.test(id)) {
    return {
      auditStatus: "corrected-2026",
      evidenceClass: "official-plan-georeferenced",
      uncertainty: "Plan-to-map calibration RMS is 0.766 game units (approximately 0.6 m); not a cadastral survey."
    };
  }
  if (/approximate|approximat|inferred|hand-placed|no public|unavailable|not public|context placement|translated/i.test(source)) {
    return {
      auditStatus: "unresolved-public-data-gap",
      evidenceClass: evidenceClass(source),
      uncertainty: uncertaintySentence(source)
    };
  }
  if (/Vicmap Vegetation Tree Urban/i.test(source)) {
    return {
      auditStatus: "evidence-linked-historical",
      evidenceClass: "vicmap-aerial-lidar",
      uncertainty: "Vicmap source dates are older than 2026; retained only where not contradicted by current removals or current mapped geometry."
    };
  }
  if (/OpenStreetMap|\bOSM\b/i.test(source)) {
    return {
      auditStatus: "evidence-linked",
      evidenceClass: "openstreetmap",
      uncertainty: "Current public mapping, but not survey-grade and potentially incomplete."
    };
  }
  if (/Yarra significant trees/i.test(source)) {
    return {
      auditStatus: "evidence-linked",
      evidenceClass: "official-council-dataset",
      uncertainty: "Council point record; current survival remains subject to the dated dataset snapshot."
    };
  }
  if (/Lovell Chen|CMP 2021|Conservation Management Plan/i.test(source)) {
    return {
      auditStatus: "evidence-linked",
      evidenceClass: "conservation-plan",
      uncertainty: "Design evidence is photographic/documentary rather than a 2026 measured building survey."
    };
  }
  return {
    auditStatus: category === "interactable" ? "unresolved-behaviour-overlay" : "evidence-linked-context",
    evidenceClass: evidenceClass(source),
    uncertainty: category === "interactable" ? "Interaction may imply visible access hardware that requires separate photographic verification." : "Source supports identity/context; exact survey precision is not asserted."
  };
}

function evidenceClass(source) {
  if (/Yarra|Council/i.test(source)) return "official-council-context";
  if (/OpenStreetMap|\bOSM\b/i.test(source)) return "openstreetmap";
  if (/Vicmap/i.test(source)) return "vicmap";
  if (/CMP|Lovell Chen|conservation/i.test(source)) return "conservation-plan";
  return "secondary-or-derived-context";
}

function uncertaintySentence(source) {
  const sentences = source.split(/(?<=[.;])\s+/);
  return sentences.find((sentence) => /approximate|inferred|hand-placed|no public|unavailable|not public|translated/i.test(sentence)) ?? "Exact public geometry or design evidence is unavailable."
}

function geometrySummary(object, geo) {
  const center = object.position ?? object.center ?? object.footprint?.center ?? object.raisedFootprint?.center ?? null;
  const polygon = object.polygon ?? (object.footprint?.shape === "polygon" ? object.footprint.polygon : null);
  const points = object.points ?? polygon ?? null;
  const derivedCenter = center ?? (points?.length ? average(points) : null);
  return {
    centerWorld: derivedCenter ? roundPoint(derivedCenter) : null,
    centerGeo: derivedCenter ? worldToGeo(derivedCenter, geo) : null,
    vertexCount: points?.length ?? 0,
    width: finiteOrNull(object.width),
    height: finiteOrNull(object.height),
    radius: finiteOrNull(object.radius ?? object.canopyRadius),
    angle: finiteOrNull(object.angle ?? object.footprint?.angle)
  };
}

function designSummary(object) {
  return {
    material: object.material ?? null,
    profile: object.detailProfile ?? object.profile ?? null,
    canopyGroup: object.canopyGroup ?? null,
    courtStatus: object.courtStatus ?? null,
    linkedStructureId: object.linkedStructureId ?? null
  };
}

function worldToGeo(point, geo) {
  const metresPerLat = 111_320;
  const metresPerLon = metresPerLat * Math.cos((geo.MAP_CENTER.lat * Math.PI) / 180);
  return {
    lat: round(geo.MAP_CENTER.lat - point.z / (metresPerLat * geo.WORLD_SCALE), 7),
    lon: round(geo.MAP_CENTER.lon + point.x / (metresPerLon * geo.WORLD_SCALE), 7)
  };
}

function average(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length
  };
}

function roundPoint(point) {
  return { x: round(point.x, 4), z: round(point.z, 4) };
}

function round(value, precision) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? round(value, 4) : null;
}

function countBy(entries, key) {
  return Object.fromEntries(
    [...entries.reduce((counts, entry) => counts.set(key(entry), (counts.get(key(entry)) ?? 0) + 1), new Map())].sort(([a], [b]) => a.localeCompare(b))
  );
}

function assertUniqueIds(entries, group) {
  const seen = new Set();
  const duplicates = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) duplicates.push(entry.id);
    seen.add(entry.id);
  }
  if (duplicates.length > 0) {
    throw new Error(`Duplicate ${group} ledger IDs: ${[...new Set(duplicates)].join(", ")}`);
  }
}
