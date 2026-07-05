# Structure Utility Interactions

Date: 2026-07-06

Purpose: make Edinburgh Gardens buildings more interactive and tactical while keeping new structure features tied to documented public uses rather than invented interiors.

## Sources

- City of Yarra, Brunswick Street Oval redevelopment: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Used for the sports-pavilion kiosk terrace, externally accessible public toilets, upgraded grandstand changerooms/umpire areas, secure gates, new external stairs, tennis clubhouse relocation, tennis social space and upgraded amenities.
- City of Yarra, Emely Baker Centre: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/emely-baker-centre
  - Used for the powered venue interpretation: kitchenette, small refrigerator, microwave, bookable main space, tables/chairs and shared-toilet condition.
- City of Yarra, Edinburgh Gardens Rotunda: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/edinburgh-gardens-rotunda
  - Used as a negative constraint: the rotunda is not wheelchair accessible and has no current power, so it deliberately does not receive a utility switchboard or floodlight interaction.
- City of Yarra, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for the broader access-friendly park and public-toilet context.
- OpenStreetMap way full API template: https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json
  - Existing compacted building footprints continue to anchor the linked structure IDs and exterior placement.

## Findings

- The previous passes made buildings recognizable and searchable, but the documented structure uses still did not change the tactical state of the park.
- Yarra's Brunswick Street Oval redevelopment evidence supports a kiosk/terrace and externally accessible public toilets at the grandstand/sports-pavilion works. These are playable as an exterior kiosk hatch and public-toilet access, not as interior rooms.
- Powered public or bookable buildings are supported by evidence: Emely Baker has kitchen appliances, the tennis redevelopment has social/amenity space, the sports pavilion has kiosk/public-toilet functions and the south amenities building is a public toilet/service structure.
- The rotunda source explicitly says no current power is available. The game now preserves that as a constraint by excluding the rotunda from utility-box/floodlight affordances.

## Implementation Translation

- Added new amenity kinds:
  - `kiosk_hatch`
  - `utility_box`
- Added source-linked structure interactions:
  - `grandstand-external-public-toilets`
  - `grandstand-kiosk-hatch`
  - `grandstand-switchboard`
  - `tennis-switchboard`
  - `emely-baker-switchboard`
  - `south-amenities-switchboard`
- Added visible kiosk and switchboard models to `WorldBuilder` using the existing structure-access cue system.
- Searching a `utility_box` now activates a persistent exterior floodlight at that structure. This gives the player a tactical light source, but standing inside an active lit zone increases zombie visibility against the player.
- Added loot profiles for kiosk hatches and utility boxes so they feel distinct from clubrooms, kitchens and maintenance rooms.

## Uncertainty

- Public sources support the building uses and powered fixtures, but not exact switchboard cabinet coordinates. Switchboards are therefore exterior gameplay approximations placed against reachable service edges and kept outside collision blockers.
- The grandstand kiosk terrace is represented as a hatch because public concept imagery names the kiosk terrace but does not provide a current public interior plan.
- Floodlights are a gameplay translation of powered-building service access, not a claim that the exact modeled light poles exist at these coordinates.

## Validation

- `npm run test:run -- tests/loot.test.ts tests/stealth.test.ts tests/collision.test.ts tests/geo.test.ts`
  - Verifies new loot profiles, lit-zone stealth tuning, source-linked structure placement and blocker clearance.
- `npm run research:check`
  - Validates this note and its manifest entry.
