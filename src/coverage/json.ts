import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CoverageFormat } from '../core/types.js';
import { PathIndex } from './pathIndex.js';
import type { CoverageProvider, RangeCoverage } from './provider.js';

type StatementLoc = {
  start: { line: number };
  end?: { line: number };
};

type FileRecord = {
  path?: string;
  statementMap: Record<string, StatementLoc>;
  s: Record<string, number>;
};

type CoverageJson = Record<string, FileRecord>;

export function loadJsonCoverage(
  file: string,
  format: CoverageFormat,
): CoverageProvider {
  const absFile = resolve(file);
  const raw = readFileSync(absFile, 'utf8');
  const parsed = JSON.parse(raw) as CoverageJson;

  // Index entries by their reported path verbatim. PathIndex handles
  // absolute-vs-relative routing internally; we don't `resolve()` here
  // because that would silently re-root a sub-package's relative paths
  // against this process's cwd — exactly the bug v0.4 fixes.
  const index = new PathIndex<FileRecord>();
  for (const [key, record] of Object.entries(parsed)) {
    const path = record.path ?? key;
    index.set(path, record);
  }

  return {
    source: absFile,
    format,
    getRangeCoverage: (filePath, startLine, endLine) =>
      rangeCoverage(index, filePath, startLine, endLine),
  };
}

function rangeCoverage(
  index: PathIndex<FileRecord>,
  filePath: string,
  startLine: number,
  endLine: number,
): RangeCoverage | undefined {
  const record = index.get(filePath);
  if (!record) return undefined;

  let total = 0;
  let covered = 0;
  for (const [id, stmt] of Object.entries(record.statementMap)) {
    const line = stmt.start.line;
    if (line < startLine || line > endLine) continue;
    total++;
    if ((record.s[id] ?? 0) > 0) covered++;
  }
  if (total === 0) return undefined;
  return { total, covered };
}
