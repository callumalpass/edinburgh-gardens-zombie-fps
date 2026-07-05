# Performance Checks

Use these checks when changing runtime systems, level geometry, visibility, terrain sampling, AI movement, or the test runner.

## Commands

- `npm run test:run` runs unit tests. Benchmark files are excluded from normal test collection in `vite.config.ts`.
- `npm run perf:bench` runs Vitest benchmarks in `tests/performance.bench.ts`.
- `npm run perf:check` runs the unit suite with a compact reporter, then runs the benchmark suite with verbose benchmark output.
- `npm run build` runs TypeScript and the Vite production build.

The unit-test config keeps Vitest globals disabled because all tests import `describe`, `it`, `expect` and helpers explicitly. This avoids global API injection overhead during regular test runs.

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
