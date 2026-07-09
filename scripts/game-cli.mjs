#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import readline from "node:readline/promises";
import { chromium } from "@playwright/test";

const DEFAULT_GAME_URL = "http://127.0.0.1:5480/?smoke=1";
const DEFAULT_TIMEOUT_MS = 60_000;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.help) {
    printUsage();
    return;
  }
  if (!parsed.command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const server = await ensureGameServer(parsed.url, parsed);
  let browser;
  try {
    browser = await chromium.launch({
      headless: !parsed.headed,
      args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"]
    });
    const page = await browser.newPage({ viewport: parsed.viewport });
    page.setDefaultTimeout(parsed.timeoutMs);
    await page.goto(parsed.url, { waitUntil: "domcontentloaded", timeout: parsed.timeoutMs });
    await waitForGameBridge(page, parsed.timeoutMs);

    if (parsed.command === "repl") {
      await runRepl(page, parsed);
    } else {
      const result = await runCliCommand(page, parsed.command, parsed.commandArgs);
      printResult(result, parsed.json);
    }

    if (parsed.keepOpen) {
      await waitForInterrupt("Browser is still open. Press Ctrl+C to exit.");
    }
  } finally {
    if (browser && !parsed.keepOpen) {
      await browser.close();
    }
    await stopServer(server);
  }
}

function parseCli(argv) {
  const parsed = {
    command: "",
    commandArgs: [],
    url: process.env.EGAME_URL || DEFAULT_GAME_URL,
    headed: false,
    keepOpen: false,
    json: true,
    noServer: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    viewport: { width: 1280, height: 800 },
    help: false
  };

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      index += 1;
      continue;
    }
    if (!arg.startsWith("--")) {
      break;
    }
    if (arg === "--headed") {
      parsed.headed = true;
      index += 1;
      continue;
    }
    if (arg === "--keep-open") {
      parsed.keepOpen = true;
      parsed.headed = true;
      index += 1;
      continue;
    }
    if (arg === "--pretty") {
      parsed.json = false;
      index += 1;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      index += 1;
      continue;
    }
    if (arg === "--no-server") {
      parsed.noServer = true;
      index += 1;
      continue;
    }
    if (arg === "--url") {
      parsed.url = requiredOptionValue(argv, index, "--url");
      index += 2;
      continue;
    }
    if (arg === "--timeout") {
      parsed.timeoutMs = parsePositiveInteger(requiredOptionValue(argv, index, "--timeout"), "--timeout");
      index += 2;
      continue;
    }
    if (arg === "--viewport") {
      parsed.viewport = parseViewport(requiredOptionValue(argv, index, "--viewport"));
      index += 2;
      continue;
    }
    throw new Error(`Unknown option ${arg}. Put command arguments after the command, using name=value when needed.`);
  }

  parsed.command = argv[index] ?? "";
  parsed.commandArgs = argv.slice(index + 1);
  return parsed;
}

function requiredOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) {
    throw new Error("--viewport must use WIDTHxHEIGHT, for example 1440x900.");
  }
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

async function ensureGameServer(url, options) {
  const origin = new URL(url).origin;
  if (await isServerAvailable(origin)) {
    return null;
  }
  if (options.noServer) {
    throw new Error(`${origin} is not available and --no-server was set.`);
  }

  const gameUrl = new URL(url);
  const vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host",
    gameUrl.hostname,
    "--port",
    gameUrl.port || "5480",
    "--strictPort"
  ], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  vite.stdout.on("data", (chunk) => process.stderr.write(chunk));
  vite.stderr.on("data", (chunk) => process.stderr.write(chunk));

  let exited = false;
  let exitStatus = null;
  vite.on("exit", (code, signal) => {
    exited = true;
    exitStatus = signal ?? code;
  });

  const started = Date.now();
  let lastError;
  while (Date.now() - started < options.timeoutMs) {
    if (exited) {
      throw new Error(`Vite exited before ${origin} became ready with ${exitStatus}.`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok) {
        return vite;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }

  vite.kill("SIGTERM");
  throw new Error(`Timed out waiting for ${origin}: ${lastError?.message ?? "no response"}`);
}

async function isServerAvailable(origin) {
  try {
    const response = await fetch(origin);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForGameBridge(page, timeoutMs) {
  await page.waitForFunction(() => window.__EGAME_TOOLS__?.ready === true, null, { timeout: timeoutMs });
}

async function runCliCommand(page, command, rawArgs) {
  if (command === "list") {
    return page.evaluate(() => window.__EGAME_TOOLS__.listCommands());
  }
  if (command === "screenshot") {
    const path = rawArgs[0] || "game-cli-screenshot.png";
    await page.screenshot({ path, fullPage: false });
    return { path };
  }
  return runBridgeCommand(page, command, parseCommandArgs(rawArgs));
}

async function runBridgeCommand(page, command, args) {
  return page.evaluate(async ({ command: commandName, args: commandArgs }) => {
    const bridge = window.__EGAME_TOOLS__;
    if (!bridge) {
      throw new Error("Game tool bridge is not installed.");
    }
    return bridge.runCommand(commandName, commandArgs);
  }, { command, args });
}

function parseCommandArgs(rawArgs) {
  if (rawArgs.length === 0) {
    return undefined;
  }
  if (rawArgs.some((arg) => arg.includes("="))) {
    const objectArgs = {};
    for (const rawArg of rawArgs) {
      const splitAt = rawArg.indexOf("=");
      if (splitAt < 0) {
        objectArgs[rawArg] = true;
      } else {
        objectArgs[rawArg.slice(0, splitAt)] = parseValue(rawArg.slice(splitAt + 1));
      }
    }
    return objectArgs;
  }
  return rawArgs.map(parseValue);
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    return JSON.parse(value);
  }
  return value;
}

async function runRepl(page, options) {
  console.error("Connected. Type list, snapshot, screenshot <path>, or any game command. Type exit to quit.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const line = (await rl.question("egame> ")).trim();
      if (!line) {
        continue;
      }
      if (line === "exit" || line === "quit") {
        return;
      }
      if (line === "help") {
        printUsage();
        continue;
      }
      try {
        const [command, ...args] = tokenize(line);
        const result = await runCliCommand(page, command, args);
        printResult(result, options.json);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    rl.close();
  }
}

function tokenize(line) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(line))) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (Array.isArray(result)) {
    for (const item of result) {
      console.log(typeof item === "string" ? item : JSON.stringify(item));
    }
    return;
  }
  if (result && typeof result === "object") {
    for (const [key, value] of Object.entries(result)) {
      console.log(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
    }
    return;
  }
  console.log(String(result));
}

async function waitForInterrupt(message) {
  console.error(message);
  await new Promise(() => {});
}

async function stopServer(server) {
  if (!server) {
    return;
  }
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }
  server.kill("SIGTERM");
  await once(server, "exit");
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function printUsage() {
  console.log(`Usage:
  npm run game:cli -- [options] <command> [args...]

Options must come before the command.
  --url <url>          Game URL. Default: ${DEFAULT_GAME_URL}
  --headed             Show the controlled browser.
  --keep-open          Keep the headed browser open after the command.
  --no-server          Require an already-running game server.
  --timeout <ms>       Startup timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --viewport <WxH>     Browser viewport. Default: 1280x800
  --pretty             Print simple text instead of formatted JSON.

Commands:
  list
  repl
  screenshot [path]
  snapshot
  spawn [count]
  teleport x=<x> z=<z> [yaw=<radians>] [pitch=<radians>]
  key <KeyboardEvent.code> [durationMs]
  weapon <weaponId>
  interact [fixtureId]
  amenity [kind]

Examples:
  npm run game:cli -- snapshot
  npm run game:cli -- spawn 5
  npm run game:cli -- teleport x=0 z=0
  npm run game:cli -- --headed repl
`);
}
