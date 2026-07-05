# Edinburgh Gardens Research Notes

Created: 2026-07-05

These notes record the real-world sources and implementation decisions used to shape the Edinburgh Gardens level. The game is not survey-grade, but the geometry is deliberately grounded in real map and public open-data sources.

## Primary Sources

- Yarra City Council, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for the 24 hectare park size, open lawns, specimen trees, shaded areas, path-network description and facility list.
- OpenStreetMap park boundary, way `13815924`: https://www.openstreetmap.org/way/13815924
  - Used for the escargot/crescent park boundary and as the containment polygon for filtering features.
  - OSM data is available under ODbL. Derived coordinates in `src/game/levelData.ts` should keep OSM attribution in user-facing or published material.
- OpenStreetMap bounded tree-node extract: https://api.openstreetmap.org/api/0.6/map?bbox=144.9798,-37.7903,144.9860,-37.7853
  - Used on 2026-07-05 to refresh `OSM_TREE_GEO` as 126 in-boundary `natural=tree` node IDs before current works exclusions.
- Vicmap Vegetation Tree Urban REST API: https://discover.data.vic.gov.au/dataset/vicmap-vegetation-tree-urban-rest-api
  - Used on 2026-07-05 as the primary non-significant tree source after the OSM tree layer proved sparse around the Queen Victoria plinth and eastern/northern lawns.
  - The source is aerial-photo/LiDAR-derived individual tree points with canopy radius and height fields.
- OpenStreetMap feature ways fetched individually through the OSM API:
  - `22673070`, `22768137`, `22760900`, `22760908`, `75488632`, `22760904`, `22760905`, `210387722`, `403753751`, `403753754`, `22760906`, `715802681` to `715802690`, `1340465893`, `1340465894`, `1361307046`, `1361307049` path/service/step connectors added after bounded path inventories.
  - `403753786` Kevin Murray Stand
  - `403753784` Fitzroy Tennis Club rooms
  - `543505702` Emely Baker Centre
  - `543505639` Fitzroy Victoria Bowling Club rooms
  - `242003562` south service/amenities building
  - `543505638`, `543505640`, `1475006767` to `1475006773` smaller park and sports-club buildings
  - `655160878` raingarden covered reservoir
  - `715802679` tennis-side storage tank
  - `715802680` mapped fence segment
  - Node `249041533` cricket nets
- Landezine, Edinburgh Gardens Raingarden by GHD: https://landezine.com/edinburgh-gardens-raingarden-by-ghd-pty-ltd/
  - Used for the raingarden's four-terrace treatment-garden design, zig-zag low-flow steel channel, 700 sqm filter area, 200 KL underground storage and stormwater-harvesting role.
- Atlan StormTech, StormTech Raingarden at Edinburgh Gardens: https://atlanstormwater.com/au/stormtech-raingarden-at-edinburgh-gardens-fitzroy-victoria/
  - Used to cross-check the GHD/StormTech stormwater harvesting context and installation timeframe.
- City of Yarra WSUD Guidelines: https://www.yarracity.vic.gov.au/sites/default/files/2024-04/73_water_sensitive_urban_design_guidelines_city_of_yarra_as_amended_from_time_to_time.pdf
  - Used as municipal context for major open-space raingardens and the Edinburgh Gardens stormwater-harvesting example.
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
- Brunswick Street Oval Redevelopment updates: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Used for current 2026 tennis works, tree-removal and replacement context around the oval/tennis precinct.
- Brunswick Street Oval Tree Protection and Management Plan: https://www.yarracity.vic.gov.au/sites/default/files/2026-02/Tree_protection_management_plan_brunswick_street_oval.pdf
  - Used to suppress mapped OSM tree nodes that intersect the published 2026 tennis works tree-removal footprint.

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
- Existing OSM-derived paths, amenities, sports facilities, memorials and park landmarks remain in `src/game/levelData.ts`; broad non-significant tree placement now comes primarily from Vicmap Vegetation Tree Urban.
- The full-object placement audit added the OSM raingarden reservoir, tennis-side storage tank and cricket-nets cue, then aligned playground, skate and basketball climb/blocker metadata with visible objects.
- The path and raingarden audit added remaining OSM-mapped stand steps, short path connectors and oval links, then remodeled the skate-precinct stormwater feature as a terraced raingarden rather than an open water patch.
- Tree placement refresh research is stored in `docs/research/tree-placement-refresh-2026-07-05.md`.
- Detailed OSM path/service research is stored in `docs/research/osm-path-service-inventory-2026-07-05.md`.
- Hardscape and terrain-edge research is stored in `docs/research/hardscape-terrain-edges-2026-07-05.md`.
- Built-feature research is stored in `docs/research/built-features-2026-07-05.md`.
- Building-interaction research is stored in `docs/research/building-interactions-2026-07-05.md`.
- Object-placement and collision research is stored in `docs/research/object-placement-collision-2026-07-05.md`.
- Vegetation realism research is stored in `docs/research/vegetation-realism-2026-07-05.md`.
- Street-context research is stored in `docs/research/street-context-2026-07-05.md`.
- Park-life and data-pipeline research is stored in `docs/research/park-life-data-pipeline-2026-07-05.md`.
- Micro-terrain and elevation research is stored in `docs/research/micro-terrain-elevation-2026-07-05.md`.
- Vegetation massing research is stored in `docs/research/vegetation-massing-2026-07-05.md`.
- Path material transition research is stored in `docs/research/path-material-transitions-2026-07-05.md`.
- Building affordance realism research is stored in `docs/research/building-affordance-realism-2026-07-05.md`.
- Tree source refresh research is stored in `docs/research/tree-source-refresh-2026-07-05.md`.
- Human-use traces research is stored in `docs/research/human-use-traces-2026-07-05.md`.
- Full object placement audit research is stored in `docs/research/full-object-placement-audit-2026-07-05.md`.
- Path and raingarden audit research is stored in `docs/research/path-and-raingarden-audit-2026-07-05.md`.
- Building realism pass research is stored in `docs/research/building-realism-pass-2026-07-05.md`.
- Local raw research asset guidance is stored in `docs/research/raw-assets.md`.
- Research/data pipeline automation is stored in `docs/research/data-pipeline-automation-2026-07-05.md` and `docs/research/research-manifest.json`.

## Data Notes

- The large combined Overpass query for every mapped feature in the park was unreliable and frequently timed out on 2026-07-05.
- The bounded OSM path/service Overpass inventory succeeded once, but repeated calls later returned busy-server HTML. Smaller OSM API fetches for specific way IDs were reliable and are the basis for the new mapped path, building and fence footprints.
- Raw API responses are kept locally under ignored `docs/research/raw/` when useful. The durable checked-in artifacts are source notes plus compact derived constants in `src/game/levelData.ts`.
- The Vicmap elevation samples are sparse. They are appropriate for broad park slope and local rise/fall, not for fine kerbs, gutters, steps or detailed drainage modelling.
- Fine ground details such as crowns, shoulders, root mounds, swales and oval banking are represented as deterministic local terrain modifiers layered over the broad Vicmap interpolation.
- Tree rendering distinguishes specimen, avenue and generic mapped trees with sourceable canopy-radius/density metadata plus instanced under-canopy ground wear.
- Path material transitions are represented as sourceable visual patches for feathered edges, compacted junctions, muddy thresholds and informal desire paths.
- Climbable fixtures now declare access kinds and landing positions so visual stairs/ladders and player placement align.
- Mapped tree records now retain Vicmap object IDs or OSM node IDs and suppress current Brunswick Street Oval redevelopment tree removals.
- Human-use traces add small non-colliding bowls, coolers, bags and chalk/scuff marks in documented activity zones.
- `npm run research:check` validates the checked-in research manifest, expected notes, source URLs and any ignored local raw JSON cache that is present.
