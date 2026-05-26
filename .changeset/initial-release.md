---
'@danibram/crap4ts': minor
---

Initial public release.

- CRAP index computation via `ts-morph` AST (no regex heuristics).
- Coverage parsers for vitest v8, Istanbul, and LCOV (auto-detected).
- CLI with `table`, `json`, `markdown`, and `github` reporters.
- Config via `crap.config.json` or `package.json#crap`.
- `--fail-on` flag for CI gating.
- 48 unit + integration tests.
