import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";

const nodeCommand = process.execPath;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5481";
const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== "--skip-build");
const skipBuild = process.env.E2E_SKIP_BUILD === "1" || process.argv.includes("--skip-build");

async function runNode(script, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeCommand, [script, ...args], {
      stdio: "inherit",
      ...options
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${script} ${args.join(" ")} exited with ${signal ?? code}`));
      }
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000, abortReason = () => null) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    const reason = abortReason();
    if (reason) {
      throw new Error(reason);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const reason = abortReason();
  if (reason) {
    throw new Error(reason);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "no response"}`);
}

async function isServerAvailable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

if (!skipBuild) {
  await runNode("node_modules/typescript/bin/tsc", ["--noEmit"]);
  await runNode("node_modules/vite/bin/vite.js", ["build"]);
}

if (await isServerAvailable(baseUrl)) {
  throw new Error(`${baseUrl} is already in use. Stop the existing preview server before running e2e.`);
}

const preview = spawn(nodeCommand, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "5481", "--strictPort"], {
  stdio: "inherit",
  env: process.env
});

let previewExited = false;
let previewExit = { code: null, signal: null };
preview.on("exit", (code, signal) => {
  previewExited = true;
  previewExit = { code, signal };
});

try {
  await waitForServer(baseUrl, 30_000, () =>
    previewExited ? `Preview server exited before ${baseUrl} became ready with ${previewExit.signal ?? previewExit.code}` : null
  );
  if (previewExited) {
    throw new Error(`Preview server exited before Playwright started with ${previewExit.signal ?? previewExit.code}`);
  }
  await runNode("node_modules/@playwright/test/cli.js", ["test", ...passthroughArgs], {
    env: {
      ...process.env,
      E2E_BASE_URL: baseUrl,
      PW_SKIP_WEB_SERVER: "1"
    }
  });
} finally {
  if (!previewExited) {
    preview.kill("SIGTERM");
    await once(preview, "exit");
  }
}
