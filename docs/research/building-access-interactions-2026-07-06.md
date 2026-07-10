# Building Access Interactions

Date: 2026-07-06

Purpose: make Edinburgh Gardens structures more usable in play while keeping each new interaction tied to a documented building, facility or precinct role.

## 2026-07-10 Supersession

The original `south-amenities-service-room` interaction inherited a mistaken generic-building identity. OSM way `242003562` is Alfred Crescent Sports Pavilion. The current baseline replaces that interaction with the photographed west clubroom entrance, documented oval-side kiosk, completed expanded public toilets and retained south accessible toilets. See `docs/research/alfred-crescent-pavilion-blender-asset-2026-07-10.md`.

## Sources

- Yarra City Council, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Confirms the park is access friendly and lists pavilion, public toilets, sports oval, picnic, basketball, skate and related public facilities.
- OpenStreetMap full building ways stored under `docs/research/raw/osm/2026-07-05/buildings/`.
  - Used for footprints and structure IDs: `403753784`, `543505639`, `543505638`, `543505702`, `242003562` and the Kevin Murray Stand footprint already compacted in `src/game/levelData.ts`.
- City of Yarra Edinburgh Gardens Conservation Management Plan 2004: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - Identifies the grandstand, Freeman Street gatehouse, tennis pavilion/courts, bowling club and rotunda as significant built elements.
  - Describes the bowling club clubhouse, ancillary structures, chain-mesh/galvanised pipe fence and memorial gate context.
  - Treats toilet blocks as functional service buildings rather than heritage centrepieces.
- Yarra Brunswick Street Oval redevelopment: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Supports grandstand changeroom/umpire-area cues, external stairs, secure access gates, externally accessible public toilets, tennis clubhouse relocation, tennis social space and upgraded amenities.
- Yarra Emely Baker Centre: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/emely-baker-centre
  - Supports the community-room interaction point at the access-friendly venue with gated outdoor area and shade-sail context.
- Fitzroy Victoria Bowling & Sports Club official site: https://www.barefootbowling.com.au/
  - Supports current social/club use and green-side support activity for the bowling-club access point.

## Findings

- The previous building pass made the structures visibly richer, but only a few of them were interactive: rotunda deck, grandstand seats, toilet roofs and selected upgrade stations.
- Public evidence supports a broader set of real use points without inventing full interiors:
  - Grandstand changerooms and umpire areas are part of current redevelopment scope.
  - Tennis facilities include clubhouse/social-space and upgraded-amenity context.
  - Bowling clubrooms and service gates are documented through the CMP and current club use.
  - The Freeman Street gatehouse is a real oval-entry structure, so its ticket-window side can support a small low-noise search.
  - Emely Baker Centre is a community venue, so a first-aid/community-room interaction is appropriate.
  - The earlier assumption that the southern building was merely a functional toilet/service block was later disproved by CMP Figure 145 and pavilion-specific sources.

## Implementation Translation

- Added six source-linked `AmenityPoint` structure access interactions:
  - `grandstand-changeroom-access`
  - `tennis-clubroom-access`
  - `bowling-clubroom-access`
  - `oval-gatehouse-window`
  - `emely-baker-community-room`
  - `south-amenities-service-room` (superseded on 2026-07-10 by the Alfred Crescent Pavilion-specific interactions above)
- Extended amenity kinds with `clubroom`, `changeroom`, `gatehouse`, `maintenance_room` and `community_room`.
- Reused the existing amenity search state machine instead of adding a parallel interaction system.
  - Clubrooms bias toward ammo/scrap and occasional attachments.
  - Changerooms and community rooms bias toward health/medicine.
  - Maintenance rooms bias toward scrap, supplies and noisier search.
  - Gatehouse search is quieter and scrap/key focused.
- Added visible structure-access cues in `WorldBuilder`:
  - Threshold slab, latch/keypad panel and sign for every access point.
  - First-aid cabinets for changeroom/community-room points.
  - Ticket hatch and bollards for the gatehouse.
  - Service locker and hose reel for the maintenance room.
  - Clubroom locker/crate cues for club access points.
- Improved structure realism in the same pass:
  - Kevin Murray Stand now shows changeroom/umpire doors and timber seat rows behind the front screen.
  - The bowls precinct now has a simplified brick-pier/wrought-metal memorial-gate cue, matching the CMP description of the club boundary/entrance context.
- Minimap and object-preview metadata now treat structure access points as a distinct amber interaction family.

## Uncertainty

- Sources confirm facility roles and building identities, but not exact public doorway coordinates. Access positions are therefore frontage-side gameplay points placed just outside collision blockers, not surveyed door centres.
- The bowling-club interaction is placed on the reachable park-side club gate rather than the Brunswick Street facade because the bowling precinct itself is a collision blocker. This preserves gameplay access while still linking the interaction to the documented clubrooms and memorial-gate context.
- Interior access is abstracted as searching at external doors, hatches or service points. No new interior rooms were modeled because public floor plans and current opening/access details were not available.

## Validation

- `npm run test:run -- tests/loot.test.ts tests/collision.test.ts`
  - Checks structure loot profile differences.
  - Checks all six structure access points remain present, source-linked and within the park boundary.
- `npm run research:check`
  - Validates this note and its registered source IDs through the research manifest.
