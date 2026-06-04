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

/** Percent deviation of `actual` from `expected`; 0 expected matches only 0 actual. */
export function pctDelta(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : Infinity;
  return (Math.abs(actual - expected) / Math.abs(expected)) * 100;
}

function withinTolerance(actual: number, expected: number, tolerancePct: number): boolean {
  return pctDelta(actual, expected) <= tolerancePct;
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
