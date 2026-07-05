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
