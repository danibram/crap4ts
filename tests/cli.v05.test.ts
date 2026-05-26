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
const SCHEMA = resolve(__dirname, '..', 'schemas', 'report-v1.json');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'crap4ts-v05-'));
}

describe('CLI v0.5 — JSON Schema', () => {
  it('schemas/report-v1.json exists, is valid JSON, and pins envelope version "1"', () => {
    expect(existsSync(SCHEMA)).toBe(true);
    const parsed = JSON.parse(readFileSync(SCHEMA, 'utf8'));
    expect(parsed.properties.version.const).toBe('1');
    expect(parsed.required).toContain('version');
    expect(parsed.required).toContain('totals');
  });
});

describe('CLI v0.5 — init', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('writes crap.config.json with vitest defaults when vitest is in devDeps', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'demo',
        devDependencies: { vitest: '^2.0.0' },
      }),
    );
    mkdirSync(join(dir, 'src'));
    const r = runCli(['init'], dir);
    expect(r.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.coverage).toBe('coverage/coverage-final.json');
    expect(cfg.include).toEqual(['src/']);
    expect(cfg.threshold).toBe(30);
  });

  it('writes lcov defaults when jest is detected', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { jest: '^29.0.0' } }),
    );
    const r = runCli(['init'], dir);
    expect(r.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'crap.config.json'), 'utf8'));
    expect(cfg.coverage).toBe('coverage/lcov.info');
  });

  it('--workflow writes a GitHub Action with baseline + SARIF wiring', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }),
    );
    const r = runCli(['init', '--workflow'], dir);
    expect(r.status).toBe(0);
    const yml = readFileSync(join(dir, '.github/workflows/crap.yml'), 'utf8');
    expect(yml).toContain('--baseline /tmp/crap-baseline.json');
    expect(yml).toContain('--reporter sarif');
    expect(yml).toContain('--fail-regression');
    expect(yml).toContain('marocchino/sticky-pull-request-comment');
  });

  it('refuses to overwrite without --force', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));
    writeFileSync(join(dir, 'crap.config.json'), '{}');
    const r = runCli(['init'], dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('already exists');
  });

  it('rejects an unknown --runner', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));
    const r = runCli(['init', '--runner', 'mocha'], dir);
    expect(r.status).toBe(2);
  });
});

describe('CLI v0.5 — workspace + report-by package', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  function buildMonorepo(): string {
    const root = tmp();
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    for (const name of ['alpha', 'beta']) {
      const dir = join(root, 'packages', name, 'src');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(root, 'packages', name, 'package.json'),
        JSON.stringify({ name: `@demo/${name}` }),
      );
      writeFileSync(
        join(dir, 'index.ts'),
        `
export function f(x: number) {
  if (x > 0 && x < 10) return x;
  if (x >= 10 && x < 100) return x * 2;
  return 0;
}
`.trimStart(),
      );
    }
    return root;
  }

  it('tags each function with its workspace package in JSON output', () => {
    const root = buildMonorepo();
    const r = runCli(['--workspace', '--reporter', 'json'], root);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const packages = new Set<string>(
      parsed.functions.map((f: { package?: string }) => f.package),
    );
    expect(packages).toContain('@demo/alpha');
    expect(packages).toContain('@demo/beta');
  });

  it('--report-by package emits one section per package in table output', () => {
    const root = buildMonorepo();
    const r = runCli(
      ['--workspace', '--report-by', 'package', '--min', '1'],
      root,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('▸ @demo/alpha');
    expect(r.stdout).toContain('▸ @demo/beta');
  });
});
