# Emely Baker Centre Blender Asset

Date: 2026-07-10

Purpose: replace the Emely Baker Centre's coarse procedural shell with an editable, evidence-based 2026 asset; preserve the exact mapped T-shaped plan and painterly/anime treatment; make the gated play yard and shade shelter easy to navigate; and keep the community-room, kitchenette and exterior-service interactions attached to visible current building fabric.

## Sources

- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.10.2 and Figure 144: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Printed pages 147–148 / PDF viewer pages 166–167 describe and photograph the 1972 single-storey tan-brick building, aluminium-framed windows, metal tray-deck skillion roof, tile-coped brick play-yard walls, hard paving, sandpit, sunshades, exterior service cabinet and surrounding native trees.
- OpenStreetMap way `543505702`: https://www.openstreetmap.org/way/543505702
  - Controls the audited T-shaped horizontal footprint, fitted centre and orientation. The geographic envelope is approximately 22.69 × 15.65 m; the runtime frame is 29.05 × 20.04 game-world units after the project's established `WORLD_SCALE = 1.28` transformation.
- City of Yarra, *Emely Baker Centre*: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/emely-baker-centre
  - Confirms current access-friendly community use, a gated outdoor area, shade sail, 30-person capacity, 11 × 7 m room, parquetry, kitchenette, refrigerator, microwave and daily 7am–9pm availability.
- City of Yarra, *Emely Baker Centre Venue Manual* (current linked manual, PDF path dated November 2024): https://www.yarracity.vic.gov.au/sites/default/files/2024-11/Emely%20Baker%20Venue%20Manual.pdf
  - Pages 2–5 identify the swipe-card main entrance, glass play-area doors, three external doors, accessible use and shared foyer/toilets. Pages 9–10 photograph the current exterior name sign, long aluminium-framed play-yard elevation, single and paired/sliding glazed doors, dark tensile shade sail, pale support posts, western vertical-bar gate, outdoor surfacing and kitchenette. Page 11 supplies the current low-resolution T-plan layout.
- Blender 4.5.10 LTS Linux x64: https://download.blender.org/release/Blender4.5/blender-4.5.10-linux-x64.tar.xz
  - The checksum-verified portable authoring/export runtime already used by the other major-building assets. It is tooling, not physical-condition evidence.

## Findings

- The mapped polygon and venue-manual plan describe the same building logic: a long rear room/service wing and a narrower community-hall volume projecting toward the enclosed yard. A rectangular bounding-box building is materially wrong.
- The yard elevation is predominantly aluminium-framed glass beneath a shallow sloping fascia. The current photographs resolve high transoms, a single glazed external door, a wider paired/sliding opening, pale slender canopy posts and the `EMELY BAKER CENTRE` fascia lettering.
- The roof is a shallow metal tray-deck skillion, not a gable or conventional flat slab. Its T-plan follows the building outline, with a higher rear edge and a small set of low roof vents.
- Figure 144 establishes warm tan brick, the high outer wall, tile coping, the side/end service cabinet and the relationship between wall and facade. The current manual shows the accessible yard route and resolves the western side gate more clearly than the CMP view.
- The shade element is a dark triangular tensile sail over the left-hand part of the yard, supported by a prominent pale outer post and building-side anchors. The earlier broad pale rectangular fallback was inaccurate.
- Current photographs show hard concrete at the doors and a tan play surface. The CMP says a sandpit exists, but no current public image or measured plan fixes its boundary, so a precise sandpit is not invented.
- The venue manual documents real rooms and equipment, but it is not a measured current architectural survey. It supports external search targets and door locations, not a claim of centimetre-accurate free-roam interior geometry.
- The photographed outdoor wheelie bins and loose furniture are operational/movable items. They are not baked into the fixed building asset as permanently positioned park objects.

## Implementation Translation

- Added reproducible generator `scripts/blender/build_emely_baker_centre.py` and generated:
  - editable `assets/blender/emely-baker-centre/edinburgh-gardens-emely-baker-centre.blend`;
  - optimized runtime `public/models/edinburgh-gardens/edinburgh-gardens-emely-baker-centre.glb`;
  - machine-readable `assets/blender/emely-baker-centre/edinburgh-gardens-emely-baker-centre.asset.json`.
- The final editable source contains 180 objects, 179 mesh objects, 23 materials and 14,625 triangles. Evidence-labelled source parts remain separate in the `.blend`; the runtime copy is joined into one multi-material Draco-compressed mesh of approximately 64 KB.
- The exact eight-edge OSM T-plan is retained as the foundation and roof outline. The two overlapping wall masses reproduce the same long rear wing/projecting-hall silhouette without expanding to the fitted bounding rectangle.
- Blender `-Y` / glTF `+Z` is the play-yard elevation. Runtime loading fits the asset to the same frontage-aware centre, angle and OSM extents used by the collision and interaction data, then reapplies the project's existing painterly/anime material tuning.
- The asset includes the warm tan-brick rear/end elevations, brick-joint depth cues, exact-plan tray-deck skillion and standing seams, rear aluminium windows, roof vents, gutters/downpipes, side service cabinet, glazed yard facade and transoms, three current external door leaves, fascia sign, accessible apron, tan yard surface, high tile-coped outer/return walls, dark triangular sail and support, and the open western vertical-bar gate.
- The former invented centre gate was removed. The collision walls now match the continuous photographed outer wall and split only at the 1.72-game-unit western side opening; the open leaf is a visible non-blocking element within that opening.
- The shade shelter is reduced to a conservative box around the photographed left-hand triangular sail rather than treating the whole yard as covered. Shelter protection remains `0.56`.
- Community-room and kitchenette search points align with the photographed external doors and sit 1.85 game units away for a readable first-person view. The exterior service-cabinet search point moved from the generic front elevation to the photographed end wall.
- The previous procedural structure remains as a load-failure fallback. Its facade, side-gate wall geometry and dark triangular sail were corrected to preserve the same architectural/navigation contract if the GLB cannot load.

## Uncertainty

- OSM fixes the horizontal outline but no public measured elevation survey fixes every mullion, roof seam, post, gate bar, brick joint, vent, cabinet or eave dimension. The implementation uses photograph-controlled proportions and records this distinction in the asset metadata.
- The venue-manual floor plan is low resolution. It confirms the T-plan and exterior openings but does not justify a fully measured interior or exact rear-room window offsets.
- The current photographs resolve a western vertical-bar gate and an accessible yard, but not every hinge/latch dimension or the gate's routine open/closed state. The game holds the leaf open to make the documented accessible route consistently navigable.
- The exact current sandpit edge, softfall subdivision and shade-sail anchor hardware are unresolved. Only the source-supported surface hierarchy and sail footprint are represented.
- Tree positions remain controlled by the park-wide tree ledger and are not duplicated inside this building asset. The large trees visible in the CMP/manual photographs must continue to be audited in that separate object family.
- The interaction model deliberately stops at the external doors. It does not imply that the real venue lacks an interior; it avoids asserting unsupported measured internal geometry.

## Validation

- Blender generated six 1120 × 760 inspections covering the play-yard elevation, CMP-like north-west oblique, rear service wing, east/service end, west access gate and close door view under `tmp/blender-audit/emely-baker-centre-v2/`.
- Two render-review cycles reduced and darkened the over-large first-pass sail and lifted the underlit service-wing brick. The final views preserve the T silhouette, warm brick, roof seams, glazing, continuous outer wall, western opening and readable door hierarchy.
- The game object-preview harness rendered front, right, rear and left views under `tmp/object-visual-audit/2026-07-10-emely-baker-blender-v2-final/`. Signal scores were `84/12`, `87/14`, `84/9` and `87/14` for non-blank/variation, and every final view was manually inspected.
- The static collision test derives the western gap directly from the two wall segments, confirms more than 1.55 game units of clear width, and samples the full gate-to-community-room line against every world obstacle with a 0.34-radius proxy.
- The dedicated Playwright pass loads the GLB, derives its gate route from live level geometry, advances the full player capsule beyond the wall plane, verifies `0.56` shelter beneath the sail, inspects the glazed facade at eye height and starts a community-room search. The test passed after the approach was constrained to the playable park side of this perimeter building.
- `npx vitest run tests/blenderAssets.test.ts tests/buildingRenderGeometry.test.ts tests/collision.test.ts tests/geo.test.ts --reporter=dot` passes 70 focused asset/geometry tests.
- `npx playwright test tests/emelyBakerAssetNavigation.spec.ts --project=desktop` passes the loaded-asset navigation, shelter and interaction test.
- `npm run test:run` passes all 205 unit/geometry tests, including the five editable/runtime Blender manifests and the all-obstacle Emely gate route.
- `npm run test:e2e:quick` passes all 13 desktop/mobile scenarios in 7.9 minutes, including the Rotunda, entrance pavilion, bowling club, Kevin Murray Stand and final Emely Baker Centre interactions.
- `npm run build` passes with only the existing Vite chunk-size advisory.
- `npm run research:check` validates 45 committed research documents, 74 registered sources and the locally retained venue-manual PDF.
