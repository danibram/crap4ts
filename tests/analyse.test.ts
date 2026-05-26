import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyse } from '../src/core/analyse.js';

function buildFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crap4ts-fx-'));
  writeFileSync(
    join(dir, 'a.ts'),
    `
export function simple(x: number) {
  return x + 1;
}

export function risky(x: number) {
  if (x > 0) {
    if (x > 10) return 'big';
    return 'small';
  }
  return x < -10 ? 'very-negative' : 'neg';
}
`.trimStart(),
  );
  writeFileSync(
    join(dir, 'a.test.ts'),
    `import { simple } from './a.js';\nsimple(1);\n`,
  );
  writeFileSync(
    join(dir, 'types.d.ts'),
    'export declare function fetcher(): Promise<string>;\n',
  );
  return dir;
}

describe('analyse', () => {
  it('walks a directory and returns functions sorted by CRAP desc', async () => {
    const dir = buildFixture();
    const result = await analyse({ paths: [dir] });

    expect(result.filesScanned).toBe(1); // excludes .test.ts and .d.ts
    expect(result.functions.length).toBe(2);

    const [first, second] = result.functions;
    expect(first!.name).toBe('risky');
    expect(second!.name).toBe('simple');
    expect(first!.crap).toBeGreaterThan(second!.crap);
    expect(first!.coverage).toBe(0);
    expect(first!.complexity).toBeGreaterThan(1);
  });

  it('attributes synthetic coverage to functions', async () => {
    const dir = buildFixture();
    const fileA = join(dir, 'a.ts');
    const covPath = join(dir, 'coverage-final.json');

    // simple is on line 1; risky on line 5. Cover only `simple`.
    writeFileSync(
      covPath,
      JSON.stringify({
        [fileA]: {
          path: fileA,
          statementMap: {
            '0': { start: { line: 1 } },
            '1': { start: { line: 2 } },
            '2': { start: { line: 5 } },
            '3': { start: { line: 6 } },
            '4': { start: { line: 7 } },
          },
          s: { '0': 1, '1': 1, '2': 0, '3': 0, '4': 0 },
        },
      }),
    );

    const result = await analyse({
      paths: [dir],
      coverageFile: covPath,
      coverageFormat: 'auto',
    });

    expect(result.coverageFormat).toBe('istanbul');
    const simple = result.functions.find((f) => f.name === 'simple');
    const risky = result.functions.find((f) => f.name === 'risky');
    expect(simple?.coverage).toBe(100);
    expect(risky?.coverage).toBe(0);
    // With coverage=100 the formula reduces to comp itself.
    expect(simple?.crap).toBe(simple?.complexity);
  });

  it('respects custom ignore globs', async () => {
    const dir = buildFixture();
    const result = await analyse({
      paths: [dir],
      ignore: ['**/a.ts'],
    });
    expect(result.functions).toEqual([]);
    expect(result.filesScanned).toBe(0);
  });
});
