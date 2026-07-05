# Park Life And Data Pipeline Research

Created: 2026-07-05

Scope: small lived-in park details and the repo workflow for retaining research artifacts without committing bulky raw JSON.

## Sources

- Yarra Edinburgh Gardens page: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for picnic areas, dog areas, drinking fountains, barbecue areas, bicycle/trail access and sports oval context.
- Yarra northern precinct consultation: https://yoursayyarra.com.au/eg-north
  - Used for the northern picnic/BBQ/activity precinct context.
- OpenStreetMap amenities already captured in `OSM_AMENITY_GEO`.
  - Used for benches, bins, drinking fountains, bicycle parking, toilets and BBQ points.
- Edinburgh Gardens CMP and Fitzroy local-history context:
  - CMP: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - 3068 Group archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used for Freeman Street entry/oval notice-board context and the broader edge/heritage setting.

## Implementation Decisions

- Added `LevelData.parkLifeDetails`.
  - These are visual details only; they are not amenities, loot points or collision blockers.
  - Current detail kinds: dog-area signs, picnic blankets, notice boards, casual bikes and oval training cones.
- Kept small props cheap.
  - They use compact primitive geometry and existing terrain-aware placement helpers.
  - No per-detail interaction or physics was added.
- Added `npm run research:check`.
  - The script checks that expected research docs exist.
  - If ignored local raw JSON is present under `docs/research/raw/`, it parses each JSON file and checks OSM-style `elements` arrays are not empty.
  - The check is safe for clean clones because raw JSON is intentionally local-only.

## Follow-Up Notes

- Future research pulls should continue to store raw JSON under `docs/research/raw/` and record the local path in `docs/research/raw-assets.md`.
- Larger park-life systems such as pedestrians, traffic, parked cars or active tram stops should be added only after a broad-phase/static batching pass, because they will be more expensive than these static details.
