import { describe, expect, it } from 'vitest';
import { diffAgainstBaseline } from '../src/core/diff.js';
import type { BaselineFunction, CrapFunction } from '../src/core/types.js';

function fn(over: Partial<CrapFunction>): CrapFunction {
  return {
    file: 'src/a.ts',
    name: 'foo',
    startLine: 1,
    endLine: 5,
    complexity: 3,
    coverage: 100,
    crap: 3,
    coverageMissing: false,
    hash: '0000',
    ...over,
  };
}

function bfn(over: Partial<BaselineFunction>): BaselineFunction {
  return {
    file: 'src/a.ts',
    name: 'foo',
    startLine: 1,
    endLine: 5,
    complexity: 3,
    coverage: 100,
    crap: 3,
    hash: '0000',
    ...over,
  };
}

describe('diffAgainstBaseline', () => {
  it('classifies a regressed function', () => {
    const cur = [fn({ name: 'foo', crap: 10 })];
    const base = [bfn({ name: 'foo', crap: 5 })];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.regressed).toBe(1);
    expect(out.entries[0]!.status).toBe('regressed');
    expect(out.entries[0]!.delta).toBeCloseTo(5);
  });

  it('classifies an improvement', () => {
    const cur = [fn({ name: 'foo', crap: 3 })];
    const base = [bfn({ name: 'foo', crap: 12 })];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.improved).toBe(1);
    expect(out.entries[0]!.status).toBe('improved');
    expect(out.entries[0]!.delta).toBeCloseTo(-9);
  });

  it('respects epsilon for "unchanged"', () => {
    const cur = [fn({ name: 'foo', crap: 5.005 })];
    const base = [bfn({ name: 'foo', crap: 5 })];
    const out = diffAgainstBaseline(cur, base, { epsilon: 0.01 });
    expect(out.summary.unchanged).toBe(1);
    expect(out.summary.regressed).toBe(0);
  });

  it('flags a new function', () => {
    const cur = [fn({ name: 'fresh', crap: 50, hash: 'aaaa' })];
    const base: BaselineFunction[] = [];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.new).toBe(1);
    expect(out.entries[0]!.status).toBe('new');
  });

  it('flags a removed function', () => {
    const cur: CrapFunction[] = [];
    const base = [bfn({ name: 'gone' })];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.removed).toBe(1);
  });

  it('detects a move via hash match', () => {
    const cur = [fn({ file: 'src/b.ts', name: 'foo', hash: 'deadbeef' })];
    const base = [bfn({ file: 'src/a.ts', name: 'foo', hash: 'deadbeef' })];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.moved).toBe(1);
    expect(out.summary.new).toBe(0);
    expect(out.summary.removed).toBe(0);
  });

  it('detects a rename when body hash is identical', () => {
    const cur = [fn({ file: 'src/a.ts', name: 'newName', hash: 'beef' })];
    const base = [bfn({ file: 'src/a.ts', name: 'oldName', hash: 'beef' })];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.moved).toBe(1);
  });

  it('does not match by hash when both sides lack a hash', () => {
    const cur = [fn({ file: 'src/b.ts', name: 'foo', hash: '' })];
    const base = [bfn({ file: 'src/a.ts', name: 'foo', hash: undefined })];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.moved).toBe(0);
    expect(out.summary.new).toBe(1);
    expect(out.summary.removed).toBe(1);
  });

  it('handles multiple <anonymous> functions in the same file', () => {
    // Regression test for the bug we found running crap4ts against itself:
    // when a file has several anonymous arrow functions, their `file::name`
    // keys collide and a naive Map would lose all but one. Pass 1 (hash)
    // must rescue them — same code on both sides means same hashes, so they
    // pair up cleanly.
    const cur = [
      fn({ file: 'src/r.ts', name: '<anonymous>', crap: 6, hash: 'aaa' }),
      fn({ file: 'src/r.ts', name: '<anonymous>', crap: 12, hash: 'bbb' }),
      fn({ file: 'src/r.ts', name: '<anonymous>', crap: 4, hash: 'ccc' }),
    ];
    const base = [
      bfn({ file: 'src/r.ts', name: '<anonymous>', crap: 6, hash: 'aaa' }),
      bfn({ file: 'src/r.ts', name: '<anonymous>', crap: 12, hash: 'bbb' }),
      bfn({ file: 'src/r.ts', name: '<anonymous>', crap: 4, hash: 'ccc' }),
    ];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.unchanged).toBe(3);
    expect(out.summary.regressed).toBe(0);
    expect(out.summary.new).toBe(0);
    expect(out.summary.removed).toBe(0);
  });

  it('detects a body change on an anonymous function when only one exists', () => {
    // Pass 1 misses (hash differs), Pass 2 succeeds (file::name unique on
    // both sides). End result: one regression, not new+removed.
    const cur = [
      fn({ file: 'src/x.ts', name: '<anonymous>', crap: 20, hash: 'changed' }),
    ];
    const base = [
      bfn({ file: 'src/x.ts', name: '<anonymous>', crap: 5, hash: 'orig' }),
    ];
    const out = diffAgainstBaseline(cur, base);
    expect(out.summary.regressed).toBe(1);
  });

  it('puts regressions first in entry order', () => {
    const cur = [
      fn({ name: 'a', crap: 10 }),
      fn({ name: 'b', file: 'src/b.ts', crap: 50 }),
    ];
    const base = [bfn({ name: 'a', crap: 5 })]; // a regressed, b is new
    const out = diffAgainstBaseline(cur, base);
    expect(out.entries[0]!.status).toBe('regressed');
    expect(out.entries[1]!.status).toBe('new');
  });
});
