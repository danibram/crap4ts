# package.json#workspaces example (npm / yarn / bun)

Fixture demonstrating `crap4ts --workspace` against an npm-style monorepo. Same code path as the pnpm example — `package.json#workspaces` is auto-detected when no `pnpm-workspace.yaml` is present.

## Layout

```
package.json                        # workspaces: ['packages/*']
packages/
  auth/
    package.json                    # name: @app/auth
    src/login.ts                    # authenticate — high CRAP
  profile/
    package.json                    # name: @app/profile
    src/avatar.ts                   # avatarFor — clean
```

Both the **flat-array** form (above) and the **yarn-nested** form work:

```jsonc
// yarn-style — also supported
{
  "workspaces": {
    "packages": ["packages/*"]
  }
}
```

## Run it

```bash
cd examples/monorepos/npm
bunx @danibram/crap4ts --workspace --report-by package
```

## Expected output

```text
Scanned 2 files. 2 functions analysed.
Coverage: none — every function defaults to 0%.
Above threshold (CRAP > 30): 1 (50.0%)

▸ @app/auth  (1 fns · Σcrap 110)
    CRAP  COMP  COVERAGE           LOCATION                          FUNCTION
─  ─────  ────  ─────────────────  ────────────────────────────────  ────────────
▲  110.0    10  ░░░░░░░░░░    n/a  packages/auth/src/login.ts:1      authenticate

▸ @app/profile  (1 fns · Σcrap 12)
    CRAP  COMP  COVERAGE           LOCATION                          FUNCTION
─  ─────  ────  ─────────────────  ────────────────────────────────  ────────────
✓   12.0     3  ░░░░░░░░░░    n/a  packages/profile/src/avatar.ts:1  avatarFor
```

`@app/profile` is here precisely to show what the table looks like when a package is *fine*: the section appears with its trivial function and the ✓ marker.

## Notes

- Same code path on bun (`bun init` + `"workspaces"`) and yarn — they all read `package.json#workspaces`.
- No workspace config (`pnpm-workspace.yaml` absent, no `workspaces` key in package.json) → `--workspace` is a no-op and crap4ts behaves as a single-package scan.
