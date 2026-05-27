import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import type { AnalyseResult, CrapFunction } from '../core/types.js';
import { type ReporterContext, thresholdsFor } from './index.js';

/**
 * SARIF 2.1.0 envelope — the format GitHub Code Scanning ingests via
 * `github/codeql-action/upload-sarif`. Each high-CRAP function becomes a
 * `result` pointing at its file + line range, classified under one of two
 * rules: a warning rule for functions over `--threshold` and an error rule
 * for functions over `--fail-on`. Code Scanning then surfaces them in the
 * Security tab and in each PR's diff annotations.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd02/sarif-v2.1.0-csprd02.html
 *
 * We don't emit `endColumn` / `startColumn` — function columns aren't always
 * meaningful (esp. for arrow-fn-on-its-own-line cases) and the line range
 * is enough for Code Scanning to point reviewers at the right code.
 */
export function renderSarif(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const cwd = process.cwd();
  // Flag anything over its *effective* threshold (per-path overrides applied).
  const flagged = result.functions.filter(
    (fn) => fn.crap > thresholdsFor(ctx, fn.file).threshold,
  );

  const rules = [
    {
      id: 'crap4ts/threshold',
      name: 'CrapAboveThreshold',
      shortDescription: { text: 'CRAP score above the warning threshold' },
      fullDescription: {
        text: 'This function exceeds the configured `--threshold`. High CRAP indicates code that combines high cyclomatic complexity with low test coverage — risky to change. Add tests first, then refactor.',
      },
      defaultConfiguration: { level: 'warning' as const },
      helpUri: 'https://github.com/danibram/crap4ts#interpreting-the-score',
    },
    {
      id: 'crap4ts/fail-on',
      name: 'CrapAboveFailOn',
      shortDescription: { text: 'CRAP score above the failure threshold' },
      fullDescription: {
        text: 'This function exceeds the configured `--fail-on`. The CRAP score is high enough that a single change has a meaningful chance of introducing a regression. Treat as blocking until refactored or covered with tests.',
      },
      defaultConfiguration: { level: 'error' as const },
      helpUri: 'https://github.com/danibram/crap4ts#interpreting-the-score',
    },
  ];

  const sarif = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'crap4ts',
            version: ctx.toolVersion ?? '0.0.0',
            informationUri: 'https://github.com/danibram/crap4ts',
            rules,
          },
        },
        results: flagged.map((fn) => buildResult(fn, ctx, cwd)),
      },
    ],
  };

  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function buildResult(
  fn: CrapFunction,
  ctx: ReporterContext,
  cwd: string,
): Record<string, unknown> {
  const { threshold, failOn } = thresholdsFor(ctx, fn.file);
  const isError = failOn !== undefined && fn.crap > failOn;
  const ruleId = isError ? 'crap4ts/fail-on' : 'crap4ts/threshold';
  const level = isError ? 'error' : 'warning';
  const file = relative(cwd, fn.file);
  const cov = fn.coverageMissing ? 'n/a' : `${fn.coverage.toFixed(0)}%`;
  // partialFingerprints lets Code Scanning track the same finding across
  // re-runs even when line numbers shift. We hash function name + file —
  // not the body — so a regression on the same function is still the
  // "same finding" and doesn't get duplicated on each push.
  const fingerprint = createHash('sha256')
    .update(`${file}::${fn.name}`)
    .digest('hex')
    .slice(0, 32);
  return {
    ruleId,
    level,
    message: {
      text: `${fn.name}: CRAP ${fn.crap.toFixed(1)} (complexity ${fn.complexity}, coverage ${cov}). Above ${
        isError ? `fail-on=${failOn}` : `threshold=${threshold}`
      }.`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: file },
          region: {
            startLine: fn.startLine,
            endLine: fn.endLine,
          },
        },
      },
    ],
    partialFingerprints: {
      'function/v1': fingerprint,
    },
  };
}
