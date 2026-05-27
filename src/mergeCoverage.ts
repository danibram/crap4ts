import {
  type Dirent,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * `crap4ts merge-coverage <glob...> [-o out.json]`
 *
 * Monorepos that run tests per-package emit one istanbul/v8 coverage-final.json
 * per package. crap4ts consumes a single coverage file, so this subcommand
 * merges them: union of file records, summing per-statement hit counts where
 * the same file appears in more than one report.
 *
 * JSON (istanbul / v8) only for now. LCOV merge is a separate shape and rarer
 * in the per-package-output pattern — deferred.
 */
export async function runMergeCoverage(argv: string[]): Promise<number> {
  let values: MergeFlags;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv,
      options: MERGE_OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values as MergeFlags;
    positionals = parsed.positionals;
  } catch (err) {
    process.stderr.write(`${String(err)}\n\n${MERGE_HELP}`);
    return 2;
  }
  if (values.help) {
    process.stdout.write(MERGE_HELP);
    return 0;
  }
  if (positionals.length === 0) {
    process.stderr.write(
      `crap4ts merge-coverage: no input globs given\n\n${MERGE_HELP}`,
    );
    return 2;
  }

  const files = expandInputs(positionals);
  if (files.length === 0) {
    process.stderr.write(
      'crap4ts merge-coverage: no coverage files matched the given patterns\n',
    );
    return 2;
  }

  const merged: CoverageJson = {};
  let mergedCount = 0;
  for (const file of files) {
    let parsed: CoverageJson;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8')) as CoverageJson;
    } catch (err) {
      process.stderr.write(
        `crap4ts merge-coverage: skipping ${file} — ${String(err)}\n`,
      );
      continue;
    }
    mergeInto(merged, parsed);
    mergedCount++;
  }

  const out = `${JSON.stringify(merged, null, 2)}\n`;
  if (values.output) {
    writeFileSync(resolve(values.output), out);
    process.stderr.write(
      `crap4ts: merged ${mergedCount} file(s) → ${values.output} ` +
        `(${Object.keys(merged).length} source files)\n`,
    );
  } else {
    process.stdout.write(out);
  }
  return 0;
}

type MergeFlags = { output?: string; help?: boolean };

const MERGE_OPTIONS = {
  output: { type: 'string', short: 'o' },
  help: { type: 'boolean', short: 'h' },
} as const;

const MERGE_HELP = `crap4ts merge-coverage — combine per-package istanbul/v8 coverage into one file.

Usage:
  crap4ts merge-coverage <glob...> [-o <file>]

Arguments:
  <glob...>           One or more coverage files or globs, e.g.
                      'packages/*/coverage/coverage-final.json'

Options:
  -o, --output <file> Write merged JSON here (default: stdout)
  -h, --help          Show this help

Example:
  crap4ts merge-coverage 'packages/*/coverage/coverage-final.json' -o coverage/merged.json
  crap4ts --coverage coverage/merged.json --workspace
`;

type StatementLoc = { start: { line: number }; end?: { line: number } };
type FileRecord = {
  path?: string;
  statementMap: Record<string, StatementLoc>;
  s: Record<string, number>;
  [k: string]: unknown;
};
type CoverageJson = Record<string, FileRecord>;

/**
 * Merge `src` into `dest`. For a file seen the first time we deep-copy its
 * record; on subsequent sightings we sum the `s` hit counters key-by-key.
 * We assume the statementMap is identical for the same file across reports
 * (true when they're built from the same source) — if it diverges we keep
 * the first one, which is the safe conservative choice.
 */
function mergeInto(dest: CoverageJson, src: CoverageJson): void {
  for (const [key, record] of Object.entries(src)) {
    const existing = dest[key];
    if (!existing) {
      dest[key] = structuredClone(record);
      continue;
    }
    for (const [stmtId, hits] of Object.entries(record.s ?? {})) {
      existing.s[stmtId] = (existing.s[stmtId] ?? 0) + hits;
    }
  }
}

/**
 * Expand the positional inputs into a concrete file list. A literal path is
 * used as-is; a glob containing `*` is matched by walking from the longest
 * static prefix directory.
 */
function expandInputs(inputs: string[]): string[] {
  const out = new Set<string>();
  for (const input of inputs) {
    if (!input.includes('*')) {
      const abs = resolve(input);
      if (existsSync(abs)) out.add(abs);
      continue;
    }
    for (const match of expandGlob(input)) out.add(match);
  }
  return [...out];
}

function expandGlob(glob: string): string[] {
  const abs = resolve(glob);
  // Walk down from the static prefix (everything before the first `*`).
  const firstStar = abs.indexOf('*');
  const prefixEnd = abs.lastIndexOf('/', firstStar);
  const base = abs.slice(0, prefixEnd) || '/';
  const regex = globToRegex(abs);

  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && regex.test(full)) {
        out.push(full);
      }
    }
  };
  if (existsSync(base) && statSync(base).isDirectory()) walk(base);
  return out;
}

function globToRegex(glob: string): RegExp {
  const DSS = '__GLOB_DSS__';
  const DS = '__GLOB_DS__';
  const S = '__GLOB_S__';
  const tokenised = glob
    .replace(/\*\*\//g, DSS)
    .replace(/\*\*/g, DS)
    .replace(/\*/g, S);
  const escaped = tokenised.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  const pattern = escaped
    .replaceAll(DSS, '(?:.*/)?')
    .replaceAll(DS, '.*')
    .replaceAll(S, '[^/]*');
  return new RegExp(`^${pattern}$`);
}
