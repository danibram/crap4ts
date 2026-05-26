---
'@danibram/crap4ts': minor
---

v0.2 — quality-of-life features inspired by [cargo-crap](https://github.com/minikin/cargo-crap):

- **`--missing {pessimistic|optimistic|skip}`** — controls how functions with no coverage data are scored. `pessimistic` (default) treats them as 0%, `optimistic` as 100%, `skip` drops them from the report. Critical for incremental adoption.
- **`--summary`** — print only aggregate stats + worst offender (no per-function table). Friendlier for CI logs.
- **`--min <score>`** — hide rows below the score from the report. Does not affect `--fail-on`.
- **`-o, --output <file>`** — write to file instead of stdout. Required for the upcoming v0.3 baseline workflow.
- **`--allow <glob>`** — parse the file but hide matching functions. Distinct from `--ignore` (which skips parsing altogether). Path globs (contain `/` or `**`) match the file path; function-name globs match the name with `*` not crossing `::` or `.`.
- **Table polish**: status icons (`✗`/`▲`/`✓`) and 10-block coverage bars (`████░░░░░░ 40%`, `░░░░░░░░░░ n/a` for missing).
- **Markdown reporter**: same icons (`🚨`/`⚠️`/`✅`).
- **JSON envelope**: now `{ $schema, version: "1", generatedAt, totals, functions[] }`. `coverage` is `null` (not `0`) when missing. Lays groundwork for `--baseline` in v0.3.
- **Config walk-up**: `crap.config.json` is now found in any ancestor up to the git root.
- **Type change**: `CrapFunction` now has `coverageMissing: boolean`. Consumers of the library API may need to update.
