/**
 * The C.R.A.P. formula (Savoia & Evans, 2007):
 *   CRAP(m) = comp(m)^2 * (1 - cov(m)/100)^3 + comp(m)
 *
 * @param complexity Cyclomatic complexity of the method (>= 1).
 * @param coverage   Statement coverage of the method, as a percentage 0..100.
 */
export function crap(complexity: number, coverage: number): number {
  const cov = Math.max(0, Math.min(100, coverage));
  const uncovered = 1 - cov / 100;
  return complexity * complexity * uncovered ** 3 + complexity;
}
