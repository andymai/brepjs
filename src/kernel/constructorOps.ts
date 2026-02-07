/**
 * Shape construction operations for OCCT.
 *
 * Provides factory functions for creating basic shapes:
 * vertices, edges, wires, faces, and primitives (box, cylinder, sphere).
 *
 * Used by OCCTAdapter.
 */

import type { OpenCascadeInstance, OcShape, OcType } from './types.js';
import { iterShapes } from './topologyOps.js';

/**
 * Creates a vertex at the given coordinates.
 */
export function makeVertex(oc: OpenCascadeInstance, x: number, y: number, z: number): OcShape {
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
  oc: OpenCascadeInstance,
  curve: OcType,
  start?: number,
  end?: number
): OcShape {
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
export function makeWire(oc: OpenCascadeInstance, edges: OcShape[]): OcShape {
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
export function makeFace(oc: OpenCascadeInstance, wire: OcShape, planar = true): OcShape {
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
  oc: OpenCascadeInstance,
  width: number,
  height: number,
  depth: number
): OcShape {
  const maker = new oc.BRepPrimAPI_MakeBox_2(width, height, depth);
  const solid = maker.Solid();
  maker.delete();
  return solid;
}

/**
 * Creates a cylinder primitive.
 */
export function makeCylinder(
  oc: OpenCascadeInstance,
  radius: number,
  height: number,
  center: [number, number, number] = [0, 0, 0],
  direction: [number, number, number] = [0, 0, 1]
): OcShape {
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
  oc: OpenCascadeInstance,
  radius: number,
  center: [number, number, number] = [0, 0, 0]
): OcShape {
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
  oc: OpenCascadeInstance,
  radius1: number,
  radius2: number,
  height: number,
  center: [number, number, number] = [0, 0, 0],
  direction: [number, number, number] = [0, 0, 1]
): OcShape {
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
 * Creates a torus primitive.
 */
export function makeTorus(
  oc: OpenCascadeInstance,
  majorRadius: number,
  minorRadius: number,
  center: [number, number, number] = [0, 0, 0],
  direction: [number, number, number] = [0, 0, 1]
): OcShape {
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
