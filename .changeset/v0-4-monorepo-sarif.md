---
'@danibram/crap4ts': minor
---

v0.4 — monorepo path normalization, SARIF reporter, .gitignore support.

The two-pronged headline: fixes silent 0%-coverage failures in monorepos and surfaces high-CRAP code in GitHub Code Scanning.

- **Path normalization (two-level matching)**: coverage providers now index absolute report paths in an `O(1)` map and relative paths in a basename-bucketed component-suffix index. Component boundaries — never byte boundaries — so `foo/bar.ts` cannot accidentally match `oofoo/bar.ts`. Fixes the case where the coverage tool ran in `packages/foo/` and emitted `src/widget.ts` but crap4ts was invoked from the monorepo root.
- **`--reporter sarif`**: new SARIF 2.1.0 reporter for GitHub Code Scanning, VS Code SARIF viewer, and any other SARIF-aware tooling. Two rules (`crap4ts/threshold` → warning, `crap4ts/fail-on` → error) plus `partialFingerprints` so re-runs don't duplicate findings.
- **.gitignore support**: the walker now reads the nearest `.gitignore` (walked up from the first scan path) and folds its patterns into the ignore list. Comments, blanks, dir-only patterns, and basename-anywhere patterns are all supported. Negation (`!foo`) and nested `.gitignore` files deeper in the tree are not yet honoured — known limitation, called out in the README.
- New `examples/demo.ts` fixture used by the `Demo - *` PRs to showcase each diff scenario live on the repo.

Internal: new `src/coverage/pathIndex.ts` reusable across both JSON and LCOV providers; new `src/core/gitignore.ts` parser; SARIF rendering passes the crap4ts package version through `ReporterContext.toolVersion` so the SARIF envelope carries the real version (no more hard-coded strings).
