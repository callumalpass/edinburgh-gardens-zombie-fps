# Structure Facility Refresh

Date: 2026-07-06

Purpose: make Edinburgh Gardens buildings more realistic and more useful by translating newly checked public facility evidence into exterior gameplay affordances and visible structure details.

## Sources

- City of Yarra, Brunswick Street Oval redevelopment: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Confirms the sports-pavilion, grandstand, tennis, public-toilet, kiosk terrace, external-stair, secure-gate, social-space, lighting and 2026-2027 works context.
- Brisbane Lions, Brunswick Street Oval upgrade is now underway: https://www.lions.com.au/news/2058912/brunswick-street-oval-upgrade-is-now-underway
  - Confirms the current $12.8 million works are underway and describes the new two-storey sports pavilion with female-friendly changerooms, first-aid room, kiosk, social space and kitchen; it also notes Kevin Murray Stand public-toilet, umpire-changeroom and stair upgrades plus energy-efficient lighting.
- Yarra News April-May 2025 Fitzroy Bowls roof upgrade: https://www.yarracity.vic.gov.au/sites/default/files/2025-04/yarranews_aprmay25_fa_web_nicholls_ward.pdf
  - Confirms essential Fitzroy Bowls Club roof works: replacing ageing roof sheeting with zincalume sheets, strengthening the roof structure and upgrading gutters while not changing the building's appearance or nearby heritage-listed sites.
- OpenStreetMap way full API template: https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json
  - Existing compact building and grandstand footprints continue to anchor placement. This pass does not add new surveyed building footprints.

## Findings

- Earlier structure passes already represented changerooms, umpire areas, public toilets, kiosk hatches, switchboards, shelter and maintenance rooms, but the publicly documented sports-pavilion first-aid room and kitchen were still not playable.
- The sources support exterior-access gameplay points and visible frontage cues, not interior reconstruction. No public room plan or service cabinet coordinate was found that should override the current OSM/landmark footprints.
- The bowling-club roof works are specifically about roof sheeting, structure and gutters. That supports visible zincalume sheet/ridge/gutter/downpipe details and a maintenance search point, while preserving the existing heritage-facing building silhouette.

## Implementation Translation

- Added new amenity kind `first_aid_room`.
- Added three source-linked structure interactions:
  - `grandstand-first-aid-room`
  - `grandstand-sports-kitchen`
  - `bowling-roof-gutter-maintenance`
- Added loot/search behavior:
  - First-aid rooms strongly bias toward health and medicine, with modest noise and rare extra ammunition only under higher risk.
  - The sports-pavilion kitchen reuses the existing kitchenette behavior because the source describes a kitchen without a public interior plan.
  - The bowling roof/gutter point reuses maintenance-room behavior because the source describes maintenance works, not public access.
- Updated visible building fabric:
  - Grandstand frontage now has first-aid and kitchen signs, a first-aid cross/cabinet, a kitchen shutter/counter, roof service vent and downpipes.
  - Fitzroy Victoria Bowling Club now has a zincalume roof-sheet overlay, corrugation/ridge cues and downpipes while keeping the building massing unchanged.

## Uncertainty

- Exact first-aid room, kitchen and roof-access coordinates are not public. The interaction points are exterior approximations placed on reachable frontages derived from existing OSM and grandstand polygons.
- The game represents the 2026-2027 Brunswick Street Oval works as a playable present-tense precinct cue. It does not claim that every future sports-pavilion room is open to the public during construction.
- The bowling roof upgrade is modeled as new roof/gutter fabric and a maintenance kit, not as a climbable or enterable roof.

## Validation

- `npm run test:run -- tests/loot.test.ts tests/collision.test.ts tests/geo.test.ts`
  - Verifies first-aid loot behavior, source-linked structure access IDs, park-boundary placement and blocker clearance.
- `npm run research:check`
  - Validates this note and its manifest/index registration.
