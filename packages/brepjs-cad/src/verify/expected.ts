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
  /**
   * Allowed deviation in percent, defaulting to 0.5%: of the expected value for `volume` and
   * `area`, and of the part's largest bounding-box extent for each `bounds` field.
   */
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
  return invalidExpectedValues(v).length === 0;
}

const isFiniteNumber = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

/**
 * Fields of an `expected` export that aren't finite numbers, such as `volume: v.toFixed(1)` (a
 * string). Such a block can't be evaluated, so these are surfaced as an error: skipping the block
 * would also skip its valid assertions and let the part pass with nothing checked.
 */
export function invalidExpectedValues(v: unknown): string[] {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return ['expected'];
  const r = v as Record<string, unknown>;
  const bad: string[] = [];
  for (const k of ['volume', 'area', 'tolerancePct']) {
    if (r[k] !== undefined && !isFiniteNumber(r[k])) bad.push(k);
  }
  const bounds = r['bounds'];
  if (bounds !== undefined) {
    if (typeof bounds !== 'object' || bounds === null || Array.isArray(bounds)) bad.push('bounds');
    else {
      for (const [k, val] of Object.entries(bounds)) {
        if (BOUND_KEYS.has(k) && val !== undefined && !isFiniteNumber(val)) bad.push(`bounds.${k}`);
      }
    }
  }
  return bad;
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
    // Bounds are positions, so a percent of the coordinate would scale with the distance from
    // the origin: 0.5% of y = 2000 lets a 20 mm part's edge be 10 mm off. Measure the slack
    // against the part's size instead.
    const slack = b ? (tol / 100) * Math.max(b.xMax - b.xMin, b.yMax - b.yMin, b.zMax - b.zMin) : 0;
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const) {
      const want = expected.bounds[key];
      if (want === undefined) continue;
      const actual = b?.[key];
      assertions.push(
        actual === undefined
          ? { name: `bounds.${key}`, expected: want, actual: null, passed: false }
          : {
              name: `bounds.${key}`,
              expected: want,
              actual,
              passed: Math.abs(actual - want) <= Math.max(slack, ABS_EPSILON),
            }
      );
    }
  }
  return assertions;
}
