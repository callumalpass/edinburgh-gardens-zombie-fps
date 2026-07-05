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
  - The official club site confirms current greens-for-hire, BBQ and social bowling use, supporting visible greenkeeper/service cues around the smaller bowling sheds.

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
  - Follow-up visual correction: rendered the door bank as solid painted metal panels and made mapped building prism materials double-sided, because the irregular OSM footprint and black opening panels made the block read as partially see-through from some walking angles.
  - Source basis: OSM way `242003562` for the irregular footprint; Yarra Edinburgh Gardens facility/accessibility listing for public toilets and accessible park context; CMP guidance that toilet blocks are functional facilities rather than heritage showpieces.
- `osm-building-403753784` / Fitzroy Tennis Club rooms:
  - Added court-side guttering, wall light, social-room sign, accessible ramp with rails, secure-access/works mesh, roof vents and rear court-equipment lockers.
  - Source basis: OSM way `403753784` for the L-shaped rooms footprint; CMP tennis pavilion context for the long-running club/pavilion identity; current Yarra Brunswick Street Oval project notes for accessible facilities, social/community-room context and secure-access works around the tennis precinct.
- `osm-man-made-715802679` / Tennis-side storage tank:
  - Replaced the generic polygon-prism rendering with a round metal tank on a concrete pad, top lid/hatch, side ladder, pipe and valve box.
  - Source basis: OSM way `715802679` tagged `man_made=storage_tank`; the full JSON is stored locally under `docs/research/raw/osm/2026-07-05/buildings/` because this ignored research asset directly drives the visible object type.
- `osm-building-543505638` / Freeman Street gatehouse:
  - Added a small threshold pad, front gate door, guttering, rear ticket-style window, interpretive plaque, paired sign panels, bollards and low rail so it reads as a narrow park/oval gatehouse rather than a plain block.
  - Source basis: OSM way `543505638` for the long narrow footprint; CMP hard-landscaping/buildings schedule for gatehouse significance and signage priority.
- `osm-building-543505639` / Fitzroy Victoria Bowling Club rooms:
  - Added front/rear gutters, a club sign, blue/maroon/gold mural panels on the side wall, roof vents and rink-side equipment storage.
  - Source basis: OSM way `543505639` for the main clubrooms footprint; CMP bowling-club context; Yarra Fitzroy Bowls 150 Years Memorial Wall source for the Makatron mural and club-colour cues; Yarra News roof-upgrade note for zincalume/gutter emphasis.
- `osm-building-543505640` / Round pavilion building:
  - Added a threshold apron, front notice panel, eight perimeter posts, internal bench planks and a roof vent to make the round footprint read as an open timber pavilion.
  - Source basis: OSM way `543505640` for the circular footprint; CMP built-feature inventory context for small park pavilion structures.
- `osm-building-543505702` / Emely Baker Centre:
  - Added an access-friendly ramp with rails, venue sign, rear concrete courtyard, low gate/fence rails, sloped shade sail and roof/service vent.
  - Source basis: OSM way `543505702` for footprint and orientation; Yarra Emely Baker Centre venue page for access-friendly status plus gated outdoor area and shade sail.
- `grandstand` / Kevin Murray Stand:
  - Corrected the stand frontage so seating, front posts and stairs face W. T. Peterson Oval instead of inheriting a fixed side from the OSM polygon point order.
  - Corrected the climb/access fixture to use that same oval-facing side, and added collision tests so the stair prompt stays outside the stand blocker and blocker bypass IDs resolve to actual obstacles.
  - Source basis: OSM grandstand footprint and W. T. Peterson Oval geometry; Yarra Brunswick Street Oval works context for the stand's external stairs and oval-facing sports use.
- `rotunda` / Edinburgh Gardens Rotunda:
  - Rendered the climbable raised platform with lower storey vents, Tuscan-style columns, copper dome, lantern, finial, stairs, handrails, plaques and a capped service plate rather than powered lighting.
  - Source basis: OSM way `543505640` for center/footprint alignment; CMP rotunda feature description; Yarra venue page for bookable, not-wheelchair-accessible and no-power operation.
- `osm-building-1475006767` / Bowling club outbuilding:
  - Added guttering, a roller-door slat, metal service crate and hose reel to read as a small greenkeeper/plant outbuilding attached to the bowling club service edge.
  - Source basis: OSM way `1475006767` for footprint; bowling precinct context from CMP and the current mapped cluster of club support sheds.
- `osm-building-1475006768` / Bowling club shed:
  - Added a front gutter, small roof vent, hose-reel puck and paired service bins so the compact shed reads as active bowling-green support rather than an anonymous block.
  - Source basis: OSM way `1475006768` for footprint; Fitzroy Bowls official site for active greens/BBQ operation; bowling-club precinct context from CMP.
- `osm-building-1475006769` / Bowling club outbuilding:
  - Added front/rear guttering, roller-door slat, low roof vent and timber equipment box scaled to the angled footprint.
  - Source basis: OSM way `1475006769` for the skewed rectangular footprint; Fitzroy Bowls official site for active greens/BBQ operation; bowling-club precinct context from CMP.
- `osm-building-1475006770` / Bowling green shed:
  - Added a long front gutter, hose reel, small tool crate and rear timber storage bench to make the timber shed read as rink maintenance storage.
  - Source basis: OSM way `1475006770` for footprint and timber shed scale; Fitzroy Bowls official site for active greens/BBQ operation; bowling-club precinct context from CMP.
- `osm-building-1475006771` / Bowling green shed:
  - Added short guttering, a small timber crate and low rear storage rail so the smallest shed keeps an appropriate lightweight maintenance role.
  - Source basis: OSM way `1475006771` for footprint and timber shed scale; Fitzroy Bowls official site for active greens/BBQ operation; bowling-club precinct context from CMP.
- `osm-building-1475006772` / Bowling green shed:
  - Added front guttering, a compact roller-door slat, roof vent and hose-reel cue for a small green-side service shed.
  - Source basis: OSM way `1475006772` for footprint and timber shed scale; Fitzroy Bowls official site for active greens/BBQ operation; bowling-club precinct context from CMP.
- `osm-building-1475006773` / Bowling green shed:
  - Added long front/rear guttering, paired shed doors, rear timber storage rack and metal rack uprights to match the longer green-side footprint.
  - Source basis: OSM way `1475006773` for the long skewed footprint; Fitzroy Bowls official site for active greens/BBQ operation; bowling-club precinct context from CMP.

## Implementation Notes

- Building detail code should use shared helper methods for facade panels, roof vents, gutters, signs, lights and ladders rather than repeating anonymous box geometry.
- Footprint-specific modelling must keep gameplay collision conservative: block solid structures and stair/roof affordances, but avoid adding invisible blockers for decorative facade items.
- Active redevelopment references should be represented as temporary access and construction cues only where they improve recognizability. The map should still remain playable as a park, not a construction simulator.
