# Edinburgh Gardens Research Notes

Created: 2026-07-05

These notes record the real-world sources and implementation decisions used to shape the Edinburgh Gardens level. The game is not survey-grade, but the geometry is deliberately grounded in real map and public open-data sources.

## Primary Sources

- Yarra City Council, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for the 24 hectare park size, open lawns, specimen trees, shaded areas, path-network description and facility list.
- OpenStreetMap park boundary, way `13815924`: https://www.openstreetmap.org/way/13815924
  - Used for the escargot/crescent park boundary and as the containment polygon for filtering features.
  - OSM data is available under ODbL. Derived coordinates in `src/game/levelData.ts` should keep OSM attribution in user-facing or published material.
- OpenStreetMap feature ways fetched individually through the OSM API:
  - `22673070`, `22768137`, `75488632`, `22760904`, `22760905`, `210387722`, `1340465893`, `1340465894`, `1361307046`, `1361307049` path/service connectors added after a bounded path inventory.
  - `403753786` Kevin Murray Stand
  - `403753784` Fitzroy Tennis Club rooms
  - `543505702` Emely Baker Centre
  - `543505639` Fitzroy Victoria Bowling Club rooms
  - `242003562` south service/amenities building
  - `543505638`, `543505640`, `1475006767` to `1475006773` smaller park and sports-club buildings
  - `715802680` mapped fence segment
- Vicmap Elevation REST API metadata: https://discover.data.vic.gov.au/dataset/vicmap-elevation-rest-api
  - Used to identify the open metro 1-5 m contour and ground-surface point FeatureServer.
- Vicmap Elevation metro 1-5 m FeatureServer: https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer
  - Queried the Edinburgh Gardens bounding box for contour and spot-height geometry.
  - Bounding-box query returned 49 contour features with altitudes 26-34 m AHD, plus 3 ground-surface points.
  - Filtered to the OSM park boundary and simplified into 95 elevation samples in `VICMAP_ELEVATION_GEO`.
- Vicmap Elevation 1 m DEM overview: https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-elevation/1m-dem
  - Used for context only. The 1 m DEM is documented as higher-resolution terrain data, but general public web-service access is licensed rather than open, so it is not embedded in this project.
- 3068 Group Edinburgh Gardens heritage review archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used for heritage emphasis: elm avenues and rows, Peterson Oval, English Oak Avenue, Holm Oak specimen, Dutch Elm circles, former railway/shared path and rotunda.
  - Also used to locate the CMP source for asphalt paths with remnant basalt/bluestone edging, the bluestone-pitcher open drain and the Alfred Crescent retaining wall.
- Yarra northern precinct consultation: https://yoursayyarra.com.au/eg-north
  - Used for the northern activity precinct: playground, BBQ/picnic tables, chess/game elements, table tennis, skate/BMX and basketball half-court context.
- City of Yarra significant trees dataset metadata: https://data.gov.au/data/dataset/yarra-significant-trees
  - Used for notable tree species, diameter and height context already represented by `YARRA_SIGNIFICANT_TREE_GEO`.

## Current Implementation

- `WORLD_SCALE` is `1.28`, not strict 1:1.
  - The first terrain pass briefly used strict 1:1 metres, but the level felt too small for the FPS pacing.
  - `1.28x` keeps map-derived proportions while giving the player more playable space.
- Player movement is tuned for the expanded world:
  - Walk speed: `7.6`
  - Sprint speed: `11.4`
- Terrain uses sparse Vicmap samples:
  - `VICMAP_ELEVATION_GEO` stores contour/spot-height samples.
  - `GameApp.groundY()` interpolates them with inverse-distance weighting.
  - The park ground mesh is a clipped grid over the OSM boundary, not a flat shape.
- OSM-mapped buildings are rendered as polygon prisms.
  - Standalone buildings such as the Emely Baker Centre and south service/amenities building also add collision.
  - Buildings already inside tennis/bowls fenced precincts render visually but avoid duplicate collision blockers.
- Paths, amenities, mapped buildings, trees, fixtures, memorials, entrances and pickups are placed relative to interpolated terrain height.
- Existing OSM-derived paths, amenities, trees, sports facilities, memorials and park landmarks remain in `src/game/levelData.ts`.
- Detailed OSM path/service research is stored in `docs/research/osm-path-service-inventory-2026-07-05.md`.
- Hardscape and terrain-edge research is stored in `docs/research/hardscape-terrain-edges-2026-07-05.md`.
- Built-feature research is stored in `docs/research/built-features-2026-07-05.md`.

## Data Notes

- The large combined Overpass query for every mapped feature in the park was unreliable and frequently timed out on 2026-07-05.
- The bounded OSM path/service Overpass inventory succeeded once, but repeated calls later returned busy-server HTML. Smaller OSM API fetches for specific way IDs were reliable and are the basis for the new mapped path, building and fence footprints.
- Raw API responses are not checked in. The durable project artifact is this source note plus compact derived constants in `src/game/levelData.ts`.
- The Vicmap elevation samples are sparse. They are appropriate for broad park slope and local rise/fall, not for fine kerbs, gutters, steps or detailed drainage modelling.
