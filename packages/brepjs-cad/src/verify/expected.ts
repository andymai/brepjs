import type { VerifyAssertion, VerifyMeasurements } from './report.js';

export interface ExpectedBounds {
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  zMin?: number;
  zMax?: number;
}

/** Asserted dimensions a part may `export const expected` to gate its own verification. */
export interface ExpectedDims {
  volume?: number;
  area?: number;
  bounds?: ExpectedBounds;
  /** Allowed percent deviation for each numeric comparison; defaults to 0.5%. */
  tolerancePct?: number;
}

export const DEFAULT_TOLERANCE_PCT = 0.5;

/**
 * Absolute slack (mm / mm² / mm³) below which a deviation always passes, independent of
 * percent tolerance. Kernel coordinates carry sub-nanometer float noise (e.g. a loft base
 * lands at z = -1e-7, not 0), so a percent comparison against an expected `0` — where any
 * nonzero deviation is infinite percent — would make a zero-valued bound or measurement
 * impossible to assert. 1e-6 is far above that noise and far below any real feature size.
 */
export const ABS_EPSILON = 1e-6;

/** Percent deviation of `actual` from `expected`; 0 expected matches only 0 actual. */
export function pctDelta(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : Infinity;
  return (Math.abs(actual - expected) / Math.abs(expected)) * 100;
}

function withinTolerance(actual: number, expected: number, tolerancePct: number): boolean {
  // Absolute-epsilon escape hatch first, so a near-zero expectation (the percent metric's
  // blind spot) still passes against noisy-but-correct kernel output.
  if (Math.abs(actual - expected) <= ABS_EPSILON) return true;
  return pctDelta(actual, expected) <= tolerancePct;
}

const TOP_LEVEL_KEYS = new Set(['volume', 'area', 'bounds', 'tolerancePct']);
const BOUND_KEYS = new Set(['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax']);

/**
 * Keys in an `expected` block that the CLI does not understand and would silently ignore — a
 * `{ min: [...], max: [...] }` or `{ x: [...] }` bounds shape, or a misspelled top-level field.
 * Surfaced as an error (not dropped) so a wrong `expected` shape fails loud instead of passing
 * vacuously with the intended assertion never run.
 */
export function unknownExpectedKeys(expected: object): string[] {
  const bad: string[] = [];
  for (const k of Object.keys(expected)) if (!TOP_LEVEL_KEYS.has(k)) bad.push(k);
  const bounds = (expected as { bounds?: unknown }).bounds;
  if (bounds && typeof bounds === 'object') {
    for (const k of Object.keys(bounds)) if (!BOUND_KEYS.has(k)) bad.push(`bounds.${k}`);
  }
  return bad;
}

export function isExpectedDims(v: unknown): v is ExpectedDims {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const numOk = (k: string): boolean => r[k] === undefined || typeof r[k] === 'number';
  const boundsOk =
    r['bounds'] === undefined || (typeof r['bounds'] === 'object' && r['bounds'] !== null);
  return numOk('volume') && numOk('area') && numOk('tolerancePct') && boundsOk;
}

function pushAssertion(
  out: VerifyAssertion[],
  name: string,
  expected: number,
  actual: number | undefined,
  tolerancePct: number
): void {
  if (actual === undefined) {
    out.push({ name, expected, actual: null, passed: false });
    return;
  }
  out.push({ name, expected, actual, passed: withinTolerance(actual, expected, tolerancePct) });
}

/**
 * Compare measured dimensions against a part's `expected` export. Each declared field becomes one
 * assertion; a missing measurement for a declared expectation is a failing assertion (`actual:null`).
 */
export function evaluateExpected(
  expected: ExpectedDims,
  measurements: VerifyMeasurements
): VerifyAssertion[] {
  const tol = expected.tolerancePct ?? DEFAULT_TOLERANCE_PCT;
  const assertions: VerifyAssertion[] = [];

  if (expected.volume !== undefined) {
    pushAssertion(assertions, 'volume', expected.volume, measurements.volume, tol);
  }
  if (expected.area !== undefined) {
    pushAssertion(assertions, 'area', expected.area, measurements.area, tol);
  }
  if (expected.bounds) {
    const b = measurements.bounds;
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const) {
      const want = expected.bounds[key];
      if (want === undefined) continue;
      pushAssertion(assertions, `bounds.${key}`, want, b?.[key], tol);
    }
  }
  return assertions;
}
