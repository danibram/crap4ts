import { relative } from 'node:path';
import type { AnalyseResult } from '../core/types.js';
import type { ReporterContext } from './index.js';

export function renderJson(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const cwd = process.cwd();
  const total = result.functions.length;
  const crappy = result.functions.filter((f) => f.crap > ctx.threshold).length;
  return `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      filesScanned: result.filesScanned,
      coverageSource: result.coverageSource
        ? relative(cwd, result.coverageSource)
        : null,
      coverageFormat: result.coverageFormat ?? null,
      threshold: ctx.threshold,
      failOn: ctx.failOn ?? null,
      totals: {
        functions: total,
        aboveThreshold: crappy,
        aboveThresholdPct: total === 0 ? 0 : (crappy / total) * 100,
      },
      functions: result.functions.map((fn) => ({
        ...fn,
        file: relative(cwd, fn.file),
      })),
    },
    null,
    2,
  )}\n`;
}
