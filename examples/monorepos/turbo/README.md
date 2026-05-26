# Turbo example

Fixture demonstrating that `crap4ts` works alongside Turborepo. The trick: **Turbo doesn't define workspaces** — it orchestrates tasks. The workspaces themselves are declared in `pnpm-workspace.yaml` (or `package.json#workspaces`), exactly like a non-Turbo monorepo. crap4ts reads that file directly.

## Layout

```
turbo.json                          # tasks: build / test / lint / crap
pnpm-workspace.yaml                 # packages: ['apps/*']
package.json                        # devDependencies.turbo
apps/
  web/
    package.json                    # name: @turbo/web · scripts.crap
    src/router.ts                   # matchRoute — high CRAP
  api/
    package.json                    # name: @turbo/api · scripts.crap
    src/handler.ts                  # handle — high CRAP
```

## Two ways to run it

### Direct (recommended)

```bash
cd examples/monorepos/turbo
bunx @danibram/crap4ts --workspace --report-by package
```

The cross-package overview a maintainer wants.

### Via Turbo (per-app, parallelised)

```bash
turbo run crap
```

Each app's `scripts.crap` runs `crap4ts src/` locally. Turbo orchestrates, caches, and parallelises; crap4ts produces one report per package. Wire the per-app crap into your `pipeline.test` chain to fail the build on regression.

## Expected output (direct invocation)

```text
Scanned 2 files. 2 functions analysed.
Coverage: none — every function defaults to 0%.
Above threshold (CRAP > 30): 2 (100.0%)

▸ @turbo/api  (1 fns · Σcrap 72)
   CRAP  COMP  COVERAGE           LOCATION                   FUNCTION
─  ────  ────  ─────────────────  ─────────────────────────  ──────────
▲  72.0     8  ░░░░░░░░░░    n/a  apps/api/src/handler.ts:1  handle

▸ @turbo/web  (1 fns · Σcrap 72)
   CRAP  COMP  COVERAGE           LOCATION                   FUNCTION
─  ────  ────  ─────────────────  ─────────────────────────  ──────────
▲  72.0     8  ░░░░░░░░░░    n/a  apps/web/src/router.ts:3   matchRoute
```

## Notes

- crap4ts does **not** read `turbo.json`. We deliberately skip it — Turbo defers to the underlying workspace config, so reading both would add no signal.
- The `crap` task in `turbo.json` is just a normal Turbo task. Wire it into your CI alongside `test` and `lint`.
- For PR baselining, generate a `crap-main.json` from `main` (one per package, or aggregated) and pass it via `--baseline` on PR runs.
