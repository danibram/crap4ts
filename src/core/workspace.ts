import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

export type WorkspacePackage = {
  /** As written in the package's `package.json#name`, or the dir name as a fallback. */
  name: string;
  /** Absolute path to the package root (the directory holding package.json). */
  path: string;
};

/**
 * Resolve a monorepo's package list from the workspace config nearest to
 * `startDir`. Returns an empty list when nothing workspace-shaped is found
 * — callers treat that as "single-package repo, behave normally".
 *
 * Supported configs (in order of preference):
 *   1. pnpm-workspace.yaml  →  the `packages:` list
 *   2. package.json#workspaces  →  npm / yarn / bun workspaces
 *
 * Turbo's turbo.json is intentionally not consulted: Turbo defers to whichever
 * of the above is present, so reading it adds no signal.
 *
 * `configPath` lets callers point at a specific file when the default
 * walk-up wouldn't find it (e.g. running crap4ts from outside the repo).
 */
export function discoverWorkspace(
  startDir: string,
  configPath?: string,
): WorkspacePackage[] {
  const root = configPath
    ? dirname(resolve(configPath))
    : findWorkspaceRoot(startDir);
  if (!root) return [];

  const globs = readWorkspaceGlobs(root);
  if (globs.length === 0) return [];

  const out: WorkspacePackage[] = [];
  const seen = new Set<string>();
  for (const glob of globs) {
    for (const path of expandWorkspaceGlob(root, glob)) {
      if (seen.has(path)) continue;
      const pkgJson = readPackageName(path);
      if (!pkgJson) continue;
      seen.add(path);
      out.push({ name: pkgJson, path });
    }
  }
  return out;
}

/**
 * Map a file's absolute path to its workspace package, picking the package
 * whose root is the longest prefix of the file. Returns undefined when the
 * file lives outside every package (rare but happens for repo-root scripts).
 */
export function resolvePackageForFile(
  filePath: string,
  packages: WorkspacePackage[],
): string | undefined {
  let best: WorkspacePackage | undefined;
  for (const pkg of packages) {
    if (!isUnderDir(filePath, pkg.path)) continue;
    if (!best || pkg.path.length > best.path.length) best = pkg;
  }
  return best?.name;
}

function isUnderDir(file: string, dir: string): boolean {
  const f = resolve(file);
  const d = resolve(dir);
  if (f === d) return true;
  // Comparing with the trailing separator avoids `/foo` matching `/foo-bar`.
  return f.startsWith(d.endsWith(sep) ? d : d + sep);
}

function findWorkspaceRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);
  for (let i = 0; i < 128; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      const text = safeReadJson(pkg);
      if (text && extractWorkspaceGlobs(text).length > 0) return dir;
    }
    // Stop at git root — workspaces above the repo would be surprising.
    if (existsSync(join(dir, '.git'))) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

function readWorkspaceGlobs(root: string): string[] {
  const pnpmYaml = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpmYaml)) {
    return parsePnpmWorkspaceYaml(readFileSync(pnpmYaml, 'utf8'));
  }
  const pkg = safeReadJson(join(root, 'package.json'));
  if (!pkg) return [];
  return extractWorkspaceGlobs(pkg);
}

/**
 * Pull workspace globs out of a parsed package.json, supporting both the
 * npm/pnpm flat-array form and the yarn-style nested-object form.
 */
function extractWorkspaceGlobs(pkg: Record<string, unknown>): string[] {
  const ws = pkg.workspaces;
  if (Array.isArray(ws)) {
    return ws.filter((s): s is string => typeof s === 'string');
  }
  if (ws && typeof ws === 'object') {
    const nested = (ws as Record<string, unknown>).packages;
    if (Array.isArray(nested)) {
      return nested.filter((s): s is string => typeof s === 'string');
    }
  }
  return [];
}

/**
 * Minimal YAML subset parser — handles only the `packages:` list-of-strings
 * case that pnpm-workspace.yaml uses in practice. We deliberately do NOT
 * pull in a YAML dep for this; the alternative (`yaml` or `js-yaml`) more
 * than triples the install footprint for a feature this narrow.
 */
export function parsePnpmWorkspaceYaml(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inPackagesBlock = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;
    if (/^packages\s*:\s*$/.test(line)) {
      inPackagesBlock = true;
      continue;
    }
    if (inPackagesBlock) {
      const match = line.match(/^\s*-\s+['"]?([^'"]+)['"]?\s*$/);
      if (match) {
        out.push(match[1]!);
        continue;
      }
      // Any non-list line ends the block — pnpm-workspace.yaml has other
      // top-level keys we don't care about (catalog, etc).
      if (!/^\s+/.test(line)) inPackagesBlock = false;
    }
  }
  return out;
}

/**
 * Expand a single workspace glob into the list of package directories it
 * matches. We only handle the trailing-segment forms pnpm and npm
 * workspaces actually use — `pkg`, `pkg/*`, `pkg/**`, with optional `!`
 * negation handled at the caller level (skip patterns starting with `!`).
 */
function expandWorkspaceGlob(root: string, glob: string): string[] {
  if (glob.startsWith('!')) return []; // negation not honoured in v0.5
  const trimmed = glob.replace(/\/+$/, '');
  const parts = trimmed.split('/');
  const tail = parts.at(-1);

  if (tail === '*' || tail === '**') {
    const baseRel = parts.slice(0, -1).join('/');
    const base = baseRel ? join(root, baseRel) : root;
    if (!existsSync(base)) return [];
    if (tail === '*') return listSubdirs(base);
    return listSubdirsRecursive(base);
  }

  // Literal path → treat as the package directly.
  const literal = join(root, trimmed);
  return existsSync(literal) ? [literal] : [];
}

function listSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir)
      .map((name) => join(dir, name))
      .filter((p) => safeIsDir(p));
  } catch {
    return [];
  }
}

function listSubdirsRecursive(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  // Bound depth so a runaway symlink doesn't melt us.
  let safety = 1024;
  while (stack.length > 0 && safety-- > 0) {
    const cur = stack.pop()!;
    if (existsSync(join(cur, 'package.json'))) {
      out.push(cur);
      // Don't recurse into a package — nested packages should be listed
      // explicitly. Mirrors npm/pnpm semantics for `**`.
      continue;
    }
    for (const child of listSubdirs(cur)) stack.push(child);
  }
  return out;
}

function readPackageName(dir: string): string | undefined {
  const json = safeReadJson(join(dir, 'package.json'));
  if (!json) return undefined;
  if (typeof json.name === 'string' && json.name.length > 0) return json.name;
  // Falls back to the directory name when package.json#name is absent. Lets
  // private workspace packages (very common) still appear in reports.
  return dir.split(sep).filter(Boolean).at(-1);
}

function safeReadJson(path: string): Record<string, unknown> | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
