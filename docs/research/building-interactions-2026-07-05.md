# Building Interaction Research

Date: 2026-07-05

Purpose: make climbable buildings feel like real park structures rather than generic vertical toggles.

## Sources

- Edinburgh Gardens Conservation Management Plan 2004.
  - Rotunda description records a raised circular platform over a lower base, accessed by a flight of stairs with solid balustrade and capped piers.
  - The rotunda is described as a primary-significance landmark, not a roof-climb structure.
  - The CMP hard-landscaping/building schedule identifies the grandstand, Freeman Street gatehouse, tennis pavilion, bowling club, Queen Victoria pedestal and rotunda as significant built elements.
- OSM building footprints stored locally under `docs/research/raw/osm/2026-07-05/buildings/`.
  - Used to keep platform/roof/stand interaction targets aligned with the mapped buildings.
- Yarra and Victorian Government 2024-2026 Brunswick Street Oval project material.
  - Used as current context for grandstand and sports-building access upgrades, including public toilets, changerooms, stairs and landscape works.

## Implementation Decisions

- Added `InteractableFixture.accessPosition`, `exitPosition` and `accessRadius`.
- Toggle proximity now uses the access point when the player is on the ground, and the elevated fixture point when the fixture is already active.
- Activating a climbable fixture moves the player from the access point to the elevated platform point; deactivating returns them to the access/exit point.
- The rotunda interaction now uses the rendered stair side as the access point and climbs to the raised platform height rather than the dome or roof.
- Toilet roof interactions now read as service-ladder access, not generic roof teleporting.
- Grandstand interaction now reads as stair access to seats.

## Follow-Up

- Add object placement/collision pass for football posts, basketball hoops and solid tree trunks.
- Extend interaction prompts if construction-stage details are added for Brunswick Street Oval.
