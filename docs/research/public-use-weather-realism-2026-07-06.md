# Public-Use and Weather Realism Pass

Date: 2026-07-06

Purpose: add small, source-backed details that make the level read as the current public Edinburgh Gardens, not only a geometrically correct park, and tune weather handling so rain/wind affect weapon feel without breaking the minimalist anime presentation.

## Sources

- Yarra City Council Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for the park's access-friendly status, facility list, dog conditions around W.T. Peterson Oval/playgrounds/sporting grounds, and alcohol consumption hours.
- Yarra Edinburgh Gardens Rotunda: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/edinburgh-gardens-rotunda
  - Used for the rotunda venue constraints: not wheelchair accessible and no current power.
- Yarra Emely Baker Centre: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/emely-baker-centre
  - Used for access-friendly community-room treatment, gated outdoor area and shade sail context already represented by the building pass.

## Findings

- Edinburgh Gardens is explicitly access friendly overall, but individual venues differ: the rotunda is not wheelchair accessible, while Emely Baker Centre is access friendly.
- Dogs are part of the real park use pattern, but Yarra's public conditions constrain them around playgrounds, sporting grounds and W.T. Peterson Oval.
- Alcohol is permitted in the park only between 9am and 9pm without a permit.
- These are public-use rules, not large geometry features. They should appear as small signs near relevant zones rather than as collision blockers.

## Implementation Translation

- Added `park-rule-sign` to `ParkLifeDetail`, with typed `rule` values for dog leash control, alcohol hours, rotunda stairs/no-power and access-friendly venue cues.
- Added six non-colliding rule-sign placements:
  - north and south playground dog-leash signs,
  - W.T. Peterson Oval dog-control sign,
  - south picnic lawn alcohol-hours sign,
  - rotunda stairs/no-power sign near the stair access side,
  - Emely Baker access-friendly sign near the community-room edge.
- Rendered rule signs through `WorldBuilder.addParkRuleSign()` using compact signboards, posts and simple low-poly symbols. This keeps draw cost low and the style consistent with existing park-life details.
- Added `effectiveFirearmSpread()` and `weatherWeaponInstability()` in `weapons.ts`.
  - Rain, wind and wetness now add a small firearm spread penalty.
  - The penalty is deliberately modest so stance, movement, scoped aiming and stamina remain the main weapon-control factors.

## Uncertainty

- The public pages confirm the rules and venue constraints, but not surveyed sign coordinates. Placements are conservative, readable positions near the relevant mapped features.
- The weapon weather penalty is a gameplay translation of existing in-game weather state, not a claim about exact Melbourne ballistics. It is tuned to be perceptible but secondary.
- No new raw source family was downloaded for this pass. Existing official web pages were sufficient.

## Validation

- `npm run test:run -- tests/geo.test.ts tests/weapons.test.ts`
  - Confirms rule signs are source-backed, in-bounds, non-colliding and cover the intended rule types.
  - Confirms storm handling increases spread only modestly, and crouched scoped aiming remains steadier than standing clear-weather fire.
- Object-preview WebGL capture was attempted with `node scripts/render-object-previews.mjs --kind park-life-detail --angles 2 --out docs/research/renders/object-previews/2026-07-06-public-use-weather-pass/park-life`, but Chromium shutdown was blocked by the container sandbox after the static build fallback.
- Static PNG audit sheets were generated with `node scripts/render-static-audit-sheets.mjs docs/research/renders/object-previews/2026-07-06-public-use-weather-pass/static-audit`.
  - `facade-placement-audit.png`
  - `works-and-tree-audit.png`
  - `weapon-zombie-silhouette-audit.png`
  - `weather-night-audit.png`
  - `public-use-rule-sign-audit.png`
