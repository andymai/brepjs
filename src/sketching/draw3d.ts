import { unwrap } from '@/core/result.js';
import { DisposalScope } from '@/core/disposal.js';
import { stitchCurves } from '@/2d/lib/index.js';
import { Blueprint, Blueprints } from '@/2d/blueprints/index.js';
import type { AnyShape, ClosedWire, Edge, Face, Wire } from '@/core/shapeTypes.js';
import { createFace } from '@/core/shapeTypes.js';
import { outerWire } from '@/topology/faceFns.js';
import { getEdges } from '@/topology/shapeFns.js';
import { makeFace } from '@/topology/shapeHelpers.js';
import { downcast } from '@/topology/cast.js';
import type { SketchInterface } from './sketchLib.js';
import type { ProjectionPlane } from '@/projection/projectionPlanes.js';
import { type Camera, cameraFromPlane, projectEdges } from '@/projection/cameraFns.js';
import { edgeToCurve } from '@/2d/curves.js';
import { Drawing, drawRectangle } from './draw.js';

const edgesToDrawing = (edges: Edge[]): Drawing => {
  using scope = new DisposalScope();
  const planeSketch = drawRectangle(1000, 1000).sketchOnPlane() as SketchInterface & {
    wire: Wire;
  };
  // Rectangle drawing always produces a closed wire
  const planeFace = scope.register(unwrap(makeFace(planeSketch.wire as ClosedWire)));

  const curves = edges.map((e) => edgeToCurve(e, planeFace));

  const stitchedCurves = stitchCurves(curves).map((s) => new Blueprint(s));
  if (stitchedCurves.length === 0) return new Drawing();
  if (stitchedCurves.length === 1) return new Drawing(stitchedCurves[0]);

  return new Drawing(new Blueprints(stitchedCurves));
};

/**
 * Creates the `Drawing` of a projection of a shape on a plane.
 *
 * The projection is done by projecting the edges of the shape on the plane.
 *
 * @category Drawing
 */
export function drawProjection(
  shape: AnyShape,
  projectionCamera: ProjectionPlane | Camera = 'front'
): { visible: Drawing; hidden: Drawing } {
  let camera: Camera;
  if (typeof projectionCamera === 'string') {
    camera = unwrap(cameraFromPlane(projectionCamera));
  } else {
    camera = projectionCamera;
  }

  const { visible, hidden } = projectEdges(shape, camera);

  return {
    visible: edgesToDrawing(visible),
    hidden: edgesToDrawing(hidden),
  };
}

/**
 * Creates the `Drawing` out of a face
 *
 * @category Drawing
 */
export function drawFaceOutline(face: Face): Drawing {
  using scope = new DisposalScope();
  const clonedFace = scope.register(createFace(unwrap(downcast(face.wrapped))));
  const faceOuterWire = scope.register(outerWire(clonedFace));
  const curves = getEdges(faceOuterWire).map((e) => edgeToCurve(e, face));

  const stitchedCurves = stitchCurves(curves).map((s) => new Blueprint(s));
  if (stitchedCurves.length === 0) return new Drawing();
  if (stitchedCurves.length === 1) return new Drawing(stitchedCurves[0]);

  return new Drawing(new Blueprints(stitchedCurves));
}
