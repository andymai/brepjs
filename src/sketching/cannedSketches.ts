import { unwrap } from '../core/result.js';
import {
  assembleWire,
  type BSplineApproximationConfig,
  makeBSplineApproximation,
  makeCircle,
  makeEllipse,
  makeHelix,
} from '../topology/shapeHelpers.js';
import type { Plane, PlaneName } from '../core/planeTypes.js';
import { resolvePlane, planeToWorld } from '../core/planeOps.js';
import type { Vec3, PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { vecRotate } from '../core/vecOps.js';
import { DEG2RAD } from '../core/constants.js';
import Sketcher from './Sketcher.js';
import Sketch from './Sketch.js';
import type { Face } from '../core/shapeTypes.js';
import { faceCenter, normalAt, outerWire } from '../topology/faceFns.js';
import { offsetWire2D } from '../topology/curveFns.js';
import type { Point2D } from '../2d/lib/index.js';
import { localGC } from '../core/memory.js';
import { roundedRectangleBlueprint } from '../2d/blueprints/cannedBlueprints.js';

interface PlaneConfig {
  plane?: PlaneName | Plane;
  origin?: PointInput | number;
}

/**
 * Create a circular Sketch on a given plane.
 *
 * @param radius - Radius of the circle.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed circular {@link Sketch}.
 *
 * @example
 * ```ts
 * const circle = sketchCircle(10, { plane: "XZ", origin: 5 });
 * const cylinder = circle.extrude(20);
 * ```
 *
 * @category Sketching
 */
export const sketchCircle = (radius: number, planeConfig: PlaneConfig = {}): Sketch => {
  const plane =
    planeConfig.plane && typeof planeConfig.plane !== 'string'
      ? { ...planeConfig.plane }
      : resolvePlane(planeConfig.plane ?? 'XY', planeConfig.origin);

  const wire = unwrap(assembleWire([makeCircle(radius, plane.origin, plane.zDir)]));
  const sketch = new Sketch(wire, {
    defaultOrigin: [...plane.origin],
    defaultDirection: [...plane.zDir],
  });
  return sketch;
};

/**
 * Create an elliptical Sketch on a given plane.
 *
 * @param xRadius - Semi-axis length along the plane X direction.
 * @param yRadius - Semi-axis length along the plane Y direction.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed elliptical {@link Sketch}.
 *
 * @category Sketching
 */
export const sketchEllipse = (xRadius = 1, yRadius = 2, planeConfig: PlaneConfig = {}): Sketch => {
  const plane =
    planeConfig.plane && typeof planeConfig.plane !== 'string'
      ? { ...planeConfig.plane }
      : resolvePlane(planeConfig.plane ?? 'XY', planeConfig.origin);
  let xDir: Vec3 = plane.xDir;

  let majR = xRadius;
  let minR = yRadius;

  if (yRadius > xRadius) {
    xDir = vecRotate(xDir, plane.zDir, 90 * DEG2RAD);
    majR = yRadius;
    minR = xRadius;
  }

  const wire = unwrap(
    assembleWire([unwrap(makeEllipse(majR, minR, plane.origin, plane.zDir, xDir))])
  );

  const sketch = new Sketch(wire, {
    defaultOrigin: [...plane.origin],
    defaultDirection: [...plane.zDir],
  });
  return sketch;
};

/**
 * Create a rectangular Sketch centered on a given plane.
 *
 * @param xLength - Width along the plane X direction.
 * @param yLength - Height along the plane Y direction.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed rectangular {@link Sketch}.
 *
 * @example
 * ```ts
 * const rect = sketchRectangle(30, 20);
 * const box = rect.extrude(10);
 * ```
 *
 * @category Sketching
 */
export const sketchRectangle = (
  xLength: number,
  yLength: number,
  planeConfig: PlaneConfig = {}
): Sketch => {
  const sketcher =
    planeConfig.plane && typeof planeConfig.plane !== 'string'
      ? new Sketcher(planeConfig.plane)
      : new Sketcher(planeConfig.plane, planeConfig.origin);
  return sketcher
    .movePointerTo([-xLength / 2, -yLength / 2])
    .hLine(xLength)
    .vLine(yLength)
    .hLine(-xLength)
    .vLine(-yLength)
    .done();
};

/**
 * Create a rounded-rectangle Sketch centered on a given plane.
 *
 * @param width - Width of the rectangle.
 * @param height - Height of the rectangle.
 * @param r - Corner radius, or `{ rx, ry }` for elliptical corners (0 = sharp).
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed rounded-rectangle {@link Sketch}.
 *
 * @category Sketching
 */
export const sketchRoundedRectangle = (
  width: number,
  height: number,
  r: number | { rx?: number; ry?: number } = 0,
  planeConfig: PlaneConfig = {}
): Sketch => {
  const bp = roundedRectangleBlueprint(width, height, r);
  const data = bp.sketchOnPlane(planeConfig.plane, planeConfig.origin);
  const opts: { defaultOrigin?: PointInput; defaultDirection?: PointInput } = {};
  if (data.defaultOrigin) opts.defaultOrigin = data.defaultOrigin;
  if (data.defaultDirection) opts.defaultDirection = data.defaultDirection;
  return new Sketch(data.wire, opts);
};

/**
 * Create a regular-polygon Sketch on a given plane.
 *
 * Sides may optionally be arcs (sagitta != 0). The outer radius is measured
 * to the vertices when sagitta is zero.
 *
 * @param radius - Circumscribed (outer) radius.
 * @param sidesCount - Number of polygon sides.
 * @param sagitta - Arc sagitta per side (0 = straight edges).
 * @param planeConfig - Plane name / origin to sketch on.
 * @returns A closed polygon {@link Sketch}.
 *
 * @example
 * ```ts
 * const hex = sketchPolysides(15, 6);
 * ```
 *
 * @category Sketching
 */
export const sketchPolysides = (
  radius: number,
  sidesCount: number,
  sagitta = 0,
  planeConfig: PlaneConfig = {}
): Sketch => {
  const points = [...Array(sidesCount).keys()].map((i) => {
    const theta = -((Math.PI * 2) / sidesCount) * i;
    return [radius * Math.sin(theta), radius * Math.cos(theta)];
  });

  // We start with the last point to make sure the shape is complete
  const sketcher =
    planeConfig.plane && typeof planeConfig.plane !== 'string'
      ? new Sketcher(planeConfig.plane)
      : new Sketcher(planeConfig.plane, planeConfig.origin);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const lastPoint = points[points.length - 1]!;
  const sketch = sketcher.movePointerTo([
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    lastPoint[0]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    lastPoint[1]!,
  ]);

  if (sagitta) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    points.forEach(([x, y]) => sketch.sagittaArcTo([x!, y!], sagitta));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    points.forEach(([x, y]) => sketch.lineTo([x!, y!]));
  }

  return sketch.done();
};

/**
 * Compute the apothem (inner radius) of a regular polygon, accounting for sagitta.
 *
 * @param outerRadius - Circumscribed radius.
 * @param sidesCount - Number of polygon sides.
 * @param sagitta - Arc sagitta per side (0 = straight edges).
 * @returns The inscribed radius (distance from center to the nearest edge midpoint).
 */
export const polysideInnerRadius = (
  outerRadius: number,
  sidesCount: number,
  sagitta = 0
): number => {
  const innerAngle = Math.PI / sidesCount; // Half of a side
  const innerRadius = Math.cos(innerAngle) * outerRadius;

  // Only a concave sagitta changes the inner radius
  if (sagitta >= 0) return innerRadius;
  return innerRadius + sagitta;
};

/**
 * Create a Sketch by offsetting the outer wire of a face.
 *
 * A negative offset shrinks inward; a positive offset expands outward.
 *
 * @param face - The face whose outer wire to offset.
 * @param offset - Signed offset distance.
 * @returns A {@link Sketch} of the offset wire, inheriting the face normal.
 *
 * @category Sketching
 */
export const sketchFaceOffset = (face: Face, offset: number): Sketch => {
  const defaultOrigin: [number, number, number] = [...faceCenter(face)];
  const defaultDirection: [number, number, number] = [...normalAt(face)];
  const wire = unwrap(offsetWire2D(outerWire(face), offset));

  const sketch = new Sketch(wire, { defaultOrigin, defaultDirection });

  return sketch;
};

/**
 * Create a Sketch from a parametric 2D function, approximated as a B-spline.
 *
 * The function is sampled at `pointsCount + 1` evenly spaced parameter values
 * between `start` and `stop`, then fit with a B-spline approximation.
 *
 * @param func - Parametric function mapping `t` to a 2D point.
 * @param planeConfig - Plane to sketch on (defaults to XY at origin).
 * @param approximationConfig - B-spline fitting options (tolerance, degree, etc.).
 * @returns A {@link Sketch} containing the approximated curve.
 *
 * @category Sketching
 */
export const sketchParametricFunction = (
  func: (t: number) => Point2D,
  planeConfig: PlaneConfig = {},
  { pointsCount = 400, start = 0, stop = 1 } = {},
  approximationConfig: BSplineApproximationConfig = {}
): Sketch => {
  const [r, gc] = localGC();
  const plane =
    planeConfig.plane && typeof planeConfig.plane !== 'string'
      ? { ...planeConfig.plane }
      : resolvePlane(planeConfig.plane ?? 'XY', planeConfig.origin);

  const stepSize = (stop - start) / pointsCount;
  const points: Vec3[] = [...Array(pointsCount + 1).keys()].map((t) => {
    const point = func(start + t * stepSize);
    return planeToWorld(plane, point);
  });

  const wire = unwrap(
    assembleWire([r(unwrap(makeBSplineApproximation(points, approximationConfig)))])
  );

  const sketch = new Sketch(wire, {
    defaultOrigin: [...plane.origin],
    defaultDirection: [...plane.zDir],
  });
  gc();
  return sketch;
};

/**
 * Create a helical Sketch (open wire) with the given pitch, height, and radius.
 *
 * @param pitch - Axial distance per full revolution.
 * @param height - Total height of the helix along its axis.
 * @param radius - Radius of the helix.
 * @param center - Center point of the helix base.
 * @param dir - Axis direction of the helix.
 * @param lefthand - If true, generate a left-handed helix.
 * @returns A {@link Sketch} wrapping the helical wire.
 *
 * @category Sketching
 */
export const sketchHelix = (
  pitch: number,
  height: number,
  radius: number,
  center: PointInput = [0, 0, 0],
  dir: PointInput = [0, 0, 1],
  lefthand = false
): Sketch => {
  const centerVec3 = toVec3(center);
  const dirVec3 = toVec3(dir);

  return new Sketch(
    unwrap(assembleWire([makeHelix(pitch, height, radius, centerVec3, dirVec3, lefthand)]))
  );
};
