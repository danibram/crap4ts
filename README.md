# crap4ts

> C.R.A.P. (Change Risk Analysis & Predictions) index for TypeScript / JavaScript.
> Surfaces risky-to-change code by combining cyclomatic complexity with test coverage.

[![npm version](https://img.shields.io/npm/v/@danibram/crap4ts.svg)](https://www.npmjs.com/package/@danibram/crap4ts)
[![license](https://img.shields.io/npm/l/@danibram/crap4ts.svg)](./LICENSE)

```text
CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)
```

Where `comp(m)` is the McCabe cyclomatic complexity of function `m`, and `cov(m)` is its statement coverage (%). The original metric was proposed by Alberto Savoia & Bob Evans in 2007 ([Pardon My French, But This Code Is C.R.A.P.](https://web.archive.org/web/20200529220442/https://www.artima.com/weblogs/viewpost.jsp?thread=210575)). `crap4ts` brings it to the TypeScript ecosystem with first-class support for vitest, jest, bun test, and any LCOV-emitting tool.

## Quick start

```bash
# Run directly (no install)
bunx @danibram/crap4ts src/

# Or as a project dev dependency
bun add -D @danibram/crap4ts
```

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

| Reporter   | Use for                                           |
|------------|---------------------------------------------------|
| `table`    | Default — aligned columns in the terminal         |
| `json`     | Machine-readable output (CI scripts, dashboards)  |
| `markdown` | PR body / GitHub issue (GFM table)                |
| `github`   | `::warning::` / `::error::` annotations for PRs   |

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
  "tsconfig": "./tsconfig.json"
}
```

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
| `-r, --reporter <name>`       | `table` | `table` \| `json` \| `markdown` \| `github`                |
| `--summary`                   | off     | Only print aggregate stats + worst offender (no table).    |
| `-o, --output <file>`         | _none_  | Write to file instead of stdout.                           |

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
