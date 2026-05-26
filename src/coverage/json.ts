import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CoverageFormat } from '../core/types.js';
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

  // Normalise keys to resolved absolute paths so we can match what ts-morph
  // gives us. The `path` property inside each record is authoritative when
  // present; otherwise we fall back to the object key.
  const normalised = new Map<string, FileRecord>();
  for (const [key, record] of Object.entries(parsed)) {
    const path = record.path ?? key;
    normalised.set(resolve(path), record);
  }

  return {
    source: absFile,
    format,
    getRangeCoverage: (filePath, startLine, endLine) =>
      rangeCoverage(normalised, filePath, startLine, endLine),
  };
}

function rangeCoverage(
  files: Map<string, FileRecord>,
  filePath: string,
  startLine: number,
  endLine: number,
): RangeCoverage | undefined {
  const record = files.get(resolve(filePath));
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
