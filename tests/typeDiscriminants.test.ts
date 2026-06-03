/**
 * Kernel-agnostic tests for findCurveType — the GeomAbs_CurveType integer
 * (or boxed `{value}`) to string-discriminant mapping. The existing
 * geometry.test.ts coverage of this function is OCCT.js-only (it feeds raw
 * `oc.GeomAbs_CurveType` enums), so it is skipped under occt-wasm; these
 * tests exercise the same pure mapping using plain integers, which works on
 * every kernel.
 */
import { describe, expect, it } from 'vitest';
import { findCurveType } from '@/core/typeDiscriminants.js';
import { isErr, unwrap } from '@/core/result.js';

describe('findCurveType (kernel-agnostic)', () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [0, 'LINE'],
    [1, 'CIRCLE'],
    [2, 'ELLIPSE'],
    [3, 'HYPERBOLA'],
    [4, 'PARABOLA'],
    [5, 'BEZIER_CURVE'],
    [6, 'BSPLINE_CURVE'],
    [7, 'OFFSET_CURVE'],
    [8, 'OTHER_CURVE'],
  ];

  it.each(cases)('maps integer %i to %s', (value, expected) => {
    expect(unwrap(findCurveType(value))).toBe(expected);
  });

  it('accepts a boxed WASM enum object with a .value field', () => {
    expect(unwrap(findCurveType({ value: 6 }))).toBe('BSPLINE_CURVE');
  });

  it('errors on an out-of-range enum value', () => {
    expect(isErr(findCurveType(99))).toBe(true);
  });

  it('errors on a negative enum value', () => {
    expect(isErr(findCurveType(-1))).toBe(true);
  });
});
