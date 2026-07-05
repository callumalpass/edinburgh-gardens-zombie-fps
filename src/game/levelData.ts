import {
  boundingRadius,
  geoToWorld,
  makeCircle,
  pointInPolygon,
  polygonCentroid,
  polygonFromGeo,
  samplePolyline
} from "./geo";
import type {
  AmenityPoint,
  BoxObstacle,
  CircularObstacle,
  GeoPoint,
  Landmark,
  LevelData,
  LevelPath,
  PolygonObstacle,
  SignificantTreePoint,
  Vec2
} from "./types";

const g = (lat: number, lon: number): GeoPoint => ({ lat, lon });

export const RESEARCH_NOTES = [
  "Yarra City Council describes Edinburgh Gardens as a 24 hectare park with open lawns, specimen trees, shaded areas and an extensive path network.",
  "Council-listed facilities include barbecue areas, basketball, dog areas, drinking fountains, pavilion, picnic areas, playgrounds, toilets, skate park and sports oval.",
  "Yarra's northern precinct material identifies the relocated table tennis table, BBQ/picnic tables, skate/BMX activity area and basketball half-court as a linked activity precinct.",
  "The OSM park boundary is way 13815924. Key OSM features used here include W. T. Peterson Oval, Fitzroy Tennis Club, Fitzroy Victoria Bowling & Sports Club, Inner Circle Rail Trail, basketball court, skate area, playgrounds, toilets and Kevin Murray Stand.",
  "Heritage material emphasizes mature elm avenues, nineteenth-century formal path structure, W.T. Peterson Oval, the former railway/shared path and the rotunda.",
  "Yarra public-art records identify the Queen Victoria statue plinth in a circular garden bed, the Sportsman's War Memorial behind the bowls club, and the rotating Plinth Program work currently represented as Zone Red."
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

const TENNIS_GEO = [
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

const OSM_TREE_GEO = [
  g(-37.7883498, 144.9829196),
  g(-37.7882993, 144.9830167),
  g(-37.7882872, 144.9831444),
  g(-37.7883033, 144.9832237),
  g(-37.7883417, 144.983331),
  g(-37.7884043, 144.9833949),
  g(-37.7887193, 144.9824878),
  g(-37.7888082, 144.9824724),
  g(-37.7888849, 144.9824699),
  g(-37.7889637, 144.9824878),
  g(-37.7890384, 144.9825184),
  g(-37.7891131, 144.9825695),
  g(-37.7891817, 144.9826334),
  g(-37.7892484, 144.982705),
  g(-37.7893009, 144.9827944),
  g(-37.7893372, 144.982871),
  g(-37.7893897, 144.9829809),
  g(-37.789416, 144.9830933),
  g(-37.78942, 144.9831879),
  g(-37.7896704, 144.9823038),
  g(-37.7895856, 144.982314),
  g(-37.7894866, 144.9823345),
  g(-37.7893917, 144.9823447),
  g(-37.7893049, 144.9823549),
  g(-37.789214, 144.9823651),
  g(-37.7891292, 144.9823804),
  g(-37.789628, 144.9821837),
  g(-37.7895513, 144.982199),
  g(-37.7894281, 144.9822169),
  g(-37.7893473, 144.9822297),
  g(-37.789206, 144.9822604),
  g(-37.7889515, 144.9822961),
  g(-37.7888728, 144.9823217),
  g(-37.7887536, 144.9823447),
  g(-37.788685, 144.9823166),
  g(-37.7885053, 144.9823421),
  g(-37.7884709, 144.9822195),
  g(-37.7884548, 144.9820917),
  g(-37.7886325, 144.9821965),
  g(-37.788788, 144.9821914),
  g(-37.7889111, 144.9821939),
  g(-37.789002, 144.9821914),
  g(-37.7890949, 144.9821811),
  g(-37.7891999, 144.9821658),
  g(-37.7892928, 144.9821479),
  g(-37.7894079, 144.9821096),
  g(-37.7895068, 144.9819972),
  g(-37.7896926, 144.9817314),
  g(-37.7897189, 144.9816446),
  g(-37.7897451, 144.9815398),
  g(-37.7897471, 144.9814018),
  g(-37.7897249, 144.9812255),
  g(-37.7897148, 144.9811182),
  g(-37.7896966, 144.980993),
  g(-37.7896906, 144.9808984),
  g(-37.7896825, 144.9808116),
  g(-37.7896522, 144.9806455),
  g(-37.7894988, 144.9803235),
  g(-37.7891732, 144.9802473),
  g(-37.7889422, 144.9802646),
  g(-37.7888723, 144.980278),
  g(-37.7887993, 144.9802915),
  g(-37.788734, 144.9803165),
  g(-37.7885212, 144.9804704),
  g(-37.78843, 144.9806165),
  g(-37.7883951, 144.9807088),
  g(-37.7882461, 144.9803665),
  g(-37.7882553, 144.9804819),
  g(-37.7882765, 144.9806127),
  g(-37.7883267, 144.9808896),
  g(-37.7882993, 144.9811627),
  g(-37.7882082, 144.9811761),
  g(-37.7883632, 144.9810281),
  g(-37.7882006, 144.9808357),
  g(-37.7881534, 144.9809204),
  g(-37.7881048, 144.9809877),
  g(-37.7882264, 144.9809915),
  g(-37.7881823, 144.9810857),
  g(-37.7881975, 144.9806627),
  g(-37.788158, 144.9805146),
  g(-37.7885835, 144.9802857),
  g(-37.788655, 144.9802569),
  g(-37.7887568, 144.9802357),
  g(-37.7888541, 144.9802184),
  g(-37.78893, 144.980205),
  g(-37.7890106, 144.9801954),
  g(-37.7890881, 144.980178),
  g(-37.7891702, 144.9801627),
  g(-37.7892993, 144.9801454),
  g(-37.7893738, 144.9801261),
  g(-37.7894331, 144.9801184),
  g(-37.7894893, 144.9801069),
  g(-37.7897294, 144.9806281),
  g(-37.7897355, 144.9807454),
  g(-37.7897553, 144.9809281),
  g(-37.7897644, 144.9810165),
  g(-37.7897644, 144.9810915),
  g(-37.7897765, 144.9811954),
  g(-37.7897872, 144.98128),
  g(-37.7897963, 144.9813838),
  g(-37.7898069, 144.9814781),
  g(-37.789813, 144.9815838),
  g(-37.78981, 144.9817261),
  g(-37.789589, 144.9820845),
  g(-37.7898237, 144.9821761),
  g(-37.7897522, 144.9820723),
  g(-37.7883575, 144.9818114),
  g(-37.7884819, 144.9818076),
  g(-37.788468, 144.9817284),
  g(-37.7886332, 144.982549),
  g(-37.7885654, 144.9825886),
  g(-37.7885602, 144.9835939),
  g(-37.7887114, 144.9835345),
  g(-37.78888, 144.9834685),
  g(-37.7888922, 144.9836159),
  g(-37.7890017, 144.9834399),
  g(-37.7892451, 144.9834685),
  g(-37.7892573, 144.9833475),
  g(-37.7893755, 144.9832925),
  g(-37.7893599, 144.9834443),
  g(-37.7893216, 144.9836731),
  g(-37.7892764, 144.9837853),
  g(-37.7892051, 144.9839349),
  g(-37.7891356, 144.9840691),
  g(-37.7890487, 144.9842231),
  g(-37.7898375, 144.9820903),
  g(-37.7897294, 144.9802127),
  g(-37.7897416, 144.9803223),
  g(-37.7897553, 144.9804742),
  g(-37.7897294, 144.9806281),
  g(-37.7896224, 144.9830198),
  g(-37.7896902, 144.9831979),
  g(-37.7898101, 144.9831782),
  g(-37.7899336, 144.9831562),
  g(-37.7900153, 144.9831408),
  g(-37.7892399, 144.9846323),
  g(-37.789445, 144.9847709),
  g(-37.7893407, 144.9847071),
  g(-37.7898327, 144.9850194),
  g(-37.7899283, 144.9850876),
  g(-37.790024, 144.9851492),
  g(-37.7895148, 144.9850527),
  g(-37.7896519, 144.9851444),
  g(-37.7895175, 144.9854606),
  g(-37.7893818, 144.985374),
  g(-37.7893189, 144.9855331),
  g(-37.7892625, 144.9856741),
  g(-37.7893189, 144.9859427),
  g(-37.7899101, 144.981863),
  g(-37.78989, 144.9817322),
  g(-37.7898889, 144.9816209),
  g(-37.7898646, 144.981466),
  g(-37.7898296, 144.9811857),
  g(-37.7898148, 144.9810523),
  g(-37.7898052, 144.9809316),
  g(-37.7897888, 144.9807874),
  g(-37.7897692, 144.9806473),
  g(-37.7900967, 144.9822278),
  g(-37.7900612, 144.9799713),
  g(-37.7899732, 144.9799848),
  g(-37.7898926, 144.9800022),
  g(-37.7900378, 144.9819535),
  g(-37.7900055, 144.9817443),
  g(-37.7899854, 144.9815371),
  g(-37.7899732, 144.9813929),
  g(-37.7899276, 144.9811113),
  g(-37.7899123, 144.9809644),
  g(-37.7898815, 144.9807579),
  g(-37.7898603, 144.9805601),
  g(-37.7898084, 144.9801128),
  g(-37.7898407, 144.9803522)
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

const OSM_EXTRA_PATHS_GEO: Array<{
  id: string;
  label: string;
  kind: LevelPath["kind"];
  width: number;
  points: GeoPoint[];
}> = [
  {
    id: "osm-north-curve",
    label: "Northern shared path curve",
    kind: "cycleway",
    width: 3.2,
    points: [
      g(-37.7899444, 144.9822003),
      g(-37.7899283, 144.9822478),
      g(-37.7898832, 144.9822842),
      g(-37.7898110, 144.9823323),
      g(-37.7897436, 144.9823969),
      g(-37.7896922, 144.9824589),
      g(-37.7896346, 144.9825600),
      g(-37.7895872, 144.9826804),
      g(-37.7895573, 144.9828374),
      g(-37.7895534, 144.9829676)
    ]
  },
  {
    id: "osm-eastern-diagonal",
    label: "Eastern diagonal shared path",
    kind: "cycleway",
    width: 3.2,
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
    id: "osm-east-outer-connector",
    label: "Eastern outer connector",
    kind: "cycleway",
    width: 3.2,
    points: [
      g(-37.7867519, 144.9835302),
      g(-37.7867948, 144.9843718),
      g(-37.7870277, 144.9848857),
      g(-37.7873277, 144.9855730),
      g(-37.7873496, 144.9856356)
    ]
  },
  {
    id: "osm-west-to-central-spine",
    label: "West to central shared path",
    kind: "cycleway",
    width: 3.2,
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
    points: [
      g(-37.7877019, 144.9824490),
      g(-37.7867059, 144.9826271),
      g(-37.7863671, 144.9826611)
    ]
  },
  {
    id: "osm-east-crescent-spine",
    label: "Eastern crescent shared path",
    kind: "cycleway",
    width: 3.2,
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
    id: "osm-south-playground-path",
    label: "South playground path",
    kind: "footway",
    width: 2.35,
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
    id: "osm-oval-loop-detailed",
    label: "Detailed oval loop",
    kind: "footway",
    width: 2.35,
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
    id: "osm-western-perimeter-walk",
    label: "Western perimeter walk",
    kind: "footway",
    width: 2.35,
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
    points: [
      g(-37.7867519, 144.9832799),
      g(-37.7866853, 144.9833360),
      g(-37.7866155, 144.9833911),
      g(-37.7864878, 144.9835046),
      g(-37.7863763, 144.9836267),
      g(-37.7861855, 144.9838569),
      g(-37.7859581, 144.9841329),
      g(-37.7857044, 144.9844439),
      g(-37.7855758, 144.9845932)
    ]
  },
  {
    id: "osm-north-south-spine",
    label: "North-south shared path spine",
    kind: "cycleway",
    width: 3.2,
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
    points: [
      g(-37.7896570, 144.9800422),
      g(-37.7896860, 144.9801210),
      g(-37.7898155, 144.9813535),
      g(-37.7899119, 144.9820840),
      g(-37.7899244, 144.9822066)
    ]
  },
  {
    id: "osm-plinth-garden-loop",
    label: "Queen Victoria plinth garden loop",
    kind: "footway",
    width: 2.35,
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
  { id: "osm-13228751786", kind: "bench", label: "Bench", point: g(-37.7862474, 144.9814380) },
  { id: "osm-13228770248", kind: "bench", label: "Bench", point: g(-37.7870194, 144.9808238) },
  { id: "osm-13228778695", kind: "bench", label: "Bench", point: g(-37.7866700, 144.9816652) }
];

function obstacleFromPolygon(id: string, label: string, polygon: Vec2[], padding: number): CircularObstacle {
  const center = polygonCentroid(polygon);
  return {
    id,
    label,
    center,
    radius: boundingRadius(polygon, center) + padding
  };
}

function boxObstacleFromPolygon(id: string, label: string, polygon: Vec2[], paddingX: number, paddingZ: number): BoxObstacle {
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
    shape: "box",
    center,
    halfX: halfX + paddingX,
    halfZ: halfZ + paddingZ,
    angle
  };
}

function polygonObstacleFromPolygon(id: string, label: string, polygon: Vec2[]): PolygonObstacle {
  return {
    id,
    label,
    shape: "polygon",
    center: polygonCentroid(polygon),
    polygon
  };
}

function pathFromGeo(id: string, label: string, kind: LevelPath["kind"], points: readonly GeoPoint[], width: number): LevelPath {
  return {
    id,
    label,
    kind,
    points: polygonFromGeo(points),
    width
  };
}

export function createLevelData(): LevelData {
  const boundary = polygonFromGeo(PARK_BOUNDARY_GEO);
  const oval = polygonFromGeo(OVAL_GEO);
  const grandstand = polygonFromGeo(GRANDSTAND_GEO);
  const tennis = polygonFromGeo(TENNIS_GEO);
  const bowling = polygonFromGeo(BOWLS_GEO);
  const southPlayground = polygonFromGeo(SOUTH_PLAYGROUND_GEO);
  const northPlayground = polygonFromGeo(NORTH_PLAYGROUND_GEO);
  const skate = polygonFromGeo(SKATE_GEO);
  const basketball = polygonFromGeo(BASKETBALL_GEO);
  const northToilets = polygonFromGeo(NORTH_TOILETS_GEO);
  const basketballCenter = polygonCentroid(basketball);
  const northToiletsCenter = polygonCentroid(northToilets);
  const grandstandCenter = polygonCentroid(grandstand);
  const southPlaygroundCenter = polygonCentroid(southPlayground);
  const northPlaygroundCenter = polygonCentroid(northPlayground);
  const skateCenter = polygonCentroid(skate);
  const rotundaCenter = geoToWorld(g(-37.787235, 144.981825));
  const rotundaLoop: LevelPath = {
    id: "rotunda-approach-loop",
    label: "Fitzroy Memorial Rotunda approach loop",
    kind: "footway",
    points: makeCircle(rotundaCenter, 12.2, 36),
    width: 2.45
  };
  const queenVictoriaPlinth = geoToWorld(g(-37.7872762, 144.9837025));
  const cookMemorial = geoToWorld(g(-37.7873520, 144.9855420));
  const sportsmansMemorial = geoToWorld(g(-37.78754, 144.98066));
  const southToilets = geoToWorld(g(-37.788485, 144.983585));
  const southBbq = geoToWorld(g(-37.7890776, 144.9835871));
  const northBbq = geoToWorld(g(-37.7859107, 144.9831484));
  const northTableTennis = geoToWorld(g(-37.786470, 144.983075));
  const railTrail = pathFromGeo("inner-circle-rail-trail", "Inner Circle Rail Trail", "rail", RAIL_TRAIL_GEO, 4.5);

  const formalNorthSouth = pathFromGeo(
    "elm-avenue-main",
    "Elm Avenue",
    "footway",
    [
      g(-37.78572, 144.98226),
      g(-37.78642, 144.98247),
      g(-37.78712, 144.98272),
      g(-37.78801, 144.98299),
      g(-37.78905, 144.98332)
    ],
    3.2
  );
  const crescentPath = pathFromGeo(
    "alfred-crescent-inside-path",
    "Alfred Crescent path",
    "perimeter",
    [
      g(-37.78939, 144.98354),
      g(-37.78900, 144.98433),
      g(-37.78841, 144.98515),
      g(-37.78750, 144.98564),
      g(-37.78653, 144.98547),
      g(-37.78595, 144.98492),
      g(-37.78563, 144.98431)
    ],
    3.5
  );
  const ovalPath = pathFromGeo(
    "oval-loop",
    "W. T. Peterson Oval loop",
    "footway",
    OVAL_GEO,
    3.6
  );
  const osmPaths = OSM_EXTRA_PATHS_GEO.map((path) => pathFromGeo(path.id, path.label, path.kind, path.points, path.width));
  const mappedAmenities: AmenityPoint[] = OSM_AMENITY_GEO.map((amenity) => ({
    id: amenity.id,
    label: amenity.label,
    kind: amenity.kind,
    position: geoToWorld(amenity.point)
  }));
  const featureAmenities: AmenityPoint[] = [
    { id: "north-table-tennis", label: "Northern activity table tennis", kind: "table_tennis", position: northTableTennis },
    { id: "north-bbq-picnic-table-1", label: "North picnic table", kind: "picnic_table", position: geoToWorld(g(-37.785870, 144.983230)) },
    { id: "north-bbq-picnic-table-2", label: "North picnic table", kind: "picnic_table", position: geoToWorld(g(-37.785820, 144.983075)) },
    { id: "south-picnic-table-1", label: "South picnic table", kind: "picnic_table", position: geoToWorld(g(-37.789030, 144.983755)) },
    { id: "south-picnic-table-2", label: "South picnic table", kind: "picnic_table", position: geoToWorld(g(-37.789125, 144.983925)) }
  ];
  const amenities = [...mappedAmenities, ...featureAmenities].filter((amenity) => pointInPolygon(amenity.position, boundary));
  const significantTrees: SignificantTreePoint[] = YARRA_SIGNIFICANT_TREE_GEO.map((tree) => ({
    id: tree.id,
    commonName: tree.commonName,
    genus: tree.genus,
    species: tree.species,
    height: tree.height,
    dbh: tree.dbh,
    position: geoToWorld(tree.point)
  }));

  const landmarks: Landmark[] = [
    { id: "park", label: "Edinburgh Gardens", kind: "park", polygon: boundary },
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
    { id: "oval", label: "W. T. Peterson Oval", kind: "oval", polygon: oval },
    { id: "grandstand", label: "Kevin Murray Stand", kind: "grandstand", polygon: grandstand },
    { id: "tennis", label: "Fitzroy Tennis Club", kind: "tennis", polygon: tennis },
    ...TENNIS_COURTS_GEO.map((court, index) => ({
      id: `tennis-court-${index + 1}`,
      label: `Court ${index + 1}`,
      kind: "court" as const,
      polygon: polygonFromGeo(court)
    })),
    { id: "bowling", label: "Fitzroy Victoria Bowling & Sports Club", kind: "bowls", polygon: bowling },
    ...BOWLS_GREENS_GEO.map((green, index) => ({
      id: `bowling-green-${index + 1}`,
      label: `Bowling green ${index + 1}`,
      kind: "bowls" as const,
      polygon: polygonFromGeo(green)
    })),
    { id: "south-playground", label: "South playground", kind: "playground", polygon: southPlayground },
    { id: "north-playground", label: "North playground", kind: "playground", polygon: northPlayground },
    { id: "skate", label: "Fitzroy Skatepark", kind: "skate", polygon: skate },
    { id: "basketball", label: "Basketball court", kind: "basketball", polygon: basketball },
    { id: "north-toilets", label: "North toilets", kind: "toilets", polygon: northToilets },
    { id: "south-toilets", label: "South toilets", kind: "toilets", position: southToilets, radius: 4.5 },
    { id: "south-bbq", label: "South BBQ", kind: "bbq", position: southBbq, radius: 3.5 },
    { id: "north-bbq", label: "North BBQ", kind: "bbq", position: northBbq, radius: 3.5 },
    { id: "rotunda", label: "Fitzroy Memorial Rotunda", kind: "rotunda", position: rotundaCenter, radius: 9 },
    { id: "queen-victoria-plinth", label: "Queen Victoria plinth / Plinth Program", kind: "memorial", position: queenVictoriaPlinth, radius: 5.8 },
    { id: "sportsmans-war-memorial", label: "Sportsman's War Memorial", kind: "memorial", position: sportsmansMemorial, radius: 4.5 },
    { id: "cook-memorial-site", label: "Captain James Cook memorial site", kind: "memorial", position: cookMemorial, radius: 4 }
  ];

  const treeLines = [
    samplePolyline(railTrail.points, 12),
    samplePolyline(formalNorthSouth.points, 12),
    samplePolyline(crescentPath.points, 15),
    samplePolyline(polygonFromGeo([g(-37.78605, 144.98115), g(-37.78685, 144.98172), g(-37.78754, 144.98218)]), 12),
    samplePolyline(polygonFromGeo([g(-37.78875, 144.98230), g(-37.78837, 144.98312), g(-37.78815, 144.98382)]), 12)
  ];

  return {
    boundary,
    paths: [railTrail, formalNorthSouth, crescentPath, ovalPath, rotundaLoop, ...osmPaths],
    landmarks,
    treeLines,
    treePoints: polygonFromGeo(OSM_TREE_GEO).filter((point) => pointInPolygon(point, boundary)),
    significantTrees,
    obstacles: [
      boxObstacleFromPolygon("grandstand", "Kevin Murray Stand", grandstand, 1.0, 0.45),
      polygonObstacleFromPolygon("tennis", "Fitzroy Tennis Club", tennis),
      polygonObstacleFromPolygon("bowling", "Fitzroy Victoria Bowling & Sports Club", bowling),
      boxObstacleFromPolygon("north-toilets", "North toilets", northToilets, 0.6, 0.6),
      { id: "south-toilets", label: "South toilets", center: southToilets, radius: 3.2 },
      { id: "rotunda-core", label: "Fitzroy Memorial Rotunda centre", center: rotundaCenter, radius: 1.6 }
    ],
    spawnPoints: [
      geoToWorld(g(-37.78948, 144.98045)),
      geoToWorld(g(-37.78972, 144.98215)),
      geoToWorld(g(-37.78805, 144.98535)),
      geoToWorld(g(-37.78608, 144.98473)),
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
      {
        id: "rotunda-deck",
        label: "Rotunda deck",
        kind: "rotunda",
        position: rotundaCenter,
        radius: 13,
        height: 5.25,
        prompt: "E: climb the rotunda",
        mode: "toggle"
      },
      {
        id: "grandstand-seats",
        label: "Kevin Murray Stand seats",
        kind: "grandstand",
        position: grandstandCenter,
        radius: 12,
        height: 3.15,
        prompt: "E: climb the stand",
        mode: "toggle"
      },
      {
        id: "north-playground-tower",
        label: "North playground tower",
        kind: "playground",
        position: northPlaygroundCenter,
        radius: 9,
        height: 2.35,
        prompt: "E: climb the playground tower",
        mode: "toggle"
      },
      {
        id: "south-playground-tower",
        label: "South playground tower",
        kind: "playground",
        position: southPlaygroundCenter,
        radius: 9,
        height: 2.35,
        prompt: "E: climb the playground tower",
        mode: "toggle"
      },
      {
        id: "south-toilets-roof",
        label: "South toilet block roof",
        kind: "toilets",
        position: southToilets,
        radius: 8,
        height: 3.25,
        prompt: "E: climb the toilet block roof",
        mode: "toggle"
      },
      {
        id: "north-toilets-roof",
        label: "North toilet block roof",
        kind: "toilets",
        position: northToiletsCenter,
        radius: 8,
        height: 3.25,
        prompt: "E: climb the toilet block roof",
        mode: "toggle"
      },
      {
        id: "basketball-hoop",
        label: "Basketball hoop frame",
        kind: "basketball",
        position: { x: basketballCenter.x + 7.2, z: basketballCenter.z },
        radius: 5.5,
        height: 2.55,
        prompt: "E: climb the hoop frame",
        mode: "toggle"
      },
      {
        id: "skate-ramp",
        label: "Skate ramp lip",
        kind: "skate",
        position: skateCenter,
        radius: 13,
        height: 1.05,
        prompt: "Walk the skate ramp",
        mode: "auto"
      }
    ],
    amenities,
    weaponSpawns: [
      { id: "grandstand-shotgun", label: "Shotgun under the stand", weaponId: "shotgun", position: grandstandCenter },
      { id: "tennis-smg", label: "SMG in the tennis locker", weaponId: "smg", position: geoToWorld(g(-37.78808, 144.98224)) },
      { id: "rail-rifle", label: "Rifle by the rail trail", weaponId: "rifle", position: geoToWorld(g(-37.78708, 144.98304)) },
      { id: "rotunda-carbine", label: "Carbine ammo by the rotunda", weaponId: "carbine", position: rotundaCenter }
    ]
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
