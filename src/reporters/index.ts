import type { AnalyseResult, DiffResult, ReporterName } from '../core/types.js';
import { renderEslint } from './eslint.js';
import { renderGithub } from './github.js';
import { renderJson } from './json.js';
import { renderMarkdown } from './markdown.js';
import { renderPrComment } from './prComment.js';
import { renderSarif } from './sarif.js';
import { renderTable } from './table.js';

export type ReporterContext = {
  threshold: number;
  failOn: number | undefined;
  top: number;
  summary: boolean;
  /**
   * Present when --baseline was supplied. Reporters use it to add Δ columns,
   * surface new/moved/regressed rows, and emit a `diff` block in JSON output.
   */
  diff?: DiffResult;
  /**
   * Where the baseline was loaded from. Shown to the user so they can tell
   * which file is being compared against — important when CI stashes
   * baselines in multiple locations.
   */
  baselineSource?: string;
  /**
   * crap4ts's own package version. Embedded in the SARIF envelope so
   * Code Scanning can show which tool version produced the result.
   */
  toolVersion?: string;
  /**
   * Reporter-side grouping. `function` (default) renders one flat ranked
   * list. `package` groups rows by the function's `package` label and
   * sorts groups by total CRAP — useful for monorepo dashboards.
   */
  reportBy?: 'function' | 'package';
  /**
   * Per-file effective threshold/failOn (per-path overrides applied). When
   * absent, reporters fall back to the flat ctx.threshold / ctx.failOn.
   * Use `thresholdsFor(ctx, file)` rather than reading this directly.
   */
  thresholdFor?: (file: string) => {
    threshold: number;
    failOn: number | undefined;
  };
};

/**
 * Resolve the effective threshold/failOn for a file, honouring per-path
 * overrides when the CLI supplied a resolver, else the flat context values.
 */
export function thresholdsFor(
  ctx: ReporterContext,
  file: string,
): { threshold: number; failOn: number | undefined } {
  return (
    ctx.thresholdFor?.(file) ?? { threshold: ctx.threshold, failOn: ctx.failOn }
  );
}

export function render(
  reporter: ReporterName,
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  switch (reporter) {
    case 'json':
      return renderJson(result, ctx);
    case 'markdown':
      return renderMarkdown(result, ctx);
    case 'github':
      return renderGithub(result, ctx);
    case 'pr-comment':
      return renderPrComment(result, ctx);
    case 'sarif':
      return renderSarif(result, ctx);
    case 'eslint':
      return renderEslint(result, ctx);
    case 'table':
      return renderTable(result, ctx);
  }
}
