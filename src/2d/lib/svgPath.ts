import { RAD2DEG } from '@/core/constants.js';
import { bug } from '@/core/errors.js';
import { getKernel2D } from '@/kernel/index.js';
import { round2, round5 } from '@/utils/precisionRound.js';
import { wasmIndex } from '@/utils/vec3.js';
import { samePoint } from './vectorOperations.js';
import { PRECISION_POINT } from './precision.js';
import { ellipseArcFlags } from './ellipseArcFlags.js';
import type { Point2D } from './definitions.js';
import type { Curve2D } from './curve2D.js';

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
/** Positive CCW angular distance from `from` to `to`. */
const ccwFrom = (from: number, to: number): number => {
  let a = (to - from) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};

/** Emit an `A` command for a circular arc, deriving the large-arc and sweep
 *  flags from geometry: trimmed-curve bounds may be normalized rather than
 *  angular, so the on-arc midpoint (the parameter midpoint IS the angular
 *  midpoint on a circle) decides the traversal direction and which of the
 *  two candidate arcs this is. */
function circleArcPathElem(curve: Curve2D, endX: number, endY: number, endpoint: string): string {
  const k2d = getKernel2D();
  const circleData = k2d.getCurve2dCircleData(curve.wrapped);
  if (!circleData) bug('adaptedCurveToPathElem', 'Expected circle data');
  const { radius, isDirect } = circleData;

  const [startX, startY] = curve.firstPoint;
  // A closed loop cannot be a single A command; nudge the endpoint.
  if (samePoint([startX, startY], [endX, endY])) {
    return `A ${radius} ${radius} 0 1 ${isDirect ? '1' : '0'} ${round5(endX)} ${round5(
      endY + 0.0001
    )}`;
  }

  const bounds = k2d.getCurve2dBounds(curve.wrapped);
  const [midX, midY] = curve.value((bounds.first + bounds.last) / 2);
  // |d| is 2x the triangle area: below chord * PRECISION_POINT, the midpoint
  // deviates from the chord by less than the point tolerance — degenerate.
  const d = 2 * (startX * (midY - endY) + midX * (endY - startY) + endX * (startY - midY));
  if (Math.abs(d) < Math.hypot(endX - startX, endY - startY) * PRECISION_POINT) {
    return `L ${endpoint}`;
  }
  const s2 = startX * startX + startY * startY;
  const m2 = midX * midX + midY * midY;
  const e2 = endX * endX + endY * endY;
  const cx = (s2 * (midY - endY) + m2 * (endY - startY) + e2 * (startY - midY)) / d;
  const cy = (s2 * (endX - midX) + m2 * (startX - endX) + e2 * (midX - startX)) / d;
  const thetaS = Math.atan2(startY - cy, startX - cx);
  const thetaM = Math.atan2(midY - cy, midX - cx);
  const thetaE = Math.atan2(endY - cy, endX - cx);
  const goesCcw = ccwFrom(thetaS, thetaM) <= ccwFrom(thetaS, thetaE);
  const sweepAngle = goesCcw ? ccwFrom(thetaS, thetaE) : ccwFrom(thetaE, thetaS);

  return `A ${radius} ${radius} 0 ${sweepAngle > Math.PI ? '1' : '0'} ${
    goesCcw ? '1' : '0'
  } ${endpoint}`;
}

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
      const [px, py] = wasmIndex(poles, 1);
      return `Q ${round2(px)} ${round2(py)} ${endpoint}`;
    }

    if (deg === 3) {
      const [p1x, p1y] = wasmIndex(poles, 1);
      const [p2x, p2y] = wasmIndex(poles, 2);
      return `C ${round2(p1x)} ${round2(p1y)} ${round2(p2x)} ${round2(p2y)} ${endpoint}`;
    }
  }
  if (curveType === 'CIRCLE') {
    return circleArcPathElem(curve, endX, endY, endpoint);
  }

  if (curveType === 'ELLIPSE') {
    const ellipseData = k2d.getCurve2dEllipseData(curve.wrapped);
    if (!ellipseData) bug('adaptedCurveToPathElem', 'Expected ellipse data');
    const { majorRadius: rx, minorRadius: ry, xAxisAngle, isDirect } = ellipseData;
    const angle = 180 - xAxisAngle * RAD2DEG;

    const [startX, startY] = curve.firstPoint;
    // A closed loop cannot be a single A command; nudge the endpoint.
    if (samePoint([startX, startY], [endX, endY])) {
      return `A ${round5(rx)} ${round5(ry)} ${round5(angle)} 1 ${isDirect ? '1' : '0'} ${round5(
        endX
      )} ${round5(endY + 0.0001)}`;
    }

    // Flags from geometry, like the circle branch: the on-arc parameter
    // midpoint disambiguates the F.6.5 candidate centers and the direction.
    const bounds = k2d.getCurve2dBounds(curve.wrapped);
    const [midX, midY] = curve.value((bounds.first + bounds.last) / 2);
    const flags = ellipseArcFlags([startX, startY], [endX, endY], [midX, midY], rx, ry, xAxisAngle);
    if (!flags) return `L ${endpoint}`;

    return `A ${round5(rx)} ${round5(ry)} ${round5(angle)} ${flags.largeArc ? '1' : '0'} ${
      flags.ccw ? '1' : '0'
    } ${endpoint}`;
  }

  bug('adaptedCurveToPathElem', `Unsupported curve type: ${curveType}`);
};
