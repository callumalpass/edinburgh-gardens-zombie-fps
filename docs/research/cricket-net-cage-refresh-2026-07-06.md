# Cricket Net Cage Refresh

Captured: 2026-07-06

Purpose: remodel the W. T. Peterson / Brunswick Street Oval cricket nets as a source-backed practice cage rather than a small single-lane visual cue.

## Sources

- OpenStreetMap node `249041533`, `sport=cricket_nets`, from the local oval fence/access extract and OSM API source inventory.
- OpenStreetMap tag page for `sport=cricket_nets`: `https://wiki.openstreetmap.org/wiki/Tag%3Asport%3Dcricket_nets`
- Edinburgh Gardens Conservation Management Plan, 2004: `https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf`
- Edinburgh Cricket Club, Senior Women's: `https://edinburghcricketclub.com/senior-womens`
- Running Routes, Melbourne Carlton/Fitzroy Running Route: `https://www.joggingroutes.org/2014/12/melbourne-carltonfitzroy-running-route.html`

## Findings

- OSM only provides a point feature for the cricket nets, not surveyed cage vertices. The tag nevertheless describes cricket nets as a net-bounded cricket practice area and allows node mapping when exact area geometry is not mapped.
- The 2004 CMP section 3.4.4 records the Edinburgh Gardens cricket practice nets as four concrete and artificial turf wickets inside a galvanised pipe and cyclone wire enclosure. It also records a remnant concrete boundary wall with a painted mural incorporated into the nets.
- The Edinburgh Cricket Club page confirms that the Brunswick Street Oval nets are active training infrastructure during cricket season.
- The public 2014 route photo captioned "Cricket practice in Edinburgh Gardens" shows a multi-lane netted practice cage beside the oval context, consistent with the CMP's four-wicket description.

## Implementation Translation

- Kept `oval-cricket-nets` anchored to OSM node `249041533`.
- Added cricket-net metadata to the park-life detail: four lanes, one open-front entrance, concrete/artificial-turf surface, galvanised-pipe/cyclone-wire cage and rear mural wall.
- Rebuilt the renderer as a four-lane cage with side, rear, roof and internal divider netting. The whole front face is visually open with no vertical net mesh, and a turf threshold runs across the open entry.
- Added non-sight-blocking cage collision segments for the two sides, rear and three internal divider nets. No front collision segments are generated, so players can enter directly from the open face.
- Added a climbable side-frame interaction that places the player on top of the cage and bypasses the cage segments while elevated.
- Added a low rear concrete wall with mural panels and an `ECC` cue to translate the CMP's remnant boundary-wall/mural note without inventing full mural artwork.

## Uncertainty

- No public CAD, council GIS polygon or current measured cage footprint was found. Width, length and divider start are gameplay-scale approximations constrained by the four-wicket CMP description, the OSM point location and the public photo evidence.
- The 2004 CMP describes galvanised/cyclone-wire materials, while current public photo evidence reads visually as dark netted cage panels. The in-game model uses dark mesh with galvanised frame cues to satisfy both sources.

## Validation

- `npm run test:run -- tests/geo.test.ts tests/collision.test.ts`
- `npx tsc --noEmit`
- `npm run research:check`
- `npm run build`
- `npm run test:e2e:quick -- tests/game-smoke.spec.ts`
