import type { OcType } from '../../kernel/types.js';
import { RAD2DEG } from '../../core/constants.js';
import { findCurveType } from '../../core/definitionMaps.js';
import { unwrap } from '../../core/result.js';
import { bug } from '../../core/errors.js';
import { getKernel } from '../../kernel/index.js';
import round2 from '../../utils/round2.js';
import round5 from '../../utils/round5.js';
import type { Point2D } from './definitions.js';
import { DisposalScope } from '../../core/disposal.js';

const fromPnt = (pnt: OcType) => `${round2(pnt.X())} ${round2(pnt.Y())}`;

/**
 * Convert an adapted 2D curve to an SVG path command string.
 *
 * Supports lines, degree-1/2/3 Bezier curves, circular arcs, and elliptical
 * arcs. The caller must ensure the curve has already been converted to an
 * SVG-compatible type (see {@link approximateAsSvgCompatibleCurve}).
 *
 * @param adaptor - A `Geom2dAdaptor_Curve` for the segment to render.
 * @param lastPoint - The endpoint of the curve, used as the SVG command target.
 * @returns An SVG path command such as `L`, `Q`, `C`, or `A`.
 */
export const adaptedCurveToPathElem = (adaptor: OcType, lastPoint: Point2D): string => {
  const oc = getKernel().oc;
  using scope = new DisposalScope();
  const curveType = unwrap(findCurveType(adaptor.GetType()));

  const [endX, endY] = lastPoint;
  const endpoint = `${round5(endX)} ${round5(endY)}`;
  if (curveType === 'LINE') {
    return `L ${endpoint}`;
  }
  if (curveType === 'BEZIER_CURVE') {
    const bezierHandle = scope.register(adaptor.Bezier());
    const curve = bezierHandle.get();
    const deg = curve.Degree();

    if (deg === 1) {
      return `L ${endpoint}`;
    }

    if (deg === 2) {
      const pole2 = scope.register(curve.Pole(2));
      return `Q ${fromPnt(pole2)} ${endpoint}`;
    }

    if (deg === 3) {
      const pole2 = scope.register(curve.Pole(2));
      const pole3 = scope.register(curve.Pole(3));
      const p1 = fromPnt(pole2);
      const p2 = fromPnt(pole3);
      return `C ${p1} ${p2} ${endpoint}`;
    }
  }
  if (curveType === 'CIRCLE') {
    const curve = scope.register(adaptor.Circle());
    const radius = curve.Radius();

    const p1 = adaptor.FirstParameter();
    const p2 = adaptor.LastParameter();

    const paramAngle = (p2 - p1) * RAD2DEG;

    const end = paramAngle !== 360 ? endpoint : `${round5(endX)} ${round5(endY + 0.0001)}`;

    return `A ${radius} ${radius} 0 ${Math.abs(paramAngle) > 180 ? '1' : '0'} ${
      curve.IsDirect() ? '1' : '0'
    } ${end}`;
  }

  if (curveType === 'ELLIPSE') {
    const curve = scope.register(adaptor.Ellipse());
    const rx = curve.MajorRadius();
    const ry = curve.MinorRadius();

    const p1 = adaptor.FirstParameter();
    const p2 = adaptor.LastParameter();

    const paramAngle = (p2 - p1) * RAD2DEG;

    const end = paramAngle !== 360 ? endpoint : `${round5(endX)} ${round5(endY + 0.0001)}`;

    const dir0 = scope.register(new oc.gp_Dir2d_1());
    const xAxis = scope.register(curve.XAxis());
    const xDir = scope.register(xAxis.Direction());
    const angle = 180 - xDir.Angle(dir0) * RAD2DEG;

    return `A ${round5(rx)} ${round5(ry)} ${round5(angle)} ${
      Math.abs(paramAngle) > 180 ? '1' : '0'
    } ${curve.IsDirect() ? '1' : '0'} ${end}`;
  }

  bug('adaptedCurveToPathElem', `Unsupported curve type: ${curveType}`);
};
