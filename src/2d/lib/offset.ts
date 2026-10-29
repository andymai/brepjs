import { getKernel2D } from '@/kernel/index.js';
import { approximateAsBSpline } from './approximations.js';
import { Curve2D } from './curve2D.js';
import type { Point2D } from './definitions.js';
import { selfIntersections } from './intersections.js';
import { unwrap } from '@/core/result.js';
import { make2dSegmentCurve, make2dThreePointArc } from './makeCurves.js';
import {
  add2d,
  crossProduct2d,
  normalize2d,
  samePoint,
  scalarMultiply2d,
  subtract2d,
} from './vectorOperations.js';
import { wasmIndex } from '@/utils/vec3.js';

const offsetEndPoints = (firstPoint: Point2D, lastPoint: Point2D, offset: number) => {
  const tangent = normalize2d(subtract2d(lastPoint, firstPoint));
  const normal = [tangent[1], -tangent[0]];

  const offsetVec: Point2D = [wasmIndex(normal, 0) * offset, wasmIndex(normal, 1) * offset];

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
 * @param offset - Signed offset distance (positive = right of curve direction).
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

    const { cx, cy, radius } = circleData;
    const center: Point2D = [cx, cy];

    // The direction of travel, not the basis circle's sense, decides which side
    // is right: a trimmed arc can run against its basis.
    const counterClockwise =
      crossProduct2d(subtract2d(curve.firstPoint, center), curve.tangentAt(0)) > 0;
    const orientedOffset = counterClockwise ? offset : -offset;

    const newRadius = radius + orientedOffset;

    if (newRadius < 1e-10) {
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

    // Curve parameters are kernel-specific (a trimmed arc may run over 0..1),
    // so the offset arc is rebuilt from radially moved points, not from them.
    const radial = (point: Point2D): Point2D =>
      add2d(center, scalarMultiply2d(subtract2d(point, center), newRadius / radius));

    if (!samePoint(curve.firstPoint, curve.lastPoint)) {
      const mid = curve.value((curve.firstParameter + curve.lastParameter) / 2);
      return make2dThreePointArc(radial(curve.firstPoint), radial(mid), radial(curve.lastPoint));
    }

    const fullCircle = new Curve2D(kernel.makeCircle2d(cx, cy, newRadius, counterClockwise));
    const start = radial(curve.firstPoint);
    if (samePoint(fullCircle.firstPoint, start)) return fullCircle;
    try {
      const proj = kernel.projectPointOnCurve2d(fullCircle.wrapped, start[0], start[1]);
      const from = proj ? proj.param : fullCircle.firstParameter;
      const period = fullCircle.lastParameter - fullCircle.firstParameter;
      return new Curve2D(kernel.trimCurve2d(fullCircle.wrapped, from, from + period));
    } finally {
      fullCircle.delete();
    }
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
