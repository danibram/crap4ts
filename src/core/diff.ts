import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type {
  BaselineFunction,
  CrapFunction,
  DiffEntry,
  DiffResult,
  DiffStatus,
  DiffSummary,
} from './types.js';

export type LoadedBaseline = {
  source: string;
  version: string;
  functions: BaselineFunction[];
};

const SUPPORTED_VERSIONS = new Set(['1']);

/**
 * Load and validate a previously-emitted JSON envelope. Accepts versions
 * listed in SUPPORTED_VERSIONS; an unknown version is surfaced as an error
 * so users notice format drift instead of silently getting a stale diff.
 */
export function loadBaseline(path: string): LoadedBaseline {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`Baseline file not found: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (err) {
    throw new Error(`Baseline at ${path} is not valid JSON: ${String(err)}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Baseline at ${path} is not a JSON object`);
  }
  const env = parsed as Record<string, unknown>;
  const version = String(env.version ?? '');
  if (!SUPPORTED_VERSIONS.has(version)) {
    throw new Error(
      `Baseline at ${path} has unsupported version "${version}". Expected one of: ${[...SUPPORTED_VERSIONS].join(', ')}.`,
    );
  }
  const fns = Array.isArray(env.functions) ? env.functions : [];
  const functions: BaselineFunction[] = [];
  for (const raw of fns) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.file !== 'string' || typeof r.name !== 'string') continue;
    functions.push({
      file: r.file,
      name: r.name,
      startLine: numberOr(r.startLine, 0),
      endLine: numberOr(r.endLine, 0),
      complexity: numberOr(r.complexity, 0),
      coverage: r.coverage === null ? null : numberOr(r.coverage, 0),
      crap: numberOr(r.crap, 0),
      ...(typeof r.hash === 'string' ? { hash: r.hash } : {}),
    });
  }
  return { source: resolved, version, functions };
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export type DiffOptions = {
  /**
   * Tolerance applied to |Δcrap| when classifying improved/regressed. Anything
   * within this band is reported as `unchanged`. Coverage tools jitter by a
   * tenth here and there, so a small epsilon stops trivial fluctuation from
   * breaking CI.
   */
  epsilon?: number;
};

/**
 * Diff a current scan against a baseline.
 *
 * Matching is three passes, in this order:
 *   1. **By hash** (with same-name preference). Hash identity is the
 *      strongest signal — a function whose body bytes are unchanged is the
 *      same function. If file+name also match, the pair is classified per
 *      epsilon; otherwise it's a `moved` (file changed) or rename
 *      (same file, name changed). We prefer same-name candidates when a
 *      hash is shared by multiple baseline entries so we don't accidentally
 *      pair foo-old with bar-current just because their bodies collided.
 *   2. **By unique file::name**. Catches the common case "function body
 *      changed but name and file are the same" — i.e. real regressions /
 *      improvements. We only pair when the key is unique on BOTH sides;
 *      ambiguous keys (multiple `<anonymous>` arrows in the same file) fall
 *      through to the leftover pass to avoid mis-pairing.
 *   3. Leftovers → `new` (current side) or `removed` (baseline side).
 *
 * `unchanged` rows are kept in the entries list so reporters can render hot
 * spots that existed pre-baseline; the summary counts cover the same set.
 */
export function diffAgainstBaseline(
  current: CrapFunction[],
  baseline: BaselineFunction[],
  options: DiffOptions = {},
): DiffResult {
  const epsilon = options.epsilon ?? 0.01;
  const cwd = process.cwd();

  const consumedBaseline = new Set<BaselineFunction>();
  const consumedCurrent = new Set<CrapFunction>();
  const entries: DiffEntry[] = [];

  // --- Pass 1: hash-based pairing -----------------------------------------
  // Multi-map: a hash can appear more than once when two distinct functions
  // happen to have byte-identical bodies (rare, but real for trivial getters).
  const baselineByHash = new Map<string, BaselineFunction[]>();
  for (const b of baseline) {
    if (!b.hash) continue;
    const arr = baselineByHash.get(b.hash);
    if (arr) arr.push(b);
    else baselineByHash.set(b.hash, [b]);
  }

  for (const cur of current) {
    if (!cur.hash) continue;
    const candidates = baselineByHash.get(cur.hash);
    if (!candidates || candidates.length === 0) continue;
    const curFile = relPath(cur.file, cwd);
    // Prefer a candidate that matches both file and name — that's "really
    // the same function". Only fall back to any candidate when there's no
    // exact location match.
    let idx = candidates.findIndex(
      (c) => c.file === curFile && c.name === cur.name,
    );
    if (idx < 0) idx = 0;
    const b = candidates.splice(idx, 1)[0]!;
    consumedBaseline.add(b);
    consumedCurrent.add(cur);
    const sameLocation = b.file === curFile && b.name === cur.name;
    if (sameLocation) {
      entries.push(classifyPair(cur, b, epsilon));
    } else {
      entries.push({
        status: 'moved',
        current: cur,
        baseline: b,
        delta: cur.crap - b.crap,
      });
    }
  }

  // --- Pass 2: unique file::name pairing for leftovers --------------------
  // Counted multimap from both sides; only pair when both sides have exactly
  // one entry under that key. Otherwise we'd be guessing.
  const baselineByName = new Map<string, BaselineFunction[]>();
  for (const b of baseline) {
    if (consumedBaseline.has(b)) continue;
    const k = `${b.file}::${b.name}`;
    const arr = baselineByName.get(k);
    if (arr) arr.push(b);
    else baselineByName.set(k, [b]);
  }
  const currentByName = new Map<string, CrapFunction[]>();
  for (const cur of current) {
    if (consumedCurrent.has(cur)) continue;
    const k = `${relPath(cur.file, cwd)}::${cur.name}`;
    const arr = currentByName.get(k);
    if (arr) arr.push(cur);
    else currentByName.set(k, [cur]);
  }
  for (const [k, curs] of currentByName) {
    const bases = baselineByName.get(k);
    if (!bases || curs.length !== 1 || bases.length !== 1) continue;
    const cur = curs[0]!;
    const b = bases[0]!;
    consumedCurrent.add(cur);
    consumedBaseline.add(b);
    entries.push(classifyPair(cur, b, epsilon));
  }

  // --- Pass 3: leftovers --------------------------------------------------
  for (const cur of current) {
    if (consumedCurrent.has(cur)) continue;
    entries.push({ status: 'new', current: cur, delta: 0 });
  }
  for (const b of baseline) {
    if (consumedBaseline.has(b)) continue;
    entries.push({ status: 'removed', baseline: b, delta: 0 });
  }

  // Sort: regressed first (worst delta on top), then new, moved, unchanged
  // hot-spots, improved, removed. CI users skim the top; we put the worst
  // news there.
  const STATUS_ORDER: Record<DiffStatus, number> = {
    regressed: 0,
    new: 1,
    moved: 2,
    unchanged: 3,
    improved: 4,
    removed: 5,
  };
  entries.sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    if (a.status === 'regressed' || a.status === 'improved') {
      return Math.abs(b.delta) - Math.abs(a.delta);
    }
    const ac = a.current?.crap ?? a.baseline?.crap ?? 0;
    const bc = b.current?.crap ?? b.baseline?.crap ?? 0;
    return bc - ac;
  });

  return { entries, summary: summarise(entries), epsilon };
}

function classifyPair(
  current: CrapFunction,
  baseline: BaselineFunction,
  epsilon: number,
): DiffEntry {
  const delta = current.crap - baseline.crap;
  if (Math.abs(delta) <= epsilon) {
    return { status: 'unchanged', current, baseline, delta };
  }
  return {
    status: delta > 0 ? 'regressed' : 'improved',
    current,
    baseline,
    delta,
  };
}

function summarise(entries: DiffEntry[]): DiffSummary {
  const summary: DiffSummary = {
    new: 0,
    removed: 0,
    moved: 0,
    improved: 0,
    regressed: 0,
    unchanged: 0,
    regressions: 0,
  };
  for (const e of entries) summary[e.status]++;
  summary.regressions = summary.regressed;
  return summary;
}

/**
 * The baseline JSON stores paths relative to the cwd that produced it. The
 * current scan carries absolute paths. Normalise the current side back to
 * relative before comparing — without this, file equality never holds and
 * everything ends up flagged as `moved`.
 */
function relPath(file: string, cwd: string): string {
  return isAbsolute(file) ? relative(cwd, file) : file;
}
