import { relative } from 'node:path';
import type { AnalyseResult } from '../core/types.js';
import type { ReporterContext } from './index.js';

export function renderMarkdown(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const cwd = process.cwd();
  const top = result.functions.slice(0, ctx.top);
  const total = result.functions.length;
  const crappy = result.functions.filter((f) => f.crap > ctx.threshold).length;
  const crappyPct = total === 0 ? 0 : (crappy / total) * 100;

  const lines: string[] = [];
  lines.push('## C.R.A.P. report');
  lines.push('');
  lines.push(`- Files scanned: **${result.filesScanned}**`);
  lines.push(`- Functions analysed: **${total}**`);
  lines.push(
    `- Above threshold (\`CRAP > ${ctx.threshold}\`): **${crappy}** (${crappyPct.toFixed(1)}%)`,
  );
  if (result.coverageSource) {
    lines.push(
      `- Coverage: \`${result.coverageFormat}\` from \`${relative(cwd, result.coverageSource)}\``,
    );
  } else {
    lines.push('- Coverage: _none provided_ — every function defaults to 0%.');
  }
  lines.push('');

  if (top.length === 0) {
    lines.push('_No functions found._');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| CRAP | Complexity | Coverage | Location | Function |');
  lines.push('|---:|---:|---:|---|---|');
  for (const fn of top) {
    const location = `\`${relative(cwd, fn.file)}:${fn.startLine}\``;
    lines.push(
      `| ${fn.crap.toFixed(1)} | ${fn.complexity} | ${fn.coverage.toFixed(0)}% | ${location} | \`${fn.name}\` |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
