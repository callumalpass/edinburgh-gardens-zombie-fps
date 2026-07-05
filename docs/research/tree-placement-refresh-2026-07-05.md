# Tree Placement Refresh Research

Created: 2026-07-05

Scope: verify Edinburgh Gardens tree placement against current public sources and remove inaccurate inferred trunks.

## Sources Checked

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

- The biggest placement error was not the OSM tree data. The in-boundary OSM nodes still matched the current OSM map extract.
- The inaccurate trunks came from converting sampled heritage/tree-guide polylines into rendered and colliding trees.
- Heritage avenues remain important, but they are not precise stem coordinates. They should influence profile inference only.
- Current Yarra project material means some OSM trees near the tennis works should no longer be rendered as standing trees. The public plan is not a machine-readable tree-coordinate layer, so only OSM nodes that line up with the published works footprint were suppressed.
- Replacement plantings were not added because the public source describes a 2026-2027 planting program but does not provide final point coordinates.

## Implementation Decisions

- Replaced the anonymous `OSM_TREE_GEO` coordinate array with OSM node IDs plus points.
- Reduced the constant to the 126 unique in-boundary live OSM tree nodes.
- Suppressed these OSM nodes from rendered trees and trunk colliders because they intersect the 2026 tennis works footprint: `5365392008`, `5365392009`, `5365392010`, `5365392011`, `5365393282`, `5365393283`, `5365393284`.
- Kept `treeLines` as heritage/profile guide geometry only.
- Removed `tree-row-*` synthetic trees entirely.
- Kept all 19 Yarra significant trees with their dataset height and DBH values.

## Resulting Model

- `treePoints`: 119 active OSM natural-tree points after suppressing the 2026 works footprint.
- `significantTrees`: 19 Yarra significant trees.
- `trees` and `treeColliders`: 138 rendered/colliding trunks.
- Tree profile inference still uses the CMP heritage lines, but every visible/colliding trunk now comes from a mapped OSM node or a Yarra significant-tree point.
