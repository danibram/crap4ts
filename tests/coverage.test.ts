import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFormat, loadCoverage } from '../src/coverage/index.js';

function tmpFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'crap4ts-cov-'));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

describe('detectFormat', () => {
  it('detects lcov from TN:', () => {
    const f = tmpFile('lcov.info', 'TN:\nSF:/x.ts\nDA:1,1\nend_of_record\n');
    expect(detectFormat(f)).toBe('lcov');
  });

  it('detects lcov from SF: (no TN preamble)', () => {
    const f = tmpFile('lcov.info', 'SF:/x.ts\nDA:1,0\nend_of_record\n');
    expect(detectFormat(f)).toBe('lcov');
  });

  it('detects v8 when `"all":true` marker present', () => {
    const f = tmpFile(
      'cov.json',
      '{"/x.ts":{"path":"/x.ts","all":true,"statementMap":{},"s":{}}}',
    );
    expect(detectFormat(f)).toBe('v8');
  });

  it('defaults JSON to istanbul when v8 marker absent', () => {
    const f = tmpFile(
      'cov.json',
      '{"/x.ts":{"path":"/x.ts","statementMap":{},"s":{}}}',
    );
    expect(detectFormat(f)).toBe('istanbul');
  });

  it('throws on garbage input', () => {
    const f = tmpFile('garbage.txt', 'this is not coverage data');
    expect(() => detectFormat(f)).toThrow(/Cannot detect coverage format/);
  });
});

describe('loadCoverage — JSON (v8/istanbul)', () => {
  it('returns per-range coverage', async () => {
    const file = '/abs/src/a.ts';
    const f = tmpFile(
      'cov.json',
      JSON.stringify({
        [file]: {
          path: file,
          statementMap: {
            '0': { start: { line: 1 } },
            '1': { start: { line: 5 } },
            '2': { start: { line: 10 } },
            '3': { start: { line: 15 } },
          },
          s: { '0': 1, '1': 0, '2': 3, '3': 0 },
        },
      }),
    );
    const cov = await loadCoverage(f, 'auto');
    expect(cov.format).toBe('istanbul');

    // Full range: 4 statements, 2 covered.
    expect(cov.getRangeCoverage(file, 1, 20)).toEqual({ total: 4, covered: 2 });
    // Subset 1..7: statements at lines 1 and 5 → 1 covered.
    expect(cov.getRangeCoverage(file, 1, 7)).toEqual({ total: 2, covered: 1 });
    // No statements in range → undefined.
    expect(cov.getRangeCoverage(file, 100, 200)).toBeUndefined();
  });

  it('returns undefined for unknown files', async () => {
    const file = '/abs/src/a.ts';
    const f = tmpFile(
      'cov.json',
      JSON.stringify({
        [file]: {
          path: file,
          statementMap: { '0': { start: { line: 1 } } },
          s: { '0': 1 },
        },
      }),
    );
    const cov = await loadCoverage(f, 'auto');
    expect(cov.getRangeCoverage('/other/file.ts', 1, 10)).toBeUndefined();
  });
});

describe('loadCoverage — LCOV', () => {
  it('parses DA: records and computes range coverage', async () => {
    const file = '/abs/src/b.ts';
    const lcov = [
      'TN:',
      `SF:${file}`,
      'DA:1,1',
      'DA:2,0',
      'DA:3,5',
      'DA:10,0',
      'DA:11,0',
      'LF:5',
      'LH:2',
      'end_of_record',
      '',
    ].join('\n');
    const f = tmpFile('lcov.info', lcov);
    const cov = await loadCoverage(f, 'auto');
    expect(cov.format).toBe('lcov');

    expect(cov.getRangeCoverage(file, 1, 20)).toEqual({ total: 5, covered: 2 });
    expect(cov.getRangeCoverage(file, 1, 3)).toEqual({ total: 3, covered: 2 });
    expect(cov.getRangeCoverage(file, 10, 11)).toEqual({ total: 2, covered: 0 });
  });

  it('takes max hits when a line appears multiple times', async () => {
    const file = '/abs/src/c.ts';
    const lcov = [
      `SF:${file}`,
      'DA:1,0',
      'DA:1,3', // same line, later branch covered → should win
      'end_of_record',
    ].join('\n');
    const f = tmpFile('lcov.info', lcov);
    const cov = await loadCoverage(f, 'auto');
    expect(cov.getRangeCoverage(file, 1, 1)).toEqual({ total: 1, covered: 1 });
  });

  it('handles multiple files in one report', async () => {
    const fA = '/abs/src/a.ts';
    const fB = '/abs/src/b.ts';
    const lcov = [
      `SF:${fA}`,
      'DA:1,1',
      'DA:2,1',
      'end_of_record',
      `SF:${fB}`,
      'DA:1,0',
      'end_of_record',
    ].join('\n');
    const f = tmpFile('lcov.info', lcov);
    const cov = await loadCoverage(f, 'auto');
    expect(cov.getRangeCoverage(fA, 1, 10)).toEqual({ total: 2, covered: 2 });
    expect(cov.getRangeCoverage(fB, 1, 10)).toEqual({ total: 1, covered: 0 });
  });
});
