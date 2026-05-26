export type CoverageFormat = 'v8' | 'istanbul' | 'lcov';

export type ReporterName = 'table' | 'json' | 'markdown' | 'github';

export type CrapFunction = {
  file: string;
  name: string;
  startLine: number;
  endLine: number;
  complexity: number;
  coverage: number;
  crap: number;
};

export type AnalyseOptions = {
  paths: string[];
  ignore?: string[];
  coverageFile?: string;
  coverageFormat?: CoverageFormat | 'auto';
  tsconfigPath?: string;
};

export type AnalyseResult = {
  functions: CrapFunction[];
  filesScanned: number;
  coverageSource?: string;
  coverageFormat?: CoverageFormat;
};
