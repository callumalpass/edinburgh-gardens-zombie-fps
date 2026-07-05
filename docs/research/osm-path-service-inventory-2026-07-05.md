# OSM Path and Service Inventory

Captured: 2026-07-05

Purpose: identify real Edinburgh Gardens footway, cycleway, sidewalk and service-path geometry that was missing or under-specified in the playable map.

## Source Queries

Primary Overpass query:

```overpassql
[out:json][timeout:25];
(
  way["highway"~"footway|cycleway|path|steps|service|track"](-37.7903,144.9797,-37.7851,144.9862);
);
out tags geom;
```

The successful Overpass response reported OSM base timestamp `2026-07-05T04:28:59Z` and ODbL attribution text. Subsequent repeated Overpass requests intermittently returned busy-server HTML errors, so implementation used targeted OSM API fetches for individual way IDs after the initial inventory pass.

Targeted OSM API pattern:

```text
https://www.openstreetmap.org/api/0.6/way/{way_id}/full.json
```

## Added or Refined Ways

- `22673070`: short asphalt footway connecting the north-west edge toward the north playground approach.
- `22768137`: asphalt north-west diagonal footpath tying the central spine to the northern path network.
- `75488632`: central asphalt cross-link between the rail-trail alignment and the central/eastern spine.
- `22760904`: west connector to the Queen Victoria plinth circular path.
- `22760905`: east connector from the Queen Victoria plinth path to the eastern diagonal/crescent paths.
- `210387722`: private/service path beside the bowling/rotunda side of the western sporting precinct.
- `1340465893`: south Alfred Crescent sidewalk/path edge, useful for the southern picnic lawn and future street-context work.
- `1340465894`: short south entry spur off the Alfred Crescent path.
- `1361307046`: short southern rail-trail cycle slip.
- `1361307049`: short southern rail-trail foot link.

## Implementation Notes

- New `LevelPath.surface` and `LevelPath.source` metadata preserve source lineage without coupling rendering to OSM IDs.
- `LevelPath.kind` now includes `service`, letting private/service ways render narrower and darker than formal shared paths.
- No collision blockers were added for these paths. They are visual/walkable surface cues.
- Street-edge sidewalks that cross just outside the formal park polygon are intentionally retained for realism and as a base for later road/tram context.

