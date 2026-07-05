# Path and Raingarden Audit

Captured: 2026-07-05

Purpose: review all currently mapped park paths against a fresh bounded OSM extract, then replace the flat water patch south of the skate park with a source-backed Edinburgh Gardens raingarden treatment feature.

## Path Review

The live OSM map API extract for the Edinburgh Gardens bounding box returned 43 in-boundary `highway=footway|cycleway|service|steps` ways. The level already had the major axial, rail-trail, plinth, oval-loop and southern-entry routes, but still lacked several short connectors and the detailed Kevin Murray Stand stair network.

Added or refined ways:

- `22760900`: short north-west asphalt footway tying the north playground approach to the northern perimeter walk.
- `22760908`: north-east asphalt cycle/shared link toward Alfred Crescent and the rail-trail edge.
- `403753751`: short northern oval entry connector.
- `403753754`: short western oval connector.
- `22760906`: private/service path beside the tennis and grandstand side of the sporting precinct.
- `715802681` to `715802684`: four Kevin Murray Stand step runs.
- `715802685` and `715802686`: upper and lower Kevin Murray Stand footways.
- `715802687` to `715802690`: short step-link footways around the stand.

Implementation notes:

- `LevelPath.kind` now includes `steps` so stair runs can render as concrete step surfaces with tread marks and avoid oversized path lighting.
- Step paths use narrower shoulders and smaller terrain crown/shoulder modifiers than ordinary footways.
- Path lights now skip `footway`, `steps` and `service` paths, so the small service/step additions do not create unrealistic lamp-post clutter.

## Raingarden Review

The feature south of the skate park is not a pond. Public project writeups describe the Edinburgh Gardens Raingarden as a stormwater treatment and harvesting system designed by GHD, installed around 2011-2012, using stormwater from the North Fitzroy Main Drain to irrigate mature trees and sporting fields.

Source-backed design details used:

- The raingarden includes a diversion pipe, gross pollutant trap, surcharge pit, approximately 700 sqm raingarden/filter-media area, overflow pit and 200 KL underground storage.
- The visible landscape design is a terraced raingarden with four terraces responding to the natural grade.
- A zig-zagging low-flow steel channel connects to the surcharge pit.
- Planting/filter media is the primary visible treatment surface; water is represented as a narrow channel cue rather than a broad open pond.

Implementation notes:

- `raingarden-reservoir` remains a non-blocking garden landmark anchored to the OSM reservoir footprint.
- Rendering now adds low planted/filter-media terraces, basalt terrace dividers, a zig-zag low-flow channel, an inlet/surcharge pit cue, an overflow/tank hatch cue and instanced raingarden planting.
- The underground tank is represented with low hatch/infrastructure cues only, keeping gameplay collision clean while making the stormwater system legible.

## Sources

- OpenStreetMap bounded map API: `https://api.openstreetmap.org/api/0.6/map?bbox=144.9798,-37.7903,144.9860,-37.7853`
- OpenStreetMap way API template: `https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json`
- Landezine, Edinburgh Gardens Raingarden by GHD: `https://landezine.com/edinburgh-gardens-raingarden-by-ghd-pty-ltd/`
- Atlan StormTech, StormTech Raingarden at Edinburgh Gardens: `https://atlanstormwater.com/au/stormtech-raingarden-at-edinburgh-gardens-fitzroy-victoria/`
- City of Yarra WSUD Guidelines: `https://www.yarracity.vic.gov.au/sites/default/files/2024-04/73_water_sensitive_urban_design_guidelines_city_of_yarra_as_amended_from_time_to_time.pdf`
