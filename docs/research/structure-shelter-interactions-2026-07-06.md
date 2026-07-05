# Structure Shelter Interactions

Date: 2026-07-06

Purpose: make Edinburgh Gardens buildings work as believable wet-weather structures in play, using documented public facilities and building roles rather than unsourced interiors.

## Sources

- City of Yarra, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Confirms the 24 hectare park, extensive paths, access-friendly status, public toilets and pavilion/facility context.
- City of Yarra, Brunswick Street Oval redevelopment: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Confirms sports-pavilion changes, externally accessible public toilets, kiosk terrace, grandstand changeroom/umpire upgrades, external stairs, secure gates, tennis clubhouse relocation, social space and upgraded amenities.
- City of Yarra, Emely Baker Centre: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/emely-baker-centre
  - Confirms the access-friendly community venue, gated outdoor area and shade sail.
- City of Yarra, Edinburgh Gardens Rotunda: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/edinburgh-gardens-rotunda
  - Confirms bookable rotunda use, not-wheelchair-accessible status and the no-current-power constraint.
- City of Yarra Edinburgh Gardens Conservation Management Plan 2004: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - Supports the built-feature hierarchy for the grandstand, gatehouse, rotunda, tennis pavilion, bowling club and functional toilet blocks.
- OpenStreetMap way full API template: https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json
  - Existing compacted OSM footprints remain the geometry basis for mapped building shelter footprints.

## Findings

- Previous structure passes made buildings searchable, climbable or switchable, but wet weather still treated covered buildings like exposed paving.
- Public sources support several real shelter contexts:
  - The rotunda is a bookable covered structure but remains deliberately unpowered.
  - The Kevin Murray Stand is a covered grandstand with current access/stair/gate works.
  - Tennis, bowling and sports-pavilion works support verandah/threshold shelter at club and social spaces.
  - Emely Baker has a documented shade-sail outdoor area.
  - Public toilet blocks and the Freeman Street gatehouse have functional roof/eave shelter.
- No public CAD data was found for exact eave, verandah or shade-sail extents, so shelter volumes need to be fitted to existing OSM/CMP footprints and labeled as gameplay approximations.

## Implementation Translation

- Added `StructureShelter` level data with source, linked structure ID, footprint shape and `weatherProtection`.
- Added source-backed shelter zones for:
  - rotunda roof
  - Kevin Murray Stand covered seats
  - tennis pavilion verandah
  - bowling club verandah
  - Emely Baker shade-sail yard
  - south amenities roof/eaves
  - north toilet block roof/eaves
  - Freeman Street gatehouse roof
- Rendered subtle dry patches and drip-edge strips from the shelter data so the zones read as physical shelter, not UI-only buffs.
- Shelter now reduces firearm weather jitter and weather grip sway, adds a small stamina recovery/drain benefit and counts as crouch cover when it is not inside an active powered floodlight.
- Searching amenities under a structure shelter is treated as less exposed by the loot-risk model, which makes verandahs and roof edges tactically useful during bad weather.
- Runtime snapshots now expose `sheltered` and `shelterProtection` for smoke tests.

## Uncertainty

- Exact shelter/eave extents are not public. The game fits shelter to building footprints, facade points and documented use areas rather than claiming surveyed roof geometry.
- The Emely Baker shade-sail shelter is placed on the inferred outdoor-yard side of the mapped building. The public venue page confirms the feature, but not its exact GIS polygon.
- Toilet-roof climb fixtures are visually inside the same building footprint as roof shelter, but gameplay explicitly does not treat standing on top of a toilet roof as being under the roof.
- Weather protection is a gameplay translation of being covered from rain/wind. It does not make buildings safe rooms, interiors, or guaranteed zombie blockers.

## Validation

- `npm run test:run -- tests/geo.test.ts tests/weapons.test.ts tests/stealth.test.ts tests/playerCondition.test.ts`
  - Verifies source-linked shelter data, protected landings, weapon weather protection, stealth tradeoffs and stamina behavior.
- `npm run research:check`
  - Validates this note and its manifest registration.
