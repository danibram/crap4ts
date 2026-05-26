import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Reads the nearest .gitignore by walking up from `startDir` to the git root
 * (or filesystem root) and converts its patterns into the glob form the
 * tree walker already understands. Returns an empty list when no .gitignore
 * is found — by design, a project without one gets no extra ignores.
 *
 * Caveats (documented):
 *   - Only the *nearest* .gitignore is read. Nested .gitignores deeper in
 *     the tree are not consulted. Full gitignore precedence semantics would
 *     require parsing every .gitignore in the scanned subtree.
 *   - Negation patterns (`!foo`) are dropped. They're rare in practice for
 *     source-file globs and supporting them correctly requires the full
 *     ordered-overrides model from gitignore(5).
 *   - Comments (`#`), blank lines, and patterns with escaped `#` work the
 *     same as git.
 */
export function loadGitignoreGlobs(startDir: string): string[] {
  const found = findUpwards(startDir, '.gitignore');
  if (!found) return [];
  const root = dirname(found);
  const text = readFileSync(found, 'utf8');
  return parseGitignore(text, root);
}

function findUpwards(startDir: string, filename: string): string | undefined {
  let dir = resolve(startDir);
  for (let i = 0; i < 128; i++) {
    const candidate = resolve(dir, filename);
    if (existsSync(candidate)) return candidate;
    if (existsSync(resolve(dir, '.git'))) {
      // We've hit the repo root without finding a .gitignore — stop.
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

/**
 * Translate gitignore patterns into globs anchored at the absolute root.
 * The tree walker matches absolute paths, so every glob we emit starts with
 * either an absolute prefix (anchored patterns) or `**​/` (any-depth patterns).
 *
 * Exported for tests.
 */
export function parseGitignore(text: string, root: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    // Negation isn't supported in this minimal parser; silently drop.
    if (trimmed.startsWith('!')) continue;

    // Strip leading "./" — gitignore doesn't strictly require it but tools
    // emit it sometimes and we want to normalise.
    let pattern = trimmed.replace(/^\.\//, '');

    const dirOnly = pattern.endsWith('/');
    if (dirOnly) pattern = pattern.slice(0, -1);

    // A pattern is "anchored" (relative to the .gitignore's dir) when it
    // contains a slash anywhere except at the end. No slash → "match the
    // basename anywhere in the tree", just like git.
    const anchored = pattern.includes('/');
    const stripped = pattern.replace(/^\//, '');

    // The walker tests *file* paths, so to ignore a directory we need a
    // `/**` glob that matches files inside it. We always emit the dir-inside
    // form; for non-dirOnly patterns we also emit the bare path so the
    // pattern catches files named exactly that too.
    if (anchored) {
      if (!dirOnly) out.push(`${root}/${stripped}`);
      out.push(`${root}/${stripped}/**`);
    } else {
      if (!dirOnly) out.push(`${root}/**/${stripped}`);
      out.push(`${root}/**/${stripped}/**`);
    }
  }
  return out;
}
