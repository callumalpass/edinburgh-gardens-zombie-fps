# Agent Instructions

## Research Notes

When a change depends on external research, record the research in the repo before finishing the task.

- Add or update a committed note under `docs/research/` describing the finding, the source URLs, and how the evidence was translated into the game.
- Update `docs/edinburgh-gardens-research.md` when the research changes the project's overall source inventory or implementation summary.
- Register new committed research notes and source URLs in `docs/research/research-manifest.json`.
- Keep raw downloaded artifacts under `docs/research/raw/` using a dated subfolder and source-oriented names. This path is intentionally gitignored; keep useful raw JSON/PDF/API responses locally without committing them by default.
- Document raw artifact patterns and validation commands in `docs/research/raw-assets.md` when adding a new raw-data source family.
- Run `npm run research:check` after adding or refreshing research notes or manifest entries.

Prefer primary sources where possible. If exact public geometry or measurements are unavailable, state the uncertainty in the research note and in nearby implementation comments or source metadata.
