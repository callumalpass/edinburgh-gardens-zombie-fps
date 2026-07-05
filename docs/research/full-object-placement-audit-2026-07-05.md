# Full Object Placement Audit

Created: 2026-07-05

Scope: all visible park object families in `src/game/levelData.ts`, their collision blockers and their climbable access targets.

## Sources

- OpenStreetMap bounded extract: https://api.openstreetmap.org/api/0.6/map?bbox=144.9798,-37.7903,144.9860,-37.7853
  - Used to inventory current in-park object categories inside boundary way `13815924`.
  - In-boundary tagged objects included mapped paths, 126 `natural=tree` nodes, 14 pitch ways, two playgrounds, basketball, skateboard, table-tennis, tennis, bowls, BBQs, benches, bins, toilets, buildings, one fence, the raingarden covered reservoir, a storage tank and the cricket-nets node.
- OpenStreetMap way API:
  - `655160878`: Edinburgh Gardens Raingarden Reservoir.
  - `715802679`: tennis-side storage tank.
  - `715802680`: tennis-side fence around the storage-tank area.
  - `403753786`, `307404819`, `14946934`, `500981577`, `231049925`, `24489879`, `543616019`, `24489838` and `24489878`: spot-checked against existing hardcoded polygons.
  - Node `249041533`: `sport=cricket_nets`.
- Yarra Edinburgh Gardens facility page: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used to confirm the represented facility families: BBQ, basketball, dog areas, drinking fountains, pavilion, picnic area, playground, public toilets, skate park, sports oval and tables/chairs.
- Yarra northern precinct consultation: https://yoursayyarra.com.au/eg-north
  - Used to confirm the northern playground/BBQ/table-tennis/basketball/skate activity cluster.
- Edinburgh Gardens CMP: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - Used for heritage structure context and to keep the rotunda/grandstand/bowling/tennis/memorial treatments conservative.

## Audit Findings

- Existing main polygons for the oval, grandstand, tennis, bowling, playgrounds, skate park, basketball court and north toilets matched the current OSM full-way geometry.
- OSM current data exposed three visible/context objects that were missing from the level model:
  - Raingarden covered reservoir.
  - Tennis-side storage tank.
  - Cricket nets near the oval.
- The basketball climb target used a hand-offset court-centre position while the rendered hoops already came from `SportsFixture` data.
- Playground and skate climb metadata referenced bypass obstacle IDs that were not present in the collision model.
- The best fit for collision was not to block entire playground mulch polygons. Only the central play towers now get compact non-sight-blocking circular blockers.
- The skate area now has a low non-sight-blocking polygon blocker because it is visibly ramped and the auto climb fixture lets the player move onto it.

## Implementation Decisions

- Added `raingarden-reservoir` as a non-blocking garden/surface landmark from OSM way `655160878`.
- Added `osm-man-made-715802679` as a visible non-colliding mapped utility object. It sits inside the already blocked tennis precinct, so a duplicate tank blocker would not improve gameplay accuracy.
- Added `oval-cricket-nets` as a sourceable visible park-life detail from OSM node `249041533`. OSM only supplies a node, so no hard collision footprint is inferred.
- Replaced the single basketball climb target with one frame interactable per rendered basketball hoop. Each frame bypasses the matching hoop-post obstacle.
- Added compact blockers for `north-playground`, `south-playground` and `skate`; all are non-sight-blocking and have corresponding visible structures.
- Added tests requiring every interactable `bypassObstacleIds` entry to resolve to a real obstacle.

## Follow-Up Notes

- If a future OSM edit supplies cricket-net way geometry, it should replace the node-based visible detail and can then support an accurate cage blocker.
- If council publishes a public project CAD/GIS layer for Brunswick Street Oval works, it should replace the current OSM/CMP/Yarra hybrid model for the sports precinct.
