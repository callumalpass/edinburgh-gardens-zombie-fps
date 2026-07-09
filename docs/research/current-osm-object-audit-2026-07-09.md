# Current OSM Object Audit

Created: 2026-07-09

Scope: refresh the fixed-object inventory against a current OpenStreetMap map API extract for the Edinburgh Gardens bounding box, with emphasis on trees, benches, bins, drinking fountains, toilets, BBQs, post boxes and the northern table-tennis object.

## Sources

- OpenStreetMap map API bounded extract: https://api.openstreetmap.org/api/0.6/map?bbox=144.9798,-37.7903,144.9860,-37.7853
  - Local raw XML: `docs/research/raw/2026-07-09/osm-map-bbox.xml`.
  - Parsed against OSM boundary way `13815924` so surrounding street and private-property objects in the same bbox were excluded from implementation decisions.
- OpenStreetMap way `715659039`, `leisure=pitch`, `sport=table_tennis`.
  - Source geometry came from the current map API extract above.
- OpenStreetMap way `655160879`, `natural=water`, `water=pond`, `name=Edinburgh Gardens Raingarden`.
  - Source geometry came from the current map API extract above.
- OpenStreetMap way `715802699`, `leisure=garden`.
  - Source geometry came from the current map API extract above.
- OpenStreetMap way `242003500`, `leisure=pitch`.
  - Source geometry came from the current map API extract above; no `sport=*` tag was present.
- OpenStreetMap node `220390942`, `amenity=post_box`.
  - Source point came from the current map API extract above.
- Yarra Edinburgh Gardens northern precinct consultation: https://yoursayyarra.com.au/eg-north
  - Retained as contextual support for table-tennis and picnic-table activity in the northern activity precinct.
- Yarra Edinburgh Gardens facility page: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Retained as contextual support for picnic areas where OSM does not provide individual picnic-table nodes.

## Findings

- Current OSM data inside the park boundary still contains 126 `natural=tree` nodes, matching the existing `OSM_TREE_GEO` IDs. No new OSM tree IDs were missing from the code.
- Current OSM data inside the park boundary contains 47 `amenity=*` nodes. The existing code represented all fixed OSM amenity nodes except node `220390942`, a post box at the Freeman Street entrance.
- OSM bench, waste-basket, drinking-water, toilet, BBQ and bicycle-parking node IDs in the code matched the current extract.
- The northern table-tennis object is mapped as OSM way `715659039`, not just an approximate hand point. The previous in-game point was south-east of the current way centroid.
- The visible raingarden has current OSM water/garden geometry on way `655160879`, which is more detailed and larger than the earlier simplified four-point in-game footprint.
- Current OSM way `715802699` maps a small central garden polygon that was not represented as a separate garden bed.
- Exact OSM way geometry was already present for major feature polygons including Kevin Murray Stand (`403753786`), north toilets (`307404819`), Fitzy Bowl (`231049925`), basketball (`500981577`), Fitzroy Tennis Club (`24489878` plus court ways `715802691`-`715802696`), Fitzroy Victoria Bowling & Sports Club (`24489838` plus bowls pitch ways `715802677` and `715802678`) and many path/cycleway segments. Those objects needed source metadata more than geometry changes.
- OSM way `1392352940` maps a small `amenity=parking` apron beside the Kevin Murray Stand. It needed a distinct polygon surface representation rather than being folded into the grandstand footprint.
- Boundary-filtered OSM way coverage showed several small current connector ways that were previously simplified or only implied by neighboring paths: `22662822`, `1103672695`, `1361301428`, `1361301429`, `403753760`, `403758220`, `1006838305`, `1340462807`, `1533381669` and `1533381670`.
- OSM way `242003500` maps a south-east open pitch without a sport tag, so it should be represented as source-backed open grass rather than sport-specific line markings.
- OSM node `6280110912` maps a nearby `tourism=picnic_site`, and Yarra's northern-precinct source confirms BBQ/picnic tables, but no public per-table GIS nodes were found for individual picnic tables.
- A current Overpass all-body/geometry retry returned an XML/HTML error and was saved locally as `docs/research/raw/2026-07-09/osm-overpass-bbox-all-body-geom-failed.html`. No implementation geometry was derived from it.

## Implementation Translation

- Added OSM node `220390942` to `OSM_AMENITY_GEO` as a `post_box` amenity and rendered it as a small red post box near the Freeman Street entry.
- Added `TABLE_TENNIS_GEO` from OSM way `715659039` and moved `north-table-tennis` to the source geometry centroid.
- Replaced the simplified stormwater filtration garden footprint with current OSM way `655160879`.
- Added OSM way `715802699` as a small central ornamental-shrub garden bed.
- Added OSM way `1392352940` as a source-backed asphalt ground-surface polygon beside the Kevin Murray Stand.
- Added current OSM connector ways `1103672695`, `1361301428`, `1361301429`, `403753760` and `403758220`, refreshed the north curve to exact way `22662822`, and tied existing rail/plinth/edge segments to `1006838305`, `1340462807`, `1533381669` and `1533381670`.
- Added OSM way `242003500` as a source-backed south-east open grass pitch landmark.
- Added explicit source strings to exact-matching major landmarks and paths so OSM way coverage is auditable in code and tests.
- Added explicit source strings to the hand-placed picnic table amenities:
  - north tables are tied to the Yarra northern precinct source and nearby OSM picnic-site node `6280110912`;
  - south tables remain approximate within the mapped south picnic lawn because no public per-table GIS was found.
- Added tests requiring the post box, source-backed table-tennis centroid, current OSM raingarden/garden geometry and source metadata on the fixed furniture, major landmark and path amenities.

## Uncertainty

- OSM is current and sourceable, but not survey-grade. It is the best available public fixed-object point/way source for the full park object inventory.
- The audit validates current OSM nodes and ways against in-game constants. It does not prove that unmapped real-world bollards, signs, seats or individual picnic tables are absent.
- Individual picnic-table coordinates remain approximate. The code now states that uncertainty directly in source metadata.
- Some heritage furniture items remain CMP/context placements because public GIS vertices for each lamp, bollard, sign and reproduction seat are still unavailable.
- The grandstand parking apron geometry is source-backed, but bay paint, kerb detail and any parking furniture remain unresolved because OSM does not provide those subfeatures.

## Validation

- Parsed the local OSM XML with a Python boundary-filter script to count in-boundary tagged nodes/ways and compare OSM IDs with `src/game/levelData.ts`.
- Confirmed current OSM in-boundary counts: 126 `natural=tree` nodes, 26 bench nodes, 12 waste-basket nodes, 3 drinking-water nodes, 2 toilet nodes, 2 BBQ nodes, 1 bicycle-parking node, 1 post-box node, OSM way `715659039` for table tennis, OSM way `655160879` for the visible raingarden, OSM way `715802699` for the small central garden bed, OSM way `1392352940` for the grandstand parking apron and OSM way `242003500` for the south-east open pitch.
- Re-ran the boundary-filtered current OSM way/source coverage check after implementation. The only remaining textual misses were generated tennis court IDs `715802692`-`715802695`, which are emitted from `715802691 + index` and covered by tests.
- Ran `npm run test:run -- tests/geo.test.ts` after the geometry/source update; 39 tests passed.
- Ran `npm run research:check`.
- Ran `npm run build`.
- Ran `npm run game:cli -- snapshot`.
