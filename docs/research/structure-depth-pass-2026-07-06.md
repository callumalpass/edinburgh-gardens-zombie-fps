# Structure Depth Pass

Date: 2026-07-06

Purpose: improve Edinburgh Gardens buildings and structures as recognisable, source-backed places with more useful interactions, without inventing unsourced interiors or survey-grade doorway locations.

## Sources

- City of Yarra, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Confirms the park is access friendly and lists pavilion, public toilets, sports oval and other public facilities.
- City of Yarra, Edinburgh Gardens Rotunda: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/edinburgh-gardens-rotunda
  - Confirms the rotunda is a bookable space, not wheelchair accessible, and has no current power.
- City of Yarra, Emely Baker Centre: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/emely-baker-centre
  - Confirms the access-friendly venue, 30-person capacity, 11 x 7 m floor space, gated outdoor area, shade sail, tables, chairs and kitchenette with small refrigerator and microwave.
- City of Yarra, Brunswick Street Oval redevelopment: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Confirms sports-pavilion and heritage-grandstand works: upgraded grandstand changerooms and umpire areas, new external stairs, secure access gates, externally accessible public toilets, tennis clubhouse relocation, new social space and upgraded amenities.
- City of Yarra Edinburgh Gardens Conservation Management Plan 2004: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - Confirms the built-feature hierarchy and describes the rotunda as a First World War memorial with raised platform, lower base, steps, plaques, Tuscan columns, entablature and copper dome/lantern.
  - Describes the north-east public toilet block as a 1972 utilitarian tan-brick structure with flat concrete roof.
  - Identifies the grandstand, Freeman Street gatehouse, tennis club pavilion/courts, Fitzroy Bowling Club and rotunda as significant built elements.
- OpenStreetMap way full API template: https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json
  - Existing checked-in compact coordinates continue to drive OSM building footprints and linked structure IDs, especially `543505640`, `543505702`, `242003562`, `543505638`, `403753784`, `543505639` and `1475006770`.
- Fitzroy Victoria Bowling & Sports Club official website: https://www.barefootbowling.com.au/
  - Supports current active green/social use, used only for bowling service-locker gameplay interpretation.

## Findings

- The previous building passes made major structures more visible, but several documented uses still had no in-world affordance:
  - Grandstand umpire areas were documented but not interactive.
  - Emely Baker's kitchenette, tables/chairs and booked-room capacity were documented but not visible or searchable.
  - The bowling support sheds were visible but not useful as service-locker interactions.
  - The north toilet block was visually functional but lacked a service/search interaction.
  - The rotunda memorial plaques were visible as facade detail but not directly interactive.
- The sources support exterior, abstracted interactions rather than full interiors. Public doorway locations and room plans are not available, so positions are placed on reachable exterior frontage points derived from existing OSM/building polygons.

## Implementation Translation

- Added new amenity kinds:
  - `umpire_room`
  - `kitchenette`
  - `memorial_plaque`
- Added five new source-linked structure interactions:
  - `grandstand-umpire-room-access`
  - `bowling-green-service-locker`
  - `emely-baker-kitchenette`
  - `north-toilets-service-room`
  - `rotunda-memorial-plaque`
- Updated gameplay behavior:
  - Umpire rooms now bias toward ammo/scrap plus some medicine.
  - Kitchenettes bias toward health/medicine from food and first-aid supplies.
  - Memorial plaques are a non-loot interaction that steadies aim and slightly reduces the blur/focus timer.
- Updated visuals:
  - Added tennis social-space door/sign cues.
  - Added Emely Baker capacity sign, kitchenette/service vent, outdoor furniture stacks and service detail.
  - Added grandstand secure-gate panels to the oval-facing changeroom/umpire frontage.
  - Added rear louvres and service panel details to the south amenities building.
  - Added an unfenced visual-only planting/palisade ring around the rotunda to echo the documented historical setting without changing collision.
  - Added distinct rendered cues for umpire rooms, kitchenettes and memorial plaques.
- Updated minimap and object-preview support so the new interaction types use structure-style markers and preview scale.

## Uncertainty

- Exact public doorway coordinates, current internal fitouts and service-room locations were not available. Interaction points are therefore reachable exterior approximations tied to documented structure roles and OSM/CMP footprints.
- The rotunda palisade/garden ring represents a documented historical setting cue. It is rendered as visual-only detail, not a claim that the current rotunda is fully fenced.
- The bowling service-locker interaction is placed outside the collision-blocked bowls precinct while linked to the OSM shed and current active bowling-club use.

## Validation

- `npm run test:run -- tests/loot.test.ts tests/collision.test.ts tests/geo.test.ts`
  - Verifies new loot profiles, source-linked access points, boundary placement and collision clearance.
- `npm run research:check`
  - Validates this note and its source registrations through the research manifest.
