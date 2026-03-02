import { type Result, ok, err } from './result.js';
import { typeCastError } from './errors.js';

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Kernel enum value type
export const findCurveType = (type: any): Result<CurveType> => {
  const idx = typeof type === 'number' ? type : Number(type?.value ?? type);
  const curveType = CURVE_TYPE_BY_INT[idx];
  if (!curveType) return err(typeCastError('UNKNOWN_CURVE_TYPE', 'Unknown curve type'));
  return ok(curveType);
};
