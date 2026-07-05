# Raw Research Assets

Raw API responses used during research should be kept locally under `docs/research/raw/`.

This folder is intentionally ignored by git so JSON pulls can be retained in the codebase workspace without being committed by default.

Current local assets:

- `docs/research/raw/osm/2026-07-05/way-*-full.json`
  - Source: `https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json`
  - Purpose: raw OSM way responses backing path/service connector geometry and related map-source checks.
  - Validation: each file was checked with `jq -e '.elements | length > 0'`.
- `docs/research/raw/osm/2026-07-05/buildings/way-*-full.json`
  - Source: `https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json`
  - Purpose: raw OSM way responses backing building footprints and sourceable built-feature profiles.
  - Validation: each file was checked with `jq -e '.elements | length > 0'`.
- `docs/research/raw/osm/2026-07-05/street-context/edinburgh-gardens-surrounding-roads-overpass.json`
  - Source: Overpass API bounded query for named roads around Edinburgh Gardens.
  - Purpose: raw OSM road response backing street-edge context around Alfred Crescent, Brunswick Street, St Georges Road and Freeman Street.
  - Validation: checked with `jq -e '.elements | length'`; way names and IDs were extracted with `jq`.
- `docs/research/raw/osm/2026-07-05/further-realism/edinburgh-gardens-park-features-overpass.json`
  - Source: Overpass API bounded query for Edinburgh Gardens park features.
  - Purpose: local OSM snapshot for further-realism work on paths, trees, buildings, barriers, amenities and sports/play areas. Roads are intentionally excluded from the current goal.
  - Validation: checked with `jq -e '.elements | length'`.
- `docs/research/raw/vicmap/2026-07-05/further-realism/edinburgh-gardens-ground-surface-points.json`
  - Source: Vicmap Elevation metro 1-5 m FeatureServer layer 0 query over the Edinburgh Gardens bounding box.
  - Purpose: raw ground-surface point response used to recheck broad elevation source context.
  - Validation: checked with `jq -e '.features | length'`.
- `docs/research/raw/vicmap/2026-07-05/further-realism/edinburgh-gardens-contours.json`
  - Source: Vicmap Elevation metro 1-5 m FeatureServer layer 1 query over the Edinburgh Gardens bounding box.
  - Purpose: raw contour response used to recheck broad elevation and micro-terrain source context.
  - Validation: checked with `jq -e '.features | length'`.
