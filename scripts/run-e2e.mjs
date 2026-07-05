import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";

const nodeCommand = process.execPath;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5481";

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

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
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

await runNode("node_modules/typescript/bin/tsc", ["--noEmit"]);
await runNode("node_modules/vite/bin/vite.js", ["build"]);

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
  await waitForServer(baseUrl);
  if (previewExited) {
    throw new Error(`Preview server exited before Playwright started with ${previewExit.signal ?? previewExit.code}`);
  }
  await runNode("node_modules/@playwright/test/cli.js", ["test", ...process.argv.slice(2)], {
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
