/**
 * Standalone shape functions — functional replacements for Shape class methods.
 * All transform functions are immutable: they return new shapes without disposing inputs.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import type { AnyShape, Edge, Face, Wire, Vertex, ShapeKind } from '../core/shapeTypes.js';
import { castShape, getShapeKind } from '../core/shapeTypes.js';
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
// Topology queries (with lazy caching)
// ---------------------------------------------------------------------------

const topoCache = new WeakMap<object, { edges?: Edge[]; faces?: Face[]; wires?: Wire[] }>();

function getOrCreateCache(shape: AnyShape): { edges?: Edge[]; faces?: Face[]; wires?: Wire[] } {
  let entry = topoCache.get(shape.wrapped);
  if (!entry) {
    entry = {};
    topoCache.set(shape.wrapped, entry);
  }
  return entry;
}

/** Get all edges of a shape as branded Edge handles. Results are cached per shape. */
export function getEdges(shape: AnyShape): Edge[] {
  const cache = getOrCreateCache(shape);
  if (cache.edges) return cache.edges;
  const edges = Array.from(iterTopo(shape.wrapped, 'edge')).map(
    (e) => castShape(unwrap(downcast(e))) as Edge
  );
  cache.edges = edges;
  return edges;
}

/** Get all faces of a shape as branded Face handles. Results are cached per shape. */
export function getFaces(shape: AnyShape): Face[] {
  const cache = getOrCreateCache(shape);
  if (cache.faces) return cache.faces;
  const faces = Array.from(iterTopo(shape.wrapped, 'face')).map(
    (e) => castShape(unwrap(downcast(e))) as Face
  );
  cache.faces = faces;
  return faces;
}

/** Get all wires of a shape as branded Wire handles. Results are cached per shape. */
export function getWires(shape: AnyShape): Wire[] {
  const cache = getOrCreateCache(shape);
  if (cache.wires) return cache.wires;
  const wires = Array.from(iterTopo(shape.wrapped, 'wire')).map(
    (e) => castShape(unwrap(downcast(e))) as Wire
  );
  cache.wires = wires;
  return wires;
}

/** Get all vertices of a shape as branded Vertex handles. */
export function getVertices(shape: AnyShape): Vertex[] {
  return Array.from(iterTopo(shape.wrapped, 'vertex')).map(
    (e) => castShape(unwrap(downcast(e))) as Vertex
  );
}

// ---------------------------------------------------------------------------
// Lazy topology iterators (generators)
// ---------------------------------------------------------------------------

/** Lazily iterate edges of a shape, yielding branded Edge handles one at a time. */
export function* iterEdges(shape: AnyShape): Generator<Edge> {
  for (const e of iterTopo(shape.wrapped, 'edge')) {
    yield castShape(unwrap(downcast(e))) as Edge;
  }
}

/** Lazily iterate faces of a shape, yielding branded Face handles one at a time. */
export function* iterFaces(shape: AnyShape): Generator<Face> {
  for (const f of iterTopo(shape.wrapped, 'face')) {
    yield castShape(unwrap(downcast(f))) as Face;
  }
}

/** Lazily iterate wires of a shape, yielding branded Wire handles one at a time. */
export function* iterWires(shape: AnyShape): Generator<Wire> {
  for (const w of iterTopo(shape.wrapped, 'wire')) {
    yield castShape(unwrap(downcast(w))) as Wire;
  }
}

/** Lazily iterate vertices of a shape, yielding branded Vertex handles one at a time. */
export function* iterVertices(shape: AnyShape): Generator<Vertex> {
  for (const v of iterTopo(shape.wrapped, 'vertex')) {
    yield castShape(unwrap(downcast(v))) as Vertex;
  }
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
// Shape description
// ---------------------------------------------------------------------------

/** A summary of a shape's topology, geometry, and validity. */
export interface ShapeDescription {
  readonly kind: ShapeKind;
  readonly faceCount: number;
  readonly edgeCount: number;
  readonly wireCount: number;
  readonly vertexCount: number;
  readonly valid: boolean;
  readonly bounds: Bounds3D;
}

/** Get a quick summary of a shape for debugging and inspection. */
export function describeShape(shape: AnyShape): ShapeDescription {
  return {
    kind: getShapeKind(shape),
    faceCount: getFaces(shape).length,
    edgeCount: getEdges(shape).length,
    wireCount: getWires(shape).length,
    vertexCount: getVertices(shape).length,
    valid: getKernel().isValid(shape.wrapped),
    bounds: getBounds(shape),
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
