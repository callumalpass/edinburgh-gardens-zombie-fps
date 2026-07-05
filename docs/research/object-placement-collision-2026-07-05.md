# Object Placement And Collision Research

Created: 2026-07-05

Scope: football posts, basketball hoops and solid tree trunks. This pass keeps object placement driven by one level-data model so visual geometry and collision blockers do not drift apart.

## Sources

- OpenStreetMap park and feature geometry:
  - Edinburgh Gardens boundary way `13815924`: https://www.openstreetmap.org/way/13815924
  - W. T. Peterson Oval geometry: derived from the existing OSM oval polygon in `src/game/levelData.ts`.
  - Basketball half-court geometry: derived from the existing OSM basketball court polygon in `src/game/levelData.ts`.
  - Tree points: existing `OSM_TREE_GEO` `natural=tree` points, filtered to the park boundary.
- City of Yarra significant trees dataset metadata: https://data.gov.au/data/dataset/yarra-significant-trees
  - Used to keep known significant trees distinct from generic OSM tree points.
  - DBH values are used to scale trunk collider radii, clamped to a playable range.
- Yarra significant-tree guidance: https://www.yarracity.vic.gov.au/residents/plants-and-trees/significant-trees
  - Used as council context for significant-tree measurement and management.
- Edinburgh Gardens heritage/CMP context:
  - 3068 Group Edinburgh Gardens studies: https://the3068group.org/edinburgh-gardens-studies/
  - Used for avenue/row tree context, especially formal elm avenues and rows.
- Australian-rules goal and behind-post dimensions:
  - CITS WA sports dimensions guide: https://www.cits.wa.gov.au/sport-and-recreation/sports-dimensions-guide/football-%28australian-rules%29
  - AFL line-marking PDF reference: https://play.afl/sites/default/files/2024-10/Measure%20Out%20and%20Line%20Mark%20of%20Australian%20Rules%20Oval_v1.pdf
  - Implemented dimensions: goal posts 6.4 m apart, behind posts 6.4 m outside each goal post, goal posts 6 m high, behind posts 3 m high.
- Basketball ring and backboard dimensions:
  - FIBA Official Basketball Rules and Equipment PDF: https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-official-basketball-rules-and-basketball-equipment.pdf
  - Dimensions.com basketball hoop reference: https://www.dimensions.com/element/basketball-hoop
  - Implemented dimensions: rim height 3.05 m and backboard width 1.83 m.

## Implementation Decisions

- `src/game/sportsFixtures.ts` stores sports-fixture constants and the `footballPostLocalOffsets()` helper.
  - Football visual posts and football collision posts use the same offsets.
  - Basketball hoop height and backboard width use named constants instead of inline numbers.
- `LevelData.sportsFixtures` is the source of truth for football goals and basketball hoops.
  - W. T. Peterson Oval football posts are centred on the mapped oval and inset from the north/south ends so they read as field equipment rather than boundary fencing.
  - Basketball hoops are placed on the court's mapped long axis using the fitted court footprint.
- `LevelData.treeColliders` is the source of truth for solid tree trunks.
  - Significant-tree trunks scale from DBH.
  - OSM tree points and sampled avenue rows receive compact trunk radii.
  - Colliders are deduplicated by minimum spacing so avenues do not create dense overlapping blockers.
- Collision uses small circular blockers for trunks and posts.
  - Canopies are intentionally non-blocking so the player can move beneath trees.
  - The gameplay blocker is the trunk/post footprint, not the full visual canopy or sports structure.
  - These small blockers do not occlude minimap or zombie sight lines; buildings and larger structures remain the sight blockers.
- The circular collision resolver now handles exact-centre overlap by pushing along a deterministic direction.
  - This prevents a player or zombie starting exactly inside a tree/post collider from remaining stuck.

## Follow-Up Notes

- A future spatial hash would be useful if tree density increases further. The current obstacle count is acceptable for this level, but broad-phase culling would reduce per-frame collision checks as park-life details are added.
- If higher-confidence tree stem coordinates become available from a City of Yarra spatial export, they should replace the current mixed OSM/significant-tree/avenue-sample model.
