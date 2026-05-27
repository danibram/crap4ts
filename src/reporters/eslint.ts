import { resolve } from 'node:path';
import type { AnalyseResult, CrapFunction } from '../core/types.js';
import { type ReporterContext, thresholdsFor } from './index.js';

/**
 * Emit the ESLint JSON format (`eslint -f json`): an array of file results,
 * each with a `messages[]` array. This is the lingua franca that reviewdog,
 * many CI dashboards, and editor tooling already ingest — so `--reporter
 * eslint | reviewdog -f=eslint` lights up inline PR review comments without
 * us writing a reviewdog-specific format.
 *
 * Honest scope note: this does NOT make findings appear inline in VS Code on
 * its own — that needs a real ESLint plugin. It's for tools that consume the
 * ESLint JSON shape. The SARIF reporter is the path to GitHub Code Scanning.
 *
 * severity: 2 = error (over fail-on), 1 = warning (over threshold). Functions
 * at or below threshold produce no message (clean files still appear with
 * empty messages so consumers see they were analysed).
 */
export function renderEslint(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const byFile = new Map<string, CrapFunction[]>();
  for (const fn of result.functions) {
    const abs = resolve(fn.file);
    const arr = byFile.get(abs);
    if (arr) arr.push(fn);
    else byFile.set(abs, [fn]);
  }

  const out = [];
  for (const [filePath, fns] of byFile) {
    const messages = [];
    let errorCount = 0;
    let warningCount = 0;
    for (const fn of fns) {
      const { threshold, failOn } = thresholdsFor(ctx, fn.file);
      const isError = failOn !== undefined && fn.crap > failOn;
      const isWarning = !isError && fn.crap > threshold;
      if (!isError && !isWarning) continue;
      const severity = isError ? 2 : 1;
      if (isError) errorCount++;
      else warningCount++;
      const cov = fn.coverageMissing ? 'n/a' : `${fn.coverage.toFixed(0)}%`;
      messages.push({
        ruleId: isError ? 'crap4ts/fail-on' : 'crap4ts/threshold',
        severity,
        message: `${fn.name}: CRAP ${fn.crap.toFixed(1)} (complexity ${fn.complexity}, coverage ${cov})`,
        line: fn.startLine,
        column: 1,
        endLine: fn.endLine,
        endColumn: 1,
      });
    }
    out.push({
      filePath,
      messages,
      errorCount,
      warningCount,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
    });
  }

  return `${JSON.stringify(out, null, 2)}\n`;
}
