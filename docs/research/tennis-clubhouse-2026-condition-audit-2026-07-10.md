# Fitzroy Tennis Clubhouse 2026 Condition Audit

Date: 2026-07-10

Purpose: determine whether the old Fitzroy Tennis Club rooms can safely become the next integrated Blender building asset at their pre-works OSM coordinate, while retaining the project's 10 July 2026 physical baseline.

## Sources

- Lovell Chen, *Edinburgh Gardens Conservation Management Plan* (2021), section 3.2.10 and Figures 75–77: https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf
  - Documents the old clubhouse's pre-works construction, alterations and court-facing/rear elevations.
- OpenStreetMap way `403753784`: https://www.openstreetmap.org/way/403753784
  - Provides the last audited pre-relocation building footprint. OSM does not establish a daily construction-state position.
- Fitzroy Tennis Club, redevelopment update, updated 30 June 2026: https://www.fitzroytc.net/
  - States that only three southern clay courts were operating, the northern courts were in construction from May to September, the clubhouse construction package ran May 2026 to March 2027, the clubhouse/showers/toilets were no longer accessible, and the old clubhouse was being relocated and incorporated into the new pavilion.
- City of Yarra, ordinary Council meeting reports, 12 May 2026: https://www.yarracity.vic.gov.au/sites/default/files/2026-05/ordinary_council_meeting_reports_-_tuesday_12_may_2026.pdf
  - Defines the pavilion contract as relocation and modernisation of the old clubhouse plus a new accessible pavilion, says both works packages run concurrently and records a separately delivered temporary-relocation scope.
- City of Yarra, first-sod update, 29 May 2026: https://www.yarracity.vic.gov.au/about-us/news-and-media/minister-community-sport-breaks-ground-brunswick-street-oval
  - Confirms that on-ground tennis construction had begun by the baseline period.
- Heritage Victoria, *Brunswick Street Oval Heritage Impact Statement*: https://www.heritage.vic.gov.au/__data/assets/pdf_file/0040/757849/Heritage-Impact-Statement.pdf
  - Documents the proposed relocation and integration of the existing timber clubrooms into a new single-storey pavilion. Its plans are proposal evidence, not a dated July 2026 as-built record.

## Findings

- The CMP section number previously cited in `levelData.ts` was wrong: the Tennis Club is section 3.2.10, not section 3.5.4.
- The old clubhouse is a single-storey timber-framed building with ochre-painted battened fibro-cement cladding above a weatherboard plinth. It is not uniformly weatherboard clad.
- It has a gambrel-roofed northern section and a skillion-roofed southern addition, both clad in corrugated galvanised steel. The south addition has an east/court-facing timber verandah and abuts the Community Hall's red-brick wall.
- The gambrel section has a bracketed south entrance awning; a north verandah with carved timber brackets and a central gablet; a glazed double-leaf door between paired double-hung sash windows; a large newer east glazed opening; and a timber deck around its north/east sides.
- The 30 June update makes the building's 10 July physical position indeterminate. It establishes active relocation and loss of access, but does not say whether the building was still on its original foundations, temporarily stored, partly dismantled or already set at the new pavilion position on the exact baseline date.
- Publicly indexed images found during this audit are CMP/pre-works photographs or proposal renders. No dated construction photograph or current aerial fixes the old timber building's 10 July coordinate and assembly state.

## Implementation Translation

- Corrected the CMP section/material description and 30 June staging language in the mapped-building source metadata.
- Updated the stable official club URL and the overall source inventory.
- Did not replace the current conservative runtime placeholder with a high-confidence Blender building at the pre-works OSM coordinate. A richly detailed asset there could be architecturally accurate yet physically misplaced on 10 July, violating the baseline more seriously than the placeholder's known uncertainty.
- Did not import the future Heritage Impact Statement pavilion geometry, because only the countdown clock is allowed to read as 2030 and the pavilion was scheduled for completion in 2027.
- Retained the three-southern-court/northern-works layout and Court 3 member entrance already supported by the 30 June operational update.

## Uncertainty

- Exact 10 July 2026 clubhouse coordinate and assembly state remain unresolved.
- Temporary hoarding, site compound, lifting equipment, stored building sections and contractor access routes are movable daily construction fabric and are not placed without dated evidence.
- The OSM way remains useful as a pre-relocation survey and collision envelope, but should not be described as a confirmed July as-built footprint.
- The CMP can support a reusable standalone old-clubhouse source asset later, provided runtime placement is withheld or a dated relocation record is found.

## Validation

- Rendered the existing mapped-building preview from four angles under `tmp/object-visual-audit/2026-07-10-tennis-pavilion-pre-asset-audit/`. The review confirms that its court elevation is recognisable, but the blank side/rear envelopes and simplified roof are not a sufficient final artifact.
- Rendered and manually inspected CMP viewer pages 102–104 at 150 dpi; page 103 contains Figures 76–77 and the controlling east/south-wing photographs.
- Re-ran the object ledger and research validator after the metadata/source correction.
- The next integrated building asset is redirected to a structure with a stable 2026 coordinate rather than guessing through this unresolved relocation window.
