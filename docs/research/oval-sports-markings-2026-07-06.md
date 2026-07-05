# Oval Sports Markings Research

Created: 2026-07-06

Scope: W. T. Peterson Oval sports-surface details, including Australian-rules line markings, cricket pitch details, boundary markers and match-day props. This pass replaces the earlier generic circular oval cue with markings that respect the mapped Edinburgh Gardens oval footprint while keeping the game's anime-style minimalism.

## Sources

- Yarra City Council, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for the overall park scale, open-lawn/specimen-tree character and facilities list that includes sports use.
- Brunswick Street Oval Redevelopment updates: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Used for current oval/grandstand/tennis precinct context, including active works, grandstand works and tree-replacement scope.
- OpenStreetMap map API playground and oval access extracts: https://api.openstreetmap.org/api/0.6/map?bbox=144.9817,-37.7899,144.9849,-37.7872
  - Used for the already imported W. T. Peterson Oval polygon, fence/access ways and connector geometry in `src/game/levelData.ts`.
- OpenStreetMap way full API template: https://www.openstreetmap.org/api/0.6/way/14946934/full.json
  - Used as the source family for the mapped oval footprint.
- CITS WA Australian rules football dimensions guide: https://www.cits.wa.gov.au/sport-and-recreation/sports-dimensions-guide/football-%28australian-rules%29
  - Used by the existing sports-fixture model for Australian-rules goal and behind-post spacing.
- AFL oval line-marking guide: https://play.afl/sites/default/files/2024-10/Measure%20Out%20and%20Line%20Mark%20of%20Australian%20Rules%20Oval_v1.pdf
  - Used for the 50 m arcs, 50 m centre square, 10 m outer centre circle, 3 m inner centre circle, 9 m goal square depth and boundary-marking method.
- MCC Laws of Cricket 2017 Code, 4th Edition 2026: https://www.lords.org/getattachment/a9ec27d0-0828-4fc1-bf10-7f7edf5204a1/Laws-of-Cricket-2017-Code-4th-Edition-2026.pdf
  - Used for the cricket pitch length and width, creases, wicket width and stump height.

## Findings

- Edinburgh Gardens is a 24 hectare park with open lawns, specimen trees, paths and listed sports facilities. The oval should read as a real public sports surface inside that park rather than as a decorative circular patch.
- The existing level data already contains the OSM-derived W. T. Peterson Oval polygon and two football-goal fixtures. Those are stronger anchors than a renderer-only circle because they keep the markings tied to the real mapped footprint and to shared collision/fixture data.
- The AFL guide gives line-marking dimensions that can be translated directly into compact game geometry: 50 m arcs, a 50 m centre square, 10 m and 3 m centre circles, 9 m-deep goal squares and boundary marks measured around the ground.
- The MCC cricket law source fixes the pitch at 22 yards / 20.12 m by 10 ft / 3.05 m, with creases and stumps/wickets checked as part of match setup. That supports a small, legible wicket detail on the oval without turning the game into a sports simulator.
- The 2026 Yarra Brunswick Street Oval works page confirms the oval/grandstand/tennis precinct remains an active sports precinct. The renderer should keep sports details present but avoid adding new unsurveyed court or building footprints until public vertices exist.

## Implementation Translation

- `src/game/sportsFixtures.ts` now stores named AFL and cricket marking constants so renderer details and tests share the same source-backed dimensions.
- `src/game/rendering/WorldBuilder.ts` derives an oval marking frame from the two existing football-goal fixtures and the OSM oval polygon, then:
  - draws the oval boundary from the mapped polygon rather than from a hard-coded circle;
  - samples low boundary markers along the polygon edge;
  - adds footprint-aware mowing bands that sit inside the mapped surface;
  - adds AFL 50 m arcs, centre square, centre circles and goal squares using `WORLD_SCALE`;
  - adds a scaled cricket pitch with bowling creases, popping creases, return creases, stumps and bails;
  - adds small wet run-up sheen patches so the cricket surface participates in the winter weather pass;
  - places non-colliding benches and a scoreboard on the spectator/grandstand side as match-day cues.
- The 50 m centre square is clamped inside the mapped oval frame before drawing so the line work does not spill outside the real footprint in the scaled FPS map.
- `tests/geo.test.ts` now asserts the source-backed sports constants, protecting the line-marking dimensions from later silent drift.
- `scripts/render-static-audit-sheets.mjs` now generates `oval-sports-markings-audit.png` alongside the other ignored local QA sheets. The sheet checks boundary shape, goal-square placement, cricket wicket detail, bench/scoreboard side and wet-surface cues.

## Uncertainty

- No public CAD, council GIS layer or club marking plan was found for the exact current W. T. Peterson Oval line paint. The implementation therefore combines the OSM oval footprint, the shared football-goal fixtures and published AFL/MCC sport dimensions.
- The cricket pitch orientation is aligned to the oval's goal-to-goal axis for clarity and gameplay readability. If a public cricket wicket survey or club plan becomes available, this should be updated.
- Bench and scoreboard positions are spectator-side cues within the mapped oval surface, not surveyed object points. They are deliberately non-colliding and low detail for performance.
- The static audit PNGs under `docs/research/renders/object-previews/` are local ignored QA artifacts. They are not committed because this folder is used for generated render outputs.

## Validation

- `node scripts/render-static-audit-sheets.mjs docs/research/renders/object-previews/2026-07-06-oval-sports-realism/static-audit`
  - Generated `oval-sports-markings-audit.png` plus the existing facade, works/tree, weapon/zombie, weather/night, rule-sign and heritage-furniture audit sheets.
- `npx vitest run tests/geo.test.ts --reporter=dot`
- `npm run build`
- `npm run research:check`
- `node scripts/render-object-previews.mjs ...` was also attempted for WebGL object PNGs, but Chromium failed in this container before page render with a sandbox host `Operation not permitted` error. The static SVG-to-PNG audit sheet above was generated and visually inspected as the fallback artifact check.
