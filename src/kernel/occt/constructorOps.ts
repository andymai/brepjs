/**
 * Shape construction operations for OCCT.
 *
 * Provides factory functions for creating basic shapes:
 * vertices, edges, wires, faces, and primitives (box, cylinder, sphere).
 *
 * Used by DefaultAdapter.
 */

import type { KernelInstance, KernelShape, KernelType } from '@/kernel/types.js';
import { iterShapes } from './topologyOps.js';

/**
 * Creates a vertex at the given coordinates.
 */
export function makeVertex(oc: KernelInstance, x: number, y: number, z: number): KernelShape {
  const pnt = new oc.gp_Pnt_3(x, y, z);
  const maker = new oc.BRepBuilderAPI_MakeVertex(pnt);
  const vertex = maker.Vertex();
  maker.delete();
  pnt.delete();
  return vertex;
}

/**
 * Creates an edge from a curve, optionally trimmed to start/end parameters.
 */
export function makeEdge(
  oc: KernelInstance,
  curve: KernelType,
  start?: number,
  end?: number
): KernelShape {
  const maker =
    start !== undefined && end !== undefined
      ? new oc.BRepBuilderAPI_MakeEdge_24(curve, start, end)
      : new oc.BRepBuilderAPI_MakeEdge_24(curve);
  const edge = maker.Edge();
  maker.delete();
  return edge;
}

/**
 * Creates a wire from a list of edges.
 */
export function makeWire(oc: KernelInstance, edges: KernelShape[]): KernelShape {
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  for (const edge of edges) {
    wireBuilder.Add_1(edge);
  }
  const progress = new oc.Message_ProgressRange_1();
  wireBuilder.Build(progress);
  const wire = wireBuilder.Wire();
  wireBuilder.delete();
  progress.delete();
  return wire;
}

/**
 * Creates a face from a wire.
 * If planar is true, creates a planar face. Otherwise creates a non-planar filling surface.
 */
export function makeFace(oc: KernelInstance, wire: KernelShape, planar = true): KernelShape {
  if (planar) {
    const builder = new oc.BRepBuilderAPI_MakeFace_15(wire, false);
    const face = builder.Face();
    builder.delete();
    return face;
  }
  // Non-planar face — add wire edges to the filling builder
  const builder = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9);
  const edges = iterShapes(oc, wire, 'edge');
  for (const edge of edges) {
    builder.Add_1(edge, oc.GeomAbs_Shape.GeomAbs_C0, true);
  }
  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  const shape = builder.Shape();
  builder.delete();
  progress.delete();
  return shape;
}

/**
 * Creates a box primitive.
 */
export function makeBox(
  oc: KernelInstance,
  width: number,
  height: number,
  depth: number
): KernelShape {
  const maker = new oc.BRepPrimAPI_MakeBox_2(width, height, depth);
  const solid = maker.Solid();
  maker.delete();
  return solid;
}

/**
 * Creates a cylinder primitive.
 */
export function makeCylinder(
  oc: KernelInstance,
  radius: number,
  height: number,
  center: [number, number, number] = [0, 0, 0],
  direction: [number, number, number] = [0, 0, 1]
): KernelShape {
  const origin = new oc.gp_Pnt_3(...center);
  const dir = new oc.gp_Dir_4(...direction);
  const axis = new oc.gp_Ax2_3(origin, dir);
  const maker = new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, height);
  const solid = maker.Shape();
  maker.delete();
  axis.delete();
  origin.delete();
  dir.delete();
  return solid;
}

/**
 * Creates a sphere primitive.
 */
export function makeSphere(
  oc: KernelInstance,
  radius: number,
  center: [number, number, number] = [0, 0, 0]
): KernelShape {
  const isOrigin = center[0] === 0 && center[1] === 0 && center[2] === 0;
  if (isOrigin) {
    const maker = new oc.BRepPrimAPI_MakeSphere_1(radius);
    const solid = maker.Shape();
    maker.delete();
    return solid;
  }
  const origin = new oc.gp_Pnt_3(...center);
  const maker = new oc.BRepPrimAPI_MakeSphere_2(origin, radius);
  const solid = maker.Shape();
  maker.delete();
  origin.delete();
  return solid;
}

/**
 * Creates a cone primitive (full cone or frustum).
 */
export function makeCone(
  oc: KernelInstance,
  radius1: number,
  radius2: number,
  height: number,
  center: [number, number, number] = [0, 0, 0],
  direction: [number, number, number] = [0, 0, 1]
): KernelShape {
  const origin = new oc.gp_Pnt_3(...center);
  const dir = new oc.gp_Dir_4(...direction);
  const axis = new oc.gp_Ax2_3(origin, dir);
  const maker = new oc.BRepPrimAPI_MakeCone_3(axis, radius1, radius2, height);
  const solid = maker.Shape();
  maker.delete();
  axis.delete();
  origin.delete();
  dir.delete();
  return solid;
}

/**
 * Build a triangular face from 3 points. Returns null if degenerate.
 *
 * This is a low-level helper used by importers, hull, roof, and surface builders.
 */
export function makeTriFace(
  oc: KernelInstance,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): KernelShape | null {
  const gpA = new oc.gp_Pnt_3(a[0], a[1], a[2]);
  const gpB = new oc.gp_Pnt_3(b[0], b[1], b[2]);
  const gpC = new oc.gp_Pnt_3(c[0], c[1], c[2]);

  const e1 = new oc.BRepBuilderAPI_MakeEdge_3(gpA, gpB);
  const e2 = new oc.BRepBuilderAPI_MakeEdge_3(gpB, gpC);
  const e3 = new oc.BRepBuilderAPI_MakeEdge_3(gpC, gpA);

  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  wireBuilder.Add_1(e1.Edge());
  wireBuilder.Add_1(e2.Edge());
  wireBuilder.Add_1(e3.Edge());

  let face: KernelShape | null = null;
  if (wireBuilder.IsDone()) {
    const makeFaceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wireBuilder.Wire(), false);
    if (makeFaceBuilder.IsDone()) {
      face = makeFaceBuilder.Face();
    }
    makeFaceBuilder.delete();
  }

  wireBuilder.delete();
  e1.delete();
  e2.delete();
  e3.delete();
  gpA.delete();
  gpB.delete();
  gpC.delete();

  return face;
}

/**
 * Build a wire from a mix of edges and wires.
 * Checks each item's shape type and calls Add_1 for edges, Add_2 for wires.
 */
export function makeWireFromMixed(oc: KernelInstance, items: KernelShape[]): KernelShape {
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  for (const item of items) {
    const st = item.ShapeType();
    if (st === oc.TopAbs_ShapeEnum.TopAbs_EDGE) {
      wireBuilder.Add_1(item);
    } else if (st === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
      wireBuilder.Add_2(item);
    }
  }
  const progress = new oc.Message_ProgressRange_1();
  wireBuilder.Build(progress);
  const wire = wireBuilder.Wire();
  wireBuilder.delete();
  progress.delete();
  return wire;
}

/**
 * Creates a torus primitive.
 */
export function makeTorus(
  oc: KernelInstance,
  majorRadius: number,
  minorRadius: number,
  center: [number, number, number] = [0, 0, 0],
  direction: [number, number, number] = [0, 0, 1]
): KernelShape {
  const origin = new oc.gp_Pnt_3(...center);
  const dir = new oc.gp_Dir_4(...direction);
  const axis = new oc.gp_Ax2_3(origin, dir);
  const maker = new oc.BRepPrimAPI_MakeTorus_5(axis, majorRadius, minorRadius);
  const solid = maker.Shape();
  maker.delete();
  axis.delete();
  origin.delete();
  dir.delete();
  return solid;
}
