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
import type { Face } from '../topology/shapes.js';
import type { Point2D } from '../2d/lib/index.js';
import { localGC } from '../core/memory.js';
import { roundedRectangleBlueprint } from '../2d/blueprints/cannedBlueprints.js';

interface PlaneConfig {
  plane?: PlaneName | Plane;
  origin?: PointInput | number;
}

/**
 * Creates the `Sketch` of a circle in a defined plane
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
 * Creates the `Sketch` of an ellipse in a defined plane
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
 * Creates the `Sketch` of a rectangle in a defined plane
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
 * Creates the `Sketch` of a rounded rectangle in a defined plane
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
 * Creates the `Sketch` of a polygon in a defined plane
 *
 * The sides of the polygon can be arcs of circle with a defined sagitta.
 * The radius defines the outer radius of the polygon without sagitta
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
 * Helper function to compute the inner radius of a polyside (even if a sagitta
 * is defined)
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
 * Creates the `Sketch` of an offset of a certain face. A negative offset will
 * be within the face, a positive one outside.
 *
 * @category Sketching
 */
export const sketchFaceOffset = (face: Face, offset: number): Sketch => {
  const defaultOrigin: [number, number, number] = [...face.center];
  const defaultDirection: [number, number, number] = [...face.normalAt()];
  const wire = unwrap(face.outerWire().offset2D(offset));

  const sketch = new Sketch(wire, { defaultOrigin, defaultDirection });

  return sketch;
};

/**
 * Creates the `Sketch` of a parametric function in a specified plane
 *
 * The sketch will be a spline approximating the function
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
 * Creates the `Sketch` of a helix
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
    unwrap(assembleWire(makeHelix(pitch, height, radius, centerVec3, dirVec3, lefthand).wires))
  );
};
