import { describe, expect, it } from 'vitest';
import { crap } from '../src/core/crap.js';

describe('crap formula', () => {
  it('returns complexity when coverage is 100%', () => {
    expect(crap(5, 100)).toBe(5);
    expect(crap(20, 100)).toBe(20);
  });

  it('returns comp^2 + comp when coverage is 0%', () => {
    expect(crap(5, 0)).toBe(30); // 25 + 5
    expect(crap(10, 0)).toBe(110); // 100 + 10
  });

  it('matches paper example values', () => {
    // comp=10, cov=50 → 100 * 0.125 + 10 = 22.5
    expect(crap(10, 50)).toBeCloseTo(22.5, 5);
    // comp=4, cov=75 → 16 * 0.015625 + 4 = 4.25
    expect(crap(4, 75)).toBeCloseTo(4.25, 5);
  });

  it('clamps coverage outside [0,100]', () => {
    expect(crap(5, -10)).toBe(crap(5, 0));
    expect(crap(5, 150)).toBe(crap(5, 100));
  });

  it('treats minimum complexity as 1', () => {
    expect(crap(1, 0)).toBe(2);
    expect(crap(1, 100)).toBe(1);
  });
});
