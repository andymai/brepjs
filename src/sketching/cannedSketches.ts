import { unwrap } from '../core/result.js';
import {
  assembleWire,
  type BSplineApproximationConfig,
  makeBSplineApproximation,
  makeCircle,
  makeEllipse,
  makeHelix,
} from '../topology/shapeHelpers.js';
import { Plane, type PlaneName, type Point, type Vec3, vecRotate } from '../core/geometry.js';
import { DEG2RAD } from '../core/constants.js';
import Sketcher from './Sketcher.js';
import { makePlane } from '../core/geometryHelpers.js';
import Sketch from './Sketch.js';
import type { Face } from '../topology/shapes.js';
import type { Point2D } from '../2d/lib/index.js';
import { localGC } from '../core/memory.js';
import { roundedRectangleBlueprint } from '../2d/blueprints/cannedBlueprints.js';

interface PlaneConfig {
  plane?: PlaneName | Plane;
  origin?: Point | number;
}

/**
 * Creates the `Sketch` of a circle in a defined plane
 *
 * @category Sketching
 */
export const sketchCircle = (radius: number, planeConfig: PlaneConfig = {}): Sketch => {
  const plane =
    planeConfig.plane instanceof Plane
      ? makePlane(planeConfig.plane)
      : makePlane(planeConfig.plane, planeConfig.origin);

  const wire = unwrap(
    assembleWire([makeCircle(radius, plane.origin.toVec3(), plane.zDir.toVec3())])
  );
  const sketch = new Sketch(wire, {
    defaultOrigin: [...plane.origin.toVec3()],
    defaultDirection: [...plane.zDir.toVec3()],
  });
  plane.delete();
  return sketch;
};

/**
 * Creates the `Sketch` of an ellipse in a defined plane
 *
 * @category Sketching
 */
export const sketchEllipse = (xRadius = 1, yRadius = 2, planeConfig: PlaneConfig = {}): Sketch => {
  const plane =
    planeConfig.plane instanceof Plane
      ? makePlane(planeConfig.plane)
      : makePlane(planeConfig.plane, planeConfig.origin);
  let xDir: Vec3 = plane.xDir.toVec3();

  let majR = xRadius;
  let minR = yRadius;

  if (yRadius > xRadius) {
    xDir = vecRotate(xDir, plane.zDir.toVec3(), 90 * DEG2RAD);
    majR = yRadius;
    minR = xRadius;
  }

  const wire = unwrap(
    assembleWire([
      unwrap(makeEllipse(majR, minR, plane.origin.toVec3(), plane.zDir.toVec3(), xDir)),
    ])
  );

  const sketch = new Sketch(wire, {
    defaultOrigin: [...plane.origin.toVec3()],
    defaultDirection: [...plane.zDir.toVec3()],
  });
  plane.delete();
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
    planeConfig.plane instanceof Plane
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
  const opts: { defaultOrigin?: Point; defaultDirection?: Point } = {};
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
    planeConfig.plane instanceof Plane
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
  const plane = r(
    planeConfig.plane instanceof Plane
      ? makePlane(planeConfig.plane)
      : makePlane(planeConfig.plane, planeConfig.origin)
  );

  const stepSize = (stop - start) / pointsCount;
  const points: Vec3[] = [...Array(pointsCount + 1).keys()].map((t) => {
    const point = func(start + t * stepSize);
    const worldCoords = r(plane.toWorldCoords(point));
    return worldCoords.toVec3();
  });

  const wire = unwrap(
    assembleWire([r(unwrap(makeBSplineApproximation(points, approximationConfig)))])
  );

  const sketch = new Sketch(wire, {
    defaultOrigin: [...plane.origin.toVec3()],
    defaultDirection: [...plane.zDir.toVec3()],
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
  center: Point = [0, 0, 0],
  dir: Point = [0, 0, 1],
  lefthand = false
): Sketch => {
  // Convert Point to Vec3 - handle array case (most common) and fall back to Vector conversion
  let centerVec3: Vec3;
  let dirVec3: Vec3;

  if (Array.isArray(center)) {
    centerVec3 =
      center.length === 2 ? [center[0], center[1], 0] : [center[0], center[1], center[2]];
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy Point can be Vector or OCCT object
    centerVec3 = (center as any).toVec3 ? (center as any).toVec3() : [0, 0, 0];
  }

  if (Array.isArray(dir)) {
    dirVec3 = dir.length === 2 ? [dir[0], dir[1], 0] : [dir[0], dir[1], dir[2]];
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy Point can be Vector or OCCT object
    dirVec3 = (dir as any).toVec3 ? (dir as any).toVec3() : [0, 0, 1];
  }

  return new Sketch(
    unwrap(assembleWire(makeHelix(pitch, height, radius, centerVec3, dirVec3, lefthand).wires))
  );
};
