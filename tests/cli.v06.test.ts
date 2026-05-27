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

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'crap4ts-v06-'));
}

const TANGLED = `
export function tangled(x: number, y: number) {
  if (x > 0 && y > 0) return x * y;
  if (x < 0 || y < 0) return Math.abs(x) + Math.abs(y);
  return x ? y : (y ?? 0);
}
`.trimStart();

describe('CLI v0.6 — scope-qualified names', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('qualifies method names with their class', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'sample.ts'),
      `
export class UserService {
  validate(x: number) {
    if (x > 0 && x < 10) return true;
    return false;
  }
}
export class OrderService {
  validate(x: number) {
    return x > 0;
  }
}
`.trimStart(),
    );
    const r = runCli(['.', '--reporter', 'json'], dir);
    expect(r.status).toBe(0);
    const names = JSON.parse(r.stdout).functions.map(
      (f: { name: string }) => f.name,
    );
    expect(names).toContain('UserService.validate');
    expect(names).toContain('OrderService.validate');
  });
});

describe('CLI v0.6 — --complexity cognitive', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('reports complexityMetric in the JSON envelope', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'sample.ts'), TANGLED);
    const r = runCli(
      ['.', '--reporter', 'json', '--complexity', 'cognitive'],
      dir,
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).complexityMetric).toBe('cognitive');
  });

  it('defaults to cyclomatic', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'sample.ts'), TANGLED);
    const r = runCli(['.', '--reporter', 'json'], dir);
    expect(JSON.parse(r.stdout).complexityMetric).toBe('cyclomatic');
  });

  it('rejects an unknown metric', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'sample.ts'), TANGLED);
    const r = runCli(['.', '--complexity', 'halstead'], dir);
    expect(r.status).toBe(2);
  });
});

describe('CLI v0.6 — per-path overrides', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('a legacy override keeps a high-CRAP function from failing the gate', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'legacy'));
    // Same tangled body in both; CRAP ~56, above the global failOn of 50.
    writeFileSync(join(dir, 'src', 'a.ts'), TANGLED);
    writeFileSync(join(dir, 'legacy', 'b.ts'), TANGLED);
    writeFileSync(
      join(dir, 'crap.config.json'),
      JSON.stringify({
        threshold: 30,
        failOn: 50,
        overrides: [{ paths: 'legacy/**', failOn: 500 }],
      }),
    );

    // src/a.ts breaches failOn 50 → exit 1.
    const r = runCli(['.'], dir);
    expect(r.status).toBe(1);

    // Ignore src/, leaving only legacy/ (override failOn 500) → exit 0.
    const r2 = runCli(['.', '--ignore', '**/src/**'], dir);
    expect(r2.status).toBe(0);
  });
});

describe('CLI v0.6 — hotspots', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  function gitInit(dir: string) {
    const opts = { cwd: dir, stdio: 'ignore' as const };
    execFileSync('git', ['init'], opts);
    execFileSync('git', ['config', 'user.email', 't@t.co'], opts);
    execFileSync('git', ['config', 'user.name', 'T'], opts);
  }

  it('adds churn + hotspot fields and the HOT column', () => {
    const dir = tmp();
    gitInit(dir);
    writeFileSync(join(dir, 'sample.ts'), TANGLED);
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'one'], { cwd: dir, stdio: 'ignore' });
    // A second commit touching the file bumps its churn to 2.
    writeFileSync(join(dir, 'sample.ts'), `${TANGLED}\nexport const z = 1;\n`);
    execFileSync('git', ['commit', '-am', 'two'], {
      cwd: dir,
      stdio: 'ignore',
    });

    const json = runCli(['.', '--hotspots', '--reporter', 'json'], dir);
    expect(json.status).toBe(0);
    const parsed = JSON.parse(json.stdout);
    expect(parsed.churnSince).toBeDefined();
    const tangled = parsed.functions.find(
      (f: { name: string }) => f.name === 'tangled',
    );
    expect(tangled.churn).toBe(2);
    expect(tangled.hotspot).toBeCloseTo(tangled.crap * 2);

    const table = runCli(['.', '--hotspots'], dir);
    expect(table.stdout).toContain('HOT');
    expect(table.stdout).toContain('CHURN');
  });

  it('degrades to churn 0 outside a git repo (no crash)', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'sample.ts'), TANGLED);
    const r = runCli(['.', '--hotspots', '--reporter', 'json'], dir);
    expect(r.status).toBe(0);
    const tangled = JSON.parse(r.stdout).functions.find(
      (f: { name: string }) => f.name === 'tangled',
    );
    expect(tangled.churn).toBe(0);
    expect(tangled.hotspot).toBe(0);
  });
});

describe('CLI v0.6 — merge-coverage', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('sums per-statement hits across reports for the same file', () => {
    const dir = tmp();
    const mk = (sub: string, hits: [number, number]) => {
      mkdirSync(join(dir, sub), { recursive: true });
      writeFileSync(
        join(dir, sub, 'coverage-final.json'),
        JSON.stringify({
          'src/shared.ts': {
            path: 'src/shared.ts',
            statementMap: {
              '0': { start: { line: 1 } },
              '1': { start: { line: 2 } },
            },
            s: { '0': hits[0], '1': hits[1] },
          },
        }),
      );
    };
    mk('a/coverage', [1, 0]);
    mk('b/coverage', [0, 1]);

    const r = runCli(
      ['merge-coverage', '*/coverage/coverage-final.json', '-o', 'merged.json'],
      dir,
    );
    expect(r.status).toBe(0);
    const merged = JSON.parse(readFileSync(join(dir, 'merged.json'), 'utf8'));
    // 1+0 and 0+1 → both statements now show 1 hit.
    expect(merged['src/shared.ts'].s).toEqual({ '0': 1, '1': 1 });
  });

  it('errors when no files match', () => {
    const dir = tmp();
    const r = runCli(['merge-coverage', 'nope/*.json'], dir);
    expect(r.status).toBe(2);
  });
});

describe('CLI v0.6 — --reporter eslint', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('emits the ESLint JSON shape with severity 2 for fail-on breaches', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'sample.ts'), TANGLED);
    const r = runCli(['.', '--reporter', 'eslint', '--fail-on', '50'], dir);
    expect(r.status).toBe(1); // gate trips
    const results = JSON.parse(r.stdout);
    expect(Array.isArray(results)).toBe(true);
    const file = results.find((f: { filePath: string }) =>
      f.filePath.endsWith('sample.ts'),
    );
    expect(file).toBeDefined();
    const msg = file.messages.find((m: { message: string }) =>
      m.message.startsWith('tangled:'),
    );
    expect(msg.severity).toBe(2);
    expect(msg.ruleId).toBe('crap4ts/fail-on');
    expect(msg.line).toBe(1);
  });
});

describe('CLI v0.6 — crap4ts-disable comments', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('bun', ['run', 'build'], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  it('disable-next-function skips just that function', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'sample.ts'),
      `
/* crap4ts-disable-next-function */
export function hidden(x: number) {
  if (x > 0 && x < 10) return x;
  if (x > 10) return x * 2;
  return 0;
}
export function shown(x: number) {
  if (x > 0) return x;
  return 0;
}
`.trimStart(),
    );
    const r = runCli(['.', '--reporter', 'json'], dir);
    expect(r.status).toBe(0);
    const names = JSON.parse(r.stdout).functions.map(
      (f: { name: string }) => f.name,
    );
    expect(names).toContain('shown');
    expect(names).not.toContain('hidden');
  });

  it('disable-file skips the whole file', () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'gen.ts'),
      `
/* crap4ts-disable-file */
export function a(x: number) { return x > 0 ? 1 : 0; }
export function b(x: number) { return x; }
`.trimStart(),
    );
    writeFileSync(
      join(dir, 'real.ts'),
      'export function real(x: number) { return x > 0 ? 1 : 0; }\n',
    );
    const r = runCli(['.', '--reporter', 'json'], dir);
    expect(r.status).toBe(0);
    const names = JSON.parse(r.stdout).functions.map(
      (f: { name: string }) => f.name,
    );
    expect(names).toContain('real');
    expect(names).not.toContain('a');
    expect(names).not.toContain('b');
  });
});
