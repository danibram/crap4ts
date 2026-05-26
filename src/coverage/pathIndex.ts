import { isAbsolute } from 'node:path';

/**
 * A coverage report can emit the same file in any of these forms:
 *   - Absolute:                  /home/alice/proj/src/foo.ts
 *   - Relative to workspace:     src/foo.ts
 *   - Relative to sub-package:   packages/foo/src/bar.ts (cwd was that package)
 *   - With ./ or ../ prefixes
 *
 * The previous implementation called `resolve()` on every reported path, which
 * silently re-rooted relative paths against *this* process's cwd — wrong when
 * the user runs crap4ts from a different directory than the one the coverage
 * tool ran in. cargo-crap calls this out at length in its README and we
 * adopt the same fix: a 2-level index.
 *
 *   1. Absolute report paths go into a Map keyed by the absolute path. Direct
 *      hits resolve in O(1).
 *   2. Relative report paths are stored verbatim and consulted only when an
 *      absolute lookup misses. At query time we split the query path into
 *      its components-from-the-end and look for an entry whose components
 *      form a *component-suffix* of the query — never a byte-suffix, so
 *      `foo/bar.ts` does NOT match `oofoo/bar.ts`.
 *
 * If multiple relative entries match, we pick the one with the longest
 * matching component suffix (most specific). Ties (same length) take the
 * first inserted — they only happen with genuinely duplicate report entries.
 */
export class PathIndex<V> {
  private absolute = new Map<string, V>();
  /** Buckets keyed by file basename so we don't walk every entry per query. */
  private byBasename = new Map<string, Array<{ components: string[]; value: V }>>();

  set(reportedPath: string, value: V): void {
    if (isAbsolute(reportedPath)) {
      // Trust absolute paths from the report — they're authoritative.
      this.absolute.set(reportedPath, value);
      return;
    }
    const components = pathComponents(reportedPath);
    if (components.length === 0) return;
    const basename = components[components.length - 1]!;
    const bucket = this.byBasename.get(basename);
    if (bucket) bucket.push({ components, value });
    else this.byBasename.set(basename, [{ components, value }]);
  }

  get(queryPath: string): V | undefined {
    // Pass 1: exact absolute match. Cheap and most common.
    const direct = this.absolute.get(queryPath);
    if (direct !== undefined) return direct;

    // Pass 2: component-suffix lookup. We only consider relative entries
    // whose basename matches the query's basename — cuts the search space
    // from "every entry" to "every entry that shares a filename" without
    // sacrificing correctness.
    const queryComponents = pathComponents(queryPath);
    if (queryComponents.length === 0) return undefined;
    const basename = queryComponents[queryComponents.length - 1]!;
    const bucket = this.byBasename.get(basename);
    if (!bucket) return undefined;

    let best: V | undefined;
    let bestLength = 0;
    for (const { components, value } of bucket) {
      if (!isComponentSuffix(queryComponents, components)) continue;
      if (components.length > bestLength) {
        best = value;
        bestLength = components.length;
      }
    }
    return best;
  }
}

/** Split on either separator so we work cross-platform. */
function pathComponents(p: string): string[] {
  // Strip leading "./" / "../" so they don't poison the suffix.
  return p.split(/[\\/]+/).filter((c) => c.length > 0 && c !== '.' && c !== '..');
}

/**
 * True when `target` is a component-wise tail of `query`. Matching component
 * boundaries — not byte boundaries — is the whole point: `[..., src, foo.ts]`
 * matches `[src, foo.ts]` but never matches `[oofoo, ts]` no matter how the
 * substrings line up.
 */
function isComponentSuffix(query: string[], target: string[]): boolean {
  if (target.length === 0 || target.length > query.length) return false;
  const offset = query.length - target.length;
  for (let i = 0; i < target.length; i++) {
    if (query[offset + i] !== target[i]) return false;
  }
  return true;
}
