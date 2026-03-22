/**
 * Public functional API for 2D curve geometry.
 *
 * Wraps {@link Kernel2DCapability} methods with branded {@link Curve2DHandle}
 * types, `Result<T>` error handling, and `Disposable` support.
 *
 * All functions call `getKernel2D()` internally — the kernel must be
 * initialised before use.
 *
 * @module
 */

import { getKernel2D } from '@/kernel/index.js';
import type { Curve2DHandle } from '@/core/curve2dHandle.js';
import { createCurve2DHandle } from '@/core/curve2dHandle.js';
import type { Point2D } from '@/2d/lib/definitions.js';
import type { Plane } from '@/core/planeTypes.js';
import type { Edge, Face } from '@/core/shapeTypes.js';
import { createEdge } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { kernelCallRaw } from '@/core/kernelCall.js';
import { validationError, BrepErrorCode } from '@/core/errors.js';

const {
  CURVE2D_CONSTRUCTION_FAILED,
  CURVE2D_INVALID_RADIUS,
  CURVE2D_TRANSFORM_FAILED,
  CURVE2D_QUERY_FAILED,
  CURVE2D_INTERSECTION_FAILED,
  CURVE2D_BRIDGE_FAILED,
} = BrepErrorCode;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a raw kernel curve handle, upcasting to Handle_Geom2d_Curve
 * (required for OCCT — specific subtypes like Handle_Geom2d_TrimmedCurve
 * must be upcasted before passing to generic curve operations).
 */
function wrapRawHandle(raw: unknown): Curve2DHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel returns opaque handle
  const wrapped = getKernel2D().wrapCurve2dHandle(raw as any);
  return createCurve2DHandle(wrapped);
}

/** Wrap a kernel call that returns a raw curve handle into Result<Curve2DHandle>. */
function curveCall(fn: () => unknown, code: string, message: string): Result<Curve2DHandle> {
  const result = kernelCallRaw(fn, code, message);
  if (!result.ok) return result;
  return ok(wrapRawHandle(result.value));
}

/** Validate that ellipse radii are positive and that minor does not exceed major. */
function validateEllipseRadii(majorRadius: number, minorRadius: number): Result<never> | null {
  if (majorRadius <= 0 || minorRadius <= 0) {
    return err(
      validationError(
        CURVE2D_INVALID_RADIUS,
        `Ellipse radii must be positive, got major=${majorRadius}, minor=${minorRadius}`
      )
    );
  }
  if (minorRadius > majorRadius) {
    return err(
      validationError(
        CURVE2D_INVALID_RADIUS,
        `Ellipse minor radius (${minorRadius}) must not exceed major radius (${majorRadius})`
      )
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constructors
// ═══════════════════════════════════════════════════════════════════════════

/** Create a 2D line segment between two points. */
export function line2d(from: Point2D, to: Point2D): Result<Curve2DHandle> {
  return curveCall(
    () => getKernel2D().makeLine2d(from[0], from[1], to[0], to[1]),
    CURVE2D_CONSTRUCTION_FAILED,
    'Failed to create 2D line'
  );
}

/** Create a full 2D circle. */
export function circle2d(center: Point2D, radius: number, sense?: boolean): Result<Curve2DHandle> {
  if (radius <= 0) {
    return err(
      validationError(CURVE2D_INVALID_RADIUS, `Circle radius must be positive, got ${radius}`)
    );
  }
  return curveCall(
    () => getKernel2D().makeCircle2d(center[0], center[1], radius, sense),
    CURVE2D_CONSTRUCTION_FAILED,
    'Failed to create 2D circle'
  );
}

/** Create a 2D arc through three points. */
export function arc2d(p1: Point2D, mid: Point2D, p2: Point2D): Result<Curve2DHandle> {
  return curveCall(
    () => getKernel2D().makeArc2dThreePoints(p1[0], p1[1], mid[0], mid[1], p2[0], p2[1]),
    CURVE2D_CONSTRUCTION_FAILED,
    'Failed to create 2D arc from 3 points'
  );
}

/** Create a 2D arc from a start point, tangent direction, and end point. */
export function arc2dTangent(
  start: Point2D,
  tangent: Point2D,
  end: Point2D
): Result<Curve2DHandle> {
  return curveCall(
    () =>
      getKernel2D().makeArc2dTangent(start[0], start[1], tangent[0], tangent[1], end[0], end[1]),
    CURVE2D_CONSTRUCTION_FAILED,
    'Failed to create 2D tangent arc'
  );
}

/** Options for ellipse construction. */
export interface Ellipse2dOptions {
  /** X-axis direction for the major axis (default: [1, 0]). */
  readonly xDir?: Point2D;
  /** Orientation sense (default: true = counter-clockwise). */
  readonly sense?: boolean;
}

/** Create a full 2D ellipse. */
export function ellipse2d(
  center: Point2D,
  majorRadius: number,
  minorRadius: number,
  options?: Ellipse2dOptions
): Result<Curve2DHandle> {
  const radiusError = validateEllipseRadii(majorRadius, minorRadius);
  if (radiusError !== null) return radiusError;
  return curveCall(
    () =>
      getKernel2D().makeEllipse2d(
        center[0],
        center[1],
        majorRadius,
        minorRadius,
        options?.xDir?.[0],
        options?.xDir?.[1],
        options?.sense
      ),
    CURVE2D_CONSTRUCTION_FAILED,
    'Failed to create 2D ellipse'
  );
}

/** Create a 2D elliptical arc. */
export function ellipseArc2d(
  center: Point2D,
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  options?: Ellipse2dOptions
): Result<Curve2DHandle> {
  const radiusError = validateEllipseRadii(majorRadius, minorRadius);
  if (radiusError !== null) return radiusError;
  return curveCall(
    () =>
      getKernel2D().makeEllipseArc2d(
        center[0],
        center[1],
        majorRadius,
        minorRadius,
        startAngle,
        endAngle,
        options?.xDir?.[0],
        options?.xDir?.[1],
        options?.sense
      ),
    CURVE2D_CONSTRUCTION_FAILED,
    'Failed to create 2D ellipse arc'
  );
}

/** Create a 2D Bezier curve through control points. */
export function bezier2d(points: Point2D[]): Result<Curve2DHandle> {
  if (points.length < 2) {
    return err(
      validationError(
        CURVE2D_CONSTRUCTION_FAILED,
        `Bezier curve requires at least 2 control points, got ${points.length}`
      )
    );
  }
  return curveCall(
    () => getKernel2D().makeBezier2d(points),
    CURVE2D_CONSTRUCTION_FAILED,
    'Failed to create 2D Bezier curve'
  );
}

/** Options for B-spline construction. */
export interface BSpline2dOptions {
  readonly degMin?: number;
  readonly degMax?: number;
  readonly continuity?: 'C0' | 'C1' | 'C2' | 'C3';
  readonly tolerance?: number;
  readonly smoothing?: [number, number, number] | null;
}

/** Create a 2D B-spline curve interpolating through points. */
export function bspline2d(points: Point2D[], options?: BSpline2dOptions): Result<Curve2DHandle> {
  if (points.length < 2) {
    return err(
      validationError(
        CURVE2D_CONSTRUCTION_FAILED,
        `B-spline curve requires at least 2 points, got ${points.length}`
      )
    );
  }
  return curveCall(
    () => getKernel2D().makeBSpline2d(points, options),
    CURVE2D_CONSTRUCTION_FAILED,
    'Failed to create 2D B-spline curve'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Transforms
// ═══════════════════════════════════════════════════════════════════════════

/** Translate a 2D curve by (dx, dy). Returns a new curve. */
export function translateCurve2d(
  curve: Curve2DHandle,
  dx: number,
  dy: number
): Result<Curve2DHandle> {
  return curveCall(
    () => getKernel2D().translateCurve2d(curve.raw, dx, dy),
    CURVE2D_TRANSFORM_FAILED,
    'Failed to translate 2D curve'
  );
}

/** Rotate a 2D curve by an angle (radians) around a center point. Returns a new curve. */
export function rotateCurve2d(
  curve: Curve2DHandle,
  angle: number,
  center: Point2D = [0, 0]
): Result<Curve2DHandle> {
  return curveCall(
    () => getKernel2D().rotateCurve2d(curve.raw, angle, center[0], center[1]),
    CURVE2D_TRANSFORM_FAILED,
    'Failed to rotate 2D curve'
  );
}

/** Scale a 2D curve by a factor around a center point. Returns a new curve. */
export function scaleCurve2d(
  curve: Curve2DHandle,
  factor: number,
  center: Point2D = [0, 0]
): Result<Curve2DHandle> {
  return curveCall(
    () => getKernel2D().scaleCurve2d(curve.raw, factor, center[0], center[1]),
    CURVE2D_TRANSFORM_FAILED,
    'Failed to scale 2D curve'
  );
}

/** Mirror a 2D curve across a point. Returns a new curve. */
export function mirrorCurve2d(curve: Curve2DHandle, point: Point2D): Result<Curve2DHandle> {
  return curveCall(
    () => getKernel2D().mirrorCurve2dAtPoint(curve.raw, point[0], point[1]),
    CURVE2D_TRANSFORM_FAILED,
    'Failed to mirror 2D curve'
  );
}

/** Mirror a 2D curve across an axis defined by origin and direction. Returns a new curve. */
export function mirrorCurve2dAcrossAxis(
  curve: Curve2DHandle,
  origin: Point2D,
  direction: Point2D
): Result<Curve2DHandle> {
  return curveCall(
    () =>
      getKernel2D().mirrorCurve2dAcrossAxis(
        curve.raw,
        origin[0],
        origin[1],
        direction[0],
        direction[1]
      ),
    CURVE2D_TRANSFORM_FAILED,
    'Failed to mirror 2D curve across axis'
  );
}

/** Offset a 2D curve by a distance. Returns a new curve. */
export function offsetCurve2d(curve: Curve2DHandle, distance: number): Result<Curve2DHandle> {
  return curveCall(
    () => getKernel2D().offsetCurve2d(curve.raw, distance),
    CURVE2D_TRANSFORM_FAILED,
    'Failed to offset 2D curve'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════════════════════════

/** Evaluate a point on a 2D curve at a parameter value. */
export function evaluateCurve2d(curve: Curve2DHandle, param: number): Result<Point2D> {
  return kernelCallRaw(
    () => getKernel2D().evaluateCurve2d(curve.raw, param),
    CURVE2D_QUERY_FAILED,
    'Failed to evaluate 2D curve'
  );
}

/** Evaluate point and tangent on a 2D curve at a parameter value. */
export function tangentCurve2d(
  curve: Curve2DHandle,
  param: number
): Result<{ point: Point2D; tangent: Point2D }> {
  return kernelCallRaw(
    () => getKernel2D().evaluateCurve2dD1(curve.raw, param),
    CURVE2D_QUERY_FAILED,
    'Failed to evaluate 2D curve tangent'
  );
}

/** Get the parameter bounds of a 2D curve. */
export function boundsCurve2d(curve: Curve2DHandle): Result<{ first: number; last: number }> {
  return kernelCallRaw(
    () => getKernel2D().getCurve2dBounds(curve.raw),
    CURVE2D_QUERY_FAILED,
    'Failed to get 2D curve bounds'
  );
}

/** Get the geometric type of a 2D curve (e.g., "Line", "Circle", "BSpline"). */
export function typeCurve2d(curve: Curve2DHandle): Result<string> {
  return kernelCallRaw(
    () => getKernel2D().getCurve2dType(curve.raw),
    CURVE2D_QUERY_FAILED,
    'Failed to get 2D curve type'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Intersection & Projection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find intersection points and overlap segments between two 2D curves.
 *
 * Returned `segments` are individually disposable — callers must dispose
 * each element when done.
 *
 * @param tolerance - Intersection tolerance (default: `1e-7`).
 */
export function intersectCurves2d(
  c1: Curve2DHandle,
  c2: Curve2DHandle,
  tolerance = 1e-7
): Result<{ points: Point2D[]; segments: Curve2DHandle[] }> {
  return kernelCallRaw(
    () => {
      const result = getKernel2D().intersectCurves2d(c1.raw, c2.raw, tolerance);
      // Defensively wrap segments — dispose already-wrapped handles if one fails
      const wrapped: Curve2DHandle[] = [];
      try {
        for (const s of result.segments) {
          wrapped.push(wrapRawHandle(s));
        }
      } catch (e) {
        wrapped.forEach((h) => {
          h[Symbol.dispose]();
        });
        throw e;
      }
      return { points: result.points, segments: wrapped };
    },
    CURVE2D_INTERSECTION_FAILED,
    'Failed to intersect 2D curves'
  );
}

/**
 * Project a point onto a 2D curve, finding the closest parameter.
 *
 * Returns `ok(null)` when no projection exists (valid geometric outcome),
 * not an error. Only kernel failures produce `err()`.
 */
export function projectPointOnCurve2d(
  curve: Curve2DHandle,
  point: Point2D
): Result<{ param: number; distance: number } | null> {
  return kernelCallRaw(
    () => getKernel2D().projectPointOnCurve2d(curve.raw, point[0], point[1]),
    CURVE2D_QUERY_FAILED,
    'Failed to project point onto 2D curve'
  );
}

/**
 * Compute the minimum distance between two 2D curves.
 *
 * @param bounds1 - Optional parameter range for c1 (default: full curve bounds).
 * @param bounds2 - Optional parameter range for c2 (default: full curve bounds).
 */
export function distanceBetweenCurves2d(
  c1: Curve2DHandle,
  c2: Curve2DHandle,
  bounds1?: { first: number; last: number },
  bounds2?: { first: number; last: number }
): Result<number> {
  return kernelCallRaw(
    () => {
      const kernel = getKernel2D();
      const b1 = bounds1 ?? kernel.getCurve2dBounds(c1.raw);
      const b2 = bounds2 ?? kernel.getCurve2dBounds(c2.raw);
      return kernel.distanceBetweenCurves2d(c1.raw, c2.raw, b1.first, b1.last, b2.first, b2.last);
    },
    CURVE2D_QUERY_FAILED,
    'Failed to compute distance between 2D curves'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2D ↔ 3D Bridge
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lift a 2D curve onto a 3D plane, producing a 3D edge.
 *
 * Decomposes the `Plane` into kernel arguments:
 * `plane.origin` → `planeOrigin`, `plane.zDir` → `planeZ`, `plane.xDir` → `planeX`.
 */
export function liftCurve2dToPlane(curve: Curve2DHandle, plane: Plane): Result<Edge> {
  return kernelCallRaw(
    () => {
      const raw = getKernel2D().liftCurve2dToPlane(
        curve.raw,
        [...plane.origin],
        [...plane.zDir],
        [...plane.xDir]
      );
      return createEdge(raw);
    },
    CURVE2D_BRIDGE_FAILED,
    'Failed to lift 2D curve to plane'
  );
}

/** Extract the 2D parametric curve of a 3D edge on a face. */
export function extractCurve2dFromEdge(edge: Edge, face: Face): Result<Curve2DHandle> {
  return curveCall(
    () => getKernel2D().extractCurve2dFromEdge(edge.wrapped, face.wrapped),
    CURVE2D_BRIDGE_FAILED,
    'Failed to extract 2D curve from edge'
  );
}
