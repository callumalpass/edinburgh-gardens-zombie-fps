# Heritage Furniture and Winter Weather Realism

Date: 2026-07-06

## Sources

- Edinburgh Gardens Conservation Management Plan, Allom Lovell & Associates and John Patrick Pty Ltd for City of Yarra, revised January 2004: https://www.yarracity.vic.gov.au/sites/default/files/2024-05/www.yarracity.vic.gov.au/-/media/files/ycc/the-area/heritage/edinburgh-gardens-conservation-management-plan-2004.pdf
- Bureau of Meteorology, climate statistics for MELBOURNE REGIONAL OFFICE station 086071: https://www.bom.gov.au/climate/averages/tables/cw_086071.shtml

## Findings

- The CMP identifies primary-significance hard-landscape elements including cast iron gas lamp standards, nineteenth-century cast iron bollards, the Chandler Drinking Fountain, the Queen Victoria pedestal, the grandstand, the Freeman Street entrance gatehouse, the rotunda and the historic path layout.
- The CMP furniture figures distinguish reproduction seats, contemporary seats, interpretive signage, picnic/BBQ facilities, drinking fountains, early cast iron bollards, later steel bollards and boom gates.
- CMP policy notes that lighting is functionally important but inconsistent in design and placement, while remnant gas standards around the rotunda and remnant cast iron lanterns have heritage value.
- BOM Melbourne Regional Office July normals support a cool, cloudy, damp tuning: July mean maximum 13.5 C, mean minimum 6.0 C, mean rainfall 47.5 mm, 9.7 days of rain at or above 1 mm, 17.3 cloudy days, 2.6 clear days, 79% mean 9am relative humidity, 10.4 km/h mean 9am wind and 14.1 km/h mean 3pm wind.

## Implementation Translation

- Added source-backed park-life detail records for the Chandler Drinking Fountain, four cast-iron gas lamp standards, two cast-iron bollard clusters, two reproduction heritage seats and three interpretive signs.
- The new details remain non-colliding park-life objects so zombie navigation and player movement keep the existing obstacle budget.
- The Chandler Fountain is placed just north-east of the mapped Freeman Street gatehouse/ticket-booth setting. The rotunda lamps use radial offsets around the rotunda footprint. The bowling lamp is hand-placed south of the bowling-club footprint. Exact surveyed lamp/fountain points are not embedded because no public point layer was found.
- Object-preview framing was updated for the new artifact shapes so generated PNGs can validate fountain, lamp, bollard, seat and interpretive-sign silhouettes.
- Weather phases were retuned without changing the 420 second loop length. The new loop emphasizes overcast periods, fine drizzle, cold showers, wet ground, fog and wind, with only a short hail-squall/storm phase.

## Uncertainty

- The CMP provides figure references and setting descriptions for the furniture family, but not public GIS coordinates for each seat, bollard, lamp or sign. Hand-placed points are therefore source-backed but approximate.
- The BOM station is in central Melbourne rather than inside Edinburgh Gardens. It is the closest long-record climate source already represented by official public statistics and is appropriate for broad weather feel, not site-level nowcasting.

## Validation

- `npm run test:run -- tests/weather.test.ts tests/geo.test.ts`
- Planned after the full pass: `npm run research:check`, focused object-preview PNG generation and `npm run build`.
