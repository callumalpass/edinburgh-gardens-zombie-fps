import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const RAW_DIR = "docs/research/raw/context/2026-07-11";
const OSM_PATH = `${RAW_DIR}/osm-edinburgh-gardens-150m-context.xml`;
const AERIAL_PATH = `${RAW_DIR}/vicmap-aerial-edinburgh-gardens-150m-context.png`;
const ADDRESS_PATH = `${RAW_DIR}/vicmap-address-150m-context.geojson`;
const TREE_PATH = `${RAW_DIR}/vicmap-tree-urban-150m-context.geojson`;
const CONTOUR_PATH = `${RAW_DIR}/vicmap-contours-150m-context.geojson`;
const OUTPUT_PATH = "src/game/contextData.generated.ts";
const RESEARCH_OUTPUT_PATH = "docs/research/edinburgh-gardens-context-building-register.json";

const PARK_WAY_ID = "13815924";
const BELT_METRES = 150;
const MAP_CENTER = { lat: -37.7876764, lon: 144.9828576 };
const METRES_PER_DEGREE_LAT = 111_320;
const METRES_PER_DEGREE_LON = METRES_PER_DEGREE_LAT * Math.cos((MAP_CENTER.lat * Math.PI) / 180);
const WORLD_SCALE = 1.28;
const AERIAL_BOUNDS = {
  minLon: 144.97835096436717,
  minLat: -37.79124436676249,
  maxLon: 144.9873642356328,
  maxLat: -37.78410843323751
};
const NORTH_FITZROY_HERITAGE_URL = "https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/review-of-heritage-areas-2007-butler-updated-2013.pdf";
const HERITAGE_DATABASE_URL = "https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/heritage-database/incoproated-document--database-of-heritage-significant-areas-april-2022.pdf?la=en";
const FEATURE_PROFILES = {
  "484321207": {
    height: 10.05,
    heightBasis: "City of Yarra development summary identifies three storeys; rendered at 3.15 m per storey plus parapet allowance",
    facadeProfile: "modern-civic",
    roofShape: "flat",
    facadeTone: "brick",
    sources: [
      "https://www.yarracity.vic.gov.au/planning-and-building/planning-permits/bargoonga-nganjin-north-fitzroy-library",
      "https://www.yarracity.vic.gov.au/our-libraries/hours-and-locations/bargoonga-nganjin-north-fitzroy-library"
    ],
    cues: ["three-storey civic massing", "fixed exterior shading/screens", "rooftop garden"]
  },
  "1134443340": {
    facadeProfile: "institutional",
    sources: ["https://www.yarracity.vic.gov.au/sites/default/files/2024-05/20150804-ordinary-council-minutes.pdf"],
    cues: ["school occupies former adjoining Brunswick Street houses rather than a purpose-built monolithic school block"]
  },
  "1475006788": {
    facadeProfile: "church",
    facadeTone: "brick",
    roofShape: "gable",
    sources: ["https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/fitzroy-urban-conservation-study-review-1992.pdf"],
    cues: ["former St Luke's Anglican church", "historic Crouch & Wilson design", "strong gabled ecclesiastical silhouette"]
  },
  "1414022775": {
    facadeProfile: "church",
    roofShape: "gable",
    cues: ["place-of-worship massing; fine facade details remain unverified"]
  },
  "1533863604": {
    facadeProfile: "church",
    facadeTone: "brick",
    roofShape: "gable",
    cues: ["former church use and footprint are mapped; fine facade details remain unverified"]
  }
};

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attributes(source) {
  const result = {};
  for (const match of source.matchAll(/([:\w-]+)="([^"]*)"/g)) result[match[1]] = decodeXml(match[2]);
  return result;
}

function parseOsm(xml) {
  const nodes = new Map();
  for (const match of xml.matchAll(/<node\b([^>]*)>/g)) {
    const attrs = attributes(match[1]);
    if (attrs.id && attrs.lat && attrs.lon) nodes.set(attrs.id, { lat: Number(attrs.lat), lon: Number(attrs.lon) });
  }
  const ways = [];
  for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const attrs = attributes(match[1]);
    const body = match[2];
    const nodeRefs = [...body.matchAll(/<nd\b([^>]*)\/>/g)].map((candidate) => attributes(candidate[1]).ref).filter(Boolean);
    const tags = Object.fromEntries(
      [...body.matchAll(/<tag\b([^>]*)\/>/g)].map((candidate) => {
        const tag = attributes(candidate[1]);
        return [tag.k, tag.v];
      }).filter(([key]) => key)
    );
    ways.push({ id: attrs.id, nodeRefs, tags, geoPoints: nodeRefs.map((id) => nodes.get(id)).filter(Boolean) });
  }
  return { nodes, ways };
}

function geoToMetres(point) {
  return {
    x: (point.lon - MAP_CENTER.lon) * METRES_PER_DEGREE_LON,
    z: (MAP_CENTER.lat - point.lat) * METRES_PER_DEGREE_LAT
  };
}

function geoToWorld(point) {
  const metres = geoToMetres(point);
  return { x: metres.x * WORLD_SCALE, z: metres.z * WORLD_SCALE };
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area * 0.5;
}

function polygonCentroid(points) {
  const area = polygonArea(points);
  if (Math.abs(area) < 0.0001) {
    return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, z: sum.z + point.z / points.length }), { x: 0, z: 0 });
  }
  let x = 0;
  let z = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const factor = a.x * b.z - b.x * a.z;
    x += (a.x + b.x) * factor;
    z += (a.z + b.z) * factor;
  }
  return { x: x / (6 * area), z: z / (6 * area) };
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function distanceToPolygon(point, polygon) {
  if (pointInPolygon(point, polygon)) return 0;
  return Math.min(...polygon.map((a, index) => distanceToSegment(point, a, polygon[(index + 1) % polygon.length])));
}

function polygonDimensions(points) {
  let longest = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    longest = Math.max(longest, Math.hypot(b.x - a.x, b.z - a.z));
  }
  const area = Math.abs(polygonArea(points));
  return { longest, area, short: longest > 0 ? area / longest : 0 };
}

function parseHeight(tags, dimensions) {
  const explicitHeight = Number.parseFloat(tags.height ?? "");
  if (Number.isFinite(explicitHeight) && explicitHeight > 1) return { height: explicitHeight, basis: `OSM height=${tags.height}` };
  const levels = Number.parseFloat(tags["building:levels"] ?? "");
  if (Number.isFinite(levels) && levels > 0) return { height: levels * 3.15 + 0.55, basis: `OSM building:levels=${tags["building:levels"]}; 3.15 m per level plus parapet/roof allowance` };
  const type = tags.building ?? "yes";
  if (type === "shed" || type === "garage") return { height: 2.8, basis: `${type} height inferred conservatively from building type and aerial roof scale` };
  if (type === "church" || tags.amenity === "place_of_worship") return { height: 8.6, basis: "church wall/eave height inferred from mapped use and footprint; tower/spire not asserted without feature-specific evidence" };
  if (type === "apartments") return { height: 9.8, basis: "three-storey apartment massing inferred from building type and footprint; exact height unavailable" };
  if (type === "school" || tags["building:use"] === "school") return { height: 6.4, basis: "two-storey school massing inferred from use and aerial footprint; exact height unavailable" };
  if (dimensions.area > 1_200) return { height: 8.2, basis: "large-footprint three-storey-equivalent context massing; exact public height unavailable" };
  if (dimensions.area > 500) return { height: 6.6, basis: "large-footprint two-storey context massing; exact public height unavailable" };
  if (dimensions.area > 210) return { height: 5.4, basis: "medium-footprint residential/commercial context massing; exact public height unavailable" };
  return { height: 4.35, basis: "small-footprint single-storey/eave context massing; exact public height unavailable" };
}

function inferRoofShape(tags, dimensions) {
  const explicit = tags["roof:shape"];
  if (["flat", "gable", "hipped", "skillion"].includes(explicit)) return explicit;
  if (tags.building === "church") return "gable";
  if (tags.building === "apartments" || dimensions.area > 900) return "flat";
  if (dimensions.longest / Math.max(0.1, dimensions.short) > 1.35) return "gable";
  return dimensions.area > 360 ? "hipped" : "gable";
}

function decodeAerial(path) {
  try {
    const rgb = execFileSync("magick", [path, "-depth", "8", "rgb:-"], { maxBuffer: 32 * 1024 * 1024 });
    return { width: 2048, height: 2048, rgb };
  } catch {
    return null;
  }
}

function sampleAerialRoof(aerial, geoPolygon) {
  if (!aerial) return { tone: "weathered", rgb: null };
  const minLon = Math.min(...geoPolygon.map((point) => point.lon));
  const maxLon = Math.max(...geoPolygon.map((point) => point.lon));
  const minLat = Math.min(...geoPolygon.map((point) => point.lat));
  const maxLat = Math.max(...geoPolygon.map((point) => point.lat));
  const pixels = [];
  for (let gx = 1; gx <= 7; gx += 1) {
    for (let gy = 1; gy <= 7; gy += 1) {
      const point = { lon: minLon + ((maxLon - minLon) * gx) / 8, lat: minLat + ((maxLat - minLat) * gy) / 8 };
      const projectedPolygon = geoPolygon.map((candidate) => ({ x: candidate.lon, z: candidate.lat }));
      if (!pointInPolygon({ x: point.lon, z: point.lat }, projectedPolygon)) continue;
      const x = Math.max(0, Math.min(aerial.width - 1, Math.round(((point.lon - AERIAL_BOUNDS.minLon) / (AERIAL_BOUNDS.maxLon - AERIAL_BOUNDS.minLon)) * (aerial.width - 1))));
      const y = Math.max(0, Math.min(aerial.height - 1, Math.round(((AERIAL_BOUNDS.maxLat - point.lat) / (AERIAL_BOUNDS.maxLat - AERIAL_BOUNDS.minLat)) * (aerial.height - 1))));
      const offset = (y * aerial.width + x) * 3;
      const rgb = [aerial.rgb[offset], aerial.rgb[offset + 1], aerial.rgb[offset + 2]];
      const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
      const green = rgb[1] > rgb[0] * 1.08 && rgb[1] > rgb[2] * 1.08;
      if (brightness >= 62 && !green) pixels.push(rgb);
    }
  }
  if (pixels.length === 0) return { tone: "weathered", rgb: null };
  const median = [0, 1, 2].map((channel) => pixels.map((pixel) => pixel[channel]).sort((a, b) => a - b)[Math.floor(pixels.length / 2)]);
  const palettes = {
    silver: [190, 194, 188],
    cream: [190, 168, 132],
    terracotta: [152, 92, 67],
    charcoal: [83, 88, 84],
    weathered: [132, 132, 122]
  };
  const tone = Object.entries(palettes).sort(([, a], [, b]) => squaredColorDistance(median, a) - squaredColorDistance(median, b))[0][0];
  return { tone, rgb: median };
}

function squaredColorDistance(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function hashNumber(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function facadeToneFor(tags, id) {
  if (tags.building === "church" || tags.historic) return "brick";
  if (tags.shop || tags.amenity === "restaurant" || tags.amenity === "bar" || tags.amenity === "cafe") return "ochre";
  return ["brick", "cream", "weatherboard", "cream", "charcoal"][hashNumber(id) % 5];
}

function facadeProfileFor(tags, distance) {
  if (tags.amenity === "library") return "modern-civic";
  if (tags.building === "church" || tags.amenity === "place_of_worship") return "church";
  if (tags.building === "school" || tags["building:use"] === "school" || tags.amenity === "school") return "institutional";
  if (tags.shop || ["restaurant", "bar", "cafe", "pub"].includes(tags.amenity)) return "terrace-shop";
  if (distance <= 95 && !["apartments", "commercial", "industrial", "retail"].includes(tags.building)) return "heritage-residential";
  return "generic";
}

function storeysFor(tags, height) {
  const explicit = Number.parseFloat(tags["building:levels"] ?? "");
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.round(explicit));
  return Math.max(1, Math.min(4, Math.round((height - 0.45) / 3.15)));
}

function addressFromTags(tags) {
  if (!tags["addr:housenumber"] && !tags["addr:street"]) return undefined;
  return [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
}

function formatVicmapAddress(properties) {
  const number = properties.house_number_2
    ? `${properties.house_number_1}-${properties.house_number_2}`
    : properties.house_number_1;
  const street = [properties.road_name, properties.road_type].filter(Boolean).join(" ");
  return [number, street].filter(Boolean).join(" ");
}

function addressInsideBuilding(addressFeatures, geoPolygon) {
  const polygon = geoPolygon.map((point) => ({ x: point.lon, z: point.lat }));
  const matches = addressFeatures.filter((feature) => {
    const coordinates = feature.geometry?.coordinates;
    return Array.isArray(coordinates) && pointInPolygon({ x: coordinates[0], z: coordinates[1] }, polygon);
  });
  if (matches.length === 0) return undefined;
  return formatVicmapAddress(matches[0].properties ?? {});
}

function detailTier(distance) {
  return distance <= 45 ? "near" : distance <= 95 ? "mid" : "far";
}

function evidenceTier(tags, distance, address) {
  if (tags.name && (tags.website || tags.operator || tags.wikidata)) return "feature-specific";
  return distance <= 95 && address ? "footprint-address-aerial" : "footprint-aerial";
}

function roadKind(tags) {
  if (tags.railway === "tram") return "tram";
  if (["footway", "cycleway", "path", "pedestrian", "steps"].includes(tags.highway)) return "path";
  if (["service", "living_street"].includes(tags.highway)) return "service";
  return "road";
}

function roadWidth(tags) {
  const explicit = Number.parseFloat(tags.width ?? "");
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (tags.railway === "tram") return 0.11;
  return ({
    trunk: 13.5,
    primary: 11,
    secondary: 9,
    tertiary: 8,
    residential: 6.5,
    unclassified: 6,
    living_street: 5,
    service: 4.8,
    pedestrian: 4,
    cycleway: 3,
    footway: 2.2,
    path: 1.8,
    steps: 1.8
  })[tags.highway] ?? 5.5;
}

function serialize(value) {
  return JSON.stringify(value, null, 2);
}

const osm = parseOsm(readFileSync(OSM_PATH, "utf8"));
const parkWay = osm.ways.find((way) => way.id === PARK_WAY_ID);
if (!parkWay) throw new Error(`Missing OSM park boundary way ${PARK_WAY_ID}`);
const parkMetres = parkWay.geoPoints.map(geoToMetres);
const parkWorld = parkWay.geoPoints.map(geoToWorld);
const addressFeatures = JSON.parse(readFileSync(ADDRESS_PATH, "utf8")).features ?? [];
const aerial = decodeAerial(AERIAL_PATH);

const buildings = [];
const buildingResearch = [];
for (const way of osm.ways) {
  if (!way.tags.building || way.tags.building === "no" || way.geoPoints.length < 3) continue;
  const geoPolygon = way.geoPoints[0] === way.geoPoints.at(-1) ? way.geoPoints.slice(0, -1) : way.geoPoints;
  const metresPolygon = geoPolygon.map(geoToMetres);
  const centerMetres = polygonCentroid(metresPolygon);
  if (pointInPolygon(centerMetres, parkMetres)) continue;
  const distance = distanceToPolygon(centerMetres, parkMetres);
  if (distance > BELT_METRES) continue;
  const worldPolygon = geoPolygon.map(geoToWorld);
  const center = polygonCentroid(worldPolygon);
  const dimensions = polygonDimensions(metresPolygon);
  const address = addressFromTags(way.tags) ?? addressInsideBuilding(addressFeatures, geoPolygon);
  const height = parseHeight(way.tags, dimensions);
  const featureProfile = FEATURE_PROFILES[way.id] ?? {};
  const featureSources = [...new Set([
    ...(featureProfile.sources ?? []),
    ...(way.tags.website ? [way.tags.website] : [])
  ])];
  const roof = sampleAerialRoof(aerial, geoPolygon);
  const evidence = evidenceTier(way.tags, distance, address);
  const sourceUrl = `https://www.openstreetmap.org/way/${way.id}`;
  const label = way.tags.name ?? address ?? `Context building OSM way ${way.id}`;
  const renderedHeight = featureProfile.height ?? height.height;
  const renderedHeightBasis = featureProfile.heightBasis ?? height.basis;
  const uncertainty = renderedHeightBasis.includes("unavailable") || renderedHeightBasis.includes("inferred")
    ? "Footprint and roof tone are source-backed; height, roof construction and unsurveyed facade details remain explicit visual inferences."
    : "Footprint and height/levels are source-backed; roof tone is aerial-derived and fine facade details remain unsurveyed.";
  buildings.push({
    id: `context-building-${way.id}`,
    osmWayId: way.id,
    label,
    ...(address ? { address } : {}),
    buildingType: way.tags.building,
    polygon: worldPolygon.map(roundPoint),
    center: roundPoint(center),
    distanceToPark: round(distance),
    height: round(renderedHeight),
    heightBasis: renderedHeightBasis,
    roofShape: featureProfile.roofShape ?? inferRoofShape(way.tags, dimensions),
    roofTone: roof.tone,
    facadeTone: featureProfile.facadeTone ?? facadeToneFor(way.tags, way.id),
    facadeProfile: featureProfile.facadeProfile ?? facadeProfileFor(way.tags, distance),
    storeys: storeysFor(way.tags, renderedHeight),
    detailTier: detailTier(distance),
    evidenceTier: evidence,
    source: `OpenStreetMap way ${way.id}; Vicmap Basemap aerial 150 m context capture; ${address ? "Vicmap Address spatial cross-check" : "no matched public address point"}; City of Yarra HO327 precinct typology`,
    ...(featureSources.length ? { featureSources } : {}),
    ...(featureProfile.cues?.length ? { featureCues: featureProfile.cues } : {}),
    uncertainty
  });
  buildingResearch.push({
    id: `context-building-${way.id}`,
    osmWayId: way.id,
    label,
    distanceToParkMetres: round(distance),
    address: address ?? null,
    osmUrl: sourceUrl,
    osmTags: way.tags,
    vicmapAddressMatched: Boolean(addressInsideBuilding(addressFeatures, geoPolygon)),
    aerialRoofSampleRgb: roof.rgb,
    aerialRoofTone: roof.tone,
    renderedHeightMetres: round(renderedHeight),
    heightBasis: renderedHeightBasis,
    roofShape: featureProfile.roofShape ?? inferRoofShape(way.tags, dimensions),
    facadeProfile: featureProfile.facadeProfile ?? facadeProfileFor(way.tags, distance),
    storeys: storeysFor(way.tags, renderedHeight),
    precinctTypologySource: NORTH_FITZROY_HERITAGE_URL,
    heritageDatabaseSource: HERITAGE_DATABASE_URL,
    featureSources,
    featureCues: featureProfile.cues ?? [],
    evidenceTier: evidence,
    uncertainty
  });
}

const roads = osm.ways
  .filter((way) => (way.tags.highway || way.tags.railway === "tram") && way.geoPoints.length >= 2)
  .filter((way) => way.geoPoints.some((point) => distanceToPolygon(geoToMetres(point), parkMetres) <= BELT_METRES + 25))
  .map((way) => ({
    id: `context-road-${way.id}`,
    osmWayId: way.id,
    label: way.tags.name ?? `${way.tags.highway ?? "tram"} OSM way ${way.id}`,
    kind: roadKind(way.tags),
    points: way.geoPoints.map(geoToWorld).map(roundPoint),
    width: roadWidth(way.tags),
    source: `OpenStreetMap way ${way.id}`
  }));

const treeFeatures = JSON.parse(readFileSync(TREE_PATH, "utf8")).features ?? [];
const trees = treeFeatures.flatMap((feature) => {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  const geo = { lon: coordinates[0], lat: coordinates[1] };
  const metres = geoToMetres(geo);
  if (pointInPolygon(metres, parkMetres)) return [];
  const distance = distanceToPolygon(metres, parkMetres);
  if (distance > BELT_METRES) return [];
  const properties = feature.properties ?? {};
  return [{
    id: `context-tree-vicmap-${properties.OBJECTID ?? feature.id}`,
    position: roundPoint(geoToWorld(geo)),
    height: round(Number(properties.height_m) || 8),
    canopyRadius: round(Number(properties.canopy_radius_m) || 3),
    dense: properties.dense_canopy === "Y",
    distanceToPark: round(distance),
    source: `Vicmap Vegetation Tree Urban OBJECTID ${properties.OBJECTID ?? feature.id}; source ${properties.source_md_id ?? "unresolved"}`
  }];
});

const contourFeatures = JSON.parse(readFileSync(CONTOUR_PATH, "utf8")).features ?? [];
const elevationSamples = contourFeatures.flatMap((feature) => {
  const altitude = Number(feature.properties?.altitude);
  const coordinates = feature.geometry?.coordinates;
  if (!Number.isFinite(altitude) || !Array.isArray(coordinates)) return [];
  const lines = feature.geometry.type === "MultiLineString" ? coordinates : [coordinates];
  return lines.flatMap((line) => line.filter((_, index) => index % Math.max(1, Math.floor(line.length / 8)) === 0).map(([lon, lat]) => ({
    position: roundPoint(geoToWorld({ lon, lat })),
    altitude
  })));
});

buildings.sort((a, b) => a.distanceToPark - b.distanceToPark || a.osmWayId.localeCompare(b.osmWayId));
roads.sort((a, b) => a.osmWayId.localeCompare(b.osmWayId));
trees.sort((a, b) => a.distanceToPark - b.distanceToPark || a.id.localeCompare(b.id));

const contextData = { beltDistanceMetres: BELT_METRES, buildings, roads, trees, elevationSamples };
const generated = `// Generated by scripts/generate-context-world.mjs from the registered raw source family.\n// Do not hand-edit; update the raw evidence or generator and regenerate.\nimport type { ContextWorldData } from "./contextTypes";\n\nexport const CONTEXT_WORLD_DATA = ${serialize(contextData)} satisfies ContextWorldData;\n`;
writeFileSync(OUTPUT_PATH, generated);
writeFileSync(RESEARCH_OUTPUT_PATH, `${serialize({
  schemaVersion: 1,
  generatedAt: "2026-07-11",
  scope: "Buildings outside the OSM Edinburgh Gardens boundary with centroids within 150 metres of the boundary",
  sources: {
    osmMapApi: "https://api.openstreetmap.org/api/0.6/map?bbox=144.97835096436717,-37.79124436676249,144.9873642356328,-37.78410843323751",
    vicmapAerial: "https://base.maps.vic.gov.au/service?service=WMS&request=GetMap",
    vicmapAddress: "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Address/FeatureServer/0",
    vicmapBuildingsMetadata: "https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-buildings",
    northFitzroyHeritageOverlayReview: NORTH_FITZROY_HERITAGE_URL,
    cityOfYarraHeritageDatabase: HERITAGE_DATABASE_URL
  },
  buildingCount: buildingResearch.length,
  evidenceTierCounts: Object.fromEntries(["feature-specific", "footprint-address-aerial", "footprint-aerial"].map((tier) => [tier, buildingResearch.filter((building) => building.evidenceTier === tier).length])),
  buildings: buildingResearch
}, null, 2)}\n`);
console.log(`Wrote ${OUTPUT_PATH}: ${buildings.length} buildings, ${roads.length} roads/paths, ${trees.length} context trees, ${elevationSamples.length} elevation samples.`);
console.log(`Wrote ${RESEARCH_OUTPUT_PATH}: ${buildingResearch.length} per-building evidence records.`);

function round(value) {
  return Number(value.toFixed(3));
}

function roundPoint(point) {
  return { x: round(point.x), z: round(point.z) };
}
