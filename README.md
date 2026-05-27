# crap4ts

> **A code-quality gate that you can actually ship.**
> Doesn't ask you to fix legacy — just stops you from making things worse.

[![npm version](https://img.shields.io/npm/v/@danibram/crap4ts.svg)](https://www.npmjs.com/package/@danibram/crap4ts)
[![license](https://img.shields.io/npm/l/@danibram/crap4ts.svg)](./LICENSE)

The hardest sell of any code-quality tool is _"we already have 14 000 findings from the last linter we tried, are you really asking me to fix them all before I can merge?"_. crap4ts says: **no**.

It computes the C.R.A.P. score — McCabe complexity weighted by test coverage — for every function in your TypeScript / JavaScript codebase, then diffs your branch against a baseline from `main`. CI fails only when this PR makes things measurably worse. Legacy hot-spots stay visible in the report but never block a merge.

```text
CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)
```

The original metric was proposed by Alberto Savoia & Bob Evans in 2007 ([Pardon My French, But This Code Is C.R.A.P.](https://web.archive.org/web/20200529220442/https://www.artima.com/weblogs/viewpost.jsp?thread=210575)). crap4ts brings it to the TypeScript ecosystem with first-class support for vitest, jest, bun test, and any LCOV-emitting tool.

## Live examples

Open PRs against this repo, each exercising one scenario for the bot to comment on. Click any of them to see the actual sticky comment plus the Code Scanning annotations the bot posts.

### Diff scenarios

| PR | What it shows |
|----|---------------|
| [#1 Demo - Clear regression on existing function](https://github.com/danibram/crap4ts/pull/1) | `processOrder` regresses, `--fail-regression` exits 1 |
| [#2 Demo - New high-CRAP function added](https://github.com/danibram/crap4ts/pull/2) | New `validateInvoice` flagged as **NEW**, legacy stays out of the way |
| [#3 Demo - Refactor that improves CRAP](https://github.com/danibram/crap4ts/pull/3) | `processOrder` split into helpers, large negative Δ, ✅ verdict |
| [#4 Demo - Pure move/rename detection](https://github.com/danibram/crap4ts/pull/4) | `git mv` reports as **moved**, not new+removed |
| [#7 Demo - SARIF upload to Code Scanning](https://github.com/danibram/crap4ts/pull/7) | Sticky comment **and** inline error annotations in the PR diff |

### Monorepo layouts

Each of these PRs adds a self-contained fixture under `examples/monorepos/` and a README inside the fixture showing the run command + expected per-package output.

| PR | Workspace config | Fixture |
|----|------------------|---------|
| [#9 Demo - Monorepo (pnpm-workspace.yaml)](https://github.com/danibram/crap4ts/pull/9) | `pnpm-workspace.yaml` | `examples/monorepos/pnpm/` |
| [#10 Demo - Monorepo (package.json#workspaces)](https://github.com/danibram/crap4ts/pull/10) | `package.json#workspaces` (bun / yarn / npm) | `examples/monorepos/npm/` |
| [#11 Demo - Monorepo (Turbo)](https://github.com/danibram/crap4ts/pull/11) | `turbo.json` + `pnpm-workspace.yaml` | `examples/monorepos/turbo/` |

### v0.6 features

| PR | What it shows | Fixture |
|----|---------------|---------|
| [#14 Demo - v0.6 features](https://github.com/danibram/crap4ts/pull/14) | Cognitive complexity, in-source disable comments, per-path overrides, hotspots | `examples/v06/` |

## 30-second setup

```bash
cd my-project
bunx @danibram/crap4ts init --workflow
git add crap.config.json .github/workflows/crap.yml
git commit -m "ci: gate on CRAP regressions" && git push
```

`crap4ts init` detects your test runner (vitest / jest / bun test), writes `crap.config.json` with sensible defaults, and drops a baseline-aware GitHub workflow that:

- builds a baseline from `main` on every PR
- posts a sticky bot comment under each PR with the diff
- uploads SARIF to Code Scanning (inline annotations + Security tab)
- exits non-zero when any function regressed

That's it. No yaml-archaeology, no "which path should I scan", no copy-pasting from this README.

## Manual quick start

```bash
# Without coverage data — pure complexity ranking
crap4ts src/

# With vitest v8 coverage
crap4ts src/ --coverage coverage/coverage-final.json

# Fail CI when any function exceeds CRAP 50
crap4ts src/ --coverage coverage/coverage-final.json --fail-on 50

# Markdown for PR comments
crap4ts src/ --reporter markdown > crap-report.md

# GitHub Actions inline annotations
crap4ts src/ --reporter github

# Compare a PR against a baseline from main and fail on regressions
crap4ts src/ --baseline crap-main.json --fail-regression

# Opinionated PR-bot comment (sticky marker for in-place updates)
crap4ts src/ --baseline crap-main.json --reporter pr-comment > comment.md

# Monorepo overview, grouped by package
crap4ts --workspace --report-by package

# Hotspots: rank by CRAP × git churn (risky AND frequently-changed)
crap4ts --hotspots --since 90d

# Cognitive complexity instead of cyclomatic (nesting-weighted)
crap4ts --complexity cognitive

# Merge per-package coverage before scanning a monorepo
crap4ts merge-coverage 'packages/*/coverage/coverage-final.json' -o merged.json
```

## Output

```text
Scanned 261 files. 910 functions analysed.
Coverage: v8 (coverage/coverage-final.json)
Above threshold (CRAP > 30): 133 (14.6%)

    CRAP  COMP  COVERAGE          LOCATION                            FUNCTION
─  ─────  ────  ────────────────  ──────────────────────────────────  ───────────────────────
▲ 2070.0    45  ░░░░░░░░░░    0%  src/billing/excel-validator.ts:108  validateBillingCostItem
▲ 1406.0    37  ░░░░░░░░░░    0%  src/billing/periods-feature.ts:84   getUnifiedPeriodsRows
✓   18.0    18  ██████████  100%  src/config.ts:56                    mergeConfig
 ...
```

Status icons: `✗` exceeds `--fail-on`, `▲` exceeds `--threshold`, `✓` clean.

## Reporters

| Reporter     | Use for                                           |
|--------------|---------------------------------------------------|
| `table`      | Default — aligned columns in the terminal         |
| `json`       | Machine-readable output (CI scripts, dashboards)  |
| `markdown`   | PR body / GitHub issue (GFM table)                |
| `github`     | `::warning::` / `::error::` annotations for PRs   |
| `pr-comment` | Opinionated PR-bot comment with sticky marker     |
| `sarif`      | SARIF 2.1.0 → GitHub Code Scanning / VS Code      |
| `eslint`     | ESLint JSON → reviewdog & ESLint-aware tooling    |

## Hotspots (v0.6)

A high CRAP score on a function nobody touches is low-priority — you're not going to break it because you're not editing it. The functions that actually bite are the ones that are **both risky and changing constantly**. That's the hotspot quadrant.

```bash
crap4ts --hotspots --since 90d
```

```text
Scanned 25 files. 175 functions analysed.
Hotspots: CRAP × commits since 90 days ago (HOT column, sorted).

     CRAP   HOT  CHURN  COMP  COVERAGE       LOCATION              FUNCTION
─  ──────  ────  ─────  ────  ─────────────  ────────────────────  ───────────────
▲   756.0  6804      9    27  ░░░░░░░░░░ n/a  src/cli.ts:387        buildCliConfig
▲  1560.0  6240      4    39  ░░░░░░░░░░ n/a  src/config.ts:137     mergeConfig
▲   650.0  5850      9    25  ░░░░░░░░░░ n/a  src/cli.ts:141        run
```

`HOT = CRAP × CHURN`, where churn is the number of commits touching the file in the window. Note how `buildCliConfig` (9 commits) outranks `mergeConfig` despite a lower raw CRAP — it's edited more than twice as often, so it's the riskier place to be. `--since` accepts `90d`, `6w`, `3m`, `1y`, or any git date expression (default `90d`). Outside a git repo, churn degrades to 0 (no crash).

## Cognitive complexity (v0.6)

The classic CRAP metric uses cyclomatic complexity, which counts independent paths but treats a flat `switch` the same as a deeply-nested pile of `if`s. [Cognitive complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) (the metric Biome and SonarJS moved to) weights nesting and reads closer to "how hard is this for a human to follow":

```bash
crap4ts --complexity cognitive
```

- Nesting is penalised: an `if` inside two loops costs more than a top-level one.
- `else` / `else if` are flat (+1, no nesting penalty).
- A boolean run counts once (`a && b && c` = +1); alternating operators add more (`a && b || c` = +2).
- `switch` is +1 total, not once-per-case.

This is a crap4ts extension — canonical CRAP is defined over cyclomatic — but cognitive tracks perceived risk better for deeply nested code. Recursion's +1 isn't modelled yet. The chosen metric is recorded as `complexityMetric` in the JSON envelope.

## Suppressing functions

Three levels, increasingly surgical:

| Mechanism | Scope | Where |
|-----------|-------|-------|
| `--ignore <glob>` | File not parsed at all | CLI / config |
| `--allow <glob>` | File parsed, function hidden from report | CLI / config |
| `/* crap4ts-disable-next-function */` | One function | In source |
| `/* crap4ts-disable-file */` | Whole file | In source (near top) |

```ts
/* crap4ts-disable-next-function */
export function generatedMonster(/* ... */) { /* gnarly but generated */ }
```

The in-source comments are the surgical option — they live next to the code they exempt, so the exemption is visible in review and travels with the file.

## Configuration

`crap4ts` reads `crap.config.json` walking up from the current working directory to the nearest git root (or filesystem root). Falls back to a `crap` section in `package.json` (cwd only). CLI flags always override the config file.

```json
{
  "include": ["src/**/*.ts"],
  "ignore": ["src/legacy/**", "**/*.gen.ts"],
  "allow": ["generated/**", "render*"],
  "threshold": 30,
  "failOn": 100,
  "missing": "pessimistic",
  "min": 10,
  "reporter": "table",
  "top": 50,
  "summary": false,
  "coverage": "./coverage/coverage-final.json",
  "coverageFormat": "auto",
  "tsconfig": "./tsconfig.json",
  "baseline": "./crap-main.json",
  "failRegression": true,
  "epsilon": 0.01,
  "complexity": "cyclomatic",
  "overrides": [
    { "paths": "legacy/**", "threshold": 200, "failOn": 500 },
    { "paths": ["src/generated/**", "**/*.gen.ts"], "failOn": null }
  ]
}
```

### Per-path overrides

`overrides` lets you relax (or tighten) the gate for specific paths without raising the global bar — the key to adopting crap4ts on a codebase that already has high-CRAP corners. Each entry matches by glob and overrides `threshold` and/or `failOn` for files it matches. Resolution is **last-match-wins** (ESLint `overrides` semantics): later entries beat earlier ones. `"failOn": null` explicitly clears the gate for those paths (distinct from omitting it, which inherits the global). So in the example above: `legacy/**` may reach CRAP 500 before failing, generated files never fail the gate, and everything else holds the line at the global `failOn: 100`.

### CLI flags

#### Filtering

| Flag                          | Default | Description                                                                                         |
|-------------------------------|---------|-----------------------------------------------------------------------------------------------------|
| `-i, --ignore <glob>`         | _none_  | Skip files at walk time (repeatable, **not parsed**).                                              |
| `--allow <glob>`              | _none_  | Parse the file but hide matching functions. Path glob if it contains `/` or `**`; otherwise matches the function name (`*` doesn't cross `::` or `.`). |
| `--min <score>`               | _none_  | Hide rows below this score from the report. Does **not** affect `--fail-on`.                       |
| `--top <n>`                   | `50`    | Show only the N worst offenders.                                                                    |

#### Thresholds

| Flag                          | Default | Description                                                |
|-------------------------------|---------|------------------------------------------------------------|
| `-t, --threshold <n>`         | `30`    | Score above which a function is flagged.                   |
| `--fail-on <n>`               | _none_  | Exit code 1 if any function exceeds this value.            |

#### Coverage

| Flag                          | Default       | Description                                                            |
|-------------------------------|---------------|------------------------------------------------------------------------|
| `-c, --coverage <file>`       | _none_        | Path to coverage report.                                               |
| `--coverage-format <fmt>`     | `auto`        | `auto` \| `v8` \| `istanbul` \| `lcov`                                  |
| `--missing <policy>`          | `pessimistic` | How to score functions with no coverage data: `pessimistic` (0%), `optimistic` (100% → CRAP = comp), `skip` (drop the row). |

#### Output

| Flag                          | Default | Description                                                |
|-------------------------------|---------|------------------------------------------------------------|
| `-r, --reporter <name>`       | `table` | `table` \| `json` \| `markdown` \| `github` \| `pr-comment` \| `sarif` |
| `--summary`                   | off     | Only print aggregate stats + worst offender (no table).    |
| `-o, --output <file>`         | _none_  | Write to file instead of stdout.                           |

#### Baseline

| Flag                          | Default | Description                                                |
|-------------------------------|---------|------------------------------------------------------------|
| `--baseline <file>`           | _none_  | Compare against a previously emitted JSON report. Adds a Δ column and classifies each function as new / moved / regressed / improved / unchanged. |
| `--fail-regression`           | off     | Exit 1 if any function regressed beyond `--epsilon`. Requires `--baseline`. |
| `--epsilon <n>`               | `0.01`  | Tolerance for "no change" CRAP diff. Functions with `|Δ| ≤ epsilon` are considered unchanged. |

#### Misc

| Flag                          | Default | Description                                                |
|-------------------------------|---------|------------------------------------------------------------|
| `--tsconfig <path>`           | _none_  | Path to tsconfig.json (rarely needed).                     |
| `--config <path>`             | _none_  | Path to crap.config.json.                                  |
| `-h, --help`                  |         |                                                            |
| `-v, --version`               |         |                                                            |

## Coverage formats

`crap4ts` auto-detects three formats:

| Source                                | Format     |
|---------------------------------------|------------|
| `@vitest/coverage-v8` → `coverage-final.json` | `v8`        |
| Istanbul / `@vitest/coverage-istanbul` / `nyc` → `coverage-final.json` | `istanbul`  |
| `bun test --coverage --coverage-reporter=lcov` → `lcov.info` | `lcov`      |
| `jest --coverage` → `coverage/lcov.info`                     | `lcov`      |

To generate coverage with vitest:

```bash
# vitest.config.ts:
# test: { coverage: { provider: 'v8', reporter: ['json'] } }
vitest run --coverage
```

## Interpreting the score

The original paper offers a soft threshold of **30** for "this function needs attention". Above ~50 you have meaningfully risky code. Above ~100 you have code where a single change has high odds of introducing a regression.

The formula has two pure components:

- **Coverage = 100%** → `CRAP = comp(m)`. Even fully tested code with cyclomatic complexity 30+ is hard to reason about; consider splitting it.
- **Coverage = 0%** → `CRAP = comp(m)² + comp(m)`. Complexity 5 jumps to 30, complexity 10 jumps to 110. Test coverage drops the score fast — adding _any_ tests cuts CRAP roughly in eighths.

The fastest way to fix a high CRAP value is almost always to add tests, then refactor with confidence.

## Baseline workflow (v0.3)

The hardest sell of any code-quality gate is _"we already have CRAP 200 functions in this repo, are you going to make me fix them all before I can merge?"_. The baseline workflow says: **no, just don't make it worse.**

1. On `main`, emit a baseline JSON once per build:

   ```bash
   crap4ts src/ --coverage coverage/coverage-final.json \
     --reporter json --output crap-main.json
   ```

   Stash `crap-main.json` somewhere your PR CI can fetch it (artifact, S3, branch protection cache, etc.).

2. On every PR, compare against it and fail on regressions:

   ```bash
   crap4ts src/ --coverage coverage/coverage-final.json \
     --baseline crap-main.json --fail-regression
   ```

`crap4ts` then prints a Δ column and classifies each function:

| Status        | Meaning                                                          |
|---------------|------------------------------------------------------------------|
| `regressed`   | Same function, CRAP went up by more than `--epsilon`              |
| `new`         | Function didn't exist in the baseline                            |
| `moved`       | Function body hash matches a baseline entry in a different file or under a different name |
| `improved`    | CRAP dropped by more than `--epsilon`                            |
| `unchanged`   | |Δ| ≤ `--epsilon`                                                |
| `removed`     | Function existed in the baseline but is gone now                 |

Move detection is hash-based, so refactor PRs that shuffle code around don't get reported as a wall of `new` + `removed` pairs. The default `--epsilon 0.01` absorbs the sub-percent CRAP jitter that coverage tools introduce between runs.

### PR-bot comment

```bash
crap4ts src/ --baseline crap-main.json \
  --reporter pr-comment --output comment.md
```

`pr-comment` emits a sticky `<!-- crap4ts-report -->` marker on the first line. Wire your PR-comment workflow to find that marker and update the existing comment instead of posting a new one each run. The comment body collapses improvements and existing hot-spots into `<details>` blocks so the "what got worse" table stays front-and-center.

## Monorepos

Coverage tools emit file paths in four shapes depending on where they ran:

1. Absolute: `/home/alice/proj/src/foo.ts`
2. Relative to the workspace root: `src/foo.ts`
3. Relative to a sub-package (when the coverage tool ran in `packages/foo/`): `src/bar.ts`
4. With `./` or `../` prefixes

Earlier versions of `crap4ts` ran `path.resolve()` on every reported path, which silently re-rooted relative paths against the current `process.cwd()`. That worked fine at the repo root but failed silently in monorepos — every function in the sub-package showed up as 0% covered.

From v0.4 the matcher uses a two-level index:

1. Absolute report paths go into a hash map keyed by the absolute path. Exact hits resolve in `O(1)`.
2. Relative report paths are matched by **component-suffix** against the query's components. `src/foo.ts` matches `/repo/packages/foo/src/foo.ts`; `foo/bar.ts` does **not** match `/proj/oofoo/bar.ts` because the match boundary is the path-separator, not the byte boundary.

If multiple relative entries match, the most-specific (longest matching suffix) wins. Cross-machine absolute paths (CI report run on `/home/runner/work/...` queried locally from `/Users/dani/...`) intentionally do not match — silently merging different absolute roots would mask real bugs. A future `--path-prefix` flag will let you remap when you need to.

`crap4ts` also reads the nearest `.gitignore` and adds its patterns to the walker, so generated directories (`dist-temp/`, `build-out/`, etc.) get skipped automatically without you having to repeat them in `crap.config.json`. Negation patterns (`!foo`) and nested `.gitignore` files deeper in the tree are not yet honoured — open an issue if you hit them.

### Workspace discovery

`crap4ts --workspace` auto-detects your workspace config (in this order):

1. `pnpm-workspace.yaml` → the `packages:` list
2. `package.json#workspaces` → npm / yarn / bun shape, both flat-array and yarn-nested forms

When it finds packages, the scan expands to all of them, every function in the report carries its package label, and `--report-by package` groups the table by package, sorted worst-package-first:

```
▸ @scope/billing  (12 fns · Σcrap 870)
   CRAP  COMP  COVERAGE         LOCATION                  FUNCTION
─  ────  ────  ───────────────  ────────────────────────  ───────────
▲ 462.0    21  ░░░░░░░░░░  n/a  src/recurring.ts:14       computeBill
▲ 156.0    12  ████░░░░░░  40%  src/discounts.ts:7        applyCode
…

▸ @scope/auth     (3 fns · Σcrap 102)
   …
```

This is the view monorepo maintainers actually use when triaging: "which team needs to refactor what". The JSON reporter always carries the `package` field when a workspace is active, so dashboards can group too.

Override the auto-detected config with `--workspace-config path/to/pnpm-workspace.yaml` when running from outside the repo root.

### Merging per-package coverage

Monorepos that run tests per package (Turbo, Nx, parallel CI) emit one `coverage-final.json` per package, but crap4ts consumes a single coverage file. `merge-coverage` combines them — union of files, summing per-statement hit counts where a file appears in more than one report:

```bash
crap4ts merge-coverage 'packages/*/coverage/coverage-final.json' -o coverage/merged.json
crap4ts --workspace --coverage coverage/merged.json
```

JSON (istanbul / v8) only for now — the per-package-output pattern almost always emits JSON. LCOV merge is deferred.

## GitHub Code Scanning (SARIF)

`crap4ts --reporter sarif` emits a [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd02/sarif-v2.1.0-csprd02.html) envelope that GitHub Code Scanning ingests via the official `upload-sarif` action. High-CRAP functions then appear:

- Inline in the diff of every PR, as warning / error annotations next to the offending line range
- In the **Security → Code scanning** tab as persistent findings, with `partialFingerprints` so re-runs don't duplicate them
- In editors that read SARIF (VS Code via the SARIF Viewer extension, IntelliJ, etc.)

Two rules are emitted:

| Rule ID              | Level   | Triggered when            |
|----------------------|---------|---------------------------|
| `crap4ts/threshold`  | warning | `crap > --threshold` (30) |
| `crap4ts/fail-on`    | error   | `crap > --fail-on`        |

Minimal workflow:

```yaml
- name: Run crap4ts (SARIF)
  run: bunx @danibram/crap4ts src/ \
    --coverage coverage/coverage-final.json \
    --threshold 30 \
    --fail-on 100 \
    --reporter sarif \
    --output crap.sarif

- name: Upload to Code Scanning
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: crap.sarif
    category: crap4ts
```

`category: crap4ts` keeps these results distinct from other Code Scanning sources (CodeQL, ESLint SARIF, etc.) so each tool gets its own column in the dashboard.

## CI integration

### GitHub Actions

```yaml
- name: Run tests with coverage
  run: vitest run --coverage

- name: Check CRAP
  run: bunx @danibram/crap4ts src/ \
    --coverage coverage/coverage-final.json \
    --threshold 30 \
    --fail-on 100 \
    --reporter github
```

`--reporter github` emits inline annotations on the PR diff via workflow commands.

### Generic CI (exit code only)

```bash
bunx @danibram/crap4ts src/ \
  --coverage coverage/coverage-final.json \
  --fail-on 100
```

Returns exit `1` if any function exceeds `--fail-on`. Combine with `--reporter json > crap.json` to keep a machine-readable artifact.

## How it works

`crap4ts` parses TypeScript via [`ts-morph`](https://ts-morph.com/) (real AST — not regex). For each function-like node it counts decision points the way `crap4j` did originally:

- `if`, `for`, `for-of`, `for-in`, `while`, `do-while`
- `case` clauses (one per case; `default` is the fallthrough)
- `catch` clauses
- Conditional expressions (`a ? b : c`)
- Logical operators: `&&`, `||`, `??`
- Optional chaining (`?.`) is **not** a decision point

Decisions inside nested functions belong to the inner function — they don't bleed up.

Coverage is computed as `covered_statements / total_statements` within the function's line range, taken from the coverage report. This is a practical approximation of the basis-path coverage the paper specifies — close enough to drive prioritisation.

## Limitations

- **Statement coverage, not basis path coverage.** Equivalent in practice for most code; falls slightly short on dense conditionals.
- **TypeScript `.ts` / `.tsx` / `.js` / `.jsx` only** — no Vue / Svelte / MDX yet.
- **Class methods inside `class { ... }` only** — TS namespace methods and computed-name methods are extracted but may lose useful naming.

## Acknowledgements

- Alberto Savoia & Bob Evans for [the original C.R.A.P. metric](https://web.archive.org/web/20200529220442/https://www.artima.com/weblogs/viewpost.jsp?thread=210575) and `crap4j` (2007).
- The [`ts-morph`](https://github.com/dsherret/ts-morph) team — without it this tool would be a pile of regex.

## License

MIT © [Daniel Biedma](https://github.com/danibram)
