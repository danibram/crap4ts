---
'@danibram/crap4ts': minor
---

v0.6 — hotspots, cognitive complexity, per-path overrides, and three smaller wins.

The headline is **hotspots**: a high CRAP score on code nobody touches is low-priority; the functions that bite are the ones that are risky *and* changing constantly. No other JS-native CLI surfaces that quadrant.

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
