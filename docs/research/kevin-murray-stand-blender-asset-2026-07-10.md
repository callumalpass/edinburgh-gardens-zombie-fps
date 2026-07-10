# Kevin Murray Stand Blender Asset

Date: 2026-07-10

Purpose: replace the Kevin Murray Stand's coarse procedural envelope with an editable, evidence-based 2026 asset; preserve the exact mapped location and painterly/anime treatment; distinguish retained heritage fabric from the 2026–27 works programme; and verify the oval-facing stair, covered gallery and existing external changeroom interaction in first person.

## Sources

- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.2.2 and Figures 35–40: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Printed pages 57–59 / PDF viewer pages 76–78 provide the controlling current-condition views of the oval elevation, covered seating, north-east/rear elevation, west elevation and internal context. The asset does not reproduce Figure 40's interior because no current measured public plan supports free-roam interior geometry.
- OpenStreetMap way `403753786`: https://www.openstreetmap.org/way/403753786
  - Controls the audited horizontal footprint, fitted centre/orientation, 47.80 m long envelope and 13.01 m mapped depth.
- Heritage Victoria, Victorian Heritage Database report for the Fitzroy Football Club Grandstand, H0751: https://vhd-dr.heritage.vic.gov.au/places/447/download-report
  - Confirms the surviving 1888 Nathaniel Billing grandstand, later refurbishment, continued club use and registered heritage context.
- City of Yarra, *Brunswick Street Oval Redevelopment*: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Dates grandstand works only to the broad 2026–27 programme and identifies refreshed umpire/changeroom areas, replacement external stairs and secure gates. It does not establish that those replacement elements were complete on 10 July 2026.
- City of Yarra, *Brunswick Street Oval grandstand*: https://yoursayyarra.com.au/brunswickstoval/grandstand
  - Establishes that heritage advice requires minimal exterior change, identifies the proposed stairs/gate/forecourt works and says the exterior repaint is to match heritage colours. Proposal imagery is not treated as an as-built July 2026 survey.
- City of Yarra, revised Brunswick Street Oval design consultation: https://yoursayyarra.com.au/brunswickstoval
  - The December 2024 revision retains the adjoining Community Room, reduces the stand scope to minor umpire/changeroom upgrades, and still describes stair replacement and lockable gates as works rather than established fabric.
- Fitzroy Football Club, *Kevin's come home*: https://www.fitzroyfc.com.au/latest-news/kevin-s-come-home
  - Records that the custom Kevin Murray Stand sign is erected for Fitzroy home games. It is therefore not baked into the ordinary-day physical baseline.
- Blender 4.5.10 LTS Linux x64: https://download.blender.org/release/Blender4.5/blender-4.5.10-linux-x64.tar.xz
  - The checksum-verified portable authoring/export runtime used for the other major-building assets. It is tooling, not physical-condition evidence.

## Findings

- The 1888 structure is a long Victorian grandstand: stepped timber-framed seating over a painted-brick ground storey containing club and changeroom spaces.
- The oval elevation has two established external stair flights, a continuous open gallery supported on red cast-iron columns with Corinthian capitals, cast-iron lace balustrades, cream timber benches and a low central pediment.
- The circular element in the central pediment is a louvred timber vent replacing the former clock. Treating it as a working clock is physically wrong.
- The roof is corrugated galvanised metal in a jerkinhead form with centre/end flagpoles, front and side awnings and timber brackets. Existing solar panels occupy the north/rear roof slope.
- The north/rear elevation is not a blank box. Its upper level has horizontal weatherboards, a vertical board band, sliding panels, red studs, louvred openings and a dense ground-storey service-door/window rhythm.
- The west elevation includes a later skillion verandah on timber posts. Side boarding, V-jointed panels and cast-lace gallery fabric remain visible.
- The Community Hall is an adjoining separate volume, visible east of the stand in CMP Figures 36 and 38. It is not part of the heritage stand's OSM footprint and must not be absorbed into this asset.
- The current council programme does not fix the exact 10 July 2026 temporary fencing, partial works or replacement-stair installation state. The defensible physical baseline is the retained heritage exterior and the established stair/gallery arrangement, with planned secure gates and replacement details excluded until an as-built dated source exists.

## Implementation Translation

- Added reproducible generator `scripts/blender/build_kevin_murray_stand.py` and generated:
  - editable `assets/blender/kevin-murray-stand/edinburgh-gardens-kevin-murray-stand.blend`;
  - optimized runtime `public/models/edinburgh-gardens/edinburgh-gardens-kevin-murray-stand.glb`;
  - machine-readable `assets/blender/kevin-murray-stand/edinburgh-gardens-kevin-murray-stand.asset.json`.
- The final source contains 588 objects, 587 mesh objects, 11 materials and 21,791 triangles, within the repository's 25,000-triangle major-building ceiling. The editable `.blend` retains evidence-labelled parts; the runtime copy is joined into one 11-material mesh and Draco-compressed to approximately 640 KB.
- The OSM frame controls the runtime centre, rotation and horizontal scale. Blender `-Y` / glTF `+Z` is the oval-facing elevation, matching the level's mapped oval side.
- The model includes painted ground-storey bays, doors and roller shutters; eight terraced floor/bench rows; steel back supports; eleven cast columns with simplified Corinthian capitals; ten cast-lace panels; two oval-facing stairs and handrails; the central pediment and five-blade round louver; front awning/fascia/brackets; jerkinhead roof and three flagpoles; existing rear-slope solar panels; the weatherboard/sliding-panel rear elevation; side V-jointed panels; and the west skillion verandah.
- Corrugated roof ridges were initially authored as raised cylinders. The game-engine audit showed that they became false spikes at distance, so they were removed. The metal-sheet material, exact roof form, fascia, solar array and painterly shading carry the corrugated-roof reading without a misleading silhouette.
- Runtime loading reapplies the existing painterly/anime material tuning, keeps the previous procedural assembly as a load-failure fallback, and corrects the fallback's former clock disc to a round louver.
- The established `grandstand-seats` stair interaction, fitted blocker gap, raised footprint and `0.82` shelter zone remain authoritative for navigation. Existing changeroom and umpire external search points remain; no unsupported interior or future kiosk/public-toilet interaction is added.
- The stale flare-gun label referring to a future kiosk hatch was corrected to the existing east grandstand stair.

## Uncertainty

- No public measured architectural survey fixes every column, stair, bay, bench, vent, weatherboard, solar-panel or verandah-member dimension. OSM controls the horizontal envelope; CMP photographs/text and heritage descriptions control visible proportions and material hierarchy.
- The CMP current-condition photographs predate the July 2026 works start. Official sources confirm work is underway but do not publish a dated as-built stand elevation for 10 July. Temporary construction fabric and any partially installed replacement component remain unresolved rather than invented.
- Rear ground-storey service openings are proportional translations because parked vehicles, shadows and the Community Hall obscure parts of Figure 38.
- The custom Kevin Murray sign is event-dependent. Omitting it from the ordinary-day asset does not assert that it could never appear during a home game.
- The Community Hall remains a separate building responsibility. This asset improves the registered grandstand only and does not claim to finish the adjacent hall/tennis-side structures.

## Validation

- Blender generated six 1120 × 760 inspections covering the oval elevation, opposite oblique, north/rear elevation, west verandah, seating gallery and east stair under `tmp/blender-audit/kevin-murray-stand-final-v2/`.
- Two render-review cycles corrected the protruding roof-rib silhouette and underlit seating/rear inspection. The final Blender views show the pediment louver, stair flights, open cast gallery, cream benches, full rear service/weatherboard treatment, west verandah and solar roof without the spike artifact.
- The game object-preview harness rendered front, right, rear and left views under `tmp/object-visual-audit/2026-07-10-kevin-murray-stand-blender-v2/`; all four frames exceed the audit's non-blank/variation thresholds.
- A normal-game Playwright pass loads the GLB, views the east stair at eye height, climbs to the mapped gallery landing, verifies `2.55` m elevation and `0.82` shelter protection, moves laterally along the covered front walkway, exits, displays the existing changeroom prompt and starts its search. The retained screenshots expose both successful circulation and the close-range authored facade.
- `npx vitest run tests/blenderAssets.test.ts tests/buildingRenderGeometry.test.ts tests/geo.test.ts` passes the focused asset/geometry suite.
- `npm run test:e2e:quick -- tests/grandstandAssetNavigation.spec.ts` passes the dedicated loaded-asset navigation/interaction test.
- `npm run test:run` passes all 202 unit/geometry tests; `npm run test:e2e:quick` passes all 12 desktop/mobile browser tests after long-input route samples were calibrated for software-WebGL frame cadence without weakening their distance or lateral-drift assertions.
- `npm run build` passes with only the existing Vite chunk-size advisory. `npm run research:check` validates 43 committed research documents and 72 registered sources after the manifest and ledger refresh.
