import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const CLI = resolve(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

function tmp(prefix = 'crap4ts-init-e2e-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Drop a single high-CRAP function so every scan has something to report. */
function seedSourceFile(dir: string, srcDir = 'src'): void {
  const target = join(dir, srcDir);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, 'index.ts'),
    `
export function tangled(x: number, y: number) {
  if (x > 0 && y > 0) return x * y;
  if (x < 0 || y < 0) return Math.abs(x) + Math.abs(y);
  return x ? y : (y ?? 0);
}

export function trivial(n: number) {
  return n;
}
`.trimStart(),
  );
}

/**
 * Write a stand-in for the runner's coverage output. crap4ts errors out when
 * the config points at a coverage file that doesn't exist — that's correct
 * behaviour for end users (init literally tells you to generate coverage
 * before scanning), but our E2E tests skip the "actually run vitest" step,
 * so we drop an empty-but-valid file at the configured path.
 */
function seedEmptyCoverage(
  dir: string,
  runner: 'vitest' | 'jest' | 'bun',
): void {
  mkdirSync(join(dir, 'coverage'), { recursive: true });
  if (runner === 'vitest') {
    writeFileSync(join(dir, 'coverage', 'coverage-final.json'), '{}');
  } else {
    // detectFormat keys off the first non-blank line — TN: is the canonical
    // way to open an LCOV record. We don't emit any SF: blocks, so no file
    // ends up indexed and every function reports as coverage-missing.
    writeFileSync(join(dir, 'coverage', 'lcov.info'), 'TN:\n');
  }
}

/**
 * Most tests in this file run the full scaffold→scan lifecycle: init writes
 * a config, then crap4ts (invoked with NO positional paths or flags) is
 * expected to discover that config, expand `include`, and produce a report.
 * The tests assert both that init wrote sensible artifacts AND that the
 * scaffolded config actually drives a working scan.
 */
describe('crap4ts init — end-to-end', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('vitest project: init scaffolds + a follow-up scan reports tangled', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'demo-vitest',
        devDependencies: {
          vitest: '^2.0.0',
          '@vitest/coverage-v8': '^2.0.0',
        },
      }),
    );
    seedSourceFile(dir);

    const init = runCli(['init'], dir);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('vitest run --coverage');

    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg).toMatchObject({
      include: ['src/'],
      coverage: 'coverage/coverage-final.json',
      threshold: 30,
      failOn: 100,
      reporter: 'table',
    });

    // Drop an empty coverage file at the configured path so the scan can
    // proceed without us having to actually run vitest in the test.
    seedEmptyCoverage(dir, 'vitest');

    // No positional path → crap4ts must pick up `include` from config.
    const scan = runCli(['--reporter', 'json'], dir);
    expect(scan.status).toBe(0);
    const report = JSON.parse(scan.stdout);
    const names = report.functions.map((f: { name: string }) => f.name);
    expect(names).toContain('tangled');
    expect(names).toContain('trivial');
  });

  it('jest project: init picks lcov defaults; scan still finds the functions', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }),
    );
    seedSourceFile(dir);

    const init = runCli(['init'], dir);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('jest --coverage');
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.coverage).toBe('coverage/lcov.info');

    seedEmptyCoverage(dir, 'jest');
    const scan = runCli(['--reporter', 'json'], dir);
    expect(scan.status).toBe(0);
    const report = JSON.parse(scan.stdout);
    expect(report.functions.length).toBeGreaterThanOrEqual(2);
  });

  it('no test runner in package.json: init defaults to bun + lcov', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo-bun' }),
    );
    seedSourceFile(dir);

    const init = runCli(['init'], dir);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain(
      'bun test --coverage --coverage-reporter=lcov',
    );
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.coverage).toBe('coverage/lcov.info');
  });

  it('--src override drives a custom source directory', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));
    seedSourceFile(dir, 'app');

    const init = runCli(['init', '--src', 'app/'], dir);
    expect(init.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.include).toEqual(['app/']);

    // No test runner in package.json → init defaults to bun → lcov.
    seedEmptyCoverage(dir, 'bun');
    const scan = runCli(['--reporter', 'json'], dir);
    expect(scan.status).toBe(0);
    const names = JSON.parse(scan.stdout).functions.map(
      (f: { name: string }) => f.name,
    );
    expect(names).toContain('tangled');
  });

  it('falls back to lib/ when src/ is absent but lib/ exists', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));
    mkdirSync(join(dir, 'lib'));

    const init = runCli(['init'], dir);
    expect(init.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.include).toEqual(['lib/']);
  });

  it('falls back to app/ when src/ and lib/ are absent', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));
    mkdirSync(join(dir, 'app'));

    const init = runCli(['init'], dir);
    expect(init.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.include).toEqual(['app/']);
  });

  it('defaults to src/ even when no source directory exists yet', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));

    const init = runCli(['init'], dir);
    expect(init.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.include).toEqual(['src/']);
  });

  it('--coverage override is written verbatim into the config', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));

    const init = runCli(['init', '--coverage', 'reports/cov.lcov'], dir);
    expect(init.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.coverage).toBe('reports/cov.lcov');
  });

  it('--force overwrites an existing crap.config.json', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));
    writeFileSync(
      join(dir, 'crap.config.json'),
      JSON.stringify({ legacy: true }),
    );

    const first = runCli(['init'], dir);
    expect(first.status).toBe(2);
    expect(first.stderr).toContain('already exists');

    const forced = runCli(['init', '--force'], dir);
    expect(forced.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.legacy).toBeUndefined();
    expect(cfg.include).toEqual(['src/']);
  });

  it('rejects init without a package.json in the current directory', () => {
    const dir = tmp();
    const r = runCli(['init'], dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('no package.json');
  });

  it('--workflow writes a YAML with the full baseline + SARIF pipeline', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }),
    );

    const r = runCli(['init', '--workflow'], dir);
    expect(r.status).toBe(0);
    const yml = readFileSync(join(dir, '.github/workflows/crap.yml'), 'utf8');
    // We can't parse YAML without a dep, so we sanity-check the bits that
    // matter: triggers, key flags, sticky-comment action, codeql upload.
    expect(yml).toContain('on:');
    expect(yml).toContain('pull_request');
    expect(yml).toContain('push:');
    expect(yml).toContain('permissions:');
    expect(yml).toContain('security-events: write');
    expect(yml).toContain('--baseline /tmp/crap-baseline.json');
    expect(yml).toContain('--fail-regression');
    expect(yml).toContain('--reporter pr-comment');
    expect(yml).toContain('--reporter sarif');
    expect(yml).toContain('marocchino/sticky-pull-request-comment@v2');
    expect(yml).toContain('github/codeql-action/upload-sarif@v3');
    expect(yml).toContain('vitest run --coverage');
  });

  it('--workflow + --runner jest emits jest-flavoured coverage commands', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));

    const r = runCli(['init', '--workflow', '--runner', 'jest'], dir);
    expect(r.status).toBe(0);
    const yml = readFileSync(join(dir, '.github/workflows/crap.yml'), 'utf8');
    expect(yml).toContain('jest --coverage');
    expect(yml).not.toContain('vitest');
  });

  it('--workflow refuses to overwrite without --force', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(join(dir, '.github/workflows/crap.yml'), '# already here\n');

    const r = runCli(['init', '--workflow'], dir);
    // The config still gets written but the workflow step warns and skips.
    // We expect a non-zero exit so users notice their workflow wasn't
    // touched — silently keeping the old one would be the kind of surprise
    // that ruins a release.
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('crap.yml');
    expect(r.stderr).toContain('already exists');
  });

  it('detects vitest from @vitest/coverage-v8 even when "vitest" itself is missing', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        devDependencies: { '@vitest/coverage-v8': '^2.0.0' },
      }),
    );

    const r = runCli(['init'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('vitest run --coverage');
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.coverage).toBe('coverage/coverage-final.json');
  });

  it('init at a monorepo root + crap4ts --workspace gives a per-package report', () => {
    const root = tmp('crap4ts-init-mono-');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'mono-root',
        private: true,
        workspaces: ['packages/*'],
        devDependencies: { vitest: '^2.0.0' },
      }),
    );
    for (const name of ['alpha', 'beta']) {
      const pkgDir = join(root, 'packages', name);
      mkdirSync(join(pkgDir, 'src'), { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({ name: `@mono/${name}` }),
      );
      writeFileSync(
        join(pkgDir, 'src', 'index.ts'),
        `export function f${name}(x: number) {
  if (x > 0 && x < 10) return x;
  if (x >= 10 && x < 100) return x * 2;
  return 0;
}`,
      );
    }

    // Step 1: init at the monorepo root. This writes the *root* config — the
    // workspace expansion happens later when --workspace is passed.
    const init = runCli(['init'], root);
    expect(init.status).toBe(0);
    expect(existsSync(join(root, 'crap.config.json'))).toBe(true);

    seedEmptyCoverage(root, 'vitest');

    // Step 2: scan with --workspace. crap4ts should find both packages.
    const scan = runCli(['--workspace', '--reporter', 'json'], root);
    expect(scan.status).toBe(0);
    const report = JSON.parse(scan.stdout);
    const packages = new Set<string>(
      report.functions.map((f: { package?: string }) => f.package),
    );
    expect(packages).toContain('@mono/alpha');
    expect(packages).toContain('@mono/beta');
  });
});
