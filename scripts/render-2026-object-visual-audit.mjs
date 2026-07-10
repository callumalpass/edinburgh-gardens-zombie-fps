#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const DEFAULT_URL = "http://127.0.0.1:5480/object-preview.html";
const DEFAULT_OUTPUT = "tmp/object-visual-audit/2026-07-10";
const LEDGER_PATH = "docs/research/edinburgh-gardens-2026-object-audit-ledger.json";
const ANGLE_NAMES = ["front", "right", "rear", "left"];
const CONTACT_SHEET_OBJECTS = 4;
const FRAME_FAILURES = {
  minimumNonBlank: 5,
  minimumVaried: 4
};

const options = parseArgs(process.argv.slice(2));
const outputRoot = path.resolve(options.output);
const ledger = JSON.parse(await readFile(LEDGER_PATH, "utf8"));
const selectedLedgerObjects = ledger.physicalObjects.filter((object) => {
  if (options.categories.size > 0 && !options.categories.has(object.category)) return false;
  if (options.ids.size > 0 && !options.ids.has(object.id)) return false;
  return true;
});

if (selectedLedgerObjects.length === 0) {
  throw new Error("The visual-audit filters selected no physical ledger objects.");
}

await mkdir(outputRoot, { recursive: true });
const server = await ensurePreviewServer(options.url);
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"]
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(options.timeoutMs);
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await page.waitForFunction(() => window.__OBJECT_PREVIEW__?.ready === true, null, { timeout: options.timeoutMs });

  const targets = await page.evaluate(() => window.__OBJECT_PREVIEW__.targets());
  const targetsBySourceId = new Map();
  for (const target of targets) {
    const list = targetsBySourceId.get(target.sourceId) ?? [];
    list.push(target);
    targetsBySourceId.set(target.sourceId, list);
  }

  const missingTargets = selectedLedgerObjects.filter((object) => !targetsBySourceId.has(object.id));
  const duplicateTargets = selectedLedgerObjects.flatMap((object) => {
    const matches = targetsBySourceId.get(object.id) ?? [];
    return matches.length > 1 ? [{ id: object.id, targetIds: matches.map((target) => target.id) }] : [];
  });
  if (missingTargets.length > 0 || duplicateTargets.length > 0) {
    const problem = {
      missingTargets: missingTargets.map((object) => object.id),
      duplicateTargets
    };
    await writeFile(path.join(outputRoot, "coverage-failure.json"), `${JSON.stringify(problem, null, 2)}\n`);
    throw new Error(`Physical-ledger preview coverage failed: ${JSON.stringify(problem)}`);
  }

  const records = [];
  const issues = [];
  const categories = [...new Set(selectedLedgerObjects.map((object) => object.category))].sort();
  for (const category of categories) {
    const categoryObjects = selectedLedgerObjects.filter((object) => object.category === category);
    const categoryDirectory = path.join(outputRoot, sanitize(category));
    await mkdir(categoryDirectory, { recursive: true });
    const sheetBuffer = [];
    const objectsPerSheet = options.majorFourAngles && isMajorVisualCategory(category) ? 1 : CONTACT_SHEET_OBJECTS;
    let sheetIndex = 0;

    for (let objectIndex = 0; objectIndex < categoryObjects.length; objectIndex += 1) {
      const object = categoryObjects[objectIndex];
      const target = targetsBySourceId.get(object.id)[0];
      const angleIndexes = options.majorFourAngles && isMajorVisualCategory(object.category) ? [0, 1, 2, 3] : options.angleIndexes;
      const frameRecords = [];
      const contactFrames = [];

      for (const angleIndex of angleIndexes) {
        const rendered = await page.evaluate(
          async ({ targetId, angle }) => window.__OBJECT_PREVIEW__.render(targetId, angle),
          { targetId: target.id, angle: angleIndex }
        );
        const angleName = ANGLE_NAMES[normalizeAngle(angleIndex)];
        const filename = `${String(objectIndex + 1).padStart(3, "0")}-${sanitize(object.id)}-${angleName}.png`;
        const filePath = path.join(categoryDirectory, filename);
        await writeFile(filePath, decodeDataUrl(rendered.dataUrl));

        const frameRecord = {
          angleIndex,
          angle: angleName,
          path: path.relative(outputRoot, filePath),
          signal: rendered.signal
        };
        frameRecords.push(frameRecord);
        contactFrames.push({ angle: angleName, dataUrl: rendered.dataUrl, signal: rendered.signal });

        if (rendered.signal.nonBlank < FRAME_FAILURES.minimumNonBlank || rendered.signal.varied < FRAME_FAILURES.minimumVaried) {
          issues.push({
            id: object.id,
            category: object.category,
            angle: angleName,
            issue: "blank-or-low-variation-frame",
            signal: rendered.signal
          });
        }
      }

      records.push({
        id: object.id,
        category: object.category,
        label: object.label,
        auditStatus: object.auditStatus,
        targetId: target.id,
        targetKind: target.kind,
        frames: frameRecords
      });
      sheetBuffer.push({ object, frames: contactFrames });

      if (sheetBuffer.length === objectsPerSheet || objectIndex === categoryObjects.length - 1) {
        sheetIndex += 1;
        const sheetDataUrl = await composeContactSheet(page, category, sheetIndex, sheetBuffer);
        const sheetName = `sheet-${String(sheetIndex).padStart(3, "0")}.jpg`;
        await writeFile(path.join(categoryDirectory, sheetName), decodeDataUrl(sheetDataUrl));
        sheetBuffer.length = 0;
      }

      if ((records.length % 20 === 0) || records.length === selectedLedgerObjects.length) {
        process.stdout.write(`Rendered ${records.length}/${selectedLedgerObjects.length} physical objects\n`);
      }
    }
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseline: ledger.physicalBaseline,
    sourceLedger: LEDGER_PATH,
    previewUrl: options.url,
    requestedObjectCount: selectedLedgerObjects.length,
    renderedObjectCount: records.length,
    renderedFrameCount: records.reduce((sum, record) => sum + record.frames.length, 0),
    allPhysicalLedgerObjectsIncluded: selectedLedgerObjects.length === ledger.physicalObjects.length,
    filters: {
      categories: [...options.categories],
      ids: [...options.ids],
      angleIndexes: options.angleIndexes,
      majorFourAngles: options.majorFourAngles
    },
    thresholds: FRAME_FAILURES,
    issueCount: issues.length,
    issues,
    objects: records
  };
  await writeFile(path.join(outputRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outputRoot, "index.html"), renderHtmlReport(report));
  process.stdout.write(
    `Visual audit rendered ${report.renderedObjectCount} objects / ${report.renderedFrameCount} frames with ${report.issueCount} automatic signal issues.\n` +
      `Report: ${path.join(outputRoot, "audit-report.json")}\n`
  );
} finally {
  await browser?.close();
  await stopServer(server);
}

function parseArgs(argv) {
  const parsed = {
    url: process.env.EGAME_OBJECT_PREVIEW_URL || DEFAULT_URL,
    output: DEFAULT_OUTPUT,
    categories: new Set(),
    ids: new Set(),
    angleIndexes: [0, 1],
    majorFourAngles: false,
    timeoutMs: 60_000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--major-four-angles") {
      parsed.majorFourAngles = true;
      continue;
    }
    const [name, inlineValue] = arg.split("=", 2);
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`${name} requires a value.`);
    if (name === "--url") parsed.url = value;
    else if (name === "--output") parsed.output = value;
    else if (name === "--categories") parsed.categories = commaSet(value);
    else if (name === "--ids") parsed.ids = commaSet(value);
    else if (name === "--angles") parsed.angleIndexes = parseAngles(value);
    else if (name === "--timeout") parsed.timeoutMs = parsePositiveInteger(value, name);
    else throw new Error(`Unknown option ${name}.`);
  }
  return parsed;
}

function commaSet(value) {
  return new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean));
}

function parseAngles(value) {
  const angles = [...new Set(value.split(",").map((entry) => Number(entry.trim())))];
  if (angles.length < 2 || angles.some((angle) => !Number.isInteger(angle) || angle < 0 || angle > 3)) {
    throw new Error("--angles must contain at least two unique indexes from 0,1,2,3.");
  }
  return angles;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function normalizeAngle(angleIndex) {
  return ((angleIndex % ANGLE_NAMES.length) + ANGLE_NAMES.length) % ANGLE_NAMES.length;
}

function isMajorVisualCategory(category) {
  return category === "building" || category === "landmark" || category === "structure-shelter";
}

function sanitize(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "object";
}

function decodeDataUrl(dataUrl) {
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Expected a base64 image data URL.");
  return Buffer.from(match[1], "base64");
}

async function composeContactSheet(page, category, sheetIndex, rows) {
  return page.evaluate(async ({ sheetCategory, index, sheetRows }) => {
    const width = 1320;
    const headerHeight = 78;
    const rowHeight = sheetRows.some((row) => row.frames.length > 2) ? 1340 : 690;
    const height = headerHeight + sheetRows.length * rowHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#d8d6c8";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#17201a";
    context.font = "700 28px system-ui, sans-serif";
    context.fillText(`2026 physical-object visual audit — ${sheetCategory} — sheet ${index}`, 28, 48);

    for (let rowIndex = 0; rowIndex < sheetRows.length; rowIndex += 1) {
      const row = sheetRows[rowIndex];
      const y = headerHeight + rowIndex * rowHeight;
      context.fillStyle = row.object.auditStatus.startsWith("unresolved") ? "#f4dfb0" : "#ece9dd";
      context.fillRect(0, y, width, rowHeight - 4);
      context.fillStyle = "#17201a";
      context.font = "700 19px system-ui, sans-serif";
      context.fillText(`${row.object.id} — ${row.object.label}`, 22, y + 27, width - 44);
      context.font = "14px system-ui, sans-serif";
      context.fillStyle = "#3d4b42";
      context.fillText(`${row.object.auditStatus}`, 22, y + 49);

      const columns = row.frames.length > 2 ? 2 : row.frames.length;
      const imageWidth = columns === 1 ? 620 : 620;
      const imageHeight = 620;
      for (let frameIndex = 0; frameIndex < row.frames.length; frameIndex += 1) {
        const frame = row.frames[frameIndex];
        const image = await loadImage(frame.dataUrl);
        const column = frameIndex % columns;
        const imageRow = Math.floor(frameIndex / columns);
        const x = 22 + column * 648;
        const imageY = y + 63 + imageRow * 638;
        context.drawImage(image, x, imageY, imageWidth, imageHeight);
        context.fillStyle = "rgba(15, 24, 19, 0.78)";
        context.fillRect(x, imageY + imageHeight - 26, imageWidth, 26);
        context.fillStyle = "#f7f5ea";
        context.font = "13px system-ui, sans-serif";
        context.fillText(`${frame.angle} · nonblank ${frame.signal.nonBlank} · varied ${frame.signal.varied}`, x + 9, imageY + imageHeight - 8);
      }
    }
    return canvas.toDataURL("image/jpeg", 0.92);

    function loadImage(source) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Unable to compose contact-sheet frame."));
        image.src = source;
      });
    }
  }, { sheetCategory: category, index: sheetIndex, sheetRows: rows });
}

function renderHtmlReport(report) {
  const categories = [...new Set(report.objects.map((object) => object.category))];
  const sections = categories.map((category) => {
    const objects = report.objects.filter((object) => object.category === category);
    return `<section><h2>${escapeHtml(category)} (${objects.length})</h2>${objects.map((object) => `
      <article class="${object.auditStatus.startsWith("unresolved") ? "unresolved" : ""}">
        <h3>${escapeHtml(object.id)} — ${escapeHtml(object.label)}</h3>
        <p>${escapeHtml(object.auditStatus)} · ${escapeHtml(object.targetKind)}</p>
        <div class="frames">${object.frames.map((frame) => `<figure><img loading="lazy" src="${escapeHtml(frame.path)}" alt="${escapeHtml(object.label)} ${escapeHtml(frame.angle)}"><figcaption>${escapeHtml(frame.angle)} · nonblank ${frame.signal.nonBlank} · varied ${frame.signal.varied}</figcaption></figure>`).join("")}</div>
      </article>`).join("")}</section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Edinburgh Gardens 2026 physical-object visual audit</title><style>
    :root{color-scheme:light;background:#d8d6c8;color:#17201a;font-family:system-ui,sans-serif}body{margin:0 auto;max-width:1500px;padding:28px}h1,h2,h3{line-height:1.12}header{position:sticky;top:0;background:rgba(216,214,200,.95);padding:12px 0;z-index:2}article{background:#ece9dd;border:1px solid #a8aa9d;border-radius:10px;margin:16px 0;padding:16px}.unresolved{border-color:#b48332;background:#f4dfb0}.frames{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}figure{margin:0}img{display:block;width:100%;height:auto;background:#d8d6c8}figcaption{font-size:13px;padding:6px 2px}</style></head><body>
    <header><h1>Edinburgh Gardens 2026 physical-object visual audit</h1><p>${report.renderedObjectCount} objects · ${report.renderedFrameCount} frames · ${report.issueCount} automatic signal issues</p></header>${sections}</body></html>\n`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function ensurePreviewServer(url) {
  const origin = new URL(url).origin;
  if (await isAvailable(origin)) return null;
  const parsedUrl = new URL(url);
  const child = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host",
    parsedUrl.hostname,
    "--port",
    parsedUrl.port || "5480",
    "--strictPort"
  ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: process.env });
  child.stdout.on("data", (chunk) => process.stderr.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  let exitStatus = null;
  child.on("exit", (code, signal) => { exitStatus = signal ?? code ?? "unknown"; });
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (exitStatus !== null) throw new Error(`Vite exited before ${origin} was ready with ${exitStatus}.`);
    if (await isAvailable(origin)) return child;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill("SIGTERM");
  throw new Error(`Timed out waiting for ${origin}.`);
}

async function isAvailable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function stopServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
  await once(server, "exit");
}
