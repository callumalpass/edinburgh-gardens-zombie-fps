# Fitzroy Victoria Bowling Club Blender Asset

Date: 2026-07-10

Purpose: apply the validated Blender-to-game building workflow to the Fitzroy Victoria Bowling & Sports Club, preserve its exact 2026 footprint and public approach, replace the coarse rectangular runtime shell with evidence-based visible elevations, and verify that the Hannah memorial gate, green-facing verandah and clubroom interaction remain usable at full player width.

## Sources

- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.2.9 and Figures 70–73: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Printed pages 76–78 / PDF viewer pages 98–100 provide the street-side historic view, the current north-west/green-facing club photograph, the Hannah memorial gate photograph and the view east across both greens.
- OpenStreetMap way `543505639`: https://www.openstreetmap.org/way/543505639
  - Controls the existing audited irregular shell, fitted centre/orientation, 80.24 m long envelope and 30.96 m maximum depth.
- City of Yarra, *Roof upgrade at Fitzroy Bowls Club*, April–May 2025: https://www.yarracity.vic.gov.au/sites/default/files/2025-04/yarranews_aprmay25_fa_web_nicholls_ward.pdf
  - Records replacement of aged roof sheeting with zincalume, structural strengthening and gutter upgrades, and states that the work was not expected to affect the building's appearance.
- City of Yarra, *Fitzroy Bowls 150 Years Memorial Wall*: https://www.yarracity.vic.gov.au/things-to-do/arts/gallery/public-art/fitzroy-bowls-150-years-memorial-wall
  - Establishes the earlier Makatron/Conrad Bizjak/Bryan Itch public-art context and the club's blue/maroon/lion identity.
- Colour Our City, current Fitzroy Bowls mural photographs: https://www.flickr.com/photos/colourourcity/55297636202/, https://www.flickr.com/photos/colourourcity/55298958435/, https://www.flickr.com/photos/colourourcity/55298958440/
  - All three are geotagged at the club and report a capture date of 28 May 2026. They show the current Melanie Caple St Georges Road composition and the whole street elevation.
- Colour Our City, earlier 150-year mural photographs: https://www.flickr.com/photos/colourourcity/24264579119/, https://www.flickr.com/photos/colourourcity/24523952342/, https://www.flickr.com/photos/colourourcity/24550092411/
  - All three report a capture date of 26 January 2016. They distinguish the former blue jungle/flora/lion artwork from the current 2026 street wall and prevented the old mural from being treated as current.
- Fitzroy Victoria Bowling & Sports Club: https://www.barefootbowling.com.au/
  - Used only for current operational/social-club context, not architectural dimensions.
- Blender 4.5.10 LTS Linux x64: https://download.blender.org/release/Blender4.5/blender-4.5.10-linux-x64.tar.xz
  - The checksum-verified portable authoring/export runtime used for the Rotunda and entrance-pavilion assets. It is tooling, not condition evidence.

The six Flickr reference photographs are All Rights Reserved. Local ignored copies under `docs/research/raw/2026-07-10/bowling-club-murals/` were used only for visual study; no photograph is embedded in or texture-copied into the distributed asset.

## Findings

- The CMP describes a utilitarian brick clubhouse on a long rectangular plan, with single- and double-storey wings, flat roofs with aluminium fascia, bagged-render walls and aluminium windows. The photographed green-facing elevation is a long glazed wall under a shallow verandah with green framing and blue/gold club fascia.
- The public OSM polygon is not a simple rectangle. It contains a long rear run, a sharply angled east/street end and two differently angled green-facing frontage segments. A bounding-box facade therefore misplaces walls, roof edges, doors and the verandah.
- The roof retains its outward appearance after the 2025 zincalume/gutter work. Current aerial evidence shows the long low roof, upper-storey block and solar-panel field; exact reinstated panel offsets and small roof plant are not publicly surveyed.
- The CMP documents a ten-rink and a seven-rink synthetic green, chain-mesh enclosure, ancillary sheds/lights and the Hannah memorial entrance with paired red/brown brick piers. The route from that gate to the glazed club frontage is a necessary public circulation path.
- The 28 May 2026 street photographs show a current maroon mural across the St Georges Road end wall. Its controlling large-scale arrangement is: standing lion at left, reclining lion at right, two amber discs, central bottles/glassware and pink dahlia, two green-and-blue budgies, glossy foliage, gold rays and a blue/club-information strip.
- The previously implemented blue jungle mural corresponds to the separately dated January 2016 150-year artwork. It is not the correct visible street-wall state for this July 2026 baseline.

## Implementation Translation

- Added reproducible generator `scripts/blender/build_bowling_club.py` and generated:
  - editable `assets/blender/bowling-club/edinburgh-gardens-bowling-club.blend`;
  - runtime `public/models/edinburgh-gardens/edinburgh-gardens-bowling-club.glb`;
  - machine-readable `assets/blender/bowling-club/edinburgh-gardens-bowling-club.asset.json`.
- The final asset contains 357 objects, 356 mesh objects, 23 materials and 22,156 triangles, remaining below the repository's 25,000-triangle major-building budget. An earlier smooth text build exceeded budget because bevelled lettering alone contributed over 44,000 triangles; the final raised sans-serif lettering keeps smooth silhouettes with minimal curve resolution and extrusion.
- The exact OSM polygon drives the bagged-render shell and zincalume roof envelope. Two separately fitted curtain-wall/verandah runs follow the real kinked green frontage. Visible details include glazed door/window bays, green mullions/transoms/posts, blue fascia and raised gold naming, a concrete apron, roof seams, 14 solar panels, upper-storey windows, rear doors/windows, gutters and downpipes.
- The current mural is a semantic low-relief painterly translation rather than a photograph texture. Its photographed ordering, large subjects and palette are retained, while simplified layered shapes avoid copying the artists' brushwork and remain consistent with the game's anime/painterly rendering.
- Runtime loading uses `GLTFLoader`, reapplies existing painterly material tuning and scales/rotates the asset to the audited OSM fitted frame. The previous procedural club remains as a failure-only fallback; its simplified mural cue was also updated to the current maroon/two-lion/flower/budgie palette.
- The previous generic axis-aligned shelter was replaced by two edge-fitted verandah shelter boxes aligned to OSM frontage edges 6–7 and 8–9. The clubroom interaction is fitted 2 m along and 2.45 m outside the actual glazed wall so the 2.2 m player proxy faces a clear bay without camera clipping while remaining under `0.62` shelter protection.
- The source-accurate Hannah opening is narrower than the game's unusually broad player proxy. A short invisible auto-passage bypasses only the two photographed pier colliders, their immediately adjoining fence segments and the adjacent mapped outbuilding edge while the player is inside the gate corridor. All those objects retain their exact visible positions and remain solid outside the corridor.
- The building has no invented playable interior. Searching the exterior clubroom access remains the existing interaction.

## Uncertainty

- No public architectural survey fixes individual wall, window, door, verandah-member, solar-panel or service-opening dimensions. OSM controls the horizontal shell; CMP/current photographs and aerial evidence control visible proportions.
- The current 2026 photographs survey the St Georges Road wall and street elevation, not every hidden facade. Rear service openings are conservative translations of available historic/current context.
- The current mural is not reproduced brush-for-brush, and the All Rights Reserved photographs are not distributed as textures. The low-relief composition records the wall's recognisable 2026 identity while remaining deliberately approximate at detail level.
- The 2025 Council notice says roof replacement should not affect appearance, but it does not publish as-built drawings. Roof seams, small plant and solar-panel offsets are therefore visual fits.
- Public sources do not establish a current surveyed interior plan or public walk-through access, so no interior is represented.

## Validation

- Blender generated six 768 × 768 inspections covering the green frontage, front-east corner, Hannah-gate/mural end, St Georges Road/rear side, upper-storey oblique and player-height green approach.
- Render review caught two material errors before acceptance: the first placeholder mural represented the superseded 2016 artwork, and the first current-wall translation read as round emblems. The source dates were rechecked; the wall was rebuilt in photographed left-to-right order with layered manes, faces, two lions, central flower/still life and paired birds, then regenerated and re-inspected.
- The four-angle game object-preview audit completed with zero automated signal issues under `tmp/object-visual-audit/2026-07-10-bowling-club-blender-v3-current-mural/`. Front, mural end, rear and opposite end all render at ground level.
- Full-radius unit sampling checks 23 points from four metres outside the Hannah gate to seven metres inside and applies the same local bypass context as locomotion; no obstacle closes the route. Separate tests keep the two brick piers solid and ensure every bypass ID names a real collider.
- A normal-game Playwright pass loads the GLB, dismisses the intermission choice, walks across the Hannah gate plane with first-person input, verifies the sheltered frontage, displays the clubroom prompt and completes the search for a scrap/tool reward. Screenshots cover gate approach, gate interior and frontage before/after interaction.
- `npx vitest run tests/blenderAssets.test.ts tests/collision.test.ts tests/geo.test.ts` passes the focused asset/geometry/navigation suite.
- `npm run build` and the complete project validation are run after research-manifest updates.
