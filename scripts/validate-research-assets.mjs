import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const manifestPath = "docs/research/research-manifest.json";
let checkedJson = 0;
let checkedXml = 0;
let checkedFiles = 0;
const manifest = readJsonFile(manifestPath);

if (manifest) {
  validateManifest(manifest);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Research manifest OK; validated ${manifest.documents.length} document${manifest.documents.length === 1 ? "" : "s"}, ` +
    `${manifest.sources.length} source${manifest.sources.length === 1 ? "" : "s"}, ${checkedJson} local raw JSON file${checkedJson === 1 ? "" : "s"} ` +
    `${checkedXml} local raw XML file${checkedXml === 1 ? "" : "s"} and ${checkedFiles} local binary/text artifact${checkedFiles === 1 ? "" : "s"}.`
);

function readJsonFile(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) {
    failures.push(`Missing research manifest: ${relativePath}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`Invalid JSON: ${relativePath} (${error.message})`);
    return null;
  }
}

function validateManifest(candidate) {
  if (candidate.schemaVersion !== 1) {
    failures.push(`Unsupported research manifest schemaVersion: ${candidate.schemaVersion}`);
  }
  if (!Array.isArray(candidate.sources)) {
    failures.push("Research manifest must include a sources array.");
    return;
  }
  if (!Array.isArray(candidate.documents)) {
    failures.push("Research manifest must include a documents array.");
    return;
  }
  if (!Array.isArray(candidate.rawAssets)) {
    failures.push("Research manifest must include a rawAssets array.");
    return;
  }

  const sourceIds = validateSources(candidate.sources);
  validateDocuments(candidate.documents, candidate.indexDocument, sourceIds);
  validateRawAssets(candidate.rawAssets, sourceIds);
}

function validateSources(sources) {
  const ids = new Set();
  for (const source of sources) {
    if (!source.id) {
      failures.push("Research source is missing an id.");
      continue;
    }
    if (ids.has(source.id)) {
      failures.push(`Duplicate research source id: ${source.id}`);
    }
    ids.add(source.id);
    const url = source.url ?? source.urlTemplate?.replace(/\{[^}]+\}/g, "example");
    if (!url) {
      failures.push(`Research source ${source.id} must include url or urlTemplate.`);
      continue;
    }
    try {
      new URL(url);
    } catch {
      failures.push(`Research source ${source.id} has an invalid URL: ${url}`);
    }
  }
  return ids;
}

function validateDocuments(documents, indexDocument, sourceIds) {
  const seenPaths = new Set();
  const indexPath = indexDocument ?? "docs/edinburgh-gardens-research.md";
  const indexText = readTextIfPresent(indexPath);
  for (const doc of documents) {
    if (!doc.id || !doc.path) {
      failures.push("Research document entries must include id and path.");
      continue;
    }
    if (seenPaths.has(doc.path)) {
      failures.push(`Duplicate research document path: ${doc.path}`);
    }
    seenPaths.add(doc.path);

    const text = readTextIfPresent(doc.path);
    if (!text) {
      continue;
    }
    if (doc.requireIndexReference !== false && doc.path !== indexPath && !indexText.includes(doc.path)) {
      failures.push(`Research index does not reference ${doc.path}`);
    }
    for (const heading of doc.requiredHeadings ?? []) {
      if (!text.includes(heading)) {
        failures.push(`Research document ${doc.path} is missing heading ${heading}`);
      }
    }
    for (const sourceId of doc.sourceIds ?? []) {
      if (!sourceIds.has(sourceId)) {
        failures.push(`Research document ${doc.path} references unknown source id ${sourceId}`);
      }
    }
  }
}

function validateRawAssets(rawAssets, sourceIds) {
  for (const asset of rawAssets) {
    if (!asset.id || !asset.pathPattern || !asset.format) {
      failures.push("Raw research asset entries must include id, pathPattern and format.");
      continue;
    }
    if (asset.sourceId && !sourceIds.has(asset.sourceId)) {
      failures.push(`Raw research asset ${asset.id} references unknown source id ${asset.sourceId}`);
    }
    const matches = matchFiles(asset.pathPattern);
    if (matches.length === 0 && asset.optional !== true) {
      failures.push(`Missing raw research asset: ${asset.pathPattern}`);
      continue;
    }
    for (const filePath of matches) {
      if (asset.format === "osm-xml") {
        validateRawXml(filePath);
      } else if (asset.format === "xml") {
        validateGenericXml(filePath);
      } else if (asset.format === "file") {
        validateNonEmptyFile(filePath);
      } else {
        validateRawJson(filePath, asset.format);
      }
    }
  }
}

function readTextIfPresent(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) {
    failures.push(`Missing research document: ${relativePath}`);
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function validateRawJson(filePath, format) {
  checkedJson += 1;
  let parsed;
  const relativePath = path.relative(root, filePath);
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`Invalid JSON: ${relativePath} (${error.message})`);
    return;
  }

  if (format === "osm-elements") {
    if (!Array.isArray(parsed.elements) || parsed.elements.length === 0) {
      failures.push(`Empty or missing OSM elements array: ${relativePath}`);
    }
    return;
  }
  if (format === "arcgis-features") {
    if (!Array.isArray(parsed.features) || parsed.features.length === 0) {
      failures.push(`Empty or missing ArcGIS features array: ${relativePath}`);
    }
    return;
  }
  if (format !== "json") {
    failures.push(`Unknown raw asset validation format "${format}" for ${relativePath}`);
  }
}

function validateRawXml(filePath) {
  checkedXml += 1;
  const relativePath = path.relative(root, filePath);
  const text = readFileSync(filePath, "utf8");
  if (!/<osm[\s>]/.test(text)) {
    failures.push(`Missing OSM XML root: ${relativePath}`);
    return;
  }
  if (!/<(node|way|relation)\b/.test(text)) {
    failures.push(`Missing OSM elements in XML: ${relativePath}`);
  }
}

function validateGenericXml(filePath) {
  checkedXml += 1;
  const relativePath = path.relative(root, filePath);
  const text = readFileSync(filePath, "utf8");
  if (!/<\?xml\b|<[A-Za-z_][\w:.-]*(?:\s|>)/.test(text)) {
    failures.push(`Missing XML root element: ${relativePath}`);
  }
}

function validateNonEmptyFile(filePath) {
  checkedFiles += 1;
  if (statSync(filePath).size === 0) {
    failures.push(`Empty raw research artifact: ${path.relative(root, filePath)}`);
  }
}

function matchFiles(relativePattern) {
  const normalizedPattern = toPosix(relativePattern);
  const wildcardIndex = normalizedPattern.search(/[*?]/);
  const basePattern = wildcardIndex === -1 ? normalizedPattern : normalizedPattern.slice(0, wildcardIndex);
  const baseDir = path.join(root, basePattern.slice(0, basePattern.lastIndexOf("/") + 1));
  if (!existsSync(baseDir)) {
    return [];
  }
  const regex = globToRegex(normalizedPattern);
  return [...walk(baseDir)].filter((filePath) => regex.test(toPosix(path.relative(root, filePath))));
}

function globToRegex(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  source += "$";
  return new RegExp(source);
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

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
