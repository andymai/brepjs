import { RAD2DEG } from '../../core/constants.js';
import { bug } from '../../core/errors.js';
import { getKernel2D } from '../../kernel/index.js';
import round2 from '../../utils/round2.js';
import round5 from '../../utils/round5.js';
import type { Point2D } from './definitions.js';
import type { Curve2D } from './Curve2D.js';

/**
 * Convert a 2D curve to an SVG path command string.
 *
 * Supports lines, degree-1/2/3 Bezier curves, circular arcs, and elliptical
 * arcs. The caller must ensure the curve has already been converted to an
 * SVG-compatible type (see {@link approximateAsSvgCompatibleCurve}).
 *
 * @param curve - A `Curve2D` for the segment to render.
 * @param lastPoint - The endpoint of the curve, used as the SVG command target.
 * @returns An SVG path command such as `L`, `Q`, `C`, or `A`.
 */
export const adaptedCurveToPathElem = (curve: Curve2D, lastPoint: Point2D): string => {
  const k2d = getKernel2D();
  const curveType = curve.geomType;

  const [endX, endY] = lastPoint;
  const endpoint = `${round5(endX)} ${round5(endY)}`;
  if (curveType === 'LINE') {
    return `L ${endpoint}`;
  }
  if (curveType === 'BEZIER_CURVE') {
    const poles = k2d.getCurve2dBezierPoles(curve.wrapped);
    if (!poles) bug('adaptedCurveToPathElem', 'Expected Bezier poles');
    const deg = poles.length - 1;

    if (deg === 1) {
      return `L ${endpoint}`;
    }

    if (deg === 2) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- poles[1] exists for degree 2
      const [px, py] = poles[1]!;
      return `Q ${round2(px)} ${round2(py)} ${endpoint}`;
    }

    if (deg === 3) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- poles[1] exists for degree 3
      const [p1x, p1y] = poles[1]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- poles[2] exists for degree 3
      const [p2x, p2y] = poles[2]!;
      return `C ${round2(p1x)} ${round2(p1y)} ${round2(p2x)} ${round2(p2y)} ${endpoint}`;
    }
  }
  if (curveType === 'CIRCLE') {
    const circleData = k2d.getCurve2dCircleData(curve.wrapped);
    if (!circleData) bug('adaptedCurveToPathElem', 'Expected circle data');
    const { radius, isDirect } = circleData;

    const bounds = k2d.getCurve2dBounds(curve.wrapped);
    const paramAngle = (bounds.last - bounds.first) * RAD2DEG;

    const end = paramAngle !== 360 ? endpoint : `${round5(endX)} ${round5(endY + 0.0001)}`;

    return `A ${radius} ${radius} 0 ${Math.abs(paramAngle) > 180 ? '1' : '0'} ${
      isDirect ? '1' : '0'
    } ${end}`;
  }

  if (curveType === 'ELLIPSE') {
    const ellipseData = k2d.getCurve2dEllipseData(curve.wrapped);
    if (!ellipseData) bug('adaptedCurveToPathElem', 'Expected ellipse data');
    const { majorRadius: rx, minorRadius: ry, xAxisAngle, isDirect } = ellipseData;

    const bounds = k2d.getCurve2dBounds(curve.wrapped);
    const paramAngle = (bounds.last - bounds.first) * RAD2DEG;

    const end = paramAngle !== 360 ? endpoint : `${round5(endX)} ${round5(endY + 0.0001)}`;

    const angle = 180 - xAxisAngle * RAD2DEG;

    return `A ${round5(rx)} ${round5(ry)} ${round5(angle)} ${
      Math.abs(paramAngle) > 180 ? '1' : '0'
    } ${isDirect ? '1' : '0'} ${end}`;
  }

  bug('adaptedCurveToPathElem', `Unsupported curve type: ${curveType}`);
};
