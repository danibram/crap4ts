import { relative } from 'node:path';
import type { AnalyseResult } from '../core/types.js';
import { type ReporterContext, thresholdsFor } from './index.js';

/**
 * Emits GitHub Actions workflow commands so the runner annotates the PR
 * inline. Format reference:
 *   https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
 *
 * We use ::warning:: for entries that exceed `threshold` and ::error:: when
 * they also exceed `failOn` (if set).
 */
export function renderGithub(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const cwd = process.cwd();
  const lines: string[] = [];

  for (const fn of result.functions) {
    const { threshold, failOn } = thresholdsFor(ctx, fn.file);
    if (fn.crap <= threshold) continue;
    const isError = failOn !== undefined && fn.crap > failOn;
    const level = isError ? 'error' : 'warning';
    const file = relative(cwd, fn.file);
    const cov = fn.coverageMissing ? 'n/a' : `${fn.coverage.toFixed(0)}%`;
    const title = `C.R.A.P. ${fn.crap.toFixed(1)} (comp ${fn.complexity}, cov ${cov})`;
    const message = `${fn.name} exceeds CRAP threshold (${threshold}).`;
    lines.push(
      `::${level} file=${file},line=${fn.startLine},endLine=${fn.endLine},title=${encode(title)}::${encode(message)}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function encode(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
