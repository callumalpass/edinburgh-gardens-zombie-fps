# Building Affordance Realism Research

Created: 2026-07-05

Scope: climbable building readability, especially the Fitzroy Memorial Rotunda, without adding unrealistic roof climbing.

## Sources

- Edinburgh Gardens CMP via the 3068 archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used for the rotunda, grandstand, Freeman Street gatehouse, tennis pavilion, bowling club and built-feature significance context.
- OpenStreetMap building footprints stored locally under `docs/research/raw/osm/2026-07-05/buildings/`.
  - Used for the existing mapped building geometry and sourceable built-feature placement.
- OpenStreetMap bounded park-feature query:
  - Local raw JSON: `docs/research/raw/osm/2026-07-05/further-realism/edinburgh-gardens-park-features-overpass.json`
  - Used to recheck current building/path/barrier context.

## Implementation Decisions

- Extended `InteractableFixture` with access affordance metadata:
  - `accessKind`: stairs, ladder, play-structure, frame or ramp.
  - `landingPosition`: where the player arrives after climbing.
  - `accessHeading`: optional visual/logic orientation for the approach.
- Updated climb behavior.
  - Toggle climbs now place the player at the fixture landing position, not blindly at the building centre.
  - Rotunda and grandstand stairs therefore behave like visible stair approaches.
- Added visible stair affordances.
  - The rotunda now has handrails, posts and a landing threshold on the stair side.
  - The grandstand stair side now has simple handrails and posts.
- Kept heritage logic conservative.
  - The rotunda remains a raised platform interaction, not a dome/roof climb.

## Follow-Up Notes

- A later movement pass could animate the climb between access and landing positions instead of snapping the player after interaction.
- If precise stair dimensions become available, replace the inferred stair/rail geometry with measured dimensions.
