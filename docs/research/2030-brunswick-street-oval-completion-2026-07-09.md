# 2030 Brunswick Street Oval Completion Pass

Created: 2026-07-09

Scope: translate the Brunswick Street Oval and tennis precinct from the earlier 2026-2027 construction-state cues into the game's 2030 setting.

## Sources

- Yarra City Council Brunswick Street Oval Redevelopment: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Confirms sports pavilion design/construction, six existing tennis-court renovations, two new synthetic courts, tennis clubhouse installation, grandstand works and landscaping are scheduled for 2026-2027.
  - Confirms two new high-quality change rooms, upgraded umpire/grandstand change rooms, externally accessible public toilets, a relocated tennis clubhouse, new adjoining social space, upgraded amenities, new external grandstand stairs and secure gates.
  - Confirms the approved tennis design responds to Heritage Victoria requirements and that expansion/removed trees are associated with the north/west tennis-club area rather than relocating courts east into the stormwater/rail-trail corridor.
- OpenStreetMap map API bounded extract: https://api.openstreetmap.org/api/0.6/map?bbox=144.9798,-37.7903,144.9860,-37.7853
  - Existing court ways `715802691`-`715802696` remain the exact public geometry for the six pre-existing courts.

## Findings

- The game is set in 2030, while the previous realism pass intentionally represented a 2026-2027 works state with renovation court overlays, construction mesh and synthetic-court rolls.
- Because Yarra's official timeline places the sports pavilion, grandstand works, tennis-court works, tennis clubhouse installation and landscaping in 2026-2027, those works should read as completed by the 2030 setting.
- Public OSM geometry exists for the six existing courts but not for the two new courts. The best available public evidence supports adding two completed synthetic courts while marking their vertices as approximate.
- Public sources confirm functional building outcomes but still do not provide room plans or exact cabinet/door/window coordinates. Exterior gameplay points therefore remain source-backed frontage approximations.

## Implementation Translation

- Changed the six existing OSM tennis courts from construction/renovation state to `renovated-2030`.
- Added two `new-2030` tennis court landmarks (`tennis-court-7` and `tennis-court-8`).
  - The new footprints are extrapolated from the exact OSM court grid into the sourced north/west tennis-expansion zone.
  - They are not tagged as OSM-derived because no public way IDs or surveyed vertices were available.
- Replaced the temporary tennis works mesh, grandstand works fence and synthetic-court rolls with completed-precinct cues:
  - `tennis-precinct-wayfinding-board`
  - `grandstand-secure-gate`
  - `tennis-social-space-kit`
- Updated the renderer so courts with 2030 status show completed synthetic surfaces and line accents, not construction tape or works buckets.

## Uncertainty

- Courts 1-6 are OSM-derived geometry. Courts 7-8 are source-backed but approximate because no public 2030 court GIS vertices were found.
- Exact facade fixtures for the sports pavilion, relocated clubhouse, public toilets, secure gates and utility cabinets remain approximations on documented frontage sides.
- Existing suppressed-tree and replacement-planting cues still represent the official redevelopment scope, but individual 2030 tree survivorship and final planting coordinates are not independently verifiable from public GIS.

## Validation

- Ran `npm run test:run -- tests/geo.test.ts`; 39 tests passed with the eight-court 2030 precinct.
