# Skatepark Bowls and North Playground Correction

Date: 2026-07-06

Purpose: correct the north playground fence assumption and rebuild the Fitzy Bowl skatepark so the playable space has enterable, lowered bowls instead of an invisible full-footprint blocker.

## Sources

- Melbourne Playgrounds, Edinburgh Gardens North Playground: https://www.melbourneplaygrounds.com.au/edinburgh-gardens-north-playground-alfred-crescent-fitzroy-north
  - Used to verify the current/recent north playground equipment mix and the absence of a current north-fence claim. The page separately describes the south playground as fenced.
- Mamma Knows North, Edinburgh Gardens and Playground: https://mammaknowsnorth.com.au/parks-and-playgrounds/edinburgh-gardens-and-playground-north-fitzroy
  - Used as a recent public-visit cross-check for the north playground's toddler/preschooler, ropes, swings and sandpit emphasis without a fence claim.
- Yarra Your Say, Fitzy Skate Bowl: https://yoursayyarra.com.au/skatepark
  - Used for the 2022 upgrade context: the refurbished Fitzy Skate Bowl kept the original bowls, expanded the facility, added beginner-to-advanced features, and made the skate/BMX area larger and more inclusive.
- GOSKATE, Fitzroy Skatepark: https://goskate.com/sp/listing/fitzroy-skatepark/
  - Used for bowl depth and feature translation: two deeper concrete bowls around 1.2 m and 1.5 m, a shallow beginner bowl around 0.3 m, spine/roll-over/hip-transfer features, and street-section ramps/rails/ledges/boxes.
- Time Out Melbourne, Fitzroy Skatepark: https://www.timeout.com/melbourne/sport-and-fitness/fitzroy-skatepark
  - Used as a public cross-check that the skatepark has several concrete bowls, including a small beginner double bowl.
- Skater Maps, Edinburgh Gardens Skatepark: https://skatermaps.com/edinburgh-gardens-skatepark/
  - Used as a skating-source cross-check for the historical "Fitzroy Bowls" identity, concrete bowls, small beginner double bowl and later street-plaza upgrade.
- North Fitzroy Rotunda, Fitzy Bowl Set for Revamp: https://www.northfitzroyrotunda.com/post/fitzy-bowl-set-for-revamp
  - Used for upgrade context that the existing bowl remained while the park gained quarter pipes, rails, ledges and spectator seating.
- Broadsheet, Fitzroy Bowl Skate Park Expansion: https://www.broadsheet.com.au/melbourne/city-file/article/fitzroy-bowl-skate-park-expansion
  - Used as secondary upgrade context for keeping the original bowl while adding concrete transitions/obstacles, flat-ground options, seating, lighting and shade.

## Findings

- Current/recent public north-playground sources do not support a fence around the relocated OSM footprint. Older public-visit sources and the 2004 CMP may describe an earlier or pre-relocation northern play area, so the north fence should not be carried forward without current geometry or current wording.
- The south playground remains source-supported as fenced/safety-gated and continues to use the mapped fence with inferred gates.
- The Fitzy Bowl skatepark should not be one full collision polygon. The real place is defined by bowls, transitions and street features that people can enter and traverse.
- Public sources give enough depth cues for gameplay translation: two deeper original bowls around 1.2 m and 1.5 m and a shallow beginner bowl around 0.3 m. Exact public CAD/BIM geometry was not found.
- The 2022 upgrade retained the original bowls and added beginner-friendly and street/plaza elements, so the game should combine depressed bowl terrain with rails, ledges, banks, quarter-pipe and seating cues.

## Implementation Translation

- Removed `north-playground-fence` from `OSM_FENCES_GEO`. The north playground still has source-backed equipment/layout metadata, but no blocking fence.
- Removed the old `skate` full-footprint collision obstacle. This eliminates the invisible south-side skatepark blocker.
- Added `LevelData.skateBowls` with three approximate bowl ellipses inside the OSM skatepark footprint:
  - two deep original bowls with `depth` values of `1.5` and `1.2`;
  - one shallow beginner double-bowl cue with `depth` `0.35`.
- Added `skate-bowl` elliptical terrain modifiers so bowl bottoms are physically lower in `TerrainSampler` rather than visually implied by props.
- Added bowl egress handling in `GameApp`: outside-to-inside movement is allowed, so the player can fall or walk into a bowl; inside-to-outside movement is resisted except through modeled roll-out gaps. This makes entering easy and escaping intentionally awkward without restoring an invisible skatepark wall.
- Rebuilt `WorldBuilder.addSkatePark()` to render lowered concrete bowl surfaces, rim/coping segments with visible gaps, street ledges, rail, banks, quarter-pipe and concrete seating.
- Lowered the auto skate-deck interactable height from the former ramp-scale lift to a small concrete-deck offset so it no longer masks the bowl depression.

## Uncertainty

- Public sources describe bowls and depth categories but do not provide exact surveyed bowl outlines, roll-in points or CAD geometry. Bowl centers, ellipse radii and roll-out gaps are approximate within the OSM skatepark polygon.
- The game uses `y` as vertical height and `z` as horizontal world depth. The "low zvalue" gameplay request is implemented as low vertical terrain height at bowl centers.
- The roll-out gaps are gameplay affordances aligned with the visual coping gaps, not surveyed gate/ramp coordinates.
- If a council plan with measured bowl outlines becomes available, replace the three approximate ellipses with measured geometry and update this note.

## Validation

- `tests/geo.test.ts` now asserts that no `skate` obstacle exists, that the skatepark has three `skate-bowl` terrain modifiers, and that each bowl center sits inside the OSM skatepark polygon with lowered micro-relief.
- `tests/geo.test.ts` now asserts that `north-playground-fence` is absent while `south-playground-fence`, `oval-fence` and the existing tennis-side OSM fence remain.
- `npm run research:check` validates this note's manifest entry and source IDs.
