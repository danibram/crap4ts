import { type Dirent, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { Project } from 'ts-morph';
import type { CoverageProvider } from '../coverage/index.js';
import { loadCoverage } from '../coverage/index.js';
import { cyclomaticComplexity } from './complexity.js';
import { crap } from './crap.js';
import { extractFunctions } from './functions.js';
import type {
  AnalyseOptions,
  AnalyseResult,
  CrapFunction,
  MissingPolicy,
} from './types.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.git',
  '__snapshots__',
]);

const DEFAULT_IGNORE_GLOBS = [
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
];

export async function analyse(options: AnalyseOptions): Promise<AnalyseResult> {
  const includePaths = resolveInputPaths(options.paths);
  const ignoreGlobs = [...DEFAULT_IGNORE_GLOBS, ...(options.ignore ?? [])];
  const isIgnored = makeGlobMatcher(ignoreGlobs);

  const filePaths = discoverSourceFiles(includePaths, isIgnored);

  const coverage = options.coverageFile
    ? await loadCoverage(options.coverageFile, options.coverageFormat ?? 'auto')
    : undefined;

  // Single Project, but we add+remove each SourceFile so ts-morph doesn't
  // retain the AST of every file simultaneously - that was OOMing on
  // monorepos with several hundred files.
  const project = createProject(options.tsconfigPath);
  const functions: CrapFunction[] = [];
  const missing: MissingPolicy = options.missing ?? 'pessimistic';

  for (const filePath of filePaths) {
    const source = project.addSourceFileAtPathIfExists(filePath);
    if (!source) continue;
    try {
      const extracted = extractFunctions(source);
      for (const fn of extracted) {
        const complexity = cyclomaticComplexity(fn.node);
        const measured = coverage
          ? measuredCoverage(coverage, filePath, fn.startLine, fn.endLine)
          : undefined;

        if (measured === undefined && missing === 'skip') continue;

        const coverageMissing = measured === undefined;
        const cov = coverageMissing
          ? missing === 'optimistic'
            ? 100
            : 0
          : measured;

        functions.push({
          file: filePath,
          name: fn.name,
          startLine: fn.startLine,
          endLine: fn.endLine,
          complexity,
          coverage: cov,
          crap: crap(complexity, cov),
          coverageMissing,
        });
      }
    } finally {
      project.removeSourceFile(source);
    }
  }

  functions.sort((a, b) => b.crap - a.crap);

  const result: AnalyseResult = {
    functions,
    filesScanned: filePaths.length,
  };
  if (coverage) {
    result.coverageSource = coverage.source;
    result.coverageFormat = coverage.format;
  }
  return result;
}

function createProject(tsconfigPath?: string): Project {
  if (tsconfigPath && existsSync(tsconfigPath)) {
    return new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
  }
  // Lenient mode: no tsconfig required. ts-morph still parses TS syntax
  // correctly without one - we just don't get cross-file type info, which
  // we don't need for complexity analysis.
  return new Project({
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      jsx: 4, // Preserve - keeps JSX parsing without forcing React imports.
    },
  });
}

function resolveInputPaths(paths: string[]): string[] {
  if (paths.length === 0) return [resolve(process.cwd())];
  return paths.map((p) => resolve(p));
}

function discoverSourceFiles(
  inputs: string[],
  isIgnored: (path: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    if (!existsSync(input)) continue;
    const stat = statSync(input);
    if (stat.isFile()) {
      if (SOURCE_EXTENSIONS.has(extname(input)) && !isIgnored(input)) {
        out.push(input);
      }
      continue;
    }
    if (stat.isDirectory()) walkDir(input, isIgnored, out);
  }
  return out;
}

function walkDir(
  dir: string,
  isIgnored: (path: string) => boolean,
  acc: string[],
): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
      walkDir(join(dir, entry.name), isIgnored, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    const full = join(dir, entry.name);
    if (isIgnored(full)) continue;
    acc.push(full);
  }
}

function makeGlobMatcher(globs: string[]): (path: string) => boolean {
  if (globs.length === 0) return () => false;
  const regexes = globs.map(globToRegex);
  return (path) => regexes.some((re) => re.test(path));
}

function globToRegex(glob: string): RegExp {
  // Tokenise the wildcard segments using placeholders that can't appear in
  // user input or escape output, then escape the rest, then substitute the
  // placeholders back as regex fragments.
  const DSS = '__GLOB_DSS__';
  const DS = '__GLOB_DS__';
  const S = '__GLOB_S__';
  const Q = '__GLOB_Q__';

  const tokenised = glob
    .replace(/\*\*\//g, DSS)
    .replace(/\*\*/g, DS)
    .replace(/\*/g, S)
    .replace(/\?/g, Q);

  const escaped = tokenised.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  const pattern = escaped
    .replaceAll(DSS, '(?:.*/)?')
    .replaceAll(DS, '.*')
    .replaceAll(S, '[^/]*')
    .replaceAll(Q, '[^/]');

  return new RegExp(`^${pattern}$`);
}

/**
 * Returns the % of statements covered in the given line range, or undefined
 * when there is no coverage data at all for that range (file absent from
 * report, or report has no executable statements in the range).
 *
 * Important: 0% (data present, nothing fired) is distinct from undefined
 * (no data found). The caller's --missing policy decides what to do.
 */
function measuredCoverage(
  coverage: CoverageProvider,
  file: string,
  startLine: number,
  endLine: number,
): number | undefined {
  const range = coverage.getRangeCoverage(file, startLine, endLine);
  if (!range || range.total === 0) return undefined;
  return (range.covered / range.total) * 100;
}
