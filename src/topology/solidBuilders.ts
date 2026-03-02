/**
 * Solid and primitive construction helpers — boxes, cylinders, spheres, cones,
 * tori, ellipsoids, vertices, compounds, and offsets.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import { type Result, ok, err, andThen } from '../core/result.js';
import { typeCastError } from '../core/errors.js';
import type {
  AnyShape,
  Shape3D,
  Compound,
  Face,
  Vertex,
  Shell,
  Solid,
} from '../core/shapeTypes.js';
import {
  createSolid,
  createCompound,
  createVertex,
  isShape3D,
  isSolid,
} from '../core/shapeTypes.js';
import { cast, downcast } from './cast.js';
import { weldShapes } from './shapeUtils.js';

/**
 * Creates a cylinder with the given radius and height.
 *
 * @category Solids
 */
export function makeCylinder(
  radius: number,
  height: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid {
  return createSolid(getKernel().makeCylinder(radius, height, [...location], [...direction]));
}

/**
 * Creates a sphere with the given radius.
 *
 * @category Solids
 */
export function makeSphere(radius: number): Solid {
  return createSolid(getKernel().makeSphere(radius));
}

/**
 * Creates a cone (or frustum) with the given radii and height.
 *
 * @category Solids
 */
export function makeCone(
  radius1: number,
  radius2: number,
  height: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid {
  return createSolid(getKernel().makeCone(radius1, radius2, height, [...location], [...direction]));
}

/**
 * Creates a torus with the given major and minor radii.
 *
 * @category Solids
 */
export function makeTorus(
  majorRadius: number,
  minorRadius: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid {
  return createSolid(
    getKernel().makeTorus(majorRadius, minorRadius, [...location], [...direction])
  );
}

/**
 * Creates an ellipsoid with the given axis lengths.
 *
 * The algorithm creates a unit BSpline sphere surface, transforms its
 * control-point poles with an affinity matrix to match the requested
 * axis half-lengths, then sews the result into a solid.
 *
 * @category Solids
 */
export function makeEllipsoid(aLength: number, bLength: number, cLength: number): Solid {
  return createSolid(getKernel().makeEllipsoid(aLength, bLength, cLength));
}

/**
 * Creates a box with the given corner points.
 *
 * @category Solids
 */
export function makeBox(corner1: Vec3, corner2: Vec3): Solid {
  return createSolid(getKernel().makeBoxFromCorners([...corner1], [...corner2]));
}

/** Create a vertex at a 3D point. */
export function makeVertex(point: Vec3): Vertex {
  return createVertex(getKernel().makeVertex(point[0], point[1], point[2]));
}

/**
 * Create an offset shape from a face.
 *
 * @param offset - Signed offset distance (positive = outward).
 * @param tolerance - Geometric tolerance for the offset algorithm.
 * @returns An error if the result is not a valid 3D shape.
 */
export function makeOffset(face: Face, offset: number, tolerance = 1e-6): Result<Shape3D> {
  const resultShape = getKernel().offset(face.wrapped, offset, tolerance);

  return andThen(downcast(resultShape), (downcasted) =>
    andThen(cast(downcasted), (newShape) => {
      if (!isShape3D(newShape))
        return err(typeCastError('OFFSET_NOT_3D', 'Could not offset to a 3d shape'));
      return ok(newShape);
    })
  );
}

/**
 * Build a compound from multiple shapes.
 *
 * @param shapeArray - Shapes to group into a single compound.
 * @returns A new Compound containing all input shapes.
 */
export function makeCompound(shapeArray: AnyShape[]): Compound {
  return createCompound(getKernel().makeCompound(shapeArray.map((s) => s.wrapped)));
}

/**
 * Welds faces and shells into a single shell and then makes a solid.
 *
 * @param facesOrShells - An array of faces and shells to be welded.
 * @returns A solid that contains all the faces and shells.
 *
 * @category Solids
 */
export function makeSolid(facesOrShells: Array<Face | Shell>): Result<Solid> {
  const shell = weldShapes(facesOrShells);
  return andThen(cast(getKernel().solidFromShell(shell.wrapped)), (solid) => {
    if (!isSolid(solid))
      return err(typeCastError('SOLID_BUILD_FAILED', 'Could not make a solid of faces and shells'));
    return ok(solid);
  });
}
