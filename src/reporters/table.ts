import { relative } from 'node:path';
import type { AnalyseResult, DiffEntry } from '../core/types.js';
import { deltaSign, makeDiffLookup } from './diffLookup.js';
import type { ReporterContext } from './index.js';

const BAR_WIDTH = 10;
const FULL_BLOCK = '█';
const EMPTY_BLOCK = '░';

export function renderTable(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const cwd = process.cwd();
  const lines: string[] = [];
  const total = result.functions.length;
  const crappy = result.functions.filter((f) => f.crap > ctx.threshold).length;
  const crappyPct = total === 0 ? 0 : (crappy / total) * 100;
  const worst = result.functions[0];

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
  if (ctx.diff && ctx.baselineSource) {
    const s = ctx.diff.summary;
    lines.push(
      `Baseline: ${relative(cwd, ctx.baselineSource)} ` +
        `(regressed ${s.regressed}, new ${s.new}, moved ${s.moved}, ` +
        `improved ${s.improved}, removed ${s.removed})`,
    );
  }
  if (ctx.summary) {
    if (worst) {
      lines.push(
        `Worst: ${worst.name} @ ${relative(cwd, worst.file)}:${worst.startLine} (CRAP ${worst.crap.toFixed(1)})`,
      );
    }
    return lines.join('\n');
  }
  lines.push('');

  const top = result.functions.slice(0, ctx.top);
  if (top.length === 0) {
    lines.push('No functions to display.');
    return lines.join('\n');
  }

  const lookup = ctx.diff ? makeDiffLookup(ctx.diff) : undefined;
  const showDelta = lookup !== undefined;

  const headers = showDelta
    ? ['', 'CRAP', 'Δ', 'COMP', 'COVERAGE', 'LOCATION', 'FUNCTION']
    : ['', 'CRAP', 'COMP', 'COVERAGE', 'LOCATION', 'FUNCTION'];

  const rows = top.map((fn) => {
    const entry = lookup?.(fn);
    const base = [
      statusIcon(fn.crap, ctx.threshold, ctx.failOn, entry),
      fn.crap.toFixed(1),
    ];
    const tail = [
      String(fn.complexity),
      coverageCell(fn.coverage, fn.coverageMissing),
      `${relative(cwd, fn.file)}:${fn.startLine}`,
      fn.name,
    ];
    if (showDelta) return [...base, deltaCell(entry), ...tail];
    return [...base, ...tail];
  });

  // Visible width — block characters render as one column in monospace fonts.
  const widths = headers.map((h, i) =>
    Math.max(visibleWidth(h), ...rows.map((r) => visibleWidth(r[i]!))),
  );

  // CRAP, Δ and COMP columns right-aligned. Δ is at index 2 only when shown.
  const ALIGN_RIGHT = showDelta ? new Set([1, 2, 3]) : new Set([1, 2]);
  const padCell = (cell: string, col: number) => {
    const gap = widths[col]! - visibleWidth(cell);
    if (gap <= 0) return cell;
    return ALIGN_RIGHT.has(col)
      ? ' '.repeat(gap) + cell
      : cell + ' '.repeat(gap);
  };

  const formatRow = (cells: string[]) =>
    cells.map((cell, i) => padCell(cell, i)).join('  ');

  lines.push(formatRow(headers));
  lines.push(formatRow(widths.map((w) => '─'.repeat(w))));
  for (const row of rows) lines.push(formatRow(row));
  return lines.join('\n');
}

function statusIcon(
  crap: number,
  threshold: number,
  failOn: number | undefined,
  entry: DiffEntry | undefined,
): string {
  // Diff status takes precedence: a regression is more actionable signal
  // than the absolute threshold for someone reviewing a PR.
  if (entry) {
    if (entry.status === 'regressed') return '↑';
    if (entry.status === 'new') return '+';
    if (entry.status === 'moved') return '→';
    if (entry.status === 'improved') return '↓';
  }
  if (failOn !== undefined && crap > failOn) return '✗';
  if (crap > threshold) return '▲';
  return '✓';
}

function deltaCell(entry: DiffEntry | undefined): string {
  if (!entry) return '—';
  if (entry.status === 'new') return 'NEW';
  if (entry.status === 'removed') return 'GONE';
  return deltaSign(entry.delta);
}

function coverageCell(coverage: number, missing: boolean): string {
  if (missing) return `${'░'.repeat(BAR_WIDTH)}    n/a`;
  const filled = Math.round((coverage / 100) * BAR_WIDTH);
  const bar =
    FULL_BLOCK.repeat(filled) + EMPTY_BLOCK.repeat(BAR_WIDTH - filled);
  return `${bar} ${coverage.toFixed(0).padStart(3)}%`;
}

/**
 * Width as the terminal sees it. Block characters (█░) are emitted as
 * single-column glyphs in every monospace font I've tested; for everything
 * else we fall back to string length.
 */
function visibleWidth(s: string): number {
  // Strip ANSI escapes if we ever add colour later, and strip the trailing
  // status-icon variation selector. For now plain length is correct because
  // each character we emit (digits, letters, █, ░, ─) is exactly one column.
  return [...s].length;
}
