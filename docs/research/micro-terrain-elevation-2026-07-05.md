# Micro-Terrain And Elevation Research

Created: 2026-07-05

Scope: local elevation realism for walking around Edinburgh Gardens, excluding street/edge-life additions.

## Sources

- Vicmap Elevation overview: https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-elevation
  - Used to keep broad terrain grounded in Victorian elevation products and AHD elevation context.
- Vicmap Elevation 1m DEM overview: https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-elevation/1m-dem
  - Used as context for the best available public description of fine-grained terrain. General public access to the service data is licensed, so it is not embedded.
- Vicmap Elevation metro 1-5 m FeatureServer: https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer
  - Local raw JSON:
    - `docs/research/raw/vicmap/2026-07-05/further-realism/edinburgh-gardens-ground-surface-points.json`
    - `docs/research/raw/vicmap/2026-07-05/further-realism/edinburgh-gardens-contours.json`
  - Rechecked the bounding box used for the existing terrain source: 3 ground-surface points and 54 contour features returned.
- OpenStreetMap bounded park-feature query:
  - Local raw JSON: `docs/research/raw/osm/2026-07-05/further-realism/edinburgh-gardens-park-features-overpass.json`
  - Used for current map-source context around paths, trees, buildings, barriers and amenities. Roads remain out of scope for this goal.
- Edinburgh Gardens CMP via the 3068 archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used for the asphalt path network, remnant basalt/bluestone edging and bluestone-pitcher drain context.

## Implementation Decisions

- Kept `VICMAP_ELEVATION_GEO` as the broad terrain source.
  - Sparse contours and spot heights are suitable for overall rise/fall, not survey-grade kerbs or steps.
- Added `LevelData.terrainModifiers`.
  - Modifier kinds: path crowns, path shoulders, tree-root mounds, drainage swales and oval banking.
  - The generated modifiers preserve source notes and are deterministic derived data rather than renderer-only decoration.
- Updated `TerrainSampler` to apply micro-relief after broad Vicmap interpolation.
  - Movement, zombie grounding, pickup placement and rendering all continue to use one ground-height API.
  - A simple spatial bucket indexes modifier bounds so each lookup checks only nearby local terrain features.

## Follow-Up Notes

- If licensed 1m DEM or LiDAR point data becomes available, replace inferred local relief with sampled fine terrain rather than increasing modifier amplitudes.
- Keep local relief subtle. The park should feel uneven underfoot, not like exaggerated game hills.
