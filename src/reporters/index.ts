import type { AnalyseResult, DiffResult, ReporterName } from '../core/types.js';
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
};

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
    case 'table':
      return renderTable(result, ctx);
  }
}
