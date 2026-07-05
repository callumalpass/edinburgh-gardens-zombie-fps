# Tree Placement Refresh Research

Created: 2026-07-05

Scope: verify Edinburgh Gardens tree placement against current public sources and remove inaccurate inferred trunks.

## Sources Checked

- Vicmap Vegetation Tree Urban REST API: https://discover.data.vic.gov.au/dataset/vicmap-vegetation-tree-urban-rest-api
  - Used as the primary non-significant tree source after OSM proved sparse around the Queen Victoria plinth and eastern/northern lawns.
  - DataVic describes the layer as individual trees extracted from high-resolution aerial photography, with LiDAR-derived canopy height assigned to mapped trees.
  - Queried the Edinburgh Gardens bounding box from the FeatureServer: https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Vegetation_Tree_Urban/FeatureServer/0
  - Local raw JSON: `docs/research/raw/vicmap/2026-07-05/further-realism/edinburgh-gardens-vicmap-tree-urban.json`
  - The in-boundary query returned 410 tree points; the checked-in compact layer keeps 376 points with at least 5 m height or at least 4 m canopy radius.
- OpenStreetMap map API extract for bbox `144.9798,-37.7903,144.9860,-37.7853`: https://api.openstreetmap.org/api/0.6/map?bbox=144.9798,-37.7903,144.9860,-37.7853
  - Filtered `natural=tree` nodes against the Edinburgh Gardens boundary, OSM way `13815924`.
  - The live extract returned 126 unique in-boundary tree nodes.
  - The previous checked-in coordinate list matched those 126 in-boundary nodes, but also carried stale outside-boundary coordinates and no OSM node IDs.
- OpenStreetMap Edinburgh Gardens boundary, way `13815924`: https://www.openstreetmap.org/way/13815924
  - Used as the containment polygon for tree and significant-tree filtering.
- City of Yarra significant trees dataset: https://data.gov.au/data/dataset/yarra-significant-trees
  - The GeoJSON resource was filtered by the same park boundary.
  - It returned 19 in-park significant trees, matching refs `102` to `121` represented in `YARRA_SIGNIFICANT_TREE_GEO`.
- Edinburgh Gardens Conservation Management Plan 2004: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - Used for heritage vegetation context: elm avenues and rows, English Oak Avenue, Holm Oak specimen and remnant Dutch Elm circles.
- Brunswick Street Oval Redevelopment updates: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - The current Yarra page identifies 39 tree removals for the endorsed works, 35 replacement plantings, and three English elms removed for the tennis court expansion.
- Tree Protection and Management Plan, Brunswick Street Oval: https://www.yarracity.vic.gov.au/sites/default/files/2026-02/Tree_protection_management_plan_brunswick_street_oval.pdf
  - Used to cross-check the removal footprint around the tennis and grandstand works.
- Yarra northern precinct consultation: https://yoursayyarra.com.au/eg-north
  - Used as a guardrail against inventing tree rows through the northern activity precinct; the playground concept is described as clear of existing mature tree protection zones.

## Findings

- The biggest OSM-specific issue was omission, not bad coordinates. OSM has almost no individual-tree coverage around the Queen Victoria plinth, while Vicmap returns dozens of aerial/LiDAR tree detections there.
- The inaccurate extra trunks came from converting sampled heritage/tree-guide polylines into rendered and colliding trees.
- Heritage avenues remain important, but they are not precise stem coordinates. They should influence profile inference only.
- Current Yarra project material means some mapped trees near the tennis works should no longer be rendered as standing trees. The public plan is not a machine-readable tree-coordinate layer, so OSM removals are used as a local exclusion footprint for both OSM and Vicmap detections.
- Replacement plantings were not added because the public source describes a 2026-2027 planting program but does not provide final point coordinates.

## Implementation Decisions

- Added `VICMAP_TREE_GEO` as the primary broad non-significant tree layer.
- Replaced the anonymous `OSM_TREE_GEO` coordinate array with OSM node IDs plus points.
- Reduced the constant to the 126 unique in-boundary live OSM tree nodes.
- Suppressed these OSM nodes from rendered trees and trunk colliders because they intersect the 2026 tennis works footprint: `5365392008`, `5365392009`, `5365392010`, `5365392011`, `5365393282`, `5365393283`, `5365393284`.
- Suppressed Vicmap detections within the same local footprint so the broader tree layer does not reintroduce current works removals.
- Kept `treeLines` as heritage/profile guide geometry only.
- Removed `tree-row-*` synthetic trees entirely.
- Kept all 19 Yarra significant trees with their dataset height and DBH values.

## Resulting Model

- `treePoints`: 365 active non-significant points, primarily Vicmap aerial/LiDAR trees with OSM fallback only where useful.
- `significantTrees`: 19 Yarra significant trees.
- `trees` and `treeColliders`: 384 rendered/colliding trunks.
- Within 85 real metres of the Queen Victoria plinth, the level now has at least 45 trees, at least 40 of them Vicmap-derived.
- Tree profile inference still uses the CMP heritage lines, but every visible/colliding trunk now comes from a mapped Vicmap tree, OSM node, or Yarra significant-tree point.
