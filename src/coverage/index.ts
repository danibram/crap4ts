import { readFileSync } from 'node:fs';
import type { CoverageFormat } from '../core/types.js';
import { loadJsonCoverage } from './json.js';
import { loadLcovCoverage } from './lcov.js';
import type { CoverageProvider, RangeCoverage } from './provider.js';

export type { CoverageProvider, RangeCoverage };

export async function loadCoverage(
  file: string,
  format: CoverageFormat | 'auto',
): Promise<CoverageProvider> {
  const resolved = format === 'auto' ? detectFormat(file) : format;

  if (resolved === 'lcov') return loadLcovCoverage(file);
  return loadJsonCoverage(file, resolved);
}

export function detectFormat(file: string): CoverageFormat {
  const head = readFileSync(file, 'utf8').slice(0, 256).trimStart();

  // LCOV records always open with `TN:` (test name, often empty) or `SF:`
  // (source file). Anything else with a JSON-looking opening brace is one of
  // the v8/istanbul shapes.
  if (head.startsWith('TN:') || head.startsWith('SF:')) return 'lcov';
  if (!head.startsWith('{')) {
    throw new Error(
      `Cannot detect coverage format for ${file} — expected LCOV or JSON. ` +
        'Pass --coverage-format explicitly.',
    );
  }

  // v8 vs istanbul — structurally identical for our needs. We sniff a known
  // v8 marker (`"all":true` is emitted by @vitest/coverage-v8 / c8 but not by
  // nyc/istanbul). When in doubt, default to istanbul; the behaviour is the
  // same and the label is just metadata.
  return head.includes('"all":true') ? 'v8' : 'istanbul';
}
