# Building Realism Pass Research

Date: 2026-07-05

Purpose: track the building-by-building realism pass for every structure currently present on the Edinburgh Gardens map.

## Source Strategy

- OSM full-way JSON remains the source of truth for mapped footprint scale and orientation.
  - Building ways are stored locally under `docs/research/raw/osm/2026-07-05/buildings/`.
  - The tennis-side storage tank JSON is also stored there because the tank is part of the rendered mapped-building set.
- Edinburgh Gardens Conservation Management Plan 2004 is the source of truth for heritage intent and historically important structures.
  - It identifies the grandstand, Freeman Street gatehouse, timber entrance pavilion, tennis club pavilion/courts, Fitzroy Bowling Club and rotunda as significant built elements.
  - It records the rotunda as a raised circular structure with stairs, plaques, vents, Tuscan columns, copper dome, lantern and finial.
  - It treats public toilets as necessary facilities with little or no historical significance, so toilet blocks should read as functional service buildings rather than heritage features.
- Current Yarra venue and project pages are used for active-use cues.
  - Edinburgh Gardens is listed as wheelchair accessible, including accessible toilet and parking.
  - Emely Baker Centre is access friendly and has a gated outdoor area with a shade sail.
  - The rotunda is bookable for small ceremonies but is not wheelchair accessible and currently has no power.
  - Brunswick Street Oval works include upgraded tennis facilities, accessible facilities, an adjoining social/community room, public toilets, refreshed grandstand changerooms/umpire areas, new external stairs and secure access gates.
- Fitzroy Victoria Bowling Club modelling uses current Yarra public-art and news references.
  - The building at 578 Brunswick Street carries a Makatron mural, with blue/maroon club-colour cues and a lion mascot theme.
  - Recent works include replacement zincalume roof sheeting, stronger roof structure and upgraded gutters.

## Building Inventory

| Map id | Real-world identity | Source cues | Modelling target |
| --- | --- | --- | --- |
| `osm-building-242003562` | South service and amenities building | OSM footprint, Yarra public-toilet/accessibility facilities | Public toilet/service door bank, accessible sign, vents, roof equipment, wall light, service-ladder read |
| `osm-building-403753784` | Fitzroy Tennis Club rooms | OSM footprint, CMP tennis pavilion, Yarra Brunswick Street Oval works | Clubroom windows, awning, court-side apron, secure gate/construction-era access cues, accessible/social room context |
| `osm-man-made-715802679` | Tennis-side storage tank | OSM `man_made=storage_tank` full JSON | Round tank body rather than generic prism, top hatch, ladder/pipe and low service fencing context |
| `osm-building-543505638` | Freeman Street / oval gatehouse | OSM footprint, CMP hard-landscaping schedule | Heritage gatehouse massing, ticket/gate window, interpretive sign, bollards and gate threshold |
| `osm-building-543505639` | Fitzroy Victoria Bowling Club rooms | OSM footprint, CMP bowling-club context, Yarra mural and roof sources | Club verandah, mural colour panels, zincalume roof/gutters, clubroom windows, bowling-equipment/service details |
| `osm-building-543505640` | Round pavilion building | OSM round footprint, CMP built-feature inventory | Round timber pavilion, radial posts/openings, small roof vent and entry threshold |
| `osm-building-543505702` | Emely Baker Centre | OSM footprint, Yarra venue page | Access-friendly entry, outdoor fenced area, shade sail, kitchen/service vent, community-room windows |
| `osm-building-1475006767` | Bowling club outbuilding | OSM footprint, bowling precinct context | Utility roller/plant door, roof gutter, greenkeeper/service objects |
| `osm-building-1475006768` | Bowling club shed | OSM footprint, bowling precinct context | Small shed door, bins or hose reel, low service hardware |
| `osm-building-1475006769` | Bowling club outbuilding | OSM footprint, bowling precinct context | Angled shed form, roller door, maintenance storage cues |
| `osm-building-1475006770` | Bowling green shed | OSM footprint, bowling green context | Timber green shed, equipment door, rink-side hose/tool detail |
| `osm-building-1475006771` | Bowling green shed | OSM footprint, bowling green context | Small timber shed, door, roof gutter and low bench/storage detail |
| `osm-building-1475006772` | Bowling green shed | OSM footprint, bowling green context | Timber shed, roller door/vent, bowls-green service cue |
| `osm-building-1475006773` | Bowling green shed | OSM footprint, bowling green context | Long shed with doors, storage rack and green-side service cue |
| `grandstand` | Kevin Murray Stand | CMP, Yarra Brunswick Street Oval works | Refreshed changeroom/umpire doors, secure gates, external stairs, roof/truss and seating detail |
| `rotunda` | Edinburgh Gardens Rotunda | CMP, Yarra venue page | Raised ceremony platform, stairs/rail, no-power/non-accessible cues, columns/dome details, realistic climb only via stairs |
| `north-toilets` | North public toilet block | OSM/Yarra facilities | Functional toilet block with doors, accessible signage, vents, roof service details and screened planting |
| `south-toilets` | South public toilet block | OSM/Yarra facilities | Functional public-toilet rendering aligned with the mapped south facilities and service access cues |

## Building Pass Log

- `osm-building-242003562` / South service and amenities building:
  - Implemented public-toilet door bank with high louvre vents, a blue accessible-facility sign, front/rear gutters, multiple roof vents, wall light, short bollards and a rear service ladder.
  - Source basis: OSM way `242003562` for the irregular footprint; Yarra Edinburgh Gardens facility/accessibility listing for public toilets and accessible park context; CMP guidance that toilet blocks are functional facilities rather than heritage showpieces.

## Implementation Notes

- Building detail code should use shared helper methods for facade panels, roof vents, gutters, signs, lights and ladders rather than repeating anonymous box geometry.
- Footprint-specific modelling must keep gameplay collision conservative: block solid structures and stair/roof affordances, but avoid adding invisible blockers for decorative facade items.
- Active redevelopment references should be represented as temporary access and construction cues only where they improve recognizability. The map should still remain playable as a park, not a construction simulator.
