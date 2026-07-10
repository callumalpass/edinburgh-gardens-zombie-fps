# Fitzroy Memorial Rotunda Blender Asset Pilot

Date: 2026-07-10

Purpose: replace the Rotunda's coarse runtime primitive assembly with an editable, evidence-based Blender asset, then verify its appearance and first-person navigation before extending the workflow to other structures.

## Sources

- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.10.1 and Figures 142-143: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - PDF viewer pages 164-166 / printed pages 145-147 provide the fabric description, current exterior photograph and ground-level interior photograph.
- City of Yarra, Edinburgh Gardens Rotunda: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/edinburgh-gardens-rotunda
  - Confirms current bookable use, stair-only/not-wheelchair-accessible access and no current power.
- OpenStreetMap way `543505640`: https://www.openstreetmap.org/way/543505640
  - Retains the existing audited footprint centre and orientation. The raw full-way JSON remains in the repository's ignored OSM research cache.
- Blender 4.5.10 LTS Linux x64 release: https://download.blender.org/release/Blender4.5/blender-4.5.10-linux-x64.tar.xz
  - Used as a portable, checksum-verified authoring/export runtime. The Blender archive is tooling rather than research evidence and is not committed.

## Findings

- The existing primitive preview had the correct broad parts but did not survive close visual inspection: the cropped/dark dome, heavy columns, timber-looking upper deck and simplified lower storey did not match the current-condition photograph.
- The current Rotunda is a circular rendered-masonry and concrete structure with a raised open platform above a lower-storey drum, eight Tuscan columns, moulded entablature, triglyph-and-metope frieze, copper-clad dome, lantern and finial.
- The stair is a single straight flight bounded by solid masonry balustrades that curve outward at grade and terminate in panelled capped piers. A non-original steel gate closes the stair entrance.
- Two main copper memorial plaques sit on the drum beside the stair, with a smaller Second World War plaque adjacent to the southern plaque.
- The lower-storey fabric includes perforated vents, two sets of steel-framed louvred windows with wirecast glazing/security mesh, and a V-jointed board door below the stair. The surrounding concrete apron is non-original.
- The upper deck is painted concrete, not timber. The lower interior is not a public walk-through room and remains outside the playable navigation envelope.
- The CMP confirms modern entablature floodlights but does not publish a reliable count or angular survey.

## Implementation Translation

- Added reproducible generator `scripts/blender/build_rotunda.py` and generated:
  - editable `assets/blender/rotunda/edinburgh-gardens-rotunda.blend`;
  - runtime `public/models/edinburgh-gardens/edinburgh-gardens-rotunda.glb`;
  - machine-readable `assets/blender/rotunda/edinburgh-gardens-rotunda.asset.json`.
- The asset is modelled in metres with its origin at the apron centre/ground and a documented +Y Blender front, which exports as Three.js -Z. Runtime placement continues to use the audited OSM/ledger centre and existing `-0.34` world rotation.
- The GLB contains the rendered drum, painted-concrete deck, seven-step stair, flared segment-built balustrades, capped piers, gate, plaques, louvred/mesh openings, eight Tuscan columns, moulded entablature, subdued masonry triglyphs, panelled copper dome/ribs, lantern and finial.
- Runtime loading uses `GLTFLoader`, reapplies the established anime/painterly material tuning, casts/receives world shadows and retains the prior procedural assembly as a failure-only fallback. Object-preview capture waits for asset loading, so audits cannot accidentally photograph the fallback.
- The physical OSM building entry is now labelled `Fitzroy Memorial Rotunda`. Preview height/radius were corrected to frame the complete 9.76 m asset rather than using the 3.1 m lower-storey metadata.
- Added eight 0.31 m column collision circles aligned with the GLB. The deck interaction bypasses the solid drum blocker but not the columns, leaving more than 2 m clear between adjacent shafts.
- The deck remains reached only through the existing `rotunda-deck` stair interaction at 1.86 m. The source-backed shelter protection remains `0.76`; the no-current-power constraint is unchanged.
- The asset keeps the 2026 physical baseline. It does not contain or alter the separate 2030 countdown clock.

## Uncertainty

- No public architectural survey supplies exact component dimensions. The OSM footprint controls horizontal placement/scale; vertical proportions are fitted conservatively to the CMP description and photographs.
- Painterly masonry/copper colours are visual translations, not measured paint or material samples.
- Two opposing subdued floodlight meshes represent the documented presence of modern floodlights. Their count and angular placement are explicitly schematic in object metadata and the asset manifest.
- The lower-storey room is represented only by external openings. Its historical interior photograph does not establish a current public interior layout, and the current venue information does not support making it navigable.

## Validation

- Verified the Blender 4.5.10 LTS archive against the official SHA-256 value `198a4248b38899af661aa9241cebd746394eaddbfafbeb53152440de80b118f7`.
- Blender generated six 768 x 768 inspection renders: front, front-right, lower-storey side, rear, stair approach and upper-deck interior.
- The first render review caught dark blue frieze blocks that read as vents; the generator now gives triglyphs a subdued shaded-masonry material.
- The game object-preview harness rendered the imported GLB from four angles with zero automatic signal issues under `tmp/object-visual-audit/2026-07-10-rotunda-blender-v2/`.
- Live first-person testing entered the stair interaction, confirmed 1.86 m deck elevation, `0.76` shelter protection and sustained movement across the raised platform. The review caught intangible columns; dedicated aligned blockers were then added and covered by collision tests.
- `npx vitest run tests/collision.test.ts tests/geo.test.ts tests/buildingRenderGeometry.test.ts` passes 63 tests.
- `npm run build` passes with only the existing Vite chunk-size advisory.
