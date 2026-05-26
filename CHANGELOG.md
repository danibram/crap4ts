# @danibram/crap4ts

## 0.3.0

### Minor Changes

- ed35852: v0.3 — baseline diff + PR-bot comment.

  The "don't make it worse" workflow: persist a JSON report from `main`, then on every PR diff against it. Regressions and new functions surface in the table with a Δ column; unchanged hot-spots stay out of the way. Tractable adoption for repos with existing high-CRAP code.

  - **`--baseline <file>`** — compare against a previously emitted JSON report. Classifies each function as `new` / `moved` / `regressed` / `improved` / `unchanged` / `removed` and adds a `Δ` column to the table and markdown reporters.
  - **`--fail-regression`** — exit 1 when any function regressed beyond `--epsilon`. Requires `--baseline`.
  - **`--epsilon <n>`** (default `0.01`) — tolerance band for "no change". Absorbs the sub-percent CRAP jitter that coverage tools introduce between runs.
  - **Move detection** — functions matched primarily by `file::name`; leftovers paired by body hash so refactors that move code around aren't reported as a wall of `new` + `removed` pairs.
  - **`--reporter pr-comment`** — opinionated PR-bot comment with a sticky `<!-- crap4ts-report -->` marker. Main table = regressions + new; improvements, existing hot-spots, and moves collapse into `<details>`. Degrades to top offenders when no baseline is supplied.
  - **JSON envelope additions** — each function now carries a `hash` field (sha256-16) used for move detection. When `--baseline` is supplied the envelope gains a top-level `diff` block with the summary and per-entry classifications.

  JSON schema version is still `1` — the additions are backward-compatible. Older v0.2 reports load as baselines just fine, with the caveat that they don't include `hash`, so move detection silently falls back to file+name matching.

## 0.2.0

### Minor Changes

- 54fc939: v0.2 — quality-of-life features inspired by [cargo-crap](https://github.com/minikin/cargo-crap):

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
