# Playground and Fence Layout

Date: 2026-07-06

Purpose: improve the playable and visible model of the two Edinburgh Gardens playgrounds, their safety fencing, and the oval fence/gate behavior without inventing unsupported survey detail.

## Sources

- OpenStreetMap map API extracts:
  - South playground way `24489879`: `https://api.openstreetmap.org/api/0.6/map?bbox=144.9833,-37.7893,144.9844,-37.7886`
  - North playground way `543616019`: `https://api.openstreetmap.org/api/0.6/map?bbox=144.9826,-37.7864,144.9834,-37.7857`
  - Oval and connector ways `14946934`, `403753751`, `403753754` and `403753756`: `https://api.openstreetmap.org/api/0.6/map?bbox=144.9798,-37.7898,144.9825,-37.7879`
  - Used for current playground footprints, the W. T. Peterson Oval polygon and path connectors that align with oval fence access points.
- City of Yarra, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used to keep playground, picnic, BBQ, basketball, skate and oval facilities within the documented public facility set.
- City of Yarra Edinburgh Gardens Conservation Management Plan 2004: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - Section 3.4.22 documents the north and south playgrounds as enclosed by recent steel fences and distinguishes the smaller northern steel-framed play area from the southern treated-pine-log playground.
- Yarra northern precinct consultation: https://yoursayyarra.com.au/eg-north
  - Used for the northern playground's 2018 relocation context, younger-age/natural-play emphasis and nearby BBQ, table-tennis, half-court, skate/BMX activity cluster.
- Melbourne Playgrounds, Edinburgh Gardens South Playground: https://www.melbourneplaygrounds.com.au/edinburgh-gardens-south-playground-alfred-crescent-fitzroy-north
  - Used for the south playground's fenced/safety-gated condition, all-abilities paths, wooden structure, wave slide, monkey bars, rope spider web, sandpits, chalk walls, four swings, toddler area and central shelter.
- Melbourne Playgrounds, Edinburgh Gardens North Playground: https://www.melbourneplaygrounds.com.au/edinburgh-gardens-north-playground-alfred-crescent-fitzroy-north
  - Used on follow-up review to confirm the current north playground equipment mix and that current public wording calls out the south playground as fenced, not the north playground.
- Mamma Knows North, Edinburgh Gardens and Playground: https://mammaknowsnorth.com.au/parks-and-playgrounds/edinburgh-gardens-and-playground-north-fitzroy
  - Used as a recent public-visit cross-check for the current north playground, including climbing ropes, swings, sandpit and toddler/preschooler emphasis, with no fence claim.
- To Hot or Not, Edinburgh Gardens: https://tothotornot.com/edinburgh-gardens/
  - Used as older/secondary public-visit evidence for playground equipment and the pre-relocation or earlier north-playground fence state.
- Busy City Guide, Edinburgh Gardens Fitzroy North: https://busycitykids.com.au/our-blog/2015/9/17/edinburghgardens-fitzroynorth
  - Used as older/secondary photo/visit evidence for the earlier north playground and for the south playground's fenced state, swings, main structure, rope frame, sandpit, twin slide, seesaw and roundabout-style spinner.
- Proludic, VIC Edinburgh Gardens playground: https://www.proludic.com.au/reference/vic-edinburgh-gardens-playground/
  - Used for the 2018 toddler-unit evidence at the northern playground, including younger-age play, tunnel and crawling-ramp cues.

## Findings

- The current OSM extracts preserve two distinct playground footprints:
  - Way `24489879` is the south playground footprint beside Alfred Crescent.
  - Way `543616019` is the smaller northern playground footprint in the northern activity precinct.
- Public guide evidence and the 2004 CMP support a fenced south playground. Follow-up review found that older sources describe the former or earlier north playground as fenced, but current/recent north playground sources do not support adding a fence around the relocated OSM footprint.
- Public OSM data did not expose dedicated `barrier=fence` ways or `barrier=gate` nodes around either playground. Gate locations are therefore inferred from visible path approaches and from the documented safety-gated/all-abilities access pattern, not surveyed gate vertices.
- The oval has a mapped pitch footprint and several OSM path connectors to the surrounding path/grandstand network, but no public barrier way describing every rail or gate. The existing runtime oval rail was therefore converted into a low blocking mapped fence with openings at the connector alignments.
- The oval fence is treated as low and jumpable for gameplay. Playground safety fences and the tennis-side OSM fence are not jumpable.

## Implementation Translation

- `src/game/levelData.ts` now adds source-backed `MappedFence` entries for:
  - `south-playground-fence`, using the south playground footprint with three inferred safety-gate gaps.
  - `oval-fence`, using the W. T. Peterson Oval footprint with three OSM connector-aligned gate gaps.
  - `osm-fence-715802680`, preserving the existing tennis-side OSM fence.
- The north playground is not modeled with a fence. Its landmark source notes the current OSM/recent-public-source evidence and the absence of a current public fence source for the relocated footprint.
- Fence collision is segmented around gate gaps. The generated obstacles use `sourceObjectKind: "mapped-fence"`, do not block sight, and only the oval segments are marked `jumpable`.
- `WorldBuilder` now renders mapped fences through the same segmented/gated path used by collision. The previous continuous oval rail was removed so the visible fence and collision fence agree.
- The south playground visible model now separates the source-described equipment into a large timber fort, slide, rope web, two swing sets, sandpits, toddler slide, chalk wall, seesaw, spinner, internal access paths and shelter.
- The north playground visible model now uses a smaller toddler-focused tower, tunnel/crawling-ramp cue, spring riders, small swings and natural-play balance logs.
- Player jump support was added as a short stamina-costing jump. It can bypass only obstacles explicitly marked as low/jumpable, currently the oval fence.

## Uncertainty

- Gate positions and radii are inferred. The evidence supports south-playground and oval gate access, but no public source found exact gate coordinates or clear measured gate widths.
- Internal equipment positions are approximate within the OSM footprints. The sources establish equipment families and relative scale, not a precise CAD plan.
- Some public guide pages are visit/photo sources and may describe equipment over a span of years. The north playground OSM way was updated in 2026 and the Yarra/Proludic 2018 plus recent public sources were used to avoid overfitting older photos where they conflict with the current relocated northern footprint.
- The oval fence height/jump threshold is a gameplay translation of a low perimeter rail. It should be replaced if a public barrier/fence dataset with surveyed dimensions becomes available.

## Raw Artifacts

- `docs/research/raw/2026-07-06/osm-south-playground-map.xml`
  - Contains OSM way `24489879` with `leisure=playground` and `source=image`.
- `docs/research/raw/2026-07-06/osm-north-playground-map.xml`
  - Contains OSM way `543616019` with `leisure=playground`.
- `docs/research/raw/2026-07-06/osm-oval-fence-access-map.xml`
  - Contains OSM way `14946934` for W. T. Peterson Oval and connector ways `403753751`, `403753754` and `403753756`.
- `docs/research/raw/2026-07-06/osm-playground-fence-gate-overpass.html`
  - Records the failed Overpass busy-server response. No geometry was derived from it.

## Validation

- `rg` was used against the raw OSM XML to confirm the expected way IDs and tags.
- `npm run research:check` validates the manifest and optional local raw OSM XML cache.
- `npm run test:run -- tests/geo.test.ts tests/collision.test.ts` checks the mapped fences, gates, source references and obstacle source linkage.
