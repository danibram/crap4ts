import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * `crap4ts init` — non-interactive scaffolder. Detects the project's test
 * runner from devDependencies, picks a sensible coverage path, writes
 * crap.config.json, and (with --workflow) drops a baseline-aware GitHub
 * Action ready to push.
 *
 * Non-interactive on purpose: CI / agents can run it without TTY, and the
 * defaults are good enough that prompts would be friction. Override with
 * explicit flags when defaults guess wrong.
 */
export async function runInit(argv: string[]): Promise<number> {
  let values: InitFlags;
  try {
    const parsed = parseArgs({
      args: argv,
      options: INIT_OPTIONS,
      allowPositionals: false,
      strict: true,
    });
    values = parsed.values as InitFlags;
  } catch (err) {
    process.stderr.write(`${String(err)}\n\n${INIT_HELP}`);
    return 2;
  }
  if (values.help) {
    process.stdout.write(INIT_HELP);
    return 0;
  }

  const cwd = process.cwd();
  const pkgPath = resolve(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    process.stderr.write(
      'crap4ts init: no package.json in the current directory. Run init from your project root.\n',
    );
    return 2;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<
    string,
    unknown
  >;

  let runner: Runner;
  try {
    runner = values.runner ? expectRunner(values.runner) : detectRunner(pkg);
  } catch (err) {
    process.stderr.write(`crap4ts init: ${(err as Error).message}\n`);
    return 2;
  }
  const srcDir = values.src ?? detectSrcDir(cwd);
  const coverage = values.coverage ?? defaultCoverageFor(runner);

  const configPath = resolve(cwd, 'crap.config.json');
  if (existsSync(configPath) && !values.force) {
    process.stderr.write(
      `crap4ts init: ${relative(cwd, configPath)} already exists. Pass --force to overwrite.\n`,
    );
    return 2;
  }

  const config = {
    include: [srcDir],
    coverage,
    threshold: 30,
    failOn: 100,
    reporter: 'table',
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const written: string[] = [relative(cwd, configPath)];

  if (values.workflow) {
    const workflowPath = resolve(cwd, '.github/workflows/crap.yml');
    if (existsSync(workflowPath) && !values.force) {
      // Hard fail rather than silently skip: keeping the old workflow is the
      // kind of surprise that bites later when CI behaviour mysteriously
      // doesn't match a freshly-published init template.
      process.stderr.write(
        `crap4ts init: ${relative(cwd, workflowPath)} already exists. Pass --force to overwrite.\n`,
      );
      return 2;
    }
    mkdirSync(dirname(workflowPath), { recursive: true });
    writeFileSync(workflowPath, renderWorkflow(runner, coverage, srcDir));
    written.push(relative(cwd, workflowPath));
  }

  process.stdout.write(
    `crap4ts: wrote ${written.join(', ')}\nNext steps:\n  1. Generate coverage: ${coverageCommandFor(runner)}\n  2. Run a first scan:   crap4ts\n${
      values.workflow
        ? `  3. Commit ${written.join(' + ')} and open a PR — the bot will start commenting on the next push.\n`
        : '  3. Add the GitHub workflow with: crap4ts init --workflow\n'
    }`,
  );
  return 0;
}

type InitFlags = {
  runner?: string;
  src?: string;
  coverage?: string;
  workflow?: boolean;
  force?: boolean;
  help?: boolean;
};

const INIT_OPTIONS = {
  runner: { type: 'string' },
  src: { type: 'string' },
  coverage: { type: 'string' },
  workflow: { type: 'boolean' },
  force: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

const INIT_HELP = `crap4ts init — scaffold crap.config.json (and optionally a GitHub workflow).

Usage:
  crap4ts init [options]

Options:
      --runner <name>   vitest | jest | bun (auto-detected from package.json)
      --src <dir>       Source directory to scan (default: src/)
      --coverage <path> Path the runner emits coverage to
      --workflow        Also write .github/workflows/crap.yml
      --force           Overwrite existing files
  -h, --help            Show this help

Examples:
  crap4ts init                       # writes crap.config.json with detected defaults
  crap4ts init --workflow            # also writes the GitHub Action
  crap4ts init --runner jest --src lib/ --force
`;

type Runner = 'vitest' | 'jest' | 'bun';

function expectRunner(raw: string): Runner {
  if (raw === 'vitest' || raw === 'jest' || raw === 'bun') return raw;
  throw new Error(
    `--runner expects one of: vitest | jest | bun (got "${raw}")`,
  );
}

function detectRunner(pkg: Record<string, unknown>): Runner {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  // Order matters: vitest is usually paired with @vitest/coverage-* which is
  // a clearer signal than the test runner alone. Jest's signal is the
  // jest package itself. Bun is a fallback because it ships with the runtime.
  if ('vitest' in deps || '@vitest/coverage-v8' in deps) return 'vitest';
  if ('jest' in deps) return 'jest';
  return 'bun';
}

function detectSrcDir(cwd: string): string {
  for (const candidate of ['src', 'lib', 'app']) {
    if (existsSync(resolve(cwd, candidate))) return `${candidate}/`;
  }
  return 'src/';
}

function defaultCoverageFor(runner: Runner): string {
  if (runner === 'vitest') return 'coverage/coverage-final.json';
  return 'coverage/lcov.info';
}

function coverageCommandFor(runner: Runner): string {
  if (runner === 'vitest') return 'vitest run --coverage';
  if (runner === 'jest') return 'jest --coverage';
  return 'bun test --coverage --coverage-reporter=lcov';
}

function renderWorkflow(
  runner: Runner,
  coverage: string,
  srcDir: string,
): string {
  // We default to bun for the runtime because crap4ts itself is bun-shaped,
  // but the test step uses whichever runner the user has — generated via
  // `bun run` so it works with vitest, jest, or bun test transparently.
  return `name: CRAP gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  crap:
    name: CRAP threshold + baseline diff
    runs-on: ubuntu-latest
    steps:
      - name: Checkout base (main)
        if: github.event_name == 'pull_request'
        uses: actions/checkout@v4
        with:
          ref: \${{ github.base_ref }}
          path: base

      - name: Checkout current
        uses: actions/checkout@v4
        with:
          path: pr

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11

      # --- Generate main baseline (PR only) -------------------------------
      - name: Install (base)
        if: github.event_name == 'pull_request'
        working-directory: base
        run: bun install --frozen-lockfile

      - name: Coverage (base)
        if: github.event_name == 'pull_request'
        working-directory: base
        run: ${coverageCommandFor(runner)}

      - name: Baseline JSON
        if: github.event_name == 'pull_request'
        working-directory: base
        run: |
          bunx @danibram/crap4ts ${srcDir} \\
            --coverage ${coverage} \\
            --reporter json \\
            --output /tmp/crap-baseline.json

      # --- Score the current commit ---------------------------------------
      - name: Install (current)
        working-directory: pr
        run: bun install --frozen-lockfile

      - name: Coverage (current)
        working-directory: pr
        run: ${coverageCommandFor(runner)}

      - name: PR comment
        if: github.event_name == 'pull_request'
        working-directory: pr
        run: |
          bunx @danibram/crap4ts ${srcDir} \\
            --coverage ${coverage} \\
            --baseline /tmp/crap-baseline.json \\
            --reporter pr-comment \\
            --output /tmp/crap-comment.md || true

      - name: Post sticky comment
        if: github.event_name == 'pull_request'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: crap4ts-report
          path: /tmp/crap-comment.md

      - name: SARIF for Code Scanning
        working-directory: pr
        run: |
          bunx @danibram/crap4ts ${srcDir} \\
            --coverage ${coverage} \\
            --reporter sarif \\
            --output /tmp/crap.sarif || true

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: /tmp/crap.sarif
          category: crap4ts

      - name: Fail on regression
        if: github.event_name == 'pull_request'
        working-directory: pr
        run: |
          bunx @danibram/crap4ts ${srcDir} \\
            --coverage ${coverage} \\
            --baseline /tmp/crap-baseline.json \\
            --fail-regression \\
            --summary
`;
}
