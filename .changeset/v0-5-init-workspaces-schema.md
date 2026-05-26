---
'@danibram/crap4ts': minor
---

v0.5 — `crap4ts init`, monorepo workspaces, published JSON Schema.

The "make it stupid easy to adopt" release. Bundles three threads we were tracking separately (0.4.1 schema patch, 0.5 adoption, 0.6 monorepo) into one minor — they share the same delivery story so they ship together.

- **`crap4ts init [--workflow]`** — non-interactive scaffolder. Detects vitest / jest / bun test from devDependencies, writes `crap.config.json` with sensible defaults, and (with `--workflow`) drops a baseline-aware GitHub Action that does PR-comment + SARIF upload + regression gating in one go. Removes the "which paths do I pass, which coverage path, which workflow steps" friction wall that kept the tool off projects' radar.
- **`--workspace`** — auto-detects `pnpm-workspace.yaml` or `package.json#workspaces` (npm/yarn/bun flat-array AND yarn-nested shapes), expands the scan to every package, and tags each function with its package label. Override the auto-detected config with `--workspace-config <path>`. Minimal YAML parser inline — no new deps.
- **`--report-by package`** — groups the table/markdown report by workspace package, sorted worst-package-first. The lens monorepo maintainers actually use.
- **`schemas/report-v1.json`** — JSON Schema for the `--reporter json` envelope, published from the repo and embedded in the npm package (`files: ["schemas"]`). The `$schema` URL we've been emitting since v0.3 is no longer a 404. Stable contract for `--baseline` diffing across crap4ts versions and for third-party consumers.
- **README rewritten as a landing.** Lead with "doesn't ask you to fix legacy — just stops you from making things worse" and surface the 5 Demo PRs upfront. The original technical sections remain.

Internal: new `src/init.ts`, new `src/core/workspace.ts` with `discoverWorkspace` + `resolvePackageForFile` (exported for library consumers). `CrapFunction` gains optional `package?: string`. Backward-compatible additions only.
