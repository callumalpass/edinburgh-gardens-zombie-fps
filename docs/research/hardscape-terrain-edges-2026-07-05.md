# Hardscape and Terrain Edge Research

Captured: 2026-07-05

Purpose: improve the feeling of walking through the real gardens by adding low hardscape details that shape path and lawn edges.

## Sources

- 3068 Group, Edinburgh Gardens studies and CMP archive: https://the3068group.org/edinburgh-gardens-studies/
- Edinburgh Gardens Conservation Management Plan, 2004 PDF: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf

## Source Findings Used

- CMP section 3.4.26 records the path system as asphalted, with remnant basalt and bluestone edging, especially along earlier formal path alignments.
- CMP section 3.4.27 describes a bluestone-pitcher lined open drain on the eastern side of the oval perimeter.
- CMP section 3.4.28 describes a low bluestone retaining wall along the southern Alfred Crescent boundary.
- The CMP emphasizes that these hard landscape details are part of the park's surviving nineteenth-century structure, so they should be present as low, repeated edge cues rather than large new obstacles.

## Implementation Notes

- Added `LevelData.hardscapeLines` for sourceable hardscape geometry.
- Added hardscape lines for formal path basalt edging, Alfred Crescent path edging, the oval-east drain and the Alfred Crescent retaining wall.
- Rendered basalt edging with a single `THREE.InstancedMesh` per hardscape line to avoid hundreds of individual stone meshes.
- Rendered walls and drains terrain-aware using existing `createTerrainRect()` so they follow the Vicmap-derived broad slope.
- Hardscape lines are visual only; they do not add collision blockers.

