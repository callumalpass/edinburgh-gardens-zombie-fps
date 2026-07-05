# Path Material Transitions Research

Created: 2026-07-05

Scope: asphalt/gravel edge blending, compacted junctions, informal desire paths and high-use thresholds.

## Sources

- Edinburgh Gardens CMP via the 3068 archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used for the asphalt path network, remnant basalt/bluestone edging, bluestone-pitcher drain and the heritage path structure.
- OpenStreetMap bounded park-feature query:
  - Local raw JSON: `docs/research/raw/osm/2026-07-05/further-realism/edinburgh-gardens-park-features-overpass.json`
  - Used for current path, amenity, sports/play and barrier geometry.
- Yarra Edinburgh Gardens page: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for picnic, BBQ, dog-area, sports oval and general open-lawn activity context.
- Yarra northern precinct consultation: https://yoursayyarra.com.au/eg-north
  - Used for northern BBQ/play/skate/basketball activity context.

## Implementation Decisions

- Added `LevelData.pathSurfacePatches`.
  - Patch kinds: feathered path edges, compacted junctions, informal desire paths, gravel feathering and muddy thresholds.
  - Most patches are derived from existing mapped paths.
  - A small number of desire paths are hand-placed from documented high-use activity areas where no OSM path exists.
- Patches are visual only.
  - They do not affect collision or pathfinding.
  - They are placed with terrain-aware rectangles so they follow broad elevation and local micro-relief.
- Kept surfaces subtle.
  - The intent is worn transitions and compacted soil, not new formal paths.

## Follow-Up Notes

- If aerial imagery or council path-condition data becomes available, replace inferred desire paths with traced surface polygons.
- Future renderer work could batch same-material path patches, but current counts are modest and terrain-conforming rectangles are more accurate than flat instancing.
