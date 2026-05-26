import { relative } from 'node:path';
import type { AnalyseResult } from '../core/types.js';
import type { ReporterContext } from './index.js';

export function renderTable(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const cwd = process.cwd();
  const lines: string[] = [];
  const total = result.functions.length;
  const crappy = result.functions.filter((f) => f.crap > ctx.threshold).length;
  const crappyPct = total === 0 ? 0 : (crappy / total) * 100;

  lines.push(
    `Scanned ${result.filesScanned} files. ${total} functions analysed.`,
  );
  if (result.coverageSource) {
    lines.push(
      `Coverage: ${result.coverageFormat} (${relative(cwd, result.coverageSource)})`,
    );
  } else {
    lines.push('Coverage: none — every function defaults to 0%.');
  }
  lines.push(
    `Above threshold (CRAP > ${ctx.threshold}): ${crappy} (${crappyPct.toFixed(1)}%)`,
  );
  lines.push('');

  const top = result.functions.slice(0, ctx.top);
  if (top.length === 0) {
    lines.push('No functions found.');
    return lines.join('\n');
  }

  const headers = ['CRAP', 'COMP', 'COV%', 'LOCATION', 'FUNCTION'];
  const rows = top.map((fn) => [
    fn.crap.toFixed(1),
    String(fn.complexity),
    fn.coverage.toFixed(0),
    `${relative(cwd, fn.file)}:${fn.startLine}`,
    fn.name,
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length)),
  );

  const formatRow = (cells: string[]) =>
    cells
      .map((cell, i) =>
        i < 3 ? cell.padStart(widths[i]!) : cell.padEnd(widths[i]!),
      )
      .join('  ');

  lines.push(formatRow(headers));
  lines.push(formatRow(widths.map((w) => '─'.repeat(w))));
  for (const row of rows) lines.push(formatRow(row));
  return lines.join('\n');
}
