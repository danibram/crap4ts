export type CoverageFormat = 'v8' | 'istanbul' | 'lcov';

export type ReporterName =
  | 'table'
  | 'json'
  | 'markdown'
  | 'github'
  | 'pr-comment'
  | 'sarif'
  | 'eslint';

export type MissingPolicy = 'pessimistic' | 'optimistic' | 'skip';

export type ComplexityMetric = 'cyclomatic' | 'cognitive';

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
  /**
   * SHA-256 (first 16 hex chars) of the function's source text. Stable across
   * formatting-irrelevant changes only insofar as the bytes are unchanged —
   * it's intentionally not a semantic hash. Used by --baseline to detect
   * moves (same body, different file).
   */
  hash: string;
  /**
   * Workspace package name the function lives in. Only populated when
   * --workspace was active during the scan; absent in single-package repos.
   */
  package?: string;
  /**
   * Number of commits touching this function's file within the --since
   * window. Present only in --hotspots mode.
   */
  churn?: number;
  /**
   * crap × churn — the "risky AND frequently-changed" score. Present only in
   * --hotspots mode. This is the quadrant where bugs cluster.
   */
  hotspot?: number;
};

export type AnalyseOptions = {
  paths: string[];
  ignore?: string[];
  coverageFile?: string;
  coverageFormat?: CoverageFormat | 'auto';
  tsconfigPath?: string;
  /** How to treat functions with no coverage data. Default: 'pessimistic'. */
  missing?: MissingPolicy;
  /**
   * Which complexity metric feeds the CRAP formula. 'cyclomatic' (default) is
   * canonical; 'cognitive' is a crap4ts extension that weights nesting.
   */
  complexityMetric?: ComplexityMetric;
  /**
   * When set, every function's enclosing workspace package is recorded on
   * the CrapFunction. The CLI populates this via --workspace; library users
   * can pass it directly.
   */
  workspacePackages?: Array<{ name: string; path: string }>;
  /**
   * Git churn window. When set, each function gets a `churn` (commit count
   * touching its file since this date) and a `hotspot` (crap × churn). The
   * CLI populates this from --since; pass a value git understands
   * (e.g. "90 days ago", "2026-01-01").
   */
  churnSince?: string;
};

export type AnalyseResult = {
  functions: CrapFunction[];
  filesScanned: number;
  coverageSource?: string;
  coverageFormat?: CoverageFormat;
  /** Which complexity metric produced the scores. */
  complexityMetric: ComplexityMetric;
  /** Echoes the churn window when --hotspots was active. */
  churnSince?: string;
};

/**
 * A function entry as it appears in a previous JSON report. Only the fields
 * we actually need for diffing — keeps the loader tolerant of older/newer
 * envelope versions that may have shed or added neighbouring fields.
 */
export type BaselineFunction = {
  file: string;
  name: string;
  startLine: number;
  endLine: number;
  complexity: number;
  coverage: number | null;
  crap: number;
  /** Optional — older v0.2 reports didn't emit it; readers must tolerate. */
  hash?: string;
};

export type DiffStatus =
  | 'new'
  | 'removed'
  | 'moved'
  | 'unchanged'
  | 'improved'
  | 'regressed';

export type DiffEntry = {
  status: DiffStatus;
  /**
   * The current-side function for new/moved/improved/regressed/unchanged.
   * Absent for `removed` (function no longer exists in the current scan).
   */
  current?: CrapFunction;
  /**
   * The baseline-side function for everything except `new`.
   */
  baseline?: BaselineFunction;
  /** current.crap - baseline.crap (0 for new/removed). */
  delta: number;
};

export type DiffSummary = {
  new: number;
  removed: number;
  moved: number;
  improved: number;
  regressed: number;
  unchanged: number;
  /** Same as `regressed`; named loudly because CI keys on it. */
  regressions: number;
};

export type DiffResult = {
  entries: DiffEntry[];
  summary: DiffSummary;
  epsilon: number;
};
