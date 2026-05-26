# pnpm-workspace.yaml example

Fixture demonstrating `crap4ts --workspace` against a pnpm monorepo. Two packages, each with one deliberately untested function so the bot has something to flag.

## Layout

```
pnpm-workspace.yaml      # packages: ['packages/*']
packages/
  cart/
    package.json         # name: @demo/cart
    src/index.ts         # applyPromo — high CRAP
  checkout/
    package.json         # name: @demo/checkout
    src/index.ts         # chargeOrder — high CRAP
```

## Run it

```bash
cd examples/monorepos/pnpm
bunx @danibram/crap4ts --workspace --report-by package
```

## Expected output

```text
Scanned 2 files. 2 functions analysed.
Coverage: none — every function defaults to 0%.
Above threshold (CRAP > 30): 2 (100.0%)

▸ @demo/cart  (1 fns · Σcrap 132)
    CRAP  COMP  COVERAGE           LOCATION                          FUNCTION
─  ─────  ────  ─────────────────  ────────────────────────────────  ───────────
▲  132.0    11  ░░░░░░░░░░    n/a  packages/cart/src/index.ts:3      applyPromo

▸ @demo/checkout  (1 fns · Σcrap 56)
    CRAP  COMP  COVERAGE           LOCATION                          FUNCTION
─  ─────  ────  ─────────────────  ────────────────────────────────  ───────────
▲   56.0     7  ░░░░░░░░░░    n/a  packages/checkout/src/index.ts:3  chargeOrder
```

The `▸` headers come from `--report-by package`. Each section is sorted worst-first and packages themselves are ordered by Σcrap, so the team with the most work to do floats to the top.

## Notes

- Each function gets tagged with its `package.json#name`. Without `--workspace` the table is flat and the `package` field is absent from the JSON envelope.
- `--workspace` accepts an optional `--workspace-config <path>` when crap4ts is invoked from outside the repo root.
- Scoping to a single package still works: `crap4ts --workspace packages/cart`.
