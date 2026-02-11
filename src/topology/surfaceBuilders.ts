/**
 * Surface / face construction helpers — planar faces, non-planar fills, holes, and polygons.
 */

import { getKernel } from '../kernel/index.js';
import { localGC } from '../core/memory.js';
import type { Vec3 } from '../core/types.js';
import { type Result, ok, err, andThen } from '../core/result.js';
import { validationError, occtError } from '../core/errors.js';
import type { Edge, Face, Wire } from '../core/shapeTypes.js';
import { createFace, isFace } from '../core/shapeTypes.js';
import { getEdges } from './shapeFns.js';
import { cast } from './cast.js';
import zip from '../utils/zip.js';
import { makeLine, assembleWire } from './curveBuilders.js';

/**
 * Create a planar face from a closed wire, optionally with hole wires.
 *
 * @returns An error if the wire is non-planar or the face cannot be built.
 */
export function makeFace(wire: Wire, holes?: Wire[]): Result<Face> {
  const oc = getKernel().oc;
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wire.wrapped, false);
  holes?.forEach((hole) => {
    faceBuilder.Add(hole.wrapped);
  });
  if (!faceBuilder.IsDone()) {
    faceBuilder.delete();
    return err(
      occtError('FACE_BUILD_FAILED', 'Failed to build the face. Your wire might be non planar.')
    );
  }
  const face = faceBuilder.Face();
  faceBuilder.delete();

  return ok(createFace(face));
}

/**
 * Create a face bounded by a wire on an existing face's underlying surface.
 *
 * @param originFace - Face whose surface geometry is reused.
 * @param wire - Wire that defines the boundary on that surface.
 */
export function makeNewFaceWithinFace(originFace: Face, wire: Wire): Face {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const surface = r(oc.BRep_Tool.Surface_2(originFace.wrapped));
  const faceBuilder = r(new oc.BRepBuilderAPI_MakeFace_21(surface, wire.wrapped, true));
  const face = faceBuilder.Face();
  gc();

  return createFace(face);
}

/**
 * Create a non-planar face from a wire using surface filling.
 *
 * @returns An error if the filling algorithm fails to produce a face.
 */
export function makeNonPlanarFace(wire: Wire): Result<Face> {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const faceBuilder = r(
    new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)
  );
  getEdges(wire).forEach((edge: Edge) => {
    faceBuilder.Add_1(
      edge.wrapped,

      oc.GeomAbs_Shape.GeomAbs_C0,
      true
    );
  });

  const progress = r(new oc.Message_ProgressRange_1());
  faceBuilder.Build(progress);

  return andThen(cast(faceBuilder.Shape()), (newFace) => {
    gc();
    if (!isFace(newFace)) {
      return err(occtError('FACE_BUILD_FAILED', 'Failed to create a face'));
    }
    return ok(newFace);
  });
}

/**
 * Add hole wires to an existing face.
 *
 * Orientation of the holes is automatically fixed.
 */
export function addHolesInFace(face: Face, holes: Wire[]): Face {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const faceMaker = r(new oc.BRepBuilderAPI_MakeFace_2(face.wrapped));
  holes.forEach((wire) => {
    faceMaker.Add(wire.wrapped);
  });

  const builtFace = r(faceMaker.Face());

  const fixer = r(new oc.ShapeFix_Face_2(builtFace));
  fixer.FixOrientation_1();
  const newFace = fixer.Face();

  gc();
  return createFace(newFace);
}

/**
 * Create a polygonal face from three or more coplanar points.
 *
 * @returns An error if fewer than 3 points are provided or the face cannot be built.
 */
export function makePolygon(points: Vec3[]): Result<Face> {
  if (points.length < 3)
    return err(
      validationError('POLYGON_MIN_POINTS', 'You need at least 3 points to make a polygon')
    );

  const edges = zip([points, [...points.slice(1), points[0]]]).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zip returns untyped pairs
    ([p1, p2]: any) => makeLine(p1, p2)
  );
  return andThen(assembleWire(edges), (wire) => makeFace(wire));
}
