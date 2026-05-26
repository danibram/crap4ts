import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const CLI = resolve(__dirname, '..', 'dist', 'cli.js');

function buildFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crap4ts-v02-'));
  writeFileSync(
    join(dir, 'sample.ts'),
    `
export function tangled(x: number, y: number) {
  if (x > 0 && y > 0) return x * y;
  if (x < 0 || y < 0) return Math.abs(x) + Math.abs(y);
  return x ? y : (y ?? 0);
}

export function renderBig(input: string) {
  return input.split('').map((c) => c.toUpperCase()).join('');
}

export function renderSmall(input: string) {
  return input.toLowerCase();
}

export function simple(x: number) {
  return x;
}
`.trimStart(),
  );
  return dir;
}

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

describe('CLI v0.2 flags', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('--summary prints aggregate + worst, no per-function table', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--summary'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Worst:');
    expect(r.stdout).toContain('tangled'); // mentioned in the Worst: line
    expect(r.stdout).not.toContain('───'); // no table separator
    expect(r.stdout).not.toContain('simple'); // table absent → no other fns
  });

  it('--min hides rows below the score', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--min', '50'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('tangled'); // CRAP=56
    expect(r.stdout).not.toContain('simple'); // CRAP=2
  });

  it('--output writes to file and not stdout', () => {
    const dir = buildFixture();
    const out = join(dir, 'crap.txt');
    const r = runCli(['.', '--output', out], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    const fileContent = readFileSync(out, 'utf8');
    expect(fileContent).toContain('tangled');
  });

  it('--allow with function-name glob hides matching rows', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--allow', 'render*'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('tangled');
    expect(r.stdout).not.toContain('renderBig');
    expect(r.stdout).not.toContain('renderSmall');
  });

  it('--allow with path glob hides functions in matching files', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--allow', '**/sample.ts'], dir);
    expect(r.status).toBe(0);
    // Everything is in sample.ts → all hidden, but file still scanned.
    expect(r.stdout).toContain('Scanned 1 files');
    expect(r.stdout).not.toContain('tangled');
    expect(r.stdout).not.toContain('simple');
  });

  it('--reporter json emits a versioned envelope', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--reporter', 'json'], dir);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.$schema).toMatch(/report-v1/);
    expect(parsed.version).toBe('1');
    expect(parsed.totals).toBeDefined();
    expect(parsed.functions[0].name).toBe('tangled');
    expect(parsed.functions[0].coverageMissing).toBe(true);
    expect(parsed.functions[0].coverage).toBeNull();
  });

  it('--reporter json + --summary omits functions array', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--reporter', 'json', '--summary'], dir);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.functions).toBeUndefined();
    expect(parsed.totals.worst).toBeDefined();
  });

  it('rejects an unknown --missing value', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--missing', 'whatever'], dir);
    expect(r.status).not.toBe(0);
  });

  it('table reporter shows ✗ ▲ ✓ icons and coverage bars', () => {
    const dir = buildFixture();
    const r = runCli(['.', '--fail-on', '50'], dir);
    expect(r.status).toBe(1); // tangled exceeds fail-on
    expect(r.stdout).toMatch(/[✗▲✓]/);
    expect(r.stdout).toContain('░'); // empty bar (no coverage)
  });
});
