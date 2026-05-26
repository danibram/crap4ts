import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  CoverageFormat,
  MissingPolicy,
  ReporterName,
} from './core/types.js';

export type ResolvedConfig = {
  paths: string[];
  ignore: string[];
  allow: string[];
  threshold: number;
  failOn: number | undefined;
  min: number | undefined;
  reporter: ReporterName;
  top: number;
  summary: boolean;
  output: string | undefined;
  missing: MissingPolicy;
  coverageFile: string | undefined;
  coverageFormat: CoverageFormat | 'auto';
  tsconfigPath: string | undefined;
  baseline: string | undefined;
  failRegression: boolean;
  epsilon: number;
};

export type FileConfig = Partial<{
  include: string[];
  ignore: string[];
  allow: string[];
  threshold: number;
  failOn: number;
  min: number;
  reporter: ReporterName;
  top: number;
  summary: boolean;
  output: string;
  missing: MissingPolicy;
  coverage: string;
  coverageFormat: CoverageFormat | 'auto';
  tsconfig: string;
  baseline: string;
  failRegression: boolean;
  epsilon: number;
}>;

export const DEFAULT_CONFIG: ResolvedConfig = {
  paths: [process.cwd()],
  ignore: [],
  allow: [],
  threshold: 30,
  failOn: undefined,
  min: undefined,
  reporter: 'table',
  top: 50,
  summary: false,
  output: undefined,
  missing: 'pessimistic',
  coverageFile: undefined,
  coverageFormat: 'auto',
  tsconfigPath: undefined,
  baseline: undefined,
  failRegression: false,
  epsilon: 0.01,
};

export function loadFileConfig(cwd: string, explicit?: string): FileConfig {
  if (explicit) return readJsonOrThrow(resolve(cwd, explicit));

  // Walk up looking for crap.config.json; stop at the git root (if any) or
  // the filesystem root. This makes the tool just work in monorepo subdirs.
  const found = findUpwards(cwd, 'crap.config.json');
  if (found) return readJsonOrThrow(found);

  // package.json#crap is intentionally cwd-only: package boundaries are
  // semantically more local than "any ancestor".
  const pkg = resolve(cwd, 'package.json');
  if (existsSync(pkg)) {
    const parsed = readJsonOrThrow(pkg) as Record<string, unknown>;
    const section = parsed.crap;
    if (section && typeof section === 'object') return section as FileConfig;
  }
  return {};
}

function findUpwards(startDir: string, filename: string): string | undefined {
  let dir = resolve(startDir);
  // Hard cap depth to avoid pathological symlink loops, even though dirname
  // eventually fixed-points at `/`.
  for (let i = 0; i < 128; i++) {
    const candidate = resolve(dir, filename);
    if (existsSync(candidate)) return candidate;
    // Stop at git root — finding a config above your repo would be surprising.
    if (existsSync(resolve(dir, '.git'))) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

export function mergeConfig(
  file: FileConfig,
  cli: Partial<ResolvedConfig>,
): ResolvedConfig {
  return {
    paths:
      cli.paths && cli.paths.length > 0
        ? cli.paths
        : file.include && file.include.length > 0
          ? file.include
          : DEFAULT_CONFIG.paths,
    ignore: [...(file.ignore ?? []), ...(cli.ignore ?? [])],
    allow: [...(file.allow ?? []), ...(cli.allow ?? [])],
    threshold: cli.threshold ?? file.threshold ?? DEFAULT_CONFIG.threshold,
    failOn: cli.failOn ?? file.failOn,
    min: cli.min ?? file.min,
    reporter: cli.reporter ?? file.reporter ?? DEFAULT_CONFIG.reporter,
    top: cli.top ?? file.top ?? DEFAULT_CONFIG.top,
    summary: cli.summary ?? file.summary ?? DEFAULT_CONFIG.summary,
    output: cli.output ?? file.output,
    missing: cli.missing ?? file.missing ?? DEFAULT_CONFIG.missing,
    coverageFile: cli.coverageFile ?? file.coverage,
    coverageFormat:
      cli.coverageFormat ??
      file.coverageFormat ??
      DEFAULT_CONFIG.coverageFormat,
    tsconfigPath: cli.tsconfigPath ?? file.tsconfig,
    baseline: cli.baseline ?? file.baseline,
    failRegression:
      cli.failRegression ??
      file.failRegression ??
      DEFAULT_CONFIG.failRegression,
    epsilon: cli.epsilon ?? file.epsilon ?? DEFAULT_CONFIG.epsilon,
  };
}

function readJsonOrThrow(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to read config at ${path}: ${String(err)}`);
  }
}
