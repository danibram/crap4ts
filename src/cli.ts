import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type ResolvedConfig, loadFileConfig, mergeConfig } from './config.js';
import { analyse } from './core/analyse.js';
import type {
  AnalyseOptions,
  CoverageFormat,
  ReporterName,
} from './core/types.js';
import { render } from './reporters/index.js';

const HELP = `crap4ts — C.R.A.P. (Change Risk Analysis & Predictions) index for TypeScript.

Usage:
  crap4ts [paths...] [options]

Options:
  -t, --threshold <n>         Mark functions above this CRAP value (default: 30)
      --fail-on <n>           Exit with code 1 if any function exceeds this value
  -r, --reporter <name>       table | json | markdown | github (default: table)
      --top <n>               Limit table/markdown rows (default: 50)
  -i, --ignore <glob>         Glob to exclude (repeatable)
  -c, --coverage <file>       Path to coverage report
      --coverage-format <fmt> auto | v8 | istanbul | lcov (default: auto)
      --tsconfig <path>       Path to tsconfig.json (optional)
      --config <path>         Path to crap.config.json (optional)
  -h, --help                  Show this help
  -v, --version               Show version

Config:
  Reads crap.config.json or "crap" section of package.json from the current
  working directory. CLI flags override config file.

Examples:
  crap4ts src/                                  # scan src/, no coverage
  crap4ts --coverage coverage/coverage-final.json --threshold 30
  crap4ts --reporter github --fail-on 100        # for CI annotations
  crap4ts --reporter json > crap.json            # machine-readable
`;

type CliFlags = {
  threshold?: string;
  'fail-on'?: string;
  reporter?: string;
  top?: string;
  ignore?: string[];
  coverage?: string;
  'coverage-format'?: string;
  tsconfig?: string;
  config?: string;
  help?: boolean;
  version?: boolean;
};

export async function run(argv: string[]): Promise<number> {
  let values: CliFlags;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values as CliFlags;
    positionals = parsed.positionals;
  } catch (err) {
    process.stderr.write(`${String(err)}\n\n${HELP}`);
    return 2;
  }

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  const cliConfig = buildCliConfig(values, positionals);
  const fileConfig = loadFileConfig(process.cwd(), values.config);
  const config = mergeConfig(fileConfig, cliConfig);

  const options: AnalyseOptions = {
    paths: config.paths,
    ignore: config.ignore,
    coverageFormat: config.coverageFormat,
  };
  if (config.coverageFile) options.coverageFile = config.coverageFile;
  if (config.tsconfigPath) options.tsconfigPath = config.tsconfigPath;

  const result = await analyse(options);

  const output = render(config.reporter, result, {
    threshold: config.threshold,
    failOn: config.failOn,
    top: config.top,
  });
  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);

  if (config.failOn !== undefined) {
    const breaches = result.functions.filter((f) => f.crap > config.failOn!);
    if (breaches.length > 0) {
      process.stderr.write(
        `crap4ts: ${breaches.length} function(s) exceed --fail-on=${config.failOn}\n`,
      );
      return 1;
    }
  }
  return 0;
}

const OPTIONS = {
  threshold: { type: 'string', short: 't' },
  'fail-on': { type: 'string' },
  reporter: { type: 'string', short: 'r' },
  top: { type: 'string' },
  ignore: { type: 'string', short: 'i', multiple: true },
  coverage: { type: 'string', short: 'c' },
  'coverage-format': { type: 'string' },
  tsconfig: { type: 'string' },
  config: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

function buildCliConfig(
  v: CliFlags,
  positionals: string[],
): Partial<ResolvedConfig> {
  const result: Partial<ResolvedConfig> = {};

  if (positionals.length > 0) {
    result.paths = positionals.map((p) => resolve(p));
  }
  if (v.ignore && v.ignore.length > 0) result.ignore = v.ignore;
  if (v.threshold !== undefined) {
    result.threshold = expectNumber('--threshold', v.threshold);
  }
  if (v['fail-on'] !== undefined) {
    result.failOn = expectNumber('--fail-on', v['fail-on']);
  }
  if (v.reporter !== undefined) {
    result.reporter = expectReporter(v.reporter);
  }
  if (v.top !== undefined) {
    result.top = expectNumber('--top', v.top);
  }
  if (v.coverage !== undefined) result.coverageFile = resolve(v.coverage);
  if (v['coverage-format'] !== undefined) {
    result.coverageFormat = expectCoverageFormat(v['coverage-format']);
  }
  if (v.tsconfig !== undefined) result.tsconfigPath = resolve(v.tsconfig);

  return result;
}

function expectNumber(flag: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${flag} expects a number, got "${raw}"`);
  }
  return n;
}

function expectReporter(raw: string): ReporterName {
  if (
    raw === 'table' ||
    raw === 'json' ||
    raw === 'markdown' ||
    raw === 'github'
  ) {
    return raw;
  }
  throw new Error(
    `--reporter expects one of: table | json | markdown | github (got "${raw}")`,
  );
}

function expectCoverageFormat(raw: string): CoverageFormat | 'auto' {
  if (raw === 'auto' || raw === 'v8' || raw === 'istanbul' || raw === 'lcov') {
    return raw;
  }
  throw new Error(
    `--coverage-format expects one of: auto | v8 | istanbul | lcov (got "${raw}")`,
  );
}

function readVersion(): string {
  try {
    const pkgPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json',
    );
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

function isDirectInvocation(): boolean {
  if (!process.argv[1]) return false;
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  void (async () => {
    const code = await run(process.argv.slice(2));
    process.exit(code);
  })();
}
