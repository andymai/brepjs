/**
 * Curve construction helpers — lines, arcs, circles, ellipses, splines, and wire assembly.
 */

import { getKernel } from '@/kernel/index.js';
import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err } from '@/core/result.js';
import { validationError, kernelError } from '@/core/errors.js';
import type { Edge, Wire } from '@/core/shapeTypes.js';
import { createEdge, createWire } from '@/core/shapeTypes.js';

/** Create a straight edge between two 3D points. */
export function makeLine(v1: Vec3, v2: Vec3): Edge {
  return createEdge(getKernel().makeLineEdge([...v1], [...v2]));
}

/** Create a circular edge with the given radius, center, and normal. */
export function makeCircle(
  radius: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1]
): Edge {
  return createEdge(getKernel().makeCircleEdge([...center], [...normal], radius));
}

/**
 * Create an elliptical edge with the given radii.
 *
 * @param xDir - Optional direction for the major axis.
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
export function makeEllipse(
  majorRadius: number,
  minorRadius: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1],
  xDir?: Vec3
): Result<Edge> {
  if (minorRadius > majorRadius) {
    return err(
      validationError('ELLIPSE_RADII', 'The minor radius must be smaller than the major one')
    );
  }

  return ok(
    createEdge(
      getKernel().makeEllipseEdge(
        [...center],
        [...normal],
        majorRadius,
        minorRadius,
        xDir ? [...xDir] : undefined
      )
    )
  );
}

/**
 * Create a helical wire with the given pitch, height, and radius.
 *
 * @param pitch - Vertical distance per full turn.
 * @param lefthand - Wind the helix in the left-hand direction.
 */
export function makeHelix(
  pitch: number,
  height: number,
  radius: number,
  center: Vec3 = [0, 0, 0],
  dir: Vec3 = [0, 0, 1],
  lefthand = false
): Wire {
  return createWire(
    getKernel().makeHelixWire(pitch, height, radius, [...center], [...dir], lefthand)
  );
}

/**
 * Create a circular arc edge passing through three points.
 *
 * @param v1 - Start point.
 * @param v2 - Mid point (on the arc).
 * @param v3 - End point.
 */
export function makeThreePointArc(v1: Vec3, v2: Vec3, v3: Vec3): Edge {
  return createEdge(getKernel().makeArcEdge([...v1], [...v2], [...v3]));
}

/**
 * Create an elliptical arc edge between two angles.
 *
 * @param startAngle - Start angle in radians.
 * @param endAngle - End angle in radians.
 * @param xDir - Optional direction for the major axis.
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
export function makeEllipseArc(
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1],
  xDir?: Vec3
): Result<Edge> {
  if (minorRadius > majorRadius) {
    return err(
      validationError('ELLIPSE_RADII', 'The minor radius must be smaller than the major one')
    );
  }

  return ok(
    createEdge(
      getKernel().makeEllipseArc(
        [...center],
        [...normal],
        majorRadius,
        minorRadius,
        startAngle,
        endAngle,
        xDir ? [...xDir] : undefined
      )
    )
  );
}

/** Configuration for {@link makeBSplineApproximation}. */
export interface BSplineApproximationOptions {
  /** Maximum allowed distance between the curve and the input points. */
  tolerance?: number;
  /** Maximum B-spline degree. */
  degMax?: number;
  /** Minimum B-spline degree. */
  degMin?: number;
  /** Optional `[weight1, weight2, weight3]` smoothing weights, or `null` to disable. */
  smoothing?: null | [number, number, number];
}

/**
 * Create a B-spline edge that approximates a set of 3D points.
 *
 * @returns An error if the kernel approximation algorithm fails.
 */
export function makeBSplineApproximation(
  points: Vec3[],
  { tolerance = 1e-3, smoothing = null, degMax = 6, degMin = 1 }: BSplineApproximationOptions = {}
): Result<Edge> {
  try {
    const mutablePoints: [number, number, number][] = points.map((p) => [...p]);
    return ok(
      createEdge(
        getKernel().approximatePoints(mutablePoints, { tolerance, degMin, degMax, smoothing })
      )
    );
  } catch {
    return err(kernelError('BSPLINE_FAILED', 'B-spline approximation failed'));
  }
}

export interface BSplineInterpolationOptions {
  /** Treat the curve as periodic (closed loop). */
  periodic?: boolean;
  /** Vertex-coincidence tolerance. */
  tolerance?: number;
}

/**
 * Create a B-spline edge that passes exactly through every input point. Use
 * over {@link makeBSplineApproximation} when downstream wire assembly needs
 * precise endpoint coincidence with neighbouring edges.
 */
export function makeBSplineInterpolation(
  points: Vec3[],
  { periodic = false, tolerance = 1e-7 }: BSplineInterpolationOptions = {}
): Result<Edge> {
  try {
    const mutablePoints: [number, number, number][] = points.map((p) => [...p]);
    return ok(createEdge(getKernel().interpolatePoints(mutablePoints, { periodic, tolerance })));
  } catch {
    return err(kernelError('BSPLINE_INTERP_FAILED', 'B-spline interpolation failed'));
  }
}

/**
 * Create a Bezier curve edge from control points.
 *
 * @param points - Two or more control points defining the curve.
 * @returns Ok with the edge, or Err if fewer than 2 points are provided.
 */
export function makeBezierCurve(points: Vec3[]): Result<Edge> {
  if (points.length < 2) {
    return err(
      validationError(
        'BEZIER_MIN_POINTS',
        `Need at least 2 points for a Bezier curve, got ${points.length}`,
        undefined,
        {
          pointCount: points.length,
        }
      )
    );
  }
  const mutablePoints: [number, number, number][] = points.map((p) => [...p]);
  return ok(createEdge(getKernel().makeBezierEdge(mutablePoints)));
}

/**
 * Create a circular arc edge tangent to a direction at the start point.
 *
 * @param startTgt - Tangent direction at the start point.
 */
export function makeTangentArc(startPoint: Vec3, startTgt: Vec3, endPoint: Vec3): Edge {
  return createEdge(getKernel().makeTangentArc([...startPoint], [...startTgt], [...endPoint]));
}

/**
 * Assemble edges and/or wires into a single connected wire.
 *
 * @returns An error if the edges cannot form a valid wire (e.g. disconnected).
 */
export function assembleWire(listOfEdges: (Edge | Wire)[]): Result<Wire> {
  try {
    return ok(createWire(getKernel().makeWireFromMixed(listOfEdges.map((e) => e.wrapped))));
  } catch (e) {
    return err(
      kernelError(
        'WIRE_BUILD_FAILED',
        `Failed to build the wire: ${e instanceof Error ? e.message : 'unknown error'}`
      )
    );
  }
}
