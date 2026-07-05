import { chromium } from "@playwright/test";
import { build as viteBuild } from "vite";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = 5482;
const ANGLES = ["front", "right", "rear", "left"];

const options = parseArgs(process.argv.slice(2));
const outDir = path.resolve(options.out ?? "docs/research/renders/object-previews/latest");
let baseURL = options.baseURL ?? `http://127.0.0.1:${DEFAULT_PORT}`;
let server = null;
let staticPreviewDir = null;

try {
  try {
    server = await ensureServer(baseURL, options.baseURL ? null : DEFAULT_PORT);
  } catch (error) {
    if (options.baseURL) {
      throw error;
    }
    staticPreviewDir = path.join(process.env.TMPDIR ?? "/tmp", "edinburgh-gardens-object-preview");
    await buildStaticPreview(staticPreviewDir);
    baseURL = pathToFileURL(staticPreviewDir).href;
    console.log(`Preview server unavailable; using static build at ${baseURL}`);
  }

  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"]
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
  const previewUrl = previewPageUrl(baseURL);
  await page.goto(previewUrl);
  await page.waitForFunction(() => window.__OBJECT_PREVIEW__?.ready === true);

  const allTargets = await page.evaluate(() => window.__OBJECT_PREVIEW__.targets());
  const targets = allTargets
    .filter((target) => (options.kind ? target.kind === options.kind : true))
    .filter((target) => (options.target ? target.id === options.target || target.sourceId === options.target : true))
    .slice(0, options.limit ?? allTargets.length);
  const angles = ANGLES.slice(0, options.angles ?? ANGLES.length);
  const renders = [];

  for (const [targetIndex, target] of targets.entries()) {
    for (let angleIndex = 0; angleIndex < angles.length; angleIndex += 1) {
      const result = await renderWithRetry(page, target.id, angleIndex);
      const fileName = `${String(targetIndex + 1).padStart(4, "0")}-${safeFileName(target.kind)}-${safeFileName(target.sourceId)}-${result.angle}.png`;
      const filePath = path.join(outDir, fileName);
      await writeFile(filePath, Buffer.from(result.dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      renders.push({
        targetId: target.id,
        sourceId: target.sourceId,
        kind: target.kind,
        label: target.label,
        angle: result.angle,
        path: path.relative(process.cwd(), filePath),
        signal: result.signal
      });
    }
    if ((targetIndex + 1) % 25 === 0 || targetIndex === targets.length - 1) {
      console.log(`Rendered ${targetIndex + 1}/${targets.length} targets`);
    }
  }

  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: previewUrl,
        targetCount: targets.length,
        angleCount: angles.length,
        totalRenderCount: renders.length,
        renders
      },
      null,
      2
    )
  );
  await writeFile(path.join(outDir, "gallery.html"), createGalleryHtml(renders));
  await browser.close();
  console.log(`Wrote ${renders.length} PNG renders to ${path.relative(process.cwd(), outDir)}`);
} finally {
  if (server) {
    server.kill("SIGTERM");
  }
  if (staticPreviewDir) {
    await rm(staticPreviewDir, { recursive: true, force: true });
  }
}

async function buildStaticPreview(outDir) {
  await viteBuild({
    base: "./",
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve("object-preview.html")
      }
    }
  });
}

function previewPageUrl(baseURL) {
  return `${baseURL.replace(/\/$/, "")}/object-preview.html`;
}

async function renderWithRetry(page, targetId, angleIndex) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.waitForFunction(() => window.__OBJECT_PREVIEW__?.ready === true);
      return await page.evaluate(
        ({ targetId: renderTargetId, angle }) => window.__OBJECT_PREVIEW__.render(renderTargetId, angle),
        { targetId, angle: angleIndex }
      );
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? error);
      if (!message.includes("Execution context was destroyed") && !message.includes("Target closed") && !message.includes("navigation")) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForFunction(() => window.__OBJECT_PREVIEW__?.ready === true).catch(() => {});
    }
  }
  throw lastError;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") options.out = args[++index];
    else if (arg === "--base-url") options.baseURL = args[++index];
    else if (arg === "--kind") options.kind = args[++index];
    else if (arg === "--target") options.target = args[++index];
    else if (arg === "--limit") options.limit = Number(args[++index]);
    else if (arg === "--angles") options.angles = Number(args[++index]);
  }
  return options;
}

async function ensureServer(baseURL, port) {
  if (await canFetch(baseURL)) {
    return null;
  }
  if (!port) {
    throw new Error(`Preview server is not reachable at ${baseURL}`);
  }
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await canFetch(baseURL)) {
      return server;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  server.kill("SIGTERM");
  throw new Error(`Timed out waiting for Vite preview server at ${baseURL}`);
}

async function canFetch(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function safeFileName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 96);
}

function createGalleryHtml(renders) {
  const cards = renders
    .map((render) => {
      const file = path.basename(render.path);
      return `<figure>
  <img src="./${file}" loading="lazy" alt="${escapeHtml(render.label)} ${render.angle}" />
  <figcaption><b>${escapeHtml(render.kind)}</b> ${escapeHtml(render.sourceId)}<br />${escapeHtml(render.label)}<br />${render.angle} | nonBlank ${render.signal.nonBlank} | varied ${render.signal.varied}</figcaption>
</figure>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Edinburgh Gardens Object Preview Gallery</title>
    <style>
      body { margin: 0; font: 13px/1.4 system-ui, sans-serif; background: #eeece3; color: #17201a; }
      main { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; padding: 12px; }
      figure { margin: 0; background: #faf9f1; border: 1px solid #c9c5b6; }
      img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: #d8d6c8; }
      figcaption { padding: 7px 8px 9px; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main>
${cards}
    </main>
  </body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
