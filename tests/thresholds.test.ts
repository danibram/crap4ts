import { describe, expect, it } from 'vitest';
import { makeThresholdResolver } from '../src/core/thresholds.js';

describe('makeThresholdResolver', () => {
  const cwd = '/repo';

  it('returns the global values when no override matches', () => {
    const r = makeThresholdResolver(30, 100, [], cwd);
    expect(r('/repo/src/a.ts')).toEqual({ threshold: 30, failOn: 100 });
  });

  it('applies a matching override', () => {
    const r = makeThresholdResolver(
      30,
      100,
      [{ paths: 'legacy/**', threshold: 200, failOn: 500 }],
      cwd,
    );
    expect(r('/repo/legacy/old.ts')).toEqual({ threshold: 200, failOn: 500 });
    expect(r('/repo/src/new.ts')).toEqual({ threshold: 30, failOn: 100 });
  });

  it('last matching override wins (ESLint-style)', () => {
    const r = makeThresholdResolver(
      30,
      100,
      [
        { paths: '**/*.ts', threshold: 50 },
        { paths: 'legacy/**', threshold: 200 },
      ],
      cwd,
    );
    // legacy/old.ts matches both; the later (legacy) entry wins.
    expect(r('/repo/legacy/old.ts').threshold).toBe(200);
    // src/new.ts only matches the first.
    expect(r('/repo/src/new.ts').threshold).toBe(50);
  });

  it('failOn: null clears the gate for matching paths', () => {
    const r = makeThresholdResolver(
      30,
      100,
      [{ paths: 'generated/**', failOn: null }],
      cwd,
    );
    expect(r('/repo/generated/x.ts')).toEqual({
      threshold: 30,
      failOn: undefined,
    });
  });

  it('accepts an array of paths in one override', () => {
    const r = makeThresholdResolver(
      30,
      100,
      [{ paths: ['legacy/**', '**/*.gen.ts'], threshold: 300 }],
      cwd,
    );
    expect(r('/repo/legacy/a.ts').threshold).toBe(300);
    expect(r('/repo/src/b.gen.ts').threshold).toBe(300);
    expect(r('/repo/src/b.ts').threshold).toBe(30);
  });

  it('an override may set only threshold, inheriting global failOn', () => {
    const r = makeThresholdResolver(
      30,
      100,
      [{ paths: 'legacy/**', threshold: 200 }],
      cwd,
    );
    expect(r('/repo/legacy/x.ts')).toEqual({ threshold: 200, failOn: 100 });
  });
});
