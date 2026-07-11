# Sportsman's War Memorial Blender Asset

Date: 2026-07-11

Purpose: replace the coarse procedural Sportsman's War Memorial with an editable, evidence-labelled Blender artifact; correct its 2026 position and orientation against the official aerial; preserve the game's painterly/anime treatment; and verify the real south approach, centre–east column bay and restored interpretation panels at full gameplay scale.

## Sources

- Heritage Council Victoria, *WW1 Sportsman's Memorial Arbour — Determination of the Heritage Council*, 21 April 2026: https://assets.heritagecouncil.vic.gov.au/assets/HCV-Determination_WW1-Sportsmans-Memorial-Arbour_21APR26.pdf
  - This is the most recent primary description found. It confirms six Tuscan-order columns on pedestals, the 1971 two-storey bowling-club building close to the north, the early-1980s substation abutting the west, the relocated path to the south, diminished processional passage, cracking, and the distinction between precast columns/capitals and overhead framing/pediments that may have been cast on site.
- City of Yarra, *Sportsman's Memorial*: https://www.yarracity.vic.gov.au/things-to-do/arts/gallery/public-art/sportsmans-memorial
  - Confirms the 1919 memorial, 2018 re-dedication after restoration, replica porcelain wreath in a new bronze fallen-names panel and the large reproductive team photograph.
- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.2.7 and Figures 62–65: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Controls the six columns/pedestals, textured frieze, moulded cornice, parallel rafters, east `IN MEMORIAM` field, rectangular raised swag panel, replacement urn finials, south dedication, west substation/wreath panel, northern team photograph, ornamental hedge context and photographed west-beam cracking.
- Australian War Memorial, Places of Pride record `241121`: https://placesofpride.awm.gov.au/memorials/241121
  - Confirms the memorial's identity and public record. Its published point `-37.7880136, 144.9805024` is not used as survey geometry because it visibly falls on the bowling-club roof in the official aerial.
- Victorian Government, Vicmap Basemap WMS `AERIAL_WM_256`: https://base.maps.vic.gov.au/service?service=WMS&request=GetCapabilities
  - The archived whole-park image `docs/research/raw/2026-07-10/vicmap-basemap-aerial-edinburgh-gardens.png` is approximately 0.4 m/pixel. Pixel registration against the exact OSM bowling-club wall and square substation places the visible arbour at approximately pixel `(360, 1221)`, or `-37.788058, 144.980790`.
- OpenStreetMap way `543505639` and adjacent mapped buildings: https://www.openstreetmap.org/way/543505639
  - Controls the bowling-club shell used to validate that the corrected arbour is immediately south of, and parallel to, the current club wall rather than inside its roof.
- Blender 4.5.10 LTS Linux x64: https://download.blender.org/release/Blender4.5/blender-4.5.10-linux-x64.tar.xz
  - Checksum-verified portable authoring/export runtime; tooling rather than condition evidence.

The Heritage Council PDF is retained locally under `docs/research/raw/gardens/2026-07-11/sportsmans-war-memorial/`. The official Vicmap aerial remains under the existing 2026-07-10 raw family.

## Findings

- The earlier AWM point and the aerial-fitted arbour centre differ by about 33.0 game units / 25.8 real metres. Projecting both over the official orthophoto resolves the conflict unambiguously: the AWM point is on the long club roof, while the memorial is legible immediately east of the square substation and south of the club. The AWM record is therefore identity evidence, not survey-grade placement.
- The club's nearest exact OSM wall segment has a map angle of `3.03555` radians, equivalent to an east-facing arbour axis of approximately `-0.106` radians. This matches the aerial and the CMP relationship views. The previous `0.18` map angle was removed.
- Figure 64 looks north with the club behind and the substation left/west; Figure 65 looks west with the club to the right/north. These views rule out cutting a speculative courtyard through the exact club footprint. Correcting the memorial point resolves the overlap without altering the building.
- The east upper element is a rectangular raised panel with paired pressed-cement swags and cornice, not the triangular pediment used by the old procedural proxy.
- The current memorial is not a bare six-column pergola. Its restored interpretation includes the south dedication, east inscription, bronze wreath/name panel on the adjacent west wall and a large team photograph on the northern wall face.
- The April 2026 determination says the original processional quality is diminished, not restored as an unobstructed through-route. Gameplay should permit entry from the relocated south approach and standing under the arbour, while the north club and west substation remain closed.

## Implementation Translation

- Added reproducible generator `scripts/blender/build_sportsmans_memorial.py` and generated:
  - editable `assets/blender/sportsmans-war-memorial/edinburgh-gardens-sportsmans-war-memorial.blend`;
  - optimized `public/models/edinburgh-gardens/edinburgh-gardens-sportsmans-war-memorial.glb`;
  - machine-readable `assets/blender/sportsmans-war-memorial/edinburgh-gardens-sportsmans-war-memorial.asset.json`.
- The final editable source contains 282 objects, 281 mesh objects, 14 materials and 24,930 triangles. Export joins evidence-labelled pieces into one multi-material Draco-compressed GLB of approximately 247 KB.
- The model retains the existing photo-fitted 6.40 × 3.10 game-unit frame pending a measured plan. It adds detailed stepped pedestals, tapered Tuscan shafts/capitals, three-stage entablature, frieze relief, cornices, nine rafters, open trellis, rectangular swag panel, paired urns, readable inscriptions, attached restoration lights, team-photo interpretation, wreath/name panel and limited photographed wall returns.
- The team photograph is a semantic geometric treatment, not a copied photograph or portrait reconstruction. The painterly/anime material pass remains unchanged at runtime.
- Runtime placement is now the Vicmap fit `-37.788058, 144.980790`, angle `-0.106`. The AWM point is retained in source prose with its rejected survey use made explicit.
- Six pedestal obstacles replace the former solid memorial rectangle. The game's movement radius is `2.2` game units—wider than the real human-scale inter-column opening—so the documented centre–east bay uses the same narrowly scoped access-gap/auto-corridor pattern already used for the Hannah memorial gate. The west pair, west wall return and club become solid again outside the short arbour footprint.
- Added a separately readable east-inscription amenity and linked the GLB metadata to the six column obstacles and interaction ID.

## Uncertainty

- The Vicmap WMS does not expose its acquisition date and is approximately 0.4 m/pixel. The corrected coordinate is an aerial registration with roughly sub-metre-to-metre uncertainty, not a cadastral survey.
- No public measured plan fixes the exact 6.40 × 3.10 frame, column centres, moulding profiles, wall-return depths, light offsets or letter spacing. Those remain proportional readings of the CMP/current photographs.
- The 2026 Heritage Council determination confirms current contextual relationships and fabric but does not include a measured site plan or elevation drawing.
- The surrounding ornamental/rosemary hedge is visible in the CMP but has no current surveyed outline. It is omitted instead of baking guessed collision blocks into the public approach.
- The short west and north wall faces are limited to the portions needed to carry the documented restoration panels. They are context elements, not a claim to reproduce the full substation or club wall.
- The game's broad movement proxy requires a local collision accommodation to represent a genuinely walkable human-scale bay. Visible geometry and obstacle centres remain evidence-fitted; the accommodation is explicitly gameplay-only.

## Validation

- Eight iterative Blender review cycles were performed. The final cycle generated eight 1120 × 760 views covering the south/current elevation, east inscription, wreath panel, team photograph, rafter/urn aerial, player-height passage, lettering close-up and restoration-panel context under `tmp/blender-audit/sportsmans-war-memorial-v8-final/`.
- The eighth cycle also reviewed the memorial together with the independently loaded Bowling Club shell in the live first-person renderer. That combined test exposed depth occlusion of the applied northern team-photo interpretation; the panel was brought forward within the photographed wall-fit uncertainty, without moving the memorial, club footprint or columns, and was then re-rendered from passage and interaction viewpoints.
- Render review corrected the old triangular panel, camera-facing panel directions and a decimated `O` in `IN MEMORIAM`. Raising only the east inscription's decimation retention restored a clean word while keeping the final source at 24,930 triangles.
- The runtime object-preview audit rendered front, right, rear and left frames with zero automatic signal issues under `tmp/object-visual-audit/2026-07-11-sportsmans-v8/`; all four were manually inspected.
- Unit navigation samples the full south route at `PLAYER_RADIUS`, confirms all six pedestal blockers, verifies the four bay-edge access gaps plus short club-wall bypass, proves the old AWM point lies inside the club while the aerial-fit point does not, and checks that the east inscription remains outside unrelated blockers.
- The dedicated Playwright pass loads both memorial and bowling-club GLBs, applies first-person forward input to the pedestal plane, renders from inside the column bay, approaches and reads the east inscription, and captures the west/substation context. Because SwiftShader advances few movement frames per timed input, exhaustive full-route traversal is asserted by the collision sampling while the real runtime supplies the visual and interaction checks.
- `npm run build`, the complete unit suite, `npm run research:ledger` and `npm run research:check` are run after documentation/manifest integration.
