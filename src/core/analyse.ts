import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Project } from 'ts-morph';
import type {
  CoverageProvider,
} from '../coverage/index.js';
import { loadCoverage } from '../coverage/index.js';
import { cyclomaticComplexity } from './complexity.js';
import { crap } from './crap.js';
import { extractFunctions } from './functions.js';
import type { AnalyseOptions, AnalyseResult, CrapFunction } from './types.js';

const DEFAULT_INCLUDE_GLOBS = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
];

export async function analyse(options: AnalyseOptions): Promise<AnalyseResult> {
  const project = createProject(options.tsconfigPath);

  const includePaths = resolveInputPaths(options.paths);
  const ignoreGlobs = [...DEFAULT_IGNORE_GLOBS, ...(options.ignore ?? [])];

  const sourceFiles = collectSourceFiles(project, includePaths, ignoreGlobs);

  const coverage = options.coverageFile
    ? await loadCoverage(options.coverageFile, options.coverageFormat ?? 'auto')
    : undefined;

  const functions: CrapFunction[] = [];

  for (const source of sourceFiles) {
    const filePath = source.getFilePath();
    const extracted = extractFunctions(source);

    for (const fn of extracted) {
      const complexity = cyclomaticComplexity(fn.node);
      const cov = coverage
        ? coverageForRange(coverage, filePath, fn.startLine, fn.endLine)
        : 0;
      functions.push({
        file: filePath,
        name: fn.name,
        startLine: fn.startLine,
        endLine: fn.endLine,
        complexity,
        coverage: cov,
        crap: crap(complexity, cov),
      });
    }
  }

  functions.sort((a, b) => b.crap - a.crap);

  const result: AnalyseResult = {
    functions,
    filesScanned: sourceFiles.length,
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
  // correctly without one — we just don't get cross-file type info, which
  // we don't need for complexity analysis.
  return new Project({
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      jsx: 4, // Preserve — keeps JSX parsing without forcing React imports.
    },
  });
}

function resolveInputPaths(paths: string[]): string[] {
  if (paths.length === 0) return [resolve(process.cwd())];
  return paths.map((p) => resolve(p));
}

function collectSourceFiles(
  project: Project,
  inputs: string[],
  ignoreGlobs: string[],
) {
  const globs: string[] = [];
  for (const input of inputs) {
    if (!existsSync(input)) continue;
    const stat = statSync(input);
    if (stat.isDirectory()) {
      for (const pattern of DEFAULT_INCLUDE_GLOBS) {
        globs.push(`${input}/${pattern}`);
      }
    } else if (stat.isFile()) {
      globs.push(input);
    }
  }
  for (const ignore of ignoreGlobs) globs.push(`!${ignore}`);

  return project.addSourceFilesAtPaths(globs);
}

function coverageForRange(
  coverage: CoverageProvider,
  file: string,
  startLine: number,
  endLine: number,
): number {
  const range = coverage.getRangeCoverage(file, startLine, endLine);
  if (!range || range.total === 0) return 0;
  return (range.covered / range.total) * 100;
}
