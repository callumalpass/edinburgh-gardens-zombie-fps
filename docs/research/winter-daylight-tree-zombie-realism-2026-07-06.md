# Winter Daylight, Tree Silhouette and Zombie Realism

Date: 2026-07-06

Purpose: retune the game so the current winter Edinburgh Gardens scene reads as real Melbourne in July while preserving the low-poly anime style and keeping the renderer performant.

## Sources

- Yarra City Council, Edinburgh Gardens: https://www.yarracity.vic.gov.au/things-to-do/parks-reserves-and-playgrounds/edinburgh-gardens
  - Used for the park-wide baseline: 24 hectares, open lawns, specimen trees, shaded areas and extensive path network.
- City of Yarra significant trees dataset metadata: https://data.gov.au/data/dataset/yarra-significant-trees
  - Used to keep tree silhouettes tied to existing significant-tree species/diameter/height evidence already embedded in `levelData.ts`.
- Vicmap Vegetation Tree Urban dataset metadata: https://discover.data.vic.gov.au/dataset/vicmap-vegetation-tree-urban-rest-api
  - Used for the existing non-significant mapped tree point source, with canopy radius and height translated through the existing `MappedTree` model.
- Yarra Brunswick Street Oval redevelopment page: https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval
  - Used for current winter 2026 tree-removal/replanting context and the species mix around the tennis/oval works.
- Bureau of Meteorology Melbourne Regional Office climate statistics: https://www.bom.gov.au/climate/averages/tables/cw_086071.shtml
  - Used to keep the weather loop weighted toward July cloud, rain days, humidity and moderate wind rather than constant heavy storms.
- Timeanddate.com Melbourne July 2026 sun table: https://www.timeanddate.com/sun/australia/melbourne
  - Used for 2026-07-06 Melbourne daylight timing: sunrise about 7:35am, sunset about 5:13pm, civil twilight about 7:06am to 5:43pm, and low winter solar altitude.

## Findings

- The previous day/night curve behaved more like a long summer evening: dawn began before 5:30am and dusk could linger near 8pm.
- Melbourne on 2026-07-06 has a short winter day. Sunrise is around 7:35am, sunset around 5:13pm, civil twilight starts around 7:06am and ends around 5:43pm.
- BOM July climate normals support heavy cloud presence, frequent rain days, high morning humidity and modest wind. This reinforces lower contrast, wetter surfaces and short visibility windows.
- The existing tree data already has strong source provenance. The gap was visual translation: winter elm/oak avenue trees looked too leafy and generic, while gum-like trees should keep more evergreen canopy and pale bark.

## Implementation Translation

- `src/game/rendering/timeOfDay.ts`
  - Added `MELBOURNE_WINTER_SOLAR` constants for start hour, civil dawn/dusk, sunrise/sunset, solar noon, sunrise/sunset azimuth and noon altitude.
  - Added `dayProgress`, `sunAzimuthDegrees` and `sunAltitudeDegrees` to `TimeOfDayState`.
  - Retuned exposure and daylight to the July 2026 Melbourne envelope.
- `src/game/rendering/WorldBuilder.ts`
  - Uses solar azimuth/altitude to position the key light instead of a generic day/night lerp.
  - Makes elm and oak profiles branchier and sparser in winter, with heavier leaf-litter ground masks.
  - Keeps gum-like trees fuller and paler-barked so evergreen/specimen profiles remain distinct.
- `src/game/stealth.ts`
  - Adds time-of-day lighting to player visibility. Unlit night lowers visibility; flashlight and powered structure lights become more dangerous at night and under cloud.
- `src/game/zombieProfiles.ts` and `src/game/GameApp.ts`
  - Adds tested zombie environmental helpers.
  - Wet winter grass/dirt slows heavier bodies more than hard paths.
  - Night modestly shifts zombie awareness toward hearing, while wind/rain still mask subtle cues.

## Uncertainty

- Timeanddate provides astronomical timing rather than a City of Yarra source. It is used only for sun timing, not for park geometry or current works.
- The tree seasonality pass is not survey-grade botanical rendering. It maps existing `TreeProfile` evidence into broad winter forms: deciduous avenue/specimen trees become branchier, gum-like profiles remain evergreen.
- Zombie behavior is fiction. The environmental modifiers are intentionally small and derived from physical footing/visibility logic, not from a real organism model.

## Validation

- Tests and checks run:
  - `npm run test:run -- tests/timeOfDay.test.ts tests/stealth.test.ts tests/zombieProfiles.test.ts`
  - `npm run test:run`
  - `npm run research:check`
  - `npm run build`
- Static PNG QA artifacts were generated under ignored `docs/research/renders/object-previews/2026-07-06-winter-realism/static-audit/`, including `winter-daylight-tree-zombie-audit.png`.
- Runtime WebGL tree preview capture was attempted with `scripts/render-object-previews.mjs`, but Chromium could not start in this container because the host sandbox failed with `shutdown: Operation not permitted (1)`. The static audit PNGs were used for visual validation in this pass.
