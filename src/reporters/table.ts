import { relative } from 'node:path';
import type { AnalyseResult, CrapFunction, DiffEntry } from '../core/types.js';
import { deltaSign, makeDiffLookup } from './diffLookup.js';
import { type ReporterContext, thresholdsFor } from './index.js';

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
  // "above threshold" honours per-path overrides — a function in legacy/**
  // with a raised threshold isn't counted as crappy.
  const crappy = result.functions.filter(
    (f) => f.crap > thresholdsFor(ctx, f.file).threshold,
  ).length;
  const crappyPct = total === 0 ? 0 : (crappy / total) * 100;
  const worst = result.functions[0];
  const showHot = result.churnSince !== undefined;

  lines.push(
    `Scanned ${result.filesScanned} files. ${total} functions analysed${
      result.complexityMetric === 'cognitive' ? ' (cognitive complexity).' : '.'
    }`,
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
  if (showHot) {
    lines.push(
      `Hotspots: CRAP × commits since ${result.churnSince} (HOT column, sorted).`,
    );
  }
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

  // In hotspot mode the headline ranking is crap × churn, not crap alone.
  const ranked = showHot
    ? [...result.functions].sort((a, b) => (b.hotspot ?? 0) - (a.hotspot ?? 0))
    : result.functions;
  const top = ranked.slice(0, ctx.top);
  if (top.length === 0) {
    lines.push('No functions to display.');
    return lines.join('\n');
  }

  const lookup = ctx.diff ? makeDiffLookup(ctx.diff) : undefined;
  const showDelta = lookup !== undefined;

  if (
    ctx.reportBy === 'package' &&
    top.some((fn) => fn.package !== undefined)
  ) {
    return renderByPackage(lines, top, ctx, lookup, showDelta);
  }

  const headers = buildHeaders(showDelta, showHot);
  const rows = top.map((fn) =>
    rowFor(fn, ctx, lookup?.(fn), showDelta, showHot, cwd),
  );

  // Visible width — block characters render as one column in monospace fonts.
  const widths = headers.map((h, i) =>
    Math.max(visibleWidth(h), ...rows.map((r) => visibleWidth(r[i]!))),
  );

  const rightAligned = rightAlignedCols(showDelta, showHot);
  const padCell = (cell: string, col: number) => {
    const gap = widths[col]! - visibleWidth(cell);
    if (gap <= 0) return cell;
    return rightAligned.has(col)
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

// Column layout depends on which optional columns are active. HOT/CHURN sit
// right after CRAP; Δ (baseline) when present sits after those.
function buildHeaders(showDelta: boolean, showHot: boolean): string[] {
  const cols = ['', 'CRAP'];
  if (showHot) cols.push('HOT', 'CHURN');
  if (showDelta) cols.push('Δ');
  cols.push('COMP', 'COVERAGE', 'LOCATION', 'FUNCTION');
  return cols;
}

function rightAlignedCols(showDelta: boolean, showHot: boolean): Set<number> {
  // Numeric columns are right-aligned. Walk the same order buildHeaders uses.
  const right = new Set<number>([1]); // CRAP
  let i = 2;
  if (showHot) {
    right.add(i++); // HOT
    right.add(i++); // CHURN
  }
  if (showDelta) right.add(i++); // Δ
  right.add(i); // COMP
  return right;
}

/**
 * Render the table grouped by workspace package. Sorts packages by their
 * sum-of-CRAP (worst first) — that's the lens monorepo maintainers actually
 * use when deciding "which team needs to refactor". Within each package
 * functions are still sorted by CRAP descending.
 */
function renderByPackage(
  lines: string[],
  top: CrapFunction[],
  ctx: ReporterContext,
  lookup: ((fn: CrapFunction) => DiffEntry | undefined) | undefined,
  showDelta: boolean,
): string {
  const cwd = process.cwd();
  const groups = new Map<string, CrapFunction[]>();
  for (const fn of top) {
    const key = fn.package ?? '(no package)';
    const arr = groups.get(key);
    if (arr) arr.push(fn);
    else groups.set(key, [fn]);
  }

  const orderedGroups = [...groups.entries()].sort((a, b) => {
    const sumA = a[1].reduce((s, fn) => s + fn.crap, 0);
    const sumB = b[1].reduce((s, fn) => s + fn.crap, 0);
    return sumB - sumA;
  });

  const headers = buildHeaders(showDelta, false);

  const allRows = top.map((fn) =>
    rowFor(fn, ctx, lookup?.(fn), showDelta, false, cwd),
  );
  const widths = headers.map((h, i) =>
    Math.max(visibleWidth(h), ...allRows.map((r) => visibleWidth(r[i]!))),
  );
  const rightAligned = rightAlignedCols(showDelta, false);
  const formatRow = (cells: string[]) =>
    cells
      .map((cell, i) => {
        const gap = widths[i]! - visibleWidth(cell);
        if (gap <= 0) return cell;
        return rightAligned.has(i)
          ? ' '.repeat(gap) + cell
          : cell + ' '.repeat(gap);
      })
      .join('  ');

  for (const [pkg, fns] of orderedGroups) {
    const total = fns.reduce((s, fn) => s + fn.crap, 0);
    lines.push('');
    lines.push(`▸ ${pkg}  (${fns.length} fns · Σcrap ${total.toFixed(0)})`);
    lines.push(formatRow(headers));
    lines.push(formatRow(widths.map((w) => '─'.repeat(w))));
    for (const fn of fns) {
      lines.push(
        formatRow(rowFor(fn, ctx, lookup?.(fn), showDelta, false, cwd)),
      );
    }
  }
  return lines.join('\n');
}

function rowFor(
  fn: CrapFunction,
  ctx: ReporterContext,
  entry: DiffEntry | undefined,
  showDelta: boolean,
  showHot: boolean,
  cwd: string,
): string[] {
  const { threshold, failOn } = thresholdsFor(ctx, fn.file);
  const cells = [
    statusIcon(fn.crap, threshold, failOn, entry),
    fn.crap.toFixed(1),
  ];
  if (showHot) {
    cells.push((fn.hotspot ?? 0).toFixed(0), String(fn.churn ?? 0));
  }
  if (showDelta) cells.push(deltaCell(entry));
  cells.push(
    String(fn.complexity),
    coverageCell(fn.coverage, fn.coverageMissing),
    `${relative(cwd, fn.file)}:${fn.startLine}`,
    fn.name,
  );
  return cells;
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
