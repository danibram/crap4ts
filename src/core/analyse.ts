import type { AnalyseOptions, AnalyseResult } from './types.js';

// Real implementation lands in Phase 1.
export async function analyse(_options: AnalyseOptions): Promise<AnalyseResult> {
  return {
    functions: [],
    filesScanned: 0,
  };
}
