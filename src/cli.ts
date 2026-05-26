import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type ResolvedConfig, loadFileConfig, mergeConfig } from './config.js';
import { analyse } from './core/analyse.js';
import type {
  AnalyseOptions,
  CoverageFormat,
  MissingPolicy,
  ReporterName,
} from './core/types.js';
import { render } from './reporters/index.js';

const HELP = `crap4ts — C.R.A.P. (Change Risk Analysis & Predictions) index for TypeScript.

Usage:
  crap4ts [paths...] [options]

Filtering:
  -i, --ignore <glob>         Skip files matching glob (repeatable). Excluded
                              at walk time — not parsed at all.
      --allow <glob>          Parse the file but hide matching functions from
                              the report (repeatable). Path glob if it contains
                              '/' or '**'; otherwise matches function names.
      --min <score>           Hide rows below this CRAP score
      --top <n>               Show only the N worst offenders (default: 50)

Thresholds:
  -t, --threshold <n>         Score above which a function is flagged (default: 30)
      --fail-on <n>           Exit 1 if any function exceeds this score

Coverage:
  -c, --coverage <file>       Path to coverage report
      --coverage-format <fmt> auto | v8 | istanbul | lcov (default: auto)
      --missing <policy>      How to score functions with no coverage data:
                                pessimistic (0% — default)
                                optimistic  (100%, so CRAP = comp)
                                skip        (drop the row entirely)

Output:
  -r, --reporter <name>       table | json | markdown | github (default: table)
      --summary               Only print aggregate stats (no per-function table)
  -o, --output <file>         Write to file instead of stdout

Misc:
      --tsconfig <path>       Path to tsconfig.json (optional)
      --config <path>         Path to crap.config.json (optional)
  -h, --help                  Show this help
  -v, --version               Show version

Config:
  Reads crap.config.json (walked up from cwd to git/filesystem root) or the
  "crap" section of package.json in cwd. CLI flags always override config.

Examples:
  crap4ts src/                                              # scan src/, no coverage
  crap4ts --coverage coverage/coverage-final.json
  crap4ts --reporter github --fail-on 100                   # CI annotations
  crap4ts --missing skip --coverage lcov.info               # only tested code
  crap4ts --reporter json --output crap.json                # baseline file
  crap4ts --summary                                         # one-liner
`;

type CliFlags = {
  threshold?: string;
  'fail-on'?: string;
  min?: string;
  reporter?: string;
  top?: string;
  ignore?: string[];
  allow?: string[];
  coverage?: string;
  'coverage-format'?: string;
  missing?: string;
  summary?: boolean;
  output?: string;
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
    missing: config.missing,
  };
  if (config.coverageFile) options.coverageFile = config.coverageFile;
  if (config.tsconfigPath) options.tsconfigPath = config.tsconfigPath;

  const raw = await analyse(options);

  // --allow hides matching functions but keeps the underlying file analysed.
  // --min hides rows below the score threshold (kept in failOn calculation
  // below so a hidden function can still fail CI — that's intentional).
  const allowMatcher = makeAllowMatcher(config.allow);
  const visible = raw.functions.filter((fn) => {
    if (allowMatcher(fn.file, fn.name)) return false;
    if (config.min !== undefined && fn.crap < config.min) return false;
    return true;
  });
  const result = { ...raw, functions: visible };

  const output = render(config.reporter, result, {
    threshold: config.threshold,
    failOn: config.failOn,
    top: config.top,
    summary: config.summary,
  });
  const final = output.endsWith('\n') ? output : `${output}\n`;
  if (config.output) {
    writeFileSync(config.output, final);
  } else {
    process.stdout.write(final);
  }

  if (config.failOn !== undefined) {
    // Fail-on is evaluated on the unfiltered set so --allow can't hide
    // a regression from CI. If you want allow-listed code excluded from
    // the gate too, use --ignore instead.
    const breaches = raw.functions.filter((f) => f.crap > config.failOn!);
    if (breaches.length > 0) {
      process.stderr.write(
        `crap4ts: ${breaches.length} function(s) exceed --fail-on=${config.failOn}\n`,
      );
      return 1;
    }
  }
  return 0;
}

/**
 * Returns a matcher that decides whether a function should be filtered out
 * by --allow. Each glob is either:
 *   - a path glob (contains `/` or `**`) — matches the function's file
 *   - a function-name glob — matches the function's name; `*` doesn't cross
 *     `::` or `.` boundaries so `Foo::*` only catches Foo's methods.
 */
function makeAllowMatcher(
  globs: string[],
): (file: string, name: string) => boolean {
  if (globs.length === 0) return () => false;

  const pathRegexes: RegExp[] = [];
  const nameRegexes: RegExp[] = [];
  for (const glob of globs) {
    if (glob.includes('/') || glob.includes('**')) {
      pathRegexes.push(globToRegex(glob, true));
    } else {
      nameRegexes.push(globToRegex(glob, false));
    }
  }

  return (file, name) =>
    pathRegexes.some((re) => re.test(file)) ||
    nameRegexes.some((re) => re.test(name));
}

function globToRegex(glob: string, isPath: boolean): RegExp {
  const DSS = '__GLOB_DSS__';
  const DS = '__GLOB_DS__';
  const S = '__GLOB_S__';

  const tokenised = glob
    .replace(/\*\*\//g, DSS)
    .replace(/\*\*/g, DS)
    .replace(/\*/g, S);

  const escaped = tokenised.replace(/[.+^${}()|[\]\\?]/g, '\\$&');

  // For path globs `*` does not cross `/`. For name globs it does not cross
  // `::` or `.` — same rule cargo-crap uses for Rust paths, equally useful
  // here for TS-style `Class.method` references.
  const starReplacement = isPath ? '[^/]*' : '[^.:]*';

  const pattern = escaped
    .replaceAll(DSS, '(?:.*/)?')
    .replaceAll(DS, '.*')
    .replaceAll(S, starReplacement);

  return new RegExp(`^${pattern}$`);
}

const OPTIONS = {
  threshold: { type: 'string', short: 't' },
  'fail-on': { type: 'string' },
  min: { type: 'string' },
  reporter: { type: 'string', short: 'r' },
  top: { type: 'string' },
  ignore: { type: 'string', short: 'i', multiple: true },
  allow: { type: 'string', multiple: true },
  coverage: { type: 'string', short: 'c' },
  'coverage-format': { type: 'string' },
  missing: { type: 'string' },
  summary: { type: 'boolean' },
  output: { type: 'string', short: 'o' },
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
  if (v.allow && v.allow.length > 0) result.allow = v.allow;
  if (v.threshold !== undefined) {
    result.threshold = expectNumber('--threshold', v.threshold);
  }
  if (v['fail-on'] !== undefined) {
    result.failOn = expectNumber('--fail-on', v['fail-on']);
  }
  if (v.min !== undefined) {
    result.min = expectNumber('--min', v.min);
  }
  if (v.reporter !== undefined) {
    result.reporter = expectReporter(v.reporter);
  }
  if (v.top !== undefined) {
    result.top = expectNumber('--top', v.top);
  }
  if (v.summary !== undefined) result.summary = v.summary;
  if (v.output !== undefined) result.output = resolve(v.output);
  if (v.missing !== undefined) {
    result.missing = expectMissingPolicy(v.missing);
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

function expectMissingPolicy(raw: string): MissingPolicy {
  if (raw === 'pessimistic' || raw === 'optimistic' || raw === 'skip') {
    return raw;
  }
  throw new Error(
    `--missing expects one of: pessimistic | optimistic | skip (got "${raw}")`,
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
    // Compare *resolved* paths so symlinks (bun link, pnpm, npx cache)
    // still trigger main. Without this the script silently no-ops when
    // invoked via the bin symlink.
    const argv1 = realpathSync(process.argv[1]);
    const here = realpathSync(fileURLToPath(import.meta.url));
    return argv1 === here;
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
