# Performance Checks

Use these checks when changing runtime systems, level geometry, visibility, terrain sampling, AI movement, or the test runner.

## Commands

- `npm run test:run` runs unit tests. Benchmark files are excluded from normal test collection in `vite.config.ts`.
- `npm run perf:bench` runs Vitest benchmarks in `tests/performance.bench.ts`.
- `npm run perf:report` runs the benchmark suite and writes a normalized JSON summary to `test-results/performance/latest-summary.json`.
- `npm run perf:check` runs the unit suite with a compact reporter, then runs `npm run perf:report`.
- `npm run build` runs TypeScript and the Vite production build.

The unit-test config keeps Vitest globals disabled because all tests import `describe`, `it`, `expect` and helpers explicitly. This avoids global API injection overhead during regular test runs.

`test-results/` is gitignored, so benchmark summaries are safe to generate during local iteration. To compare two runs, keep a summary path and use:

```sh
node scripts/performance-report.mjs --compare test-results/performance/baseline-summary.json
```

For CI-style checks, add `--fail-on-regression 20` to fail when a benchmark's mean time is more than 20% slower than the supplied baseline.

## Benchmark Coverage

The benchmark suite covers representative hot paths:

- Terrain height lookups over boundary, path, amenity, spawn, and weapon-spawn points.
- Line-of-sight queries across level obstacles.
- Point visibility checks used by HUD/minimap and AI perception.
- Nearby obstacle-index queries used by movement and collision filtering.
- Dense zombie separation over 128 circular agents.

When comparing runs, use the `hz` and `mean` columns together. Vitest benchmarks are noisy on shared machines, so treat repeated regressions as meaningful rather than a single outlier.

## Runtime Hot Paths

Movement, bike movement, thrown-distraction placement, zombie steering, cover checks and skate-bowl settling should use `ObstacleIndex` rather than scanning `level.obstacles` directly. Visibility and minimap checks should reuse a visibility context within a frame when possible. Terrain sampling should avoid string-keyed per-point cache lookups in frame-time paths.
