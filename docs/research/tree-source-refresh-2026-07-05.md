# Tree Source Refresh Research

Created: 2026-07-05

Scope: keeping tree placement sourceable after the Brunswick Street Oval redevelopment updates, without reintroducing synthetic avenue trunks.

## Sources

- Yarra Brunswick Street Oval Redevelopment page: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Used for current project context: tennis-court expansion, grandstand works, tree-removal timing, the 2026-2027 planting/construction program, 39 tree removals, 35 replacement trees and three English elms associated with the tennis expansion.
- Yarra Brunswick Street Oval consultation page: https://yoursayyarra.com.au/brunswickstoval
  - Used for revised-design context, including tree removals for tennis-court expansion and replanting/landscaping commitments.
- OpenStreetMap bounded park-feature query:
  - Local raw JSON: `docs/research/raw/osm/2026-07-05/further-realism/edinburgh-gardens-park-features-overpass.json`
  - Used to retain OSM `natural=tree` node IDs in the compact level data.
- Edinburgh Gardens CMP via the 3068 archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used for heritage context around elm avenues and significant planting.

## Implementation Decisions

- Replaced anonymous OSM tree coordinates with OSM node IDs in `OSM_TREE_GEO`.
  - Rendered tree IDs now include the OSM node ID, making future map-data refreshes easier to diff.
- Suppressed OSM tree nodes inside the known Brunswick Street Oval tennis-works removal footprint.
  - This keeps the playable map closer to the 2026-2027 project state while preserving the raw local OSM snapshot for reference.
- Removed synthetic avenue sample trunks from the rendered tree/collider model.
  - Avenue structure is now carried by OSM/Yarra/CMP-derived profiles and canopy massing rather than extra hand-sampled trunk blockers.
- Updated tree-count assertions to exact source counts for this refreshed model:
  - 119 OSM tree points inside the boundary after removal-footprint filtering.
  - 19 Yarra significant trees.
  - 138 rendered trees and trunk colliders.

## Follow-Up Notes

- When OSM or council spatial data changes after construction, refresh the raw OSM JSON and update only the node-ID list/removal filter, not the rendering code.
- If a public tree-management plan with precise removed-tree node mapping becomes available, replace the current footprint-based suppression set with that explicit source.
