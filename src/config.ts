import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CoverageFormat, ReporterName } from './core/types.js';

export type ResolvedConfig = {
  paths: string[];
  ignore: string[];
  threshold: number;
  failOn: number | undefined;
  reporter: ReporterName;
  top: number;
  coverageFile: string | undefined;
  coverageFormat: CoverageFormat | 'auto';
  tsconfigPath: string | undefined;
};

export type FileConfig = Partial<{
  include: string[];
  ignore: string[];
  threshold: number;
  failOn: number;
  reporter: ReporterName;
  top: number;
  coverage: string;
  coverageFormat: CoverageFormat | 'auto';
  tsconfig: string;
}>;

export const DEFAULT_CONFIG: ResolvedConfig = {
  paths: [process.cwd()],
  ignore: [],
  threshold: 30,
  failOn: undefined,
  reporter: 'table',
  top: 50,
  coverageFile: undefined,
  coverageFormat: 'auto',
  tsconfigPath: undefined,
};

export function loadFileConfig(cwd: string, explicit?: string): FileConfig {
  if (explicit) return readJsonOrThrow(resolve(cwd, explicit));

  const direct = resolve(cwd, 'crap.config.json');
  if (existsSync(direct)) return readJsonOrThrow(direct);

  const pkg = resolve(cwd, 'package.json');
  if (existsSync(pkg)) {
    const parsed = readJsonOrThrow(pkg) as Record<string, unknown>;
    const section = parsed.crap;
    if (section && typeof section === 'object') return section as FileConfig;
  }
  return {};
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
    threshold: cli.threshold ?? file.threshold ?? DEFAULT_CONFIG.threshold,
    failOn: cli.failOn ?? file.failOn,
    reporter: cli.reporter ?? file.reporter ?? DEFAULT_CONFIG.reporter,
    top: cli.top ?? file.top ?? DEFAULT_CONFIG.top,
    coverageFile: cli.coverageFile ?? file.coverage,
    coverageFormat:
      cli.coverageFormat ??
      file.coverageFormat ??
      DEFAULT_CONFIG.coverageFormat,
    tsconfigPath: cli.tsconfigPath ?? file.tsconfig,
  };
}

function readJsonOrThrow(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to read config at ${path}: ${String(err)}`);
  }
}
