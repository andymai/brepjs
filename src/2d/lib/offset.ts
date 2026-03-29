import { getKernel2D } from '@/kernel/index.js';
import { approximateAsBSpline } from './approximations.js';
import { Curve2D } from './curve2D.js';
import type { Point2D } from './definitions.js';
import { selfIntersections } from './intersections.js';
import { unwrap } from '@/core/result.js';
import { make2dSegmentCurve } from './makeCurves.js';
import { add2d, normalize2d, subtract2d } from './vectorOperations.js';

const offsetEndPoints = (firstPoint: Point2D, lastPoint: Point2D, offset: number) => {
  const tangent = normalize2d(subtract2d(lastPoint, firstPoint));
  const normal = [tangent[1], -tangent[0]];

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- normal has two elements
  const offsetVec: Point2D = [normal[0]! * offset, normal[1]! * offset];

  return {
    firstPoint: add2d(firstPoint, offsetVec),
    lastPoint: add2d(lastPoint, offsetVec),
  };
};

/**
 * Compute the offset of a 2D curve by a signed distance.
 *
 * Circles and lines are offset analytically. Other curve types are approximated
 * as B-splines via {@link approximateAsBSpline}. When the offset causes the
 * curve to collapse (e.g. an arc whose radius shrinks to zero, or a
 * self-intersecting offset), a `{ collapsed: true }` sentinel is returned
 * instead of a `Curve2D`.
 *
 * @param curve - The source curve to offset.
 * @param offset - Signed offset distance (positive = left of curve direction).
 *
 * @remarks Self-intersecting offset curves are replaced with a collapsed
 *   sentinel. This is a known simplification; a more robust trimming strategy
 *   may be added in the future.
 *
 * @example
 * ```ts
 * const result = make2dOffset(line, 2);
 * if (result instanceof Curve2D) { /* use the offset curve *\/ }
 * ```
 */
export const make2dOffset = (
  curve: Curve2D,
  offset: number
): Curve2D | { collapsed: true; firstPoint: Point2D; lastPoint: Point2D } => {
  const curveType = curve.geomType;
  const kernel = getKernel2D();

  if (curveType === 'CIRCLE') {
    const circleData = kernel.getCurve2dCircleData(curve.wrapped);
    if (!circleData) return make2dSegmentCurve(curve.firstPoint, curve.lastPoint);

    const { cx, cy, radius, isDirect } = circleData;

    const orientationCorrection = isDirect ? 1 : -1;
    const orientedOffset = offset * orientationCorrection;

    const newRadius = radius + orientedOffset;

    if (newRadius < 1e-10) {
      const center: Point2D = [cx, cy];

      // We replace collapsed arcs by a segment of line
      const offsetViaCenter = (point: Point2D): Point2D => {
        const [x, y] = normalize2d(subtract2d(point, center));
        return add2d(point, [orientedOffset * x, orientedOffset * y]);
      };

      return {
        collapsed: true,
        firstPoint: offsetViaCenter(curve.firstPoint),
        lastPoint: offsetViaCenter(curve.lastPoint),
      };
    }

    const circleHandle = kernel.makeCircle2d(cx, cy, newRadius, isDirect);
    const fullCircle = new Curve2D(circleHandle);
    let trimmedHandle;
    try {
      trimmedHandle = kernel.trimCurve2d(
        fullCircle.wrapped,
        curve.firstParameter,
        curve.lastParameter
      );
    } finally {
      fullCircle.delete();
    }

    return new Curve2D(trimmedHandle);
  }

  if (curveType === 'LINE') {
    const { firstPoint, lastPoint } = offsetEndPoints(curve.firstPoint, curve.lastPoint, offset);

    return make2dSegmentCurve(firstPoint, lastPoint);
  }

  // Compute the analytic offset, then approximate as a B-spline (the kernel
  // misbehaves on the raw offset handle after transforms like mirroring).
  const offsetHandle = kernel.offsetCurve2d(curve.wrapped, offset);
  const offsetCurve = new Curve2D(offsetHandle);
  const approximation = approximateAsBSpline(offsetCurve);
  offsetCurve.delete();

  // Self-intersecting single-curve offsets are collapsed to a straight-line
  // sentinel rather than trimmed. This happens when a concave region is offset
  // outward (or convex inward) by more than the local radius of curvature,
  // producing a loop in the offset curve.
  //
  // The blueprint-level Cavalier-Contours algorithm (blueprints/offset.ts →
  // offsetBlueprint) DOES handle multi-curve self-intersections via
  // split/prune/stitch. However, single-curve self-intersections are collapsed
  // here before reaching that stage. Routing self-intersecting curves through
  // the blueprint trimmer would require not collapsing + propagating the raw
  // curve upward — a non-trivial architectural change.
  const selfIntersects = unwrap(selfIntersections(approximation));
  if (selfIntersects.length) {
    const firstPoint = approximation.firstPoint;
    const lastPoint = approximation.lastPoint;
    approximation.delete();
    return {
      collapsed: true,
      firstPoint,
      lastPoint,
    };
  }

  return approximation;
};
