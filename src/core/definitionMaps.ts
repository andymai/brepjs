import { getKernel } from '../kernel/index.js';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum keys are dynamic
let CURVE_TYPES_MAP: Map<any, CurveType> | null = null;

const getCurveTypesMap = (refresh?: boolean): Map<unknown, CurveType> => {
  if (CURVE_TYPES_MAP && !refresh) return CURVE_TYPES_MAP;

  const oc = getKernel().oc;
  const ga = oc.GeomAbs_CurveType;

  CURVE_TYPES_MAP = new Map([
    [ga.GeomAbs_Line, 'LINE'],
    [ga.GeomAbs_Circle, 'CIRCLE'],
    [ga.GeomAbs_Ellipse, 'ELLIPSE'],
    [ga.GeomAbs_Hyperbola, 'HYPERBOLA'],
    [ga.GeomAbs_Parabola, 'PARABOLA'],
    [ga.GeomAbs_BezierCurve, 'BEZIER_CURVE'],
    [ga.GeomAbs_BSplineCurve, 'BSPLINE_CURVE'],
    [ga.GeomAbs_OffsetCurve, 'OFFSET_CURVE'],
    [ga.GeomAbs_OtherCurve, 'OTHER_CURVE'],
  ]);
  return CURVE_TYPES_MAP;
};

/**
 * Map an OCCT `GeomAbs_CurveType` enum value to its string discriminant.
 *
 * @returns `Ok<CurveType>` on success, or `Err` if the enum value is unrecognised.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum value type
export const findCurveType = (type: any): Result<CurveType> => {
  let shapeType = getCurveTypesMap().get(type);
  if (!shapeType) shapeType = getCurveTypesMap(true).get(type);
  if (!shapeType) return err(typeCastError('UNKNOWN_CURVE_TYPE', 'Unknown curve type'));
  return ok(shapeType);
};
