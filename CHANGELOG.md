# @danibram/crap4ts

## 0.6.0

### Minor Changes

- 43b4e50: v0.6 — hotspots, cognitive complexity, per-path overrides, and three smaller wins.

  The headline is **hotspots**: a high CRAP score on code nobody touches is low-priority; the functions that bite are the ones that are risky _and_ changing constantly. No other JS-native CLI surfaces that quadrant.

  - **`--hotspots --since <window>`** — ranks by CRAP × git churn (commits touching the file in the window). One `git log` builds the file→commit-count map. New `HOT` and `CHURN` columns; `--since` accepts `90d` / `6w` / `3m` / `1y` / any git date (default `90d`). Degrades to churn 0 outside a git repo. New `churn` / `hotspot` fields in the JSON envelope.
  - **`--complexity cognitive`** — feed the CRAP formula with cognitive complexity (SonarSource algorithm: nesting-weighted, flat else/else-if, boolean-sequence aware, switch counted once) instead of cyclomatic. A crap4ts extension; the chosen metric is recorded as `complexityMetric` in JSON. Default stays `cyclomatic`.
  - **Per-path overrides** — `overrides: [{ paths, threshold?, failOn? }]` in `crap.config.json`, last-match-wins (ESLint semantics). Relax the gate for `legacy/**` without raising the global bar; `failOn: null` clears the gate for generated paths. Applied consistently to the report, SARIF levels, and the CI gate.
  - **`crap4ts merge-coverage <glob...> [-o file]`** — combine per-package istanbul/v8 coverage (summing statement hits) so monorepos with per-package test output can feed a single merged file to `--workspace`.
  - **`--reporter eslint`** — emit the ESLint JSON format for reviewdog and other ESLint-aware tooling.
  - **In-source suppression** — `/* crap4ts-disable-next-function */` skips one function; `/* crap4ts-disable-file */` skips the whole file. Surgical, review-visible alternatives to `--allow`.

  **Behavioural changes worth noting:**

  - **Method names are now class-qualified** (`UserService.validate` instead of `validate`). This makes reports readable and stops two same-named methods in one file from colliding in the `--baseline` diff. One-time churn: the first v0.6 diff against a pre-v0.6 baseline will show methods as removed+new as the names change. Regenerate your baseline after upgrading.
  - **Invalid flag values now exit 2** (was: uncaught throw → exit 1) — `--complexity`, `--reporter`, `--threshold`, etc. now report a clean error consistent with the parse-error path.

  Internal: new `src/core/cognitive.ts`, `src/core/churn.ts`, `src/core/thresholds.ts`, `src/mergeCoverage.ts`, `src/reporters/eslint.ts`. `CrapFunction` gains optional `churn` / `hotspot`; `AnalyseResult` gains `complexityMetric` / `churnSince`. JSON Schema updated.

## 0.5.1

### Patch Changes

- 2e91d3f: `crap4ts init --workflow` now exits 2 when `.github/workflows/crap.yml` already exists and `--force` was not passed. The previous behaviour was to warn and exit 0, which silently kept the user's old workflow — exactly the kind of surprise that bites later when CI doesn't match the freshly-published template. The config file (`crap.config.json`) was already handled this way; this aligns the workflow path with that contract.

  If you scripted around `init` expecting a successful exit when a workflow file existed, add `--force` to overwrite it, or check for the file before running `init`.

## 0.5.0

### Minor Changes

- acc3ac9: v0.5 — `crap4ts init`, monorepo workspaces, published JSON Schema.

  The "make it stupid easy to adopt" release. Bundles three threads we were tracking separately (0.4.1 schema patch, 0.5 adoption, 0.6 monorepo) into one minor — they share the same delivery story so they ship together.

  - **`crap4ts init [--workflow]`** — non-interactive scaffolder. Detects vitest / jest / bun test from devDependencies, writes `crap.config.json` with sensible defaults, and (with `--workflow`) drops a baseline-aware GitHub Action that does PR-comment + SARIF upload + regression gating in one go. Removes the "which paths do I pass, which coverage path, which workflow steps" friction wall that kept the tool off projects' radar.
  - **`--workspace`** — auto-detects `pnpm-workspace.yaml` or `package.json#workspaces` (npm/yarn/bun flat-array AND yarn-nested shapes), expands the scan to every package, and tags each function with its package label. Override the auto-detected config with `--workspace-config <path>`. Minimal YAML parser inline — no new deps.
  - **`--report-by package`** — groups the table/markdown report by workspace package, sorted worst-package-first. The lens monorepo maintainers actually use.
  - **`schemas/report-v1.json`** — JSON Schema for the `--reporter json` envelope, published from the repo and embedded in the npm package (`files: ["schemas"]`). The `$schema` URL we've been emitting since v0.3 is no longer a 404. Stable contract for `--baseline` diffing across crap4ts versions and for third-party consumers.
  - **README rewritten as a landing.** Lead with "doesn't ask you to fix legacy — just stops you from making things worse" and surface the 5 Demo PRs upfront. The original technical sections remain.

  Internal: new `src/init.ts`, new `src/core/workspace.ts` with `discoverWorkspace` + `resolvePackageForFile` (exported for library consumers). `CrapFunction` gains optional `package?: string`. Backward-compatible additions only.

## 0.4.0

### Minor Changes

- 9f97fc1: v0.4 — monorepo path normalization, SARIF reporter, .gitignore support.

  The two-pronged headline: fixes silent 0%-coverage failures in monorepos and surfaces high-CRAP code in GitHub Code Scanning.

  - **Path normalization (two-level matching)**: coverage providers now index absolute report paths in an `O(1)` map and relative paths in a basename-bucketed component-suffix index. Component boundaries — never byte boundaries — so `foo/bar.ts` cannot accidentally match `oofoo/bar.ts`. Fixes the case where the coverage tool ran in `packages/foo/` and emitted `src/widget.ts` but crap4ts was invoked from the monorepo root.
  - **`--reporter sarif`**: new SARIF 2.1.0 reporter for GitHub Code Scanning, VS Code SARIF viewer, and any other SARIF-aware tooling. Two rules (`crap4ts/threshold` → warning, `crap4ts/fail-on` → error) plus `partialFingerprints` so re-runs don't duplicate findings.
  - **.gitignore support**: the walker now reads the nearest `.gitignore` (walked up from the first scan path) and folds its patterns into the ignore list. Comments, blanks, dir-only patterns, and basename-anywhere patterns are all supported. Negation (`!foo`) and nested `.gitignore` files deeper in the tree are not yet honoured — known limitation, called out in the README.
  - New `examples/demo.ts` fixture used by the `Demo - *` PRs to showcase each diff scenario live on the repo.

  Internal: new `src/coverage/pathIndex.ts` reusable across both JSON and LCOV providers; new `src/core/gitignore.ts` parser; SARIF rendering passes the crap4ts package version through `ReporterContext.toolVersion` so the SARIF envelope carries the real version (no more hard-coded strings).

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
