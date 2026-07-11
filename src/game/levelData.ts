import {
  AUSTRALIAN_RULES_FULL_GOAL_WIDTH_METRES,
  AUSTRALIAN_RULES_GOAL_POST_HEIGHT_METRES,
  BASKETBALL_BACKBOARD_WIDTH_METRES,
  BASKETBALL_RIM_HEIGHT_METRES,
  footballPostLocalOffsets
} from "./sportsFixtures";
import {
  boundingRadius,
  distance,
  distanceToSegment,
  geoToWorld,
  makeCircle,
  nearestPointOnSegment,
  nearestPointOnPolygon,
  pointInPolygon,
  polygonCentroid,
  polygonFromGeo,
  samplePolyline,
  WORLD_SCALE
} from "./geo";
import type {
  AmenityPoint,
  BoxObstacle,
  BoxObstacleAccessGap,
  CircularObstacle,
  CollisionSourceRef,
  GeoPoint,
  GroundSurfacePolygon,
  HardscapeLine,
  InteractableFixture,
  InteractableRaisedFootprint,
  Landmark,
  LevelData,
  LevelPath,
  MappedBuilding,
  MappedFence,
  MappedTree,
  ParkLifeDetail,
  PathSurfacePatch,
  PolygonObstacle,
  SkateBowlFeature,
  SignificantTreePoint,
  SportsFixture,
  StructureShelter,
  StreetEdge,
  TerrainModifier,
  TreeCollider,
  TreeProfile,
  Vec2
} from "./types";

const g = (lat: number, lon: number): GeoPoint => ({ lat, lon });
const offsetPoint = (center: Vec2, angle: number, localX: number, localZ: number): Vec2 => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: center.x + localX * cos - localZ * sin,
    z: center.z + localX * sin + localZ * cos
  };
};

const localZFromPoint = (center: Vec2, angle: number, point: Vec2): number => {
  return localPointFromWorld(center, angle, point).z;
};

const localPointFromWorld = (center: Vec2, angle: number, point: Vec2): Vec2 => {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  return {
    x: dx * Math.cos(angle) + dz * Math.sin(angle),
    z: -dx * Math.sin(angle) + dz * Math.cos(angle)
  };
};

const capsulePolygon = (center: Vec2, angle: number, halfLength: number, halfWidth: number, steps = 8): Vec2[] => {
  const radius = halfWidth;
  const straight = Math.max(0.01, halfLength - radius);
  const points: Vec2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const theta = -Math.PI / 2 + (index / steps) * Math.PI;
    points.push(offsetPoint(center, angle, straight + Math.cos(theta) * radius, Math.sin(theta) * radius));
  }
  for (let index = 0; index <= steps; index += 1) {
    const theta = Math.PI / 2 + (index / steps) * Math.PI;
    points.push(offsetPoint(center, angle, -straight + Math.cos(theta) * radius, Math.sin(theta) * radius));
  }
  return points;
};

const footprintFromPolygon = (polygon: readonly Vec2[]): { center: Vec2; halfX: number; halfZ: number; angle: number } => {
  const center = polygonCentroid(polygon);
  const first = polygon[0];
  const second = polygon[1] ?? first;
  const angle = Math.atan2(second.z - first.z, second.x - first.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let halfX = 0;
  let halfZ = 0;

  for (const point of polygon) {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    halfX = Math.max(halfX, Math.abs(dx * cos + dz * sin));
    halfZ = Math.max(halfZ, Math.abs(-dx * sin + dz * cos));
  }

  return { center, halfX, halfZ, angle };
};

const fittedFootprintFromPolygon = (
  polygon: readonly Vec2[],
  frontagePoint?: Vec2
): { center: Vec2; halfX: number; halfZ: number; angle: number } => {
  const center = polygonCentroid(polygon);
  let longestA = polygon[0];
  let longestB = polygon[1] ?? polygon[0];
  let longest = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const length = distance(a, b);
    if (length > longest) {
      longest = length;
      longestA = a;
      longestB = b;
    }
  }
  let angle = Math.atan2(longestB.z - longestA.z, longestB.x - longestA.x);
  const extents = (candidateAngle: number) => {
    const cos = Math.cos(candidateAngle);
    const sin = Math.sin(candidateAngle);
    let halfX = 0;
    let halfZ = 0;
    for (const point of polygon) {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      halfX = Math.max(halfX, Math.abs(dx * cos + dz * sin));
      halfZ = Math.max(halfZ, Math.abs(-dx * sin + dz * cos));
    }
    return { halfX, halfZ };
  };
  const { halfX, halfZ } = extents(angle);
  if (frontagePoint && localPointFromWorld(center, angle, frontagePoint).z < 0) angle += Math.PI;
  return { center, halfX, halfZ, angle };
};

const localRectPolygon = (center: Vec2, angle: number, localX: number, localZ: number, width: number, depth: number): Vec2[] => [
  offsetPoint(center, angle, localX - width * 0.5, localZ - depth * 0.5),
  offsetPoint(center, angle, localX + width * 0.5, localZ - depth * 0.5),
  offsetPoint(center, angle, localX + width * 0.5, localZ + depth * 0.5),
  offsetPoint(center, angle, localX - width * 0.5, localZ + depth * 0.5)
];

const raisedCircle = (center: Vec2, radius: number): Extract<InteractableRaisedFootprint, { shape: "circle" }> => ({
  shape: "circle",
  center,
  radius
});

const raisedBox = (center: Vec2, halfX: number, halfZ: number, angle: number): Extract<InteractableRaisedFootprint, { shape: "box" }> => ({
  shape: "box",
  center,
  halfX,
  halfZ,
  angle
});

const raisedPolygon = (polygon: readonly Vec2[], center = polygonCentroid(polygon)): Extract<InteractableRaisedFootprint, { shape: "polygon" }> => ({
  shape: "polygon",
  center,
  polygon: polygon.map((point) => ({ ...point }))
});

const polygonEdgePointFromLocal = (
  polygon: readonly Vec2[],
  center: Vec2,
  angle: number,
  localX: number,
  localZ: number
): Vec2 => {
  const edgePoint = nearestPointOnPolygon(offsetPoint(center, angle, localX, localZ), polygon);
  const dx = edgePoint.x - center.x;
  const dz = edgePoint.z - center.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: edgePoint.x + (dx / length) * 0.8,
    z: edgePoint.z + (dz / length) * 0.8
  };
};

const exteriorPointFromPolygon = (point: Vec2, polygon: readonly Vec2[], center = polygonCentroid(polygon), clearance = 0.55): Vec2 => {
  const edgePoint = nearestPointOnPolygon(point, polygon);
  const dx = edgePoint.x - center.x;
  const dz = edgePoint.z - center.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: edgePoint.x + (dx / length) * clearance,
    z: edgePoint.z + (dz / length) * clearance
  };
};

export const RESEARCH_NOTES = [
  "Yarra City Council describes Edinburgh Gardens as a 24 hectare park with open lawns, specimen trees, shaded areas and an extensive path network.",
  "Council-listed facilities include barbecue areas, basketball, dog areas, drinking fountains, pavilion, picnic areas, playgrounds, toilets, skate park and sports oval.",
  "Yarra's northern precinct material identifies the relocated table tennis table, BBQ/picnic tables, skate/BMX activity area and basketball half-court as a linked activity precinct.",
  "The OSM park boundary is way 13815924. Key OSM features used here include W. T. Peterson Oval, Fitzroy Tennis Club, Fitzroy Victoria Bowling & Sports Club, Inner Circle Rail Trail, basketball court, skate area, playgrounds, toilets and Kevin Murray Stand.",
  "Heritage material emphasizes mature elm avenues, nineteenth-century formal path structure, W.T. Peterson Oval, the former railway/shared path and the rotunda.",
  "Yarra public-art records identify the Queen Victoria statue plinth in a circular garden bed, the Sportsman's War Memorial behind the bowls club, and the rotating Plinth Program work currently represented as Zone Red.",
  "Vicmap Elevation open metro contour/ground-point services show sampled park elevations from roughly 27m to 32m AHD inside the mapped boundary; those samples drive the terrain interpolation.",
  "A 2026-07-05 bounded OSM path/service inventory added missing asphalt connectors around the northern paths, Queen Victoria plinth, central rail-trail link, southern entries and bowling-club service path.",
  "The Edinburgh Gardens CMP records asphalt paths with remnant basalt/bluestone edging, a bluestone-pitcher open drain on the oval's eastern perimeter and a bluestone retaining wall along Alfred Crescent; these are represented as hardscape lines.",
  "Football posts, basketball hoops and solid tree trunks now share researched placement data with collision obstacles so the visuals and playable blockers stay aligned.",
  "Tree rendering now uses a single mapped-tree data model with species/profile inference from Yarra significant trees, Vicmap aerial/LiDAR tree points, OSM node IDs and CMP heritage avenue context.",
  "A 2026-07-05 tree refresh added Vicmap Vegetation Tree Urban points for missing non-significant trees around the Queen Victoria plinth and broader lawns, removed synthetic avenue sample trunks and suppresses current tennis-works tree removals.",
  "Street edges now use a bounded OSM road query for Alfred Crescent, Freeman Street, Brunswick Street and St Georges Road, including trunk-road tram cues.",
  "Small park-life details are stored as sourceable level data so picnic, dog-area, cycling and sports-use cues remain separate from collision and amenity loot data.",
  "A 2026-07-05 full-object placement audit checked the current OSM bounded extract against all visible, blocking and climbable object families; missing raingarden, storage-tank and cricket-net cues were added and climb blockers now have matching visible structures.",
  "A 2026-07-05 path and raingarden review added the remaining OSM-mapped grandstand steps, oval connectors and north-side path links, and remodeled the skate-precinct stormwater garden as a terraced treatment garden.",
  "A 2026-07-05 north-east planter review added the bluestone circular shrub planter north of Rowe Street and the two smaller Rowe Street entrance planters as dense crouch-cover landmarks.",
  "A 2026-07-05 ornamental gardens review split the visible GHD stormwater filtration garden from the east-side underground reservoir footprint, then added St Georges display beds, Rotunda Lawn shrub beds, the Queen Victoria circular display bed and tennis/Bowling agapanthus strips.",
  "Micro-terrain modifiers now layer path crowns, worn shoulders, root mounds, oval banking and drainage swales over the broad Vicmap elevation interpolation.",
  "Path surface transition patches now derive feathered edges and compacted junctions from mapped paths, with a small set of researched desire paths through high-use lawns.",
  "A 2026-07-06 realism artifact audit aligned Three.js object-preview building orientation with the restored Three.js runtime, added source-backed facade, current-works, suppressed-tree-stump, wet-weather and night-light details, and tightened zombie/weapon silhouettes while preserving low-poly anime minimalism.",
  "A later 2026-07-06 facade and tennis-works pass added explicit source-backed frontage points for the major mapped buildings and renovation-surface cues on all six existing tennis courts, based on Yarra's 2026-2027 Brunswick Street Oval works page.",
  "A 2026-07-06 playground and fence pass refreshed current OSM playground footprints, retained the documented south safety fence/gates, left the relocated northern playground unfenced after current-source review, added low jumpable oval fence blockers at mapped connectors, and added a short player jump.",
  "A 2026-07-06 Fitzy Bowl pass removed the old invisible full-skatepark blocker, added source-backed depressed skate bowls, and made bowl exits constrained to roll-out gaps so dropping in is easy and climbing out is deliberately awkward.",
  "Public-use rules still inform gameplay, but rule pages are no longer translated into fixed physical signs without a mapped or photographed sign coordinate.",
  "The structure-depth correction retains grandstand umpire access, the Emely Baker room/kitchenette and the Rotunda plaque interaction, while removing unsupported bowling shed supplies, loose roof-maintenance kits, exterior appliances and duplicate access props.",
  "Future grandstand kiosk/public-toilet and sports-pavilion switchboard interactions are excluded from the 2026 baseline; the Rotunda remains explicitly unpowered.",
  "A 2026-07-06 structure shelter pass adds source-backed roof, verandah, shade-sail and grandstand-cover shelter zones that reduce weather handling/search exposure while staying tied to visible building footprints.",
  "The 2026 facility correction retains documented Fitzroy Bowls zincalume/solar roof fabric without inventing loose exterior maintenance props; future sports-pavilion first-aid/kitchen access is excluded.",
  "A 2026-07-10 correction retains the CMP-backed Chandler Fountain and the single documented Avenue B Fitzroy Council Bollard, and removes rotunda lamps recorded as gone by c. 2014 plus unsupported interpretive signs, extra seats and bollards; winter weather remains tuned to Bureau of Meteorology Melbourne July normals.",
  "A 2026-07-06 winter daylight/tree/zombie pass retunes the accelerated cycle to Melbourne July 2026 sunrise/sunset, uses winter solar azimuth/altitude for the key light, makes elm/oak profiles sparser and branchier, and lets night/rain/wet lawns modestly alter zombie visibility, hearing and footing.",
  "A 2026-07-06 tree character pass replaces arbitrary mapped-tree profile fallbacks with heritage/significant-tree proximity rules; the 35 Brunswick Street Oval replacement trees remain excluded from the 2026 snapshot because council schedules planting after the active works packages.",
  "A 2026-07-09 current OSM object audit confirms tree/bin/fountain/bench/toilet/BBQ node parity, adds the Freeman Street post box and moves table tennis to OSM way 715659039; approximate picnic tables were later removed because no per-table GIS points were found.",
  "A 2026-07-10 physical-baseline correction restores the park itself to 2026: three northern tennis courts are active works surfaces, three southern clay courts remain operational and all 39 council-plan removals are represented as stumps, with the in-world clock/date as the only 2030 element.",
  "The same audit corrects Three.js map/local rotation signs, prevents tennis/bowling fence runs from closing through clubhouses, and keeps documented gate-to-clubroom and Emely courtyard routes free of hidden blockers.",
  "CMP Figure 72 controls the Hannah memorial entrance: paired red-brick piers, dark bases, plaques and open green gate leaves are rendered at the mapped bowling entrance, with matching solid pier collision and a clear pedestrian opening.",
  "Geotagged 28 May 2026 photographs replace the bowling club's earlier 150-year mural cue on the St Georges Road wall with the current Melanie Caple composition: a maroon ground, standing and reclining lions, amber discs, central flower/still life, paired budgies, foliage and gold rays.",
  "See docs/edinburgh-gardens-research.md for source URLs, query notes, data licensing notes and implementation decisions."
];

export const PARK_BOUNDARY_GEO: GeoPoint[] = [
  g(-37.7895796, 144.9800560),
  g(-37.7896917, 144.9801146),
  g(-37.7898932, 144.9822447),
  g(-37.7898969, 144.9823179),
  g(-37.7898328, 144.9823636),
  g(-37.7897992, 144.9823983),
  g(-37.7897595, 144.9824454),
  g(-37.7897089, 144.9825077),
  g(-37.7896699, 144.9825828),
  g(-37.7896445, 144.9826394),
  g(-37.7896233, 144.9826980),
  g(-37.7896061, 144.9827528),
  g(-37.7895917, 144.9828533),
  g(-37.7895921, 144.9829481),
  g(-37.7895947, 144.9830085),
  g(-37.7894577, 144.9830043),
  g(-37.7894509, 144.9831477),
  g(-37.7894472, 144.9833142),
  g(-37.7893884, 144.9835448),
  g(-37.7893453, 144.9836989),
  g(-37.7892631, 144.9839012),
  g(-37.7891865, 144.9840554),
  g(-37.7890054, 144.9843289),
  g(-37.7888307, 144.9845931),
  g(-37.7886418, 144.9848576),
  g(-37.7885270, 144.9850196),
  g(-37.7884143, 144.9851463),
  g(-37.7882917, 144.9852538),
  g(-37.7881445, 144.9853623),
  g(-37.7878761, 144.9855232),
  g(-37.7875074, 144.9856445),
  g(-37.7873496, 144.9856356),
  g(-37.7871294, 144.9856592),
  g(-37.7868312, 144.9855969),
  g(-37.7865325, 144.9854674),
  g(-37.7862505, 144.9852665),
  g(-37.7859495, 144.9849224),
  g(-37.7858661, 144.9848019),
  g(-37.7857701, 144.9846305),
  g(-37.7856814, 144.9844395),
  g(-37.7856250, 144.9843077),
  g(-37.7855273, 144.9839781),
  g(-37.7854611, 144.9836011),
  g(-37.7854559, 144.9832684),
  g(-37.7854692, 144.9830236),
  g(-37.7854777, 144.9828958),
  g(-37.7855462, 144.9826139),
  g(-37.7855979, 144.9824527),
  g(-37.7857573, 144.9820955),
  g(-37.7859647, 144.9817461),
  g(-37.7861518, 144.9814992),
  g(-37.7863661, 144.9813091),
  g(-37.7865428, 144.9811569),
  g(-37.7868341, 144.9809658),
  g(-37.7870952, 144.9807646),
  g(-37.7872801, 144.9806567),
  g(-37.7874688, 144.9805648),
  g(-37.7880830, 144.9803435),
  g(-37.7884824, 144.9802620),
  g(-37.7895796, 144.9800560)
];

const OVAL_GEO = [
  g(-37.7887804, 144.9803741),
  g(-37.7886683, 144.9804143),
  g(-37.7885872, 144.9804731),
  g(-37.7885122, 144.9805608),
  g(-37.7884561, 144.9806571),
  g(-37.7884034, 144.9808378),
  g(-37.7883925, 144.9810447),
  g(-37.7884465, 144.9815403),
  g(-37.7884873, 144.9817183),
  g(-37.7885727, 144.9819036),
  g(-37.7886633, 144.9820178),
  g(-37.7887485, 144.9820877),
  g(-37.7888541, 144.9821321),
  g(-37.7889685, 144.9821548),
  g(-37.7892555, 144.9821114),
  g(-37.7893676, 144.9820607),
  g(-37.7894814, 144.9819605),
  g(-37.7895580, 144.9818535),
  g(-37.7896342, 144.9817104),
  g(-37.7896696, 144.9815603),
  g(-37.7896749, 144.9814214),
  g(-37.7896156, 144.9808952),
  g(-37.7895943, 144.9807777),
  g(-37.7895536, 144.9806490),
  g(-37.7894858, 144.9805202),
  g(-37.7893976, 144.9804344),
  g(-37.7893042, 144.9803684),
  g(-37.7891841, 144.9803268),
  g(-37.7890752, 144.9803257),
  g(-37.7887804, 144.9803741)
];

const GRANDSTAND_GEO = [
  g(-37.7881664, 144.9812702),
  g(-37.7882104, 144.9816910),
  g(-37.7883016, 144.9816757),
  g(-37.7882576, 144.9812549),
  g(-37.7881664, 144.9812702)
];

const GRANDSTAND_PARKING_GEO = [
  g(-37.7881664, 144.9812702),
  g(-37.7882104, 144.9816910),
  g(-37.7881445, 144.9817020),
  g(-37.7881295, 144.9815588),
  g(-37.7880510, 144.9815719),
  g(-37.7880395, 144.9814618),
  g(-37.7881180, 144.9814487),
  g(-37.7881005, 144.9812812),
  g(-37.7881664, 144.9812702)
];

const TENNIS_GEO = [
  // Current OSM sports-centre envelope for the six-court July 2026 precinct.
  // Do not extend this north to the approximate two-court 2030 expansion: this
  // polygon also drives the visible fence, collision boundary and ladder area.
  g(-37.7877761, 144.9819984),
  g(-37.7880443, 144.9819535),
  g(-37.7880456, 144.9819656),
  g(-37.7881476, 144.9819485),
  g(-37.7881376, 144.9818524),
  g(-37.7882000, 144.9818420),
  g(-37.7882025, 144.9818656),
  g(-37.7882105, 144.9818642),
  g(-37.7881943, 144.9817091),
  g(-37.7883100, 144.9816897),
  g(-37.7883452, 144.9816838),
  g(-37.7883614, 144.9818390),
  g(-37.7883656, 144.9818789),
  g(-37.7883751, 144.9819697),
  g(-37.7883649, 144.9819714),
  g(-37.7884120, 144.9824212),
  g(-37.7877726, 144.9825283),
  g(-37.7877372, 144.9821894),
  g(-37.7877761, 144.9819984)
];

// The sports-centre polygon uses the pavilion walls as part of its south-west
// boundary. Only the exposed court perimeter is chain mesh; drawing the
// closed OSM envelope would put a second fence through the clubhouse.
const TENNIS_FENCE_GEO = TENNIS_GEO.slice(14).concat(TENNIS_GEO.slice(1, 2));

const TENNIS_COURTS_GEO = [
  [
    g(-37.7881147, 144.9819961),
    g(-37.7883268, 144.9819629),
    g(-37.7883392, 144.9820892),
    g(-37.7881271, 144.9821225)
  ],
  [
    g(-37.7881285, 144.9821547),
    g(-37.7883401, 144.9821186),
    g(-37.7883530, 144.9822399),
    g(-37.7881414, 144.9822759)
  ],
  [
    g(-37.7881472, 144.9823075),
    g(-37.7883585, 144.9822735),
    g(-37.7883709, 144.9823970),
    g(-37.7881597, 144.9824311)
  ],
  [
    g(-37.7878051, 144.9820278),
    g(-37.7880161, 144.9819898),
    g(-37.7880302, 144.9821145),
    g(-37.7878192, 144.9821525)
  ],
  [
    g(-37.7877956, 144.9821947),
    g(-37.7880081, 144.9821608),
    g(-37.7880205, 144.9822851),
    g(-37.7878080, 144.9823191)
  ],
  [
    g(-37.7878117, 144.9823606),
    g(-37.7880253, 144.9823239),
    g(-37.7880387, 144.9824483),
    g(-37.7878250, 144.9824850)
  ]
];

const BOWLS_GEO = [
  g(-37.7880240, 144.9810455),
  g(-37.7879840, 144.9811117),
  g(-37.7879590, 144.9811502),
  g(-37.7879508, 144.9811627),
  g(-37.7873414, 144.9814661),
  g(-37.7870952, 144.9807646),
  g(-37.7872801, 144.9806567),
  g(-37.7874688, 144.9805648),
  g(-37.7877269, 144.9804582),
  g(-37.7879060, 144.9803958),
  g(-37.7880830, 144.9803435),
  g(-37.7880313, 144.9809581),
  g(-37.7880240, 144.9810455)
];

// The clubhouse and entrance outbuilding close the southern bowling boundary.
// Vicmap aerial imagery and CMP Figure 71 show chain mesh only around the
// exposed west/north/east green perimeter.
const BOWLING_FENCE_GEO = BOWLS_GEO.slice(0, 11);

const BOWLS_GREENS_GEO = [
  [
    g(-37.7875780, 144.9805675),
    g(-37.7876339, 144.9811451),
    g(-37.7879558, 144.9810952),
    g(-37.7878999, 144.9805176)
  ],
  [
    g(-37.7872274, 144.9807130),
    g(-37.7872713, 144.9811661),
    g(-37.7876029, 144.9811146),
    g(-37.7875590, 144.9806616)
  ]
];

const SOUTH_PLAYGROUND_GEO = [
  g(-37.7892917, 144.9836262),
  g(-37.7890068, 144.9842034),
  g(-37.7889535, 144.9841767),
  g(-37.7889416, 144.9841588),
  g(-37.7889413, 144.9841224),
  g(-37.7889477, 144.9840617),
  g(-37.7889531, 144.9840009),
  g(-37.7889491, 144.9839384),
  g(-37.7889438, 144.9839019),
  g(-37.7889261, 144.9838438),
  g(-37.7889051, 144.9838022),
  g(-37.7888798, 144.9837675),
  g(-37.7888503, 144.9837321),
  g(-37.7890145, 144.9835245),
  g(-37.7890743, 144.9835014),
  g(-37.7891310, 144.9835024),
  g(-37.7892559, 144.9835735),
  g(-37.7892917, 144.9836262)
];

const NORTH_PLAYGROUND_GEO = [
  g(-37.7860104, 144.9830103),
  g(-37.7859839, 144.9828883),
  g(-37.7860263, 144.9828453),
  g(-37.7862404, 144.9827850),
  g(-37.7862733, 144.9827957),
  g(-37.7862934, 144.9828359),
  g(-37.7862992, 144.9828869),
  g(-37.7862976, 144.9829298),
  g(-37.7862733, 144.9829506),
  g(-37.7862685, 144.9830029),
  g(-37.7862415, 144.9830398),
  g(-37.7862393, 144.9830613),
  g(-37.7862457, 144.9830800),
  g(-37.7862126, 144.9830991),
  g(-37.7861567, 144.9831095),
  g(-37.7861058, 144.9831846),
  g(-37.7860040, 144.9831699),
  g(-37.7859511, 144.9831069),
  g(-37.7859405, 144.9830197),
  g(-37.7860104, 144.9830103)
];

const SKATE_GEO = [
  g(-37.7866250, 144.9833139),
  g(-37.7865543, 144.9833158),
  g(-37.7865146, 144.9830771),
  g(-37.7866101, 144.9829705),
  g(-37.7867103, 144.9829574),
  g(-37.7867286, 144.9831996),
  g(-37.7866250, 144.9833139)
];

const BASKETBALL_GEO = [
  g(-37.7881227, 144.9835511),
  g(-37.7878732, 144.9835963),
  g(-37.7878925, 144.9837663),
  g(-37.7881420, 144.9837211),
  g(-37.7881227, 144.9835511)
];

const TABLE_TENNIS_GEO = [
  g(-37.7858943, 144.9824859),
  g(-37.7858516, 144.9825033),
  g(-37.7858768, 144.9826022),
  g(-37.7859195, 144.9825848),
  g(-37.7858943, 144.9824859)
];

const SOUTH_EAST_PITCH_GEO = [
  g(-37.7888850, 144.9842775),
  g(-37.7883975, 144.9850070),
  g(-37.7882915, 144.9850553),
  g(-37.7880965, 144.9850446),
  g(-37.7879608, 144.9850017),
  g(-37.7878506, 144.9849158),
  g(-37.7877955, 144.9847442),
  g(-37.7877955, 144.9845725),
  g(-37.7878421, 144.9843419),
  g(-37.7880499, 144.9840575),
  g(-37.7883551, 144.9838215),
  g(-37.7885120, 144.9837625),
  g(-37.7886688, 144.9837357),
  g(-37.7887960, 144.9838483),
  g(-37.7888469, 144.9839503),
  g(-37.7888850, 144.9841487),
  g(-37.7888850, 144.9842775)
];

const RAINGARDEN_RESERVOIR_GEO = [
  g(-37.7874654, 144.9833932),
  g(-37.7876804, 144.9833565),
  g(-37.7876634, 144.9831974),
  g(-37.7874484, 144.9832341),
  g(-37.7874654, 144.9833932)
];

const STORMWATER_FILTRATION_GARDEN_GEO = [
  // Treatment-bed envelope from Lovell Chen/Landezine orientation evidence.
  // OSM way 655160879 is retained as water/channel provenance, not as the terrace axis.
  g(-37.7871700, 144.9826600),
  g(-37.7875900, 144.9826100),
  g(-37.7875300, 144.9828100),
  g(-37.7872400, 144.9828500)
];

const OSM_CENTRAL_GARDEN_BED_GEO = [
  g(-37.7874750, 144.9823039),
  g(-37.7874706, 144.9823136),
  g(-37.7874639, 144.9823211),
  g(-37.7874557, 144.9823254),
  g(-37.7874468, 144.9823262),
  g(-37.7874382, 144.9823233),
  g(-37.7874308, 144.9823170),
  g(-37.7874254, 144.9823081),
  g(-37.7874225, 144.9822975),
  g(-37.7874225, 144.9822862),
  g(-37.7874254, 144.9822753),
  g(-37.7874311, 144.9822662),
  g(-37.7874388, 144.9822599),
  g(-37.7874477, 144.9822573),
  g(-37.7874568, 144.9822585),
  g(-37.7874651, 144.9822634),
  g(-37.7874716, 144.9822716),
  g(-37.7874756, 144.9822817),
  g(-37.7874767, 144.9822928),
  g(-37.7874750, 144.9823039)
];

const PLAYGROUND_FENCE_SOURCE =
  "OSM playground way 24489879; Edinburgh Gardens CMP 2004 section 3.4.22 and current public playground guides confirm the south playground is safety-gated and fully fenced; gate vertices are inferred from current access paths because no public gate nodes were found";
const SOUTH_PLAYGROUND_LAYOUT_SOURCE =
  "OSM way 24489879 current playground footprint; Melbourne Playgrounds and Busy City Guide describe the large fenced south playground, all-abilities paths, wooden fort, rope net, sandpits, swings, toddler area, chalk walls and central shelter";
const NORTH_PLAYGROUND_LAYOUT_SOURCE =
  "OSM way 543616019 current relocated playground footprint; City of Yarra 2018 Playground Upgrade Final Concept Plan fixes the relative positions of two activity units, triple and basket swings, spinner, trampoline, nature-play margins, planted buffer, grass mound, seats and shade sails; no current public fence source was found for the relocated footprint";
const OVAL_FENCE_SOURCE =
  "OSM way 14946934 W.T. Peterson Oval footprint; OSM connector ways 403753751 and 403753754 align with fence-gate gaps; low jumpable fence height and exact gate widths are inferred from existing in-game oval fence treatment because no public barrier=fence way was available";
const FITZY_BOWL_SOURCE =
  "City of Yarra Fitzy Bowl upgrade page and Playce tender site plan 19321_003: the August 2022 build retained two connected southern bowl complexes and added the northern street extension, flat banks, quarter pipes, manual pad, curved rail, accessible transitions and timber spectator terrace";
const STRUCTURE_ACCESS_SOURCE =
  "Yarra Edinburgh Gardens facility listing; OSM building footprints; Lovell Chen Edinburgh Gardens CMP 2021 built-feature inventory and facade photographs; existing changeroom and umpire-room access only—future sports-pavilion rooms are excluded from the 2026 baseline";
const STRUCTURE_SHELTER_SOURCE =
  "Yarra Edinburgh Gardens facility listing confirms pavilion, public toilets and access-friendly park facilities; Yarra Brunswick Street Oval redevelopment confirms kiosk terrace, grandstand external stairs/gates and tennis social-space/amenity works; Yarra Emely Baker Centre venue page and venue manual confirm the gated outdoor area, dark shade sail, external play-yard doors and accessible use; Yarra Rotunda page confirms bookable shelter use but no current power";
const TREE_CHARACTER_ZONE_SOURCE =
  "3068 Group Edinburgh Gardens heritage-study summary and CMP source inventory: mature exotic-tree canopy, mostly avenue planting along the path system, remains a defining garden structure; Yarra significant-tree data gives precise species/height/diameter for source-backed specimen anchors";
const HERITAGE_FURNITURE_SOURCE =
  "Lovell Chen Edinburgh Gardens CMP 2021 sections 3.2.8 and 3.11.4: Chandler Drinking Fountain, one surviving Fitzroy Council Bollard at the Avenue B/St Georges Road entrance, consistent timber-and-steel park benches, contemporary bin enclosures and interpretive signs near early structures";
const UNSUPPORTED_FIXED_PARK_DETAIL_IDS = new Set([
  "north-lawn-dog-sign",
  "alfred-lawn-dog-sign",
  "north-playground-dog-leash-rule",
  "south-playground-dog-leash-rule",
  "oval-dog-leash-rule",
  "rotunda-stairs-no-power-rule",
  "south-picnic-alcohol-hours-rule",
  "emely-baker-access-friendly-rule",
  "freeman-gate-notice-board",
  "alfred-crescent-notice-board",
  "grandstand-interpretive-sign",
  "rotunda-interpretive-sign",
  "queen-victoria-interpretive-sign"
]);
const TABLE_TENNIS_SOURCE =
  "OpenStreetMap way 715659039 sport=table_tennis from the 2026-07-09 map API extract; Yarra northern precinct consultation confirms table-tennis activity in the northern precinct";
const RAIL_TRAIL_SOURCE =
  "OpenStreetMap Inner Circle Rail Trail ways 22760903, 1006838304 and 1103672694; OSM disused rail segment way 1006838305; OSM abandoned railway corridor way 1361023848";
const ALFRED_CRESCENT_PATH_SOURCE =
  "Edinburgh Gardens CMP 2004 Alfred Crescent path context; current OSM perimeter/sidewalk ways 1340465893, 599677908, 981948921 and 22760908 guide the rendered path corridor";
const OVAL_SOURCE =
  "OpenStreetMap way 14946934 W.T. Peterson Oval footprint; OSM pitch way 546997148 sits inside the oval sporting surface";
const GRANDSTAND_SOURCE =
  "OpenStreetMap way 403753786 building=grandstand, named Kevin Murray Stand; Lovell Chen Edinburgh Gardens CMP 2021 Figure 36; OSM amenity=parking way 1392352940 maps the adjacent stand parking apron; exact 10 July 2026 temporary construction fabric is unavailable";
const GRANDSTAND_PARKING_SOURCE =
  "OpenStreetMap way 1392352940 amenity=parking from the 2026-07-09 map API extract; painted bay layout and kerb detail are not public in OSM";
const TENNIS_SOURCE =
  "OpenStreetMap sports_centre way 24489878, tennis court ways 715802691-715802696 and mapped club building way 403753784; Fitzroy Tennis Club update 30 June 2026 records northern-court construction from May to September while three clay courts remain in use";
const TENNIS_COURT_WORKS_SOURCE =
  "OpenStreetMap tennis court ways 715802694-715802696; Fitzroy Tennis Club update 30 June 2026 records Northern Courts construction from May to September 2026; Yarra's 29 May 2026 first-sod notice confirms court construction had started";
const TENNIS_ACTIVE_COURT_SOURCE =
  "OpenStreetMap tennis court ways 715802691-715802693; Fitzroy Tennis Club update 30 June 2026 says the club was operating on three clay courts while the Northern Courts were under construction";
const BOWLING_SOURCE =
  "OpenStreetMap sports_centre way 24489838, bowls pitch ways 715802677 and 715802678 and bowling club building way 543505639";
const SKATE_SOURCE =
  "OpenStreetMap way 231049925 leisure=pitch sport=skateboard; Yarra Fitzy Bowl upgrade source";
const BASKETBALL_SOURCE =
  "OpenStreetMap way 500981577 leisure=pitch sport=basketball with two hoops; Yarra northern precinct consultation confirms basketball half-court activity";
const NORTH_TOILETS_SOURCE =
  "OpenStreetMap way 307404819 amenity=toilets/building=yes fixes the current footprint; City of Yarra new-toilets project page supplies the dimensioned north-block upgrade plan and current as-built photograph; Yarra 2021-22 Annual Report confirms the upgraded facility was completed and open; the as-built photograph controls the charcoal corrugated walls, external grey door banks, accessible ramp, twin stainless basins, perforated upper screens, exposed dark steel frame and alternating opaque/translucent skillion roof, superseding the proposal render's red finish; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.4 and Figure 146 document the earlier facility";
const OSM_CENTRAL_GARDEN_BED_SOURCE =
  "OpenStreetMap way 715802699 leisure=garden from the 2026-07-09 map API extract";
const SOUTH_EAST_PITCH_SOURCE =
  "OpenStreetMap way 242003500 leisure=pitch from the 2026-07-09 map API extract; sport/use is untagged, so rendered as open-grass pitch/lawn rather than marked sport lines";

const GARDEN_BED_SOURCE =
  "Edinburgh Gardens CMP 2004 sections 3.4.13 and 4.2.16-4.2.20; Lovell Chen 2021 CMP sections 3.8.1-3.8.3 and Queen Victoria/stormwater filtration garden descriptions; hand-placed where no public GIS vertices were available";
const RAINGARDEN_SOURCE =
  "Lovell Chen 2021 CMP Figure 96 and stormwater filtration garden description; Landezine/GHD and Atlan design notes for the 700 sqm four-terrace treatment-bed orientation and zig-zag low-flow channel; OSM way 655160879 maps the raingarden water/wetland feature but is not used as the whole terrace envelope; OSM way 655160878 maps the east-side underground storage footprint";
const ST_GEORGES_DISPLAY_BED_ANGLE = 1.84;
const SHRUB_PLANTER_SOURCE =
  "Edinburgh Gardens CMP 2004 sections 4.2.18-4.2.19; Lovell Chen 2021 CMP sections 3.8.2-3.8.3; hand-placed from Rowe Street, north-east Elm Circle and current OSM path-corridor context because no public GIS vertices were available";
const BLUESTONE_PLANTER_RADIUS = 5 * WORLD_SCALE;
const ROWE_ENTRANCE_PLANTER_RADIUS = 2.5 * WORLD_SCALE;
const CRICKET_NET_LANE_COUNT = 4;
const CRICKET_NET_CAGE_WIDTH = 12.4;
const CRICKET_NET_CAGE_LENGTH = 14.8;
const CRICKET_NET_FRONT_LOBBY_LENGTH = 2.55;

const NORTH_TOILETS_GEO = [
  g(-37.7859240, 144.9821748),
  g(-37.7858822, 144.9822878),
  g(-37.7859429, 144.9823238),
  g(-37.7859848, 144.9822108),
  g(-37.7859240, 144.9821748)
];

const RAIL_TRAIL_GEO = [
  g(-37.7899444, 144.9822003),
  g(-37.7899244, 144.9822066),
  g(-37.7898414, 144.9822215),
  g(-37.7888655, 144.9823904),
  g(-37.7886143, 144.9824314),
  g(-37.7883253, 144.9826882),
  g(-37.7882437, 144.9827528),
  g(-37.7881877, 144.9827850),
  g(-37.7881230, 144.9828125),
  g(-37.7880542, 144.9828299),
  g(-37.7877248, 144.9828935),
  g(-37.7875565, 144.9829185),
  g(-37.7874355, 144.9829439),
  g(-37.7873744, 144.9829594),
  g(-37.7872754, 144.9829903),
  g(-37.7871891, 144.9830227),
  g(-37.7871106, 144.9830592),
  g(-37.7870231, 144.9831070),
  g(-37.7867519, 144.9832799),
  g(-37.7866853, 144.9833360),
  g(-37.7866155, 144.9833911),
  g(-37.7865559, 144.9834413),
  g(-37.7865207, 144.9834734),
  g(-37.7864878, 144.9835046),
  g(-37.7863763, 144.9836267),
  g(-37.7861855, 144.9838569),
  g(-37.7859581, 144.9841329),
  g(-37.7857849, 144.9843470),
  g(-37.7857044, 144.9844439),
  g(-37.7856436, 144.9845177),
  g(-37.7855758, 144.9845932)
];

const ALFRED_CRESCENT_PATH_GEO = [
  g(-37.78939, 144.98354),
  g(-37.78900, 144.98433),
  g(-37.78841, 144.98515),
  g(-37.78750, 144.98564),
  g(-37.78653, 144.98547),
  g(-37.78595, 144.98492),
  g(-37.78563, 144.98431)
];

const OVAL_EAST_DRAIN_GEO = [
  g(-37.78840, 144.98191),
  g(-37.78857, 144.98203),
  g(-37.78887, 144.98212),
  g(-37.78918, 144.98210),
  g(-37.78945, 144.98196)
];

const ALFRED_CRESCENT_RETAINING_WALL_GEO = [
  g(-37.78944, 144.98345),
  g(-37.78919, 144.98400),
  g(-37.78883, 144.98458),
  g(-37.78838, 144.98510),
  g(-37.78772, 144.98546)
];

type OsmTreeGeo = { osmId: number; point: GeoPoint };

type RedevelopmentRemovedTreeGeo = {
  treePlanNumber: number;
  commonName: string;
  point: GeoPoint;
};

// Urban Forestry Victoria Tree Protection and Management Plan (v1.0,
// 02/07/2025; published by Yarra in 2026), plan sheets TPP-A and TPP-B.
// The PDF leader endpoints were georeferenced from plan trees 21, 24 and 34
// to OSM nodes 5365392009, 5365392011 and 5365393284 (0.766 game-unit RMS),
// then transferred between sheets through their duplicated tree 41 anchor.
// See docs/research/2026-physical-baseline-object-audit-2026-07-10.md.
const REDEVELOPMENT_REMOVED_TREES_GEO: RedevelopmentRemovedTreeGeo[] = [
  { treePlanNumber: 8, commonName: "English Elm", point: g(-37.7881386, 144.9825934) },
  { treePlanNumber: 9, commonName: "English Elm", point: g(-37.7881595, 144.982323) },
  { treePlanNumber: 10, commonName: "English Elm", point: g(-37.7881908, 144.9820546) },
  { treePlanNumber: 12, commonName: "Lilly-Pilly", point: g(-37.7883759, 144.9823169) },
  { treePlanNumber: 13, commonName: "Brush Box", point: g(-37.788416, 144.9823264) },
  { treePlanNumber: 14, commonName: "Chilean Willow", point: g(-37.7884892, 144.9822447) },
  { treePlanNumber: 15, commonName: "Chilean Willow", point: g(-37.788545, 144.9822168) },
  { treePlanNumber: 16, commonName: "Variegated Pittosporum", point: g(-37.7886005, 144.9822257) },
  { treePlanNumber: 17, commonName: "Variegated Pittosporum", point: g(-37.7886248, 144.9822319) },
  { treePlanNumber: 18, commonName: "English Elm", point: g(-37.7883679, 144.9822744) },
  { treePlanNumber: 19, commonName: "Weeping Lilly-Pilly", point: g(-37.7884133, 144.9822531) },
  { treePlanNumber: 20, commonName: "Weeping Lilly-Pilly", point: g(-37.7884429, 144.982248) },
  { treePlanNumber: 21, commonName: "Weeping Lilly-Pilly", point: g(-37.7884735, 144.9822119) },
  { treePlanNumber: 22, commonName: "Weeping Lilly-Pilly", point: g(-37.7885041, 144.9822053) },
  { treePlanNumber: 23, commonName: "Weeping Lilly-Pilly", point: g(-37.7885407, 144.9821845) },
  { treePlanNumber: 24, commonName: "Jacaranda", point: g(-37.7886325, 144.9822042) },
  { treePlanNumber: 25, commonName: "Jacaranda", point: g(-37.7885905, 144.9820828) },
  { treePlanNumber: 26, commonName: "Jacaranda", point: g(-37.7885712, 144.9820289) },
  { treePlanNumber: 27, commonName: "Jacaranda", point: g(-37.7885487, 144.9819688) },
  { treePlanNumber: 28, commonName: "Jacaranda", point: g(-37.788508, 144.9819453) },
  { treePlanNumber: 29, commonName: "Jacaranda", point: g(-37.7884661, 144.9819694) },
  { treePlanNumber: 30, commonName: "Jacaranda", point: g(-37.7884243, 144.9819865) },
  { treePlanNumber: 31, commonName: "Jacaranda", point: g(-37.7884037, 144.9819363) },
  { treePlanNumber: 32, commonName: "Jacaranda", point: g(-37.788411, 144.9818044) },
  { treePlanNumber: 33, commonName: "Jacaranda", point: g(-37.7884486, 144.9817774) },
  { treePlanNumber: 34, commonName: "Jacaranda", point: g(-37.7884655, 144.9817283) },
  { treePlanNumber: 52, commonName: "English Elm", point: g(-37.7883088, 144.9806667) },
  { treePlanNumber: 53, commonName: "Sweet Pittosporum", point: g(-37.7882643, 144.9807492) },
  { treePlanNumber: 54, commonName: "Sweet Pittosporum", point: g(-37.7882509, 144.9806411) },
  { treePlanNumber: 55, commonName: "Narrow-leaved Black Peppermint", point: g(-37.7882371, 144.9806144) },
  { treePlanNumber: 56, commonName: "Brittle Gum", point: g(-37.7882307, 144.9805406) },
  { treePlanNumber: 58, commonName: "Brittle Gum", point: g(-37.7881948, 144.9803914) },
  { treePlanNumber: 60, commonName: "English Elm", point: g(-37.7883489, 144.9804934) },
  { treePlanNumber: 61, commonName: "English Elm", point: g(-37.7883931, 144.9806003) },
  { treePlanNumber: 62, commonName: "English Elm", point: g(-37.7884425, 144.9807055) },
  { treePlanNumber: 63, commonName: "Pin Oak", point: g(-37.7886256, 144.9807222) },
  { treePlanNumber: 64, commonName: "Pin Oak", point: g(-37.7886353, 144.9806156) },
  { treePlanNumber: 65, commonName: "Chinese Elm", point: g(-37.7885503, 144.9804355) },
  { treePlanNumber: 66, commonName: "Pin Oak", point: g(-37.788695, 144.9803828) }
];

const REDEVELOPMENT_REMOVED_TREE_NODE_IDS = new Set<number>([
  5365392008,
  5365392009,
  5365392010,
  5365392011,
  5365393282,
  5365393283,
  5365393284
]);

const OSM_TREE_GEO: OsmTreeGeo[] = [
  { osmId: 5365391973, point: g(-37.7883498, 144.9829196) },
  { osmId: 5365391974, point: g(-37.7882993, 144.9830167) },
  { osmId: 5365391975, point: g(-37.7882872, 144.9831444) },
  { osmId: 5365391976, point: g(-37.7883033, 144.9832237) },
  { osmId: 5365391977, point: g(-37.7883417, 144.9833310) },
  { osmId: 5365391978, point: g(-37.7884043, 144.9833949) },
  { osmId: 5365391979, point: g(-37.7887193, 144.9824878) },
  { osmId: 5365391980, point: g(-37.7888082, 144.9824724) },
  { osmId: 5365391981, point: g(-37.7888849, 144.9824699) },
  { osmId: 5365391982, point: g(-37.7889637, 144.9824878) },
  { osmId: 5365391983, point: g(-37.7890384, 144.9825184) },
  { osmId: 5365391984, point: g(-37.7891131, 144.9825695) },
  { osmId: 5365391985, point: g(-37.7891817, 144.9826334) },
  { osmId: 5365391986, point: g(-37.7892484, 144.9827050) },
  { osmId: 5365391987, point: g(-37.7893009, 144.9827944) },
  { osmId: 5365391988, point: g(-37.7893372, 144.9828710) },
  { osmId: 5365391989, point: g(-37.7893897, 144.9829809) },
  { osmId: 5365391990, point: g(-37.7894160, 144.9830933) },
  { osmId: 5365391991, point: g(-37.7894200, 144.9831879) },
  { osmId: 5365391992, point: g(-37.7896704, 144.9823038) },
  { osmId: 5365391993, point: g(-37.7895856, 144.9823140) },
  { osmId: 5365391994, point: g(-37.7894866, 144.9823345) },
  { osmId: 5365391995, point: g(-37.7893917, 144.9823447) },
  { osmId: 5365391996, point: g(-37.7893049, 144.9823549) },
  { osmId: 5365391997, point: g(-37.7892140, 144.9823651) },
  { osmId: 5365391998, point: g(-37.7891292, 144.9823804) },
  { osmId: 5365391999, point: g(-37.7896280, 144.9821837) },
  { osmId: 5365392000, point: g(-37.7895513, 144.9821990) },
  { osmId: 5365392001, point: g(-37.7894281, 144.9822169) },
  { osmId: 5365392002, point: g(-37.7893473, 144.9822297) },
  { osmId: 5365392003, point: g(-37.7892060, 144.9822604) },
  { osmId: 5365392004, point: g(-37.7889515, 144.9822961) },
  { osmId: 5365392005, point: g(-37.7888728, 144.9823217) },
  { osmId: 5365392006, point: g(-37.7887536, 144.9823447) },
  { osmId: 5365392007, point: g(-37.7886850, 144.9823166) },
  { osmId: 5365392008, point: g(-37.7885053, 144.9823421) },
  { osmId: 5365392009, point: g(-37.7884709, 144.9822195) },
  { osmId: 5365392010, point: g(-37.7884548, 144.9820917) },
  { osmId: 5365392011, point: g(-37.7886325, 144.9821965) },
  { osmId: 5365392012, point: g(-37.7887880, 144.9821914) },
  { osmId: 5365392013, point: g(-37.7889111, 144.9821939) },
  { osmId: 5365392014, point: g(-37.7890020, 144.9821914) },
  { osmId: 5365392015, point: g(-37.7890949, 144.9821811) },
  { osmId: 5365392016, point: g(-37.7891999, 144.9821658) },
  { osmId: 5365392017, point: g(-37.7892928, 144.9821479) },
  { osmId: 5365392018, point: g(-37.7894079, 144.9821096) },
  { osmId: 5365392019, point: g(-37.7895068, 144.9819972) },
  { osmId: 5365392020, point: g(-37.7896926, 144.9817314) },
  { osmId: 5365393221, point: g(-37.7897189, 144.9816446) },
  { osmId: 5365393222, point: g(-37.7897451, 144.9815398) },
  { osmId: 5365393223, point: g(-37.7897471, 144.9814018) },
  { osmId: 5365393224, point: g(-37.7897249, 144.9812255) },
  { osmId: 5365393225, point: g(-37.7897148, 144.9811182) },
  { osmId: 5365393226, point: g(-37.7896966, 144.9809930) },
  { osmId: 5365393227, point: g(-37.7896906, 144.9808984) },
  { osmId: 5365393228, point: g(-37.7896825, 144.9808116) },
  { osmId: 5365393229, point: g(-37.7896522, 144.9806455) },
  { osmId: 5365393230, point: g(-37.7894988, 144.9803235) },
  { osmId: 5365393231, point: g(-37.7891732, 144.9802473) },
  { osmId: 5365393232, point: g(-37.7889422, 144.9802646) },
  { osmId: 5365393233, point: g(-37.7888723, 144.9802780) },
  { osmId: 5365393234, point: g(-37.7887993, 144.9802915) },
  { osmId: 5365393235, point: g(-37.7887340, 144.9803165) },
  { osmId: 5365393236, point: g(-37.7885212, 144.9804704) },
  { osmId: 5365393237, point: g(-37.7884300, 144.9806165) },
  { osmId: 5365393238, point: g(-37.7883951, 144.9807088) },
  { osmId: 5365393239, point: g(-37.7882461, 144.9803665) },
  { osmId: 5365393240, point: g(-37.7882553, 144.9804819) },
  { osmId: 5365393241, point: g(-37.7882765, 144.9806127) },
  { osmId: 5365393242, point: g(-37.7883267, 144.9808896) },
  { osmId: 5365393243, point: g(-37.7882993, 144.9811627) },
  { osmId: 5365393244, point: g(-37.7882082, 144.9811761) },
  { osmId: 5365393245, point: g(-37.7883632, 144.9810281) },
  { osmId: 5365393246, point: g(-37.7882006, 144.9808357) },
  { osmId: 5365393247, point: g(-37.7881534, 144.9809204) },
  { osmId: 5365393248, point: g(-37.7881048, 144.9809877) },
  { osmId: 5365393249, point: g(-37.7882264, 144.9809915) },
  { osmId: 5365393250, point: g(-37.7881823, 144.9810857) },
  { osmId: 5365393251, point: g(-37.7881975, 144.9806627) },
  { osmId: 5365393252, point: g(-37.7881580, 144.9805146) },
  { osmId: 5365393253, point: g(-37.7885835, 144.9802857) },
  { osmId: 5365393254, point: g(-37.7886550, 144.9802569) },
  { osmId: 5365393255, point: g(-37.7887568, 144.9802357) },
  { osmId: 5365393256, point: g(-37.7888541, 144.9802184) },
  { osmId: 5365393257, point: g(-37.7889300, 144.9802050) },
  { osmId: 5365393258, point: g(-37.7890106, 144.9801954) },
  { osmId: 5365393259, point: g(-37.7890881, 144.9801780) },
  { osmId: 5365393260, point: g(-37.7891702, 144.9801627) },
  { osmId: 5365393261, point: g(-37.7892993, 144.9801454) },
  { osmId: 5365393262, point: g(-37.7893738, 144.9801261) },
  { osmId: 5365393263, point: g(-37.7894331, 144.9801184) },
  { osmId: 5365393264, point: g(-37.7894893, 144.9801069) },
  { osmId: 5365393268, point: g(-37.7897294, 144.9806281) },
  { osmId: 5365393269, point: g(-37.7897355, 144.9807454) },
  { osmId: 5365393270, point: g(-37.7897553, 144.9809281) },
  { osmId: 5365393271, point: g(-37.7897644, 144.9810165) },
  { osmId: 5365393272, point: g(-37.7897644, 144.9810915) },
  { osmId: 5365393273, point: g(-37.7897765, 144.9811954) },
  { osmId: 5365393274, point: g(-37.7897872, 144.9812800) },
  { osmId: 5365393275, point: g(-37.7897963, 144.9813838) },
  { osmId: 5365393276, point: g(-37.7898069, 144.9814781) },
  { osmId: 5365393277, point: g(-37.7898130, 144.9815838) },
  { osmId: 5365393278, point: g(-37.7898100, 144.9817261) },
  { osmId: 5365393279, point: g(-37.7895890, 144.9820845) },
  { osmId: 5365393280, point: g(-37.7898237, 144.9821761) },
  { osmId: 5365393281, point: g(-37.7897522, 144.9820723) },
  { osmId: 5365393282, point: g(-37.7883575, 144.9818114) },
  { osmId: 5365393283, point: g(-37.7884819, 144.9818076) },
  { osmId: 5365393284, point: g(-37.7884680, 144.9817284) },
  { osmId: 5365393285, point: g(-37.7886332, 144.9825490) },
  { osmId: 5365393286, point: g(-37.7885654, 144.9825886) },
  { osmId: 5365393287, point: g(-37.7885602, 144.9835939) },
  { osmId: 5365393288, point: g(-37.7887114, 144.9835345) },
  { osmId: 5365393289, point: g(-37.7888800, 144.9834685) },
  { osmId: 5365393290, point: g(-37.7888922, 144.9836159) },
  { osmId: 5365393291, point: g(-37.7890017, 144.9834399) },
  { osmId: 5365393292, point: g(-37.7892451, 144.9834685) },
  { osmId: 5365393293, point: g(-37.7892573, 144.9833475) },
  { osmId: 5365393294, point: g(-37.7893755, 144.9832925) },
  { osmId: 5365393295, point: g(-37.7893599, 144.9834443) },
  { osmId: 5365393296, point: g(-37.7893216, 144.9836731) },
  { osmId: 5365393297, point: g(-37.7892764, 144.9837853) },
  { osmId: 5365393298, point: g(-37.7892051, 144.9839349) },
  { osmId: 5365393299, point: g(-37.7891356, 144.9840691) },
  { osmId: 5365393300, point: g(-37.7890487, 144.9842231) },
  { osmId: 9345277530, point: g(-37.7898375, 144.9820903) }
];

type VicmapTreeGeo = { objectId: number; point: GeoPoint; height: number; canopyRadius: number; dense: boolean };

const VICMAP_TREE_GEO: VicmapTreeGeo[] = [
  { objectId: 1706456, point: g(-37.7854978, 144.9831358), height: 11.28, canopyRadius: 6.15, dense: false },
  { objectId: 1707819, point: g(-37.7857522, 144.9842610), height: 21.23, canopyRadius: 10.60, dense: false },
  { objectId: 1707868, point: g(-37.7854824, 144.9833423), height: 12.34, canopyRadius: 5.22, dense: false },
  { objectId: 1709131, point: g(-37.7860828, 144.9849362), height: 10.58, canopyRadius: 5.02, dense: false },
  { objectId: 1709210, point: g(-37.7859344, 144.9830552), height: 26.62, canopyRadius: 5.37, dense: false },
  { objectId: 1710538, point: g(-37.7859958, 144.9839075), height: 20.20, canopyRadius: 7.77, dense: false },
  { objectId: 1711897, point: g(-37.7857464, 144.9822098), height: 16.21, canopyRadius: 8.85, dense: false },
  { objectId: 1711927, point: g(-37.7860933, 144.9830742), height: 9.15, canopyRadius: 2.55, dense: false },
  { objectId: 1711932, point: g(-37.7855845, 144.9839896), height: 13.06, canopyRadius: 8.60, dense: false },
  { objectId: 1714545, point: g(-37.7854935, 144.9834391), height: 10.93, canopyRadius: 5.23, dense: false },
  { objectId: 1720275, point: g(-37.7856484, 144.9824095), height: 14.04, canopyRadius: 5.85, dense: false },
  { objectId: 1767242, point: g(-37.7860472, 144.9827513), height: 20.51, canopyRadius: 6.37, dense: false },
  { objectId: 1772088, point: g(-37.7860736, 144.9846372), height: 15.82, canopyRadius: 6.38, dense: true },
  { objectId: 1772097, point: g(-37.7855194, 144.9838194), height: 13.04, canopyRadius: 7.13, dense: false },
  { objectId: 1772099, point: g(-37.7856789, 144.9825552), height: 12.44, canopyRadius: 5.65, dense: false },
  { objectId: 1773453, point: g(-37.7859081, 144.9832053), height: 28.70, canopyRadius: 7.75, dense: false },
  { objectId: 1773468, point: g(-37.7860963, 144.9844061), height: 17.90, canopyRadius: 4.15, dense: true },
  { objectId: 1773767, point: g(-37.7855226, 144.9830312), height: 11.08, canopyRadius: 3.20, dense: false },
  { objectId: 1777474, point: g(-37.7855535, 144.9827039), height: 10.66, canopyRadius: 5.70, dense: false },
  { objectId: 1780812, point: g(-37.7860855, 144.9847226), height: 16.79, canopyRadius: 4.02, dense: true },
  { objectId: 1782194, point: g(-37.7860892, 144.9832043), height: 14.73, canopyRadius: 4.23, dense: false },
  { objectId: 1783296, point: g(-37.7856612, 144.9830780), height: 22.10, canopyRadius: 4.08, dense: false },
  { objectId: 1783489, point: g(-37.7860249, 144.9836853), height: 10.05, canopyRadius: 7.20, dense: false },
  { objectId: 1784652, point: g(-37.7858594, 144.9827019), height: 20.80, canopyRadius: 6.75, dense: false },
  { objectId: 1786165, point: g(-37.7857226, 144.9827152), height: 19.53, canopyRadius: 6.12, dense: false },
  { objectId: 1786199, point: g(-37.7858918, 144.9844122), height: 22.67, canopyRadius: 7.27, dense: false },
  { objectId: 1787212, point: g(-37.7855610, 144.9840675), height: 12.72, canopyRadius: 3.13, dense: false },
  { objectId: 1787496, point: g(-37.7860923, 144.9848082), height: 16.83, canopyRadius: 6.15, dense: false },
  { objectId: 1787515, point: g(-37.7859415, 144.9820785), height: 5.80, canopyRadius: 4.05, dense: false },
  { objectId: 1788845, point: g(-37.7855057, 144.9829647), height: 12.05, canopyRadius: 6.78, dense: false },
  { objectId: 1788855, point: g(-37.7859783, 144.9817527), height: 13.64, canopyRadius: 8.55, dense: false },
  { objectId: 1789933, point: g(-37.7857939, 144.9845636), height: 24.97, canopyRadius: 10.05, dense: false },
  { objectId: 1790212, point: g(-37.7855280, 144.9837186), height: 11.01, canopyRadius: 3.87, dense: false },
  { objectId: 1790283, point: g(-37.7856884, 144.9831664), height: 25.58, canopyRadius: 10.07, dense: false },
  { objectId: 1791267, point: g(-37.7857950, 144.9823885), height: 16.97, canopyRadius: 5.75, dense: false },
  { objectId: 1792614, point: g(-37.7855257, 144.9828211), height: 11.23, canopyRadius: 5.78, dense: false },
  { objectId: 1792891, point: g(-37.7860448, 144.9822687), height: 6.69, canopyRadius: 4.15, dense: false },
  { objectId: 1792936, point: g(-37.7855021, 144.9835995), height: 14.28, canopyRadius: 5.77, dense: false },
  { objectId: 1792940, point: g(-37.7857578, 144.9840326), height: 13.74, canopyRadius: 8.18, dense: false },
  { objectId: 2233566, point: g(-37.7870652, 144.9854954), height: 8.68, canopyRadius: 4.75, dense: false },
  { objectId: 2233592, point: g(-37.7887285, 144.9846122), height: 8.95, canopyRadius: 5.33, dense: false },
  { objectId: 2233595, point: g(-37.7884272, 144.9850127), height: 8.04, canopyRadius: 3.30, dense: false },
  { objectId: 2233605, point: g(-37.7871526, 144.9831226), height: 11.56, canopyRadius: 3.62, dense: false },
  { objectId: 2233622, point: g(-37.7889349, 144.9843227), height: 9.07, canopyRadius: 5.05, dense: false },
  { objectId: 2233644, point: g(-37.7886744, 144.9824748), height: 11.39, canopyRadius: 4.28, dense: false },
  { objectId: 2234951, point: g(-37.7896081, 144.9806388), height: 8.56, canopyRadius: 5.70, dense: false },
  { objectId: 2234964, point: g(-37.7885198, 144.9848927), height: 6.91, canopyRadius: 3.13, dense: false },
  { objectId: 2234967, point: g(-37.7862271, 144.9834430), height: 26.31, canopyRadius: 9.38, dense: false },
  { objectId: 2235214, point: g(-37.7867310, 144.9841856), height: 21.72, canopyRadius: 5.93, dense: true },
  { objectId: 2237910, point: g(-37.7864389, 144.9823647), height: 0.24, canopyRadius: 5.52, dense: false },
  { objectId: 2237914, point: g(-37.7895162, 144.9801144), height: 8.93, canopyRadius: 8.15, dense: false },
  { objectId: 2237917, point: g(-37.7891361, 144.9801792), height: 10.42, canopyRadius: 4.60, dense: false },
  { objectId: 2237944, point: g(-37.7889298, 144.9824969), height: 9.87, canopyRadius: 3.30, dense: false },
  { objectId: 2238993, point: g(-37.7879670, 144.9828989), height: 9.73, canopyRadius: 3.15, dense: false },
  { objectId: 2238997, point: g(-37.7886275, 144.9847631), height: 7.55, canopyRadius: 4.80, dense: false },
  { objectId: 2238998, point: g(-37.7891061, 144.9823989), height: 12.02, canopyRadius: 5.82, dense: false },
  { objectId: 2239010, point: g(-37.7882961, 144.9808073), height: 7.19, canopyRadius: 4.85, dense: false },
  { objectId: 2239019, point: g(-37.7889079, 144.9839016), height: 6.05, canopyRadius: 3.98, dense: false },
  { objectId: 2239236, point: g(-37.7883073, 144.9810654), height: 12.79, canopyRadius: 4.10, dense: false },
  { objectId: 2239268, point: g(-37.7882665, 144.9806310), height: 11.26, canopyRadius: 4.97, dense: false },
  { objectId: 2239290, point: g(-37.7880969, 144.9812772), height: 13.75, canopyRadius: 3.70, dense: false },
  { objectId: 2239297, point: g(-37.7877556, 144.9847624), height: 26.63, canopyRadius: 9.90, dense: true },
  { objectId: 2240601, point: g(-37.7864910, 144.9853038), height: 8.80, canopyRadius: 5.90, dense: false },
  { objectId: 2241717, point: g(-37.7897931, 144.9818108), height: 15.62, canopyRadius: 7.62, dense: false },
  { objectId: 2241720, point: g(-37.7890014, 144.9825210), height: 13.18, canopyRadius: 4.35, dense: false },
  { objectId: 2241722, point: g(-37.7898164, 144.9815938), height: 11.54, canopyRadius: 4.30, dense: false },
  { objectId: 2241728, point: g(-37.7888432, 144.9824668), height: 12.67, canopyRadius: 4.50, dense: false },
  { objectId: 2241905, point: g(-37.7879666, 144.9818514), height: 10.54, canopyRadius: 4.40, dense: true },
  { objectId: 2241907, point: g(-37.7882307, 144.9828247), height: 12.20, canopyRadius: 4.85, dense: false },
  { objectId: 2243032, point: g(-37.7881085, 144.9852684), height: 7.48, canopyRadius: 3.40, dense: false },
  { objectId: 2243038, point: g(-37.7871379, 144.9855309), height: 7.16, canopyRadius: 4.30, dense: true },
  { objectId: 2243039, point: g(-37.7889034, 144.9839545), height: 5.47, canopyRadius: 1.60, dense: false },
  { objectId: 2243051, point: g(-37.7878323, 144.9828498), height: 12.05, canopyRadius: 4.05, dense: false },
  { objectId: 2243057, point: g(-37.7893929, 144.9822554), height: 9.91, canopyRadius: 3.55, dense: false },
  { objectId: 2243061, point: g(-37.7868069, 144.9854371), height: 9.67, canopyRadius: 4.40, dense: false },
  { objectId: 2243080, point: g(-37.7884117, 144.9805805), height: 12.28, canopyRadius: 6.02, dense: false },
  { objectId: 2245953, point: g(-37.7865544, 144.9830327), height: 11.35, canopyRadius: 4.75, dense: true },
  { objectId: 2245960, point: g(-37.7866939, 144.9854135), height: 10.48, canopyRadius: 5.27, dense: false },
  { objectId: 2245981, point: g(-37.7864330, 144.9829389), height: 13.03, canopyRadius: 5.18, dense: false },
  { objectId: 2246028, point: g(-37.7893658, 144.9829897), height: 10.92, canopyRadius: 5.00, dense: false },
  { objectId: 2247065, point: g(-37.7896453, 144.9823127), height: 10.82, canopyRadius: 3.73, dense: false },
  { objectId: 2247094, point: g(-37.7892932, 144.9823797), height: 14.27, canopyRadius: 4.05, dense: false },
  { objectId: 2247100, point: g(-37.7895599, 144.9820862), height: 13.50, canopyRadius: 5.87, dense: false },
  { objectId: 2247102, point: g(-37.7883116, 144.9833131), height: 7.10, canopyRadius: 2.82, dense: false },
  { objectId: 2247109, point: g(-37.7882665, 144.9832331), height: 11.25, canopyRadius: 3.78, dense: false },
  { objectId: 2247128, point: g(-37.7887657, 144.9824638), height: 10.33, canopyRadius: 4.27, dense: false },
  { objectId: 2247329, point: g(-37.7892676, 144.9801484), height: 9.88, canopyRadius: 4.43, dense: false },
  { objectId: 2247375, point: g(-37.7878262, 144.9854129), height: 11.37, canopyRadius: 5.07, dense: false },
  { objectId: 2247380, point: g(-37.7880602, 144.9828952), height: 13.06, canopyRadius: 3.62, dense: false },
  { objectId: 2247387, point: g(-37.7893121, 144.9822446), height: 10.72, canopyRadius: 5.00, dense: false },
  { objectId: 2247389, point: g(-37.7865875, 144.9827263), height: 21.16, canopyRadius: 5.78, dense: true },
  { objectId: 2247398, point: g(-37.7881369, 144.9803768), height: 15.50, canopyRadius: 5.28, dense: false },
  { objectId: 2248459, point: g(-37.7868185, 144.9850627), height: 16.29, canopyRadius: 5.77, dense: true },
  { objectId: 2248465, point: g(-37.7869434, 144.9854601), height: 7.59, canopyRadius: 5.12, dense: false },
  { objectId: 2248467, point: g(-37.7861906, 144.9850757), height: 10.53, canopyRadius: 3.90, dense: false },
  { objectId: 2248470, point: g(-37.7897032, 144.9815850), height: 13.10, canopyRadius: 5.60, dense: false },
  { objectId: 2248475, point: g(-37.7888355, 144.9823041), height: 9.89, canopyRadius: 5.75, dense: false },
  { objectId: 2248478, point: g(-37.7896445, 144.9808689), height: 7.38, canopyRadius: 4.92, dense: false },
  { objectId: 2248522, point: g(-37.7884423, 144.9817629), height: 12.19, canopyRadius: 6.00, dense: false },
  { objectId: 2248701, point: g(-37.7882737, 144.9830461), height: 13.40, canopyRadius: 4.82, dense: false },
  { objectId: 2248719, point: g(-37.7880262, 144.9810929), height: 15.51, canopyRadius: 4.60, dense: false },
  { objectId: 2248729, point: g(-37.7883839, 144.9827218), height: 13.25, canopyRadius: 3.75, dense: false },
  { objectId: 2248740, point: g(-37.7894825, 144.9803072), height: 6.97, canopyRadius: 5.10, dense: false },
  { objectId: 2248741, point: g(-37.7891802, 144.9822805), height: 10.08, canopyRadius: 5.17, dense: false },
  { objectId: 2249825, point: g(-37.7868647, 144.9853652), height: 9.91, canopyRadius: 4.82, dense: false },
  { objectId: 2251130, point: g(-37.7866747, 144.9830272), height: 22.29, canopyRadius: 4.28, dense: true },
  { objectId: 2251178, point: g(-37.7879655, 144.9853381), height: 13.51, canopyRadius: 6.30, dense: false },
  { objectId: 2252489, point: g(-37.7877610, 144.9826547), height: 20.66, canopyRadius: 3.85, dense: false },
  { objectId: 2252515, point: g(-37.7887195, 144.9823442), height: 12.70, canopyRadius: 5.95, dense: false },
  { objectId: 2252516, point: g(-37.7883085, 144.9851352), height: 5.00, canopyRadius: 3.20, dense: false },
  { objectId: 2252522, point: g(-37.7892141, 144.9827071), height: 9.40, canopyRadius: 3.93, dense: false },
  { objectId: 2252538, point: g(-37.7883059, 144.9828999), height: 8.57, canopyRadius: 4.80, dense: false },
  { objectId: 2252543, point: g(-37.7882075, 144.9822843), height: 0.91, canopyRadius: 11.15, dense: false },
  { objectId: 2252544, point: g(-37.7897607, 144.9821307), height: 8.73, canopyRadius: 8.23, dense: false },
  { objectId: 2252546, point: g(-37.7892374, 144.9838279), height: 13.11, canopyRadius: 6.38, dense: false },
  { objectId: 2252550, point: g(-37.7897170, 144.9814177), height: 9.83, canopyRadius: 5.03, dense: false },
  { objectId: 2252753, point: g(-37.7875379, 144.9855252), height: 5.65, canopyRadius: 3.27, dense: false },
  { objectId: 2252758, point: g(-37.7885477, 144.9802884), height: 7.67, canopyRadius: 5.30, dense: false },
  { objectId: 2252831, point: g(-37.7876956, 144.9854686), height: 9.45, canopyRadius: 4.03, dense: false },
  { objectId: 2253098, point: g(-37.7893681, 144.9819626), height: 0.14, canopyRadius: 4.63, dense: false },
  { objectId: 2253101, point: g(-37.7874902, 144.9823708), height: 19.51, canopyRadius: 6.43, dense: true },
  { objectId: 2253106, point: g(-37.7876854, 144.9813475), height: 20.19, canopyRadius: 4.70, dense: true },
  { objectId: 2253111, point: g(-37.7897091, 144.9807746), height: 10.90, canopyRadius: 4.82, dense: false },
  { objectId: 2253113, point: g(-37.7896139, 144.9803752), height: 8.81, canopyRadius: 4.58, dense: false },
  { objectId: 2253121, point: g(-37.7872473, 144.9833943), height: 9.64, canopyRadius: 6.15, dense: true },
  { objectId: 2253126, point: g(-37.7890391, 144.9821725), height: 12.20, canopyRadius: 5.03, dense: false },
  { objectId: 2253127, point: g(-37.7884127, 144.9821385), height: 19.09, canopyRadius: 7.05, dense: false },
  { objectId: 2253128, point: g(-37.7884229, 144.9822864), height: 15.69, canopyRadius: 4.50, dense: false },
  { objectId: 2253134, point: g(-37.7894089, 144.9820580), height: 9.35, canopyRadius: 3.65, dense: false },
  { objectId: 2253141, point: g(-37.7868113, 144.9830081), height: 22.69, canopyRadius: 6.75, dense: true },
  { objectId: 2253143, point: g(-37.7875010, 144.9839983), height: 20.88, canopyRadius: 3.90, dense: true },
  { objectId: 2253147, point: g(-37.7867343, 144.9840662), height: 21.04, canopyRadius: 4.53, dense: true },
  { objectId: 2253153, point: g(-37.7866874, 144.9810879), height: 12.15, canopyRadius: 4.45, dense: true },
  { objectId: 2253154, point: g(-37.7888368, 144.9844594), height: 6.53, canopyRadius: 3.53, dense: false },
  { objectId: 2253157, point: g(-37.7881491, 144.9827679), height: 12.03, canopyRadius: 3.87, dense: false },
  { objectId: 2253159, point: g(-37.7864076, 144.9844044), height: 18.62, canopyRadius: 7.28, dense: true },
  { objectId: 2253863, point: g(-37.7883671, 144.9850836), height: 7.26, canopyRadius: 4.15, dense: false },
  { objectId: 2253869, point: g(-37.7895259, 144.9819429), height: 11.26, canopyRadius: 4.88, dense: false },
  { objectId: 2253886, point: g(-37.7884943, 144.9804840), height: 8.14, canopyRadius: 7.80, dense: false },
  { objectId: 2253887, point: g(-37.7875672, 144.9853637), height: 6.54, canopyRadius: 2.53, dense: false },
  { objectId: 2253904, point: g(-37.7895853, 144.9828617), height: 5.47, canopyRadius: 2.82, dense: false },
  { objectId: 2253911, point: g(-37.7877385, 144.9827654), height: 20.12, canopyRadius: 4.05, dense: false },
  { objectId: 2253918, point: g(-37.7881214, 144.9806009), height: 14.32, canopyRadius: 4.55, dense: false },
  { objectId: 2254135, point: g(-37.7892719, 144.9827919), height: 10.30, canopyRadius: 4.30, dense: false },
  { objectId: 2254152, point: g(-37.7896661, 144.9825785), height: 6.61, canopyRadius: 2.45, dense: false },
  { objectId: 2254168, point: g(-37.7873696, 144.9844828), height: 17.69, canopyRadius: 4.47, dense: true },
  { objectId: 2254174, point: g(-37.7865797, 144.9833477), height: 7.76, canopyRadius: 2.90, dense: false },
  { objectId: 2254177, point: g(-37.7864131, 144.9840653), height: 19.55, canopyRadius: 6.38, dense: true },
  { objectId: 2254190, point: g(-37.7877910, 144.9829639), height: 9.41, canopyRadius: 2.22, dense: false },
  { objectId: 2298153, point: g(-37.7886785, 144.9846885), height: 6.68, canopyRadius: 3.93, dense: false },
  { objectId: 2298159, point: g(-37.7882466, 144.9827300), height: 8.36, canopyRadius: 4.82, dense: false },
  { objectId: 2298163, point: g(-37.7883431, 144.9818139), height: 9.80, canopyRadius: 2.53, dense: false },
  { objectId: 2298164, point: g(-37.7873670, 144.9828068), height: 1.14, canopyRadius: 5.03, dense: false },
  { objectId: 2298165, point: g(-37.7864243, 144.9817202), height: 18.08, canopyRadius: 2.08, dense: true },
  { objectId: 2298169, point: g(-37.7861753, 144.9820233), height: 21.42, canopyRadius: 6.23, dense: true },
  { objectId: 2299766, point: g(-37.7897044, 144.9806861), height: 10.78, canopyRadius: 4.50, dense: false },
  { objectId: 2299773, point: g(-37.7872376, 144.9815101), height: 17.02, canopyRadius: 3.63, dense: true },
  { objectId: 2299777, point: g(-37.7863919, 144.9851708), height: 13.40, canopyRadius: 5.50, dense: false },
  { objectId: 2301075, point: g(-37.7889206, 144.9823006), height: 11.59, canopyRadius: 5.42, dense: false },
  { objectId: 2301080, point: g(-37.7890152, 144.9824037), height: 7.36, canopyRadius: 3.97, dense: false },
  { objectId: 2301090, point: g(-37.7889242, 144.9836161), height: 15.85, canopyRadius: 2.35, dense: true },
  { objectId: 2301099, point: g(-37.7877995, 144.9850354), height: 21.03, canopyRadius: 5.15, dense: true },
  { objectId: 2301109, point: g(-37.7871889, 144.9813224), height: 17.51, canopyRadius: 5.78, dense: true },
  { objectId: 2301120, point: g(-37.7875038, 144.9831375), height: 26.24, canopyRadius: 6.03, dense: false },
  { objectId: 2301129, point: g(-37.7872049, 144.9810500), height: 19.70, canopyRadius: 6.45, dense: true },
  { objectId: 2301134, point: g(-37.7891182, 144.9802683), height: 5.98, canopyRadius: 1.98, dense: false },
  { objectId: 2301137, point: g(-37.7861306, 144.9830709), height: 8.45, canopyRadius: 2.58, dense: false },
  { objectId: 2301139, point: g(-37.7880549, 144.9837970), height: 20.48, canopyRadius: 6.32, dense: true },
  { objectId: 2301142, point: g(-37.7869098, 144.9847598), height: 21.72, canopyRadius: 3.80, dense: true },
  { objectId: 2301146, point: g(-37.7891920, 144.9823892), height: 11.73, canopyRadius: 3.37, dense: false },
  { objectId: 2302238, point: g(-37.7888549, 144.9833596), height: 11.88, canopyRadius: 6.87, dense: true },
  { objectId: 2302245, point: g(-37.7873998, 144.9812979), height: 17.73, canopyRadius: 8.07, dense: true },
  { objectId: 2302251, point: g(-37.7875421, 144.9845576), height: 9.70, canopyRadius: 5.23, dense: true },
  { objectId: 2302263, point: g(-37.7878896, 144.9854055), height: 10.18, canopyRadius: 2.60, dense: false },
  { objectId: 2302456, point: g(-37.7871679, 144.9833067), height: 1.48, canopyRadius: 6.08, dense: false },
  { objectId: 2302460, point: g(-37.7865548, 144.9840274), height: 13.81, canopyRadius: 2.98, dense: true },
  { objectId: 2302465, point: g(-37.7894568, 144.9820374), height: 11.51, canopyRadius: 5.38, dense: false },
  { objectId: 2302471, point: g(-37.7872415, 144.9840803), height: 7.65, canopyRadius: 2.48, dense: true },
  { objectId: 2302472, point: g(-37.7882387, 144.9836858), height: 15.69, canopyRadius: 4.75, dense: true },
  { objectId: 2302484, point: g(-37.7869952, 144.9833506), height: 10.53, canopyRadius: 6.92, dense: true },
  { objectId: 2302486, point: g(-37.7880748, 144.9817740), height: 12.45, canopyRadius: 4.90, dense: true },
  { objectId: 2302489, point: g(-37.7873354, 144.9854069), height: 19.73, canopyRadius: 6.25, dense: true },
  { objectId: 2302490, point: g(-37.7875347, 144.9829953), height: 11.30, canopyRadius: 5.00, dense: false },
  { objectId: 2302497, point: g(-37.7868828, 144.9812109), height: 21.53, canopyRadius: 5.02, dense: true },
  { objectId: 2302501, point: g(-37.7882596, 144.9812001), height: 13.32, canopyRadius: 4.95, dense: false },
  { objectId: 2302506, point: g(-37.7866160, 144.9822617), height: 19.77, canopyRadius: 6.77, dense: true },
  { objectId: 2302516, point: g(-37.7867579, 144.9850456), height: 10.96, canopyRadius: 2.10, dense: true },
  { objectId: 2302519, point: g(-37.7887030, 144.9834115), height: 8.44, canopyRadius: 6.60, dense: true },
  { objectId: 2302521, point: g(-37.7883085, 144.9825257), height: 23.89, canopyRadius: 6.08, dense: false },
  { objectId: 2302523, point: g(-37.7897534, 144.9810459), height: 9.97, canopyRadius: 4.02, dense: false },
  { objectId: 2303578, point: g(-37.7885981, 144.9825223), height: 7.99, canopyRadius: 2.75, dense: false },
  { objectId: 2303589, point: g(-37.7875824, 144.9813321), height: 19.77, canopyRadius: 4.15, dense: true },
  { objectId: 2303590, point: g(-37.7890078, 144.9842123), height: 11.58, canopyRadius: 6.22, dense: false },
  { objectId: 2303599, point: g(-37.7872159, 144.9816362), height: 13.65, canopyRadius: 4.07, dense: true },
  { objectId: 2303604, point: g(-37.7862029, 144.9815842), height: 22.38, canopyRadius: 11.07, dense: true },
  { objectId: 2303606, point: g(-37.7888666, 144.9838084), height: 7.63, canopyRadius: 3.93, dense: false },
  { objectId: 2303624, point: g(-37.7891865, 144.9833296), height: 16.29, canopyRadius: 6.97, dense: true },
  { objectId: 2303626, point: g(-37.7897286, 144.9809415), height: 10.55, canopyRadius: 5.72, dense: false },
  { objectId: 2303627, point: g(-37.7881503, 144.9818146), height: 6.92, canopyRadius: 3.02, dense: false },
  { objectId: 2303631, point: g(-37.7867022, 144.9826909), height: 12.70, canopyRadius: 4.10, dense: true },
  { objectId: 2303641, point: g(-37.7882271, 144.9803828), height: 7.84, canopyRadius: 5.65, dense: false },
  { objectId: 2303645, point: g(-37.7877905, 144.9841965), height: 14.85, canopyRadius: 6.95, dense: true },
  { objectId: 2303647, point: g(-37.7862500, 144.9840431), height: 17.02, canopyRadius: 7.72, dense: true },
  { objectId: 2303653, point: g(-37.7877991, 144.9833310), height: 5.45, canopyRadius: 3.10, dense: false },
  { objectId: 2303848, point: g(-37.7863070, 144.9820271), height: 20.83, canopyRadius: 5.35, dense: true },
  { objectId: 2303852, point: g(-37.7878898, 144.9829175), height: 9.09, canopyRadius: 3.77, dense: false },
  { objectId: 2303861, point: g(-37.7880892, 144.9813791), height: 7.01, canopyRadius: 4.00, dense: false },
  { objectId: 2303866, point: g(-37.7891683, 144.9835073), height: 16.82, canopyRadius: 1.90, dense: true },
  { objectId: 2303868, point: g(-37.7869598, 144.9814734), height: 18.82, canopyRadius: 4.40, dense: true },
  { objectId: 2303873, point: g(-37.7882844, 144.9829595), height: 9.57, canopyRadius: 3.15, dense: false },
  { objectId: 2304944, point: g(-37.7867154, 144.9820115), height: 20.90, canopyRadius: 6.48, dense: true },
  { objectId: 2304960, point: g(-37.7862086, 144.9826770), height: 20.17, canopyRadius: 6.58, dense: false },
  { objectId: 2304962, point: g(-37.7896602, 144.9809979), height: 7.72, canopyRadius: 3.38, dense: false },
  { objectId: 2304985, point: g(-37.7867841, 144.9826801), height: 19.81, canopyRadius: 5.83, dense: true },
  { objectId: 2304990, point: g(-37.7875952, 144.9818972), height: 18.40, canopyRadius: 8.28, dense: true },
  { objectId: 2304995, point: g(-37.7875072, 144.9816793), height: 17.44, canopyRadius: 7.40, dense: true },
  { objectId: 2305023, point: g(-37.7867077, 144.9825357), height: 18.92, canopyRadius: 4.23, dense: true },
  { objectId: 2305026, point: g(-37.7872587, 144.9825559), height: 5.03, canopyRadius: 2.38, dense: false },
  { objectId: 2305186, point: g(-37.7869688, 144.9819977), height: 20.80, canopyRadius: 4.20, dense: true },
  { objectId: 2305190, point: g(-37.7863002, 144.9851312), height: 11.74, canopyRadius: 7.20, dense: false },
  { objectId: 2305195, point: g(-37.7891255, 144.9821639), height: 12.84, canopyRadius: 4.90, dense: false },
  { objectId: 2305198, point: g(-37.7883681, 144.9834047), height: 9.99, canopyRadius: 2.93, dense: false },
  { objectId: 2305213, point: g(-37.7876146, 144.9816367), height: 19.91, canopyRadius: 5.15, dense: true },
  { objectId: 2305219, point: g(-37.7890790, 144.9833149), height: 0.11, canopyRadius: 4.85, dense: true },
  { objectId: 2306331, point: g(-37.7881631, 144.9809081), height: 14.25, canopyRadius: 9.20, dense: false },
  { objectId: 2306333, point: g(-37.7880807, 144.9850409), height: 0.13, canopyRadius: 4.77, dense: true },
  { objectId: 2306335, point: g(-37.7890909, 144.9836178), height: 14.04, canopyRadius: 2.18, dense: false },
  { objectId: 2306341, point: g(-37.7868683, 144.9817052), height: 16.20, canopyRadius: 7.85, dense: true },
  { objectId: 2306342, point: g(-37.7875567, 144.9843556), height: 13.49, canopyRadius: 2.65, dense: true },
  { objectId: 2306498, point: g(-37.7861504, 144.9823323), height: 5.36, canopyRadius: 3.37, dense: false },
  { objectId: 2306505, point: g(-37.7896162, 144.9826888), height: 7.45, canopyRadius: 2.72, dense: false },
  { objectId: 2306507, point: g(-37.7864214, 144.9827615), height: 22.78, canopyRadius: 5.73, dense: false },
  { objectId: 2306522, point: g(-37.7872610, 144.9847480), height: 7.20, canopyRadius: 5.55, dense: true },
  { objectId: 2306529, point: g(-37.7869719, 144.9816496), height: 8.55, canopyRadius: 2.73, dense: true },
  { objectId: 2306555, point: g(-37.7895527, 144.9823249), height: 8.55, canopyRadius: 3.50, dense: false },
  { objectId: 2306557, point: g(-37.7898025, 144.9814942), height: 10.67, canopyRadius: 4.78, dense: false },
  { objectId: 2306567, point: g(-37.7874537, 144.9851317), height: 13.18, canopyRadius: 10.85, dense: true },
  { objectId: 2306573, point: g(-37.7881415, 144.9816416), height: 6.85, canopyRadius: 4.08, dense: true },
  { objectId: 2307694, point: g(-37.7878143, 144.9813212), height: 26.49, canopyRadius: 7.48, dense: true },
  { objectId: 2307876, point: g(-37.7877988, 144.9848935), height: 15.60, canopyRadius: 5.45, dense: true },
  { objectId: 2307891, point: g(-37.7868717, 144.9849545), height: 12.81, canopyRadius: 3.98, dense: true },
  { objectId: 2307903, point: g(-37.7885700, 144.9848283), height: 6.16, canopyRadius: 3.80, dense: false },
  { objectId: 2307904, point: g(-37.7885529, 144.9824844), height: 14.23, canopyRadius: 3.25, dense: false },
  { objectId: 2307905, point: g(-37.7879506, 144.9836800), height: 0.26, canopyRadius: 6.63, dense: true },
  { objectId: 2307910, point: g(-37.7876897, 144.9830728), height: 5.94, canopyRadius: 3.48, dense: false },
  { objectId: 2307918, point: g(-37.7873319, 144.9819674), height: 19.13, canopyRadius: 3.63, dense: true },
  { objectId: 2307926, point: g(-37.7896806, 144.9810871), height: 7.24, canopyRadius: 2.68, dense: false },
  { objectId: 2307931, point: g(-37.7886602, 144.9835409), height: 15.37, canopyRadius: 6.35, dense: true },
  { objectId: 2307932, point: g(-37.7872088, 144.9816965), height: 13.27, canopyRadius: 2.93, dense: true },
  { objectId: 2307938, point: g(-37.7874104, 144.9829964), height: 13.24, canopyRadius: 6.75, dense: false },
  { objectId: 2307943, point: g(-37.7897705, 144.9812794), height: 12.03, canopyRadius: 6.45, dense: false },
  { objectId: 2307949, point: g(-37.7872811, 144.9840264), height: 19.87, canopyRadius: 2.80, dense: true },
  { objectId: 2308990, point: g(-37.7879608, 144.9823779), height: 0.42, canopyRadius: 9.85, dense: false },
  { objectId: 2309045, point: g(-37.7872036, 144.9854173), height: 19.05, canopyRadius: 6.92, dense: true },
  { objectId: 2309048, point: g(-37.7887527, 144.9822615), height: 11.51, canopyRadius: 2.98, dense: false },
  { objectId: 2309049, point: g(-37.7886260, 144.9836225), height: 14.25, canopyRadius: 1.72, dense: true },
  { objectId: 2309197, point: g(-37.7875093, 144.9836699), height: 24.37, canopyRadius: 3.33, dense: true },
  { objectId: 2309202, point: g(-37.7889719, 144.9840605), height: 5.12, canopyRadius: 3.10, dense: false },
  { objectId: 2309205, point: g(-37.7894611, 144.9823422), height: 9.81, canopyRadius: 4.05, dense: false },
  { objectId: 2309215, point: g(-37.7888844, 144.9843984), height: 8.78, canopyRadius: 4.35, dense: false },
  { objectId: 2309216, point: g(-37.7891519, 144.9839926), height: 12.87, canopyRadius: 4.72, dense: false },
  { objectId: 2309256, point: g(-37.7895307, 144.9821949), height: 9.96, canopyRadius: 6.25, dense: false },
  { objectId: 2309257, point: g(-37.7866783, 144.9828170), height: 15.11, canopyRadius: 4.57, dense: true },
  { objectId: 2309271, point: g(-37.7880762, 144.9836698), height: 11.69, canopyRadius: 5.40, dense: true },
  { objectId: 2309272, point: g(-37.7870380, 144.9841136), height: 16.57, canopyRadius: 9.98, dense: true },
  { objectId: 2309273, point: g(-37.7864250, 144.9842086), height: 20.75, canopyRadius: 6.77, dense: true },
  { objectId: 2309282, point: g(-37.7867090, 144.9822955), height: 19.00, canopyRadius: 3.45, dense: true },
  { objectId: 2309285, point: g(-37.7875327, 144.9850620), height: 11.82, canopyRadius: 4.12, dense: true },
  { objectId: 2309292, point: g(-37.7864192, 144.9825799), height: 21.73, canopyRadius: 6.43, dense: false },
  { objectId: 2309294, point: g(-37.7873050, 144.9811069), height: 0.09, canopyRadius: 4.03, dense: false },
  { objectId: 2309309, point: g(-37.7891269, 144.9822439), height: 8.05, canopyRadius: 1.93, dense: false },
  { objectId: 2309310, point: g(-37.7872586, 144.9852630), height: 19.90, canopyRadius: 8.25, dense: true },
  { objectId: 2309311, point: g(-37.7867136, 144.9837466), height: 20.42, canopyRadius: 5.38, dense: true },
  { objectId: 2309319, point: g(-37.7866929, 144.9813018), height: 14.88, canopyRadius: 2.23, dense: true },
  { objectId: 2309323, point: g(-37.7862641, 144.9844980), height: 15.07, canopyRadius: 8.93, dense: true },
  { objectId: 2309326, point: g(-37.7893463, 144.9821148), height: 13.02, canopyRadius: 6.15, dense: false },
  { objectId: 2310362, point: g(-37.7884783, 144.9823649), height: 12.68, canopyRadius: 6.52, dense: false },
  { objectId: 2310388, point: g(-37.7874735, 144.9827624), height: 0.74, canopyRadius: 5.20, dense: false },
  { objectId: 2310390, point: g(-37.7867383, 144.9823770), height: 18.74, canopyRadius: 5.52, dense: true },
  { objectId: 2310391, point: g(-37.7871527, 144.9808669), height: 6.27, canopyRadius: 2.45, dense: false },
  { objectId: 2310394, point: g(-37.7869715, 144.9830991), height: 10.45, canopyRadius: 4.10, dense: false },
  { objectId: 2310396, point: g(-37.7893842, 144.9831142), height: 8.56, canopyRadius: 3.55, dense: false },
  { objectId: 2310397, point: g(-37.7889424, 144.9821002), height: 12.62, canopyRadius: 9.92, dense: false },
  { objectId: 2310398, point: g(-37.7895460, 144.9801982), height: 8.07, canopyRadius: 3.60, dense: false },
  { objectId: 2310403, point: g(-37.7868885, 144.9821243), height: 20.42, canopyRadius: 10.45, dense: true },
  { objectId: 2310406, point: g(-37.7874033, 144.9831595), height: 23.31, canopyRadius: 8.18, dense: false },
  { objectId: 2310409, point: g(-37.7879002, 144.9828156), height: 8.48, canopyRadius: 3.72, dense: false },
  { objectId: 2310416, point: g(-37.7889940, 144.9839594), height: 8.32, canopyRadius: 2.70, dense: false },
  { objectId: 2310423, point: g(-37.7866949, 144.9821574), height: 20.34, canopyRadius: 5.25, dense: true },
  { objectId: 2310445, point: g(-37.7874830, 144.9849481), height: 13.30, canopyRadius: 11.00, dense: true },
  { objectId: 2310547, point: g(-37.7896636, 144.9817229), height: 13.02, canopyRadius: 5.65, dense: false },
  { objectId: 2310553, point: g(-37.7875416, 144.9846882), height: 11.32, canopyRadius: 6.13, dense: true },
  { objectId: 2310554, point: g(-37.7879872, 144.9828132), height: 14.42, canopyRadius: 3.95, dense: false },
  { objectId: 2310560, point: g(-37.7887843, 144.9845283), height: 6.63, canopyRadius: 4.17, dense: false },
  { objectId: 2310562, point: g(-37.7885979, 144.9822731), height: 18.33, canopyRadius: 2.50, dense: false },
  { objectId: 2310568, point: g(-37.7890606, 144.9801892), height: 10.01, canopyRadius: 3.70, dense: false },
  { objectId: 2310580, point: g(-37.7896314, 144.9822336), height: 8.96, canopyRadius: 1.72, dense: false },
  { objectId: 2310628, point: g(-37.7896024, 144.9819369), height: 7.68, canopyRadius: 4.20, dense: false },
  { objectId: 2310632, point: g(-37.7881420, 144.9828584), height: 6.89, canopyRadius: 2.63, dense: false },
  { objectId: 2310633, point: g(-37.7875848, 144.9842078), height: 17.36, canopyRadius: 6.28, dense: true },
  { objectId: 2310637, point: g(-37.7867244, 144.9829037), height: 19.03, canopyRadius: 2.68, dense: true },
  { objectId: 2310641, point: g(-37.7874679, 144.9847509), height: 10.23, canopyRadius: 2.60, dense: true },
  { objectId: 2310645, point: g(-37.7880864, 144.9827639), height: 0.10, canopyRadius: 4.00, dense: false },
  { objectId: 2310650, point: g(-37.7868024, 144.9844351), height: 20.46, canopyRadius: 2.98, dense: true },
  { objectId: 2310653, point: g(-37.7864113, 144.9813344), height: 9.47, canopyRadius: 3.98, dense: true },
  { objectId: 2310659, point: g(-37.7890876, 144.9825834), height: 5.44, canopyRadius: 1.63, dense: false },
  { objectId: 2310660, point: g(-37.7883451, 144.9809570), height: 12.17, canopyRadius: 4.98, dense: false },
  { objectId: 2310661, point: g(-37.7871727, 144.9830102), height: 6.33, canopyRadius: 3.68, dense: false },
  { objectId: 2310664, point: g(-37.7885742, 144.9836489), height: 19.11, canopyRadius: 3.47, dense: true },
  { objectId: 2310671, point: g(-37.7877293, 144.9840182), height: 21.71, canopyRadius: 5.60, dense: true },
  { objectId: 2310674, point: g(-37.7870041, 144.9836916), height: 16.50, canopyRadius: 2.83, dense: true },
  { objectId: 2310675, point: g(-37.7869414, 144.9809504), height: 9.42, canopyRadius: 2.98, dense: false },
  { objectId: 2310701, point: g(-37.7867083, 144.9833635), height: 10.00, canopyRadius: 3.97, dense: true },
  { objectId: 2311738, point: g(-37.7880551, 144.9815435), height: 7.51, canopyRadius: 5.70, dense: true },
  { objectId: 2311768, point: g(-37.7867886, 144.9843640), height: 17.63, canopyRadius: 3.03, dense: true },
  { objectId: 2311771, point: g(-37.7891728, 144.9802464), height: 8.87, canopyRadius: 6.42, dense: false },
  { objectId: 2311775, point: g(-37.7870742, 144.9850756), height: 21.12, canopyRadius: 5.67, dense: true },
  { objectId: 2311782, point: g(-37.7878077, 144.9836754), height: 5.25, canopyRadius: 3.43, dense: true },
  { objectId: 2311798, point: g(-37.7874783, 144.9828821), height: 8.05, canopyRadius: 4.28, dense: false },
  { objectId: 2311800, point: g(-37.7883982, 144.9826334), height: 7.50, canopyRadius: 3.60, dense: false },
  { objectId: 2311913, point: g(-37.7864261, 144.9837243), height: 1.94, canopyRadius: 5.63, dense: true },
  { objectId: 2311919, point: g(-37.7870600, 144.9831632), height: 7.43, canopyRadius: 2.63, dense: false },
  { objectId: 2311921, point: g(-37.7876237, 144.9836645), height: 17.10, canopyRadius: 3.82, dense: true },
  { objectId: 2311934, point: g(-37.7872672, 144.9828453), height: 1.32, canopyRadius: 4.07, dense: false },
  { objectId: 2311940, point: g(-37.7868102, 144.9825238), height: 19.92, canopyRadius: 4.73, dense: true },
  { objectId: 2311952, point: g(-37.7895859, 144.9829718), height: 5.17, canopyRadius: 2.65, dense: false },
  { objectId: 2311980, point: g(-37.7871053, 144.9816023), height: 18.09, canopyRadius: 11.10, dense: true },
  { objectId: 2311981, point: g(-37.7893747, 144.9823473), height: 10.60, canopyRadius: 3.63, dense: false },
  { objectId: 2311995, point: g(-37.7887554, 144.9821791), height: 12.34, canopyRadius: 5.78, dense: false },
  { objectId: 2311998, point: g(-37.7868010, 144.9833252), height: 15.63, canopyRadius: 10.77, dense: true },
  { objectId: 2312008, point: g(-37.7872131, 144.9817890), height: 14.13, canopyRadius: 7.50, dense: true },
  { objectId: 2312009, point: g(-37.7883965, 144.9825324), height: 19.00, canopyRadius: 4.70, dense: false },
  { objectId: 2312012, point: g(-37.7866165, 144.9812380), height: 18.45, canopyRadius: 9.90, dense: true },
  { objectId: 2312014, point: g(-37.7878143, 144.9826390), height: 21.74, canopyRadius: 2.70, dense: false },
  { objectId: 2312017, point: g(-37.7884652, 144.9824964), height: 14.29, canopyRadius: 4.60, dense: false },
  { objectId: 2312022, point: g(-37.7884762, 144.9819556), height: 0.52, canopyRadius: 4.78, dense: false },
  { objectId: 2312023, point: g(-37.7882631, 144.9831395), height: 7.53, canopyRadius: 4.90, dense: false },
  { objectId: 2312024, point: g(-37.7897533, 144.9811487), height: 10.58, canopyRadius: 4.60, dense: false },
  { objectId: 2312028, point: g(-37.7893803, 144.9833067), height: 17.17, canopyRadius: 3.67, dense: true },
  { objectId: 2313288, point: g(-37.7876707, 144.9844121), height: 15.22, canopyRadius: 10.85, dense: true },
  { objectId: 2313298, point: g(-37.7869850, 144.9832288), height: 10.22, canopyRadius: 3.30, dense: false },
  { objectId: 2313306, point: g(-37.7896618, 144.9805936), height: 9.50, canopyRadius: 2.10, dense: false },
  { objectId: 2313311, point: g(-37.7871598, 144.9807843), height: 6.68, canopyRadius: 5.40, dense: false },
  { objectId: 2313317, point: g(-37.7871368, 144.9809689), height: 2.77, canopyRadius: 4.85, dense: true },
  { objectId: 2313321, point: g(-37.7874640, 144.9835212), height: 23.91, canopyRadius: 10.55, dense: true },
  { objectId: 2313331, point: g(-37.7885285, 144.9805620), height: 8.14, canopyRadius: 2.20, dense: false },
  { objectId: 2313338, point: g(-37.7862022, 144.9843816), height: 18.83, canopyRadius: 2.95, dense: true },
  { objectId: 2313342, point: g(-37.7888643, 144.9821739), height: 10.80, canopyRadius: 4.08, dense: false },
  { objectId: 2313348, point: g(-37.7862681, 144.9823893), height: 4.22, canopyRadius: 4.30, dense: false },
  { objectId: 2313351, point: g(-37.7896521, 144.9804230), height: 11.16, canopyRadius: 3.25, dense: false },
  { objectId: 2313358, point: g(-37.7892991, 144.9836735), height: 11.50, canopyRadius: 5.37, dense: false },
  { objectId: 2314677, point: g(-37.7887983, 144.9836564), height: 19.21, canopyRadius: 4.65, dense: true },
  { objectId: 2314678, point: g(-37.7883692, 144.9836772), height: 18.57, canopyRadius: 4.52, dense: true },
  { objectId: 2314682, point: g(-37.7868676, 144.9854786), height: 8.40, canopyRadius: 3.63, dense: false },
  { objectId: 2314685, point: g(-37.7885257, 144.9826072), height: 9.78, canopyRadius: 2.75, dense: false },
  { objectId: 2314695, point: g(-37.7881863, 144.9810516), height: 13.05, canopyRadius: 5.10, dense: false },
  { objectId: 2314707, point: g(-37.7897780, 144.9824022), height: 5.41, canopyRadius: 2.55, dense: false },
  { objectId: 2314710, point: g(-37.7882699, 144.9812492), height: 13.60, canopyRadius: 2.15, dense: false },
  { objectId: 2314716, point: g(-37.7861775, 144.9832263), height: 19.60, canopyRadius: 6.98, dense: false },
  { objectId: 2314720, point: g(-37.7872444, 144.9853827), height: 18.53, canopyRadius: 2.10, dense: true },
  { objectId: 2314731, point: g(-37.7875120, 144.9837981), height: 24.73, canopyRadius: 5.60, dense: true },
  { objectId: 2314737, point: g(-37.7872227, 144.9820374), height: 19.91, canopyRadius: 6.50, dense: true },
  { objectId: 2314740, point: g(-37.7865746, 144.9824752), height: 7.64, canopyRadius: 3.13, dense: false },
  { objectId: 2314747, point: g(-37.7893516, 144.9822617), height: 10.64, canopyRadius: 2.03, dense: false },
  { objectId: 2316042, point: g(-37.7896969, 144.9825066), height: 6.44, canopyRadius: 4.10, dense: false },
  { objectId: 2316044, point: g(-37.7896806, 144.9805340), height: 8.64, canopyRadius: 2.40, dense: false },
  { objectId: 2316047, point: g(-37.7880411, 144.9809909), height: 8.92, canopyRadius: 2.05, dense: false },
  { objectId: 2316054, point: g(-37.7886160, 144.9802519), height: 10.90, canopyRadius: 4.95, dense: false },
  { objectId: 2316059, point: g(-37.7897977, 144.9818952), height: 12.03, canopyRadius: 3.68, dense: false },
  { objectId: 2316061, point: g(-37.7881856, 144.9812220), height: 11.82, canopyRadius: 4.45, dense: false },
  { objectId: 2318731, point: g(-37.7896678, 144.9812827), height: 13.02, canopyRadius: 3.08, dense: false },
  { objectId: 2319001, point: g(-37.7868690, 144.9824308), height: 19.21, canopyRadius: 4.95, dense: true },
  { objectId: 2320084, point: g(-37.7874011, 144.9836666), height: 23.81, canopyRadius: 3.80, dense: true },
  { objectId: 2320087, point: g(-37.7896844, 144.9811982), height: 12.84, canopyRadius: 6.12, dense: false },
  { objectId: 2320088, point: g(-37.7877553, 144.9828513), height: 18.70, canopyRadius: 3.15, dense: false },
  { objectId: 2320147, point: g(-37.7891025, 144.9840814), height: 11.65, canopyRadius: 5.35, dense: false }
];

const YARRA_SIGNIFICANT_TREE_GEO: Array<{
  id: string;
  commonName: string;
  genus: string;
  species: string;
  height: number;
  dbh: number;
  point: GeoPoint;
}> = [
  {
    id: "yarra-significant-102",
    commonName: "Southern Mahogany",
    genus: "Eucalyptus",
    species: "E. botryoides",
    height: 25,
    dbh: 138,
    point: g(-37.7858366053, 144.9844884312)
  },
  {
    id: "yarra-significant-103",
    commonName: "River Red Gum",
    genus: "Eucalyptus",
    species: "E. camaldulensis",
    height: 26,
    dbh: 116,
    point: g(-37.7857008209, 144.9831587112)
  },
  {
    id: "yarra-significant-104",
    commonName: "River Red Gum",
    genus: "Eucalyptus",
    species: "E. camaldulensis",
    height: 28,
    dbh: 138,
    point: g(-37.7859222421, 144.9831441739)
  },
  {
    id: "yarra-significant-106",
    commonName: "Dutch Elm",
    genus: "Ulmus",
    species: "U. x hollandica",
    height: 22,
    dbh: 92,
    point: g(-37.7866288239, 144.9823056396)
  },
  {
    id: "yarra-significant-107",
    commonName: "Dutch Elm",
    genus: "Ulmus",
    species: "U. x hollandica",
    height: 22,
    dbh: 100,
    point: g(-37.7873502467, 144.9854278005)
  },
  {
    id: "yarra-significant-108",
    commonName: "Dutch Elm",
    genus: "Ulmus",
    species: "U. x hollandica",
    height: 19,
    dbh: 78,
    point: g(-37.7860790955, 144.9847341109)
  },
  {
    id: "yarra-significant-109",
    commonName: "Dutch Elm",
    genus: "Ulmus",
    species: "U. x hollandica",
    height: 17,
    dbh: 88,
    point: g(-37.7892465359, 144.9833179164)
  },
  {
    id: "yarra-significant-110",
    commonName: "Southern Mahogany",
    genus: "Eucalyptus",
    species: "E. botryoides",
    height: 25,
    dbh: 95,
    point: g(-37.7857418976, 144.9841744538)
  },
  {
    id: "yarra-significant-111",
    commonName: "River Red Gum",
    genus: "Eucalyptus",
    species: "E. camaldulensis",
    height: 26,
    dbh: 110,
    point: g(-37.7862431157, 144.9833598188)
  },
  {
    id: "yarra-significant-112",
    commonName: "Dutch Elm",
    genus: "Ulmus",
    species: "U. x hollandica",
    height: 20,
    dbh: 118,
    point: g(-37.7863769737, 144.9825877009)
  },
  {
    id: "yarra-significant-113",
    commonName: "Dutch Elm",
    genus: "Ulmus",
    species: "U. x hollandica",
    height: 23,
    dbh: 99,
    point: g(-37.7870218646, 144.9826393902)
  },
  {
    id: "yarra-significant-114",
    commonName: "English Oak",
    genus: "Quercus",
    species: "Q. robur",
    height: 12,
    dbh: 52,
    point: g(-37.7873918358, 144.9853249846)
  },
  {
    id: "yarra-significant-115",
    commonName: "English Oak",
    genus: "Quercus",
    species: "Q. robur",
    height: 16,
    dbh: 72,
    point: g(-37.7877533481, 144.9841096638)
  },
  {
    id: "yarra-significant-116",
    commonName: "Southern Mahogany",
    genus: "Eucalyptus",
    species: "E. botryoides",
    height: 28,
    dbh: 113,
    point: g(-37.7877304782, 144.9846137153)
  },
  {
    id: "yarra-significant-117",
    commonName: "Dutch Elm",
    genus: "Ulmus",
    species: "U. x hollandica",
    height: 23,
    dbh: 77,
    point: g(-37.7873405126, 144.9820294332)
  },
  {
    id: "yarra-significant-118",
    commonName: "Dutch Elm",
    genus: "Ulmus",
    species: "U. x hollandica",
    height: 20,
    dbh: 69,
    point: g(-37.7868820810, 144.9824288227)
  },
  {
    id: "yarra-significant-119",
    commonName: "Holm Oak",
    genus: "Quercus",
    species: "Q. ilex",
    height: 20,
    dbh: 145,
    point: g(-37.7868481480, 144.9817116590)
  },
  {
    id: "yarra-significant-120",
    commonName: "Holm Oak",
    genus: "Quercus",
    species: "Q. ilex",
    height: 20,
    dbh: 177,
    point: g(-37.7874208202, 144.9813439310)
  },
  {
    id: "yarra-significant-121",
    commonName: "Southern Mahogany",
    genus: "Eucalyptus",
    species: "E. botryoides",
    height: 28,
    dbh: 136,
    point: g(-37.7862337910, 144.9816394821)
  }
];

const VICMAP_ELEVATION_GEO: Array<{ point: GeoPoint; altitude: number; source: "contour" | "spot" }> = [
  { point: g(-37.7898216, 144.9815629), altitude: 27, source: "contour" },
  { point: g(-37.7897703, 144.9809658), altitude: 27, source: "contour" },
  { point: g(-37.7897515, 144.98205), altitude: 27, source: "contour" },
  { point: g(-37.7895272, 144.9828217), altitude: 27, source: "contour" },
  { point: g(-37.7894279, 144.9820278), altitude: 27, source: "contour" },
  { point: g(-37.7894119, 144.9833594), altitude: 27, source: "contour" },
  { point: g(-37.7890504, 144.9820306), altitude: 27, source: "contour" },
  { point: g(-37.7889814, 144.9808313), altitude: 27.8, source: "spot" },
  { point: g(-37.7897291, 144.9813931), altitude: 28, source: "contour" },
  { point: g(-37.7896585, 144.980864), altitude: 28, source: "contour" },
  { point: g(-37.7896429, 144.9818831), altitude: 28, source: "contour" },
  { point: g(-37.7894534, 144.9804106), altitude: 28, source: "contour" },
  { point: g(-37.789266, 144.9820917), altitude: 28, source: "contour" },
  { point: g(-37.7892416, 144.983857), altitude: 28, source: "contour" },
  { point: g(-37.7890755, 144.9803068), altitude: 28, source: "contour" },
  { point: g(-37.7890311, 144.9842635), altitude: 28, source: "contour" },
  { point: g(-37.7889611, 144.9835068), altitude: 28, source: "contour" },
  { point: g(-37.7888646, 144.9821222), altitude: 28, source: "contour" },
  { point: g(-37.7888148, 144.98), altitude: 28, source: "contour" },
  { point: g(-37.7885626, 144.9834577), altitude: 28, source: "contour" },
  { point: g(-37.7885251, 144.981835), altitude: 28, source: "contour" },
  { point: g(-37.7884102, 144.9807959), altitude: 28, source: "contour" },
  { point: g(-37.7883978, 144.9813272), altitude: 28, source: "contour" },
  { point: g(-37.7883912, 144.9832148), altitude: 28, source: "contour" },
  { point: g(-37.7883848, 144.9823335), altitude: 28, source: "contour" },
  { point: g(-37.7882633, 144.9803988), altitude: 28, source: "contour" },
  { point: g(-37.7882281, 144.9828723), altitude: 28, source: "contour" },
  { point: g(-37.7881771, 144.9809646), altitude: 28, source: "contour" },
  { point: g(-37.7897705, 144.9813125), altitude: 29, source: "contour" },
  { point: g(-37.7897477, 144.9818225), altitude: 29, source: "contour" },
  { point: g(-37.7896679, 144.9806596), altitude: 29, source: "contour" },
  { point: g(-37.7894671, 144.9821442), altitude: 29, source: "contour" },
  { point: g(-37.7893958, 144.9803002), altitude: 29, source: "contour" },
  { point: g(-37.789069, 144.9821963), altitude: 29, source: "contour" },
  { point: g(-37.7887395, 144.9803103), altitude: 29, source: "contour" },
  { point: g(-37.7886852, 144.9820836), altitude: 29, source: "contour" },
  { point: g(-37.7886251, 144.9845289), altitude: 29, source: "contour" },
  { point: g(-37.788526, 144.9850065), altitude: 29, source: "contour" },
  { point: g(-37.7884231, 144.9817221), altitude: 29, source: "contour" },
  { point: g(-37.788399, 144.980639), altitude: 29, source: "contour" },
  { point: g(-37.7883847, 144.9840963), altitude: 29, source: "contour" },
  { point: g(-37.7883401, 144.9812059), altitude: 29, source: "contour" },
  { point: g(-37.7879779, 144.9840621), altitude: 29, source: "contour" },
  { point: g(-37.7879195, 144.98104), altitude: 29, source: "contour" },
  { point: g(-37.7877897, 144.9804691), altitude: 29, source: "contour" },
  { point: g(-37.7877459, 144.9815088), altitude: 29, source: "contour" },
  { point: g(-37.7877383, 144.9819876), altitude: 29, source: "contour" },
  { point: g(-37.7876682, 144.9837595), altitude: 29, source: "contour" },
  { point: g(-37.7875979, 144.9834109), altitude: 29, source: "contour" },
  { point: g(-37.7875394, 144.9828255), altitude: 29, source: "contour" },
  { point: g(-37.7874724, 144.9823342), altitude: 29, source: "contour" },
  { point: g(-37.7880942, 144.9844219), altitude: 29.6, source: "spot" },
  { point: g(-37.7887246, 144.9822957), altitude: 30, source: "contour" },
  { point: g(-37.7885039, 144.980331), altitude: 30, source: "contour" },
  { point: g(-37.7884459, 144.9819689), altitude: 30, source: "contour" },
  { point: g(-37.7883122, 144.9807497), altitude: 30, source: "contour" },
  { point: g(-37.7882936, 144.9812541), altitude: 30, source: "contour" },
  { point: g(-37.7880782, 144.9851701), altitude: 30, source: "contour" },
  { point: g(-37.7877378, 144.9849135), altitude: 30, source: "contour" },
  { point: g(-37.7875527, 144.9811653), altitude: 30, source: "contour" },
  { point: g(-37.7874699, 144.980669), altitude: 30, source: "contour" },
  { point: g(-37.7874283, 144.9846273), altitude: 30, source: "contour" },
  { point: g(-37.7873991, 144.9837467), altitude: 30, source: "contour" },
  { point: g(-37.7871838, 144.9842075), altitude: 30, source: "contour" },
  { point: g(-37.7871815, 144.9814569), altitude: 30, source: "contour" },
  { point: g(-37.7871276, 144.9833385), altitude: 30, source: "contour" },
  { point: g(-37.7870912, 144.9807713), altitude: 30, source: "contour" },
  { point: g(-37.7870724, 144.9819402), altitude: 30, source: "contour" },
  { point: g(-37.7870438, 144.9824449), altitude: 30, source: "contour" },
  { point: g(-37.787028, 144.9829456), altitude: 30, source: "contour" },
  { point: g(-37.7867244, 144.983257), altitude: 30, source: "contour" },
  { point: g(-37.7869403, 144.9835927), altitude: 30.2, source: "spot" },
  { point: g(-37.7884756, 144.9820349), altitude: 31, source: "contour" },
  { point: g(-37.7884246, 144.9802952), altitude: 31, source: "contour" },
  { point: g(-37.7871792, 144.9853708), altitude: 31, source: "contour" },
  { point: g(-37.7869243, 144.9850127), altitude: 31, source: "contour" },
  { point: g(-37.7868688, 144.9814886), altitude: 31, source: "contour" },
  { point: g(-37.7866889, 144.981925), altitude: 31, source: "contour" },
  { point: g(-37.7866565, 144.9846549), altitude: 31, source: "contour" },
  { point: g(-37.7865954, 144.9811328), altitude: 31, source: "contour" },
  { point: g(-37.786553, 144.9828498), altitude: 31, source: "contour" },
  { point: g(-37.7865282, 144.983329), altitude: 31, source: "contour" },
  { point: g(-37.7865232, 144.9823611), altitude: 31, source: "contour" },
  { point: g(-37.786414, 144.9842712), altitude: 31, source: "contour" },
  { point: g(-37.7862318, 144.9837288), altitude: 31, source: "contour" },
  { point: g(-37.7885084, 144.9821172), altitude: 32, source: "contour" },
  { point: g(-37.7869776, 144.9856254), altitude: 32, source: "contour" },
  { point: g(-37.7865919, 144.9854856), altitude: 32, source: "contour" },
  { point: g(-37.7863972, 144.981931), altitude: 32, source: "contour" },
  { point: g(-37.7862073, 144.9828715), altitude: 32, source: "contour" },
  { point: g(-37.7861898, 144.9833614), altitude: 32, source: "contour" },
  { point: g(-37.7861831, 144.9823755), altitude: 32, source: "contour" },
  { point: g(-37.7861433, 144.9815439), altitude: 32, source: "contour" },
  { point: g(-37.7859148, 144.9838401), altitude: 32, source: "contour" },
  { point: g(-37.7855496, 144.9838967), altitude: 32, source: "contour" }
];

const OSM_EXTRA_PATHS_GEO: Array<{
  id: string;
  label: string;
  kind: LevelPath["kind"];
  width: number;
  surface?: LevelPath["surface"];
  source?: string;
  points: GeoPoint[];
}> = [
  {
    id: "osm-22673070-north-west-footpath",
    label: "North-west asphalt footpath connector",
    kind: "footway",
    width: 2.15,
    surface: "asphalt",
    source: "OpenStreetMap way 22673070",
    points: [
      g(-37.7858253, 144.9820919),
      g(-37.7859702, 144.9827104)
    ]
  },
  {
    id: "osm-22768137-north-west-diagonal-footpath",
    label: "North-west diagonal footpath",
    kind: "footway",
    width: 2.15,
    surface: "asphalt",
    source: "OpenStreetMap way 22768137",
    points: [
      g(-37.7867059, 144.9826271),
      g(-37.7858253, 144.9820919),
      g(-37.7857457, 144.9820572)
    ]
  },
  {
    id: "osm-1340462810-emely-baker-napier-footpath",
    label: "Emely Baker to Napier Street footpath",
    kind: "footway",
    width: 2.1,
    surface: "asphalt",
    source: "OpenStreetMap way 1340462810",
    points: [
      g(-37.7855462, 144.9826139),
      g(-37.7855722, 144.9825176),
      g(-37.7856435, 144.9823221),
      g(-37.7857389, 144.9820802),
      g(-37.7857457, 144.9820572)
    ]
  },
  {
    id: "osm-22760900-north-west-short-footway",
    label: "North-west short footway",
    kind: "footway",
    width: 1.85,
    surface: "asphalt",
    source: "OpenStreetMap way 22760900",
    points: [
      g(-37.7856850, 144.9828163),
      g(-37.7856637, 144.9827655),
      g(-37.7856290, 144.9827042),
      g(-37.7855917, 144.9826426),
      g(-37.7855462, 144.9826139)
    ]
  },
  {
    id: "osm-north-curve",
    label: "Northern shared path curve",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22662822",
    points: [
      g(-37.7899444, 144.9822003),
      g(-37.7899394, 144.9822200),
      g(-37.7899375, 144.9822269),
      g(-37.7899283, 144.9822478),
      g(-37.7899196, 144.9822588),
      g(-37.7899054, 144.9822711),
      g(-37.7898832, 144.9822842),
      g(-37.7898673, 144.9822918),
      g(-37.7898447, 144.9823072),
      g(-37.7898110, 144.9823323),
      g(-37.7897895, 144.9823497),
      g(-37.7897713, 144.9823670),
      g(-37.7897436, 144.9823969),
      g(-37.7897185, 144.9824256),
      g(-37.7896922, 144.9824589),
      g(-37.7896596, 144.9825102),
      g(-37.7896346, 144.9825600),
      g(-37.7896103, 144.9826172),
      g(-37.7895872, 144.9826804),
      g(-37.7895741, 144.9827298),
      g(-37.7895644, 144.9827821),
      g(-37.7895573, 144.9828374),
      g(-37.7895541, 144.9828940),
      g(-37.7895534, 144.9829676)
    ]
  },
  {
    id: "osm-eastern-diagonal",
    label: "Eastern diagonal shared path",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22694584",
    points: [
      g(-37.7895214, 144.9833220),
      g(-37.7894202, 144.9833266),
      g(-37.7886669, 144.9836370),
      g(-37.7877748, 144.9840060),
      g(-37.7867948, 144.9843718),
      g(-37.7860141, 144.9847216),
      g(-37.7859099, 144.9847618)
    ]
  },
  {
    id: "osm-22760908-north-east-cycle-link",
    label: "North-east Alfred Crescent cycle link",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22760908",
    points: [
      g(-37.7867519, 144.9835302),
      g(-37.7859575, 144.9847055),
      g(-37.7859099, 144.9847618)
    ]
  },
  {
    id: "osm-east-outer-connector",
    label: "Eastern outer connector",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22760897",
    points: [
      g(-37.7867519, 144.9835302),
      g(-37.7867948, 144.9843718),
      g(-37.7870277, 144.9848857),
      g(-37.7873277, 144.9855730),
      g(-37.7873496, 144.9856356)
    ]
  },
  {
    id: "osm-1103672695-rail-east-connector",
    label: "Rail trail to eastern shared path connector",
    kind: "cycleway",
    width: 2.4,
    surface: "asphalt",
    source: "OpenStreetMap way 1103672695",
    points: [
      g(-37.7867519, 144.9832799),
      g(-37.7867498, 144.9833548),
      g(-37.7867524, 144.9834658),
      g(-37.7867519, 144.9835302)
    ]
  },
  {
    id: "osm-west-to-central-spine",
    label: "West to central shared path",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22760899",
    points: [
      g(-37.7870572, 144.9807074),
      g(-37.7870816, 144.9807819),
      g(-37.7874689, 144.9818556),
      g(-37.7877019, 144.9824490)
    ]
  },
  {
    id: "osm-north-playground-link",
    label: "North playground shared path",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22760901",
    points: [
      g(-37.7853898, 144.9830070),
      g(-37.7854692, 144.9830236),
      g(-37.7855474, 144.9830281),
      g(-37.7856244, 144.9829201),
      g(-37.7856850, 144.9828163),
      g(-37.7857597, 144.9827607),
      g(-37.7859702, 144.9827104),
      g(-37.7863671, 144.9826611)
    ]
  },
  {
    id: "osm-rotunda-to-north-playground",
    label: "Rotunda to north playground link",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22760902",
    points: [
      g(-37.7880197, 144.9812302),
      g(-37.7879735, 144.9811810),
      g(-37.7874689, 144.9818556),
      g(-37.7867059, 144.9826271)
    ]
  },
  {
    id: "osm-central-cross-path",
    label: "Central cross path",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22760907",
    points: [
      g(-37.7877019, 144.9824490),
      g(-37.7867059, 144.9826271),
      g(-37.7863671, 144.9826611)
    ]
  },
  {
    id: "osm-75488632-rail-trail-central-cross-link",
    label: "Rail trail central cross link",
    kind: "footway",
    width: 2.2,
    surface: "asphalt",
    source: "OpenStreetMap way 75488632",
    points: [
      g(-37.7886143, 144.9824314),
      g(-37.7877118, 144.9825794)
    ]
  },
  {
    id: "osm-22760904-plinth-west-connector",
    label: "Queen Victoria plinth west connector",
    kind: "footway",
    width: 2.05,
    surface: "asphalt",
    source: "OpenStreetMap way 22760904",
    points: [
      g(-37.7867524, 144.9834658),
      g(-37.7871801, 144.9836582)
    ]
  },
  {
    id: "osm-22760905-plinth-east-connector",
    label: "Queen Victoria plinth east connector",
    kind: "footway",
    width: 2.05,
    surface: "asphalt",
    source: "OpenStreetMap way 22760905",
    points: [
      g(-37.7873642, 144.9837652),
      g(-37.7877748, 144.9840060)
    ]
  },
  {
    id: "osm-east-crescent-spine",
    label: "Eastern crescent shared path",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 22760909",
    points: [
      g(-37.7880197, 144.9812302),
      g(-37.7878517, 144.9817474),
      g(-37.7877652, 144.9820088),
      g(-37.7877019, 144.9824490),
      g(-37.7877248, 144.9828935),
      g(-37.7877748, 144.9840060),
      g(-37.7877356, 144.9842240),
      g(-37.7874885, 144.9851203),
      g(-37.7873496, 144.9856356)
    ]
  },
  {
    id: "osm-south-rail-curve-link",
    label: "South rail curve footpath",
    kind: "footway",
    width: 2.35,
    surface: "asphalt",
    source: "OpenStreetMap way 146166231",
    points: [
      g(-37.7888655, 144.9823904),
      g(-37.7890656, 144.9824965),
      g(-37.7891815, 144.9825920),
      g(-37.7892518, 144.9826888),
      g(-37.7893086, 144.9827832),
      g(-37.7893669, 144.9829170),
      g(-37.7893942, 144.9830053),
      g(-37.7894119, 144.9831074),
      g(-37.7894202, 144.9833266)
    ]
  },
  {
    id: "osm-210387722-bowling-service-track",
    label: "Bowling club private service path",
    kind: "service",
    width: 2.65,
    surface: "unknown",
    source: "OpenStreetMap way 210387722",
    points: [
      g(-37.7881336, 144.9802533),
      g(-37.7881397, 144.9803023),
      g(-37.7881511, 144.9803929),
      g(-37.7882514, 144.9807870),
      g(-37.7882541, 144.9808137),
      g(-37.7882580, 144.9808512),
      g(-37.7882464, 144.9809171),
      g(-37.7882184, 144.9809666),
      g(-37.7880915, 144.9811036),
      g(-37.7880396, 144.9811556)
    ]
  },
  {
    id: "osm-403753754-oval-west-connector",
    label: "Oval west connector",
    kind: "footway",
    width: 1.6,
    surface: "asphalt",
    source: "OpenStreetMap way 403753754",
    points: [
      g(-37.7883864, 144.9808514),
      g(-37.7882541, 144.9808137)
    ]
  },
  {
    id: "osm-22760906-tennis-service-path",
    label: "Tennis and grandstand private service path",
    kind: "service",
    width: 1.9,
    surface: "unknown",
    source: "OpenStreetMap way 22760906",
    points: [
      g(-37.7881334, 144.9812612),
      g(-37.7881889, 144.9817996),
      g(-37.7881558, 144.9817677),
      g(-37.7881049, 144.9817389),
      g(-37.7880482, 144.9817382),
      g(-37.7879836, 144.9817409),
      g(-37.7879279, 144.9817435),
      g(-37.7878517, 144.9817474)
    ]
  },
  {
    id: "vicmap-bowling-grandstand-passage",
    label: "Bowling Club to Kevin Murray Stand passage",
    kind: "service",
    width: 2.35,
    surface: "asphalt",
    source: "Vicmap AERIAL_WM_256 2026-07-10 visual fit: continuous worn service passage between OSM ways 210387722 and 22760906; intermediate centreline is aerial-fitted because no separate public path way is mapped",
    points: [
      g(-37.7880396, 144.9811556),
      g(-37.7880730, 144.9811885),
      g(-37.7881030, 144.9812240),
      g(-37.7881334, 144.9812612)
    ]
  },
  {
    id: "osm-715802681-grandstand-west-steps",
    label: "Kevin Murray Stand west steps",
    kind: "steps",
    width: 1.2,
    surface: "concrete",
    source: "OpenStreetMap way 715802681",
    points: [
      g(-37.7882794, 144.9814656),
      g(-37.7883026, 144.9814617),
      g(-37.7882993, 144.9814069)
    ]
  },
  {
    id: "osm-715802682-grandstand-inner-steps",
    label: "Kevin Murray Stand inner steps",
    kind: "steps",
    width: 1.2,
    surface: "concrete",
    source: "OpenStreetMap way 715802682",
    points: [
      g(-37.7883026, 144.9814617),
      g(-37.7883118, 144.9815149)
    ]
  },
  {
    id: "osm-715802683-grandstand-east-steps",
    label: "Kevin Murray Stand east steps",
    kind: "steps",
    width: 1.2,
    surface: "concrete",
    source: "OpenStreetMap way 715802683",
    points: [
      g(-37.7882995, 144.9816605),
      g(-37.7883247, 144.9816567),
      g(-37.7883219, 144.9816059)
    ]
  },
  {
    id: "osm-715802684-grandstand-outer-steps",
    label: "Kevin Murray Stand outer steps",
    kind: "steps",
    width: 1.2,
    surface: "concrete",
    source: "OpenStreetMap way 715802684",
    points: [
      g(-37.7882583, 144.9812623),
      g(-37.7882823, 144.9812574),
      g(-37.7882915, 144.9813111)
    ]
  },
  {
    id: "osm-715802685-grandstand-upper-footway",
    label: "Kevin Murray Stand upper footway",
    kind: "footway",
    width: 1.45,
    surface: "concrete",
    source: "OpenStreetMap way 715802685",
    points: [
      g(-37.7883936, 144.9812150),
      g(-37.7883164, 144.9812358),
      g(-37.7883049, 144.9812586),
      g(-37.7883016, 144.9812919),
      g(-37.7883079, 144.9813363),
      g(-37.7883122, 144.9813672),
      g(-37.7883141, 144.9813762),
      g(-37.7883219, 144.9814139),
      g(-37.7883372, 144.9814337),
      g(-37.7883547, 144.9814454),
      g(-37.7883764, 144.9814466),
      g(-37.7884241, 144.9814365)
    ]
  },
  {
    id: "osm-715802686-grandstand-lower-footway",
    label: "Kevin Murray Stand lower footway",
    kind: "footway",
    width: 1.45,
    surface: "concrete",
    source: "OpenStreetMap way 715802686",
    points: [
      g(-37.7883547, 144.9814454),
      g(-37.7883335, 144.9814676),
      g(-37.7883261, 144.9814968),
      g(-37.7883247, 144.9815329),
      g(-37.7883258, 144.9815419),
      g(-37.7883303, 144.9815785),
      g(-37.7883358, 144.9816223),
      g(-37.7883496, 144.9816678),
      g(-37.7883621, 144.9816853),
      g(-37.7883893, 144.9816847),
      g(-37.7884202, 144.9816783),
      g(-37.7884599, 144.9816691)
    ]
  },
  {
    id: "osm-715802687-grandstand-west-step-link",
    label: "Kevin Murray Stand west step link",
    kind: "footway",
    width: 1.15,
    surface: "concrete",
    source: "OpenStreetMap way 715802687",
    points: [
      g(-37.7882915, 144.9813111),
      g(-37.7883079, 144.9813363)
    ]
  },
  {
    id: "osm-715802688-grandstand-inner-step-link",
    label: "Kevin Murray Stand inner step link",
    kind: "footway",
    width: 1.15,
    surface: "concrete",
    source: "OpenStreetMap way 715802688",
    points: [
      g(-37.7882993, 144.9814069),
      g(-37.7883141, 144.9813762)
    ]
  },
  {
    id: "osm-715802689-grandstand-east-step-link",
    label: "Kevin Murray Stand east step link",
    kind: "footway",
    width: 1.15,
    surface: "concrete",
    source: "OpenStreetMap way 715802689",
    points: [
      g(-37.7883219, 144.9816059),
      g(-37.7883303, 144.9815785)
    ]
  },
  {
    id: "osm-715802690-grandstand-central-step-link",
    label: "Kevin Murray Stand central step link",
    kind: "footway",
    width: 1.15,
    surface: "concrete",
    source: "OpenStreetMap way 715802690",
    points: [
      g(-37.7883118, 144.9815149),
      g(-37.7883258, 144.9815419)
    ]
  },
  {
    id: "osm-south-playground-path",
    label: "South playground path",
    kind: "footway",
    width: 2.35,
    surface: "asphalt",
    source: "OpenStreetMap way 242003530",
    points: [
      g(-37.7891579, 144.9844129),
      g(-37.7891127, 144.9843953),
      g(-37.7890051, 144.9843330),
      g(-37.7889491, 144.9842233),
      g(-37.7889303, 144.9841401),
      g(-37.7889433, 144.9839978),
      g(-37.7889325, 144.9839027),
      g(-37.7888511, 144.9837571),
      g(-37.7886669, 144.9836370)
    ]
  },
  {
    id: "osm-1340465893-south-alfred-crescent-sidewalk",
    label: "South Alfred Crescent sidewalk",
    kind: "footway",
    width: 2.1,
    surface: "asphalt",
    source: "OpenStreetMap way 1340465893",
    points: [
      g(-37.7895812, 144.9847079),
      g(-37.7891702, 144.9844369),
      g(-37.7891579, 144.9844129),
      g(-37.7891691, 144.9843877),
      g(-37.7893366, 144.9841233),
      g(-37.7894543, 144.9838897),
      g(-37.7896214, 144.9833055),
      g(-37.7896397, 144.9832458)
    ]
  },
  {
    id: "osm-1340465894-south-entry-spur",
    label: "South picnic lawn entry spur",
    kind: "footway",
    width: 1.9,
    surface: "asphalt",
    source: "OpenStreetMap way 1340465894",
    points: [
      g(-37.7891579, 144.9844129),
      g(-37.7891514, 144.9844385),
      g(-37.7891506, 144.9845010),
      g(-37.7891501, 144.9845463),
      g(-37.7891471, 144.9846187),
      g(-37.7891389, 144.9846636),
      g(-37.7891199, 144.9847259)
    ]
  },
  {
    id: "osm-1361307046-south-cycle-slip",
    label: "South rail trail cycle slip",
    kind: "cycleway",
    width: 2.8,
    surface: "asphalt",
    source: "OpenStreetMap way 1361307046",
    points: [
      g(-37.7895561, 144.9830577),
      g(-37.7895718, 144.9831808)
    ]
  },
  {
    id: "osm-1361301428-south-cycle-slip-northbound",
    label: "South rail trail cycle slip northbound",
    kind: "cycleway",
    width: 1.4,
    surface: "asphalt",
    source: "OpenStreetMap way 1361301428",
    points: [
      g(-37.7895534, 144.9829676),
      g(-37.7895459, 144.9830042),
      g(-37.7895471, 144.9830363),
      g(-37.7895561, 144.9830577)
    ]
  },
  {
    id: "osm-1361301429-south-cycle-slip-southbound",
    label: "South rail trail cycle slip southbound",
    kind: "cycleway",
    width: 1.4,
    surface: "asphalt",
    source: "OpenStreetMap way 1361301429",
    points: [
      g(-37.7895561, 144.9830577),
      g(-37.7895635, 144.9830325),
      g(-37.7895635, 144.9830045),
      g(-37.7895534, 144.9829676)
    ]
  },
  {
    id: "osm-1361307049-south-rail-foot-link",
    label: "South rail trail foot link",
    kind: "footway",
    width: 1.9,
    surface: "asphalt",
    source: "OpenStreetMap way 1361307049",
    points: [
      g(-37.7894639, 144.9831739),
      g(-37.7894589, 144.9832294),
      g(-37.7894538, 144.9832866),
      g(-37.7894483, 144.9833253)
    ]
  },
  {
    id: "osm-oval-loop-detailed",
    label: "Detailed oval loop",
    kind: "footway",
    width: 2.35,
    surface: "asphalt",
    source: "OpenStreetMap way 403753756 with connector context from ways 403753751 and 403753754",
    points: [
      g(-37.7894564, 144.9804378),
      g(-37.7893569, 144.9803622),
      g(-37.7891391, 144.9802944),
      g(-37.7889333, 144.9803083),
      g(-37.7886276, 144.9804230),
      g(-37.7884953, 144.9805482),
      g(-37.7883864, 144.9808514),
      g(-37.7883779, 144.9811009),
      g(-37.7884543, 144.9816561),
      g(-37.7885652, 144.9819146),
      g(-37.7888135, 144.9821059),
      g(-37.7891357, 144.9821172),
      g(-37.7893845, 144.9820429),
      g(-37.7895607, 144.9818707),
      g(-37.7896879, 144.9815408),
      g(-37.7896496, 144.9810778),
      g(-37.7895750, 144.9806335),
      g(-37.7894564, 144.9804378)
    ]
  },
  {
    id: "osm-403753751-oval-north-entry",
    label: "Oval north entry connector",
    kind: "footway",
    width: 2,
    surface: "asphalt",
    source: "OpenStreetMap way 403753751",
    points: [
      g(-37.7896570, 144.9800422),
      g(-37.7894564, 144.9804378)
    ]
  },
  {
    id: "osm-403753760-oval-north-rail-link",
    label: "Oval north-east to rail trail connector",
    kind: "footway",
    width: 2.05,
    surface: "asphalt",
    source: "OpenStreetMap way 403753760",
    points: [
      g(-37.7895607, 144.9818707),
      g(-37.7895499, 144.9819281),
      g(-37.7895493, 144.9819710),
      g(-37.7895562, 144.9820030),
      g(-37.7895717, 144.9820339),
      g(-37.7895875, 144.9820550),
      g(-37.7896029, 144.9820666),
      g(-37.7896220, 144.9820706),
      g(-37.7896438, 144.9820731),
      g(-37.7896671, 144.9820686),
      g(-37.7896752, 144.9820751),
      g(-37.7897094, 144.9821017),
      g(-37.7897957, 144.9821475),
      g(-37.7898158, 144.9821566),
      g(-37.7898355, 144.9821619),
      g(-37.7898513, 144.9821625),
      g(-37.7899186, 144.9821512)
    ]
  },
  {
    id: "osm-western-perimeter-walk",
    label: "Western perimeter walk",
    kind: "footway",
    width: 2.35,
    surface: "asphalt",
    source: "OpenStreetMap way 599677908 with south-west connector way 403753785",
    points: [
      g(-37.7860910, 144.9815581),
      g(-37.7864790, 144.9812294),
      g(-37.7868322, 144.9809242),
      g(-37.7870736, 144.9807588),
      g(-37.7873982, 144.9805856),
      g(-37.7877145, 144.9804579),
      g(-37.7881116, 144.9803102),
      g(-37.7885338, 144.9802264),
      g(-37.7895471, 144.9800549),
      g(-37.7896570, 144.9800422)
    ]
  },
  {
    id: "osm-northern-perimeter-walk",
    label: "Northern perimeter walk",
    kind: "footway",
    width: 2.35,
    surface: "asphalt",
    source: "OpenStreetMap way 981948921 with north-east connector way 1103672692",
    points: [
      g(-37.7858791, 144.9847877),
      g(-37.7857044, 144.9844439),
      g(-37.7855997, 144.9841644),
      g(-37.7855014, 144.9837582),
      g(-37.7854721, 144.9834641),
      g(-37.7854692, 144.9830236),
      g(-37.7855058, 144.9828113),
      g(-37.7855462, 144.9826139)
    ]
  },
  {
    id: "osm-rail-trail-north",
    label: "Inner Circle Rail Trail north",
    kind: "rail",
    width: 4.8,
    surface: "asphalt",
    source: "OpenStreetMap Inner Circle Rail Trail way 1006838304; OSM disused rail segment way 1006838305",
    points: [
      g(-37.7867519, 144.9832799),
      g(-37.7866853, 144.9833360),
      g(-37.7866155, 144.9833911),
      g(-37.7864878, 144.9835046),
      g(-37.7863763, 144.9836267),
      g(-37.7861855, 144.9838569),
      g(-37.7859581, 144.9841329),
      g(-37.7857044, 144.9844439),
      g(-37.7856436, 144.9845177),
      g(-37.7855758, 144.9845932)
    ]
  },
  {
    id: "osm-north-south-spine",
    label: "North-south shared path spine",
    kind: "cycleway",
    width: 3.2,
    surface: "asphalt",
    source: "OpenStreetMap way 1103672693",
    points: [
      g(-37.7865190, 144.9810754),
      g(-37.7865428, 144.9811569),
      g(-37.7865761, 144.9813529),
      g(-37.7867059, 144.9826271),
      g(-37.7867519, 144.9832799)
    ]
  },
  {
    id: "osm-rail-trail-central",
    label: "Inner Circle Rail Trail central",
    kind: "rail",
    width: 4.8,
    surface: "asphalt",
    source: "OpenStreetMap Inner Circle Rail Trail way 1103672694",
    points: [
      g(-37.7877248, 144.9828935),
      g(-37.7875565, 144.9829185),
      g(-37.7874355, 144.9829439),
      g(-37.7872754, 144.9829903),
      g(-37.7871106, 144.9830592),
      g(-37.7867519, 144.9832799)
    ]
  },
  {
    id: "osm-western-edge",
    label: "Western edge path",
    kind: "footway",
    width: 2.35,
    surface: "asphalt",
    source: "OpenStreetMap way 1340462807",
    points: [
      g(-37.7896570, 144.9800422),
      g(-37.7896860, 144.9801210),
      g(-37.7898155, 144.9813535),
      g(-37.7899119, 144.9820840),
      g(-37.7899186, 144.9821512),
      g(-37.7899244, 144.9822066)
    ]
  },
  {
    id: "osm-plinth-garden-loop",
    label: "Queen Victoria plinth garden loop",
    kind: "footway",
    width: 2.35,
    surface: "asphalt",
    source: "OpenStreetMap ways 1533381669 and 1533381670",
    points: [
      g(-37.7871801, 144.9836582),
      g(-37.7871981, 144.9836201),
      g(-37.7872421, 144.9835825),
      g(-37.7872970, 144.9835788),
      g(-37.7873403, 144.9836060),
      g(-37.7873674, 144.9836512),
      g(-37.7873764, 144.9837026),
      g(-37.7873642, 144.9837652),
      g(-37.7873236, 144.9838167),
      g(-37.7872701, 144.9838324),
      g(-37.7872174, 144.9838100),
      g(-37.7871864, 144.9837670),
      g(-37.7871736, 144.9837130),
      g(-37.7871801, 144.9836582)
    ]
  },
  {
    id: "osm-403758220-south-east-footway",
    label: "South-east Alfred Crescent footway connector",
    kind: "footway",
    width: 2.05,
    surface: "asphalt",
    source: "OpenStreetMap way 403758220",
    points: [
      g(-37.7890665, 144.9846884),
      g(-37.7890379, 144.9846706),
      g(-37.7889370, 144.9845766),
      g(-37.7889137, 144.9845556),
      g(-37.7888713, 144.9845169)
    ]
  }
];

const OSM_AMENITY_GEO: Array<{
  id: string;
  label: string;
  kind: AmenityPoint["kind"];
  point: GeoPoint;
}> = [
  { id: "osm-2987198333", kind: "bench", label: "Bench", point: g(-37.7875390, 144.9847910) },
  { id: "osm-2987199633", kind: "waste_basket", label: "Waste basket", point: g(-37.7874200, 144.9854990) },
  { id: "osm-2987203133", kind: "waste_basket", label: "Waste basket", point: g(-37.7867590, 144.9843190) },
  { id: "osm-2987203933", kind: "bench", label: "Bench", point: g(-37.7868430, 144.9841480) },
  { id: "osm-2987208134", kind: "drinking_water", label: "Drinking fountain", point: g(-37.7883190, 144.9840400) },
  { id: "osm-2987212133", kind: "waste_basket", label: "Waste basket", point: g(-37.7878270, 144.9840400) },
  { id: "osm-2987212134", kind: "bench", label: "Bench", point: g(-37.7886580, 144.9837180) },
  { id: "osm-2987213533", kind: "bench", label: "Bench", point: g(-37.7879917, 144.9840960) },
  { id: "osm-2987213733", kind: "bench", label: "Bench", point: g(-37.7878983, 144.9842501) },
  { id: "osm-2987213933", kind: "bench", label: "Bench", point: g(-37.7877420, 144.9841900) },
  { id: "osm-2987216033", kind: "waste_basket", label: "Waste basket", point: g(-37.7876740, 144.9828820) },
  { id: "osm-2987216533", kind: "bench", label: "Bench", point: g(-37.7878268, 144.9830139) },
  { id: "osm-2987216933", kind: "bench", label: "Bench", point: g(-37.7878527, 144.9832314) },
  { id: "osm-2987216934", kind: "bicycle_parking", label: "Bike racks", point: g(-37.7888610, 144.9836540) },
  { id: "osm-2987217133", kind: "bench", label: "Bench", point: g(-37.7879801, 144.9835468) },
  { id: "osm-2987217134", kind: "bench", label: "Bench", point: g(-37.7880358, 144.9835392) },
  { id: "osm-2987227433", kind: "toilets", label: "Toilets", point: g(-37.7885390, 144.9836330) },
  { id: "osm-2987230633", kind: "waste_basket", label: "Waste basket", point: g(-37.7883700, 144.9838260) },
  { id: "osm-2987233633", kind: "waste_basket", label: "Waste basket", point: g(-37.7882510, 144.9838040) },
  { id: "osm-2987233634", kind: "drinking_water", label: "Drinking fountain", point: g(-37.7883870, 144.9838900) },
  { id: "osm-2987234633", kind: "bench", label: "Bench", point: g(-37.7887430, 144.9836970) },
  { id: "osm-2987235733", kind: "bench", label: "Bench", point: g(-37.7887090, 144.9845980) },
  { id: "osm-2987256333", kind: "waste_basket", label: "Waste basket", point: g(-37.7873860, 144.9855420) },
  { id: "osm-2987257233", kind: "bench", label: "Bench", point: g(-37.7875560, 144.9855640) },
  { id: "osm-2987259433", kind: "bench", label: "Bench", point: g(-37.7881490, 144.9853280) },
  { id: "osm-2987259733", kind: "bench", label: "Bench", point: g(-37.7885050, 144.9848990) },
  { id: "osm-2987260233", kind: "bench", label: "Bench", point: g(-37.7886580, 144.9847270) },
  { id: "osm-2987262033", kind: "bench", label: "Bench", point: g(-37.7887090, 144.9837180) },
  { id: "osm-2987263533", kind: "bench", label: "Bench", point: g(-37.7886070, 144.9836540) },
  { id: "osm-2987265133", kind: "bench", label: "Bench", point: g(-37.7886580, 144.9836110) },
  { id: "osm-2987266133", kind: "bench", label: "Bench", point: g(-37.7889120, 144.9835040) },
  { id: "osm-2987266933", kind: "bench", label: "Bench", point: g(-37.7889800, 144.9835040) },
  { id: "osm-2987266934", kind: "bench", label: "Bench", point: g(-37.7891500, 144.9834390) },
  { id: "osm-2987267933", kind: "waste_basket", label: "Waste basket", point: g(-37.7893190, 144.9833320) },
  { id: "osm-4063310123", kind: "bbq", label: "BBQ", point: g(-37.7890776, 144.9835871) },
  { id: "osm-6280110896", kind: "bbq", label: "BBQ", point: g(-37.7859107, 144.9831484) },
  { id: "osm-6280110899", kind: "bench", label: "Bench", point: g(-37.7873090, 144.9835426) },
  { id: "osm-6280110905", kind: "waste_basket", label: "Waste basket", point: g(-37.7858386, 144.9830848) },
  { id: "osm-6280110906", kind: "waste_basket", label: "Waste basket", point: g(-37.7867690, 144.9826839) },
  { id: "osm-6280110908", kind: "waste_basket", label: "Waste basket", point: g(-37.7857176, 144.9843853) },
  { id: "osm-6280110915", kind: "waste_basket", label: "Waste basket", point: g(-37.7866248, 144.9830262) },
  { id: "osm-7576808731", kind: "toilets", label: "Toilets", point: g(-37.7884306, 144.9835333) },
  { id: "osm-8464870016", kind: "drinking_water", label: "Drinking fountain", point: g(-37.7866200, 144.9829957) },
  { id: "osm-220390942", kind: "post_box", label: "Post box", point: g(-37.7895612, 144.9800662) },
  { id: "osm-13228751786", kind: "bench", label: "Bench", point: g(-37.7862474, 144.9814380) },
  { id: "osm-13228770248", kind: "bench", label: "Bench", point: g(-37.7870194, 144.9808238) },
  { id: "osm-13228778695", kind: "bench", label: "Bench", point: g(-37.7866700, 144.9816652) }
];

const OSM_BUILDING_FOOTPRINTS_GEO: Array<{
  id: string;
  label: string;
  height: number;
  material: MappedBuilding["material"];
  detailProfile?: MappedBuilding["detailProfile"];
  frontagePoint?: GeoPoint;
  facadeSource?: string;
  source: string;
  collision: boolean;
  points: GeoPoint[];
}> = [
  {
    id: "osm-building-242003562",
    label: "Alfred Crescent Sports Pavilion",
    height: 3.4,
    material: "utility",
    detailProfile: "amenities",
    frontagePoint: g(-37.7883200, 144.9834200),
    facadeSource: "Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.3 and Figure 145; ClarkeHopkinsClarke project photographs document the west paired-glass entrance, black wraparound corrugated roof, clerestory, pale masonry, green panels, shutters and timber soffits; City of Yarra's completed toilet-upgrade records supersede the photographs at the north-west extension",
    source: "OSM way 242003562 version 5 (2026-02-06) exact current footprint; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.3/Figure 145; City of Yarra Buildings Asset Management Plan asset B000163; City of Yarra Alfred Crescent public-toilet plan and 2021-22 completion report; ClarkeHopkinsClarke project photographs",
    collision: true,
    points: [
      g(-37.7884009, 144.9834542),
      g(-37.7882354, 144.9834842),
      g(-37.7882332, 144.9834649),
      g(-37.7881778, 144.983475),
      g(-37.7881848, 144.9835367),
      g(-37.7881542, 144.9835422),
      g(-37.7881656, 144.9836436),
      g(-37.7883264, 144.9836145),
      g(-37.7883273, 144.9836225),
      g(-37.788393, 144.9836106),
      g(-37.7883921, 144.9836026),
      g(-37.7884361, 144.9835946),
      g(-37.7884337, 144.9835736),
      g(-37.7884641, 144.9835681),
      g(-37.788455, 144.9834877),
      g(-37.7884057, 144.9834966),
      g(-37.7884009, 144.9834542)
    ]
  },
  {
    id: "osm-building-403753784",
    label: "Fitzroy Tennis Club rooms",
    height: 3.8,
    material: "timber",
    detailProfile: "tennis-pavilion",
    frontagePoint: g(-37.7880800, 144.9822400),
    facadeSource: "Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.10 and Figures 76-77: ochre-painted battened fibro-cement cladding above a weatherboard plinth, red-brown trim, gambrel/skillion roofs and north/east verandahs; Fitzroy Tennis Club's 30 June 2026 update says the old clubhouse was inaccessible and being relocated",
    source: "OSM way 403753784 full JSON; Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.10 and Figures 76-77; Fitzroy Tennis Club update 30 June 2026 records May-March clubhouse construction, no clubhouse facilities on site and relocation of the old building; exact 10 July 2026 clubhouse position and temporary construction fabric are unavailable",
    collision: true,
    points: [
      g(-37.7882091, 144.9819287),
      g(-37.7883259, 144.9819091),
      g(-37.7883235, 144.981886),
      g(-37.7883656, 144.9818789),
      g(-37.7883614, 144.981839),
      g(-37.7883262, 144.9818449),
      g(-37.78831, 144.9816897),
      g(-37.7881943, 144.9817091),
      g(-37.7882105, 144.9818642),
      g(-37.7882025, 144.9818656),
      g(-37.7882, 144.981842),
      g(-37.7881376, 144.9818524),
      g(-37.7881476, 144.9819485),
      g(-37.7882101, 144.981938),
      g(-37.7882091, 144.9819287)
    ]
  },
  {
    id: "osm-man-made-715802679",
    label: "Tennis-side storage tank",
    height: 1.7,
    material: "utility",
    source: "OSM way 715802679 man_made=storage_tank; current full-object placement audit; no public source resolves attached pipe, ladder or fitting positions",
    collision: true,
    points: [
      g(-37.7880689, 144.9816485),
      g(-37.7880747, 144.9816588),
      g(-37.7880745, 144.9816715),
      g(-37.7880685, 144.9816816),
      g(-37.7880590, 144.9816853),
      g(-37.7880495, 144.9816812),
      g(-37.7880438, 144.9816709),
      g(-37.7880439, 144.9816582),
      g(-37.7880499, 144.9816481),
      g(-37.7880595, 144.9816444),
      g(-37.7880689, 144.9816485)
    ]
  },
  {
    id: "osm-building-543505638",
    label: "Reconstructed timber entrance pavilion",
    height: 2.7,
    material: "timber",
    detailProfile: "gatehouse",
    frontagePoint: g(-37.7897200, 144.9801800),
    facadeSource: "Lovell Chen Edinburgh Gardens CMP 2021 Figure 61: reconstructed timber entrance pavilion with cream V-jointed infill, red-brown framing, paired open central passage bays, diagonal boarding, carved eaves valances and a corrugated gabled roof with central gablets",
    source: "OSM way 543505638 full JSON; Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.6 and Figure 61",
    collision: true,
    points: [
      g(-37.7896325, 144.9801426),
      g(-37.7896621, 144.9801369),
      g(-37.7896863, 144.9803408),
      g(-37.7896567, 144.9803465),
      g(-37.7896325, 144.9801426)
    ]
  },
  {
    id: "osm-building-543505639",
    label: "Fitzroy Victoria Bowling Club rooms",
    height: 4.2,
    material: "utility",
    detailProfile: "bowling-club",
    frontagePoint: g(-37.7878200, 144.9806800),
    facadeSource: "Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.9 and Figures 70-73: utilitarian bagged-render single/double-storey club rooms, long glazed green-facing frontage, blue-and-gold fascia signage, zincalume/solar roof and red/brown-brick Hannah memorial gates; Colour Our City photos 55297636202, 55298958435 and 55298958440 document the current Melanie Caple St Georges Road mural on 28 May 2026",
    source: "OSM way 543505639 full JSON; Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.9 and Figures 70-73; Yarra 2025 Fitzroy Bowls roof upgrade; Yarra Fitzroy Bowls 150 Years Memorial Wall context; Colour Our City Flickr photos 55297636202, 55298958435 and 55298958440 for the current 28 May 2026 mural",
    collision: true,
    points: [
      g(-37.7879856, 144.9809226),
      g(-37.7879754, 144.9809242),
      g(-37.7879795, 144.9809661),
      g(-37.7880133, 144.9809609),
      g(-37.7880313, 144.9809581),
      g(-37.788083, 144.9803435),
      g(-37.787906, 144.9803958),
      g(-37.7879388, 144.9807351),
      g(-37.7879481, 144.9807337),
      g(-37.7879627, 144.980884),
      g(-37.788013, 144.9808762),
      g(-37.7880152, 144.9808856),
      g(-37.7879826, 144.9808907),
      g(-37.7879856, 144.9809226)
    ]
  },
  {
    id: "osm-building-543505640",
    label: "Fitzroy Memorial Rotunda",
    height: 3.1,
    material: "timber",
    detailProfile: "rotunda-pavilion",
    source: "OSM way 543505640 full JSON; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.1 and Figures 142-143; Yarra Edinburgh Gardens Rotunda venue photographs; public sources do not resolve the entablature floodlight count and angular positions",
    collision: true,
    points: [
      g(-37.7867751, 144.9815512),
      g(-37.7867862, 144.9815638),
      g(-37.7867911, 144.9815816),
      g(-37.7867889, 144.9816002),
      g(-37.7867799, 144.9816152),
      g(-37.7867659, 144.9816231),
      g(-37.7867506, 144.9816214),
      g(-37.786738, 144.9816104),
      g(-37.7867311, 144.9815931),
      g(-37.7867324, 144.9815716),
      g(-37.7867426, 144.9815544),
      g(-37.7867585, 144.9815468),
      g(-37.7867751, 144.9815512)
    ]
  },
  {
    id: "osm-building-543505702",
    label: "Emely Baker Centre",
    height: 3.2,
    material: "brick",
    detailProfile: "community-centre",
    frontagePoint: g(-37.7856520, 144.9824100),
    facadeSource: "Lovell Chen Edinburgh Gardens CMP 2021 Figure 144: low single-storey tan-brick centre with a shallow metal tray-deck skillion roof, tile-coped high walled outdoor court and aluminium-framed glazing; Yarra Emely Baker Centre venue manual pages 9-11 document the current glazed play-yard facade, name sign, dark shade sail, vertical-bar side gate and floor plan",
    source: "OSM way 543505702 full JSON; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.2 and Figure 144; Yarra Emely Baker Centre venue page and November 2024 venue manual; public sources do not resolve a measured sandpit boundary or every rear-room opening dimension",
    collision: true,
    points: [
      g(-37.7857727, 144.982404),
      g(-37.7857168, 144.9823708),
      g(-37.785658, 144.9825295),
      g(-37.785714, 144.9825627),
      g(-37.7857009, 144.9825979),
      g(-37.7857614, 144.9826338),
      g(-37.7858474, 144.9824014),
      g(-37.7857869, 144.9823656),
      g(-37.7857727, 144.982404)
    ]
  },
  {
    id: "osm-building-1475006767",
    label: "Bowling club outbuilding",
    height: 2.9,
    material: "utility",
    detailProfile: "bowling-shed",
    source: "OSM way 1475006767 full JSON; public facade photography and individual door, vent and equipment positions are unavailable",
    collision: true,
    points: [
      g(-37.7880133, 144.9809609),
      g(-37.7879795, 144.9809661),
      g(-37.7879632, 144.9809686),
      g(-37.7879692, 144.9810314),
      g(-37.7880193, 144.9810236),
      g(-37.7880133, 144.9809609)
    ]
  },
  {
    id: "osm-building-1475006768",
    label: "Bowling club shed",
    height: 2.6,
    material: "utility",
    detailProfile: "bowling-shed",
    source: "OSM way 1475006768 full JSON; public facade photography and individual door, vent and equipment positions are unavailable",
    collision: true,
    points: [
      g(-37.7881042, 144.9806922),
      g(-37.7880689, 144.9806874),
      g(-37.7880638, 144.9807482),
      g(-37.7880991, 144.9807529),
      g(-37.7881042, 144.9806922)
    ]
  },
  {
    id: "osm-building-1475006769",
    label: "Bowling club outbuilding",
    height: 2.8,
    material: "utility",
    detailProfile: "bowling-shed",
    source: "OSM way 1475006769 full JSON; public facade photography and individual door, vent and equipment positions are unavailable",
    collision: true,
    points: [
      g(-37.787959, 144.9811502),
      g(-37.7880467, 144.9812417),
      g(-37.7880717, 144.9812033),
      g(-37.787984, 144.9811117),
      g(-37.787959, 144.9811502)
    ]
  },
  {
    id: "osm-building-1475006770",
    label: "Bowling green shed",
    height: 2.4,
    material: "timber",
    detailProfile: "bowling-shed",
    source: "OSM way 1475006770 full JSON; public facade photography and individual door, vent and equipment positions are unavailable",
    collision: true,
    points: [
      g(-37.7875114, 144.9811606),
      g(-37.7875199, 144.9812476),
      g(-37.7875949, 144.981236),
      g(-37.7875865, 144.9811489),
      g(-37.7875114, 144.9811606)
    ]
  },
  {
    id: "osm-building-1475006771",
    label: "Bowling green shed",
    height: 2.3,
    material: "timber",
    detailProfile: "bowling-shed",
    source: "OSM way 1475006771 full JSON; public facade photography and individual door, vent and equipment positions are unavailable",
    collision: true,
    points: [
      g(-37.787481, 144.9805718),
      g(-37.7874869, 144.9806325),
      g(-37.7875411, 144.9806241),
      g(-37.7875352, 144.9805634),
      g(-37.787481, 144.9805718)
    ]
  },
  {
    id: "osm-building-1475006772",
    label: "Bowling green shed",
    height: 2.3,
    material: "timber",
    detailProfile: "bowling-shed",
    source: "OSM way 1475006772 full JSON; public facade photography and individual door, vent and equipment positions are unavailable",
    collision: true,
    points: [
      g(-37.7877459, 144.9804572),
      g(-37.7877508, 144.9805076),
      g(-37.7878185, 144.9804971),
      g(-37.7878137, 144.9804467),
      g(-37.7877459, 144.9804572)
    ]
  },
  {
    id: "osm-building-1475006773",
    label: "Bowling green shed",
    height: 2.3,
    material: "timber",
    detailProfile: "bowling-shed",
    source: "OSM way 1475006773 full JSON; public facade photography and individual door, vent and equipment positions are unavailable",
    collision: true,
    points: [
      g(-37.7878326, 144.9811639),
      g(-37.7877033, 144.9812283),
      g(-37.7877159, 144.9812689),
      g(-37.7878452, 144.9812045),
      g(-37.7878326, 144.9811639)
    ]
  }
];

const OSM_FENCES_GEO: Array<{
  id: string;
  label: string;
  points: GeoPoint[];
  height: number;
  width: number;
  jumpable?: boolean;
  jumpBypassMinHeight?: number;
  source: string;
  gates?: Array<{ id: string; label: string; point: GeoPoint; radius: number; source?: string }>;
}> = [
  {
    id: "tennis-precinct-perimeter-fence",
    label: "Fitzroy Tennis Club chain-mesh perimeter fence",
    height: 2.8,
    width: 0.3,
    source: "OSM sports_centre way 24489878 perimeter; Vicmap Basemap aerial shows the exposed court fence terminating against the clubhouse rather than crossing it; Lovell Chen CMP 2021 Figures 76-77 show the fenced six-court precinct; Fitzroy Tennis Club update 5 June 2026 identifies the operational access gate at the south-eastern corner of Court 3",
    gates: [
      {
        id: "tennis-court-3-south-east-gate",
        label: "Court 3 south-east member access gate",
        point: g(-37.7883709, 144.9823970),
        radius: 2.1,
        source: "Fitzroy Tennis Club update 5 June 2026: access through a new gate in the south-eastern corner of Court 3"
      }
    ],
    points: TENNIS_FENCE_GEO
  },
  {
    id: "bowling-precinct-perimeter-fence",
    label: "Fitzroy Victoria Bowling Club perimeter fence",
    height: 1.65,
    width: 0.3,
    source: "OSM sports_centre way 24489838 perimeter; Vicmap Basemap aerial and Lovell Chen CMP 2021 Figure 71 show the green chain-mesh enclosure terminating at the clubhouse/outbuilding boundary; CMP Figure 72 shows the Hannah memorial entrance gate",
    gates: [
      {
        id: "bowling-hannah-memorial-gate",
        label: "Hannah memorial entrance gate",
        point: g(-37.7879508, 144.9811627),
        radius: 2.4,
        source: "Lovell Chen CMP 2021 Figure 72; entrance fitted to the mapped south-east clubhouse approach"
      }
    ],
    points: BOWLING_FENCE_GEO
  },
  {
    id: "south-playground-fence",
    label: "South playground steel safety fence",
    height: 1.38,
    width: 0.34,
    source: SOUTH_PLAYGROUND_LAYOUT_SOURCE,
    gates: [
      {
        id: "south-playground-bbq-gate",
        label: "South playground BBQ-side safety gate",
        point: g(-37.789105, 144.983545),
        radius: 4.4,
        source: `${PLAYGROUND_FENCE_SOURCE}; gate inferred from BBQ/picnic-side approach`
      },
      {
        id: "south-playground-alfred-gate",
        label: "South playground Alfred Crescent all-abilities gate",
        point: g(-37.788952, 144.984185),
        radius: 4.8,
        source: `${PLAYGROUND_FENCE_SOURCE}; gate inferred from all-abilities path access and Alfred Crescent side`
      },
      {
        id: "south-playground-lawn-gate",
        label: "South playground lawn-side safety gate",
        point: g(-37.788855, 144.983735),
        radius: 3.9,
        source: `${PLAYGROUND_FENCE_SOURCE}; gate inferred from oval/lawn-side approach`
      }
    ],
    points: SOUTH_PLAYGROUND_GEO
  },
  {
    id: "oval-fence",
    label: "W.T. Peterson Oval low rail fence",
    height: 1.25,
    width: 0.36,
    jumpable: true,
    jumpBypassMinHeight: 0.48,
    source: OVAL_FENCE_SOURCE,
    gates: [
      {
        id: "oval-north-entry-gate",
        label: "Oval north entry gate",
        point: g(-37.7894564, 144.9804378),
        radius: 5.2,
        source: "OSM way 403753751 oval north entry connector"
      },
      {
        id: "oval-west-connector-gate",
        label: "Oval west connector gate",
        point: g(-37.7883864, 144.9808514),
        radius: 4.8,
        source: "OSM way 403753754 oval west connector"
      },
      {
        id: "oval-grandstand-gate",
        label: "Oval grandstand-side gate",
        point: g(-37.7885941, 144.9819619),
        radius: 4.8,
        source: "OSM way 403753756 detailed oval loop and grandstand-side path alignment"
      }
    ],
    points: OVAL_GEO
  },
  {
    id: "osm-fence-715802680",
    label: "Mapped tennis club fence",
    height: 1.65,
    width: 0.34,
    source: "OSM way 715802680 mapped barrier=fence around the tennis-side storage-tank area",
    points: [
      g(-37.7880337, 144.9817074),
      g(-37.7880906, 144.9816979),
      g(-37.7880832, 144.9816273),
      g(-37.7880263, 144.9816368),
      g(-37.7880337, 144.9817074)
    ]
  }
];

const HARDSCAPE_LINES_GEO: Array<{
  id: string;
  label: string;
  kind: HardscapeLine["kind"];
  width: number;
  height: number;
  source: string;
  points: GeoPoint[];
}> = [
  {
    id: "hardscape-alfred-crescent-basalt-edging",
    label: "Bluestone and basalt edging on Alfred Crescent path sections",
    kind: "basalt-edging",
    width: 3.5,
    height: 0.16,
    source: "Edinburgh Gardens CMP 2004 section 3.4.26",
    points: ALFRED_CRESCENT_PATH_GEO
  },
  {
    id: "hardscape-oval-east-bluestone-drain",
    label: "Bluestone-pitcher open drain east of the oval",
    kind: "bluestone-drain",
    width: 0.9,
    height: 0.12,
    source: "Edinburgh Gardens CMP 2004 section 3.4.27",
    points: OVAL_EAST_DRAIN_GEO
  },
  {
    id: "hardscape-alfred-crescent-retaining-wall",
    label: "Bluestone retaining wall along southern Alfred Crescent",
    kind: "bluestone-wall",
    width: 0.46,
    height: 0.72,
    source: "Edinburgh Gardens CMP 2004 section 3.4.28",
    points: ALFRED_CRESCENT_RETAINING_WALL_GEO
  }
];

const STREET_EDGES_GEO: Array<{
  id: string;
  label: string;
  kind: StreetEdge["kind"];
  width: number;
  surface: StreetEdge["surface"];
  hasTram?: boolean;
  source: string;
  points: GeoPoint[];
}> = [
  {
    id: "street-st-georges-road",
    label: "St Georges Road",
    kind: "trunk",
    width: 13.5,
    surface: "asphalt",
    hasTram: true,
    source: "OpenStreetMap Overpass road query 2026-07-05; ways 201749623, 125127558, 1192255587, 12566432, 1122203928, 1122203929",
    points: [
      g(-37.7856329, 144.9818327),
      g(-37.7856982, 144.9817769),
      g(-37.7857869, 144.9817045),
      g(-37.7860974, 144.9814377),
      g(-37.7863561, 144.9812154),
      g(-37.7866551, 144.9809584),
      g(-37.7868186, 144.9807875),
      g(-37.7870309, 144.9805740),
      g(-37.7872190, 144.9804137),
      g(-37.7873745, 144.9803019),
      g(-37.7874128, 144.9805187)
    ]
  },
  {
    id: "street-brunswick-street",
    label: "Brunswick Street",
    kind: "trunk",
    width: 13.5,
    surface: "asphalt",
    hasTram: true,
    source: "OpenStreetMap Overpass road query 2026-07-05; ways 210387721, 210387724, 1123763616, 1123763615, 1192252486",
    points: [
      g(-37.7874128, 144.9805187),
      g(-37.7873745, 144.9803019),
      g(-37.7874306, 144.9802775),
      g(-37.7875844, 144.9802409),
      g(-37.7877380, 144.9802180),
      g(-37.7879566, 144.9801910),
      g(-37.7881336, 144.9802533),
      g(-37.7882373, 144.9802217),
      g(-37.7883772, 144.9801791),
      g(-37.7885044, 144.9801408),
      g(-37.7896484, 144.9799469),
      g(-37.7897278, 144.9799334),
      g(-37.7900147, 144.9798846)
    ]
  },
  {
    id: "street-freeman-street",
    label: "Freeman Street",
    kind: "residential",
    width: 8.4,
    surface: "paved",
    source: "OpenStreetMap Overpass road query 2026-07-05; ways 1123763621, 1291914093, 1361023844",
    points: [
      g(-37.7897144, 144.9798339),
      g(-37.7897278, 144.9799334),
      g(-37.7897361, 144.9800065),
      g(-37.7897573, 144.9801746),
      g(-37.7897862, 144.9803998),
      g(-37.7897954, 144.9804719),
      g(-37.7899046, 144.9813419),
      g(-37.7899632, 144.9818134),
      g(-37.7899702, 144.9819086),
      g(-37.7899764, 144.9819922),
      g(-37.7899859, 144.9820712),
      g(-37.7900033, 144.9821546),
      g(-37.7900124, 144.9821658)
    ]
  },
  {
    id: "street-alfred-crescent-north-east",
    label: "Alfred Crescent north and east",
    kind: "residential",
    width: 8.8,
    surface: "asphalt",
    source: "OpenStreetMap Overpass road query 2026-07-05; ways 1126453527, 22973332, 60354131, 1103672689, 1126453600, 1103672691, 159310644",
    points: [
      g(-37.7856329, 144.9818327),
      g(-37.7856974, 144.9818725),
      g(-37.7856974, 144.9820337),
      g(-37.7856432, 144.9822140),
      g(-37.7855588, 144.9823797),
      g(-37.7854978, 144.9825619),
      g(-37.7854030, 144.9829160),
      g(-37.7853859, 144.9833391),
      g(-37.7854186, 144.9837582),
      g(-37.7855233, 144.9842132),
      g(-37.7856436, 144.9845177),
      g(-37.7858229, 144.9848575),
      g(-37.7860779, 144.9851882),
      g(-37.7863756, 144.9854389),
      g(-37.7868035, 144.9856451),
      g(-37.7870960, 144.9857155),
      g(-37.7874689, 144.9857103)
    ]
  },
  {
    id: "street-alfred-crescent-south-east",
    label: "Alfred Crescent south-east",
    kind: "residential",
    width: 8.8,
    surface: "asphalt",
    source: "OpenStreetMap Overpass road query 2026-07-05; ways 1291923179, 1291923178, 403758221, 4996320, 1291914076, 13867302, 13867284",
    points: [
      g(-37.7874689, 144.9857103),
      g(-37.7876080, 144.9856806),
      g(-37.7878696, 144.9856004),
      g(-37.7881251, 144.9854686),
      g(-37.7883107, 144.9853388),
      g(-37.7884947, 144.9851398),
      g(-37.7886544, 144.9849231),
      g(-37.7890039, 144.9847705),
      g(-37.7891029, 144.9844737),
      g(-37.7892003, 144.9841741),
      g(-37.7893412, 144.9839014),
      g(-37.7894669, 144.9835470),
      g(-37.7895519, 144.9831990)
    ]
  }
];

function obstacleFromPolygon(id: string, label: string, polygon: Vec2[], padding: number, source: CollisionSourceRef): CircularObstacle {
  const center = polygonCentroid(polygon);
  return {
    id,
    label,
    ...source,
    center,
    radius: boundingRadius(polygon, center) + padding
  };
}

function boxObstacleFromPolygon(
  id: string,
  label: string,
  polygon: Vec2[],
  paddingX: number,
  paddingZ: number,
  source: CollisionSourceRef,
  accessGaps: BoxObstacleAccessGap[] = []
): BoxObstacle {
  const center = polygonCentroid(polygon);
  const first = polygon[0];
  const second = polygon[1] ?? first;
  const angle = Math.atan2(second.z - first.z, second.x - first.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let halfX = 0;
  let halfZ = 0;

  for (const point of polygon) {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    halfX = Math.max(halfX, Math.abs(dx * cos + dz * sin));
    halfZ = Math.max(halfZ, Math.abs(-dx * sin + dz * cos));
  }

  return {
    id,
    label,
    ...source,
    shape: "box",
    center,
    halfX: halfX + paddingX,
    halfZ: halfZ + paddingZ,
    angle,
    ...(accessGaps.length > 0 ? { accessGaps } : {})
  };
}

function polygonObstacleFromPolygon(id: string, label: string, polygon: Vec2[], source: CollisionSourceRef): PolygonObstacle {
  return {
    id,
    label,
    ...source,
    shape: "polygon",
    center: polygonCentroid(polygon),
    polygon
  };
}

function fenceObstacles(fence: MappedFence): BoxObstacle[] {
  const obstacles: BoxObstacle[] = [];
  const width = fence.width ?? 0.34;
  const gates = fence.gates ?? [];
  for (let i = 0; i < fence.points.length - 1; i += 1) {
    const a = fence.points[i];
    const b = fence.points[i + 1];
    const intervals = fenceVisibleIntervals(a, b, gates.map((gate) => ({ position: gate.position, radius: gate.radius })));
    intervals.forEach((interval, intervalIndex) => {
      const start = { x: a.x + (b.x - a.x) * interval.start, z: a.z + (b.z - a.z) * interval.start };
      const end = { x: a.x + (b.x - a.x) * interval.end, z: a.z + (b.z - a.z) * interval.end };
      const segmentLength = distance(start, end);
      if (segmentLength < 0.55) {
        return;
      }
      obstacles.push({
        id: `${fence.id}-segment-${i + 1}-${intervalIndex + 1}`,
        label: `${fence.label} segment`,
        sourceObjectId: fence.id,
        sourceObjectKind: "mapped-fence",
        shape: "box",
        center: { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 },
        halfX: segmentLength * 0.5,
        halfZ: width * 0.5,
        angle: Math.atan2(end.z - start.z, end.x - start.x),
        blocksSight: false,
        jumpable: fence.jumpable,
        jumpBypassMinHeight: fence.jumpBypassMinHeight
      });
    });
  }

  const hannahGate = gates.find((gate) => gate.id === "bowling-hannah-memorial-gate");
  if (hannahGate) {
    const angle = nearestFenceSegmentAngle(fence.points, hannahGate.position);
    for (const side of [-1, 1]) {
      obstacles.push({
        id: `${hannahGate.id}-pier-${side < 0 ? "west" : "east"}`,
        label: "Hannah memorial gate brick pier",
        sourceObjectId: fence.id,
        sourceObjectKind: "mapped-fence",
        shape: "box",
        center: offsetPoint(hannahGate.position, angle, side * 1.18, 0),
        halfX: 0.36,
        halfZ: 0.36,
        angle,
        blocksSight: false
      });
    }
  }
  return obstacles;
}

function nearestFenceSegmentAngle(points: readonly Vec2[], position: Vec2): number {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAngle = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const nearest = nearestPointOnSegment(position, a, b);
    const candidateDistance = distance(position, nearest);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestAngle = Math.atan2(b.z - a.z, b.x - a.x);
    }
  }
  return bestAngle;
}

function fenceVisibleIntervals(a: Vec2, b: Vec2, gaps: Array<{ position: Vec2; radius: number }>): Array<{ start: number; end: number }> {
  let intervals: Array<{ start: number; end: number }> = [{ start: 0, end: 1 }];
  if (gaps.length === 0) return intervals;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const segmentLengthSquared = dx * dx + dz * dz;
  const segmentLength = Math.sqrt(segmentLengthSquared);
  if (segmentLength < 0.001) return [];

  for (const gap of gaps) {
    const t = Math.max(0, Math.min(1, ((gap.position.x - a.x) * dx + (gap.position.z - a.z) * dz) / segmentLengthSquared));
    const closest = { x: a.x + dx * t, z: a.z + dz * t };
    if (distance(closest, gap.position) > gap.radius) {
      continue;
    }
    const gapStart = Math.max(0, t - gap.radius / segmentLength);
    const gapEnd = Math.min(1, t + gap.radius / segmentLength);
    const nextIntervals: Array<{ start: number; end: number }> = [];
    for (const interval of intervals) {
      if (gapEnd <= interval.start || gapStart >= interval.end) {
        nextIntervals.push(interval);
        continue;
      }
      if (gapStart - interval.start > 0.015) {
        nextIntervals.push({ start: interval.start, end: gapStart });
      }
      if (interval.end - gapEnd > 0.015) {
        nextIntervals.push({ start: gapEnd, end: interval.end });
      }
    }
    intervals = nextIntervals;
  }

  return intervals;
}

function skateBowlTerrainModifier(bowl: SkateBowlFeature): TerrainModifier {
  return {
    id: `terrain-${bowl.id}`,
    label: `${bowl.label} depressed concrete bowl`,
    kind: "skate-bowl",
    shape: "ellipse",
    center: bowl.center,
    radiusX: bowl.radiusX,
    radiusZ: bowl.radiusZ,
    angle: bowl.angle,
    delta: -bowl.depth,
    source: bowl.source
  };
}

function treeProfileFromGenus(genus: string): TreeProfile {
  const normalized = genus.toLowerCase();
  if (normalized.includes("jacaranda")) return "jacaranda";
  if (normalized.includes("brachychiton") || normalized.includes("kurrajong")) return "kurrajong";
  if (normalized.includes("eucalyptus")) return "gum";
  if (normalized.includes("quercus")) return "oak";
  if (normalized.includes("ulmus")) return "elm";
  return "generic";
}

type MappedTreeInput = Omit<MappedTree, "canopyRadius" | "canopyDensity" | "canopyGroup"> & Partial<Pick<MappedTree, "canopyRadius" | "canopyDensity" | "canopyGroup">>;

type TreeExclusionZone = {
  id: string;
  polygon?: readonly Vec2[];
  center?: Vec2;
  radius?: number;
  padding: number;
};

function completeMappedTree(tree: MappedTreeInput): MappedTree {
  const canopyGroup = tree.canopyGroup ?? treeCanopyGroup(tree);
  return {
    ...tree,
    canopyRadius: tree.canopyRadius ?? treeCanopyRadius(tree),
    canopyDensity: tree.canopyDensity ?? treeCanopyDensity(tree.profile, canopyGroup),
    canopyGroup
  };
}

function treeCanopyGroup(tree: Pick<MappedTree, "profile" | "source" | "height" | "dbh">): MappedTree["canopyGroup"] {
  if (tree.source?.includes("tree avenue") || (tree.profile === "elm" && tree.source?.includes("OpenStreetMap"))) {
    return "avenue";
  }
  if (tree.source?.includes("Yarra significant trees") || (tree.height && tree.dbh)) {
    return "specimen";
  }
  return "mapped";
}

function treeCanopyRadius(tree: Pick<MappedTree, "profile" | "height" | "dbh" | "source">): number {
  const fallbackHeight =
    tree.profile === "gum"
      ? 17
      : tree.profile === "oak"
        ? 15
        : tree.profile === "jacaranda"
          ? 8
          : tree.profile === "kurrajong"
            ? 9
            : 13;
  const heightDivisor = tree.profile === "gum" ? 4.8 : tree.profile === "jacaranda" || tree.profile === "kurrajong" ? 4.35 : 3.8;
  const fallbackDbh =
    tree.profile === "oak" ? 92 : tree.profile === "elm" ? 80 : tree.profile === "jacaranda" ? 36 : tree.profile === "kurrajong" ? 42 : 66;
  const heightRadius = ((tree.height ?? fallbackHeight) * WORLD_SCALE) / heightDivisor;
  const dbhRadius = ((tree.dbh ?? fallbackDbh) / 100) * WORLD_SCALE * 3.6;
  const profileBoost =
    tree.profile === "oak" ? 1.18 : tree.profile === "elm" ? 1.08 : tree.profile === "gum" ? 0.9 : tree.profile === "kurrajong" ? 0.96 : 0.9;
  const sourceBoost = tree.source?.includes("tree avenue") ? 0.92 : tree.source?.includes("Yarra significant trees") ? 1.12 : 1;
  return Math.max(3.1, Math.min(12.6, ((heightRadius + dbhRadius) * 0.5) * profileBoost * sourceBoost));
}

function treeCanopyDensity(profile: TreeProfile, canopyGroup: MappedTree["canopyGroup"]): number {
  const base = profile === "gum" ? 0.55 : profile === "oak" ? 0.88 : profile === "elm" ? 0.78 : profile === "jacaranda" ? 0.58 : profile === "kurrajong" ? 0.7 : 0.66;
  const groupBoost = canopyGroup === "specimen" ? 0.06 : canopyGroup === "avenue" ? 0.04 : 0;
  return Math.max(0.42, Math.min(0.95, base + groupBoost));
}

function distanceToPolyline(point: Vec2, points: readonly Vec2[]): number {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    closest = Math.min(closest, distanceToSegment(point, points[index], points[index + 1]));
  }
  return closest;
}

type HeritageTreeLines = {
  elmAvenues: readonly Vec2[][];
  crescentPath: readonly Vec2[];
  railTrail: readonly Vec2[];
  englishOakAvenue: readonly Vec2[];
};

function isHeritageAvenuePoint(point: Vec2, heritageLines: HeritageTreeLines): boolean {
  return (
    distanceToPolyline(point, heritageLines.englishOakAvenue) < 13 ||
    distanceToAnyPolyline(point, heritageLines.elmAvenues) < 14 ||
    distanceToPolyline(point, heritageLines.railTrail) < 11 ||
    distanceToPolyline(point, heritageLines.crescentPath) < 10
  );
}

function inferMappedTreeProfile(point: Vec2, heritageLines: HeritageTreeLines, significantTrees: readonly SignificantTreePoint[]): TreeProfile {
  if (distanceToPolyline(point, heritageLines.englishOakAvenue) < 13) return "oak";
  if (isHeritageAvenuePoint(point, heritageLines)) {
    return "elm";
  }

  const nearbySignificantProfile = nearestSignificantTreeProfile(point, significantTrees);
  if (nearbySignificantProfile) {
    return nearbySignificantProfile;
  }

  return "generic";
}

function distanceToAnyPolyline(point: Vec2, lines: readonly (readonly Vec2[])[]): number {
  return lines.reduce((closest, line) => Math.min(closest, distanceToPolyline(point, line)), Number.POSITIVE_INFINITY);
}

function nearestSignificantTreeProfile(point: Vec2, significantTrees: readonly SignificantTreePoint[]): TreeProfile | null {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestProfile: TreeProfile | null = null;
  for (const tree of significantTrees) {
    const candidateDistance = distance(point, tree.position);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestProfile = treeProfileFromGenus(tree.genus);
    }
  }
  return bestDistance < 24 * WORLD_SCALE ? bestProfile : null;
}

function pointInTreeExclusionZone(point: Vec2, zone: TreeExclusionZone): boolean {
  if (zone.polygon) {
    return pointInPolygon(point, zone.polygon) || distance(point, nearestPointOnPolygon(point, zone.polygon)) < zone.padding;
  }
  if (zone.center && zone.radius !== undefined) {
    return distance(point, zone.center) < zone.radius + zone.padding;
  }
  return false;
}

function appendMappedTree(trees: MappedTree[], tree: MappedTreeInput, minSpacing: number, exclusionZones: readonly TreeExclusionZone[] = []): void {
  if (exclusionZones.some((zone) => pointInTreeExclusionZone(tree.position, zone))) {
    return;
  }
  const completedTree = completeMappedTree(tree);
  if (trees.some((existing) => distance(existing.position, tree.position) < minSpacing)) {
    return;
  }
  trees.push(completedTree);
}

function treeColliderRadius(tree: MappedTree): number {
  const fallbackDbh =
    tree.profile === "oak" ? 82 : tree.profile === "elm" ? 74 : tree.profile === "gum" ? 68 : tree.profile === "jacaranda" ? 34 : tree.profile === "kurrajong" ? 42 : 58;
  return Math.max(0.34, Math.min(1.05, ((tree.dbh ?? fallbackDbh) / 200) * WORLD_SCALE));
}

function pathTerrainModifiers(path: LevelPath): TerrainModifier[] {
  const broadSource = path.source ?? "mapped Edinburgh Gardens path geometry";
  const crownDelta = path.kind === "steps" ? 0.018 : path.kind === "service" ? 0.028 : path.kind === "rail" ? 0.042 : 0.055;
  const shoulderDelta = path.kind === "steps" ? -0.014 : path.kind === "service" ? -0.022 : path.kind === "rail" ? -0.03 : -0.038;
  const halfWidth = path.width * 0.5;
  return [
    {
      id: `terrain-${path.id}-crown`,
      label: `${path.label} slight crown`,
      kind: "path-crown",
      shape: "line",
      points: path.points,
      innerWidth: 0,
      outerWidth: Math.max(0.72, halfWidth * 0.82),
      delta: crownDelta,
      source: `${broadSource}; path crown inferred from pedestrian-path drainage practice`
    },
    {
      id: `terrain-${path.id}-shoulder`,
      label: `${path.label} worn shoulder`,
      kind: "path-shoulder",
      shape: "line",
      points: path.points,
      innerWidth: Math.max(0.7, halfWidth * 0.88),
      outerWidth: Math.max(1.6, halfWidth + 1.45),
      delta: shoulderDelta,
      source: `${broadSource}; worn grass and compacted shoulder inferred from CMP asphalt-path and edge notes`
    }
  ];
}

function treeRootTerrainModifier(tree: MappedTree, index: number): TerrainModifier {
  const baseRadius =
    tree.profile === "oak" ? 4.9 : tree.profile === "elm" ? 4.25 : tree.profile === "gum" ? 3.6 : tree.profile === "jacaranda" ? 2.25 : tree.profile === "kurrajong" ? 2.55 : 3.2;
  const heightFactor = Math.min(0.055, ((tree.height ?? 11) / 30) * 0.04);
  const dbhFactor = Math.min(0.045, ((tree.dbh ?? 58) / 180) * 0.045);
  const variation = ((index % 7) - 3) * 0.006;
  return {
    id: `terrain-root-${tree.id}`,
    label: `${tree.label} root mound`,
    kind: "tree-root",
    shape: "radial",
    center: tree.position,
    radius: baseRadius + ((index % 5) - 2) * 0.18,
    delta: 0.046 + heightFactor + dbhFactor + variation,
    source: `${tree.source ?? "mapped tree"}; root flare and worn under-canopy ground inferred from significant-tree DBH/height context`
  };
}

function sportsFixtureObstacles(fixture: SportsFixture): CircularObstacle[] {
  if (fixture.kind === "basketball-hoop") {
    return [
      {
        id: `${fixture.id}-post`,
        label: fixture.label,
        sourceObjectId: fixture.id,
        sourceObjectKind: "sports-fixture",
        center: fixture.position,
        radius: fixture.radius,
        blocksSight: false
      }
    ];
  }

  return footballPostLocalOffsets(fixture.width).map((localX, index) => ({
    id: `${fixture.id}-post-${index + 1}`,
    label: fixture.label,
    sourceObjectId: fixture.id,
    sourceObjectKind: "sports-fixture",
    center: offsetPoint(fixture.position, fixture.angle, localX, 0),
    radius: fixture.radius,
    blocksSight: false
  }));
}

function cricketNetCageObstacles(detail: ParkLifeDetail): BoxObstacle[] {
  const wallThickness = 0.24;
  const halfWidth = CRICKET_NET_CAGE_WIDTH * 0.5;
  const halfLength = CRICKET_NET_CAGE_LENGTH * 0.5;
  const laneWidth = CRICKET_NET_CAGE_WIDTH / CRICKET_NET_LANE_COUNT;
  const dividerStartZ = -halfLength + CRICKET_NET_FRONT_LOBBY_LENGTH;
  const dividerHalfLength = (halfLength - dividerStartZ) * 0.5;
  const dividerCenterZ = (halfLength + dividerStartZ) * 0.5;
  const obstacle = (id: string, label: string, localX: number, localZ: number, halfX: number, halfZ: number): BoxObstacle => ({
    id: `${detail.id}-${id}`,
    label: `${detail.label} ${label}`,
    sourceObjectId: detail.id,
    sourceObjectKind: "park-life-detail",
    shape: "box",
    center: offsetPoint(detail.position, detail.angle, localX, localZ),
    halfX,
    halfZ,
    angle: detail.angle,
    blocksSight: false
  });

  return [
    obstacle("side-west", "west cage side", -halfWidth, 0, wallThickness * 0.5, halfLength),
    obstacle("side-east", "east cage side", halfWidth, 0, wallThickness * 0.5, halfLength),
    obstacle("rear", "rear cage wall", 0, halfLength, halfWidth, wallThickness * 0.5),
    ...Array.from({ length: CRICKET_NET_LANE_COUNT - 1 }, (_, index) =>
      obstacle(`lane-divider-${index + 1}`, `lane ${index + 1} divider net`, -halfWidth + laneWidth * (index + 1), dividerCenterZ, wallThickness * 0.18, dividerHalfLength)
    )
  ];
}

function cricketNetCageObstacleIds(detailId: string): string[] {
  return [
    `${detailId}-side-west`,
    `${detailId}-side-east`,
    `${detailId}-rear`,
    ...Array.from({ length: CRICKET_NET_LANE_COUNT - 1 }, (_, index) => `${detailId}-lane-divider-${index + 1}`)
  ];
}

function pathFromGeo(
  id: string,
  label: string,
  kind: LevelPath["kind"],
  points: readonly GeoPoint[],
  width: number,
  metadata: Pick<LevelPath, "surface" | "source"> = {}
): LevelPath {
  return {
    id,
    label,
    kind,
    points: polygonFromGeo(points),
    width,
    ...metadata
  };
}

function pathSurfacePatchesForPath(path: LevelPath, pathIndex: number): PathSurfacePatch[] {
  const patches: PathSurfacePatch[] = [];
  for (let segmentIndex = 0; segmentIndex < path.points.length - 1; segmentIndex += 1) {
    const a = path.points[segmentIndex];
    const b = path.points[segmentIndex + 1];
    const segmentLength = distance(a, b);
    if (segmentLength < 10 || (segmentIndex + pathIndex) % 3 !== 0) {
      continue;
    }
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    const normal = { x: -Math.sin(angle), z: Math.cos(angle) };
    const side = (segmentIndex + path.id.length) % 2 === 0 ? 1 : -1;
    const offset = path.width * 0.48 + 0.46;
    const t = 0.42 + ((segmentIndex % 4) - 1.5) * 0.045;
    const position = {
      x: a.x + (b.x - a.x) * t + normal.x * offset * side,
      z: a.z + (b.z - a.z) * t + normal.z * offset * side
    };
    patches.push({
      id: `surface-${path.id}-${segmentIndex + 1}`,
      label: `${path.label} feathered edge`,
      kind: path.surface === "gravel" || path.kind === "perimeter" ? "gravel-feather" : "path-edge-wear",
      material: path.surface === "gravel" || path.kind === "perimeter" ? "gravel" : "dirt",
      position,
      angle,
      length: Math.min(segmentLength * 0.62, 19),
      width: path.kind === "service" ? 0.74 : 0.94,
      source: `${path.source ?? "mapped path geometry"}; path-edge transition inferred from CMP asphalt-path and remnant-edge context`
    });
  }
  return patches;
}

function pathJunctionSurfacePatches(paths: readonly LevelPath[]): PathSurfacePatch[] {
  const patches: PathSurfacePatch[] = [];
  const used = new Set<string>();
  const pathPoints = paths.flatMap((path) => path.points.map((point) => ({ point, path })));

  pathPoints.forEach(({ point, path }, index) => {
    const nearbyPathIds = new Set(
      pathPoints
        .filter((candidate) => candidate.path.id !== path.id && distance(candidate.point, point) < Math.max(4.2, path.width + candidate.path.width))
        .map((candidate) => candidate.path.id)
    );
    if (nearbyPathIds.size === 0) {
      return;
    }
    const key = `${Math.round(point.x / 8)}:${Math.round(point.z / 8)}`;
    if (used.has(key)) {
      return;
    }
    used.add(key);
    patches.push({
      id: `surface-junction-${patches.length + 1}`,
      label: "Compacted path junction",
      kind: "path-junction-wear",
      material: path.surface === "gravel" ? "gravel" : "dirt",
      position: point,
      angle: (index % 12) * 0.26,
      length: Math.max(2.4, path.width * 1.45),
      width: Math.max(1.5, path.width * 1.05),
      source: "Derived from close OSM/mapped path nodes; compacted junction wear inferred from high-use path transitions"
    });
  });

  return patches.slice(0, 42);
}

function benchFacingVector(angle: number): Vec2 {
  return { x: Math.sin(angle), z: -Math.cos(angle) };
}

function directionBetween(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function benchAngleFacingTarget(position: Vec2, target: Vec2): number {
  const direction = directionBetween(position, target);
  return Math.atan2(direction.x, -direction.z);
}

function nearestPathSegment(
  position: Vec2,
  paths: readonly LevelPath[]
): { point: Vec2; start: Vec2; end: Vec2; distance: number } | undefined {
  let closest: { point: Vec2; start: Vec2; end: Vec2; distance: number } | undefined;
  for (const path of paths) {
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const start = path.points[index];
      const end = path.points[index + 1];
      const point = nearestPointOnSegment(position, start, end);
      const segmentDistance = distance(position, point);
      if (!closest || segmentDistance < closest.distance) {
        closest = { point, start, end, distance: segmentDistance };
      }
    }
  }
  return closest;
}

function benchAngleFromNearestPath(position: Vec2, paths: readonly LevelPath[], fallbackTarget: Vec2): number {
  const nearest = nearestPathSegment(position, paths);
  if (!nearest) {
    return benchAngleFacingTarget(position, fallbackTarget);
  }

  const tangent = Math.atan2(nearest.end.z - nearest.start.z, nearest.end.x - nearest.start.x);
  const target = nearest.distance > 0.2 ? nearest.point : fallbackTarget;
  const direction = directionBetween(position, target);
  const front = benchFacingVector(tangent);
  return front.x * direction.x + front.z * direction.z >= 0 ? tangent : tangent + Math.PI;
}

function surfacePatchBetweenGeo(
  id: string,
  label: string,
  kind: PathSurfacePatch["kind"],
  material: PathSurfacePatch["material"],
  a: GeoPoint,
  b: GeoPoint,
  width: number,
  source: string
): PathSurfacePatch {
  const start = geoToWorld(a);
  const end = geoToWorld(b);
  return {
    id,
    label,
    kind,
    material,
    position: { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 },
    angle: Math.atan2(end.z - start.z, end.x - start.x),
    length: distance(start, end),
    width,
    source
  };
}

export function createLevelData(): LevelData {
  const boundary = polygonFromGeo(PARK_BOUNDARY_GEO);
  const oval = polygonFromGeo(OVAL_GEO);
  const grandstand = polygonFromGeo(GRANDSTAND_GEO);
  const tennis = polygonFromGeo(TENNIS_GEO);
  const bowling = polygonFromGeo(BOWLS_GEO);
  const southAmenitiesBuildingSource = OSM_BUILDING_FOOTPRINTS_GEO.find((building) => building.id === "osm-building-242003562");
  if (!southAmenitiesBuildingSource) {
    throw new Error("Missing Alfred Crescent Sports Pavilion footprint");
  }
  const rotundaBuildingSource = OSM_BUILDING_FOOTPRINTS_GEO.find((building) => building.id === "osm-building-543505640");
  if (!rotundaBuildingSource) {
    throw new Error("Missing rotunda building footprint");
  }
  const entrancePavilionSource = OSM_BUILDING_FOOTPRINTS_GEO.find((building) => building.id === "osm-building-543505638");
  if (!entrancePavilionSource?.frontagePoint) {
    throw new Error("Missing timber entrance pavilion footprint or frontage");
  }
  const southAmenitiesBuilding = polygonFromGeo(southAmenitiesBuildingSource.points);
  const southAmenitiesFootprint = fittedFootprintFromPolygon(
    southAmenitiesBuilding,
    southAmenitiesBuildingSource.frontagePoint ? geoToWorld(southAmenitiesBuildingSource.frontagePoint) : undefined
  );
  const southAmenitiesRotation = -southAmenitiesFootprint.angle;
  const rotundaBuilding = polygonFromGeo(rotundaBuildingSource.points);
  const rotundaCenter = polygonCentroid(rotundaBuilding);
  const entrancePavilionPolygon = polygonFromGeo(entrancePavilionSource.points);
  const entrancePavilionFootprint = fittedFootprintFromPolygon(
    entrancePavilionPolygon,
    geoToWorld(entrancePavilionSource.frontagePoint)
  );
  const entrancePavilionPassageAccess = offsetPoint(
    entrancePavilionFootprint.center,
    entrancePavilionFootprint.angle,
    -entrancePavilionFootprint.halfX * 0.32,
    entrancePavilionFootprint.halfZ + 1.15
  );
  const rotundaRadius = Math.max(5.8, boundingRadius(rotundaBuilding, rotundaCenter) + 2.25);
  const southPlayground = polygonFromGeo(SOUTH_PLAYGROUND_GEO);
  const northPlayground = polygonFromGeo(NORTH_PLAYGROUND_GEO);
  const skate = polygonFromGeo(SKATE_GEO);
  const basketball = polygonFromGeo(BASKETBALL_GEO);
  const tableTennis = polygonFromGeo(TABLE_TENNIS_GEO);
  const northToilets = polygonFromGeo(NORTH_TOILETS_GEO);
  const basketballCenter = polygonCentroid(basketball);
  const tableTennisCenter = polygonCentroid(tableTennis);
  const northToiletsCenter = polygonCentroid(northToilets);
  const northToiletsFootprint = footprintFromPolygon(northToilets);
  const grandstandCenter = polygonCentroid(grandstand);
  const southPlaygroundCenter = polygonCentroid(southPlayground);
  const northPlaygroundCenter = polygonCentroid(northPlayground);
  // WorldBuilder orients playground details from each polygon's longest edge;
  // use that same fitted frame for blockers, access points and raised decks.
  const southPlaygroundFootprint = fittedFootprintFromPolygon(southPlayground);
  const northPlaygroundFootprint = fittedFootprintFromPolygon(northPlayground);
  const southPlaygroundTowerCenter = offsetPoint(
    southPlaygroundCenter,
    southPlaygroundFootprint.angle,
    -southPlaygroundFootprint.halfX * 0.18,
    -southPlaygroundFootprint.halfZ * 0.12
  );
  const northPlaygroundTowerCenter = offsetPoint(
    northPlaygroundCenter,
    northPlaygroundFootprint.angle,
    -northPlaygroundFootprint.halfX * 0.42,
    northPlaygroundFootprint.halfZ * 0.06
  );
  const skateCenter = polygonCentroid(skate);
  const skateFootprint = footprintFromPolygon(skate);
  const skateRotation = skateFootprint.angle;
  const skateBowls: SkateBowlFeature[] = [
    {
      id: "fitzy-west-double-bowl-north-lobe",
      label: "Fitzy Bowl retained west double bowl north lobe",
      groupId: "fitzy-west-double-bowl",
      center: offsetPoint(skateCenter, skateRotation, -2.8, -6.1),
      radiusX: 3.25,
      radiusZ: 3.05,
      angle: skateRotation + 0.04,
      depth: 0.42,
      exitAngle: Math.PI * 0.62,
      exitWidth: 0.24,
      difficulty: "beginner",
      source: FITZY_BOWL_SOURCE
    },
    {
      id: "fitzy-west-double-bowl-south-lobe",
      label: "Fitzy Bowl retained west double bowl south lobe",
      groupId: "fitzy-west-double-bowl",
      center: offsetPoint(skateCenter, skateRotation, -7.0, -5.7),
      radiusX: 3.45,
      radiusZ: 3.3,
      angle: skateRotation - 0.04,
      depth: 0.52,
      exitAngle: -Math.PI * 0.58,
      exitWidth: 0.22,
      difficulty: "beginner",
      source: FITZY_BOWL_SOURCE
    },
    {
      id: "fitzy-east-deep-bowl-north-lobe",
      label: "Fitzy Bowl retained east deep bowl north lobe",
      groupId: "fitzy-east-deep-bowl",
      center: offsetPoint(skateCenter, skateRotation, -2.9, 5.7),
      radiusX: 4.75,
      radiusZ: 5.0,
      angle: skateRotation + 0.08,
      depth: 1.2,
      exitAngle: Math.PI * 0.18,
      exitWidth: 0.22,
      difficulty: "deep",
      source: FITZY_BOWL_SOURCE
    },
    {
      id: "fitzy-east-deep-bowl-south-lobe",
      label: "Fitzy Bowl retained east deep bowl south lobe",
      groupId: "fitzy-east-deep-bowl",
      center: offsetPoint(skateCenter, skateRotation, -8.2, 6.3),
      radiusX: 4.9,
      radiusZ: 5.25,
      angle: skateRotation - 0.07,
      depth: 1.5,
      exitAngle: -Math.PI * 0.14,
      exitWidth: 0.22,
      difficulty: "deep",
      source: FITZY_BOWL_SOURCE
    }
  ];
  const rotundaLoop: LevelPath = {
    id: "rotunda-approach-loop",
    label: "Fitzroy Memorial Rotunda approach loop",
    kind: "footway",
    points: makeCircle(rotundaCenter, 12.2, 36),
    width: 2.45,
    source: "OSM way 543505640 rotunda footprint centroid; CMP rotunda path context"
  };
  const queenVictoriaPlinth = geoToWorld(g(-37.7872762, 144.9837025));
  const chandlerFountain = geoToWorld(g(-37.789505, 144.980304));
  const cookMemorial = geoToWorld(g(-37.7873520, 144.9855420));
  // Vicmap AERIAL_WM_256 pixel fit (approximately 360, 1221) places the visible arbour
  // immediately east of the square substation and just south of the exact OSM
  // bowling-club shell. The AWM/Places of Pride point falls on the club roof,
  // so it remains identity evidence rather than a survey-grade coordinate.
  const sportsmansMemorial = geoToWorld(g(-37.788058, 144.980790));
  const sportsmansMemorialAngle = -0.106;
  const sportsmansMemorialColumnObstacles: BoxObstacle[] = [
    ["west-south", -2.5, 1.1],
    ["west-north", -2.5, -1.1],
    ["centre-south", 0, 1.1],
    ["centre-north", 0, -1.1],
    ["east-south", 2.5, 1.1],
    ["east-north", 2.5, -1.1]
  ].map(([suffix, localX, localZ]) => {
    const numericX = Number(localX);
    const numericZ = Number(localZ);
    return {
      id: `sportsmans-memorial-column-${suffix}`,
      label: `Sportsman's Memorial ${String(suffix).replace("-", " ")} column pedestal`,
      sourceObjectId: "sportsmans-war-memorial",
      sourceObjectKind: "landmark" as const,
      shape: "box" as const,
      center: offsetPoint(sportsmansMemorial, sportsmansMemorialAngle, numericX, numericZ),
      halfX: 0.42,
      halfZ: 0.42,
      angle: sportsmansMemorialAngle,
      blocksSight: false
    };
  });
  const sportsmansSubstationWallObstacle: BoxObstacle = {
    id: "sportsmans-memorial-substation-wall-return",
    label: "Sportsman's Memorial photographed substation wall return",
    sourceObjectId: "sportsmans-war-memorial",
    sourceObjectKind: "landmark",
    shape: "box",
    center: offsetPoint(sportsmansMemorial, sportsmansMemorialAngle, -3.23, -0.26),
    halfX: 0.125,
    halfZ: 1.275,
    angle: sportsmansMemorialAngle
  };
  const northEastBluestonePlanter = geoToWorld(g(-37.7872483, 144.9852198));
  const roweStreetNorthPlanter = geoToWorld(g(-37.7872974, 144.9853708));
  const roweStreetSouthPlanter = geoToWorld(g(-37.7874553, 144.9853974));
  const stGeorgesDisplayBedNorth = geoToWorld(g(-37.78688, 144.98105));
  const stGeorgesDisplayBedCentral = geoToWorld(g(-37.78725, 144.98082));
  const stGeorgesDisplayBedSouth = geoToWorld(g(-37.78772, 144.98064));
  const rotundaShrubBedCentral = geoToWorld(g(-37.78757, 144.98082));
  const rotundaShrubBedNorth = geoToWorld(g(-37.78738, 144.98091));
  const rotundaShrubBedSouth = geoToWorld(g(-37.78776, 144.98076));
  const tennisAgapanthusStrip = geoToWorld(g(-37.78778, 144.98209));
  const southToilets = southAmenitiesFootprint.center;
  // The Blender pavilion follows the irregular 16-edge OSM shell. A fitted
  // rectangle spans empty T-plan corners and creates invisible roof floor, so
  // climbing uses the same polygon as the rendered building instead.
  const southToiletsRoofFootprint = raisedPolygon(southAmenitiesBuilding, southToilets);
  const southToiletsRoofRadius = Math.hypot(southAmenitiesFootprint.halfX, southAmenitiesFootprint.halfZ) + 0.45;
  const rotundaMapAngle = 0.34;
  const rotundaStairAccess = offsetPoint(rotundaCenter, rotundaMapAngle, 0, -7.25);
  const rotundaStairLanding = offsetPoint(rotundaCenter, rotundaMapAngle, 0, -3.45);
  const rotundaStairHeading = Math.atan2(
    rotundaStairLanding.z - rotundaStairAccess.z,
    rotundaStairLanding.x - rotundaStairAccess.x
  );
  // Match the eight Blender-asset Tuscan shafts. The main drum blocker is
  // bypassed while the deck interaction is active, but the columns remain
  // tangible so the open platform is navigable without becoming ghostlike.
  const rotundaColumnObstacles: CircularObstacle[] = Array.from({ length: 8 }, (_, index) => {
    const columnAngle = Math.PI / 2 + Math.PI / 8 + index * Math.PI / 4;
    const localX = Math.cos(columnAngle) * 4.03;
    const localZ = -Math.sin(columnAngle) * 4.03;
    return {
      id: `rotunda-column-${String(index + 1).padStart(2, "0")}`,
      label: `Fitzroy Memorial Rotunda column ${index + 1}`,
      sourceObjectId: "osm-building-543505640",
      sourceObjectKind: "mapped-building",
      center: offsetPoint(rotundaCenter, rotundaMapAngle, localX, localZ),
      radius: 0.31,
      blocksSight: false
    };
  });
  const southToiletsLadderAccess = polygonEdgePointFromLocal(
    southAmenitiesBuilding,
    southAmenitiesFootprint.center,
    southAmenitiesRotation,
    southAmenitiesFootprint.halfX * 0.86,
    -southAmenitiesFootprint.halfZ - 0.11
  );
  const southBbq = geoToWorld(g(-37.7890776, 144.9835871));
  const northBbq = geoToWorld(g(-37.7859107, 144.9831484));
  const northTableTennis = tableTennisCenter;
  const basketballFootprint = footprintFromPolygon(basketball);
  const basketballRotation = -basketballFootprint.angle;
  const basketballHoopOffset = Math.max(basketballFootprint.halfX, basketballFootprint.halfZ) * 0.74;
  const ovalCenter = polygonCentroid(oval);
  const grandstandFootprint = footprintFromPolygon(grandstand);
  // Level/collision geometry uses the standard map-plane angle. Three.js
  // meshes negate this angle at render time because of its Y-axis rotation
  // convention; using that render sign here mirrors lateral access points.
  const grandstandRotation = grandstandFootprint.angle;
  const grandstandFrontSign = localZFromPoint(grandstandCenter, grandstandRotation, ovalCenter) < 0 ? -1 : 1;
  const grandstandVisualHalfZ = grandstandFootprint.halfZ + 0.45;
  const grandstandStairAccess = offsetPoint(
    grandstandCenter,
    grandstandRotation,
    grandstandFootprint.halfX * 0.38,
    grandstandFrontSign * (grandstandVisualHalfZ + 2.3)
  );
  const grandstandStairLanding = offsetPoint(
    grandstandCenter,
    grandstandRotation,
    grandstandFootprint.halfX * 0.38,
    grandstandFrontSign * (grandstandVisualHalfZ - 0.86)
  );
  const grandstandStairHeading = Math.atan2(grandstandStairLanding.z - grandstandStairAccess.z, grandstandStairLanding.x - grandstandStairAccess.x);
  const grandstandStairAccessLocal = localPointFromWorld(grandstandCenter, grandstandFootprint.angle, grandstandStairAccess);
  const grandstandStairLandingLocal = localPointFromWorld(grandstandCenter, grandstandFootprint.angle, grandstandStairLanding);
  const grandstandStairGap: BoxObstacleAccessGap = {
    id: "grandstand-front-stair-gap",
    fixtureId: "grandstand-seats",
    localCenterX: (grandstandStairAccessLocal.x + grandstandStairLandingLocal.x) * 0.5,
    localCenterZ: (grandstandStairAccessLocal.z + grandstandStairLandingLocal.z) * 0.5,
    halfX: Math.max(2.4, grandstandFootprint.halfX * 0.28),
    halfZ: Math.abs(grandstandStairAccessLocal.z - grandstandStairLandingLocal.z) * 0.5 + 0.55
  };
  const grandstandDeckRadius = Math.max(12, boundingRadius(grandstand, grandstandCenter) + 1.2);
  const grandstandRaisedFootprint = raisedBox(grandstandCenter, grandstandFootprint.halfX + 0.8, grandstandFootprint.halfZ + 0.45, grandstandFootprint.angle);
  const southPlaygroundTowerFootprint = raisedBox(southPlaygroundTowerCenter, 5.7 * 0.5, 4.8 * 0.5, southPlaygroundFootprint.angle);
  const northPlaygroundTowerFootprint = raisedBox(northPlaygroundTowerCenter, 3.8 * 0.5, 3.2 * 0.5, northPlaygroundFootprint.angle);
  const playgroundAccess = (center: Vec2, angle: number, width: number, depth: number) =>
    offsetPoint(center, angle, -width * 0.18, -depth * 0.55 - 0.7);
  const ovalMinZ = Math.min(...oval.map((point) => point.z));
  const ovalMaxZ = Math.max(...oval.map((point) => point.z));
  const sportsFixtures: SportsFixture[] = [
    {
      id: "oval-north-football-goal",
      label: "W.T. Peterson Oval north football posts",
      kind: "football-goal",
      position: { x: ovalCenter.x, z: ovalMinZ + 8 * WORLD_SCALE },
      angle: 0,
      radius: 0.2,
      width: AUSTRALIAN_RULES_FULL_GOAL_WIDTH_METRES * WORLD_SCALE,
      height: AUSTRALIAN_RULES_GOAL_POST_HEIGHT_METRES,
      source: "Australian-rules goal/behind-post dimensions; W.T. Peterson Oval OSM/CMP geometry"
    },
    {
      id: "oval-south-football-goal",
      label: "W.T. Peterson Oval south football posts",
      kind: "football-goal",
      position: { x: ovalCenter.x, z: ovalMaxZ - 8 * WORLD_SCALE },
      angle: 0,
      radius: 0.2,
      width: AUSTRALIAN_RULES_FULL_GOAL_WIDTH_METRES * WORLD_SCALE,
      height: AUSTRALIAN_RULES_GOAL_POST_HEIGHT_METRES,
      source: "Australian-rules goal/behind-post dimensions; W.T. Peterson Oval OSM/CMP geometry"
    },
    {
      id: "basketball-west-hoop",
      label: "Basketball half-court west hoop",
      kind: "basketball-hoop",
      position: offsetPoint(basketballCenter, basketballRotation, -basketballHoopOffset, 0),
      angle: basketballRotation - Math.PI / 2,
      radius: 0.42,
      width: BASKETBALL_BACKBOARD_WIDTH_METRES,
      height: BASKETBALL_RIM_HEIGHT_METRES,
      source: "OSM basketball court footprint; standard 3.05m basketball rim height"
    },
    {
      id: "basketball-east-hoop",
      label: "Basketball half-court east hoop",
      kind: "basketball-hoop",
      position: offsetPoint(basketballCenter, basketballRotation, basketballHoopOffset, 0),
      angle: basketballRotation + Math.PI / 2,
      radius: 0.42,
      width: BASKETBALL_BACKBOARD_WIDTH_METRES,
      height: BASKETBALL_RIM_HEIGHT_METRES,
      source: "OSM basketball court footprint; standard 3.05m basketball rim height"
    }
  ];
  const railTrail = pathFromGeo("inner-circle-rail-trail", "Inner Circle Rail Trail", "rail", RAIL_TRAIL_GEO, 4.5, {
    surface: "asphalt",
    source: RAIL_TRAIL_SOURCE
  });

  const crescentPath = pathFromGeo(
    "alfred-crescent-inside-path",
    "Alfred Crescent path",
    "perimeter",
    ALFRED_CRESCENT_PATH_GEO,
    3.5,
    {
      surface: "asphalt",
      source: ALFRED_CRESCENT_PATH_SOURCE
    }
  );
  const englishOakAvenue = polygonFromGeo([
    g(-37.78705, 144.98558),
    g(-37.7873918, 144.9853250),
    g(-37.7877533, 144.9841097)
  ]);
  const osmPaths = OSM_EXTRA_PATHS_GEO.map((path) => pathFromGeo(path.id, path.label, path.kind, path.points, path.width, {
    surface: path.surface,
    source: path.source
  }));
  const amenityOrientationPaths = [railTrail, crescentPath, rotundaLoop, ...osmPaths];
  const emelyBakerNapierPaths = osmPaths.filter((path) =>
    [
      "osm-22673070-north-west-footpath",
      "osm-22768137-north-west-diagonal-footpath",
      "osm-1340462810-emely-baker-napier-footpath",
      "osm-22760900-north-west-short-footway"
    ].includes(path.id)
  );
  const buildingAccessPosition = (buildingId: string, fallback: GeoPoint, lateralOffset = 0, clearance = 1.2): Vec2 => {
    const building = OSM_BUILDING_FOOTPRINTS_GEO.find((candidate) => candidate.id === buildingId);
    if (!building) return geoToWorld(fallback);
    const polygon = polygonFromGeo(building.points);
    const center = polygonCentroid(polygon);
    const frontage = building.frontagePoint ? geoToWorld(building.frontagePoint) : geoToWorld(fallback);
    const footprint = fittedFootprintFromPolygon(polygon, frontage);
    const shiftedFrontage = lateralOffset === 0 ? frontage : offsetPoint(frontage, footprint.angle, lateralOffset, 0);
    return exteriorPointFromPolygon(shiftedFrontage, polygon, center, clearance);
  };
  const buildingSideAccessPosition = (buildingId: string, fallback: GeoPoint, alongZ: number, clearance = 1.2): Vec2 => {
    const building = OSM_BUILDING_FOOTPRINTS_GEO.find((candidate) => candidate.id === buildingId);
    if (!building) return geoToWorld(fallback);
    const polygon = polygonFromGeo(building.points);
    const footprint = fittedFootprintFromPolygon(
      polygon,
      building.frontagePoint ? geoToWorld(building.frontagePoint) : undefined
    );
    return offsetPoint(footprint.center, footprint.angle, footprint.halfX + clearance, alongZ);
  };
  const mappedAmenities: AmenityPoint[] = OSM_AMENITY_GEO.map((amenity) => {
    const position = geoToWorld(amenity.point);
    const visiblePosition =
      amenity.kind === "toilets" && pointInPolygon(position, southAmenitiesBuilding)
        ? exteriorPointFromPolygon(position, southAmenitiesBuilding, southToilets, 1.55)
        : amenity.kind === "toilets" && pointInPolygon(position, northToilets)
          ? exteriorPointFromPolygon(position, northToilets, northToiletsCenter)
          : position;
    return {
      id: amenity.id,
      label: amenity.label,
      kind: amenity.kind,
      position: visiblePosition,
      angle: amenity.kind === "bench" ? benchAngleFromNearestPath(visiblePosition, amenityOrientationPaths, polygonCentroid(boundary)) : undefined,
      source:
        amenity.kind === "bench"
          ? `OpenStreetMap amenity node ${amenity.id.replace("osm-", "")}; Yarra Edinburgh Gardens public facilities listing; bench orientation inferred from nearest mapped path because the OSM node has no direction`
          : `OpenStreetMap amenity node ${amenity.id.replace("osm-", "")}; Yarra Edinburgh Gardens public facilities listing`
    };
  });
  const featureAmenities: AmenityPoint[] = [
    { id: "north-table-tennis", label: "Northern activity table tennis", kind: "table_tennis", position: northTableTennis, source: TABLE_TENNIS_SOURCE }
  ];
  const structureAmenities: AmenityPoint[] = [
    {
      id: "grandstand-changeroom-access",
      label: "Grandstand changerooms",
      kind: "changeroom",
      position: offsetPoint(grandstandCenter, grandstandRotation, -grandstandFootprint.halfX * 0.64, grandstandFrontSign * (grandstandVisualHalfZ + 1.25)),
      linkedStructureId: "grandstand",
      source: `${STRUCTURE_ACCESS_SOURCE}; positioned on the oval-facing external changeroom side so it does not overlap the stair climb fixture`
    },
    {
      id: "grandstand-umpire-room-access",
      label: "Grandstand umpire room",
      kind: "umpire_room",
      position: exteriorPointFromPolygon(
        offsetPoint(grandstandCenter, grandstandRotation, grandstandFootprint.halfX * 0.64, grandstandFrontSign * (grandstandVisualHalfZ + 1.8)),
        grandstand,
        grandstandCenter,
        1.4
      ),
      linkedStructureId: "grandstand",
      source: `${STRUCTURE_ACCESS_SOURCE}; Yarra redevelopment source identifies refreshed umpire areas and secure access gates at the heritage grandstand`
    },
    {
      id: "tennis-clubroom-access",
      label: "Tennis clubroom",
      kind: "clubroom",
      position: exteriorPointFromPolygon(
        buildingAccessPosition("osm-building-403753784", g(-37.7880800, 144.9822400), -4.8, 1.3),
        tennis,
        polygonCentroid(tennis),
        1.2
      ),
      linkedStructureId: "osm-building-403753784",
      source: `${STRUCTURE_ACCESS_SOURCE}; Yarra redevelopment source specifically identifies an adjoining tennis social space and upgraded amenities`
    },
    {
      id: "bowling-clubroom-access",
      label: "Bowling clubroom",
      kind: "clubroom",
      position: buildingAccessPosition("osm-building-543505639", g(-37.7878200, 144.9806800), 2.0, 2.45),
      linkedStructureId: "osm-building-543505639",
      source: "OSM way 543505639; Lovell Chen Edinburgh Gardens CMP 2021 Figure 71 documents the glazed green-facing club frontage; the interaction point is fitted 2m along and 2.45m outside that mapped frontage so the full player proxy faces a clear glazed bay under the verandah, and is reached through the Hannah memorial gate"
    },
    {
      id: "timber-entrance-pavilion-passage",
      label: "Timber entrance pavilion passage",
      kind: "gatehouse",
      position: entrancePavilionPassageAccess,
      linkedStructureId: "osm-building-543505638",
      source: "OSM way 543505638; Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.6 and Figure 61 document the reconstructed timber pavilion's open central passage bays"
    },
    {
      id: "emely-baker-community-room",
      label: "Emely Baker community room",
      kind: "community_room",
      position: buildingAccessPosition("osm-building-543505702", g(-37.7856400, 144.9824800), 4.2, 1.85),
      linkedStructureId: "osm-building-543505702",
      source: "OSM way 543505702; Yarra Emely Baker Centre venue page and venue manual pages 3 and 9-11 for the access-friendly community room, current play-yard doors, gated outdoor area and shade sail"
    },
    {
      id: "emely-baker-kitchenette",
      label: "Emely Baker kitchenette",
      kind: "kitchenette",
      position: buildingAccessPosition("osm-building-543505702", g(-37.7856400, 144.9824800), -1.65, 1.85),
      linkedStructureId: "osm-building-543505702",
      source: "OSM way 543505702; Yarra Emely Baker Centre venue page and venue manual pages 7 and 10 list and photograph the kitchenette, small refrigerator and microwave; the interaction remains at the external community-room frontage"
    },
    {
      id: "emely-baker-exterior-service-cabinet",
      label: "Emely Baker exterior service cabinet",
      kind: "utility_box",
      position: buildingSideAccessPosition("osm-building-543505702", g(-37.7857420, 144.9826310), -5.05, 1.25),
      linkedStructureId: "osm-building-543505702",
      source: "OSM way 543505702; Lovell Chen Edinburgh Gardens CMP 2021 Figure 144 visibly documents the exterior wall-mounted service cabinet at the building end; the interaction is attached just outside that photographed end wall rather than the play-yard doors"
    },
    {
      id: "alfred-pavilion-main-entrance",
      label: "Alfred Crescent Pavilion clubroom entrance",
      kind: "clubroom",
      position: buildingAccessPosition("osm-building-242003562", g(-37.7883200, 144.9834200), 1.3, 1.65),
      linkedStructureId: "osm-building-242003562",
      source: "OSM way 242003562 version 5; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.3 and Figure 145 identify the pavilion's clubroom/social-room use and west paired glass entrance; ClarkeHopkinsClarke west-elevation photography resolves the clear covered approach"
    },
    {
      id: "alfred-pavilion-kiosk",
      label: "Alfred Crescent Pavilion oval-side kiosk",
      kind: "kiosk_hatch",
      position: exteriorPointFromPolygon(
        offsetPoint(
          southAmenitiesFootprint.center,
          southAmenitiesFootprint.angle,
          5.7,
          -southAmenitiesFootprint.halfZ - 1.65
        ),
        southAmenitiesBuilding,
        southAmenitiesFootprint.center,
        1.65
      ),
      linkedStructureId: "osm-building-242003562",
      source: "OSM way 242003562 version 5; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.3/Figure 145 identifies the pavilion kiosk and roller shutters on the north/east elevations; ClarkeHopkinsClarke east-elevation photography resolves the shuttered oval-facing bays"
    },
    {
      id: "alfred-pavilion-expanded-public-toilets",
      label: "Alfred Crescent Pavilion expanded public toilets",
      kind: "toilets",
      position: buildingAccessPosition("osm-building-242003562", g(-37.7883200, 144.9834200), -12.4, 1.85),
      linkedStructureId: "osm-building-242003562",
      source: "City of Yarra Alfred Crescent public-toilet proposal plan and render document the north-west extension, five additional gender-neutral cubicles, expanded female/ambulant facilities, exterior hand basins and screened canopy; City of Yarra 2021-22 Annual Report confirms the expansion was completed and opened"
    },
    {
      id: "alfred-pavilion-south-accessible-toilets",
      label: "Alfred Crescent Pavilion south accessible toilets",
      kind: "toilets",
      position: buildingSideAccessPosition("osm-building-242003562", g(-37.7884550, 144.9836000), 0.1, 2.0),
      linkedStructureId: "osm-building-242003562",
      source: "City of Yarra Alfred Crescent public-toilet plan identifies two existing DDA toilets at the pavilion's curved southern end; the plan states the new northern facilities are additional to these two accessible toilets"
    },
    {
      id: "north-toilets-south-west-stall-bank",
      label: "North public toilets south-west stall bank",
      kind: "toilets",
      position: offsetPoint(
        northToiletsCenter,
        northToiletsFootprint.angle,
        -northToiletsFootprint.halfX - 1.45,
        0.35
      ),
      linkedStructureId: "north-toilets",
      source: "OpenStreetMap way 307404819; City of Yarra north-toilet upgrade plan shows the external female, DDA and gender-neutral stall bank; the council as-built photograph fixes the current grey doors, blue signs and clear paved approach"
    },
    {
      id: "north-toilets-north-east-stall-bank",
      label: "North public toilets north-east stall bank",
      kind: "toilets",
      position: offsetPoint(
        northToiletsCenter,
        northToiletsFootprint.angle,
        northToiletsFootprint.halfX + 1.45,
        -0.35
      ),
      linkedStructureId: "north-toilets",
      source: "OpenStreetMap way 307404819; City of Yarra north-toilet upgrade plan shows the external gender-neutral, ambulant and urinal-side bank; positioned beyond the mapped wall on the documented continuous paved apron"
    },
    {
      id: "sportsmans-memorial-east-inscription",
      label: "Sportsman's Memorial east inscription",
      kind: "memorial_plaque",
      position: offsetPoint(sportsmansMemorial, sportsmansMemorialAngle, 3.72, 0),
      linkedStructureId: "sportsmans-war-memorial",
      source: "Australian War Memorial Places of Pride coordinate; Lovell Chen Edinburgh Gardens CMP 2021 Figures 62 and 64-65 place the recessed IN MEMORIAM inscription, rectangular swag panel and paired restored urns on the east elevation; City of Yarra's current Sportsman's Memorial page confirms the 2018 restoration and re-dedication"
    },
    {
      id: "rotunda-memorial-plaque",
      label: "Rotunda memorial plaque",
      kind: "memorial_plaque",
      position: exteriorPointFromPolygon(offsetPoint(rotundaCenter, -0.34, -2.3, -4.95), rotundaBuilding, rotundaCenter, 1.15),
      linkedStructureId: "osm-building-543505640",
      source: "OSM way 543505640; CMP 2004 rotunda description records World War memorial plaques, steps, raised platform and copper-domed Classical Revival fabric"
    }
  ];
  const amenities = [...mappedAmenities, ...featureAmenities, ...structureAmenities].filter((amenity) => pointInPolygon(amenity.position, boundary));
  const bikeRackPosition = mappedAmenities.find((amenity) => amenity.id === "osm-2987216934")?.position ?? geoToWorld(g(-37.7888610, 144.9836540));
  const baseParkLifeDetails = ([
    {
      id: "north-lawn-dog-sign",
      label: "North open lawn dog area sign",
      kind: "dog-sign",
      position: geoToWorld(g(-37.785900, 144.984235)),
      angle: 0.62,
      source: "Yarra Edinburgh Gardens facilities list: dog areas; OSM north open lawn geometry"
    },
    {
      id: "alfred-lawn-dog-sign",
      label: "Alfred Crescent lawn dog area sign",
      kind: "dog-sign",
      position: geoToWorld(g(-37.788010, 144.984745)),
      angle: -0.42,
      source: "Yarra Edinburgh Gardens facilities list: dog areas; OSM Alfred Crescent lawn geometry"
    },
    {
      id: "north-playground-dog-leash-rule",
      label: "North playground dog leash rule sign",
      kind: "park-rule-sign",
      rule: "dogs-on-leash",
      position: geoToWorld(g(-37.786155, 144.983065)),
      angle: 0.24,
      source: "Yarra Edinburgh Gardens venue conditions: dogs must be on leash within 10 metres of playground areas and sporting grounds"
    },
    {
      id: "south-playground-dog-leash-rule",
      label: "South playground dog leash rule sign",
      kind: "park-rule-sign",
      rule: "dogs-on-leash",
      position: geoToWorld(g(-37.788750, 144.983240)),
      angle: -0.12,
      source: "Yarra Edinburgh Gardens venue conditions: dogs must be on leash within 10 metres of playground areas and sporting grounds"
    },
    {
      id: "oval-dog-leash-rule",
      label: "W.T. Peterson Oval dog rule sign",
      kind: "park-rule-sign",
      rule: "dogs-on-leash",
      position: geoToWorld(g(-37.789210, 144.982020)),
      angle: -0.34,
      source: "Yarra Edinburgh Gardens venue conditions: dogs are not allowed on W.T. Peterson Oval and must be on leash near sporting grounds in use"
    },
    {
      id: "rotunda-stairs-no-power-rule",
      label: "Rotunda stairs and no-power sign",
      kind: "park-rule-sign",
      rule: "rotunda-stairs-no-power",
      position: offsetPoint(rotundaCenter, -0.34, 2.8, -8.35),
      angle: -0.34,
      source: "Yarra Edinburgh Gardens Rotunda venue page: rotunda is not wheelchair accessible and has no power currently available"
    },
    {
      id: "chandler-drinking-fountain",
      label: "Chandler Drinking Fountain",
      kind: "chandler-fountain",
      position: chandlerFountain,
      angle: 1.35,
      source: `${HERITAGE_FURNITURE_SOURCE}; Lovell Chen CMP 2021 section 3.2.8 and Figure 66 document the square Harcourt-granite fountain, two opposing semicircular bowls, four-column arched temple, dome and orb; the text places it at the two diagonal paths directly across from the relocated timber entrance pavilion, so the point is fitted to that mapped relationship but remains unsurveyed`
    },
    {
      id: "avenue-b-st-georges-fitzroy-council-bollard",
      label: "Avenue B Fitzroy Council Bollard",
      kind: "heritage-bollard",
      position: geoToWorld(g(-37.7870816, 144.9807819)),
      angle: -0.29,
      source: `${HERITAGE_FURNITURE_SOURCE}; CMP section 3.11.4 records exactly one surviving orb-topped casting at the St Georges Road entrance to Avenue B, with a second removed between 2010 and 2016; position uses the first interior OSM way 22760899 Avenue B entrance node because no bollard survey point is public`
    },
    {
      id: "grandstand-interpretive-sign",
      label: "Grandstand interpretive sign",
      kind: "interpretive-sign",
      position: geoToWorld(g(-37.788430, 144.981760)),
      angle: -0.18,
      source: `${HERITAGE_FURNITURE_SOURCE}; CMP figure 66 identifies contemporary interpretive signs, translated beside the heritage grandstand approach`
    },
    {
      id: "rotunda-interpretive-sign",
      label: "Rotunda interpretive sign",
      kind: "interpretive-sign",
      position: offsetPoint(rotundaCenter, -0.34, -2.8, -10.6),
      angle: -0.34,
      source: `${HERITAGE_FURNITURE_SOURCE}; CMP figure 66 identifies contemporary interpretive signs, translated beside the rotunda approach`
    },
    {
      id: "queen-victoria-interpretive-sign",
      label: "Queen Victoria plinth interpretive sign",
      kind: "interpretive-sign",
      position: geoToWorld(g(-37.787330, 144.983780)),
      angle: 0.38,
      source: `${HERITAGE_FURNITURE_SOURCE}; CMP records the Queen Victoria pedestal as primary-significance fabric, so the sign sits on the path edge rather than on the plinth`
    },
    {
      id: "south-picnic-blanket-1",
      label: "South picnic lawn blanket",
      kind: "picnic-blanket",
      position: geoToWorld(g(-37.788870, 144.983935)),
      angle: -0.22,
      source: "Yarra Edinburgh Gardens facilities list: picnic areas; mapped south picnic lawn"
    },
    {
      id: "south-picnic-blanket-2",
      label: "South picnic lawn blanket",
      kind: "picnic-blanket",
      position: geoToWorld(g(-37.789035, 144.984085)),
      angle: 0.36,
      source: "Yarra Edinburgh Gardens facilities list: picnic areas; mapped south picnic lawn"
    },
    {
      id: "south-picnic-alcohol-hours-rule",
      label: "South picnic lawn alcohol-hours sign",
      kind: "park-rule-sign",
      rule: "alcohol-hours",
      position: geoToWorld(g(-37.789115, 144.983920)),
      angle: 0.18,
      source: "Yarra Edinburgh Gardens venue conditions: alcohol may be consumed in the park between 9am and 9pm without a permit"
    },
    {
      id: "north-picnic-blanket",
      label: "North open lawn picnic blanket",
      kind: "picnic-blanket",
      position: geoToWorld(g(-37.786155, 144.983785)),
      angle: 0.18,
      source: "Yarra northern precinct consultation: picnic and BBQ activity context"
    },
    {
      id: "emely-baker-access-friendly-rule",
      label: "Emely Baker access-friendly venue sign",
      kind: "park-rule-sign",
      rule: "access-friendly",
      position: geoToWorld(g(-37.785665, 144.982625)),
      angle: 0.36,
      source: "Yarra Emely Baker Centre page: access friendly venue with gated outdoor area and shade sail"
    },
    {
      id: "oval-cricket-nets",
      label: "Oval cricket nets",
      kind: "cricket-nets",
      position: geoToWorld(g(-37.7896906, 144.9819917)),
      angle: -0.18,
      cricketNetLanes: 4,
      cricketNetEntranceCount: 1,
      cricketNetEnclosure: "galvanised-pipe-cyclone-wire-cage",
      cricketNetSurface: "concrete-artificial-turf",
      cricketNetRearMuralWall: true,
      source:
        "OpenStreetMap node 249041533 sport=cricket_nets; Edinburgh Gardens CMP 2004 section 3.4.4 records four concrete and artificial turf wickets with a galvanised pipe and cyclone wire enclosure plus a remnant concrete boundary-wall mural; Edinburgh Cricket Club confirms Brunswick Street Oval nets training; public 2014 route photo shows multi-lane netted cricket practice in Edinburgh Gardens"
    },
    {
      id: "rail-trail-flat-tyre-bike",
      label: "Flat-tyred bike beside Inner Circle Rail Trail",
      kind: "broken-bike",
      position: geoToWorld(g(-37.787245, 144.983020)),
      angle: -0.52,
      bikeIssue: "flat-tyres",
      source: "Yarra access context: Capital City Trail and foot/bike access"
    },
    {
      id: "south-bike-rack-locked-bike",
      label: "Locked bike chained to the bike racks",
      kind: "broken-bike",
      position: bikeRackPosition,
      angle: -0.18,
      bikeIssue: "locked",
      source: "OpenStreetMap bicycle_parking node 2987216934; locked-bike gameplay state uses the mapped bike rack as anchor"
    },
    {
      id: "freeman-gate-notice-board",
      label: "Freeman Street oval notice board",
      kind: "notice-board",
      position: geoToWorld(g(-37.789585, 144.980220)),
      angle: -0.22,
      source: "CMP/Fitzroy history context: Freeman Street gatehouse and Brunswick Street Oval entries"
    },
    {
      id: "alfred-crescent-notice-board",
      label: "Alfred Crescent park notice board",
      kind: "notice-board",
      position: geoToWorld(g(-37.787300, 144.985510)),
      angle: 2.55,
      source: "Yarra Edinburgh Gardens access context; Alfred Crescent entrance"
    },
    {
      id: "oval-training-cones",
      label: "Oval training cones",
      kind: "training-cones",
      position: geoToWorld(g(-37.789010, 144.981320)),
      angle: 0.12,
      source: "Yarra Edinburgh Gardens facilities list: sports oval; W.T. Peterson Oval map geometry"
    },
    {
      id: "north-dog-water-bowl",
      label: "Dog water bowl near north lawn",
      kind: "dog-water-bowl",
      position: geoToWorld(g(-37.785980, 144.984070)),
      angle: 0.34,
      source: "Yarra Edinburgh Gardens facilities list: dog areas and drinking fountains; north open-lawn activity context"
    },
    {
      id: "alfred-dog-water-bowl",
      label: "Dog water bowl near Alfred Crescent lawn",
      kind: "dog-water-bowl",
      position: geoToWorld(g(-37.788115, 144.984620)),
      angle: -0.4,
      source: "Yarra Edinburgh Gardens facilities list: dog areas; Alfred Crescent lawn activity context"
    },
    {
      id: "south-picnic-cooler",
      label: "Cooler on south picnic lawn",
      kind: "picnic-cooler",
      position: geoToWorld(g(-37.788955, 144.983870)),
      angle: 0.42,
      source: "Yarra Edinburgh Gardens facilities list: picnic and BBQ areas; south picnic lawn"
    },
    {
      id: "north-bbq-cooler",
      label: "Cooler by north BBQ lawn",
      kind: "picnic-cooler",
      position: geoToWorld(g(-37.785875, 144.983340)),
      angle: -0.18,
      source: "Yarra northern precinct consultation: BBQ, picnic and activity area context"
    },
    {
      id: "grandstand-sports-bag",
      label: "Sports bag near grandstand",
      kind: "sports-bag",
      position: geoToWorld(g(-37.789105, 144.980805)),
      angle: -0.28,
      source: "Yarra Brunswick Street Oval sports-club context; Kevin Murray Stand and W.T. Peterson Oval geometry"
    },
    {
      id: "oval-training-bag",
      label: "Training bag on oval edge",
      kind: "sports-bag",
      position: geoToWorld(g(-37.788860, 144.981420)),
      angle: 0.7,
      source: "Yarra Edinburgh Gardens facilities list: sports oval; local club training context"
    },
    {
      id: "basketball-chalk-scuffs",
      label: "Basketball court chalk scuffs",
      kind: "chalk-mark",
      position: geoToWorld(g(-37.788010, 144.983720)),
      angle: -0.35,
      source: "Yarra northern precinct consultation: basketball half-court activity context"
    },
    {
      id: "skate-chalk-mark",
      label: "Skate area chalk mark",
      kind: "chalk-mark",
      position: geoToWorld(g(-37.786535, 144.982965)),
      angle: 0.55,
      source: "Yarra northern precinct consultation: skate/BMX activity context"
    }
  ] satisfies ParkLifeDetail[]).filter((detail) => pointInPolygon(detail.position, boundary));
  const removedTrees = REDEVELOPMENT_REMOVED_TREES_GEO.map((tree) => ({
    ...tree,
    position: geoToWorld(tree.point)
  }));
  const removedTreePositions = removedTrees.map((tree) => tree.position);
  const removedTreeExclusionRadius = 5 * WORLD_SCALE;
  const significantTrees: SignificantTreePoint[] = YARRA_SIGNIFICANT_TREE_GEO.map((tree) => ({
    id: tree.id,
    commonName: tree.commonName,
    genus: tree.genus,
    species: tree.species,
    height: tree.height,
    dbh: tree.dbh,
    position: geoToWorld(tree.point)
  })).filter((tree) => removedTreePositions.every((removedPosition) => distance(tree.position, removedPosition) > removedTreeExclusionRadius));
  const removedTreeStumpDetails = removedTrees.map((tree): ParkLifeDetail => ({
    id: `brunswick-removed-tree-${tree.treePlanNumber}-stump`,
    label: `Removed ${tree.commonName} (tree ${tree.treePlanNumber})`,
    kind: "removed-tree-stump",
    position: tree.position,
    angle: tree.treePlanNumber * 0.47,
    source:
      `Urban Forestry Victoria Tree Protection and Management Plan tree ${tree.treePlanNumber} (${tree.commonName}), plan sheets TPP-A/TPP-B; Yarra states all 39 removals commenced 27 April 2026 and took approximately two weeks; PDF leader endpoint georeferenced at 0.766 game-unit RMS`
  }));
  const parkLifeDetails = [...baseParkLifeDetails, ...removedTreeStumpDetails].filter(
    (detail) => pointInPolygon(detail.position, boundary) && !UNSUPPORTED_FIXED_PARK_DETAIL_IDS.has(detail.id)
  );
  const cricketNetDetail = parkLifeDetails.find((detail) => detail.id === "oval-cricket-nets");
  const cricketNetFrameAccess = cricketNetDetail
    ? offsetPoint(cricketNetDetail.position, cricketNetDetail.angle, -CRICKET_NET_CAGE_WIDTH * 0.5 - 0.82, -CRICKET_NET_CAGE_LENGTH * 0.12)
    : null;
  const cricketNetFrameLanding = cricketNetDetail
    ? offsetPoint(cricketNetDetail.position, cricketNetDetail.angle, -CRICKET_NET_CAGE_WIDTH * 0.5 + 0.72, -CRICKET_NET_CAGE_LENGTH * 0.12)
    : null;
  const vicmapTreeRecords = VICMAP_TREE_GEO.map((tree) => ({
    ...tree,
    position: geoToWorld(tree.point)
  }))
    .filter((tree) => pointInPolygon(tree.position, boundary))
    .filter((tree) => removedTreePositions.every((removedPosition) => distance(tree.position, removedPosition) > removedTreeExclusionRadius));
  const osmTreeRecords = OSM_TREE_GEO.filter((tree) => !REDEVELOPMENT_REMOVED_TREE_NODE_IDS.has(tree.osmId))
    .map((tree) => ({
      ...tree,
      position: geoToWorld(tree.point)
    }))
    .filter((tree) => pointInPolygon(tree.position, boundary))
    .filter((tree) => removedTreePositions.every((removedPosition) => distance(tree.position, removedPosition) > removedTreeExclusionRadius));
  const elevationSamples = VICMAP_ELEVATION_GEO.map((sample) => ({
    position: geoToWorld(sample.point),
    altitude: sample.altitude,
    source: sample.source === "spot" ? ("vicmap-spot" as const) : ("vicmap-contour" as const)
  })).filter((sample) => pointInPolygon(sample.position, boundary));
  const elevationMin = Math.min(...elevationSamples.map((sample) => sample.altitude));
  const elevationMax = Math.max(...elevationSamples.map((sample) => sample.altitude));
  const hiddenSouthWestBike = buildingAccessPosition("osm-building-543505638", g(-37.7897200, 144.9801800), -3.4, 2.35);
  const rideableBikes = [
    {
      id: "rail-trail-flat-tyre-bike",
      label: "Flat-tyred rail trail bike",
      position: geoToWorld(g(-37.787245, 144.983020)),
      angle: -0.52,
      state: "flat-tyres" as const,
      requiredItem: "tyre-kit" as const,
      linkedDetailId: "rail-trail-flat-tyre-bike"
    },
    {
      id: "south-bike-rack-locked-bike",
      label: "Locked bike at the rack",
      position: bikeRackPosition,
      angle: -0.18,
      state: "locked" as const,
      requiredItem: "bolt-cutters" as const,
      linkedDetailId: "south-bike-rack-locked-bike",
      rackId: "osm-2987216934"
    },
    {
      id: "freeman-hidden-bike",
      label: "Hidden commuter bike behind the gatehouse",
      position: hiddenSouthWestBike,
      angle: 0.34,
      state: "available" as const
    }
  ].filter((bike) => pointInPolygon(bike.position, boundary));
  const itemSpawns = [
    {
      id: "bike-rack-tyre-kit",
      itemId: "tyre-kit" as const,
      label: "Tyre kit stashed by the bike racks",
      position: offsetPoint(bikeRackPosition, -0.18, 1.35, 0.85),
      angle: -0.18,
      source: "Gameplay placement tied to OSM bicycle_parking node 2987216934"
    },
    {
      id: "alfred-pavilion-service-bolt-cutters",
      itemId: "bolt-cutters" as const,
      label: "Bolt cutters in the Alfred Pavilion service recess",
      position: buildingSideAccessPosition("osm-building-242003562", g(-37.7884306, 144.9835333), -4.8, 1.65),
      angle: 0.42,
      source: "Fictional gameplay loot placement at the pavilion's south service-wall side; not evidence of a permanent real-world object"
    },
    {
      id: "alfred-pavilion-portable-ladder",
      itemId: "ladder" as const,
      label: "Portable ladder beside Alfred Crescent Pavilion",
      position: buildingAccessPosition("osm-building-242003562", g(-37.7884306, 144.9835333), -4.6, 2.05),
      angle: -0.62,
      source: "Fictional portable gameplay item beside the mapped pavilion; no fixed ladder or real-world roof-access fixture is asserted"
    },
    {
      id: "fitzy-bowl-skateboard",
      itemId: "skateboard" as const,
      label: "Skateboard left at Fitzy Bowl",
      position: offsetPoint(skateCenter, skateRotation, 2.2, 5.6),
      angle: skateRotation + 0.18,
      source: "Gameplay placement tied to the source-backed skate/BMX activity precinct"
    },
    {
      id: "north-bbq-noise-radio",
      itemId: "noise-radio" as const,
      label: "Wind-up radio near the north BBQ",
      position: offsetPoint(northBbq, 0.32, 2.1, -0.5),
      angle: 0.32,
      source: "Gameplay placement tied to the north BBQ activity area"
    },
    {
      id: "south-picnic-bottle-bomb",
      itemId: "noise-bottle" as const,
      label: "Bottle bomb tucked in the south picnic cooler",
      position: geoToWorld(g(-37.789040, 144.983735)),
      angle: -0.2,
      source: "Gameplay placement tied to the south picnic lawn use cues"
    }
  ].filter((item) => pointInPolygon(item.position, boundary));
  const mappedBuildings: MappedBuilding[] = OSM_BUILDING_FOOTPRINTS_GEO.map((building) => ({
    id: building.id,
    label: building.label,
    polygon: polygonFromGeo(building.points),
    height: building.height,
    material: building.material,
    detailProfile: building.detailProfile,
    facade: building.frontagePoint
      ? {
          frontagePoint: geoToWorld(building.frontagePoint),
          source: building.facadeSource ?? building.source
        }
      : undefined,
    source: building.source,
    collision: building.collision
  })).filter((building) => pointInPolygon(polygonCentroid(building.polygon), boundary));
  const mappedBuildingRoofHeight = (building: MappedBuilding): number => {
    switch (building.detailProfile) {
      case "tennis-pavilion":
        // The procedural gambrel/hipped roof ranges from 3.76 to 5.18 m.
        // Its mid-slope height gives the single walk plane the closest visual
        // fit while retaining the exact exterior outline for ladder placement.
        return 4.47;
      case "gatehouse":
        // Blender gable: 2.78 m eaves to 3.58 m ridge.
        return 3.18;
      case "bowling-club":
        // The broad 2025 zincalume lower roof is flat. The GLB is embedded
        // 0.08 m into average terrain, so its authored 3.19 m top is 3.11 m.
        return 3.11;
      case "community-centre":
        // Blender tray deck rises from 3.12 to 3.60 m and its root is embedded
        // 0.04 m; this is the centre-line height of that shallow skillion.
        return 3.32;
      default:
        // Generic mapped sheds render a 0.18 m roof prism from height + 0.08.
        return building.height + 0.26;
    }
  };
  const inBoundaryBuildingAccess = (buildingPolygon: readonly Vec2[], preferredPoint: Vec2): Vec2 => {
    const center = polygonCentroid(buildingPolygon);
    const candidates = buildingPolygon.map((start, index) => {
      const end = buildingPolygon[(index + 1) % buildingPolygon.length];
      const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
      const dx = midpoint.x - center.x;
      const dz = midpoint.z - center.z;
      const length = Math.hypot(dx, dz) || 1;
      return {
        x: midpoint.x + (dx / length) * 0.78,
        z: midpoint.z + (dz / length) * 0.78
      };
    });
    return candidates
      .filter((candidate) => pointInPolygon(candidate, boundary) && !pointInPolygon(candidate, buildingPolygon))
      .sort((a, b) => distance(a, preferredPoint) - distance(b, preferredPoint))[0]
      ?? exteriorPointFromPolygon(preferredPoint, buildingPolygon, center, 0.78);
  };
  const portableLadderRoofFixtures: InteractableFixture[] = mappedBuildings
    .filter((building) =>
      building.collision &&
      building.id !== "osm-building-242003562" && // Existing Alfred Pavilion ladder fixture.
      building.id !== "osm-building-543505640" && // Rotunda already has authored stairs.
      building.id !== "osm-man-made-715802679" // A storage tank, not a building.
    )
    .map((building) => {
      const center = polygonCentroid(building.polygon);
      const accessPosition = inBoundaryBuildingAccess(building.polygon, building.facade?.frontagePoint ?? center);
      return {
        id: `${building.id}-roof`,
        label: `${building.label} roof`,
        kind: "building" as const,
        position: center,
        accessPosition,
        landingPosition: center,
        exitPosition: accessPosition,
        accessRadius: 4.2,
        accessKind: "ladder" as const,
        radius: boundingRadius(building.polygon, center),
        height: mappedBuildingRoofHeight(building),
        // Keeping the actual mapped outline here is important: the placement
        // system derives the nearest exterior ladder edge from this footprint.
        raisedFootprint: raisedPolygon(building.polygon, center),
        surfaceGroundPoints: building.polygon.map((point) => ({ ...point })),
        prompt: "E: place portable ladder and climb",
        mode: "toggle" as const,
        bypassObstacleIds: [building.id]
      };
    });
  const northToiletsRoofFixture: InteractableFixture = {
    id: "north-toilets-roof",
    label: "North toilets roof",
    kind: "building",
    position: northToiletsCenter,
    accessPosition: inBoundaryBuildingAccess(northToilets, northToiletsCenter),
    landingPosition: northToiletsCenter,
    exitPosition: inBoundaryBuildingAccess(northToilets, northToiletsCenter),
    accessRadius: 4.2,
    accessKind: "ladder",
    radius: boundingRadius(northToilets, northToiletsCenter),
    // The two-stage Blender roof runs from 3.19 to 3.91 m and is embedded
    // 0.035 m into the average terrain support plane.
    height: 3.515,
    raisedFootprint: raisedPolygon(northToilets, northToiletsCenter),
    surfaceGroundPoints: northToilets.map((point) => ({ ...point })),
    prompt: "E: place portable ladder and climb",
    mode: "toggle",
    bypassObstacleIds: ["north-toilets"]
  };
  const emelyCourtyardWallObstacles: PolygonObstacle[] = (() => {
    const building = mappedBuildings.find((candidate) => candidate.id === "osm-building-543505702");
    if (!building) return [];
    const footprint = fittedFootprintFromPolygon(building.polygon, building.facade?.frontagePoint);
    const rotation = footprint.angle;
    const yardRearZ = footprint.halfZ + 0.04;
    const yardFrontZ = footprint.halfZ + 5.48;
    const yardMidZ = (yardRearZ + yardFrontZ) * 0.5;
    const yardDepth = yardFrontZ - yardRearZ;
    const outerWallWidth = footprint.halfX * 1.718;
    const sideWallX = footprint.halfX * 0.8595;
    const gateCenterZ = footprint.halfZ + 3.70;
    const gateHalfWidth = 0.86;
    const westRearEndZ = gateCenterZ - gateHalfWidth;
    const westFrontStartZ = gateCenterZ + gateHalfWidth;
    const wallSource = { sourceObjectId: building.id, sourceObjectKind: "mapped-building" as const };
    return [
      polygonObstacleFromPolygon(
        "emely-courtyard-outer-wall",
        "Emely Baker walled play yard",
        localRectPolygon(footprint.center, rotation, 0, yardFrontZ, outerWallWidth, 0.22),
        wallSource
      ),
      polygonObstacleFromPolygon(
        "emely-courtyard-side-wall-east",
        "Emely Baker walled play yard",
        localRectPolygon(footprint.center, rotation, sideWallX, yardMidZ, 0.22, yardDepth),
        wallSource
      ),
      polygonObstacleFromPolygon(
        "emely-courtyard-side-wall-west-rear",
        "Emely Baker walled play yard",
        localRectPolygon(
          footprint.center,
          rotation,
          -sideWallX,
          (yardRearZ + westRearEndZ) * 0.5,
          0.22,
          westRearEndZ - yardRearZ
        ),
        wallSource
      ),
      polygonObstacleFromPolygon(
        "emely-courtyard-side-wall-west-front",
        "Emely Baker walled play yard",
        localRectPolygon(
          footprint.center,
          rotation,
          -sideWallX,
          (westFrontStartZ + yardFrontZ) * 0.5,
          0.22,
          yardFrontZ - westFrontStartZ
        ),
        wallSource
      )
    ];
  })();
  const shelterForBuildingRoof = (
    id: string,
    label: string,
    weatherProtection: number,
    padX = 0.5,
    padZ = 0.5
  ): StructureShelter | null => {
    const building = mappedBuildings.find((candidate) => candidate.id === id);
    if (!building) return null;
    const footprint = footprintFromPolygon(building.polygon);
    return {
      id: `${id}-shelter`,
      label,
      kind: "roof",
      footprint: raisedBox(footprint.center, footprint.halfX + padX, footprint.halfZ + padZ, footprint.angle),
      weatherProtection,
      linkedStructureId: building.id,
      source: `${building.source}; ${STRUCTURE_SHELTER_SOURCE}; roof/eave shelter footprint is inferred from the mapped OSM building outline`
    };
  };
  const shelterForBuildingFrontage = (
    id: string,
    label: string,
    kind: StructureShelter["kind"],
    weatherProtection: number,
    depth: number,
    extraWidth = 0.8,
    front = true
  ): StructureShelter | null => {
    const building = mappedBuildings.find((candidate) => candidate.id === id);
    if (!building) return null;
    const footprint = footprintFromPolygon(building.polygon);
    const frontageLocal = building.facade?.frontagePoint ? localPointFromWorld(footprint.center, footprint.angle, building.facade.frontagePoint) : null;
    const frontageSign = (frontageLocal?.z ?? footprint.halfZ) >= 0 ? 1 : -1;
    const sideSign = front ? frontageSign : -frontageSign;
    const center = offsetPoint(footprint.center, footprint.angle, 0, sideSign * (footprint.halfZ + depth * 0.38));
    return {
      id: `${id}-${kind}-shelter`,
      label,
      kind,
      footprint: raisedBox(center, footprint.halfX + extraWidth, depth, footprint.angle),
      weatherProtection,
      linkedStructureId: building.id,
      source: `${building.facade?.source ?? building.source}; ${STRUCTURE_SHELTER_SOURCE}; exact awning/shade extents are inferred from the documented building use and reachable frontage`
    };
  };
  const bowlingClubVerandahShelters: StructureShelter[] = (() => {
    const building = mappedBuildings.find((candidate) => candidate.id === "osm-building-543505639");
    if (!building?.facade || building.polygon.length < 10) return [];
    const facade = building.facade;
    const edgeShelter = (suffix: string, label: string, start: Vec2, end: Vec2): StructureShelter => {
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz) || 1;
      const angle = Math.atan2(dz, dx);
      const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
      let normal = { x: -dz / length, z: dx / length };
      const towardFrontage = {
        x: facade.frontagePoint.x - midpoint.x,
        z: facade.frontagePoint.z - midpoint.z
      };
      if (normal.x * towardFrontage.x + normal.z * towardFrontage.z < 0) {
        normal = { x: -normal.x, z: -normal.z };
      }
      const depth = 1.9;
      const center = {
        x: midpoint.x + normal.x * depth * 0.42,
        z: midpoint.z + normal.z * depth * 0.42
      };
      return {
        id: `${building.id}-verandah-${suffix}-shelter`,
        label,
        kind: "verandah",
        footprint: raisedBox(center, length * 0.5 + 0.45, depth, angle),
        weatherProtection: 0.62,
        linkedStructureId: building.id,
        source: `${facade.source}; CMP Figure 71 and OSM way 543505639 control the two-segment green-facing verandah; the 1.9m weather-depth remains an explicit visual fit rather than a measured survey`
      };
    };
    // OSM vertices 6-7 and 8-9 are the two photographed green-facing wall
    // runs. Keeping separate boxes follows the real kinked frontage instead
    // of covering a distant axis-aligned bounding-box edge.
    return [
      edgeShelter("main", "Bowling club main green-facing verandah", building.polygon[6], building.polygon[7]),
      edgeShelter("east", "Bowling club east green-facing verandah", building.polygon[8], building.polygon[9])
    ];
  })();
  const emelyShadeSailShelter: StructureShelter | null = (() => {
    const building = mappedBuildings.find((candidate) => candidate.id === "osm-building-543505702");
    if (!building) return null;
    const footprint = fittedFootprintFromPolygon(building.polygon, building.facade?.frontagePoint);
    const center = offsetPoint(footprint.center, footprint.angle, -4.0, footprint.halfZ + 2.82);
    return {
      id: "osm-building-543505702-shade-sail-shelter",
      label: "Emely Baker shade-sail yard",
      kind: "shade-sail",
      footprint: raisedBox(center, 5.25, 2.30, footprint.angle),
      weatherProtection: 0.56,
      linkedStructureId: building.id,
      source: `${building.facade?.source ?? building.source}; ${STRUCTURE_SHELTER_SOURCE}; the shelter box conservatively fits the current manual photograph's left-hand triangular sail rather than covering the entire yard`
    };
  })();
  const structureShelters: StructureShelter[] = [
    {
      id: "rotunda-roof-shelter",
      label: "Rotunda roof shelter",
      kind: "roof",
      footprint: raisedCircle(rotundaCenter, 5.65),
      weatherProtection: 0.76,
      linkedStructureId: "osm-building-543505640",
      source: `OSM way 543505640 full JSON; Lovell Chen Edinburgh Gardens CMP 2021 Figures 142-143; Yarra Edinburgh Gardens Rotunda venue photographs; ${STRUCTURE_SHELTER_SOURCE}; the circular roof shelter follows the mapped Rotunda footprint and remains unpowered per the Yarra venue page`
    },
    {
      id: "grandstand-covered-seats-shelter",
      label: "Kevin Murray Stand covered seats",
      kind: "grandstand-cover",
      footprint: raisedBox(grandstandCenter, grandstandFootprint.halfX + 1.35, grandstandFootprint.halfZ + 1.05, grandstandFootprint.angle),
      weatherProtection: 0.82,
      linkedStructureId: "grandstand",
      source: `${STRUCTURE_SHELTER_SOURCE}; grandstand cover footprint is fitted from the Kevin Murray Stand polygon and current grandstand works context; exact roof-overhang extents are unavailable`
    },
    shelterForBuildingFrontage("osm-building-403753784", "Tennis pavilion verandah", "verandah", 0.62, 1.8, 1.1, true),
    ...bowlingClubVerandahShelters,
    emelyShadeSailShelter,
    shelterForBuildingRoof("osm-building-242003562", "Alfred Crescent Pavilion roof and public-toilet canopy", 0.7, 0.72, 0.72),
    {
      id: "north-toilets-roof-shelter",
      label: "North toilet block roof eaves",
      kind: "roof",
      footprint: raisedBox(northToiletsCenter, northToiletsFootprint.halfX + 0.72, northToiletsFootprint.halfZ + 0.72, northToiletsFootprint.angle),
      weatherProtection: 0.7,
      linkedStructureId: "north-toilets",
      source: `${STRUCTURE_SHELTER_SOURCE}; City of Yarra's as-built north-toilet photograph documents the broad exposed-steel skillion and alternating opaque/translucent eaves; the footprint is fitted from OSM way 307404819 and the photographed overhang`
    },
    shelterForBuildingRoof("osm-building-543505638", "Freeman Street gatehouse roof", 0.64, 0.7, 0.7)
  ]
    .filter((shelter): shelter is StructureShelter => shelter !== null)
    .filter((shelter) => pointInPolygon(shelter.footprint.center, boundary));
  const mappedFences: MappedFence[] = OSM_FENCES_GEO.map((fence) => ({
    id: fence.id,
    label: fence.label,
    points: polygonFromGeo(fence.points),
    height: fence.height,
    width: fence.width,
    jumpable: fence.jumpable,
    jumpBypassMinHeight: fence.jumpBypassMinHeight,
    source: fence.source,
    gates: fence.gates?.map((gate) => ({
      id: gate.id,
      label: gate.label,
      position: geoToWorld(gate.point),
      radius: gate.radius,
      source: gate.source
    }))
  })).filter((fence) => fence.points.some((point) => pointInPolygon(point, boundary)));
  const bowlingFence = mappedFences.find((fence) => fence.id === "bowling-precinct-perimeter-fence");
  const bowlingHannahGate = bowlingFence?.gates?.find((gate) => gate.id === "bowling-hannah-memorial-gate");
  const bowlingHannahGateAngle = bowlingFence && bowlingHannahGate ? nearestFenceSegmentAngle(bowlingFence.points, bowlingHannahGate.position) : 0;
  const hardscapeLines: HardscapeLine[] = HARDSCAPE_LINES_GEO.map((line) => ({
    id: line.id,
    label: line.label,
    kind: line.kind,
    points: polygonFromGeo(line.points),
    width: line.width,
    height: line.height,
    source: line.source
  })).filter((line) => line.points.some((point) => pointInPolygon(point, boundary)));
  const groundSurfacePolygons: GroundSurfacePolygon[] = [
    {
      id: "osm-1392352940-grandstand-parking",
      label: "Kevin Murray Stand parking apron",
      kind: "parking-apron" as const,
      material: "asphalt" as const,
      polygon: polygonFromGeo(GRANDSTAND_PARKING_GEO),
      source: GRANDSTAND_PARKING_SOURCE
    }
  ].filter((surface) => surface.polygon.every((point) => pointInPolygon(point, boundary)));
  const streetEdges: StreetEdge[] = STREET_EDGES_GEO.map((street) => ({
    id: street.id,
    label: street.label,
    kind: street.kind,
    points: polygonFromGeo(street.points),
    width: street.width,
    surface: street.surface,
    hasTram: street.hasTram,
    source: street.source
  }));

  const landmarks: Landmark[] = [
    { id: "park", label: "Edinburgh Gardens", kind: "park", polygon: boundary, source: "OpenStreetMap boundary way 13815924; Yarra Edinburgh Gardens reserve listing" },
    {
      id: "north-open-lawn",
      label: "North open lawn",
      kind: "garden",
      polygon: polygonFromGeo([
        g(-37.78570, 144.98265),
        g(-37.78634, 144.98270),
        g(-37.78675, 144.98324),
        g(-37.78628, 144.98430),
        g(-37.78583, 144.98448),
        g(-37.78550, 144.98355)
      ])
    },
    {
      id: "north-activity-precinct",
      label: "Northern playground, BBQ and skate activity precinct",
      kind: "garden",
      polygon: polygonFromGeo([
        g(-37.78566, 144.98272),
        g(-37.78607, 144.98258),
        g(-37.78674, 144.98286),
        g(-37.78686, 144.98338),
        g(-37.78624, 144.98374),
        g(-37.78576, 144.98337)
      ])
    },
    {
      id: "alfred-crescent-open-lawn",
      label: "Alfred Crescent open lawn",
      kind: "garden",
      polygon: polygonFromGeo([
        g(-37.78698, 144.98473),
        g(-37.78762, 144.98425),
        g(-37.78835, 144.98392),
        g(-37.78882, 144.98454),
        g(-37.78825, 144.98520),
        g(-37.78747, 144.98555)
      ])
    },
    {
      id: "south-picnic-lawn",
      label: "South picnic lawn",
      kind: "garden",
      polygon: polygonFromGeo([
        g(-37.78855, 144.98347),
        g(-37.78922, 144.98342),
        g(-37.78922, 144.98414),
        g(-37.78882, 144.98462),
        g(-37.78846, 144.98405)
      ])
    },
    {
      id: "osm-242003500-south-east-open-pitch",
      label: "South-east open grass pitch",
      kind: "garden",
      polygon: polygonFromGeo(SOUTH_EAST_PITCH_GEO),
      source: SOUTH_EAST_PITCH_SOURCE
    },
    { id: "oval", label: "W. T. Peterson Oval", kind: "oval", polygon: oval, source: OVAL_SOURCE },
    { id: "grandstand", label: "Kevin Murray Stand", kind: "grandstand", polygon: grandstand, source: GRANDSTAND_SOURCE },
    { id: "tennis", label: "Fitzroy Tennis Club", kind: "tennis", polygon: tennis, source: TENNIS_SOURCE },
    ...TENNIS_COURTS_GEO.map((court, index) => {
      const underConstruction = index >= 3;
      return {
        id: `tennis-court-${index + 1}`,
        label: `Court ${index + 1}`,
        kind: "court" as const,
        polygon: polygonFromGeo(court),
        courtStatus: underConstruction ? "under-construction" as const : "active-clay" as const,
        source: `${underConstruction ? TENNIS_COURT_WORKS_SOURCE : TENNIS_ACTIVE_COURT_SOURCE}; OSM way ${715802691 + index}`
      };
    }),
    { id: "bowling", label: "Fitzroy Victoria Bowling & Sports Club", kind: "bowls", polygon: bowling, source: BOWLING_SOURCE },
    ...BOWLS_GREENS_GEO.map((green, index) => ({
      id: `bowling-green-${index + 1}`,
      label: `Bowling green ${index + 1}`,
      kind: "bowls" as const,
      polygon: polygonFromGeo(green),
      source: `${BOWLING_SOURCE}; OSM way ${715802677 + index}`
    })),
    { id: "south-playground", label: "South playground", kind: "playground", polygon: southPlayground, source: SOUTH_PLAYGROUND_LAYOUT_SOURCE },
    { id: "north-playground", label: "North playground", kind: "playground", polygon: northPlayground, source: NORTH_PLAYGROUND_LAYOUT_SOURCE },
    { id: "skate", label: "Fitzroy Skatepark", kind: "skate", polygon: skate, source: SKATE_SOURCE },
    { id: "basketball", label: "Basketball court", kind: "basketball", polygon: basketball, source: BASKETBALL_SOURCE },
    {
      id: "stormwater-filtration-garden",
      label: "Stormwater filtration garden",
      kind: "garden",
      polygon: polygonFromGeo(STORMWATER_FILTRATION_GARDEN_GEO),
      gardenStyle: "stormwater-filtration",
      source: RAINGARDEN_SOURCE
    },
    {
      id: "raingarden-reservoir",
      label: "Raingarden underground storage tank",
      kind: "garden",
      polygon: polygonFromGeo(RAINGARDEN_RESERVOIR_GEO),
      gardenStyle: "stormwater-storage",
      source: RAINGARDEN_SOURCE
    },
    {
      id: "osm-715802699-central-garden-bed",
      label: "Central OSM garden bed",
      kind: "garden",
      polygon: polygonFromGeo(OSM_CENTRAL_GARDEN_BED_GEO),
      gardenStyle: "ornamental-shrub",
      source: OSM_CENTRAL_GARDEN_BED_SOURCE
    },
    {
      id: "st-georges-display-bed-north",
      label: "St Georges Road northern display bed",
      kind: "garden",
      polygon: capsulePolygon(stGeorgesDisplayBedNorth, ST_GEORGES_DISPLAY_BED_ANGLE, 17.5, 2.4, 6),
      gardenStyle: "ornamental-floral",
      source: GARDEN_BED_SOURCE
    },
    {
      id: "st-georges-display-bed-central",
      label: "St Georges Road central display bed",
      kind: "garden",
      polygon: capsulePolygon(stGeorgesDisplayBedCentral, ST_GEORGES_DISPLAY_BED_ANGLE, 18.5, 2.6, 6),
      gardenStyle: "ornamental-floral",
      source: GARDEN_BED_SOURCE
    },
    {
      id: "st-georges-display-bed-south",
      label: "St Georges Road southern display bed",
      kind: "garden",
      polygon: capsulePolygon(stGeorgesDisplayBedSouth, ST_GEORGES_DISPLAY_BED_ANGLE, 18.5, 2.6, 6),
      gardenStyle: "ornamental-floral",
      source: GARDEN_BED_SOURCE
    },
    {
      id: "rotunda-lawn-shrub-bed-central",
      label: "Rotunda Lawn central shrub bed",
      kind: "garden",
      polygon: capsulePolygon(rotundaShrubBedCentral, ST_GEORGES_DISPLAY_BED_ANGLE, 10.5, 2.5, 6),
      gardenStyle: "ornamental-shrub",
      source: GARDEN_BED_SOURCE
    },
    {
      id: "rotunda-lawn-shrub-bed-north",
      label: "Rotunda Lawn northern shrub bed",
      kind: "garden",
      polygon: capsulePolygon(rotundaShrubBedNorth, ST_GEORGES_DISPLAY_BED_ANGLE + Math.PI / 2, 7.4, 2.2, 6),
      gardenStyle: "ornamental-shrub",
      source: GARDEN_BED_SOURCE
    },
    {
      id: "rotunda-lawn-shrub-bed-south",
      label: "Rotunda Lawn southern shrub bed",
      kind: "garden",
      polygon: capsulePolygon(rotundaShrubBedSouth, ST_GEORGES_DISPLAY_BED_ANGLE + Math.PI / 2, 7.4, 2.2, 6),
      gardenStyle: "ornamental-shrub",
      source: GARDEN_BED_SOURCE
    },
    {
      id: "queen-victoria-circular-display-bed",
      label: "Queen Victoria circular display bed",
      kind: "garden",
      polygon: makeCircle(queenVictoriaPlinth, 6.2, 36),
      gardenStyle: "ornamental-floral",
      source: GARDEN_BED_SOURCE
    },
    {
      id: "tennis-agapanthus-strip",
      label: "Tennis Club agapanthus strip",
      kind: "garden",
      polygon: capsulePolygon(tennisAgapanthusStrip, -0.18, 31, 2.25, 6),
      gardenStyle: "agapanthus",
      source: GARDEN_BED_SOURCE
    },
    {
      id: "north-east-bluestone-shrub-planter",
      label: "North-east bluestone shrub planter",
      kind: "garden",
      polygon: makeCircle(northEastBluestonePlanter, BLUESTONE_PLANTER_RADIUS, 36),
      cover: "dense-shrub",
      source: SHRUB_PLANTER_SOURCE
    },
    {
      id: "rowe-street-north-entrance-planter",
      label: "Rowe Street north entrance planter",
      kind: "garden",
      polygon: makeCircle(roweStreetNorthPlanter, ROWE_ENTRANCE_PLANTER_RADIUS, 28),
      cover: "dense-shrub",
      source: SHRUB_PLANTER_SOURCE
    },
    {
      id: "rowe-street-south-entrance-planter",
      label: "Rowe Street south entrance planter",
      kind: "garden",
      polygon: makeCircle(roweStreetSouthPlanter, ROWE_ENTRANCE_PLANTER_RADIUS, 28),
      cover: "dense-shrub",
      source: SHRUB_PLANTER_SOURCE
    },
    { id: "north-toilets", label: "North toilets", kind: "toilets", polygon: northToilets, source: NORTH_TOILETS_SOURCE },
    { id: "south-bbq", label: "South BBQ", kind: "bbq", position: southBbq, radius: 3.5, source: "OpenStreetMap amenity=bbq node 4063310123; Yarra Edinburgh Gardens facilities listing" },
    { id: "north-bbq", label: "North BBQ", kind: "bbq", position: northBbq, radius: 3.5, source: "OpenStreetMap amenity=bbq node 6280110896; Yarra Edinburgh Gardens facilities listing" },
    { id: "rotunda", label: "Fitzroy Memorial Rotunda", kind: "rotunda", position: rotundaCenter, radius: rotundaRadius, source: "OpenStreetMap way 543505640; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.1 and Figures 142-143" },
    { id: "queen-victoria-plinth", label: "Queen Victoria plinth / Plinth Program", kind: "memorial", position: queenVictoriaPlinth, radius: 5.8, source: "OpenStreetMap historic=memorial node 2987256133; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.5; Yarra Plinth Program" },
    { id: "sportsmans-war-memorial", label: "Sportsman's War Memorial", kind: "memorial", position: sportsmansMemorial, radius: 4.5, angle: sportsmansMemorialAngle, source: "Vicmap Basemap AERIAL_WM_256 orthophoto pixel fit approximately -37.788058, 144.980790 places the visible arbour immediately east of the square substation and south of the exact OSM bowling-club wall; Australian War Memorial Places of Pride identifies the place but its -37.7880136, 144.9805024 pin visibly falls on the club roof and is not used as survey geometry; Heritage Council Victoria determination 21 April 2026 confirms the two-storey club close to the north, substation abutting the west, six Tuscan columns and diminished processional passage; City of Yarra confirms the completed 2018 restoration, replica porcelain wreath/bronze names panel and large reproductive team photograph; Lovell Chen CMP 2021 section 3.2.7 and Figures 62, 64-65 resolve the moulded arbour, south dedication, east IN MEMORIAM panel/swags/urns and adjacent wall faces; no public survey resolves the surrounding rosemary-hedge geometry" },
    { id: "cook-memorial-site", label: "Captain James Cook memorial", kind: "memorial", position: cookMemorial, radius: 4, source: "OpenStreetMap historic=memorial node 2987201733; Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.6 and Figure 148" }
  ];
  const structuralTreeExclusionKinds = new Set<Landmark["kind"]>(["basketball", "bowls", "court", "grandstand", "memorial", "oval", "playground", "rotunda", "skate", "tennis", "toilets"]);
  const treeExclusionZones: TreeExclusionZone[] = [
    ...mappedBuildings.map((building) => ({
      id: building.id,
      polygon: building.polygon,
      padding: building.detailProfile === "rotunda-pavilion" ? 2.8 : building.collision ? 1.45 : 0.75
    })),
    ...landmarks.flatMap((landmark): TreeExclusionZone[] => {
      if (!structuralTreeExclusionKinds.has(landmark.kind) && landmark.cover !== "dense-shrub" && landmark.gardenStyle !== "stormwater-filtration") {
        return [];
      }
      if (landmark.polygon) {
        return [
          {
            id: landmark.id,
            polygon: landmark.polygon,
            padding:
              landmark.cover === "dense-shrub" || landmark.gardenStyle === "stormwater-filtration"
                ? 0.35
                : landmark.kind === "playground" || landmark.kind === "skate"
                  ? 0.9
                  : 1.25
          }
        ];
      }
      if (landmark.position && landmark.radius) {
        return [{ id: landmark.id, center: landmark.position, radius: landmark.radius, padding: 0.35 }];
      }
      return [];
    })
  ];

  const treeLines = [
    samplePolyline(railTrail.points, 12),
    ...emelyBakerNapierPaths.map((path) => samplePolyline(path.points, 12)),
    samplePolyline(crescentPath.points, 15),
    samplePolyline(polygonFromGeo([g(-37.78605, 144.98115), g(-37.78685, 144.98172), g(-37.78754, 144.98218)]), 12),
    samplePolyline(polygonFromGeo([g(-37.78875, 144.98230), g(-37.78837, 144.98312), g(-37.78815, 144.98382)]), 12)
  ]
    .map((line) => line.filter((point) => pointInPolygon(point, boundary)))
    .filter((line) => line.length > 0);
  const trees: MappedTree[] = [];
  significantTrees.forEach((tree) => {
    appendMappedTree(
      trees,
      {
        id: tree.id,
        label: tree.commonName,
        position: tree.position,
        profile: treeProfileFromGenus(tree.genus),
        height: tree.height,
        dbh: tree.dbh,
        source: "Yarra significant trees dataset"
      },
      1.8,
      treeExclusionZones
    );
  });
  const heritageTreeLines = {
    elmAvenues: emelyBakerNapierPaths.map((path) => path.points),
    crescentPath: crescentPath.points,
    railTrail: railTrail.points,
    englishOakAvenue
  };
  vicmapTreeRecords.forEach((tree) => {
    const profile = inferMappedTreeProfile(tree.position, heritageTreeLines, significantTrees);
    const canopyGroup = isHeritageAvenuePoint(tree.position, heritageTreeLines) ? "avenue" : "mapped";
    appendMappedTree(
      trees,
      {
        id: `vicmap-tree-${tree.objectId}`,
        label: profile === "elm" ? "Vicmap elm-like tree" : profile === "oak" ? "Vicmap oak-like tree" : profile === "gum" ? "Vicmap gum-like tree" : "Vicmap tree",
        position: tree.position,
        profile,
        height: Math.max(tree.height, tree.canopyRadius * 1.85),
        canopyRadius: Math.max(3.1, Math.min(12.6, tree.canopyRadius * WORLD_SCALE)),
        canopyDensity: tree.dense ? 0.74 : 0.56,
        canopyGroup,
        source: `Vicmap Vegetation Tree Urban OBJECTID ${tree.objectId}`
      },
      5 * WORLD_SCALE,
      treeExclusionZones
    );
  });
  osmTreeRecords.forEach((tree) => {
    const profile = inferMappedTreeProfile(tree.position, heritageTreeLines, significantTrees);
    appendMappedTree(
      trees,
      {
        id: `osm-tree-${tree.osmId}`,
        label: profile === "elm" ? "Mapped elm tree" : profile === "oak" ? "Mapped oak tree" : profile === "gum" ? "Mapped gum tree" : "Mapped tree",
        position: tree.position,
        profile,
        source: `OpenStreetMap natural=tree node ${tree.osmId}`
      },
      10 * WORLD_SCALE,
      treeExclusionZones
    );
  });
  const treePoints = trees.filter((tree) => !tree.source?.includes("Yarra significant trees")).map((tree) => tree.position);
  const treeColliders: TreeCollider[] = trees.map((tree) => ({
    id: `tree-collider-${tree.id}`,
    label: `${tree.label} trunk`,
    position: tree.position,
    radius: treeColliderRadius(tree),
    source: tree.source
  }));
  const paths = amenityOrientationPaths;
  const terrainModifiers: TerrainModifier[] = [
    ...paths.flatMap(pathTerrainModifiers),
    ...trees.map(treeRootTerrainModifier),
    ...skateBowls.map(skateBowlTerrainModifier),
    {
      id: "terrain-oval-perimeter-bank",
      label: "W.T. Peterson Oval subtle perimeter banking",
      kind: "oval-banking",
      shape: "line",
      points: oval,
      innerWidth: 2.8,
      outerWidth: 8.6,
      delta: 0.11,
      source: "W.T. Peterson Oval OSM geometry; Vicmap broad slope context; oval banking inferred as playable micro-terrain"
    },
    ...hardscapeLines
      .filter((line) => line.kind === "bluestone-drain")
      .map((line) => ({
        id: `terrain-${line.id}-swale`,
        label: `${line.label} shallow swale`,
        kind: "drainage-swale" as const,
        shape: "line" as const,
        points: line.points,
        innerWidth: 0,
        outerWidth: Math.max(1.7, line.width * 2.4),
        delta: -0.09,
        source: `${line.source ?? "CMP hardscape line"}; local drainage depression inferred from bluestone-pitcher drain`
      }))
  ];
  const pathSurfacePatches = [
    ...paths.flatMap(pathSurfacePatchesForPath),
    ...pathJunctionSurfacePatches(paths),
    surfacePatchBetweenGeo(
      "surface-north-bbq-dog-lawn-desire-path",
      "North BBQ to open lawn desire path",
      "desire-path",
      "worn-grass",
      g(-37.7859107, 144.9831484),
      g(-37.786125, 144.984020),
      1.05,
      "Yarra Edinburgh Gardens facilities list: BBQ, picnic and dog areas; desire path inferred from north lawn high-use movement"
    ),
    surfacePatchBetweenGeo(
      "surface-south-picnic-lawn-desire-path",
      "South picnic lawn worn shortcut",
      "desire-path",
      "worn-grass",
      g(-37.789090, 144.983760),
      g(-37.788735, 144.984280),
      1.0,
      "Yarra Edinburgh Gardens facilities list: picnic areas; desire path inferred between south picnic tables and Alfred Crescent path"
    ),
    surfacePatchBetweenGeo(
      "surface-rotunda-platform-threshold",
      "Rotunda stair threshold wear",
      "muddy-threshold",
      "dirt",
      g(-37.787255, 144.981785),
      g(-37.787330, 144.981955),
      1.15,
      "CMP rotunda and path context; compacted stair threshold inferred at the rendered rotunda access side"
    ),
    surfacePatchBetweenGeo(
      "surface-grandstand-oval-threshold",
      "Grandstand to oval worn threshold",
      "muddy-threshold",
      "dirt",
      g(-37.789235, 144.980680),
      g(-37.789170, 144.981015),
      1.25,
      "CMP W.T. Peterson Oval and Kevin Murray Stand context; compacted transition inferred between stand and oval"
    )
  ].filter((patch) => pointInPolygon(patch.position, boundary));

  return {
    boundary,
    paths,
    landmarks,
    treeLines,
    treePoints,
    significantTrees,
    trees,
    treeColliders,
    elevationSamples,
    elevationMin,
    elevationMax,
    terrainModifiers,
    skateBowls,
    mappedBuildings,
    structureShelters,
    mappedFences,
    hardscapeLines,
    pathSurfacePatches,
    groundSurfacePolygons,
    streetEdges,
    sportsFixtures,
    obstacles: [
      boxObstacleFromPolygon(
        "grandstand",
        "Kevin Murray Stand",
        grandstand,
        0,
        0,
        { sourceObjectId: "grandstand", sourceObjectKind: "landmark" },
        [grandstandStairGap]
      ),
      polygonObstacleFromPolygon("north-toilets", "North toilets", northToilets, { sourceObjectId: "north-toilets", sourceObjectKind: "landmark" }),
      ...sportsmansMemorialColumnObstacles,
      sportsmansSubstationWallObstacle,
      {
        id: "north-playground",
        label: "North playground tower",
        sourceObjectId: "north-playground",
        sourceObjectKind: "landmark",
        shape: "box",
        center: northPlaygroundTowerCenter,
        halfX: northPlaygroundTowerFootprint.halfX,
        halfZ: northPlaygroundTowerFootprint.halfZ,
        angle: northPlaygroundTowerFootprint.angle,
        blocksSight: false
      },
      {
        id: "south-playground",
        label: "South playground tower",
        sourceObjectId: "south-playground",
        sourceObjectKind: "landmark",
        shape: "box",
        center: southPlaygroundTowerCenter,
        halfX: southPlaygroundTowerFootprint.halfX,
        halfZ: southPlaygroundTowerFootprint.halfZ,
        angle: southPlaygroundTowerFootprint.angle,
        blocksSight: false
      },
      ...mappedBuildings
        .filter((building) => building.collision && building.detailProfile !== "gatehouse")
        .map((building) =>
          polygonObstacleFromPolygon(building.id, building.label, building.polygon, {
            sourceObjectId: building.id,
            sourceObjectKind: "mapped-building"
          })
        ),
      ...rotundaColumnObstacles,
      ...mappedBuildings
        .filter((building) => building.collision && building.detailProfile === "gatehouse")
        .map((building) => {
          const footprint = fittedFootprintFromPolygon(building.polygon, building.facade?.frontagePoint);
          return {
            id: building.id,
            label: building.label,
            sourceObjectId: building.id,
            sourceObjectKind: "mapped-building" as const,
            shape: "box" as const,
            center: footprint.center,
            halfX: footprint.halfX,
            halfZ: footprint.halfZ,
            angle: footprint.angle,
            accessGaps: [
              {
                id: `${building.id}-open-west-passage`,
                localCenterX: -footprint.halfX * 0.32,
                localCenterZ: 0,
                halfX: footprint.halfX * 0.285,
                halfZ: footprint.halfZ + 1.35
              },
              {
                id: `${building.id}-open-east-passage`,
                localCenterX: footprint.halfX * 0.32,
                localCenterZ: 0,
                halfX: footprint.halfX * 0.285,
                halfZ: footprint.halfZ + 1.35
              }
            ]
          };
        }),
      ...emelyCourtyardWallObstacles,
      ...mappedFences.flatMap(fenceObstacles).filter((obstacle) => pointInPolygon(obstacle.center, boundary)),
      ...sportsFixtures.flatMap(sportsFixtureObstacles),
      ...parkLifeDetails.filter((detail) => detail.kind === "cricket-nets").flatMap(cricketNetCageObstacles),
      ...treeColliders.map((tree) => ({
        id: tree.id,
        label: tree.label,
        sourceObjectId: tree.id,
        sourceObjectKind: "tree-collider" as const,
        center: tree.position,
        radius: tree.radius,
        blocksSight: false
      }))
    ],
    spawnPoints: [
      geoToWorld(g(-37.78948, 144.98045)),
      geoToWorld(g(-37.78972, 144.98215)),
      geoToWorld(g(-37.78805, 144.98535)),
      geoToWorld(g(-37.78594, 144.98462)),
      geoToWorld(g(-37.78632, 144.98146)),
      geoToWorld(g(-37.78574, 144.98385)),
      geoToWorld(g(-37.78914, 144.98402))
    ],
    pickupPoints: [
      geoToWorld(g(-37.78850, 144.98320)),
      geoToWorld(g(-37.78722, 144.98330)),
      geoToWorld(g(-37.78672, 144.98260)),
      geoToWorld(g(-37.78920, 144.98292)),
      geoToWorld(g(-37.78736, 144.98514)),
      geoToWorld(g(-37.78616, 144.98190))
    ],
    upgradeStations: [
      { id: "rotunda-armory", label: "Rotunda armory", position: rotundaCenter, upgradeId: "damage" },
      { id: "tennis-locker", label: "Tennis locker", position: geoToWorld(g(-37.78808, 144.98224)), upgradeId: "magazine" },
      { id: "basketball-cache", label: "Basketball cache", position: geoToWorld(g(-37.78802, 144.98365)), upgradeId: "fireRate" },
      { id: "north-bbq-supplies", label: "BBQ supplies", position: northBbq, upgradeId: "reload" },
      { id: "south-playground-workbench", label: "Playground workbench", position: geoToWorld(g(-37.78904, 144.98386)), upgradeId: "spread" }
    ],
    interactables: [
      ...(bowlingHannahGate
        ? [
            {
              id: "bowling-hannah-memorial-gate-passage",
              label: "Hannah memorial entrance passage",
              kind: "gate" as const,
              position: bowlingHannahGate.position,
              radius: 3.4,
              height: 0,
              raisedFootprint: raisedBox(bowlingHannahGate.position, 2.7, 3.4, bowlingHannahGateAngle),
              prompt: "Walk through the Hannah memorial gate",
              mode: "auto" as const,
              // Limit the short passage override to the adjoining mapped
              // fence/outbuilding edges. The human-scale movement capsule now
              // respects the two visible brick piers as solid geometry.
              bypassObstacleIds: [
                "bowling-precinct-perimeter-fence-segment-2-1",
                "bowling-precinct-perimeter-fence-segment-4-1",
                "osm-building-1475006769"
              ]
            }
          ]
        : []),
      {
        id: "sportsmans-memorial-processional-bay",
        label: "Sportsman's Memorial processional bay",
        kind: "gate",
        position: offsetPoint(sportsmansMemorial, sportsmansMemorialAngle, 1.25, 1.6),
        radius: 3.8,
        height: 0,
        raisedFootprint: raisedBox(
          offsetPoint(sportsmansMemorial, sportsmansMemorialAngle, 1.25, 1.6),
          0.7,
          3.1,
          sportsmansMemorialAngle
        ),
        prompt: "Walk into the Sportsman's Memorial",
        mode: "auto",
        // The photographed bay is genuinely open. The human-scale capsule fits
        // between its now-solid columns; only the adjoining club shell needs a
        // short footprint-scoped override where the two mapped envelopes meet.
        bypassObstacleIds: [
          "osm-building-543505639"
        ]
      },
      {
        id: "rotunda-deck",
        label: "Rotunda raised platform",
        kind: "rotunda",
        position: rotundaCenter,
        accessPosition: rotundaStairAccess,
        landingPosition: rotundaStairLanding,
        exitPosition: rotundaStairAccess,
        accessRadius: 4.2,
        accessKind: "stairs",
        accessHeading: rotundaStairHeading,
        radius: 5.8,
        height: 2.0,
        raisedFootprint: raisedCircle(rotundaCenter, 5.05),
        prompt: "E: climb rotunda stairs",
        mode: "toggle",
        bypassObstacleIds: ["osm-building-543505640"]
      },
      {
        id: "grandstand-seats",
        label: "Kevin Murray Stand seats",
        kind: "grandstand",
        position: grandstandCenter,
        accessPosition: grandstandStairAccess,
        landingPosition: grandstandStairLanding,
        exitPosition: grandstandStairAccess,
        accessRadius: 5.5,
        accessKind: "stairs",
        accessHeading: grandstandStairHeading,
        radius: grandstandDeckRadius,
        height: 2.55,
        raisedFootprint: grandstandRaisedFootprint,
        prompt: "E: climb stand stairs",
        mode: "toggle",
        bypassObstacleIds: ["grandstand"]
      },
      {
        id: "north-playground-tower",
        label: "North playground tower",
        kind: "playground",
        position: northPlaygroundTowerCenter,
        accessPosition: playgroundAccess(northPlaygroundTowerCenter, northPlaygroundFootprint.angle, 3.8, 3.2),
        landingPosition: northPlaygroundTowerCenter,
        exitPosition: playgroundAccess(northPlaygroundTowerCenter, northPlaygroundFootprint.angle, 3.8, 3.2),
        accessRadius: 3.2,
        accessKind: "play-structure",
        radius: 3.5,
        height: 1.57,
        raisedFootprint: northPlaygroundTowerFootprint,
        prompt: "E: climb the playground tower",
        mode: "toggle",
        bypassObstacleIds: ["north-playground"]
      },
      {
        id: "south-playground-tower",
        label: "South playground tower",
        kind: "playground",
        position: southPlaygroundTowerCenter,
        accessPosition: playgroundAccess(southPlaygroundTowerCenter, southPlaygroundFootprint.angle, 5.7, 4.8),
        landingPosition: southPlaygroundTowerCenter,
        exitPosition: playgroundAccess(southPlaygroundTowerCenter, southPlaygroundFootprint.angle, 5.7, 4.8),
        accessRadius: 3.2,
        accessKind: "play-structure",
        radius: 3.5,
        height: 2.46,
        raisedFootprint: southPlaygroundTowerFootprint,
        prompt: "E: climb the playground tower",
        mode: "toggle",
        bypassObstacleIds: ["south-playground"]
      },
      {
        id: "alfred-pavilion-roof",
        label: "Alfred Crescent Sports Pavilion roof",
        kind: "toilets",
        position: southToilets,
        accessPosition: southToiletsLadderAccess,
        landingPosition: southToilets,
        exitPosition: southToiletsLadderAccess,
        accessRadius: 4.2,
        accessKind: "ladder",
        radius: southToiletsRoofRadius,
        height: 4.65,
        raisedFootprint: southToiletsRoofFootprint,
        surfaceGroundPoints: southAmenitiesBuilding.map((point) => ({ ...point })),
        prompt: "E: place portable ladder and climb",
        mode: "toggle",
        bypassObstacleIds: ["osm-building-242003562"]
      },
      northToiletsRoofFixture,
      ...portableLadderRoofFixtures,
      ...sportsFixtures
        .filter((fixture) => fixture.kind === "basketball-hoop")
        .map((fixture) => {
          const landingPosition = offsetPoint(fixture.position, fixture.angle, 0, 0.85);
          return {
            id: `${fixture.id}-frame`,
            label: `${fixture.label} frame`,
            kind: "basketball" as const,
            position: fixture.position,
            accessPosition: fixture.position,
            landingPosition,
            exitPosition: fixture.position,
            accessRadius: 3.4,
            accessKind: "frame" as const,
            radius: 1.35,
            height: 2.55,
            raisedFootprint: raisedCircle(landingPosition, 1.05),
            prompt: "E: climb the hoop frame",
            mode: "toggle" as const,
            bypassObstacleIds: [`${fixture.id}-post`]
          };
        }),
      ...(cricketNetDetail && cricketNetFrameAccess && cricketNetFrameLanding
        ? [
            {
              id: "oval-cricket-nets-frame",
              label: "Oval cricket nets cage",
              kind: "cricket-nets" as const,
              position: cricketNetDetail.position,
              accessPosition: cricketNetFrameAccess,
              landingPosition: cricketNetFrameLanding,
              exitPosition: cricketNetFrameAccess,
              accessRadius: 4.2,
              accessKind: "cage-frame" as const,
              accessHeading: cricketNetDetail.angle,
              radius: Math.max(CRICKET_NET_CAGE_WIDTH, CRICKET_NET_CAGE_LENGTH) * 0.5,
              height: 3.2,
              raisedFootprint: raisedBox(cricketNetDetail.position, CRICKET_NET_CAGE_WIDTH * 0.5, CRICKET_NET_CAGE_LENGTH * 0.5, cricketNetDetail.angle),
              prompt: "E: climb the cricket-net cage",
              mode: "toggle" as const,
              bypassObstacleIds: cricketNetCageObstacleIds(cricketNetDetail.id)
            }
          ]
        : []),
      {
        id: "skate-ramp",
        label: "Fitzy Bowl concrete deck",
        kind: "skate",
        position: skateCenter,
        accessKind: "ramp",
        radius: 16,
        height: 0.18,
        prompt: "Walk the skate deck",
        mode: "auto"
      }
    ],
    amenities,
    parkLifeDetails,
    weaponSpawns: [
      { id: "north-bbq-machete", label: "Machete near the north BBQ shelter", weaponId: "machete", position: northBbq },
      { id: "grandstand-shotgun", label: "Shotgun under the stand", weaponId: "shotgun", position: grandstandCenter },
      {
        id: "grandstand-flare-gun",
        label: "Signal flare gun beside the east grandstand stair",
        weaponId: "flareGun",
        position: offsetPoint(grandstandCenter, grandstandRotation, grandstandFootprint.halfX * 0.46, grandstandFrontSign * (grandstandVisualHalfZ + 4.15))
      },
      { id: "tennis-smg", label: "SMG in the tennis locker", weaponId: "smg", position: geoToWorld(g(-37.78808, 144.98224)) },
      { id: "rail-rifle", label: "Rifle by the rail trail", weaponId: "rifle", position: geoToWorld(g(-37.78708, 144.98304)) },
      { id: "rotunda-carbine", label: "Carbine ammo by the rotunda", weaponId: "carbine", position: rotundaCenter }
    ],
    itemSpawns,
    rideableBike: rideableBikes.find((bike) => bike.id === "freeman-hidden-bike") ?? rideableBikes[rideableBikes.length - 1],
    rideableBikes
  };
}

export function createDebugCircle(position: Vec2, radius: number): Landmark {
  return {
    id: "debug-circle",
    label: "Debug circle",
    kind: "garden",
    polygon: makeCircle(position, radius)
  };
}
