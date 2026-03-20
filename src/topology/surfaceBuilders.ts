/**
 * Surface / face construction helpers — planar faces, non-planar fills, holes, and polygons.
 */

import { getKernel } from '@/kernel/index.js';

import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err, andThen } from '@/core/result.js';
import { validationError, kernelError } from '@/core/errors.js';
import type { Dimension, ClosedWire, Face, OrientedFace } from '@/core/shapeTypes.js';
import { createFace, isFace } from '@/core/shapeTypes.js';
import { cast } from './cast.js';
import { outerWire } from './faceFns.js';
import zip from '@/utils/zip.js';
import { makeLine, assembleWire } from './curveBuilders.js';

/**
 * Create a planar face from a closed wire, optionally with hole wires.
 *
 * @returns An error if the wire is non-planar or the face cannot be built.
 */
export function makeFace<D extends Dimension = '3D'>(
  wire: ClosedWire<D>,
  holes?: ClosedWire<D>[]
): Result<OrientedFace<D>> {
  try {
    const faceShape = getKernel().makeFace(wire.wrapped, true);
    if (holes && holes.length > 0) {
      // Add holes using the existing addHolesInFace helper which handles orientation fixing
      return ok(addHolesInFace(createFace<D>(faceShape), holes));
    }
    return ok(createFace<D>(faceShape) as OrientedFace<D>);
  } catch {
    return err(
      kernelError('FACE_BUILD_FAILED', 'Failed to build the face. Your wire might be non planar.')
    );
  }
}

/**
 * Remove holes from a face by rebuilding it from only the outer wire.
 *
 * Equivalent to OpenSCAD's `fill()` — takes a 2D face with holes and returns
 * a solid face with all internal cutouts filled in.
 */
export function fill<D extends Dimension = '3D'>(face: Face<D>): Result<OrientedFace<D>> {
  const outer = outerWire(face);
  return makeFace(outer);
}

/**
 * Create a face bounded by a wire on an existing face's underlying surface.
 *
 * @param originFace - Face whose surface geometry is reused.
 * @param wire - Wire that defines the boundary on that surface.
 */
export function makeNewFaceWithinFace(originFace: Face, wire: ClosedWire): OrientedFace {
  return createFace(
    getKernel().makeFaceOnSurface(originFace.wrapped, wire.wrapped)
  ) as OrientedFace;
}

/**
 * Create a non-planar face from a wire using surface filling.
 *
 * @returns An error if the filling algorithm fails to produce a face.
 */
export function makeNonPlanarFace<D extends Dimension = '3D'>(
  wire: ClosedWire<D>
): Result<OrientedFace<D>> {
  try {
    const shape = getKernel().makeNonPlanarFace(wire.wrapped);
    return andThen(cast(shape), (newFace) => {
      if (!isFace(newFace)) {
        return err(kernelError('FACE_BUILD_FAILED', 'Failed to create a non-planar face'));
      }
      return ok(newFace as OrientedFace<D>);
    });
  } catch {
    return err(kernelError('FACE_BUILD_FAILED', 'Failed to create a non-planar face'));
  }
}

/**
 * Add hole wires to an existing face.
 *
 * Orientation of the holes is automatically fixed.
 */
export function addHolesInFace<D extends Dimension = '3D'>(
  face: Face<D>,
  holes: ClosedWire<D>[]
): OrientedFace<D> {
  return createFace<D>(
    getKernel().addHolesInFace(
      face.wrapped,
      holes.map((h) => h.wrapped)
    )
  ) as OrientedFace<D>;
}

/**
 * Create a polygonal face from three or more coplanar points.
 *
 * @returns An error if fewer than 3 points are provided or the face cannot be built.
 */
export function makePolygon(points: Vec3[]): Result<OrientedFace> {
  if (points.length < 3)
    return err(
      validationError('POLYGON_MIN_POINTS', 'You need at least 3 points to make a polygon')
    );

  const edges = zip([points, [...points.slice(1), points[0]]]).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zip returns untyped pairs
    ([p1, p2]: any) => makeLine(p1, p2)
  );
  // Polygon edges always form a closed loop — safe to narrow
  return andThen(assembleWire(edges), (wire) => makeFace(wire as ClosedWire));
}
