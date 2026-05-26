import type { CoverageFormat } from '../core/types.js';

export type RangeCoverage = {
  total: number;
  covered: number;
};

export type CoverageProvider = {
  source: string;
  format: CoverageFormat;
  getRangeCoverage(
    file: string,
    startLine: number,
    endLine: number,
  ): RangeCoverage | undefined;
};
