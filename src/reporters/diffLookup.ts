import type { CrapFunction, DiffEntry, DiffResult } from '../core/types.js';

/**
 * Build an O(1) lookup from a current-side function to its diff entry.
 * Uses object identity, so callers must pass the exact CrapFunction instances
 * that went into the diff (we pass the `visible` array through both paths in
 * the CLI). Falling back to a file::name key would be fine too, but identity
 * is faster and avoids string churn for large reports.
 */
export function makeDiffLookup(
  diff: DiffResult,
): (fn: CrapFunction) => DiffEntry | undefined {
  const byIdentity = new WeakMap<CrapFunction, DiffEntry>();
  for (const entry of diff.entries) {
    if (entry.current) byIdentity.set(entry.current, entry);
  }
  return (fn) => byIdentity.get(fn);
}

export function deltaSign(delta: number): string {
  if (delta > 0) return `+${delta.toFixed(1)}`;
  if (delta < 0) return delta.toFixed(1);
  return '0.0';
}
