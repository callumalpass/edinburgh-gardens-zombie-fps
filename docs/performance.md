# Performance Checks

Use these checks when changing runtime systems, level geometry, visibility, terrain sampling, AI movement, or the test runner.

## Commands

- `npm run test:run` runs unit tests with Vitest's compact dot reporter. Benchmark files are excluded from normal test collection in `vite.config.ts`.
- `npm run perf:bench` runs Vitest benchmarks in `tests/performance.bench.ts`.
- `npm run perf:report` runs the benchmark suite and writes a normalized JSON summary to `test-results/performance/latest-summary.json`.
- `npm run perf:check` runs the unit suite with a compact reporter, records its wall-clock duration, then runs the benchmark report.
- `npm run build` runs TypeScript and the Vite production build.

The unit-test config keeps Vitest globals disabled because all tests import `describe`, `it`, `expect` and helpers explicitly. This avoids global API injection overhead during regular test runs.

`test-results/` is gitignored, so benchmark summaries are safe to generate during local iteration. `npm run perf:report` runs `tests/performance.bench.ts` directly to avoid unrelated benchmark discovery; the summary includes the benchmark file, wall-clock benchmark duration, Node version and platform so local comparisons have basic environment context. `npm run perf:check` also includes `testRunDurationMs`, which is the number to watch when test collection or hot helper tests get slower. Use `--bench-file <path>` when adding a separate benchmark file. To compare two runs, keep a summary path and use:

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
- Indexed movement-surface lookups used by player movement, bike movement and stealth.
- The previous linear movement-surface scan as a comparison baseline.
- Dense zombie separation over 128 circular agents.

When comparing runs, use the `hz` and `mean` columns together. Vitest benchmarks are noisy on shared machines, so treat repeated regressions as meaningful rather than a single outlier.

## Runtime Hot Paths

Movement, bike movement, thrown-distraction placement, zombie steering, cover checks and skate-bowl settling should use `ObstacleIndex` rather than scanning `level.obstacles` directly. Player and bike surface checks should use `MovementSurfaceSampler` rather than calling the linear `movementSurfaceAt` helper in frame-time paths. Compact bounded spatial grids should use `gridCellKey` where benchmarks show it beats nested map buckets. Visibility and minimap checks should reuse a visibility context within a frame when possible. Terrain sampling should avoid string-keyed per-point cache lookups in frame-time paths.

## Runtime Rendering Budget

The renderer uses high, medium and low quality tiers with hysteresis rather than reacting to isolated frame spikes. The tiers cap device pixel ratio and progressively reduce grass instances, visible low-mist banks, shadow-map resolution, shadow coverage and ink strength. Sustained slow frames step down faster than sustained fast frames step up, preventing quality oscillation.

Static trees are grouped into 72-metre spatial chunks so Three.js can reject whole areas instead of treating each material batch as park-wide, without multiplying draw submissions across excessively small cells. Full trunks, branches and canopy masses share semantic materials and retain their colour variation through `instanceColor`. Beyond the quality tier's full-detail radius, each tree collapses to one five-sided trunk and one icosahedron canopy; chunks beyond the render radius are hidden. Only full-detail tree chunks cast directional shadows.

Dynamic zombie rigs share immutable geometry, materials and animation clips per archetype. Conservative skinned-mesh bounds restore frustum culling. Quality-tier distance budgets keep the full rig nearby, replace it with one of five silhouette-preserving instanced character batches at medium range, and hide it beyond the render radius. Each medium-distance archetype retains a coloured head, torso, reaching arms, separate legs and its characteristic proportions; crawlers keep their low four-limbed stance. Directional shadows stop before the full-detail boundary while the single instanced painted contact-shadow batch remains available for rendered zombies. Animation work pauses outside the full-detail tier, and gameplay simulation steps at 15 Hz in the far-LOD tier and 6 Hz outside the render radius. Crowd separation runs at 30 Hz and excludes zombies beyond the rendered crowd radius.

The game test snapshot exposes `renderQuality`, `renderPixelRatio`, `rendererCalls` and `rendererTriangles` for headed or Playwright profiling. These values describe the most recently completed frame. Compare the same camera position, weather, quality tier and active-zombie count when using them as a regression signal.
