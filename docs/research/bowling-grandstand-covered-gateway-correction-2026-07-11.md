# Bowling Club–Grandstand Covered Gateway Correction

Date: 2026-07-11

Purpose: correct the long roofed object between the Fitzroy Victoria Bowling Club and Kevin Murray Stand from a solid generic shed into the source-visible, player-passable covered gateway identified by the user.

## Sources

- User-supplied annotated Google Maps aerial screenshot, captured from the satellite view centred approximately at `-37.78802, 144.98118`: https://www.google.com/maps/@-37.78802,144.98118,20z/data=!3m1!1e3
  - The red circle and arrow identify the long light roof between the Bowling Club and grandstand and explicitly correct its functional reading as a gate/passage rather than a solid building.
  - The ignored research copy is `docs/research/raw/gardens/2026-07-11/bowling-grandstand-covered-gate/google-maps-user-highlight.png`.
- OpenStreetMap way `1475006769`: https://www.openstreetmap.org/way/1475006769
  - Supplies the exact long rectangular roof envelope already registered in the game.
- Victorian Government Vicmap Basemap WMS `AERIAL_WM_256`: https://base.maps.vic.gov.au/service?service=WMS&request=GetCapabilities
  - Cross-checks the persistent roof, adjoining paths, eastern paved forecourt and Bowling Club/grandstand relationship.
- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.2.9: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Confirms that the Bowling Club ancillary fabric includes both prefabricated sheds and open-sided roof structures. This supports separating the highlighted roof from the seven generic solid shed treatments, but does not by itself provide measured post spacing or gate hardware.

## Findings

- The game had classified every OSM ancillary roof in this precinct as a solid `bowling-shed`. Way `1475006769` therefore rendered as a blank grey prism directly in the Bowling Club–grandstand route.
- The earlier aerial interpretation sent `vicmap-bowling-grandstand-passage` around the south-west side of the prism. The highlighted Google image instead establishes the circled roof as the gate/passage object itself: the route must enter the mapped footprint and emerge into the eastern paved forecourt.
- The source evidence is strong for roof position, envelope, open/passable function and surrounding paving. It is not a measured ground-level facade survey, so fine posts, rails, roof pitch and hardware remain conservative image fits.
- A wave-three fictional bolt-cutter chain had been relocated onto this passage during the previous Hannah-gate correction. Once the passage was correctly routed through the covered gate, that chain again occupied a real gate and had to be moved to an ordinary private service-track segment.

## Implementation Translation

- Reclassified only `osm-building-1475006769` as `covered-gateway`; the other six mapped bowling sheds remain solid generic ancillary buildings.
- Retained the exact OSM roof footprint and replaced the solid prism with a shallow pale corrugated gable, exposed green-grey posts, discontinuous low side rails, gutters and a high transverse lintel.
- Left a broad central transverse opening with no mesh below head height. Matching collision uses one explicit full-depth access gap rather than a gameplay bypass, so the player capsule physically crosses the real footprint.
- Rerouted `vicmap-bowling-grandstand-passage` from the bowling service-path endpoint through the covered opening, across the source-visible eastern forecourt and into the exact grandstand/tennis service-path endpoint.
- Added an automatic covered-gate passage fixture and a roof shelter zone. The route is dry under the canopy and is navigable in both directions.
- Moved the optional rescue-scenario chain from this corrected gate to the middle of OSM bowling service track `210387722`, away from the Hannah gate, Sportsman's Memorial and covered gateway.
- The painterly/anime rendering treatment is unchanged.

## Uncertainty

- Google Maps does not expose an imagery capture date in the supplied screenshot, and the annotation obscures a small part of the roof/forecourt. It is used with current OSM/Vicmap persistence, not as a dated cadastral survey.
- No public ground-level image or as-built drawing was found that measures the highlighted structure's post count, rail pattern, roof pitch or exact clear opening. Those details are intentionally restrained and may be refined if a closer photograph is supplied.
- The transverse route centreline is fitted to the visible paving and the OSM roof polygon. It is not claimed to be centimetre-accurate.

## Validation

- The four-angle object audit at `tmp/object-visual-audit/2026-07-11-bowling-grandstand-covered-gateway-v2/` reports zero automatic signal issues and was manually inspected after removing a redundant raised paving slab.
- `tests/buildingRenderGeometry.test.ts` proves the former prism is now a distinct roof, twelve supports, open lintel and interrupted side-rail treatment.
- `tests/collision.test.ts` samples the complete opening at full player radius without a bypass; `tests/geo.test.ts` proves the route enters the mapped roof footprint and the one access gap spans the full structure depth.
- `tests/bowlingGrandstandCoveredGatewayNavigation.spec.ts` passes in the full runtime, walking beyond the opposite wall line in both directions and confirming the player is sheltered under the roof. Persistent approach, exit and under-roof frames are stored at `tmp/playwright-audit/bowling-grandstand-covered-gateway/`.
- `tests/rescueScenario.test.ts` proves neither bolt-cutter chain is placed inside the covered-gateway polygon.
- The post-relocation live rerun passes in 6.1 minutes; manual review of `contact-sheet-v2.jpg` confirms the former `Cut chain` barrier/prompt is absent from both gate approaches.
- Final regression: all 264 Vitest tests across 49 files pass, `npm run research:check` validates 54 documents and 111 sources, `npm run build` passes, and `git diff --check` reports no whitespace errors.
