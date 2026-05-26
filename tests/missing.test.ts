import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyse } from '../src/core/analyse.js';

function buildFixture(): { dir: string; covPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'crap4ts-missing-'));
  writeFileSync(
    join(dir, 'a.ts'),
    `
export function tested(x: number) {
  if (x > 0) return 1;
  return 0;
}

export function untested(x: number) {
  if (x > 0) return 1;
  return 0;
}
`.trimStart(),
  );

  // Only tested() has coverage data, lines 1..4. untested() lives at lines 6+
  // and has no statements in the coverage report → measuredCoverage returns
  // undefined → --missing policy decides.
  const covPath = join(dir, 'cov.json');
  writeFileSync(
    covPath,
    JSON.stringify({
      [join(dir, 'a.ts')]: {
        path: join(dir, 'a.ts'),
        statementMap: {
          '0': { start: { line: 1 } },
          '1': { start: { line: 2 } },
          '2': { start: { line: 3 } },
          '3': { start: { line: 4 } },
        },
        s: { '0': 1, '1': 1, '2': 1, '3': 1 },
      },
    }),
  );
  return { dir, covPath };
}

describe('--missing policy', () => {
  it('pessimistic: untested functions get coverage=0 and stay in results', async () => {
    const { dir, covPath } = buildFixture();
    const result = await analyse({
      paths: [dir],
      coverageFile: covPath,
      missing: 'pessimistic',
    });

    const tested = result.functions.find((f) => f.name === 'tested')!;
    const untested = result.functions.find((f) => f.name === 'untested')!;

    expect(tested.coverage).toBe(100);
    expect(tested.coverageMissing).toBe(false);
    expect(untested.coverage).toBe(0);
    expect(untested.coverageMissing).toBe(true);
  });

  it('optimistic: untested functions get coverage=100 (so CRAP = comp)', async () => {
    const { dir, covPath } = buildFixture();
    const result = await analyse({
      paths: [dir],
      coverageFile: covPath,
      missing: 'optimistic',
    });

    const untested = result.functions.find((f) => f.name === 'untested')!;
    expect(untested.coverage).toBe(100);
    expect(untested.coverageMissing).toBe(true);
    expect(untested.crap).toBe(untested.complexity); // CRAP collapses to comp
  });

  it('skip: untested functions are dropped entirely', async () => {
    const { dir, covPath } = buildFixture();
    const result = await analyse({
      paths: [dir],
      coverageFile: covPath,
      missing: 'skip',
    });

    expect(result.functions.map((f) => f.name)).toEqual(['tested']);
  });

  it('when no coverage file is provided, all functions are flagged as missing', async () => {
    const { dir } = buildFixture();
    const result = await analyse({ paths: [dir] });

    expect(result.functions.every((f) => f.coverageMissing)).toBe(true);
    expect(result.functions.every((f) => f.coverage === 0)).toBe(true); // pessimistic default
  });
});
