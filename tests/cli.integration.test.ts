import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const CLI = resolve(__dirname, '..', 'dist', 'cli.js');

function buildFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crap4ts-cli-'));
  writeFileSync(
    join(dir, 'sample.ts'),
    `
export function tangled(x: number, y: number) {
  if (x > 0 && y > 0) return x * y;
  if (x < 0 || y < 0) return Math.abs(x) + Math.abs(y);
  return x ? y : (y ?? 0);
}

export function simple(x: number) {
  return x;
}
`.trimStart(),
  );
  return dir;
}

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

describe('CLI', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('--help prints usage and exits 0', () => {
    const dir = buildFixture();
    const r = runCli(['--help'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('crap4ts —');
    expect(r.stdout).toContain('--threshold');
  });

  it('--version prints package version', () => {
    const dir = buildFixture();
    const r = runCli(['--version'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('default invocation produces a table and exits 0', () => {
    const dir = buildFixture();
    const r = runCli(['.'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('CRAP');
    expect(r.stdout).toContain('tangled');
    expect(r.stdout).toContain('simple');
  });

  it('--reporter json emits valid JSON', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--reporter', 'json'], dir);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.totals.functions).toBe(2);
    expect(parsed.functions[0].name).toBe('tangled');
  });

  it('--fail-on exits non-zero when a function exceeds it', () => {
    const dir = buildFixture();
    // tangled has comp ~7, CRAP ~56 with 0% coverage
    const r = runCli(['.', '--fail-on', '10'], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('exceed --fail-on=10');
  });

  it('--fail-on exits 0 when the threshold is high enough', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--fail-on', '999'], dir);
    expect(r.status).toBe(0);
  });

  it('rejects an unknown --reporter value', () => {
    const dir = buildFixture();
    const r = runCli(['--reporter', 'pdf'], dir);
    expect(r.status).not.toBe(0);
  });
});
