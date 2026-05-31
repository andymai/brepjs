import type { KernelBuilderOps } from '@/kernel/interfaces/builderOps.js';
import type { KernelShape } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';
import { makeNode } from './opGraph.js';
import { nodeOf, occtOrThrow, unwrap, wrap } from './meshHandle.js';

export function makeBuilderOps(module: ManifoldModule): KernelBuilderOps {
  const Manifold = module.Manifold;

  function hullFromPoints(
    points: Array<{ x: number; y: number; z: number }>,
    tolerance: number
  ): KernelShape {
    const coords = points.map((p) => [p.x, p.y, p.z] as [number, number, number]);
    const solid = Manifold.hull(coords);
    return wrap(solid, makeNode('hullFromPoints', { points: coords, tolerance }, []));
  }

  function hull(shapes: KernelShape[], tolerance: number): KernelShape {
    const operands = shapes.map((s) => unwrap(s));
    const solid = Manifold.hull(operands);
    return wrap(
      solid,
      makeNode(
        'hull',
        { tolerance },
        shapes.map((s) => nodeOf(s))
      )
    );
  }

  function sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape {
    // Manifold meshes are already watertight solids; sewing is the identity over
    // the incoming solid. We accept a single operand and record the intent so an
    // OCCT replay can perform the real sew when exporting B-rep.
    const first = faces[0];
    if (!first) {
      notImplemented('sewAndSolidify (no input faces on manifold kernel)');
    }
    return wrap(
      unwrap(first),
      makeNode(
        'sewAndSolidify',
        { tolerance },
        faces.map((f) => nodeOf(f))
      )
    );
  }

  return {
    makeVertex: () => notImplemented('makeVertex'),
    makeEdge: () => notImplemented('makeEdge'),
    makeWire: () => notImplemented('makeWire'),
    makeFace: () => notImplemented('makeFace'),
    makeLineEdge: () => notImplemented('makeLineEdge'),
    makeCircleEdge: () => notImplemented('makeCircleEdge'),
    makeCircleArc: () => notImplemented('makeCircleArc'),
    makeArcEdge: () => notImplemented('makeArcEdge'),
    makeEllipseEdge: () => notImplemented('makeEllipseEdge'),
    makeEllipseArc: () => notImplemented('makeEllipseArc'),
    makeBezierEdge: () => notImplemented('makeBezierEdge'),
    makeTangentArc: () => notImplemented('makeTangentArc'),
    makeHelixWire: () => notImplemented('makeHelixWire'),
    makeWireFromMixed: () => notImplemented('makeWireFromMixed'),
    makeCompound: () => notImplemented('makeCompound'),
    solidFromShell: () => notImplemented('solidFromShell'),
    hull,
    hullFromPoints,
    buildSolidFromFaces: () => notImplemented('buildSolidFromFaces'),
    makeNonPlanarFace: () => notImplemented('makeNonPlanarFace'),
    addHolesInFace: () => notImplemented('addHolesInFace'),
    removeHolesFromFace: () => notImplemented('removeHolesFromFace'),
    makeFaceOnSurface: () => notImplemented('makeFaceOnSurface'),
    bsplineSurface: (points, rows, cols) =>
      occtOrThrow('bsplineSurface').bsplineSurface(points, rows, cols),
    triangulatedSurface: (points, rows, cols) =>
      occtOrThrow('triangulatedSurface').triangulatedSurface(points, rows, cols),
    buildTriFace: () => notImplemented('buildTriFace'),
    sewAndSolidify,
    createPoint3d: () => notImplemented('createPoint3d'),
    createDirection3d: () => notImplemented('createDirection3d'),
    createVector3d: () => notImplemented('createVector3d'),
    createAxis1: () => notImplemented('createAxis1'),
    createAxis2: () => notImplemented('createAxis2'),
    createAxis3: () => notImplemented('createAxis3'),
  };
}
