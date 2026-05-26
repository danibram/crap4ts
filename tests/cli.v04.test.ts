import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const CLI = resolve(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'crap4ts-v04-'));
}

describe('CLI v0.4 — path normalization', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('matches a subpackage-relative coverage path against the absolute query', () => {
    // The motivating monorepo bug: coverage tool ran in packages/foo/
    // and the report has `src/widget.ts`. crap4ts is invoked from the
    // monorepo root pointing at packages/foo/src/.
    const root = tmp();
    const pkgSrc = join(root, 'packages', 'foo', 'src');
    mkdirSync(pkgSrc, { recursive: true });
    writeFileSync(
      join(pkgSrc, 'widget.ts'),
      `
export function tangled(x: number) {
  if (x > 0 && x < 10) return x;
  if (x >= 10 && x < 100) return x * 2;
  return 0;
}
`.trimStart(),
    );
    // Istanbul-shaped JSON with a SUBPACKAGE-relative path — the bug
    // scenario. The path the coverage tool wrote is `src/widget.ts`,
    // not `packages/foo/src/widget.ts`.
    const coverage = {
      'src/widget.ts': {
        path: 'src/widget.ts',
        statementMap: {
          '1': { start: { line: 2 }, end: { line: 2 } },
          '2': { start: { line: 3 }, end: { line: 3 } },
          '3': { start: { line: 4 }, end: { line: 4 } },
        },
        s: { '1': 5, '2': 5, '3': 0 },
      },
    };
    const covPath = join(root, 'coverage.json');
    writeFileSync(covPath, JSON.stringify(coverage));
    const r = runCli(
      [
        'packages/foo/src/',
        '-c',
        covPath,
        '--coverage-format',
        'istanbul',
        '--reporter',
        'json',
      ],
      root,
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const tangled = parsed.functions.find(
      (f: { name: string }) => f.name === 'tangled',
    );
    expect(tangled).toBeDefined();
    // 2 of 3 statements covered → ~66.7%. The bug would have given us
    // null (coverage missing) and CRAP would have been computed against 0.
    expect(tangled.coverageMissing).toBe(false);
    expect(tangled.coverage).toBeGreaterThan(60);
    expect(tangled.coverage).toBeLessThan(70);
  });

  it('does not match by byte-suffix (oofoo/bar.ts vs foo/bar.ts)', () => {
    const root = tmp();
    const widgetDir = join(root, 'oofoo');
    mkdirSync(widgetDir, { recursive: true });
    writeFileSync(
      join(widgetDir, 'bar.ts'),
      'export function fn() { return 1; }\n',
    );
    const coverage = {
      'foo/bar.ts': {
        path: 'foo/bar.ts',
        statementMap: { '1': { start: { line: 1 }, end: { line: 1 } } },
        s: { '1': 1 },
      },
    };
    const covPath = join(root, 'coverage.json');
    writeFileSync(covPath, JSON.stringify(coverage));
    const r = runCli(
      [
        'oofoo/',
        '-c',
        covPath,
        '--coverage-format',
        'istanbul',
        '--reporter',
        'json',
      ],
      root,
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const fn = parsed.functions[0];
    // No match → coverage missing, not 100%.
    expect(fn.coverageMissing).toBe(true);
  });
});

describe('CLI v0.4 — .gitignore respected', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('skips files inside a .gitignore-listed directory', () => {
    const root = tmp();
    writeFileSync(join(root, '.gitignore'), 'generated/\n');
    writeFileSync(
      join(root, 'real.ts'),
      'export function real() { return 1; }\n',
    );
    mkdirSync(join(root, 'generated'));
    writeFileSync(
      join(root, 'generated', 'auto.ts'),
      'export function auto() { return 1; }\n',
    );
    const r = runCli(['.', '--reporter', 'json'], root);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const names = parsed.functions.map((f: { name: string }) => f.name);
    expect(names).toContain('real');
    expect(names).not.toContain('auto');
  });

  it('skips files matching an anywhere-name pattern', () => {
    const root = tmp();
    writeFileSync(join(root, '.gitignore'), '*.generated.ts\n');
    writeFileSync(
      join(root, 'real.ts'),
      'export function real() { return 1; }\n',
    );
    writeFileSync(
      join(root, 'thing.generated.ts'),
      'export function gen() { return 1; }\n',
    );
    const r = runCli(['.', '--reporter', 'json'], root);
    expect(r.status).toBe(0);
    const names = JSON.parse(r.stdout).functions.map(
      (f: { name: string }) => f.name,
    );
    expect(names).toContain('real');
    expect(names).not.toContain('gen');
  });
});

describe('CLI v0.4 — SARIF reporter', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('emits SARIF 2.1.0 with at least one result for high-CRAP code', () => {
    const root = tmp();
    writeFileSync(
      join(root, 'sample.ts'),
      `
export function tangled(x: number, y: number) {
  if (x > 0 && y > 0) return x * y;
  if (x < 0 || y < 0) return Math.abs(x) + Math.abs(y);
  return x ? y : (y ?? 0);
}
`.trimStart(),
    );
    const r = runCli(['.', '--reporter', 'sarif'], root);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs[0].tool.driver.name).toBe('crap4ts');
    expect(parsed.runs[0].tool.driver.version).toMatch(/^\d/);
    const results = parsed.runs[0].results;
    expect(results.length).toBeGreaterThan(0);
    const r0 = results[0];
    expect(r0.ruleId).toMatch(/crap4ts\//);
    expect(r0.level).toMatch(/warning|error/);
    expect(r0.locations[0].physicalLocation.artifactLocation.uri).toContain(
      'sample.ts',
    );
    expect(r0.locations[0].physicalLocation.region.startLine).toBe(1);
    expect(r0.partialFingerprints['function/v1']).toMatch(/^[0-9a-f]+$/);
  });

  it('promotes results above --fail-on to error level', () => {
    const root = tmp();
    writeFileSync(
      join(root, 'sample.ts'),
      `
export function tangled(x: number, y: number) {
  if (x > 0 && y > 0) return x * y;
  if (x < 0 || y < 0) return Math.abs(x) + Math.abs(y);
  return x ? y : (y ?? 0);
}
`.trimStart(),
    );
    const r = runCli(['.', '--reporter', 'sarif', '--fail-on', '50'], root);
    expect(r.status).toBe(1); // fail-on tripped
    const parsed = JSON.parse(r.stdout);
    const tangledResult = parsed.runs[0].results.find(
      (re: { message: { text: string } }) =>
        re.message.text.startsWith('tangled:'),
    );
    expect(tangledResult.level).toBe('error');
    expect(tangledResult.ruleId).toBe('crap4ts/fail-on');
  });
});
