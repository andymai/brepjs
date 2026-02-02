/**
 * Standalone shape functions — functional replacements for Shape class methods.
 * All transform functions are immutable: they return new shapes without disposing inputs.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import type { AnyShape, Edge, Face, Wire, Vertex } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { toOcVec, toOcPnt, makeOcAx1, makeOcAx2 } from '../core/occtBoundary.js';
import { HASH_CODE_MAX, DEG2RAD } from '../core/constants.js';
import { downcast, iterTopo } from './cast.js';
import { unwrap } from '../core/result.js';

// ---------------------------------------------------------------------------
// Identity / introspection
// ---------------------------------------------------------------------------

/** Clone a shape (deep copy via TopoDS downcast). */
export function cloneShape<T extends AnyShape>(shape: T): T {
  return castShape(unwrap(downcast(shape.wrapped))) as T;
}

/** Serialize a shape to BREP string format. */
export function serializeShape(shape: AnyShape): string {
  const oc = getKernel().oc;
  return oc.BRepToolsWrapper.Write(shape.wrapped);
}

/** Get the topology hash code of a shape. */
export function getHashCode(shape: AnyShape): number {
  return shape.wrapped.HashCode(HASH_CODE_MAX);
}

/** Check if a shape is null. */
export function isShapeNull(shape: AnyShape): boolean {
  return shape.wrapped.IsNull();
}

/** Check if two shapes are the same topological entity. */
export function isSameShape(a: AnyShape, b: AnyShape): boolean {
  return a.wrapped.IsSame(b.wrapped);
}

/** Check if two shapes are geometrically equal. */
export function isEqualShape(a: AnyShape, b: AnyShape): boolean {
  return a.wrapped.IsEqual(b.wrapped);
}

/** Simplify a shape by merging same-domain faces/edges. Returns a new shape. */
export function simplifyShape<T extends AnyShape>(shape: T): T {
  const oc = getKernel().oc;
  const upgrader = new oc.ShapeUpgrade_UnifySameDomain_2(shape.wrapped, true, true, false);
  upgrader.Build();
  const result = castShape(upgrader.Shape()) as T;
  upgrader.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Transforms (immutable — return new shapes, don't dispose inputs)
// ---------------------------------------------------------------------------

/** Translate a shape by a vector. Returns a new shape. */
export function translateShape<T extends AnyShape>(shape: T, v: Vec3): T {
  const oc = getKernel().oc;
  const trsf = new oc.gp_Trsf_1();
  const vec = toOcVec(v);
  trsf.SetTranslation_1(vec);

  const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, trsf, true);
  const result = castShape(transformer.Shape()) as T;
  transformer.delete();
  trsf.delete();
  vec.delete();
  return result;
}

/** Rotate a shape around an axis. Angle is in degrees. Returns a new shape. */
export function rotateShape<T extends AnyShape>(
  shape: T,
  angle: number,
  position: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): T {
  const oc = getKernel().oc;
  const trsf = new oc.gp_Trsf_1();
  const ax1 = makeOcAx1(position, direction);
  trsf.SetRotation_1(ax1, angle * DEG2RAD);

  const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, trsf, true);
  const result = castShape(transformer.Shape()) as T;
  transformer.delete();
  trsf.delete();
  ax1.delete();
  return result;
}

/** Mirror a shape through a plane defined by origin and normal. Returns a new shape. */
export function mirrorShape<T extends AnyShape>(
  shape: T,
  planeNormal: Vec3 = [0, 1, 0],
  planeOrigin: Vec3 = [0, 0, 0]
): T {
  const oc = getKernel().oc;
  const trsf = new oc.gp_Trsf_1();
  const ax2 = makeOcAx2(planeOrigin, planeNormal);
  trsf.SetMirror_3(ax2);

  const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, trsf, true);
  const result = castShape(transformer.Shape()) as T;
  transformer.delete();
  trsf.delete();
  ax2.delete();
  return result;
}

/** Scale a shape uniformly. Returns a new shape. */
export function scaleShape<T extends AnyShape>(
  shape: T,
  factor: number,
  center: Vec3 = [0, 0, 0]
): T {
  const oc = getKernel().oc;
  const trsf = new oc.gp_Trsf_1();
  const pnt = toOcPnt(center);
  trsf.SetScale(pnt, factor);

  const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, trsf, true);
  const result = castShape(transformer.Shape()) as T;
  transformer.delete();
  trsf.delete();
  pnt.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Topology queries
// ---------------------------------------------------------------------------

/** Get all edges of a shape as branded Edge handles. */
export function getEdges(shape: AnyShape): Edge[] {
  return Array.from(iterTopo(shape.wrapped, 'edge')).map(
    (e) => castShape(unwrap(downcast(e))) as Edge
  );
}

/** Get all faces of a shape as branded Face handles. */
export function getFaces(shape: AnyShape): Face[] {
  return Array.from(iterTopo(shape.wrapped, 'face')).map(
    (e) => castShape(unwrap(downcast(e))) as Face
  );
}

/** Get all wires of a shape as branded Wire handles. */
export function getWires(shape: AnyShape): Wire[] {
  return Array.from(iterTopo(shape.wrapped, 'wire')).map(
    (e) => castShape(unwrap(downcast(e))) as Wire
  );
}

/** Bounding box as a plain object. */
export interface Bounds3D {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

/** Get the axis-aligned bounding box of a shape. */
export function getBounds(shape: AnyShape): Bounds3D {
  const oc = getKernel().oc;
  const bbox = new oc.Bnd_Box_1();
  oc.BRepBndLib.Add(shape.wrapped, bbox, true);

  const xMin = { current: 0 };
  const yMin = { current: 0 };
  const zMin = { current: 0 };
  const xMax = { current: 0 };
  const yMax = { current: 0 };
  const zMax = { current: 0 };
  bbox.Get(xMin, yMin, zMin, xMax, yMax, zMax);
  bbox.delete();

  return {
    xMin: xMin.current,
    xMax: xMax.current,
    yMin: yMin.current,
    yMax: yMax.current,
    zMin: zMin.current,
    zMax: zMax.current,
  };
}

// ---------------------------------------------------------------------------
// Vertex
// ---------------------------------------------------------------------------

/** Get the position of a vertex as a Vec3 tuple. */
export function vertexPosition(vertex: Vertex): Vec3 {
  const oc = getKernel().oc;
  const pnt = oc.BRep_Tool.Pnt(vertex.wrapped);
  const result: Vec3 = [pnt.X(), pnt.Y(), pnt.Z()];
  pnt.delete();
  return result;
}
