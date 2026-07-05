# Vegetation Realism Research

Created: 2026-07-05

Scope: tree species/form, heritage avenue cues, trunk collision alignment and tree-rendering performance.

## Sources

- Edinburgh Gardens Conservation Management Plan 2004: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
  - Used for the primary-significance vegetation cues: elm avenues and rows, English Oak Avenue opposite Rowe Street, Holm Oak specimen and remnant Dutch Elm circles.
- 3068 Group Edinburgh Gardens studies archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used as a navigable public index to the CMP and for cross-checking the heritage emphasis on elm avenues and rows.
- City of Yarra significant trees dataset metadata: https://data.gov.au/data/dataset/yarra-significant-trees
  - Used for significant-tree names, genus/species, height and DBH values represented in `YARRA_SIGNIFICANT_TREE_GEO`.
- Yarra significant-tree guidance: https://www.yarracity.vic.gov.au/residents/plants-and-trees/significant-trees
  - Used for council context that significant-tree measurement and management matter at tree scale, not only as generic vegetation.
- National Trust Holm Oak record: https://www.trusttrees.org.au/tree/VIC/Fitzroy_North/Edinburgh_Gardens_Brunswick_Street
  - Used to confirm the Holm Oak as a named specimen tree in Edinburgh Gardens.
- OpenStreetMap tree points:
  - Existing `OSM_TREE_GEO` points represent `natural=tree` map data filtered to the OSM park boundary.

## Implementation Decisions

- `LevelData.trees` is now the source of truth for rendered trees.
  - Significant Yarra trees keep their real common name, genus-derived profile, height and DBH.
  - OSM tree points receive a profile inferred from proximity to researched heritage lines.
  - CMP/OSM-derived avenue samples become explicit elm-profile trees.
- `LevelData.treeColliders` is derived from `LevelData.trees`.
  - Visual tree positions and solid trunk blockers now share one placement model.
  - Significant-tree DBH scales trunk collision; non-significant trees use profile-based DBH fallbacks.
- Tree profiles are intentionally broad:
  - `elm`: taller avenue form, used for mapped points near formal paths/rail-trail/crescent paths and avenue samples.
  - `oak`: wider, lower crown, used for significant oaks and mapped points close to the English Oak Avenue line.
  - `gum`: taller trunk and sparser upright crown, used for significant eucalyptus trees and a small deterministic share of generic OSM points.
  - `generic`: mixed park trees where map data has no species.
- Rendering now reuses tree geometry and cached material variants.
  - Trunks, roots, branches, canopy lobes and pale gum-bark patches use shared base geometries with per-tree transforms.
  - Tree materials are cached by profile/variant instead of creating unique trunk and leaf materials for every tree.
  - This keeps the richer tree model affordable while retaining visible variation.

## Follow-Up Notes

- The current OSM tree points do not include species tags. If a City of Yarra spatial tree export with species-level coordinates becomes available, it should replace profile inference for generic OSM trees.
- The CMP identifies Dutch Elm circles; they are represented indirectly by OSM tree points and elm-profile inference for now. A later pass could add explicit circle metadata if precise centre/radius data is sourced.
