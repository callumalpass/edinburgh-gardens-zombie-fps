# Hannah Gate, South Playground and Fitzy Bowl Refinement

Date: 2026-07-11

Purpose: resolve the apparent gate/entrance-pavilion identity conflict beside the Bowling Club, remove a gameplay obstruction from the real Hannah memorial entrance, and replace provisional south-playground and Fitzy Bowl treatments with photo/aerial/plan-led 2026 baseline geometry.

## Sources

- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), sections 3.2.6–3.2.9 and Figures 61, 66 and 72: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Figure 72 controls the Hannah entrance's paired red-brick piers, dark brick bases, deep weathered caps, asymmetric plaques/notices, folded-back green gate fabric and pink `FBC` threshold inset.
  - Figure 61 and section 3.2.6 confirm that the reconstructed timber entrance pavilion is in its current south-west location. Section 3.2.8 and Figure 66 place the Chandler Fountain at the diagonal-path intersection directly across from that relocated pavilion. Neither object should be moved to the Bowling Club passage in a 2026 baseline.
- Victorian Government, Vicmap Basemap WMS `AERIAL_WM_256`: https://base.maps.vic.gov.au/service?service=WMS&request=GetCapabilities
  - The registered whole-park image controls persistent roof/path/enclosure relationships and the internal south-playground massing fit. Approximate aerial registrations are `-37.789075, 144.983649` for the main fort, `-37.788919, 144.983710` for the rope pyramid, `-37.789024, 144.983541` for the swing bank, `-37.789004, 144.983835` for the viewing mound/shelter and `-37.789069, 144.983935` for the toddler cluster.
- OpenStreetMap ways `24489879` and `231049925`, plus nodes `8464870016` and `6280110915`: https://www.openstreetmap.org/way/24489879 and https://www.openstreetmap.org/way/231049925
  - Control the current south-playground and skatepark envelopes and the retained Fitzy Bowl drinking-fountain/bin points.
- Melbourne Playgrounds, *Edinburgh Gardens (South) Playground*: https://www.melbourneplaygrounds.com.au/edinburgh-gardens-south-playground-alfred-crescent-fitzroy-north
  - Supplies the wide 18 December 2010 overview and equipment inventory: fenced all-abilities paths, long orange/red timber fort, high wave slide, rope web, sandpits, four swings, toddler equipment, chalk walls and central shelter.
- To Hot or Not, *Edinburgh Gardens South playground*: https://tothotornot.com/edinburgh-gardens/
  - Three 2015 photographs resolve the fort's three roofed bays, high eastern slide tower, low rope pyramid, pale sand/rock margins and relative ordering around the central mound.
- Busy City Guide, *Edinburgh Gardens, Fitzroy North*: https://busycitykids.com.au/our-blog/2015/9/17/edinburghgardens-fitzroynorth
  - Six 2015 photographs resolve the single four-seat western swing bank, black accessible bridge, timber/green shelter over the mound, fort hanging-disc run, coloured chalk panels, twin toddler slide, see-saw and red flower spinner.
- City of Yarra, *A revamped skate park for Fitzroy North*: https://yoursayyarra.com.au/skatepark
  - Confirms the May–August 2022 build and publishes Playce tender drawing `19321_003` plus six visualisations. The drawing controls the retained southern bowl complexes, northern/western street transitions, manual pad with rounded end, rails, pump bumps, quarter pipes, layered eastern spectator terrace, retained fountain, relocated bin and refurbished fence/1200 mm safety balustrade.

Raw research copies are retained locally under `docs/research/raw/gardens/2026-07-11/gate-fountain-audit/`, `docs/research/raw/gardens/2026-07-11/south-playground/` and `docs/research/raw/gardens/2026-07-11/activity-precinct/fitzy-bowl-design/`.

## Findings

- Three different gate-like objects had been conflated. The south-west timber entrance pavilion is a relocated/reconstructed historic oval entrance; the Sportsman's Memorial is the six-column arbour south of the Bowling Club; and the smaller Hannah memorial gate is the paired-brick entrance at the club's south-east corner. The first two were already in their correct 2026 locations.
- The Hannah gate's map point and basic pier relationship were correct, but its pale caps, symmetric plaques and half-open leaf pose did not match Figure 72 closely. More importantly, a wave-three fictional `Cut chain` shortcut was spawned directly across the heritage opening, making the live player stop at the threshold even though static collision sampling passed.
- The provisional south playground contained the correct equipment families but not the photographed internal layout. The toddler equipment was on the wrong side, the rope pyramid was displaced eastward, the four swings were split into two invented banks and the fort/viewing-mound relationship was flattened into generic props.
- The south-playground photographs are old, but no public 2026 source or current aerial evidence indicates a wholesale replacement. They are used for persistent equipment identity/relationships, while exact centimetre positions and current wear remain uncertain.
- The first plan-led Fitzy Bowl pass captured the two retained bowl complexes and broad street extension, but omitted the documented perimeter safety fabric and reduced the manual pad, pump bumps and spectator terrace to rectangular blocks.

## Implementation Translation

- Rebuilt the Hannah entrance with two-stage dark weathered caps, a large left honour board, small right notice/access marker, folded-back green leaves and shallow pink `FBC` threshold. Pier collision and the source coordinate remain unchanged.
- Moved the two optional wave-three bolt-cutter chains off the Hannah and Sportsman's heritage entrances and onto ordinary service-lane segments. They remain temporary gameplay objects and no longer alter the 2026 heritage reading or public navigation.
- Retained the south-west entrance pavilion and Chandler Fountain exactly where the CMP and current OSM relationship place them.
- Rebuilt the south playground around five aerial-fitted clusters:
  - a long orange/red three-bay timber fort with pale roofs, rising decks, bridge rails, high segmented wave slide, low slide and western hanging-disc run;
  - a low twelve-spoke rope pyramid north of the fort;
  - one four-seat western swing bank;
  - a raised central viewing mound with timber/green shelter and black accessible bridge;
  - an eastern/southern toddler area with twin yellow slide, see-saw, red four-petal spinner and three coloured chalk panels.
- Replaced rectangular sandpits with two pale irregular/elliptical sand basins and discontinuous boulder margins, and rewove the all-abilities paths through the photographed clusters.
- Moved the climb interaction/blocker from the old generic fort centre to the actual high eastern fort bay and reduced its raised footprint to that visible deck.
- Added the Playce-documented Fitzy Bowl perimeter fence/1200 mm green safety balustrade with a public opening beside the exact retained drinking-fountain point. The fence is solid outside the opening.
- Refined the 2022 street section with a rounded-end manual pad, two pump/roll-over mounds and a three-stage rounded concrete/dark-edge/timber spectator terrace while retaining the two connected original bowl complexes, plan-led rails and outer banks.
- The painterly/anime material and lighting treatment is unchanged.

## Uncertainty

- The CMP Hannah photograph is from the 2021 plan and supplies proportions rather than measured elevations. The mapped entrance point is fitted to the current OSM bowling boundary; no public survey fixes pier width, cap thickness or leaf hinge angle.
- The south-playground photo set dates from 2010/2015. Vicmap confirms the same persistent massing and OSM retains the same enclosure, but individual components may have received maintenance, repainting or small replacements by July 2026. The implementation therefore claims high-confidence identity/relative placement, not a centimetre-accurate as-built equipment survey.
- The five south-playground aerial coordinates are approximately 0.4 m/pixel visual fits. Tree canopy and shadows limit individual equipment precision.
- Playce drawing `19321_003` is a compressed tender JPEG rather than CAD/as-built geometry. Skate feature topology, side of the site and documented dimensions such as the 1200 mm balustrade are controlling; transition radii, coping profiles and curved terrace outlines remain proportional fits inside OSM way `231049925`.
- The Fitzy Bowl fence opening is anchored to the exact retained fountain node because the tender plan labels that entrance relationship but does not publish a machine-readable gate point.

## Validation

- Manually compared the CMP gate/pavilion/fountain pages, the registered Vicmap crops, the 2010 overview, all nine 2015 south-playground views and all seven Fitzy Bowl tender images.
- `tests/buildingRenderGeometry.test.ts` verifies the Hannah caps/threshold, fort high-deck alignment, Fitzy Bowl vertical-bar balustrade, rounded manual pad family and kidney timber terrace.
- `tests/geo.test.ts` verifies the Fitzy Bowl fence source, fountain-side opening, open collision gap and source-backed south-playground climb footprint.
- `tests/collision.test.ts` retains full-radius gate, playground and skate navigation checks. `tests/rescueScenario.test.ts` proves neither temporary shortcut chain remains within four game units of the Hannah gate or Sportsman's Memorial.
- Targeted Vitest runs pass 72 geometry/collision tests after the playground/skate refinement.
- Four-angle object-preview audits for the rebuilt south playground and Fitzy Bowl report zero automatic signal issues under `tmp/object-visual-audit/2026-07-11-south-playground-v2/` and `tmp/object-visual-audit/2026-07-11-fitzy-bowl-v2/`; the frames were manually reviewed.
- The regenerated four-angle fence audit under `tmp/object-visual-audit/2026-07-11-fitzy-fence-v1/` reports zero automatic signal issues and shows the documented safety fabric plus public access break from every side.
- `tests/bowlingClubAssetNavigation.spec.ts` passes against the full runtime: it loads the Bowling Club GLB, walks the full player proxy through the Hannah pier plane, verifies the frontage shelter and successfully uses the club interaction.
- `tests/activityPrecinctNavigation.spec.ts` passes against the full runtime and refreshes twelve first-person views under `tmp/playwright-audit/activity-precinct-2026/`. Manual review of the close south-playground pair, both Fitzy Bowl sides and the fountain-side access confirms readable equipment/feature separation, continuous perimeter fabric outside the opening and no misplaced temporary chain.
- The final regression passes all 260 Vitest tests across 48 files; `npm run research:check` validates 53 documents, 106 sources and the registered raw artifacts; `npm run build` passes after the shared-worktree audio implementation settled.
