# Activity Precinct and Bowling Passage Refinement

Date: 2026-07-11

Purpose: replace approximate playground, skatepark, raingarden and Bowling Club-to-grandstand treatments with plan-led 2026 baseline geometry, then review the result from multiple live first-person viewpoints.

> Refined later on 2026-07-11 by `hannah-gate-south-playground-fitzy-bowl-refinement-2026-07-11.md`: the south playground is now internally registered from aerial/photo relationships rather than only retained as an equipment family, and Fitzy Bowl now includes the tender-documented safety balustrade, fountain-side opening, rounded manual pad, pump bumps and rounded spectator terrace.

> The Bowling Club–grandstand passage finding is superseded by `bowling-grandstand-covered-gateway-correction-2026-07-11.md`: user-highlighted Google aerial evidence identifies OSM roof `1475006769` as the passable covered gate itself, so the final route crosses through the footprint rather than around a retained solid outbuilding.

## Sources

- City of Yarra, Enhancing Edinburgh Gardens: Northern Precinct and Playground: https://yoursayyarra.com.au/eg-north
  - The endorsed Northern Precinct Plan controls the relationship between the relocated playground, BBQ area, expanded skate/BMX area, table-tennis/basketball activity area, paths, retained trees and removed redundant fences.
  - The one-page `Playground Upgrade - Final Concept Plan` controls relative equipment positions: northern activity unit A; central triple and basket swings; spinner; southern trampoline; activity unit F; nature-play margins; planted buffer; grass mound; seats and shade sails.
- City of Yarra, A revamped skate park for Fitzroy North: https://yoursayyarra.com.au/skatepark
  - Confirms the Grind Projects build ran May-August 2022, retained the original bowls, more than doubled the facility, added beginner/accessibility opportunities and spectator seating, and publishes seven winning-tender design images.
  - The published Playce site plan, drawing `19321_003`, controls the two retained connected southern bowl complexes, northern street extension, perimeter flat banks and quarter pipes, manual pad, straight and curved rails, accessible transitions, timber spectator terrace, retained drinking fountain, relocated bin and refurbished fence.
- Vicmap Basemap WMS `AERIAL_WM_256`: https://base.maps.vic.gov.au/service
  - The registered whole-park aerial shows a continuous worn service passage between OSM bowling service way `210387722` and tennis/grandstand service way `22760906`, passing the mapped bowling outbuilding `1475006769`.
- Landezine, Edinburgh Gardens Raingarden by GHD: https://landezine.com/edinburgh-gardens-raingarden-by-ghd-pty-ltd/
  - The landscape plan and photographs control the long-axis sequence of four filtration bays, pale concrete edges, dense rush planting and weathering-steel zig-zag low-flow channel.
- Atlan StormTech, StormTech Raingarden at Edinburgh Gardens: https://atlanstormwater.com/au/stormtech-raingarden-at-edinburgh-gardens-fitzroy-victoria/
  - Cross-checks the planted treatment-bed appearance and stormwater-harvesting function.
- Melbourne Playgrounds, Edinburgh Gardens South Playground: https://www.melbourneplaygrounds.com.au/edinburgh-gardens-south-playground-alfred-crescent-fitzroy-north
  - Retains the south playground's source-backed fenced, all-abilities layout family: timber fort, wave slide, rope web, sandpits, chalk walls, swings, toddler equipment and central shelter.

## Findings

- Superseded: the first pass interpreted the continuous route as passing around a retained bowling outbuilding. The later user-highlighted aerial identifies that same mapped roof as the passable covered gate; see the correction note above.
- The north playground footprint was correct but its equipment was a generic scatter. The final concept plan provides enough plan-view information to fix each equipment family's relative position and three separate shade-sail zones.
- The skatepark's previous three unrelated ellipses contradicted the published tender drawing. The retained southern fabric is two connected double-bowl complexes; the 2022 addition is predominantly a northern/western street and transition field with an eastern spectator terrace.
- The raingarden's four long parallel bars were rotated conceptually. Its four filter bays step along the long axis and are visually dominated by dense rushes, concrete edges and a transverse zig-zag steel channel.
- No new evidence changes the southern playground footprint or known equipment family. It was retained and included in the multi-angle review rather than rearranged from aerial canopy shadows.

## Implementation Translation

- Added `vicmap-bowling-grandstand-passage`, a 2.35-game-unit asphalt service link whose endpoints exactly meet the two OSM paths and whose intermediate centreline is fitted to the aerial. Full-player-radius collision sampling confirms every route sample clears the Bowling Club, outbuilding, grandstand and trees.
- Rebuilt north playground detail placement from the final concept plan: activity units A/F, triple and basket swing zones, spinner, rope-trampoline, sand/nature-play elements, four seats and three shade sails. The climbable activity-unit position and rendered deck remain aligned.
- Replaced the three skate ellipses with four lobes grouped into two connected retained bowl complexes. Locomotion now permits movement between lobes in the same complex while retaining coping/exit resistance at exterior walls.
- Replaced the generic skate street scatter with plan-led west/north banks, quarter-pipe returns, manual pads, straight and curved rails, and a stepped concrete/timber spectator terrace.
- Reoriented the raingarden as four sequential long-axis bays, added pale perimeter/divider walls, retained the zig-zag channel and changed sparse cone plants to dense instanced rush blades.
- Added `tests/activityPrecinctNavigation.spec.ts`, producing eleven stable first-person captures under `tmp/playwright-audit/activity-precinct-2026/` and proving live movement through the Bowling Club-grandstand passage.

## Uncertainty

- The 2018 north playground plan is a final concept plan rather than an as-built survey. Relative equipment positions and families are treated as controlling, while centimetre dimensions remain fitted within current OSM way `543616019` and the current aerial footprint.
- The published skate drawing is legible but supplied as a compressed JPEG rather than CAD. Feature topology and relative location are controlling; curve radii and vertical transition profiles remain game-scale approximations within OSM way `231049925`.
- The Bowling Club-grandstand connector has no separate OSM way. Its endpoints are exact mapped path endpoints, while the two intermediate vertices are aerial-fitted. The path does not displace the mapped outbuilding or any tree.
- The raingarden's 700 square metre envelope remains the previously documented CMP/aerial fit. Individual plant counts and species distribution are not publicly surveyed.

## Validation

- Rendered and manually inspected the two official one-page northern precinct/playground PDFs at 180 dpi.
- Manually inspected all seven published Fitzy Bowl tender images, including Playce drawing `19321_003`, plus the existing Landezine/Atlan raingarden contact sheet and registered Vicmap aerial crops.
- `tests/activityPrecinctNavigation.spec.ts` passes and records eleven viewpoints covering both passage directions, both playgrounds, both skatepark directions and two raingarden approaches.
- `tests/collision.test.ts` samples the complete passage at `PLAYER_RADIUS`; no obstacle displacement occurs.
- The four-angle object-preview audit renders the passage and four landmarks as 20 frames with zero automatic signal issues under `tmp/object-visual-audit/2026-07-11-activity-precinct-final/`; all contact sheets were manually inspected.
- The complete 44-file / 243-test Vitest suite, research validation and production build pass after the refinement.
