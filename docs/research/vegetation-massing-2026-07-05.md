# Vegetation Massing Research

Created: 2026-07-05

Scope: canopy volume, avenue/specimen grouping, under-tree ground wear and tree-rendering performance.

## Sources

- City of Yarra significant trees dataset metadata: https://data.gov.au/data/dataset/yarra-significant-trees
  - Used for the tree-scale principle that height and DBH should influence visible massing for significant trees.
- Yarra significant-tree guidance: https://www.yarracity.vic.gov.au/residents/plants-and-trees/significant-trees
  - Used for council context that significant trees are managed and assessed as individual mature specimens.
- National Trust Holm Oak record: https://www.trusttrees.org.au/tree/VIC/Fitzroy_North/Edinburgh_Gardens_Brunswick_Street
  - Used to keep Holm Oaks as broad, dense specimen trees rather than generic park trees.
- Edinburgh Gardens CMP via the 3068 archive: https://the3068group.org/edinburgh-gardens-studies/
  - Used for elm avenue, English Oak Avenue and mature formal-planting context.
- OpenStreetMap bounded park-feature query:
  - Local raw JSON: `docs/research/raw/osm/2026-07-05/further-realism/edinburgh-gardens-park-features-overpass.json`
  - Used for current mapped tree and path context.

## Implementation Decisions

- Extended `MappedTree` with massing fields:
  - `canopyRadius`
  - `canopyDensity`
  - `canopyGroup`: `avenue`, `specimen` or `mapped`
- Derivation is deterministic.
  - Significant Yarra trees use height/DBH where available.
  - OSM elm points near researched avenues are grouped as avenue trees.
  - Generic OSM trees still receive conservative canopy mass so the whole park reads as planted, not dotted with identical props.
- Reworked under-canopy ground wear.
  - Leaf-litter and worn-grass patches are now rendered as two instanced meshes instead of one mesh per tree.
  - This makes canopy massing visible at ground level while reducing static object count.
- Canopy rendering now reads `canopyRadius` and `canopyDensity`.
  - Oaks and Holm Oaks render broader/denser.
  - Gums remain taller and sparser.
  - Elm avenues become more continuous without requiring every tree to be manually placed as a unique model.

## 2026-07-11 mature-tree scale refinement

- Visual review against the 1.72-metre player showed that a single global tree multiplier did not preserve the hierarchy already present in the source data.
- Yarra significant-tree height now influences the rendered crown-base height directly, capped at a 24% uplift over the procedural profile result so measured specimens read as mature landmarks without closing combat sightlines.
- Specimen canopy width increases 12% and canopy height 6%; heritage avenue height and width increase 10% with a 4% canopy-height increase.
- Generic mapped trees remain unchanged. The Brunswick Street Oval semi-mature replacement-tree treatment explicitly bypasses these uplifts.
- Full-detail trees, instanced batches, far LOD canopies, branches, under-canopy detection and ground-wear footprints use the same tiered massing factors.

## Follow-Up Notes

- A future spatial tree export with more precise species-level crown measurements should replace remaining DBH/profile-derived estimates; Vicmap canopy radius is already used where supplied.
- If tree density increases again, the next performance pass should batch trunks/branches by profile or use impostors for far canopies.
