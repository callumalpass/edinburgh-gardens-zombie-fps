# Street Context Research

Created: 2026-07-05

Scope: roads and edge details around Edinburgh Gardens so the park reads as part of Fitzroy North rather than an isolated island.

## Sources

- Bounded OpenStreetMap Overpass road query:
  - Local raw JSON: `docs/research/raw/osm/2026-07-05/street-context/edinburgh-gardens-surrounding-roads-overpass.json`
  - Query target: named roads around the park inside `(-37.791,144.979,-37.785,144.987)`.
  - Names included: Alfred Crescent, Brunswick Street, St Georges Road, Freeman Street, Jamieson Street, Queens Parade and Napier Street.
  - Used checked-in derived segments for Alfred Crescent, Brunswick Street, St Georges Road and Freeman Street.
- Yarra Edinburgh Gardens page: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for access context: close to Brunswick Street trams, Rushall station and the Capital City Trail.
- Edinburgh Gardens CMP 2004: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - Used for the surrounding-street frame: Brunswick Street, St Georges Road, Alfred Crescent, Jamieson Street, Queens Parade, Napier Street and Freeman Street.
- 3068 Group Edinburgh Gardens studies archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used for heritage context around Freeman Street, cast iron bollards, gas lamp standards and the street-edge significance of the gardens.

## Implementation Decisions

- Added `LevelData.streetEdges` for named street geometry.
  - Streets are visual context, not collision blockers.
  - Street edges intentionally sit partly outside the park boundary.
- Replaced the old generic perimeter asphalt band with named OSM-derived street segments.
  - Brunswick Street and St Georges Road render as wider trunk roads with tram-rail cues.
  - Alfred Crescent and Freeman Street render as narrower residential streets.
  - Kerbs and subtle centre lines are drawn per segment.
- Park entrance crossings are drawn from the same entrance metadata that opens gaps in the boundary fence.
  - This keeps crossings aligned with existing gates, bollards and signs.
- Raw Overpass JSON is retained locally under ignored `docs/research/raw/` and only compact derived coordinates are committed.

## Follow-Up Notes

- The current street pass does not model traffic, parked cars or tram stops. Those would fit better in the park-life/detail pass once performance after the static street geometry is verified.
- Jamieson Street, Queens Parade and Napier Street were included in the raw query but are not yet rendered because they are less immediately adjacent to the playable park boundary.
