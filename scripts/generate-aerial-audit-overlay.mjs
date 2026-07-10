import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const IMAGE_PATH = "docs/research/raw/2026-07-10/vicmap-basemap-aerial-edinburgh-gardens.png";
const OUTPUT_PATH = "docs/research/raw/2026-07-10/vicmap-aerial-object-overlay.svg";
const BENCH_OUTPUT_PATH = "docs/research/raw/2026-07-10/vicmap-aerial-bench-audit-contact-sheet.svg";
const WIDTH = 1898;
const HEIGHT = 2048;
const BBOX = {
  minX: 16139044.113216834,
  minY: -4549858.529134399,
  maxX: 16139801.085754123,
  maxY: -4549041.545366765
};
const MAP_CENTER = { lat: -37.7876764, lon: 144.9828576 };
const WORLD_SCALE = 1.28;
const METRES_PER_LAT = 111_320;
const METRES_PER_LON = METRES_PER_LAT * Math.cos((MAP_CENTER.lat * Math.PI) / 180);

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { createLevelData } = await server.ssrLoadModule("/src/game/levelData.ts");
  const level = createLevelData();
  const image = await readFile(IMAGE_PATH);
  const layers = [];

  for (const path of level.paths) {
    layers.push(polyline(path.points, "#28d8ff", 2.2, 0.5, path.id));
  }
  for (const landmark of level.landmarks) {
    if (landmark.polygon) layers.push(polygon(landmark.polygon, "#ffe04b", 1.5, 0.12, landmark.id));
  }
  for (const building of level.mappedBuildings) {
    layers.push(polygon(building.polygon, "#ff3d3d", 2.2, 0.28, building.id));
  }
  for (const fence of level.mappedFences) {
    // Preserve open fence runs. Several sports precincts use a building wall
    // as part of their enclosure, so closing every polyline would draw a false
    // audit segment straight through the clubhouse.
    layers.push(polyline(fence.points, "#ff8c24", 3, 0.8, fence.id));
  }
  for (const tree of level.trees) {
    layers.push(point(tree.position, 1.7, "#52ff77", 0.42, tree.id));
  }
  for (const amenity of level.amenities) {
    layers.push(point(amenity.position, 4, "#00ffff", 0.9, amenity.id));
    if (Number.isFinite(amenity.angle)) layers.push(heading(amenity.position, amenity.angle, 8, "#00ffff", amenity.id));
    layers.push(label(amenity.position, amenity.id, "#00ffff"));
  }
  for (const detail of level.parkLifeDetails) {
    layers.push(point(detail.position, 4.5, "#ff4dff", 0.95, detail.id));
    if (Number.isFinite(detail.angle)) layers.push(heading(detail.position, detail.angle, 9, "#ff4dff", detail.id));
    layers.push(label(detail.position, detail.id, "#ff4dff"));
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <image href="data:image/png;base64,${image.toString("base64")}" width="${WIDTH}" height="${HEIGHT}" />
  <g>${layers.join("\n")}</g>
</svg>\n`;
  await writeFile(OUTPUT_PATH, svg);
  await writeFile(BENCH_OUTPUT_PATH, benchContactSheet(level, image));
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${BENCH_OUTPUT_PATH}`);
} finally {
  await server.close();
}

function worldToPixel(world) {
  const lat = MAP_CENTER.lat - world.z / (METRES_PER_LAT * WORLD_SCALE);
  const lon = MAP_CENTER.lon + world.x / (METRES_PER_LON * WORLD_SCALE);
  const mercatorX = lon * 20037508.34 / 180;
  const mercatorY = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
  return {
    x: (mercatorX - BBOX.minX) / (BBOX.maxX - BBOX.minX) * WIDTH,
    y: (BBOX.maxY - mercatorY) / (BBOX.maxY - BBOX.minY) * HEIGHT
  };
}

function polyline(points, color, width, opacity, id) {
  const value = points.map((point) => {
    const pixel = worldToPixel(point);
    return `${pixel.x.toFixed(2)},${pixel.y.toFixed(2)}`;
  }).join(" ");
  return `<polyline points="${value}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"><title>${escapeXml(id)}</title></polyline>`;
}

function polygon(points, color, width, opacity, id) {
  const value = points.map((point) => {
    const pixel = worldToPixel(point);
    return `${pixel.x.toFixed(2)},${pixel.y.toFixed(2)}`;
  }).join(" ");
  return `<polygon points="${value}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="${width}"><title>${escapeXml(id)}</title></polygon>`;
}

function point(position, radius, color, opacity, id) {
  const pixel = worldToPixel(position);
  return `<circle cx="${pixel.x.toFixed(2)}" cy="${pixel.y.toFixed(2)}" r="${radius}" fill="${color}" opacity="${opacity}"><title>${escapeXml(id)}</title></circle>`;
}

function heading(position, angle, length, color, id) {
  const start = worldToPixel(position);
  const end = worldToPixel({ x: position.x + Math.cos(angle) * length, z: position.z + Math.sin(angle) * length });
  return `<line x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${end.x.toFixed(2)}" y2="${end.y.toFixed(2)}" stroke="${color}" stroke-width="2"><title>${escapeXml(id)} heading</title></line>`;
}

function label(position, value, color) {
  const pixel = worldToPixel(position);
  return `<text x="${(pixel.x + 6).toFixed(2)}" y="${(pixel.y - 6).toFixed(2)}" fill="${color}" stroke="#101820" stroke-width="2.4" paint-order="stroke" font-family="sans-serif" font-size="9">${escapeXml(value)}</text>`;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function benchContactSheet(level, image) {
  const benches = level.amenities.filter((amenity) => amenity.kind === "bench");
  const columns = 5;
  const cellWidth = 220;
  const cellHeight = 215;
  const cropSize = 36;
  const viewport = 190;
  const rows = Math.ceil(benches.length / columns);
  const encodedImage = image.toString("base64");
  const clips = [];
  const cells = benches.map((bench, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const originX = column * cellWidth + 15;
    const originY = row * cellHeight + 15;
    const center = worldToPixel(bench.position);
    const cropX = center.x - cropSize / 2;
    const cropY = center.y - cropSize / 2;
    const scale = viewport / cropSize;
    const headingEnd = worldToPixel({
      x: bench.position.x + Math.cos(bench.angle ?? 0) * 8,
      z: bench.position.z + Math.sin(bench.angle ?? 0) * 8
    });
    const localCenter = viewport / 2;
    const localHeadingX = localCenter + (headingEnd.x - center.x) / cropSize * viewport;
    const localHeadingY = localCenter + (headingEnd.y - center.y) / cropSize * viewport;
    clips.push(`<clipPath id="bench-clip-${index}"><rect x="${originX}" y="${originY}" width="${viewport}" height="${viewport}" /></clipPath>`);
    const imageX = originX - cropX * scale;
    const imageY = originY - cropY * scale;
    return `<g>
      <g clip-path="url(#bench-clip-${index})"><image href="data:image/png;base64,${encodedImage}" width="${WIDTH}" height="${HEIGHT}" transform="translate(${imageX.toFixed(2)} ${imageY.toFixed(2)}) scale(${scale.toFixed(6)})" /></g>
      <rect x="${originX}" y="${originY}" width="${viewport}" height="${viewport}" fill="none" stroke="#00ffff" stroke-width="2" />
      <circle cx="${originX + localCenter}" cy="${originY + localCenter}" r="5" fill="none" stroke="#00ffff" stroke-width="2" />
      <line x1="${originX + localCenter}" y1="${originY + localCenter}" x2="${(originX + localHeadingX).toFixed(2)}" y2="${(originY + localHeadingY).toFixed(2)}" stroke="#ff35ff" stroke-width="3" />
      <text x="${originX}" y="${originY + 207}" fill="#eafcff" font-family="monospace" font-size="13">${escapeXml(bench.id)}</text>
    </g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}" viewBox="0 0 ${columns * cellWidth} ${rows * cellHeight}">
  <defs>
    ${clips.join("\n")}
  </defs>
  <rect width="100%" height="100%" fill="#101820" />
  ${cells.join("\n")}
</svg>\n`;
}
