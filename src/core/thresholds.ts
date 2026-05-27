import { isAbsolute, relative } from 'node:path';
import type { ThresholdOverride } from '../config.js';

export type EffectiveThreshold = {
  threshold: number;
  failOn: number | undefined;
};

/**
 * Build a resolver that returns the effective threshold/failOn for a given
 * file, applying per-path overrides on top of the global values.
 *
 * Matching is **last-match-wins** (ESLint `overrides` semantics): later
 * entries in the array override earlier ones. This is more predictable than
 * "most specific wins" — you read top-to-bottom and the bottom has the final
 * say. A common layout:
 *
 *   "threshold": 30, "failOn": 100,
 *   "overrides": [
 *     { "paths": "legacy/**", "threshold": 100, "failOn": 500 },
 *     { "paths": ["src/generated/**", "**​/*.gen.ts"], "failOn": null }
 *   ]
 *
 * `failOn: null` in an override explicitly clears the gate for those paths
 * (distinct from "not set", which inherits the global).
 *
 * Globs are matched against the file's cwd-relative path so config authors
 * write the same paths they'd put in `include` / `ignore`.
 */
export function makeThresholdResolver(
  baseThreshold: number,
  baseFailOn: number | undefined,
  overrides: ThresholdOverride[],
  cwd: string = process.cwd(),
): (file: string) => EffectiveThreshold {
  const compiled = overrides.map((o) => ({
    regexes: (Array.isArray(o.paths) ? o.paths : [o.paths]).map(globToRegex),
    threshold: o.threshold,
    failOn: o.failOn,
  }));

  return (file: string): EffectiveThreshold => {
    const rel = isAbsolute(file) ? relative(cwd, file) : file;
    let threshold = baseThreshold;
    let failOn = baseFailOn;
    for (const o of compiled) {
      if (!o.regexes.some((re) => re.test(rel))) continue;
      if (o.threshold !== undefined) threshold = o.threshold;
      if (o.failOn !== undefined) {
        // null = explicitly clear the gate; a number = set it.
        failOn = o.failOn === null ? undefined : o.failOn;
      }
    }
    return { threshold, failOn };
  };
}

function globToRegex(glob: string): RegExp {
  const DSS = '__GLOB_DSS__';
  const DS = '__GLOB_DS__';
  const S = '__GLOB_S__';
  const Q = '__GLOB_Q__';

  const tokenised = glob
    .replace(/\*\*\//g, DSS)
    .replace(/\*\*/g, DS)
    .replace(/\*/g, S)
    .replace(/\?/g, Q);

  const escaped = tokenised.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  const pattern = escaped
    .replaceAll(DSS, '(?:.*/)?')
    .replaceAll(DS, '.*')
    .replaceAll(S, '[^/]*')
    .replaceAll(Q, '[^/]');

  return new RegExp(`^${pattern}$`);
}
