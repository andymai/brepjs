/**
 * Type discriminants — maps kernel enum values to string discriminants.
 *
 * Consolidates all kernel-enum-to-string mapping in one file:
 * - `findCurveType()` — GeomAbs_CurveType → CurveType string
 * - `getShapeKind()` — TopAbs_ShapeEnum → ShapeKind string
 *
 * Renamed from definitionMaps.ts (ADR-0008).
 */

import { type Result, ok, err } from './result.js';
import { typeCastError } from './errors.js';
import { getKernel } from '@/kernel/index.js';
import type { AnyShape, ShapeKind } from './shapeTypes.js';
import type { Dimension } from './dimensionTypes.js';

// ---------------------------------------------------------------------------
// CurveType discriminant
// ---------------------------------------------------------------------------

/** Discriminant for the geometric type of a 3D curve. */
export type CurveType =
  | 'LINE'
  | 'CIRCLE'
  | 'ELLIPSE'
  | 'HYPERBOLA'
  | 'PARABOLA'
  | 'BEZIER_CURVE'
  | 'BSPLINE_CURVE'
  | 'OFFSET_CURVE'
  | 'OTHER_CURVE';

/**
 * GeomAbs_CurveType integer constants (stable across kernel versions).
 * Line=0, Circle=1, Ellipse=2, Hyperbola=3, Parabola=4,
 * BezierCurve=5, BSplineCurve=6, OffsetCurve=7, OtherCurve=8.
 */
const CURVE_TYPE_BY_INT: CurveType[] = [
  'LINE', // 0
  'CIRCLE', // 1
  'ELLIPSE', // 2
  'HYPERBOLA', // 3
  'PARABOLA', // 4
  'BEZIER_CURVE', // 5
  'BSPLINE_CURVE', // 6
  'OFFSET_CURVE', // 7
  'OTHER_CURVE', // 8
];

/**
 * Map a kernel curve type enum value to its string discriminant.
 *
 * @returns `Ok<CurveType>` on success, or `Err` if the enum value is unrecognised.
 */
export const findCurveType = (type: number | { value: number }): Result<CurveType> => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- WASM enum .value may be boxed; Number() ensures plain number
  const idx = typeof type === 'number' ? type : Number(type.value);
  const curveType = CURVE_TYPE_BY_INT[idx];
  if (!curveType) return err(typeCastError('UNKNOWN_CURVE_TYPE', 'Unknown curve type'));
  return ok(curveType);
};

// ---------------------------------------------------------------------------
// ShapeKind discriminant
// ---------------------------------------------------------------------------

/** Query the kernel for the topological type of a shape. */
export function getShapeKind(shape: AnyShape<Dimension>): ShapeKind {
  return getKernel().shapeType(shape.wrapped);
}
