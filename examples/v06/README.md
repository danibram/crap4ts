# v0.6 feature playground

Self-contained fixtures for the four headline v0.6 features. Run each command from this directory.

## 1. Cognitive complexity (`--complexity cognitive`)

`nested.ts` has a deeply-nested `evaluate` function. Cyclomatic complexity counts paths; cognitive penalises the nesting:

```bash
crap4ts nested.ts                          # cyclomatic (default)
#  CRAP  COMP  …  FUNCTION
#  110.0   10  …  evaluate

crap4ts nested.ts --complexity cognitive
#  CRAP  COMP  …  FUNCTION
#  650.0   25  …  evaluate
```

Same function, comp 10 → 25. The nesting (`for` → `if` → `if` → `else`) is invisible to cyclomatic but is exactly what makes the function hard to follow. CRAP jumps from 110 to 650.

## 2. In-source suppression (`crap4ts-disable-*`)

`disabled.ts` has a gnarly generated parser tagged with a disable comment, plus a hand-written function:

```ts
/* crap4ts-disable-next-function */
export function generatedParser(input: string) { /* nested mess */ }

export function handWritten(x: number) { return x > 0 ? x : -x; }
```

```bash
crap4ts disabled.ts --reporter json | jq '.functions[].name'
# "handWritten"      ← generatedParser is suppressed
```

Use `/* crap4ts-disable-file */` near the top of a file to skip the whole thing.

## 3. Per-path overrides

`crap.config.json` here raises the gate for `legacy/**` only:

```json
{
  "threshold": 30,
  "failOn": 50,
  "overrides": [{ "paths": "legacy/**", "failOn": 500 }]
}
```

`legacy/monster.ts:legacyBilling` is CRAP 182 — over the global `failOn` of 50, but under the `legacy/**` override of 500:

```bash
crap4ts legacy/        # exit 0 — override lets legacy code be crappy
crap4ts nested.ts      # exit 1 — src code (CRAP 110) holds the line at 50
```

This is how you adopt crap4ts on a codebase with existing high-CRAP corners: don't raise the global bar, carve out the legacy paths explicitly.

## 4. Hotspots (`--hotspots --since`)

Hotspots need git history, so run this from the repo root (not here):

```bash
crap4ts src/ --hotspots --since 90d
```

`HOT = CRAP × CHURN` (commits touching the file in the window). A function that's risky *and* edited constantly floats to the top — the quadrant where bugs cluster. `--since` accepts `90d` / `6w` / `3m` / `1y` / any git date.
