# Realism Artifact Audit

Date: 2026-07-06

Purpose: document the source-backed realism pass that tightened runtime artifact silhouettes, building facade placement and preview evidence without changing the project's minimalist anime style.

Supersession note: the 2026-07-09 2030 Brunswick Street Oval completion pass replaces this note's temporary tennis/grandstand works-state implementation with completed 2030 court and facility cues. Keep the facade, material and building-detail findings here, but use `docs/research/2030-brunswick-street-oval-completion-2026-07-09.md` for the current tennis-court state.

## Sources

- Yarra City Council Edinburgh Gardens page: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used to keep the overall scene anchored to the documented 24 hectare park, open lawns, specimen trees, shaded areas, path network, access-friendly status and facility set.
- OpenStreetMap park boundary and full-way building records:
  - Boundary way `13815924` remains the containment polygon.
  - The building and tank footprints already compacted in `src/game/levelData.ts` remain the source of truth for building scale and rotation.
- Edinburgh Gardens Conservation Management Plan 2004:
  - Used for conservative treatment of heritage built forms and the hierarchy of the rotunda, oval gatehouse, grandstand, bowling club and tennis pavilion.
- Yarra Brunswick Street Oval redevelopment page: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Used to justify tennis works cues, six existing court renovation cues, secure access gates, accessible facilities, grandstand stairs, refreshed sport/community facility cues and 2026-2027 planting context.
- Yarra Emely Baker Centre page: https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/emely-baker-centre
  - Used to justify access-friendly entry treatment, gated outdoor area and shade sail details.
- Yarra Fitzroy Bowls 150 Years Memorial Wall page: https://www.yarracity.vic.gov.au/things-to-do/arts/gallery/public-art/fitzroy-bowls-150-years-memorial-wall
  - Used to justify the bowling-club wall mural cue, blue/maroon palette, flora strokes and simplified gold lion/club motif on the bowling club facade.
- City of Yarra significant trees and Vicmap Vegetation Tree Urban sources:
  - Used as unchanged tree placement evidence; this pass preserves the existing source-backed tree model and avoids adding synthetic trees.

## Implementation Translation

- Building preview orientation now matches gameplay orientation.
  - `WorldBuilder.fitBoxFromPolygon()` now uses the longest footprint edge so preview and gameplay facades share the same Three.js building axis.
  - This reduces incorrect preview facades on OSM ways whose first coordinate edge is not the main building axis.
- Major mapped buildings now carry explicit source-backed frontage points.
  - `MappedBuilding.facade.frontagePoint` is assigned for the south amenities building, Fitzroy Tennis Club rooms, Freeman Street gatehouse, Fitzroy Victoria Bowling Club rooms and Emely Baker Centre.
  - `WorldBuilder.fitBoxFromPolygon()` accepts that point and flips the fitted axis when needed so doors, awnings, wall lights, ramps, windows, service ladders and courtyard details face the documented use side rather than an arbitrary OSM vertex order.
  - The frontage evidence is intentionally coarse: it identifies the correct side of the mapped footprint, not the exact centimetre position of every window or vent.
- The tennis precinct now shows the documented 2026-2027 court renovation state.
  - Each of the six OSM-derived existing court polygons is tagged with `courtStatus: "renovating-existing"` and a Yarra source note.
  - The renderer overlays a low-cost two-tone resurfacing state, layout tape and small works buckets on those six real court footprints.
  - The Yarra page also confirms two brand-new synthetic courts, but public exact vertices were not available in this pass, so no speculative eighth/seventh court footprint was added.
- Three.js runtime building details were brought closer to the committed building research notes.
  - The tennis storage tank now renders as a round tank with cap, ladder, side pipe and valve box.
  - Fitzroy Tennis Club rooms gain ramp rails, wall light, secure-access mesh and court-equipment lockers.
  - Fitzroy Tennis Club and the nearby grandstand now carry lightweight current-works mesh and signs for the publicly documented 2026-2027 tennis, clubhouse, stairs and gate works.
  - Fitzroy Victoria Bowling Club gains mural-colour panels, flora strokes, a gold club/lion motif cue and equipment storage.
  - The Freeman Street gatehouse gains ticket/plaque panels and bollards.
  - Emely Baker Centre gains an accessible ramp, courtyard pad, shade sail, gated outdoor-area rails and a small booked/community-room sign.
  - Public amenities gain a clearer door bank, louvres, accessible sign, wall light, service ladder and extra vents.
  - Bowling sheds gain roof vents, hose reels and tool crates.
- Current Brunswick Street Oval works are now visible as non-colliding park-life artifacts.
  - Temporary orange mesh panels are placed near the tennis and grandstand works zones.
  - Stacked synthetic-court rolls sit near the tennis-court construction area.
  - OSM tree nodes already suppressed by the redevelopment tree-removal footprint are retained in-world as low stump/sawdust cues instead of being silently invisible.
- Wet weather and day/night dynamics now affect shared park materials and lights.
  - Rain darkens grass, paths, asphalt, concrete, timber, brick and metal toward wet palettes already compatible with the anime-minimal material style.
  - Lamp pools and facade wall lights increase at night, especially under cloud and precipitation.
  - Mapped-building window panes now share the same night/cloud curve, moving from dark glass to a restrained warm interior glow without adding per-window light costs.
- Runtime weapon meshes now better express existing weapon mechanics.
  - Firearms gained trigger, ejection-port, fore-end and stock-pad geometry.
  - These details support the existing recoil, reload, magazine, spread and scoped-weapon mechanics without changing balance.
- Runtime zombie meshes now better express type behavior at distance.
  - Shamblers, sprinters, bloaters, crawlers and screamers received small silhouette markers that reinforce speed, posture, bulk or sound role while preserving the simple low-poly treatment.
- Object preview QA PNGs were generated under ignored `docs/research/renders/object-previews/` folders.
  - Browser-backed WebGL object capture could not run in the current sandbox (`listen EPERM` for local preview and Chromium sandbox shutdown failure for the static fallback), so this pass produced static audit sheets for building facade placement, works/tree/item shapes, weapon silhouettes, zombie silhouettes and weather/night states.
  - Generated local PNGs:
    - `docs/research/renders/object-previews/2026-07-06-realism-audit/facade-placement-audit.png`
    - `docs/research/renders/object-previews/2026-07-06-realism-audit/works-and-tree-audit.png`
    - `docs/research/renders/object-previews/2026-07-06-realism-audit/weapon-zombie-silhouette-audit.png`
    - `docs/research/renders/object-previews/2026-07-06-realism-audit/weather-night-audit.png`
    - `docs/research/renders/object-previews/2026-07-06-facade-court-pass/static-audit/facade-placement-audit.png`
    - `docs/research/renders/object-previews/2026-07-06-facade-court-pass/static-audit/works-and-tree-audit.png`
    - `docs/research/renders/object-previews/2026-07-06-facade-court-pass/static-audit/weapon-zombie-silhouette-audit.png`
    - `docs/research/renders/object-previews/2026-07-06-facade-court-pass/static-audit/weather-night-audit.png`
  - The generated PNGs are used as local QA artifacts, not committed research data.

## Uncertainty

- Public sources confirm building identity, footprint and facility function, but not every current window, vent, door or sign placement. Those micro-details are conservative functional translations of the documented use, not survey-grade facade drawings.
- The facade frontage points are evidence-backed side selectors, not surveyed doorway coordinates. They keep authored details on the correct side of the OSM footprint while accepting small local-position uncertainty.
- The two future tennis courts are documented by Yarra but were not drawn as new playable court footprints because exact public geometry was not available; current runtime geometry limits itself to the six existing OSM court polygons plus works cues.
- The Brunswick Street Oval redevelopment is active across 2026-2027. The runtime keeps works and secure-access cues lightweight so the park remains playable while still reflecting current public project evidence.
- Suppressed-tree stumps mark the positions of removed OSM tree nodes from the already documented redevelopment footprint. They should not be interpreted as a full arborist stump inventory.
- Tree placement was not refreshed in this pass because the existing Vicmap/Yarra/OSM tree model is already source-backed and more precise than hand-added decorative trunks.
