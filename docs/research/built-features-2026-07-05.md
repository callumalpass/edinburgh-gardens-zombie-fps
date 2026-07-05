# Built Features Research

Date: 2026-07-05

Purpose: make Edinburgh Gardens structures easier to recognize while keeping geometry sourceable and maintainable.

## Sources

- OpenStreetMap building way JSON, stored locally under `docs/research/raw/osm/2026-07-05/buildings/`.
  - Ways used: `242003562`, `403753784`, `543505638`, `543505639`, `543505640`, `543505702`, `1475006767` to `1475006773`.
  - These provide the current building footprints used by `OSM_BUILDING_FOOTPRINTS_GEO`.
- Edinburgh Gardens Conservation Management Plan 2004.
  - The CMP identifies key hard-landscaping and building elements including the grandstand, Freeman Street gatehouse, tennis club pavilion and courts, Fitzroy Bowling Club, Queen Victoria pedestal and rotunda.
  - Rotunda description records a raised circular base, eight Tuscan columns, copper-clad dome, lantern, stair, plaques, vents and louvred openings.
  - Tennis pavilion analysis records the early tennis-club association and recommends retention/conservation of the early twentieth-century pavilion fabric.
  - Bowling-club analysis records the long-running bowling-club use and recommends a more sympathetic boundary/interface treatment.
- Yarra Council Brunswick Street Oval revised design material, dated 2024-12-20.
  - Current project context: new sports pavilion, upgraded/expanded tennis precinct, relocated clubhouse, landscaping and heritage-grandstand improvements.
- Victorian Government release, dated 2026-05-28.
  - Confirms works are underway, including tennis-court upgrades/two new courts, clubhouse relocation/improvement, Kevin Murray Stand toilet/change-room/stair upgrades, lighting and landscape improvements, with completion expected late 2027.

## Implementation Decisions

- Added `MappedBuilding.detailProfile` and `MappedBuilding.source` so building rendering can stay data-driven.
- Added detail profiles for:
  - `tennis-pavilion`
  - `bowling-club`
  - `gatehouse`
  - `rotunda-pavilion`
  - `community-centre`
  - `amenities`
  - `bowling-shed`
- Rendered profile-specific details such as verandahs, doors, windows, sheds, labels, green-wall/hedge softening and gatehouse roof massing.
- Rebuilt the rotunda silhouette around the CMP description: raised circular base, lower storey, eight columns, entablature, copper dome, lantern, front stairs, piers, plaques and vents.
- Kept the 2026-2027 Brunswick Street Oval works as current context rather than fully rebuilding the future design. The in-game map still represents an explorable park state, not a construction-timeline simulator.

## Follow-Up

- Object placement/collision pass should align football posts, basketball hoops and solid tree obstacles to the real mapped sports and tree features.
- Vegetation pass should reuse the CMP notes about elm avenues, significant specimen trees and the Brunswick Street Oval tree replacement context.
