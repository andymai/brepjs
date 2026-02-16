/**
 * Standalone shape functions — functional replacements for Shape class methods.
 * All transform functions are immutable: they return new shapes without disposing inputs.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3, MatrixInput } from '../core/types.js';
import type { AnyShape, Edge, Face, Wire, Vertex, ShapeKind } from '../core/shapeTypes.js';
import { castShape, getShapeKind } from '../core/shapeTypes.js';
import { toOcVec, toOcPnt, makeOcAx1, makeOcAx2 } from '../core/occtBoundary.js';
import { HASH_CODE_MAX, DEG2RAD } from '../core/constants.js';
import { downcast, iterTopo } from './cast.js';
import { unwrap } from '../core/result.js';
import { gcWithScope } from '../core/disposal.js';

// ---------------------------------------------------------------------------
// Identity / introspection
// ---------------------------------------------------------------------------

/** Clone a shape (deep copy via TopoDS downcast). */
export function clone<T extends AnyShape>(shape: T): T {
  return castShape(unwrap(downcast(shape.wrapped))) as T;
}

/** Serialize a shape to BREP string format. */
export function toBREP(shape: AnyShape): string {
  const oc = getKernel().oc;
  return oc.BRepToolsWrapper.Write(shape.wrapped);
}

/** Get the topology hash code of a shape. */
export function getHashCode(shape: AnyShape): number {
  return shape.wrapped.HashCode(HASH_CODE_MAX);
}

/** Check if a shape is null. */
export function isEmpty(shape: AnyShape): boolean {
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
export function simplify<T extends AnyShape>(shape: T): T {
  const oc = getKernel().oc;
  const r = gcWithScope();
  const upgrader = r(new oc.ShapeUpgrade_UnifySameDomain_2(shape.wrapped, true, true, false));
  upgrader.Build();
  return castShape(upgrader.Shape()) as T;
}

// ---------------------------------------------------------------------------
// Transforms (immutable — return new shapes, don't dispose inputs)
// ---------------------------------------------------------------------------

/** Translate a shape by a vector. Returns a new shape. */
export function translate<T extends AnyShape>(shape: T, v: Vec3): T {
  const oc = getKernel().oc;
  const trsf = new oc.gp_Trsf_1();
  const vec = toOcVec(v);
  trsf.SetTranslation_1(vec);

  const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, trsf, true);
  const result = castShape(transformer.Shape()) as T;
  propagateOrigins(transformer, [shape], result);
  transformer.delete();
  trsf.delete();
  vec.delete();
  return result;
}

/** Rotate a shape around an axis. Angle is in degrees. Returns a new shape. */
export function rotate<T extends AnyShape>(
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
  propagateOrigins(transformer, [shape], result);
  transformer.delete();
  trsf.delete();
  ax1.delete();
  return result;
}

/** Mirror a shape through a plane defined by origin and normal. Returns a new shape. */
export function mirror<T extends AnyShape>(
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
  propagateOrigins(transformer, [shape], result);
  transformer.delete();
  trsf.delete();
  ax2.delete();
  return result;
}

/** Scale a shape uniformly. Returns a new shape. */
export function scale<T extends AnyShape>(shape: T, factor: number, center: Vec3 = [0, 0, 0]): T {
  const oc = getKernel().oc;
  const trsf = new oc.gp_Trsf_1();
  const pnt = toOcPnt(center);
  trsf.SetScale(pnt, factor);

  const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, trsf, true);
  const result = castShape(transformer.Shape()) as T;
  propagateOrigins(transformer, [shape], result);
  transformer.delete();
  trsf.delete();
  pnt.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Matrix transform (OpenSCAD multmatrix equivalent)
// ---------------------------------------------------------------------------

/**
 * Parse a MatrixInput into a 3x3 linear part and translation vector.
 * Validates the bottom row of a Matrix4x4.
 */
function parseMatrixInput(input: MatrixInput): {
  linear: readonly [number, number, number, number, number, number, number, number, number];
  translation: readonly [number, number, number];
} {
  if ('linear' in input) {
    return { linear: input.linear, translation: input.translation };
  }

  const [r0, r1, r2, r3] = input;
  const TOL = 1e-10;
  if (
    Math.abs(r3[0]) > TOL ||
    Math.abs(r3[1]) > TOL ||
    Math.abs(r3[2]) > TOL ||
    Math.abs(r3[3] - 1) > TOL
  ) {
    throw new Error(
      `applyMatrix: invalid bottom row [${String(r3[0])}, ${String(r3[1])}, ${String(r3[2])}, ${String(r3[3])}]. Must be [0, 0, 0, 1] for an affine transform.`
    );
  }

  return {
    linear: [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]],
    translation: [r0[3], r1[3], r2[3]],
  };
}

/** Determinant of a 3x3 matrix given as 9 row-major values. */
function det3x3(
  m: readonly [number, number, number, number, number, number, number, number, number]
): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/**
 * Check if a 3x3 matrix is orthogonal (possibly with uniform scale).
 * M is orthogonal-with-scale if M^T * M = s^2 * I for some scalar s.
 */
function isOrthogonalMatrix(
  m: readonly [number, number, number, number, number, number, number, number, number]
): boolean {
  const TOL = 1e-8;

  // Compute M^T * M directly: (M^T*M)[i][j] = col_i · col_j
  // Columns of M (row-major): col0 = [m[0],m[3],m[6]], col1 = [m[1],m[4],m[7]], col2 = [m[2],m[5],m[8]]
  const d00 = m[0] * m[0] + m[3] * m[3] + m[6] * m[6];
  const d11 = m[1] * m[1] + m[4] * m[4] + m[7] * m[7];
  const d22 = m[2] * m[2] + m[5] * m[5] + m[8] * m[8];
  const d01 = m[0] * m[1] + m[3] * m[4] + m[6] * m[7];
  const d02 = m[0] * m[2] + m[3] * m[5] + m[6] * m[8];
  const d12 = m[1] * m[2] + m[4] * m[5] + m[7] * m[8];

  // Off-diagonal must be ≈ 0
  if (Math.abs(d01) > TOL) return false;
  if (Math.abs(d02) > TOL) return false;
  if (Math.abs(d12) > TOL) return false;

  // Diagonal elements must be equal (uniform scale)
  if (Math.abs(d00 - d11) > TOL) return false;
  if (Math.abs(d00 - d22) > TOL) return false;

  return true;
}

/**
 * Apply a 4x4 affine transformation matrix to a shape.
 * Equivalent to OpenSCAD's `multmatrix`.
 *
 * Uses the fast `gp_Trsf` path for orthogonal matrices (rotation, uniform scale, mirror)
 * and the general `gp_GTrsf` path for non-orthogonal transforms (shear, non-uniform scale).
 */
export function applyMatrix<T extends AnyShape>(shape: T, matrix: MatrixInput): T {
  const { linear, translation } = parseMatrixInput(matrix);

  const d = det3x3(linear);
  if (Math.abs(d) < 1e-12) {
    throw new Error(
      'applyMatrix: singular matrix (determinant ≈ 0). Cannot apply a non-invertible transform.'
    );
  }

  const oc = getKernel().oc;
  const orthogonal = isOrthogonalMatrix(linear);

  if (orthogonal) {
    const trsf = new oc.gp_Trsf_1();
    trsf.SetValues(
      linear[0],
      linear[1],
      linear[2],
      translation[0],
      linear[3],
      linear[4],
      linear[5],
      translation[1],
      linear[6],
      linear[7],
      linear[8],
      translation[2]
    );
    const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, trsf, true);
    const result = castShape(transformer.Shape()) as T;
    propagateOrigins(transformer, [shape], result);
    transformer.delete();
    trsf.delete();
    return result;
  }

  // General path: gp_GTrsf for non-orthogonal transforms
  // Requires BRepBuilderAPI_GTransform in the WASM build (see build-config/*.yml)
  /* v8 ignore start -- untestable until WASM is rebuilt with BRepBuilderAPI_GTransform */
  const gtrsf = new oc.gp_GTrsf_1();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      gtrsf.SetValue(row + 1, col + 1, linear[row * 3 + col]);
    }
  }
  const xyz = new oc.gp_XYZ_2(translation[0], translation[1], translation[2]);
  gtrsf.SetTranslationPart(xyz);
  xyz.delete();

  const transformer = new oc.BRepBuilderAPI_GTransform_2(shape.wrapped, gtrsf, true);
  const result = castShape(transformer.Shape()) as T;
  propagateOrigins(transformer, [shape], result);
  transformer.delete();
  gtrsf.delete();
  return result;
  /* v8 ignore stop */
}

// ---------------------------------------------------------------------------
// Composed transform + copy
// ---------------------------------------------------------------------------

/** A single transform operation: translate or rotate. */
export type TransformOp =
  | { readonly type: 'translate'; readonly v: Vec3 }
  | {
      readonly type: 'rotate';
      readonly angle: number;
      readonly axis?: Vec3;
      readonly center?: Vec3;
    };

/** An OCCT gp_Trsf with a cleanup function. Call `cleanup()` when done. */
export interface ComposedTransform {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT WASM type
  readonly trsf: any;
  readonly cleanup: () => void;
}

/**
 * Compose multiple translate/rotate operations into a single OCCT gp_Trsf.
 * Operations are applied in order (first element applied first).
 * Call `.cleanup()` on the result when done to free the OCCT object.
 */
export function composeTransforms(ops: readonly TransformOp[]): ComposedTransform {
  const oc = getKernel().oc;
  const result = new oc.gp_Trsf_1();

  for (const op of ops) {
    const step = new oc.gp_Trsf_1();
    if (op.type === 'translate') {
      const vec = toOcVec(op.v);
      step.SetTranslation_1(vec);
      vec.delete();
    } else {
      const ax1 = makeOcAx1(op.center ?? [0, 0, 0], op.axis ?? [0, 0, 1]);
      step.SetRotation_1(ax1, op.angle * DEG2RAD);
      ax1.delete();
    }
    result.PreMultiply(step);
    step.delete();
  }

  return { trsf: result, cleanup: () => result.delete() };
}

/**
 * Clone a shape and apply a pre-composed transform in a single OCCT operation.
 * Much faster than separate clone() + translate() + rotate() calls.
 */
export function transformCopy<T extends AnyShape>(shape: T, composed: ComposedTransform): T {
  const oc = getKernel().oc;
  const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, composed.trsf, true);
  const result = castShape(transformer.Shape()) as T;
  propagateOrigins(transformer, [shape], result);
  transformer.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Topology queries (with lazy caching)
// ---------------------------------------------------------------------------

const topoCache = new WeakMap<
  object,
  { edges?: Edge[]; faces?: Face[]; wires?: Wire[]; faceOrigins?: Map<number, number> }
>();

function getOrCreateCache(shape: AnyShape) {
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

/**
 * Tag all faces of a shape with an opaque integer origin.
 * Consumers assign meaning (e.g., source line number).
 */
export function setShapeOrigin(shape: AnyShape, origin: number): void {
  const cache = getOrCreateCache(shape);
  const map = new Map<number, number>();
  for (const f of getFaces(shape)) {
    map.set(f.wrapped.HashCode(HASH_CODE_MAX), origin);
  }
  cache.faceOrigins = map;
}

/**
 * Get the face origin map for a shape (faceHash → originTag).
 * Returns undefined if no origins have been set or propagated.
 */
export function getFaceOrigins(shape: AnyShape): Map<number, number> | undefined {
  return topoCache.get(shape.wrapped)?.faceOrigins;
}

// ---------------------------------------------------------------------------
// Origin propagation
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- OCCT WASM types are dynamically typed */
type OcMakeShapeLike = {
  Modified(s: any): any;
  Generated(s: any): any;
  IsDeleted?(s: any): boolean;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Iterate a TopTools_ListOfShape by copying it and consuming the copy.
 * This avoids needing TopTools_ListIteratorOfListOfShape (not in WASM bindings).
 */
function iterOcList(
  list: { Size(): number; First_1(): { HashCode(max: number): number } },
  callback: (item: { HashCode(max: number): number }) => void
): void {
  const oc = getKernel().oc;
  const copy = new oc.TopTools_ListOfShape_3(list);
  while (copy.Size() > 0) {
    callback(copy.First_1());
    copy.RemoveFirst();
  }
  copy.delete();
}

/**
 * Propagate face origins from input shapes to a result shape
 * using an OCCT operation's Modified/Generated history.
 *
 * @param op - OCCT operation with Modified/Generated methods (alive, not yet deleted)
 * @param inputs - Source shapes whose face origins should propagate
 * @param result - The result shape to populate origins on
 */
export function propagateOrigins(op: OcMakeShapeLike, inputs: AnyShape[], result: AnyShape): void {
  // Collect all input face origins
  const inputOrigins: Array<{ face: { HashCode(max: number): number }; origin: number }> = [];
  for (const input of inputs) {
    const origins = getFaceOrigins(input);
    if (!origins) continue;
    for (const f of getFaces(input)) {
      const hash = f.wrapped.HashCode(HASH_CODE_MAX);
      const origin = origins.get(hash);
      if (origin !== undefined) {
        inputOrigins.push({ face: f.wrapped, origin });
      }
    }
  }

  if (inputOrigins.length === 0) return;

  const resultMap = new Map<number, number>();

  for (const { face, origin } of inputOrigins) {
    if (op.IsDeleted?.(face)) continue;

    const modifiedList = op.Modified(face);
    if (modifiedList.Size() > 0) {
      iterOcList(modifiedList, (modFace) => {
        resultMap.set(modFace.HashCode(HASH_CODE_MAX), origin);
      });
    } else {
      // Face was not modified — use its original hash (it may survive unchanged)
      resultMap.set(face.HashCode(HASH_CODE_MAX), origin);
    }

    const generatedList = op.Generated(face);
    if (generatedList.Size() > 0) {
      iterOcList(generatedList, (genFace) => {
        const hash = genFace.HashCode(HASH_CODE_MAX);
        if (!resultMap.has(hash)) {
          resultMap.set(hash, 0);
        }
      });
    }
  }

  if (resultMap.size > 0) {
    const cache = getOrCreateCache(result);
    cache.faceOrigins = resultMap;
  }
}

/**
 * Fallback origin propagation when no OCCT op object is available.
 * Matches result faces to input faces by hash code (works for unmodified faces only).
 */
export function propagateOriginsByHash(inputs: AnyShape[], result: AnyShape): void {
  const lookup = new Map<number, number>();
  for (const input of inputs) {
    const origins = getFaceOrigins(input);
    if (!origins) continue;
    for (const [hash, origin] of origins) {
      lookup.set(hash, origin);
    }
  }
  if (lookup.size === 0) return;

  const resultMap = new Map<number, number>();
  for (const f of getFaces(result)) {
    const hash = f.wrapped.HashCode(HASH_CODE_MAX);
    const origin = lookup.get(hash);
    if (origin !== undefined) {
      resultMap.set(hash, origin);
    }
  }

  if (resultMap.size > 0) {
    const cache = getOrCreateCache(result);
    cache.faceOrigins = resultMap;
  }
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
export function describe(shape: AnyShape): ShapeDescription {
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
