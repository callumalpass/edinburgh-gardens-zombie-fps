# Raw Research Assets

Raw API responses used during research should be kept locally under `docs/research/raw/`.

This folder is intentionally ignored by git so raw API pulls can be retained in the codebase workspace without being committed by default.

Committed research notes and raw-asset patterns are registered in `docs/research/research-manifest.json`. Run `npm run research:check` after adding or refreshing a source note. The check is offline and validates local raw JSON/XML only when the ignored files are present.

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
- `docs/research/raw/2026-07-06/osm-*-map.xml`
  - Source: OpenStreetMap map API bounded extracts around the south playground, north playground and W. T. Peterson Oval access connectors.
  - Purpose: raw current OSM XML backing the south-playground fence, current north-playground footprint review and gated oval-fence pass.
  - Validation: checked with `rg` for ways `24489879`, `543616019`, `14946934`, `403753751`, `403753754` and `403753756`; also validated by `npm run research:check` when the local ignored XML files are present.
- `docs/research/raw/2026-07-06/osm-playground-fence-gate-overpass.html`
  - Source: attempted Overpass query for playground/fence/gate objects around Edinburgh Gardens.
  - Purpose: record that the targeted query returned busy-server HTML and was not used for implementation geometry.
  - Validation: searched with `rg`; no derived constants are based on this failed response.
- `docs/research/raw/2026-07-09/osm-map-bbox.xml`
  - Source: OpenStreetMap map API bounded extract for Edinburgh Gardens and immediate surrounding streets.
  - Purpose: current fixed-object audit for OSM trees, amenities, table tennis, paths, buildings and mapped park features.
  - Validation: parsed with Python against OSM boundary way `13815924`; also validated by `npm run research:check` when the local ignored XML file is present.
- `docs/research/raw/2026-07-09/osm-overpass-bbox-all-body-geom-failed.html`
  - Source: attempted Overpass all-body/geometry bbox query on 2026-07-09.
  - Purpose: record that the attempted Overpass mirror response was XML/HTML, not usable JSON. No geometry was derived from this file.
  - Validation: not registered as a parsed raw asset because it is a failure artifact.
- `docs/research/raw/vicmap/2026-07-05/further-realism/edinburgh-gardens-ground-surface-points.json`
  - Source: Vicmap Elevation metro 1-5 m FeatureServer layer 0 query over the Edinburgh Gardens bounding box.
  - Purpose: raw ground-surface point response used to recheck broad elevation source context.
  - Validation: checked with `jq -e '.features | length'`.
- `docs/research/raw/vicmap/2026-07-05/further-realism/edinburgh-gardens-contours.json`
  - Source: Vicmap Elevation metro 1-5 m FeatureServer layer 1 query over the Edinburgh Gardens bounding box.
  - Purpose: raw contour response used to recheck broad elevation and micro-terrain source context.
  - Validation: checked with `jq -e '.features | length'`.
- `docs/research/raw/vicmap/2026-07-05/further-realism/edinburgh-gardens-vicmap-tree-urban.json`
  - Source: Vicmap Vegetation Tree Urban FeatureServer layer 0 query over the Edinburgh Gardens bounding box.
  - Purpose: raw aerial/LiDAR tree-point response used to derive the compact `VICMAP_TREE_GEO` constants.
  - Validation: checked with `jq -e '.features | length'`.
- `docs/research/raw/gardens/2026-07-05/edinburgh-gardens-cmp-2004.pdf`
  - Source: City of Yarra Edinburgh Gardens Conservation Management Plan, 2004.
  - Purpose: raw source for St Georges Road floral display beds, Rotunda Lawn shrub beds, tennis/former Ladies Bowling agapanthus beds, Queen Victoria shrub bed and north-east planter descriptions.
  - Validation: converted to text with `pdftotext` and searched with `rg`.
- `docs/research/raw/gardens/2026-07-05/edinburgh-gardens-cmp-2021.pdf`
  - Source: Lovell Chen 2021 CMP copy archived by the 3068 Group.
  - Purpose: raw source for current ornamental display-bed renewal, stormwater filtration garden/tank split, Queen Victoria display garden and Rowe Street planter status.
  - Validation: converted to text with `pdftotext` and searched with `rg`.
- `docs/research/raw/gardens/2026-07-05/landezine-raingarden.html`
  - Source: Landezine Edinburgh Gardens Raingarden by GHD.
  - Purpose: raw page snapshot for the raingarden project marker, 700 sqm area and visible terrace/channel/filter-media design.
  - Validation: searched with `rg`.
- `docs/research/raw/gardens/2026-07-05/landezine-edinburgh-raingarden-01.jpg` to `landezine-edinburgh-raingarden-12.jpg`
  - Source: Landezine Edinburgh Gardens Raingarden by GHD image gallery.
  - Purpose: raw GHD-owned site photos, cross-section and concept-plan sheets used to verify the terraced raingarden form and rail-trail-side relationship.
  - Validation: inspected with ImageMagick `identify` and local image review.
- `docs/research/raw/gardens/2026-07-05/atlan-raingarden.html`
  - Source: Atlan StormTech raingarden case study page.
  - Purpose: raw page snapshot for the StormTech/GHD raingarden system description and embedded design images.
  - Validation: searched with `rg`.
- `docs/research/raw/gardens/2026-07-05/atlan-edinburgh-raingarden-poster-download.html`
  - Source: attempted Atlan/Spel poster image request.
  - Purpose: record that the attempted poster image download returned an HTML page rather than a usable image.
  - Validation: checked with `file`; no implementation geometry was derived from this failed fetch.
- `docs/research/raw/gardens/2026-07-05/atlan-edinburgh-raingarden-design.jpg`
  - Source: Atlan StormTech embedded Edinburgh Gardens Raingarden design image.
  - Purpose: simplified annotated design image cross-checking the concrete terrace wall, steel edging, low-flow channel and planting-band layout.
  - Validation: inspected with ImageMagick `identify` and local image review.
- `docs/research/raw/gardens/2026-07-05/atlan-edinburgh-raingarden-photo.jpg`
  - Source: Atlan StormTech embedded Edinburgh Gardens Raingarden photo.
  - Purpose: site photo cross-check for the visible terraced planting and channel treatment.
  - Validation: inspected with ImageMagick `identify` and local image review.
- `docs/research/raw/gardens/2026-07-05/yarra-plinth-program.html`
  - Source: Yarra Edinburgh Gardens Plinth Program page request.
  - Purpose: attempted raw page snapshot for the Queen Victoria circular garden-bed context.
  - Validation: the raw request returned a Cloudflare challenge page; browser-accessible source text was used instead.
- `docs/research/raw/gardens/2026-07-05/edinburgh-gardens-garden-features-overpass.json`
  - Source: attempted Overpass query for garden/flowerbed/scrub tags in the Edinburgh Gardens bounding box.
  - Purpose: record that this API attempt did not provide usable garden vertices for the ornamental-bed pass.
  - Validation: the endpoint returned HTTP 406 HTML rather than JSON, so no geometry was derived from it.
