import { relative } from 'node:path';
import type { AnalyseResult, DiffEntry } from '../core/types.js';
import { deltaSign, makeDiffLookup } from './diffLookup.js';
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
  const worst = result.functions[0];

  const lines: string[] = [];
  lines.push('## C.R.A.P. report');
  lines.push('');
  lines.push(`- Files scanned: **${result.filesScanned}**`);
  lines.push(`- Functions analysed: **${total}**`);
  lines.push(
    `- Above threshold (\`CRAP > ${ctx.threshold}\`): **${crappy}** (${crappyPct.toFixed(1)}%)`,
  );
  if (worst) {
    lines.push(
      `- Worst: \`${worst.name}\` @ \`${relative(cwd, worst.file)}:${worst.startLine}\` (CRAP ${worst.crap.toFixed(1)})`,
    );
  }
  if (result.coverageSource) {
    lines.push(
      `- Coverage: \`${result.coverageFormat}\` from \`${relative(cwd, result.coverageSource)}\``,
    );
  } else {
    lines.push('- Coverage: _none provided_ — every function defaults to 0%.');
  }
  if (ctx.diff && ctx.baselineSource) {
    const s = ctx.diff.summary;
    lines.push(
      `- Baseline: \`${relative(cwd, ctx.baselineSource)}\` — ` +
        `**${s.regressed}** regressed, **${s.new}** new, ` +
        `**${s.moved}** moved, **${s.improved}** improved, ` +
        `**${s.removed}** removed`,
    );
  }
  lines.push('');

  if (ctx.summary) return `${lines.join('\n')}\n`;

  if (top.length === 0) {
    lines.push('_No functions to display._');
    return `${lines.join('\n')}\n`;
  }

  const lookup = ctx.diff ? makeDiffLookup(ctx.diff) : undefined;
  const showDelta = lookup !== undefined;

  if (showDelta) {
    lines.push('| | CRAP | Δ | Complexity | Coverage | Location | Function |');
    lines.push('|---|---:|---:|---:|---:|---|---|');
  } else {
    lines.push('| | CRAP | Complexity | Coverage | Location | Function |');
    lines.push('|---|---:|---:|---:|---|---|');
  }
  for (const fn of top) {
    const entry = lookup?.(fn);
    const icon = statusIcon(fn.crap, ctx.threshold, ctx.failOn, entry);
    const location = `\`${relative(cwd, fn.file)}:${fn.startLine}\``;
    const cov = fn.coverageMissing ? 'n/a' : `${fn.coverage.toFixed(0)}%`;
    if (showDelta) {
      lines.push(
        `| ${icon} | ${fn.crap.toFixed(1)} | ${deltaCell(entry)} | ${fn.complexity} | ${cov} | ${location} | \`${fn.name}\` |`,
      );
    } else {
      lines.push(
        `| ${icon} | ${fn.crap.toFixed(1)} | ${fn.complexity} | ${cov} | ${location} | \`${fn.name}\` |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function statusIcon(
  crap: number,
  threshold: number,
  failOn: number | undefined,
  entry: DiffEntry | undefined,
): string {
  if (entry) {
    if (entry.status === 'regressed') return '⬆️';
    if (entry.status === 'new') return '🆕';
    if (entry.status === 'moved') return '↔️';
    if (entry.status === 'improved') return '⬇️';
  }
  if (failOn !== undefined && crap > failOn) return '🚨';
  if (crap > threshold) return '⚠️';
  return '✅';
}

function deltaCell(entry: DiffEntry | undefined): string {
  if (!entry) return '—';
  if (entry.status === 'new') return '**NEW**';
  if (entry.status === 'removed') return '_gone_';
  return deltaSign(entry.delta);
}
