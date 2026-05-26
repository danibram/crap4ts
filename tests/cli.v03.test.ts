import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const CLI = resolve(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'crap4ts-v03-'));
}

const SAMPLE_LOW = `
export function tangled(x: number, y: number) {
  if (x > 0 && y > 0) return x * y;
  return 0;
}

export function simple(x: number) {
  return x;
}
`.trimStart();

const SAMPLE_HIGH = `
export function tangled(x: number, y: number) {
  if (x > 0 && y > 0) return x * y;
  if (x < 0 || y < 0) return Math.abs(x) + Math.abs(y);
  return x ? y : (y ?? 0);
}

export function simple(x: number) {
  return x;
}
`.trimStart();

const SAMPLE_HIGH_WITH_NEW = `
${SAMPLE_HIGH}

export function freshlyAdded(n: number) {
  if (n > 0 && n < 10) return n;
  if (n > 10 || n < -10) return -n;
  return n ? n : 0;
}
`.trimStart();

describe('CLI v0.3 — baseline + diff', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  function makeBaseline(dir: string, code: string): string {
    writeFileSync(join(dir, 'sample.ts'), code);
    const baseline = join(dir, 'baseline.json');
    const r = runCli(['.', '--reporter', 'json', '--output', baseline], dir);
    expect(r.status).toBe(0);
    return baseline;
  }

  it('JSON envelope now includes a hash per function', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_LOW);
    const parsed = JSON.parse(readFileSync(baseline, 'utf8'));
    for (const fn of parsed.functions) {
      expect(typeof fn.hash).toBe('string');
      expect(fn.hash.length).toBeGreaterThan(0);
    }
  });

  it('--fail-regression exits 1 when a function regressed', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_LOW);
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH);
    const r = runCli(['.', '--baseline', baseline, '--fail-regression'], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('regressed');
  });

  it('--fail-regression exits 0 when nothing regressed', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_HIGH);
    // No source change — re-running should detect zero regressions.
    const r = runCli(['.', '--baseline', baseline, '--fail-regression'], dir);
    expect(r.status).toBe(0);
  });

  it('--epsilon swallows sub-threshold deltas', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_HIGH);
    // Inject a baseline with crap ever-so-slightly different to mimic
    // coverage tool jitter. The real CRAP for tangled is stable so we
    // hand-edit the JSON.
    const parsed = JSON.parse(readFileSync(baseline, 'utf8'));
    for (const fn of parsed.functions) {
      if (fn.name === 'tangled') fn.crap = fn.crap - 0.001;
    }
    writeFileSync(baseline, JSON.stringify(parsed));
    const r = runCli(
      ['.', '--baseline', baseline, '--fail-regression', '--epsilon', '0.01'],
      dir,
    );
    expect(r.status).toBe(0);
  });

  it('--baseline adds a Δ column to the table reporter', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_LOW);
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH);
    const r = runCli(['.', '--baseline', baseline], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Δ');
    expect(r.stdout).toContain('Baseline:');
    // tangled is now more complex → CRAP rose → positive delta
    expect(r.stdout).toMatch(/\+\d+\.\d/);
  });

  it('reports new functions as NEW', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_HIGH);
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH_WITH_NEW);
    const r = runCli(['.', '--baseline', baseline], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('NEW');
    expect(r.stdout).toContain('freshlyAdded');
  });

  it('detects a move by hash even when the file changes', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_HIGH);
    // Move sample.ts → moved.ts so file path differs but the function body
    // (and hence hash) stays the same.
    renameSync(join(dir, 'sample.ts'), join(dir, 'moved.ts'));
    const r = runCli(['.', '--baseline', baseline, '--reporter', 'json'], dir);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.diff.summary.moved).toBeGreaterThanOrEqual(1);
    expect(parsed.diff.summary.new).toBe(0);
    expect(parsed.diff.summary.removed).toBe(0);
  });

  it('--reporter pr-comment includes the sticky marker and a verdict', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_LOW);
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH_WITH_NEW);
    const r = runCli(
      ['.', '--baseline', baseline, '--reporter', 'pr-comment'],
      dir,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('<!-- crap4ts-report -->');
    expect(r.stdout).toContain('Needs attention');
    expect(r.stdout).toContain('freshlyAdded');
  });

  it('--reporter pr-comment degrades to top-offenders without baseline', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH);
    const r = runCli(['.', '--reporter', 'pr-comment'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('<!-- crap4ts-report -->');
    expect(r.stdout).toContain('Top offenders');
  });

  it('--fail-regression without --baseline fails fast', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH);
    const r = runCli(['.', '--fail-regression'], dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--fail-regression requires --baseline');
  });

  it('rejects a malformed baseline file', () => {
    const dir = tmp();
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{ this is not json');
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH);
    const r = runCli(['.', '--baseline', bad], dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('not valid JSON');
  });

  it('rejects an unsupported baseline version', () => {
    const dir = tmp();
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ version: '999', functions: [] }));
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH);
    const r = runCli(['.', '--baseline', bad], dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unsupported version');
  });

  it('JSON reporter emits a diff block when --baseline is supplied', () => {
    const dir = tmp();
    const baseline = makeBaseline(dir, SAMPLE_LOW);
    writeFileSync(join(dir, 'sample.ts'), SAMPLE_HIGH);
    const r = runCli(['.', '--baseline', baseline, '--reporter', 'json'], dir);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.diff).toBeDefined();
    expect(parsed.diff.summary).toBeDefined();
    expect(typeof parsed.diff.epsilon).toBe('number');
    expect(Array.isArray(parsed.diff.entries)).toBe(true);
  });
});
