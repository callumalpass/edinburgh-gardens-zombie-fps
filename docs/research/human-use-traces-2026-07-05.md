# Human-Use Traces Research

Created: 2026-07-05

Scope: small static details that make Edinburgh Gardens feel actively used without adding expensive pedestrians, traffic or simulation systems.

## Sources

- Yarra Edinburgh Gardens page: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for dog areas, picnic areas, BBQs, drinking fountains and sports oval context.
- Yarra northern precinct consultation: https://yoursayyarra.com.au/eg-north
  - Used for BBQ/picnic, basketball, skate/BMX, table tennis and play-area activity context.
- Yarra Brunswick Street Oval Redevelopment page: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Used for active sports-club and grandstand/oval use context.
- OpenStreetMap bounded park-feature query:
  - Local raw JSON: `docs/research/raw/osm/2026-07-05/further-realism/edinburgh-gardens-park-features-overpass.json`
  - Used for current amenities, courts, oval and play-area geometry.

## Implementation Decisions

- Extended `ParkLifeDetail` with additional non-colliding trace kinds:
  - dog water bowls
  - picnic coolers
  - sports bags
  - chalk/scuff marks
- Kept all traces static and cheap.
  - They use primitive geometry and existing terrain-aware placement.
  - They do not participate in collision, loot or AI.
- Placed details only in documented activity zones.
  - Dog lawns, picnic/BBQ areas, oval/grandstand, basketball and skate areas.

## Follow-Up Notes

- Pedestrians, dogs or animated sports activity would need a broader performance pass and should not be added as one-off animated props.
- If event schedules or real-time council data becomes available, these traces could be varied by time of day or event state.
