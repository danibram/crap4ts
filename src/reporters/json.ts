import { relative } from 'node:path';
import type { AnalyseResult } from '../core/types.js';
import type { ReporterContext } from './index.js';

const SCHEMA_URL =
  'https://raw.githubusercontent.com/danibram/crap4ts/main/schemas/report-v1.json';

export function renderJson(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const cwd = process.cwd();
  const total = result.functions.length;
  const crappy = result.functions.filter((f) => f.crap > ctx.threshold).length;
  const worst = result.functions[0];

  // Build the diff block once so the envelope construction below stays flat.
  // We include the entry list (not just counts) so consumers that want a full
  // PR-comment view from the JSON can render it without re-running analysis.
  const diff = ctx.diff
    ? {
        baseline: ctx.baselineSource ? relative(cwd, ctx.baselineSource) : null,
        epsilon: ctx.diff.epsilon,
        summary: ctx.diff.summary,
        ...(ctx.summary
          ? {}
          : {
              entries: ctx.diff.entries.map((e) => ({
                status: e.status,
                delta: e.delta,
                current: e.current
                  ? {
                      file: relative(cwd, e.current.file),
                      name: e.current.name,
                      startLine: e.current.startLine,
                      crap: e.current.crap,
                    }
                  : null,
                baseline: e.baseline
                  ? {
                      file: e.baseline.file,
                      name: e.baseline.name,
                      startLine: e.baseline.startLine,
                      crap: e.baseline.crap,
                    }
                  : null,
              })),
            }),
      }
    : null;

  const envelope = {
    $schema: SCHEMA_URL,
    version: '1',
    generatedAt: new Date().toISOString(),
    filesScanned: result.filesScanned,
    coverage: result.coverageSource
      ? {
          source: relative(cwd, result.coverageSource),
          format: result.coverageFormat ?? null,
        }
      : null,
    threshold: ctx.threshold,
    failOn: ctx.failOn ?? null,
    totals: {
      functions: total,
      aboveThreshold: crappy,
      aboveThresholdPct: total === 0 ? 0 : (crappy / total) * 100,
      worst: worst
        ? {
            name: worst.name,
            file: relative(cwd, worst.file),
            line: worst.startLine,
            crap: worst.crap,
          }
        : null,
    },
    ...(diff ? { diff } : {}),
    ...(ctx.summary
      ? {}
      : {
          functions: result.functions.map((fn) => ({
            file: relative(cwd, fn.file),
            name: fn.name,
            startLine: fn.startLine,
            endLine: fn.endLine,
            complexity: fn.complexity,
            coverage: fn.coverageMissing ? null : fn.coverage,
            coverageMissing: fn.coverageMissing,
            crap: fn.crap,
            hash: fn.hash,
            ...(fn.package ? { package: fn.package } : {}),
          })),
        }),
  };

  return `${JSON.stringify(envelope, null, 2)}\n`;
}
