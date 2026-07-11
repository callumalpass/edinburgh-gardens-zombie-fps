# Outside-Park Context World — 2026-07-11

## Sources

- OpenStreetMap map API, bounded extract around Edinburgh Gardens: <https://api.openstreetmap.org/api/0.6/map?bbox=144.97835096436717,-37.79124436676249,144.9873642356328,-37.78410843323751>
- OpenStreetMap Edinburgh Gardens boundary way 13815924: <https://www.openstreetmap.org/way/13815924>
- Vicmap Address FeatureServer layer 0: <https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Address/FeatureServer/0>
- Vicmap Basemap WMS: <https://base.maps.vic.gov.au/service?service=WMS&request=GetCapabilities>
- Vicmap Buildings catalogue: <https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-buildings>
- Vicmap Elevation catalogue and metro FeatureServer: <https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-elevation> and <https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer>
- Vicmap Vegetation Tree Urban FeatureServer layer 0: <https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Vegetation_Tree_Urban/FeatureServer/0>
- City of Yarra, *Review of Heritage Overlay Areas 2007* (updated 2013), HO327 North Fitzroy: <https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/review-of-heritage-areas-2007-butler-updated-2013.pdf>
- City of Yarra, *Database of Heritage Significant Areas*, April 2022: <https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/heritage-database/incoproated-document--database-of-heritage-significant-areas-april-2022.pdf?la=en>
- City of Yarra, Bargoonga Nganjin development summary and current library page: <https://www.yarracity.vic.gov.au/planning-and-building/planning-permits/bargoonga-nganjin-north-fitzroy-library> and <https://www.yarracity.vic.gov.au/our-libraries/hours-and-locations/bargoonga-nganjin-north-fitzroy-library>
- City of Yarra Council minutes, 4 August 2015, Fitzroy Community School item: <https://www.yarracity.vic.gov.au/sites/default/files/2024-05/20150804-ordinary-council-minutes.pdf>
- City of Yarra, *Fitzroy Urban Conservation Study Review* (1992), St Luke's church description: <https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/fitzroy-urban-conservation-study-review-1992.pdf>
- Current owner/operator sites recorded on named OSM features, including Red Gallery, Stable Health Clinic, The Cup & Mug, Enlocus Architects and Fitzroy Community School. Their URLs are retained on the corresponding records in `edinburgh-gardens-context-building-register.json`.

## Findings

### Auditable scope

The context world is deliberately finite: all mapped buildings outside the OSM Edinburgh Gardens polygon whose polygon centroid falls within 150 real metres of the boundary. This yielded 448 buildings. A wider 270 m painted terrain collar closes the ground-to-horizon gap but does not assert additional building detail beyond the researched belt.

The committed building register contains one record per rendered building. Each record retains the OSM way and tags, source URL, address match, aerial roof sample, chosen height and basis, roof/profile classification, evidence tier, feature sources/cues where available, and an uncertainty statement. The evidence split is 13 feature-specific records, 238 footprint/address/aerial records and 197 footprint/aerial records.

### Precinct form

The City of Yarra HO327 study describes North Fitzroy south of Holden Street as predominantly Victorian with a substantial Edwardian contribution. Its contributory houses commonly have one-storey wall heights with some two-storey rows; pitched gabled or hipped roofs; face red, bichrome or polychrome brick, stucco or some weatherboard walls; and corrugated iron, slate or Marseilles terracotta roofs. The study separately describes the St Georges Road commercial strip as Victorian/Edwardian shop-residences, including two-storey rows. These are appropriate precinct-level visual rules, not proof that every individual building has every listed feature.

### Landmark findings

- Bargoonga Nganjin is an official three-storey, approximately 2,800 m² civic building. Council documents support fixed exterior shading/screens and a rooftop garden. Its exact OSM footprint, flat civic massing, three storeys and roof-garden cue are therefore feature-specific.
- Fitzroy Community School remains at 597–599 Brunswick Street and grew from the founders' house into the adjoining building. It is rendered as adapted adjoining-house/institutional fabric, not a generic large school block.
- The 1992 City study identifies St Luke's as a former Anglican church designed by Crouch & Wilson and now associated with the Hungarian Reformed congregation. Its strong gabled ecclesiastical silhouette is supported; an exact tower/spire height is not.
- The North Fitzroy Seventh-day Adventist Church and Former Church of Christ have mapped place-of-worship/church identity and footprints. They receive church wall/roof profiles, but no invented tower or ornamental programme.
- Named St Georges Road businesses retain their current OSM identity and owner-site evidence. Owner sites establish identity/use; absent a controlled current elevation photograph they do not establish exact window counts, signs or paint colours.

### Streets, trees and terrain

OSM supplies the road, service, foot/cycle path and Route 11 tram alignments. Vicmap aerial imagery confirms the broad street/block relationships. Tram ways are rendered as narrow rails with lightweight overhead infrastructure, not as duplicate full-width roads. Vicmap Tree Urban returned 1,924 source points in the query bbox; 1,048 remain after excluding the playable park and clipping to 150 m.

The context contour family spans 25–37 m AHD. It is interpolated independently and calibrated/blended to the existing park surface over the first 28 world units outside the boundary, preventing the road/building-base seams that a flat collar produced.

## Implementation Translation

- `scripts/generate-context-world.mjs` is the reproducible source-to-runtime pipeline. It selects the finite building set, spatially joins addresses, samples roof pixels, assigns transparent height/roof/profile bases and writes both runtime data and the per-building evidence register.
- `src/game/contextData.generated.ts` contains the generated 448 buildings, 416 road/path/tram ways, 1,048 trees and 735 elevation samples.
- `src/game/rendering/ContextWorldBuilder.ts` creates one explicitly non-playable scene root. It has no collision, navigation, AI, interaction, pickup or lighting ownership.
- Building bodies and roofs are merged by five restrained tonal families. Near façade windows, doors, shop awnings, tram poles and trees are instanced. Medium/low quality hides the most expensive near accents while retaining the skyline and terrain closure.
- Every building uses its exact selected OSM polygon and orientation. Heights prefer explicit OSM `height` or `building:levels`; otherwise the register states the type/footprint-based inference. Roof colour is a robust median of non-green, non-dark pixels sampled within the aerial polygon. Roof shape prefers an explicit tag and otherwise uses a conservative type/aspect inference.
- The HO327 residential/retail profiles influence only façade rhythm and broad material family. Decorative details are painted tonal accents and are not asserted as a measured elevation survey.
- Context ground, roads, pavements, buildings, poles and trees share the same outside elevation sampler. The surface blends continuously to the existing playable terrain at the boundary.
- The renderer extends the camera far plane to 1,800 units, but researched building content stops at 150 m. A darkened terrain fade and existing atmospheric fog absorb the outer 120 m without adding unsupported skyline objects.

## Uncertainty

- OpenStreetMap supplies excellent public footprint topology but is community-maintained, not a cadastral or as-built survey. Vicmap Buildings LOD data is authoritative metadata context, but a directly downloadable current LOD2 mesh was not available through the public services used here.
- The Vicmap aerial capture is suitable for footprint/roof cross-checking but visibly cannot prove July 2026 façade condition or small rooftop fixtures. Roof-tone sampling can include shadow or tree occlusion; every sampled RGB value is retained for audit.
- Most public records do not expose building height. Inferred heights are intentionally conservative and explicitly labelled. A tower, spire, chimney, balcony, verandah or exact shop sign is omitted unless feature-specific evidence supports it.
- The heritage study establishes precinct character and development era, not an individual elevation survey for all 448 structures. Therefore façade accents express the documented streetscape rhythm while the register does not mislabel them as exact window/door measurements.
- Vicmap contour interpolation gives a defensible broad ground surface, not kerb-level engineering accuracy. The boundary blend prioritises a seam-free join with the established park terrain.
- Context trees represent the published Vicmap source capture, not a July 2026 arborist inventory. They are non-interactive skyline/occlusion context.

## Validation

- `node scripts/generate-context-world.mjs`
- `npm run research:check`
- `npm run build`
- `npx playwright test tests/contextWorld.spec.ts --project=desktop`
- The Playwright context audit checks 448 buildings, more than 300 road/path segments, more than 1,000 context trees, at most 25 mesh draw groups and fewer than 180,000 fully instance-expanded triangles.
- The audit teleports to and captures clear-weather representative views from the east, north, south and west park edges. Each render is visually reviewed for continuous terrain, recognizable street/block massing, façade/roof registration, tram infrastructure and absence of a ground-to-sky void.
- The context root is asserted non-playable in unit coverage; no generated building is added to level obstacles or navigation blockers.
