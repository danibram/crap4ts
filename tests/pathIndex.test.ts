import { describe, expect, it } from 'vitest';
import { PathIndex } from '../src/coverage/pathIndex.js';

describe('PathIndex', () => {
  it('hits on an exact absolute path', () => {
    const ix = new PathIndex<string>();
    ix.set('/repo/src/foo.ts', 'A');
    expect(ix.get('/repo/src/foo.ts')).toBe('A');
  });

  it('matches a relative report path against an absolute query (workspace root)', () => {
    const ix = new PathIndex<string>();
    ix.set('src/foo.ts', 'A');
    expect(ix.get('/home/me/proj/src/foo.ts')).toBe('A');
  });

  it('matches a sub-package-relative path against the absolute query from repo root', () => {
    // The motivating bug: coverage tool ran in packages/foo/ and wrote
    // `src/bar.ts` (relative to the sub-package). crap4ts runs from repo
    // root, ts-morph gives `/repo/packages/foo/src/bar.ts`.
    const ix = new PathIndex<string>();
    ix.set('src/bar.ts', 'A');
    expect(ix.get('/repo/packages/foo/src/bar.ts')).toBe('A');
  });

  it('strips ./ prefixes when matching', () => {
    const ix = new PathIndex<string>();
    ix.set('./src/foo.ts', 'A');
    expect(ix.get('/repo/src/foo.ts')).toBe('A');
  });

  it('does NOT match on byte-suffix (oofoo vs foo)', () => {
    const ix = new PathIndex<string>();
    ix.set('foo/bar.ts', 'A');
    expect(ix.get('/proj/oofoo/bar.ts')).toBeUndefined();
  });

  it('prefers the longest component-suffix match when multiple candidates share a basename', () => {
    const ix = new PathIndex<string>();
    ix.set('src/foo.ts', 'short');
    ix.set('packages/foo/src/foo.ts', 'long');
    expect(ix.get('/repo/packages/foo/src/foo.ts')).toBe('long');
  });

  it('returns undefined for a basename with no candidates', () => {
    const ix = new PathIndex<string>();
    ix.set('src/foo.ts', 'A');
    expect(ix.get('/repo/src/different.ts')).toBeUndefined();
  });

  it('does not silently fall through from absolute report to absolute query', () => {
    // Cross-machine absolute paths: report from CI, query from a laptop.
    // We intentionally do NOT match in this case — different absolute
    // roots are a real identity difference and silently merging them
    // would hide bugs in path remapping. A future --path-prefix flag
    // would handle that explicitly.
    const ix = new PathIndex<string>();
    ix.set('/home/runner/work/proj/src/foo.ts', 'CI');
    expect(ix.get('/Users/dani/proj/src/foo.ts')).toBeUndefined();
  });

  it('absolute report path still wins over a less-specific relative entry', () => {
    const ix = new PathIndex<string>();
    ix.set('/repo/src/foo.ts', 'abs');
    ix.set('src/foo.ts', 'rel');
    expect(ix.get('/repo/src/foo.ts')).toBe('abs');
  });
});
