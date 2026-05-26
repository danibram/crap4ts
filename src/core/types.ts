export type CoverageFormat = 'v8' | 'istanbul' | 'lcov';

export type ReporterName = 'table' | 'json' | 'markdown' | 'github';

export type MissingPolicy = 'pessimistic' | 'optimistic' | 'skip';

export type CrapFunction = {
  file: string;
  name: string;
  startLine: number;
  endLine: number;
  complexity: number;
  coverage: number;
  crap: number;
  /**
   * True when no coverage data was found for this function's line range.
   * Lets reporters distinguish "0% actually measured" from "no data at all".
   */
  coverageMissing: boolean;
};

export type AnalyseOptions = {
  paths: string[];
  ignore?: string[];
  coverageFile?: string;
  coverageFormat?: CoverageFormat | 'auto';
  tsconfigPath?: string;
  /** How to treat functions with no coverage data. Default: 'pessimistic'. */
  missing?: MissingPolicy;
};

export type AnalyseResult = {
  functions: CrapFunction[];
  filesScanned: number;
  coverageSource?: string;
  coverageFormat?: CoverageFormat;
};
