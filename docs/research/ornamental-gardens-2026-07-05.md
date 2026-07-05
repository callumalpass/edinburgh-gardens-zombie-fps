# Ornamental Gardens And Raingarden Placement

Captured: 2026-07-05

Purpose: correct the visible stormwater filtration garden location and add source-backed ornamental, shrub and floral beds that were not yet represented in the game.

## Findings

- The visible water-cleaning feature is the stormwater filtration garden, also called the Edinburgh Gardens Raingarden. Landezine/GHD gives a project map marker at `-37.787301, 144.983139` and describes a 700 m2 terraced raingarden with filter media, planting and a zig-zagging steel low-flow channel.
- A follow-up path-side audit found the in-game Inner Circle Rail Trail polyline matches current OSM ways `22760903`, `1103672694` and `1006838304`; the marker is east of that rail-trail line and should not be treated as the visible garden's footprint centroid.
- The 2021 Lovell Chen CMP describes the same stormwater filtration garden as concrete and steel terraces, edge walls, a steel channel and planted wetland filtration beds. Figure 96 identifies the former Ladies Bowling Club, west of the former railway/current rail trail, as the current stormwater garden site. The CMP also states that treated water is stored in a 200 kL underground tank to the east.
- The OSM-derived `raingarden-reservoir` footprint aligns better with the east-side underground storage/tank cue than with the visible terraced filtration beds.
- The 2021 CMP records renewed ornamental display beds along the St Georges Road frontage, including restored scalloped edging around the Brunswick Street / St Georges Road boundary planting.
- The 2004 CMP records earlier St Georges Road display beds as two rectangular Hydrangea beds and describes the historical long scalloped garden-bed frontage. The 2021 CMP indicates this frontage has since been renewed.
- The 2004 CMP records three Rotunda Lawn shrub beds along the St Georges Road frontage: a central rounded bed parallel to the boundary and two similar rounded-end beds at right angles.
- The Queen Victoria plinth sits in a circular garden bed. The 2021 CMP says the bed continues to be maintained as a mass-planted display garden; Yarra's Plinth Program page also describes the plinth as standing in the middle of a circular garden bed.
- The 2004 CMP records mass-planted Agapanthus shrub beds north of the tennis courts, with related shrub beds around the former Ladies Bowling Club site. The 2021 CMP identifies that former Ladies Bowling Club location as the current stormwater garden, so the implementation keeps the tennis Agapanthus strip but does not add a separate former-Ladies-Bowling shrub-bed object.

## Implementation Notes

- Added `stormwater-filtration-garden` as the visible terraced raingarden south of the skate park and west of the rail trail, using a hand-placed polygon controlled by Lovell Chen Figure 96, the GHD/Landezine plan sheet and OSM rail-trail alignment. It renders with terraces, wetland planting and a zig-zag low-flow channel.
- Retained `raingarden-reservoir` as the east-side underground storage tank footprint and rendered it as low infrastructure hatches rather than the visible filtration garden.
- Added St Georges Road display beds, Rotunda Lawn shrub beds, the Queen Victoria circular display bed and a tennis Agapanthus strip.
- Only the north-east raised shrub planters carry `cover: "dense-shrub"`. These ornamental/floral/agapanthus beds are visual low planting and do not provide crouch cover.
- Most ornamental-bed geometry is hand-placed because the CMPs describe locations and forms but do not provide public GIS vertices. Each feature carries source metadata in `src/game/levelData.ts`.
- Tree generation excludes only the stormwater filtration bed and dense shrub-cover planters. St Georges Road display beds do not exclude trees because the 2021 CMP notes retained boundary tree planting integrated with the renewed feature beds.

## Raw Artifacts

- `docs/research/raw/gardens/2026-07-05/edinburgh-gardens-cmp-2004.pdf`
- `docs/research/raw/gardens/2026-07-05/edinburgh-gardens-cmp-2004.txt`
- `docs/research/raw/gardens/2026-07-05/edinburgh-gardens-cmp-2021.pdf`
- `docs/research/raw/gardens/2026-07-05/edinburgh-gardens-cmp-2021.txt`
- `docs/research/raw/gardens/2026-07-05/landezine-raingarden.html`
- `docs/research/raw/gardens/2026-07-05/landezine-edinburgh-raingarden-01.jpg` to `landezine-edinburgh-raingarden-12.jpg`
- `docs/research/raw/gardens/2026-07-05/atlan-raingarden.html`
- `docs/research/raw/gardens/2026-07-05/atlan-edinburgh-raingarden-design.jpg`
- `docs/research/raw/gardens/2026-07-05/atlan-edinburgh-raingarden-photo.jpg`
- `docs/research/raw/gardens/2026-07-05/yarra-plinth-program.html` returned a Cloudflare challenge page, so the Yarra Plinth Program evidence was taken from browser-accessible search/open output instead.
- `docs/research/raw/gardens/2026-07-05/edinburgh-gardens-garden-features-overpass.json` records the failed Overpass 406 response. No OSM garden/flowerbed vertices were used from this attempt.

## Sources

- Landezine, Edinburgh Gardens Raingarden by GHD: `https://landezine.com/edinburgh-gardens-raingarden-by-ghd-pty-ltd/`
- Atlan StormTech, StormTech Raingarden at Edinburgh Gardens: `https://atlanstormwater.com/au/stormtech-raingarden-at-edinburgh-gardens-fitzroy-victoria/`
- Edinburgh Gardens Conservation Management Plan, 2004: `https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf`
- Lovell Chen, Edinburgh Gardens Conservation Management Plan, 2021 copy archived by the 3068 Group: `https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf`
- Yarra City Council, Edinburgh Gardens Plinth Program: `https://www.yarracity.vic.gov.au/things-to-do/arts/arts-programs/public-art/edinburgh-gardens-plinth-program`
