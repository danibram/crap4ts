import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PathIndex } from './pathIndex.js';
import type { CoverageProvider, RangeCoverage } from './provider.js';

type LcovFile = {
  // line number → hit count
  lineHits: Map<number, number>;
};

export function loadLcovCoverage(file: string): CoverageProvider {
  const absFile = resolve(file);
  const raw = readFileSync(absFile, 'utf8');

  const index = new PathIndex<LcovFile>();
  let current: { path: string; data: LcovFile } | undefined;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      // Store the reported path verbatim — PathIndex routes absolute vs
      // relative; resolving here would re-root subpackage paths against cwd.
      const path = line.slice(3).trim();
      current = { path, data: { lineHits: new Map() } };
      index.set(path, current.data);
      continue;
    }
    if (!current) continue;

    if (line.startsWith('DA:')) {
      const [lineNumRaw, hitsRaw] = line.slice(3).split(',');
      const lineNum = Number(lineNumRaw);
      const hits = Number(hitsRaw);
      if (Number.isFinite(lineNum) && Number.isFinite(hits)) {
        // LCOV can emit multiple DA: for the same line (e.g. branches on the
        // same line). Take the max — if any branch fired, the line ran.
        const existing = current.data.lineHits.get(lineNum) ?? 0;
        current.data.lineHits.set(lineNum, Math.max(existing, hits));
      }
      continue;
    }

    if (line === 'end_of_record') {
      current = undefined;
    }
  }

  return {
    source: absFile,
    format: 'lcov',
    getRangeCoverage: (filePath, startLine, endLine) =>
      rangeCoverage(index, filePath, startLine, endLine),
  };
}

function rangeCoverage(
  index: PathIndex<LcovFile>,
  filePath: string,
  startLine: number,
  endLine: number,
): RangeCoverage | undefined {
  const record = index.get(filePath);
  if (!record) return undefined;

  let total = 0;
  let covered = 0;
  for (const [line, hits] of record.lineHits) {
    if (line < startLine || line > endLine) continue;
    total++;
    if (hits > 0) covered++;
  }
  if (total === 0) return undefined;
  return { total, covered };
}
