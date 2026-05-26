import type { AnalyseResult, ReporterName } from '../core/types.js';
import { renderGithub } from './github.js';
import { renderJson } from './json.js';
import { renderMarkdown } from './markdown.js';
import { renderTable } from './table.js';

export type ReporterContext = {
  threshold: number;
  failOn: number | undefined;
  top: number;
  summary: boolean;
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
    case 'table':
      return renderTable(result, ctx);
  }
}
