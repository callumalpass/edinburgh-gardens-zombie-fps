# Data Pipeline Automation Research

Created: 2026-07-05

Scope: make Edinburgh Gardens research assets easier to audit and extend while keeping bulky raw JSON local-only.

## Sources

- OpenStreetMap way API: https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json
  - Used for individually fetched path, building and fence way responses.
- OpenStreetMap Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
  - Used for bounded park-feature and surrounding-road extracts when broad OSM queries are practical.
- Vicmap Elevation metro 1-5 m FeatureServer: https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer
  - Used for open ArcGIS JSON responses with contour and ground-surface `features` arrays.
- Vicmap Elevation 1 m DEM overview: https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-elevation/1m-dem
  - Used as a reference for future higher-resolution elevation work; the public game data currently uses the open metro FeatureServer instead.
- Vicmap Vegetation Tree Urban FeatureServer: https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Vegetation_Tree_Urban/FeatureServer/0
  - Used as the ArcGIS raw-JSON pattern for tree-point research assets.

## Implementation Decisions

- Added `docs/research/research-manifest.json` as the source of truth for:
  - committed research notes
  - external source URLs and URL templates
  - optional local raw JSON path patterns
  - expected raw JSON shape by provider
- Updated `npm run research:check` to read the manifest instead of maintaining a hardcoded document list inside the script.
- Kept the check offline.
  - Source URLs are syntax-checked, not fetched.
  - Clean clones pass without ignored raw JSON.
  - Local raw JSON is still validated when present in `docs/research/raw/`.
- Added format-specific raw JSON validation:
  - OSM and Overpass extracts must expose a non-empty `elements` array.
  - Vicmap ArcGIS extracts must expose a non-empty `features` array.
- The script also verifies that research notes listed in the manifest are referenced from the main index, avoiding orphaned notes.

## Architecture And Performance Notes

- The manifest removes repeated script edits for every realism slice and keeps validation data beside the research corpus.
- The validation stays dependency-free and fast enough for normal local checks.
- Local raw JSON remains ignored by git, so future large extracts do not bloat commits while still being retained in the workspace for follow-up research.
