# Alfred Crescent Sports Pavilion Blender Asset

Date: 2026-07-10

Purpose: correct OpenStreetMap way `242003562` from a generic “south amenities” prism to the real Alfred Crescent Sports Pavilion; reproduce its current 2026 outline, original 2010 architectural character and completed public-toilet expansion; preserve the painterly/anime treatment; and verify that the public approaches and exterior interactions remain usable at full player-capsule size.

## Sources

- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.10.3 and Figure 145: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Identifies the building as the Alfred Crescent Sports Pavilion, built in 2010 to a ClarkeHopkinsClarke design. It describes the elongated butterfly roof with curved southern end, sheet-metal roof, ground-level masonry and coloured cladding, skillion roofs/clerestory, paired-glass west entrance, roller shutters to the north/east, timber-panel doors to the south/west, exterior public toilets in the curved southern element, changerooms, social room and kiosk.
- OpenStreetMap way `242003562`, current full-way response version 5 dated 6 February 2026: https://www.openstreetmap.org/way/242003562
  - Controls the current irregular horizontal shell. The source envelope is approximately 35.20 × 16.59 m; the runtime frontage frame is 45.06 × 21.23 game units after the established `WORLD_SCALE = 1.28` transform. The exact 16-edge plan is retained rather than expanded to a rectangle.
- City of Yarra, *Buildings Asset Management Plan, Revision 2017*: https://www.yarracity.vic.gov.au/sites/default/files/2024-06/buildings_asset_management_plan_revision_2017.pdf
  - Page 172 identifies asset `B000163` as Alfred Crescent Pavilion, Edinburgh Gardens, with pavilion/clubroom/changeroom use. The council photograph independently confirms the green panels, dark openings and clerestory; the asset was assessed as a new pavilion in good condition.
- City of Yarra, *New public toilets* consultation: https://yoursayyarra.com.au/newtoilets
  - The Alfred Crescent proposal states that the expansion adds capacity for 11 users, including five additional gender-neutral cubicles, and is additional to two accessible toilets. The published pavilion render and 1:100 plan resolve the north-west extension, exterior hand-basin line, vertical screen/pergola, electrical switchroom relationship, service gate and retained rainwater tank.
- City of Yarra, *Annual Report 2021–22*: https://www.yarracity.vic.gov.au/sites/default/files/2024-04/annual_report_2021_to_2022_accessible_version.pdf
  - Confirms that the Alfred Crescent pavilion public-toilet expansion was completed and opened. This converts the consultation drawings from evidence of a proposal into evidence for a completed extension, while not proving that every proposed finish was constructed without variation.
- ClarkeHopkinsClarke project portfolio, *Edinburgh Gardens Cricket Pavilion*: https://archipro.com.au/project/edinburgh-gardens-cricket-pavilion-clarkehopkinsclarke
  - Will Belcher’s six published photographs clearly resolve both long elevations and the original interior. They control the black corrugated wraparound roof/ribbon, pale concrete masonry, emerald/lime fascia panels, green-reflecting clerestory glazing, charcoal frames/shutters, timber soffits, round wall lights, deep west canopy, paired doors and public bench. These photographs predate the toilet extension and therefore do not control the current north-west outline.
- Blender 4.5.10 LTS Linux x64: https://download.blender.org/release/Blender4.5/blender-4.5.10-linux-x64.tar.xz
  - Checksum-verified portable authoring/export runtime used by the other major-building assets. It is tooling, not physical-condition evidence.

## Findings

- The former “south service and amenities building” identity was materially wrong. The mapped object is a substantial multi-purpose sports pavilion with clubrooms, changerooms, social room, kiosk and integrated public toilets.
- The original pavilion has a defining roof silhouette: a long dark corrugated sheet-metal ribbon rises gently along the clerestory and rolls down around the southern end. A flat capped prism does not resemble the building.
- The west/public elevation has a continuous accessible apron, deep timber-lined canopy on slender charcoal posts, paired glazed entrances, pale masonry, green/lime panels, round wall lights and a long clerestory. The posts sit between door bays, so both the sightline and a full player route must remain open.
- The east/oval elevation has the same clerestory and colour band but is more service-oriented, with roller shutters, timber-panel doors and kiosk/equipment openings.
- The current footprint is not the unmodified 2010 pavilion. Council’s later plan adds the public-toilet bank and screened wash forecourt at the north-west side while explicitly retaining the two existing accessible toilets at the curved southern end and the rainwater tank in its exterior screened yard.
- The published toilet render is a proposal image, not an as-built photograph. The annual report proves completion, and February 2026 OSM fixes the current envelope, but exact as-built cubicle hardware, screening pitch and finishes remain uncertain.
- The two existing OSM toilet nodes cluster at the southern facility and do not individually document the expanded toilet bank. Dedicated evidence-linked exterior interaction points are therefore used for the northern extension and southern accessible pair without moving the raw OSM nodes.
- Published photographs show interior permeability and rooms, but no complete current measured plan exists. The asset supports exterior interactions and does not invent a free-roam interior.

## Implementation Translation

- Added reproducible generator `scripts/blender/build_alfred_crescent_pavilion.py` and generated:
  - editable `assets/blender/alfred-crescent-pavilion/edinburgh-gardens-alfred-crescent-pavilion.blend`;
  - optimized runtime `public/models/edinburgh-gardens/edinburgh-gardens-alfred-crescent-pavilion.glb`;
  - machine-readable `assets/blender/alfred-crescent-pavilion/edinburgh-gardens-alfred-crescent-pavilion.asset.json`.
- The final editable model contains 231 objects, 230 mesh objects, 26 materials and 11,536 triangles. Evidence-labelled source pieces remain separate in the `.blend`; export joins them into one multi-material Draco-compressed runtime mesh of approximately 55 KB.
- The exact current OSM plan remains visible in both the foundation and shallow shell. Articulated original-pavilion, north-service, toilet-extension and tank-yard masses sit within that plan instead of filling the asymmetric frontage frame.
- Blender `-Y` / glTF `+Z` is the west/public elevation. Runtime loading uses the same frontage-aware centre, angle and asymmetric OSM extents as collision and interactions, then reapplies the existing painterly/anime material tuning.
- The authored asset includes the wraparound black roof/ribbon and corrugation cues, large green curved-end fields on both long elevations, long clerestories and mullions, pale/dark masonry, green/lime fascia panels, two paired west entries, deep timber-lined canopy, seven repositioned columns, oval-side glazing/shutters/doors, two south accessible doors, bench, gutters/downpipes and round lights.
- The completed toilet extension includes seven visible door cues representing the documented facility groups, sign plates/handles, accessible paving, screen posts, pergola beams, five exterior hand basins and taps, service core, retained tank/lid/ribs and tank-yard access door. Fine counts are plan translations; they are not presented as an independent as-built survey.
- The previous blank procedural fallback now preserves the pavilion’s defining canopy, green panel band, clerestory, paired entries, roof colour and gutter if the GLB fails to load.
- Added external search interactions at the west clubroom doors and oval-side kiosk, plus evidence-linked interaction points for the expanded public toilets and retained south accessible pair. Toilet camera offsets were increased from the generic 0.55-unit semantic-node treatment to full first-person clearance.
- Renamed the roof interaction from `south-toilets-roof` to `alfred-pavilion-roof`. Its portable-ladder mechanic is explicitly gameplay fiction and no longer claims that a fixed real-world service ladder exists.
- Moved fictional loot metadata away from the public-door evidence model and labelled it as gameplay rather than permanent park fabric.

## Uncertainty

- OSM fixes the current horizontal shell but no public measured elevation survey fixes every return, wall height, roof radius, corrugation, mullion, joint, post or light position.
- The architect photographs are excellent facade evidence but predate the 2021 toilet works. They are used only where the later works did not supersede the original fabric.
- The council plan/render is a proposal set. Completion is independently confirmed, but the final as-built cubicle partitions, basins, screens and finishes may vary.
- The exact interior room divisions and current equipment are not represented. The exterior search points are gameplay abstractions attached to documented doors/hatches.
- The roof is visually navigable as a portable-ladder gameplay surface, but that interaction does not assert real public roof access. No fixed ladder is baked into the asset.
- Loose operational objects in photographs, including temporary furniture and bins, are not baked in as permanently positioned park objects.

## Validation

- Blender generated eight 1120 × 760 inspections under `tmp/blender-audit/alfred-crescent-pavilion-v3-final/`: west/public elevation, toilet extension, east/oval shutters, south-west roof curve, tank/service yard, paired entrance, toilet forecourt and south accessible toilets.
- Three render-review cycles corrected the initial under-lighting, a hidden east facade, a tank swallowed by an over-broad mass, cylindrical-looking basins, the curved green field on the wrong plane, missing black roof outline and a canopy post obstructing the paired-door sightline.
- The dedicated Playwright pass loads the Alfred GLB, walks the full player capsule more than three capsule radii along the covered apron, searches the clubroom and kiosk, and inspects both toilet groups from exterior camera clearance.
- The object-preview harness rendered final front/right/rear/left runtime views under `tmp/object-visual-audit/2026-07-11-alfred-pavilion-blender-final/` with no automatic blank/variation issues; all four views were manually inspected.
- `npm test -- --run` passes the full unit/geometry suite after regenerating the physical-object ledger.
- `npm run build` passes with only the existing Vite chunk-size advisory.
- `npm run research:check` validates the committed note/manifest and the available ignored OSM, council PDF/image and architect-photo artifacts.
