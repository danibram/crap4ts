---
'@danibram/crap4ts': minor
---

v0.3 — baseline diff + PR-bot comment.

The "don't make it worse" workflow: persist a JSON report from `main`, then on every PR diff against it. Regressions and new functions surface in the table with a Δ column; unchanged hot-spots stay out of the way. Tractable adoption for repos with existing high-CRAP code.

- **`--baseline <file>`** — compare against a previously emitted JSON report. Classifies each function as `new` / `moved` / `regressed` / `improved` / `unchanged` / `removed` and adds a `Δ` column to the table and markdown reporters.
- **`--fail-regression`** — exit 1 when any function regressed beyond `--epsilon`. Requires `--baseline`.
- **`--epsilon <n>`** (default `0.01`) — tolerance band for "no change". Absorbs the sub-percent CRAP jitter that coverage tools introduce between runs.
- **Move detection** — functions matched primarily by `file::name`; leftovers paired by body hash so refactors that move code around aren't reported as a wall of `new` + `removed` pairs.
- **`--reporter pr-comment`** — opinionated PR-bot comment with a sticky `<!-- crap4ts-report -->` marker. Main table = regressions + new; improvements, existing hot-spots, and moves collapse into `<details>`. Degrades to top offenders when no baseline is supplied.
- **JSON envelope additions** — each function now carries a `hash` field (sha256-16) used for move detection. When `--baseline` is supplied the envelope gains a top-level `diff` block with the summary and per-entry classifications.

JSON schema version is still `1` — the additions are backward-compatible. Older v0.2 reports load as baselines just fine, with the caveat that they don't include `hash`, so move detection silently falls back to file+name matching.
