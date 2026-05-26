import { relative } from 'node:path';
import type { AnalyseResult, CrapFunction, DiffEntry } from '../core/types.js';
import { deltaSign } from './diffLookup.js';
import type { ReporterContext } from './index.js';

/**
 * The sticky marker is what a PR-bot workflow searches for to decide whether
 * to update an existing comment or post a new one. Don't change this string
 * without coordinating with anyone parsing comment bodies — it's part of the
 * tool's user-visible contract.
 */
const STICKY_MARKER = '<!-- crap4ts-report -->';

const TOP_HOTSPOTS = 10;

/**
 * Opinionated PR-bot comment. When --baseline is supplied:
 *   - Main table = regressions + new functions (the "what got worse" view).
 *   - <details> collapsing improvements and unchanged hot-spots so the
 *     comment stays scannable.
 *
 * Without a baseline it degrades to a brief summary + top offenders — still
 * useful as a one-off PR comment for repos that haven't set up the workflow.
 */
export function renderPrComment(
  result: AnalyseResult,
  ctx: ReporterContext,
): string {
  const cwd = process.cwd();
  const lines: string[] = [STICKY_MARKER, ''];

  const total = result.functions.length;
  const crappy = result.functions.filter((f) => f.crap > ctx.threshold).length;
  const crappyPct = total === 0 ? 0 : (crappy / total) * 100;

  lines.push('## C.R.A.P. report');
  lines.push('');

  if (!ctx.diff) {
    lines.push(
      `Scanned **${result.filesScanned}** files · **${total}** functions analysed · ` +
        `**${crappy}** above \`CRAP > ${ctx.threshold}\` (${crappyPct.toFixed(1)}%).`,
    );
    lines.push('');
    appendTopOffenders(lines, result.functions.slice(0, TOP_HOTSPOTS), ctx);
    lines.push('');
    lines.push(
      '_Tip: re-run with `--baseline <file>` to see only what changed in this PR._',
    );
    return `${lines.join('\n')}\n`;
  }

  const diff = ctx.diff;
  const s = diff.summary;
  const verdict =
    s.regressed > 0
      ? `🚨 **${s.regressed}** function${s.regressed === 1 ? '' : 's'} regressed`
      : s.new > 0
        ? `⚠️ **${s.new}** new function${s.new === 1 ? '' : 's'} introduced`
        : '✅ No regressions';

  lines.push(verdict);
  lines.push('');
  lines.push(
    `Scanned **${result.filesScanned}** files · ` +
      `**${s.regressed}** regressed · **${s.new}** new · ` +
      `**${s.moved}** moved · **${s.improved}** improved · ` +
      `**${s.removed}** removed · epsilon \`${diff.epsilon}\``,
  );
  lines.push('');

  // Main table: things this PR introduced or worsened. We list regressions
  // first (sorted worst-delta), then new functions (sorted by absolute CRAP).
  const regressed = diff.entries.filter((e) => e.status === 'regressed');
  const fresh = diff.entries
    .filter((e) => e.status === 'new')
    .sort((a, b) => (b.current?.crap ?? 0) - (a.current?.crap ?? 0));

  if (regressed.length + fresh.length === 0) {
    lines.push('_Nothing new to flag in this PR._');
    lines.push('');
  } else {
    lines.push('### Needs attention');
    lines.push('');
    lines.push('| | Function | Location | CRAP | Δ | Comp | Cov |');
    lines.push('|---|---|---|---:|---:|---:|---:|');
    for (const e of regressed) lines.push(rowFor(e, cwd));
    for (const e of fresh) lines.push(rowFor(e, cwd));
    lines.push('');
  }

  // Improvements: collapsed so the noise doesn't drown the bad news.
  const improved = diff.entries.filter((e) => e.status === 'improved');
  if (improved.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Improved (${improved.length})</summary>`);
    lines.push('');
    lines.push('| Function | Location | CRAP | Δ |');
    lines.push('|---|---|---:|---:|');
    for (const e of improved) {
      const cur = e.current;
      if (!cur) continue;
      const loc = `\`${relative(cwd, cur.file)}:${cur.startLine}\``;
      lines.push(
        `| \`${cur.name}\` | ${loc} | ${cur.crap.toFixed(1)} | ${deltaSign(e.delta)} |`,
      );
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Existing hot-spots: unchanged-but-still-bad. Useful context for reviewers
  // who want to know which legacy lava the PR was edging past.
  const hotspots = diff.entries
    .filter(
      (e) =>
        e.status === 'unchanged' &&
        e.current !== undefined &&
        e.current.crap > ctx.threshold,
    )
    .slice(0, TOP_HOTSPOTS);
  if (hotspots.length > 0) {
    lines.push('<details>');
    lines.push(
      `<summary>Existing hot-spots (top ${hotspots.length})</summary>`,
    );
    lines.push('');
    lines.push('| Function | Location | CRAP |');
    lines.push('|---|---|---:|');
    for (const e of hotspots) {
      const cur = e.current!;
      const loc = `\`${relative(cwd, cur.file)}:${cur.startLine}\``;
      lines.push(`| \`${cur.name}\` | ${loc} | ${cur.crap.toFixed(1)} |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Moves are usually not actionable, but worth a peek when reviewing a
  // refactor PR. Collapsed by default.
  const moved = diff.entries.filter((e) => e.status === 'moved');
  if (moved.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Moved / renamed (${moved.length})</summary>`);
    lines.push('');
    lines.push('| Function | From | To | Δ |');
    lines.push('|---|---|---|---:|');
    for (const e of moved) {
      if (!e.current || !e.baseline) continue;
      const from = `\`${e.baseline.file}:${e.baseline.startLine}\``;
      const to = `\`${relative(cwd, e.current.file)}:${e.current.startLine}\``;
      lines.push(
        `| \`${e.current.name}\` | ${from} | ${to} | ${deltaSign(e.delta)} |`,
      );
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function rowFor(entry: DiffEntry, cwd: string): string {
  const cur = entry.current!;
  const icon = entry.status === 'regressed' ? '⬆️' : '🆕';
  const loc = `\`${relative(cwd, cur.file)}:${cur.startLine}\``;
  const delta = entry.status === 'new' ? '**NEW**' : deltaSign(entry.delta);
  const cov = cur.coverageMissing ? 'n/a' : `${cur.coverage.toFixed(0)}%`;
  return `| ${icon} | \`${cur.name}\` | ${loc} | ${cur.crap.toFixed(1)} | ${delta} | ${cur.complexity} | ${cov} |`;
}

function appendTopOffenders(
  lines: string[],
  fns: CrapFunction[],
  ctx: ReporterContext,
): void {
  if (fns.length === 0) {
    lines.push('_No functions to display._');
    return;
  }
  lines.push('### Top offenders');
  lines.push('');
  lines.push('| | Function | Location | CRAP | Comp | Cov |');
  lines.push('|---|---|---|---:|---:|---:|');
  const cwd = process.cwd();
  for (const fn of fns) {
    const icon =
      ctx.failOn !== undefined && fn.crap > ctx.failOn
        ? '🚨'
        : fn.crap > ctx.threshold
          ? '⚠️'
          : '✅';
    const loc = `\`${relative(cwd, fn.file)}:${fn.startLine}\``;
    const cov = fn.coverageMissing ? 'n/a' : `${fn.coverage.toFixed(0)}%`;
    lines.push(
      `| ${icon} | \`${fn.name}\` | ${loc} | ${fn.crap.toFixed(1)} | ${fn.complexity} | ${cov} |`,
    );
  }
}

// Surfaces the literal so callers (and tests) can assert on it without
// duplicating the string. Keeps the sticky-marker contract single-sourced.
export { STICKY_MARKER };
