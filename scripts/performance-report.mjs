#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_OUTPUT = "test-results/performance/latest-summary.json";
const DEFAULT_RAW_OUTPUT = "test-results/performance/latest-vitest-bench.json";

const options = parseArgs(process.argv.slice(2));
const outputPath = resolve(options.output ?? DEFAULT_OUTPUT);
const rawOutputPath = resolve(options.rawOutput ?? DEFAULT_RAW_OUTPUT);

if (!options.fromJson) {
  mkdirSync(dirname(rawOutputPath), { recursive: true });
  rmSync(rawOutputPath, { force: true });
  const vitestBin = existsSync("node_modules/.bin/vitest") ? "node_modules/.bin/vitest" : "npx";
  const vitestArgs =
    vitestBin === "npx"
      ? ["vitest", "bench", "--run", "--reporter=verbose", "--outputJson", rawOutputPath]
      : ["bench", "--run", "--reporter=verbose", "--outputJson", rawOutputPath];
  const result = spawnSync(vitestBin, vitestArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const rawReportPath = resolve(options.fromJson ?? rawOutputPath);
const rawReport = JSON.parse(readFileSync(rawReportPath, "utf8"));
const summary = summarizeBenchmarks(rawReport, rawReportPath);
const comparison = options.compare ? compareSummaries(summary, JSON.parse(readFileSync(resolve(options.compare), "utf8"))) : [];

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ ...summary, comparison }, null, 2)}\n`);
printSummary(summary, comparison, outputPath);

if (options.failOnRegression !== undefined) {
  const regressions = comparison.filter((row) => row.meanChangePercent > options.failOnRegression);
  if (regressions.length > 0) {
    console.error(
      `Performance regression threshold exceeded: ${regressions
        .map((row) => `${row.name} +${row.meanChangePercent.toFixed(1)}% mean`)
        .join(", ")}`
    );
    process.exit(1);
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output") {
      parsed.output = args[++index];
    } else if (arg === "--raw-output") {
      parsed.rawOutput = args[++index];
    } else if (arg === "--from-json") {
      parsed.fromJson = args[++index];
    } else if (arg === "--compare") {
      parsed.compare = args[++index];
    } else if (arg === "--fail-on-regression") {
      parsed.failOnRegression = Number(args[++index]);
      if (!Number.isFinite(parsed.failOnRegression) || parsed.failOnRegression < 0) {
        throw new Error("--fail-on-regression expects a non-negative percentage");
      }
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function summarizeBenchmarks(report, rawReportPath) {
  const benchmarks = [];
  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const benchmark of group.benchmarks ?? []) {
        benchmarks.push({
          file: relativePath(file.filepath),
          group: group.fullName,
          name: benchmark.name,
          hz: round(benchmark.hz, 2),
          meanMs: round(benchmark.mean, 6),
          minMs: round(benchmark.min, 6),
          p75Ms: round(benchmark.p75, 6),
          p99Ms: round(benchmark.p99, 6),
          rmePercent: round(benchmark.rme, 3),
          samples: benchmark.sampleCount
        });
      }
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    rawReport: relativePath(rawReportPath),
    benchmarkCount: benchmarks.length,
    benchmarks
  };
}

function compareSummaries(current, baseline) {
  const baselineByName = new Map((baseline.benchmarks ?? []).map((benchmark) => [benchmark.name, benchmark]));
  return current.benchmarks.flatMap((benchmark) => {
    const previous = baselineByName.get(benchmark.name);
    if (!previous) {
      return [];
    }
    return {
      name: benchmark.name,
      meanChangePercent: round(((benchmark.meanMs - previous.meanMs) / previous.meanMs) * 100, 3),
      hzChangePercent: round(((benchmark.hz - previous.hz) / previous.hz) * 100, 3),
      currentMeanMs: benchmark.meanMs,
      baselineMeanMs: previous.meanMs,
      currentHz: benchmark.hz,
      baselineHz: previous.hz
    };
  });
}

function printSummary(summary, comparison, outputPath) {
  console.log(`\nPerformance summary written to ${relativePath(outputPath)}`);
  console.log("Benchmark                                      mean ms      hz        p99 ms   rme");
  console.log("--------------------------------------------------------------------------------");
  for (const benchmark of summary.benchmarks) {
    console.log(
      `${benchmark.name.padEnd(45).slice(0, 45)} ${String(benchmark.meanMs).padStart(8)} ${String(benchmark.hz).padStart(9)} ${String(
        benchmark.p99Ms
      ).padStart(9)} ${String(benchmark.rmePercent).padStart(5)}%`
    );
  }

  if (comparison.length > 0) {
    console.log("\nCompared with baseline");
    for (const row of comparison) {
      const meanPrefix = row.meanChangePercent > 0 ? "+" : "";
      const hzPrefix = row.hzChangePercent > 0 ? "+" : "";
      console.log(`${row.name}: mean ${meanPrefix}${row.meanChangePercent}% | hz ${hzPrefix}${row.hzChangePercent}%`);
    }
  }
}

function printHelp() {
  console.log(`Usage: node scripts/performance-report.mjs [options]

Options:
  --output <path>              Summary JSON path. Defaults to ${DEFAULT_OUTPUT}
  --raw-output <path>          Raw Vitest benchmark JSON path. Defaults to ${DEFAULT_RAW_OUTPUT}
  --from-json <path>           Summarize an existing Vitest benchmark JSON file instead of running benchmarks
  --compare <path>             Compare against a previous summary JSON
  --fail-on-regression <pct>   Exit non-zero when mean time regresses by more than this percentage
`);
}

function relativePath(path) {
  return path.startsWith(process.cwd()) ? path.slice(process.cwd().length + 1) : path;
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
