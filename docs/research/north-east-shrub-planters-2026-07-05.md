# North-East Shrub Planters

Captured: 2026-07-05

Purpose: document the raised shrub planters near the Rowe Street / Alfred Crescent entrance and translate them into accurate playable cover.

## Findings

The feature is not the newer stormwater raingarden. It is a separate set of older ornamental planters in the north-east of Edinburgh Gardens:

- The main feature is the "Bluestone planter north of Rowe Street" in the 2021 CMP. It is a large circular raised garden bed just south of the nearby Elm Circle, about 10 metres in diameter, with brick-sized bluestone pitchers in stacked bond and a surrounding concrete mowing strip.
- The 2004 CMP describes the same feature as the "Conifer Shrub Bed": a large raised circular garden bed in the north-east of the Gardens, approximately 10 metres in diameter, built of bluestone pitchers and planted with dwarf conifers.
- The Rowe Street entrance is flanked by two smaller circular beds. The 2021 CMP records raised concrete kerbs and notes that the City of Yarra refreshes the planting periodically.
- The 2004 CMP records the Rowe Street entrance beds as about 5 metres in diameter, edged by raised concrete kerbs, and planted at that time with Convolvulus.
- The Captain Cook Society page was used only to confirm the Rowe Street / Alfred Crescent entrance context. The Captain Cook memorial itself is not a reliable current anchor because it was removed after damage and a 2025 council decision.

## Implementation Notes

- These planters are not mapped as OSM features, so their exact GIS coordinates are hand-placed from the CMP descriptions, Rowe Street entrance context, existing park boundary geometry and the north-east Elm Circle relationship.
- A 2026-07-06 placement audit found that the original hand-placed centers put the large bluestone planter and the south Rowe Street bed too close to mapped OSM path corridors. The centers were moved to preserve the CMP-described Rowe Street / Elm Circle relationships while keeping each circular bed outside the nearest mapped path edge by more than its modeled radius.
- Game scale is `WORLD_SCALE = 1.28`.
- The bluestone planter is modeled as a 10 m diameter circular garden landmark: `5 * WORLD_SCALE` radius.
- The Rowe Street pair are modeled as 5 m diameter circular garden landmarks: `2.5 * WORLD_SCALE` radius.
- All three carry `cover: "dense-shrub"` so crouching inside or right beside the bushes counts as stealth cover without making the beds behave like impassable buildings.
- Tree generation excludes these polygons so the low shrub beds do not accidentally receive full tree trunks.
- `tests/geo.test.ts` now checks that all three raised shrub planters remain inside the park boundary, free of generated trees and clear of the mapped path network.

## Sources

- Edinburgh Gardens Conservation Management Plan, 2004: `https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf`
- Lovell Chen, Edinburgh Gardens Conservation Management Plan, 2021 copy archived by the 3068 Group: `https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf`
- Captain Cook Society, Plaque to Cook at Edinburgh Gardens: `https://www.captaincooksociety.com/remembering-cook/memorials/types-of-cook-memorials/plaque-to-cook-at-edinburgh-gardens-melbourne-victoria-australia`
- OpenStreetMap way API extracts for the current path network: `https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json`
