# North Public Toilets Blender Asset

Date: 2026-07-10

Purpose: replace the generic north-toilet prism with a reproducible, editable asset for the completed 2026 public facility; preserve the exact mapped footprint and painterly/anime treatment; distinguish as-built evidence from the superseded proposal finish; and verify both external door banks at player height.

## Sources

- OpenStreetMap way `307404819`: https://www.openstreetmap.org/way/307404819
  - Controls the current roof/building envelope. The fitted footprint is 10.99 × 7.48 m, or 14.063 × 9.571 game units under the established 1.28 horizontal world scale. OSM does not resolve the doors, ramp, basins, screen, posts or roof-sheet rhythm.
- City of Yarra, *New public toilets*: https://yoursayyarra.com.au/newtoilets
  - The dimensioned 1:50 north-toilet plan records a 10.602 m cross-building dimension, 8.110 m building depth and 9.709 m overall works depth. It identifies the existing and proposed halves, two external banks of female, DDA, ambulant, gender-neutral and urinal facilities, six new unisex stalls, central service access, exterior hand basin, existing/new paths and the retained adjacent tree.
  - The page's current context photograph is treated as as-built evidence. It shows charcoal corrugated walls, grey external doors with blue signs, two stainless basins and dispensers, perforated upper screens, exposed charcoal steel posts/beams, an accessible ramp and a broad skillion of alternating opaque corrugated and translucent sheets.
  - The separately published red-clad image is explicitly a proposal render. Its red finish is not translated into the 2026 asset because the council's as-built photograph directly contradicts it.
- City of Yarra, *Annual Report 2021–22*: https://www.yarracity.vic.gov.au/sites/default/files/2024-04/annual_report_2021_to_2022_accessible_version.pdf
  - Confirms the Edinburgh Gardens public-toilet upgrades were completed and open, supporting use of the north-block plan as completed works evidence while not asserting that every proposal detail was built unchanged.
- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.10.4 and Figure 146: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Documents the earlier 2014 corrugated-sheet facility, painted enclosure, steel-post frame and mixed sheet-metal/clear-plastic skillion. The later council as-built photograph supersedes its former painted-wall condition where the two conflict.
- Vicmap Basemap WMS: https://base.maps.vic.gov.au/service?service=WMS&request=GetCapabilities
  - Orthophoto cross-check confirms the OSM envelope's north-east/south-west long axis, the broad striped roof and the south-east path approach. It is alignment evidence, not July 2026 vegetation or construction-state evidence.
- Blender 4.5.10 LTS Linux x64: https://download.blender.org/release/Blender4.5/blender-4.5.10-linux-x64.tar.xz
  - Checksum-verified portable authoring/export runtime used for the editable source and Draco-compressed GLB; it is tooling, not condition evidence.

## Findings

- The former renderer's three yellow/purple/blue wall panels were not the current building. The strongest current official image shows a restrained charcoal/grey utility building; retaining the coloured proposal/CMP-era treatment would misstate the 2026 condition.
- The facility is organised as externally accessed cubicles rather than a single front door. The plan supports seven western/female/DDA/gender-neutral doors and six opposite ambulant/gender-neutral/urinal-side doors. The current photograph clearly shows a repeated grey-door bank with small blue signs.
- The short public elevation has two stainless wall basins in the current photograph even though the plan uses a singular exterior-hand-basin callout. The photograph controls the visible as-built count.
- Perforated upper infill and the exposed steel roof frame make the building visually open above door height. A solid full-height prism reads incorrectly as a closed shed.
- The wide striped skillion is the dominant aerial feature. Opaque and translucent strips, projecting fascias/gutters and the two-stage old/new roof relationship need to remain visible from above and below.
- The public facility is closed-cell rather than free-roam. Good navigation means clear exterior circulation, readable doors, a usable accessible approach and interaction points outside the exact solid OSM shell; it does not justify inventing an undocumented interior.

## Implementation Translation

- Added reproducible generator `scripts/blender/build_north_toilets.py` and generated:
  - editable `assets/blender/north-toilets/edinburgh-gardens-north-toilets.blend`;
  - optimized runtime `public/models/edinburgh-gardens/edinburgh-gardens-north-toilets.glb`;
  - machine-readable `assets/blender/north-toilets/edinburgh-gardens-north-toilets.asset.json`.
- The editable source contains 533 objects, 532 mesh objects, 13 materials and 16,984 triangles. Evidence-labelled pieces remain separate in Blender; export joins them into one multi-material, Draco-compressed GLB of approximately 504 KB.
- The model retains the exact 14.063 × 9.571 game-unit OSM envelope and maps Blender `+Y` / glTF `-Z` to the south-east basin/path elevation. Runtime loading reuses the same fitted centre, angle and extents as collision, then reapplies the existing painterly/anime material tuning.
- Authored elements include the charcoal corrugated shell and ribs; 13 plan-derived grey external stall doors with frames, handles and blue glyph signs; an accessible return door; paired stainless basins/taps/dispensers; central rear service door; perforated upper screen bays; exposed posts/cross-beams; alternating opaque/translucent roof strips; fascias, gutter/downpipes, under-eave lights, notice plate, concrete aprons and a paired-rail accessible ramp.
- The procedural fallback was corrected from coloured mural panels to the current charcoal shell, grey door bank, blue signs and paired basins while retaining its separately testable skillion/transparent-roof materials.
- Added two evidence-linked toilet search points outside the collision shell, one for each plan-derived stall bank. The HUD now calls these searches toilets rather than a generic shelter interaction.
- The mapped building collision remains a single exact solid polygon. Ramp, roof posts and GLB detail are visual, so they cannot create invisible blockers; the external interaction positions retain more than a player radius of clearance.

## Uncertainty

- No public current measured elevation or as-built CAD set fixes every height, post, perforation, corrugation, gutter, light, roof strip, frame or hardware dimension.
- The council plan and current OSM envelope have slightly different proportions. Plan-derived functional bays are fitted proportionally inside the current OSM shell instead of claiming a survey-grade match to both.
- The plan proves functional groups and door banks, while the single as-built photograph resolves only one oblique. Hidden-elevation door hardware and screen subdivisions are proportional translations of the plan and repeated photographed language.
- The official photograph controls the two visible basins; the plan's singular callout may describe a basin station rather than a literal fixture count.
- The accessible-sign glyphs are compact painterly geometry, not reproductions of regulatory sign artwork. No public toilet interior is modelled.
- The Vicmap aerial acquisition date is not exposed and it is used only for persistent roof/path registration, not July 2026 tree condition.

## Validation

- Blender generated eight 1120 × 760 inspections under `tmp/blender-audit/north-toilets-v1/`: current-photo-like public oblique, both door banks, rear service elevation, roof/aerial, basin close-up, ramp close-up and door-hardware close-up. All eight were manually inspected against the plan and as-built photograph.
- The runtime object-preview audit rendered front/right/rear/left views under `tmp/object-visual-audit/2026-07-11-north-toilets-blender-v1/` with signal scores `99/23`, `96/19`, `100/23` and `106/20` for non-blank/variation and zero automatic issues; all four were manually inspected.
- `tests/northToiletsAssetNavigation.spec.ts` loads the GLB in the full park, walks along the south-west external bank at full-capsule clearance, activates its search, then faces and identifies the opposite bank. Three player-height screenshots were manually inspected.
- `npx vitest run tests/blenderAssets.test.ts tests/buildingRenderGeometry.test.ts tests/geo.test.ts --reporter=dot` passes 59 focused asset/geometry/source tests.
- `npx playwright test tests/northToiletsAssetNavigation.spec.ts --project=desktop` passes the dedicated live traversal/interaction test.
- `npm run build` passes with only the existing Vite chunk-size advisory.
- `npm run research:check` validates this note, manifest registration and the available ignored source images.
