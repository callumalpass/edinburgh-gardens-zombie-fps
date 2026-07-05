import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredDocs = [
  "docs/edinburgh-gardens-research.md",
  "docs/research/raw-assets.md",
  "docs/research/osm-path-service-inventory-2026-07-05.md",
  "docs/research/hardscape-terrain-edges-2026-07-05.md",
  "docs/research/built-features-2026-07-05.md",
  "docs/research/building-interactions-2026-07-05.md",
  "docs/research/object-placement-collision-2026-07-05.md",
  "docs/research/vegetation-realism-2026-07-05.md",
  "docs/research/street-context-2026-07-05.md",
  "docs/research/park-life-data-pipeline-2026-07-05.md"
];

const failures = [];

for (const relativePath of requiredDocs) {
  if (!existsSync(path.join(root, relativePath))) {
    failures.push(`Missing research document: ${relativePath}`);
  }
}

const rawDir = path.join(root, "docs/research/raw");
let checkedJson = 0;

if (existsSync(rawDir)) {
  for (const filePath of walk(rawDir)) {
    if (!filePath.endsWith(".json")) continue;
    checkedJson += 1;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
      failures.push(`Invalid JSON: ${path.relative(root, filePath)} (${error.message})`);
      continue;
    }
    if (Array.isArray(parsed.elements) && parsed.elements.length === 0) {
      failures.push(`Empty OSM elements array: ${path.relative(root, filePath)}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Research docs OK; validated ${checkedJson} local raw JSON file${checkedJson === 1 ? "" : "s"}.`);

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    if (statSync(filePath).isDirectory()) {
      yield* walk(filePath);
    } else {
      yield filePath;
    }
  }
}
