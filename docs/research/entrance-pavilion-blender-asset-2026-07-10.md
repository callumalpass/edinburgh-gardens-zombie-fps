# Freeman Street Entrance Pavilion Blender Asset

Date: 2026-07-10

Purpose: apply the Rotunda's validated Blender-to-game workflow to a second distinctive structure, replacing the Freeman Street entrance pavilion's close-range primitive assembly while preserving its mapped 2026 footprint, open public passages and painterly treatment.

## Sources

- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.2.6 and Figure 61: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - PDF viewer page 92 / printed page 73 supplies the controlling photograph and fabric description.
- OpenStreetMap way `543505638`: https://www.openstreetmap.org/way/543505638
  - Controls the existing audited footprint centre, 23.22 m length, 4.27 m depth and world orientation. The full-way JSON remains in the ignored OSM raw-data cache.
- Blender 4.5.10 LTS Linux x64 release: https://download.blender.org/release/Blender4.5/blender-4.5.10-linux-x64.tar.xz
  - The same checksum-verified portable authoring/export runtime used for the Rotunda asset. It is tooling, not physical-condition evidence.

## Findings

- The CMP describes a reconstructed 1996 entrance pavilion placed in the approximate location of the earlier 1980s structure. It is a narrow, utilitarian timber-framed pavilion rather than a closed gatehouse.
- Stop-chamfered timber posts and beams divide the long elevations. The end bays are clad in vertical V-jointed boarding and contain narrow V-jointed board doors.
- Two wide central openings contain V-jointed gates in the documented fabric. The current photograph reads these as open passage bays; keeping them traversable is therefore an architectural and navigation requirement.
- Diagonal boarding fills the upper part of the open bays. Battened/carved valances sit below the eaves.
- The roof is corrugated galvanised metal with gabled ends, decorative cast-iron ridge cresting and a small central gablet on each long elevation.
- Figure 61 is a single oblique exterior view. It establishes the major frame, cladding, roof and opening relationships, but not exact joinery dimensions, small hardware or the full cresting pattern.

## Implementation Translation

- Added reproducible generator `scripts/blender/build_entrance_pavilion.py` and generated:
  - editable `assets/blender/entrance-pavilion/edinburgh-gardens-entrance-pavilion.blend`;
  - runtime `public/models/edinburgh-gardens/edinburgh-gardens-entrance-pavilion.glb`;
  - machine-readable `assets/blender/entrance-pavilion/edinburgh-gardens-entrance-pavilion.asset.json`.
- The asset contains 306 objects, 264 mesh objects, nine materials and 8,122 triangles. It uses the OSM envelope of 23.22 x 4.27 m and a conservatively fitted 3.9 m ridge height.
- Modelled fabric includes the red-brown stop-chamfered frame, cream V-jointed end bays and doors, two unobstructed passage bays, diagonal upper boarding, repeated carved valance drops, a corrugated gabled roof, central front/rear gablets, ridge cresting and gate leaves stowed clear of circulation.
- Runtime loading uses `GLTFLoader`, reapplies the existing painterly/anime material tuning and keeps the previous procedural structure as a load-failure fallback. The imported GLB is scaled to the exact fitted OSM footprint and retains the ledger's position/orientation.
- Collision now uses the footprint's long axis and two passage gaps aligned with the visible openings. Solid end bays and the central frame remain blocked. The searchable `timber-entrance-pavilion-passage` point sits outside the western passage on the documented frontage side.
- The pavilion retains its 2026 physical state. No future Brunswick Street Oval completion geometry or 2030-only physical change was added.

## Uncertainty

- No public architectural survey fixes individual post, beam, gate or valance dimensions. The OSM footprint controls the horizontal envelope; proportions are fitted to Figure 61 and the CMP text.
- The single public photograph does not fully resolve the rear elevation, gate hardware, exact stop-chamfer cuts or every cast-iron cresting motif. Repeated details are conservative translations of the visible pattern.
- The two gate leaves are shown stowed to preserve the photographed open circulation state; their exact hinge angles are not surveyed.
- Painterly cream, red-brown timber and galvanised-metal values are stylistic translations, not measured paint or material samples.

## Validation

- Blender generated six 768 x 768 inspection renders: front, front-right, east end, rear, passage approach and passage interior. The first review caught inward-facing diagonal/joint details and gate boarding that read horizontally; the generator was corrected and the six views were regenerated.
- The four-angle object-preview audit completed with zero automated signal issues under `tmp/object-visual-audit/2026-07-10-entrance-pavilion-blender-v1/`.
- A normal-game Playwright pass verified that both building GLBs load, then approached and entered the western passage with first-person input. The player advanced along the passage axis without lateral collision displacement and received the existing `0.64` shelter protection.
- Collision tests sample nine points across the complete south-to-north route using the full 2.2 m player collision radius; no pavilion, fence, tree or other obstacle closes the route. Separate assertions keep the two end bays solid.
- `npx vitest run tests/blenderAssets.test.ts tests/collision.test.ts tests/geo.test.ts tests/buildingRenderGeometry.test.ts` passes 67 tests after the full-route assertion.
- `npx playwright test tests/buildingAssetNavigation.spec.ts --project=desktop` passes and retains eye-height Rotunda/pavilion screenshots in the test output.
- `npm run test:e2e:quick` passes all 10 desktop/mobile browser tests, including asset navigation, startup, quality switching, gameplay helpers, climbing, riding and intermission controls.
- `npm run build` passes with only the existing Vite chunk-size advisory.
