/**
 * Standalone shape functions — functional replacements for Shape class methods.
 * All transform functions are immutable: they return new shapes without disposing inputs.
 */

import { getKernel } from '../kernel/index.js';
import type { ShapeEvolution } from '../kernel/types.js';
import type { Vec3, MatrixInput } from '../core/types.js';
import type {
  AnyShape,
  Dimension,
  Edge,
  Face,
  Wire,
  Vertex,
  ShapeKind,
} from '../core/shapeTypes.js';
import { castShape, getShapeKind } from '../core/shapeTypes.js';
import { HASH_CODE_MAX, DEG2RAD } from '../core/constants.js';
import { downcast, iterTopo } from './cast.js';
import { unwrap } from '../core/result.js';

// ---------------------------------------------------------------------------
// Identity / introspection
// ---------------------------------------------------------------------------

/** Clone a shape (deep copy via kernel topology downcast). */
export function clone<T extends AnyShape<Dimension>>(shape: T): T {
  return castShape(unwrap(downcast(shape.wrapped))) as T;
}

/** Serialize a shape to BREP string format. */
export function toBREP(shape: AnyShape<Dimension>): string {
  return getKernel().toBREP(shape.wrapped);
}

/** Get the topology hash code of a shape. */
export function getHashCode(shape: AnyShape<Dimension>): number {
  return getKernel().hashCode(shape.wrapped, HASH_CODE_MAX);
}

/** Check if a shape is null. */
export function isEmpty(shape: AnyShape<Dimension>): boolean {
  return getKernel().isNull(shape.wrapped);
}

/** Check if two shapes are the same topological entity. */
export function isSameShape(a: AnyShape<Dimension>, b: AnyShape<Dimension>): boolean {
  return getKernel().isSame(a.wrapped, b.wrapped);
}

/** Check if two shapes are geometrically equal. */
export function isEqualShape(a: AnyShape<Dimension>, b: AnyShape<Dimension>): boolean {
  return getKernel().isEqual(a.wrapped, b.wrapped);
}

/** Simplify a shape by merging same-domain faces/edges. Returns a new shape. */
export function simplify<T extends AnyShape<Dimension>>(shape: T): T {
  return castShape(getKernel().simplify(shape.wrapped)) as T;
}

// ---------------------------------------------------------------------------
// Helper: collect tracked face hashes from input shapes
// ---------------------------------------------------------------------------

/** Collect all face hashes that have origin tracking, for passing to WithHistory kernel methods. */
function collectInputFaceHashes(inputs: AnyShape<Dimension>[]): number[] {
  const hashes: number[] = [];
  for (const input of inputs) {
    const origins = getFaceOrigins(input);
    if (!origins) continue;
    for (const hash of origins.keys()) {
      hashes.push(hash);
    }
  }
  return hashes;
}

// ---------------------------------------------------------------------------
// Transforms (immutable — return new shapes, don't dispose inputs)
// ---------------------------------------------------------------------------

/** Translate a shape by a vector. Returns a new shape. */
export function translate<T extends AnyShape<Dimension>>(shape: T, v: Vec3): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().translateWithHistory(
    shape.wrapped,
    v[0],
    v[1],
    v[2],
    inputFaceHashes,
    HASH_CODE_MAX
  );
  const result = castShape(resultShape) as T;
  propagateOriginsFromEvolution(evolution, [shape], result);
  return result;
}

/** Rotate a shape around an axis. Angle is in degrees. Returns a new shape. */
export function rotate<T extends AnyShape<Dimension>>(
  shape: T,
  angle: number,
  position: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().rotateWithHistory(
    shape.wrapped,
    angle * DEG2RAD,
    inputFaceHashes,
    HASH_CODE_MAX,
    direction as [number, number, number],
    position as [number, number, number]
  );
  const result = castShape(resultShape) as T;
  propagateOriginsFromEvolution(evolution, [shape], result);
  return result;
}

/** Mirror a shape through a plane defined by origin and normal. Returns a new shape. */
export function mirror<T extends AnyShape<Dimension>>(
  shape: T,
  planeNormal: Vec3 = [0, 1, 0],
  planeOrigin: Vec3 = [0, 0, 0]
): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().mirrorWithHistory(
    shape.wrapped,
    planeOrigin as [number, number, number],
    planeNormal as [number, number, number],
    inputFaceHashes,
    HASH_CODE_MAX
  );
  const result = castShape(resultShape) as T;
  propagateOriginsFromEvolution(evolution, [shape], result);
  return result;
}

/** Scale a shape uniformly. Returns a new shape. */
export function scale<T extends AnyShape<Dimension>>(
  shape: T,
  factor: number,
  center: Vec3 = [0, 0, 0]
): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().scaleWithHistory(
    shape.wrapped,
    center as [number, number, number],
    factor,
    inputFaceHashes,
    HASH_CODE_MAX
  );
  const result = castShape(resultShape) as T;
  propagateOriginsFromEvolution(evolution, [shape], result);
  return result;
}

/** Resize a shape to exact target dimensions with optional auto-proportional scaling. */
export function resize<T extends AnyShape<Dimension>>(
  shape: T,
  dimensions: [number | undefined, number | undefined, number | undefined],
  options?: { auto?: boolean }
): T {
  const bbox = getKernel().boundingBox(shape.wrapped);
  const size: [number, number, number] = [
    bbox.max[0] - bbox.min[0],
    bbox.max[1] - bbox.min[1],
    bbox.max[2] - bbox.min[2],
  ];

  const auto = options?.auto === true;

  function factor(dim: number | undefined, sz: number, baseFactor: number): number {
    if (dim !== undefined && sz > 1e-12) return dim / sz;
    if (dim === undefined && auto) return baseFactor;
    return 1;
  }

  // Find auto-proportional factor from first defined dimension
  let autoFactor = 1;
  if (auto) {
    if (dimensions[0] !== undefined && size[0] > 1e-12) autoFactor = dimensions[0] / size[0];
    else if (dimensions[1] !== undefined && size[1] > 1e-12) autoFactor = dimensions[1] / size[1];
    else if (dimensions[2] !== undefined && size[2] > 1e-12) autoFactor = dimensions[2] / size[2];
  }

  const factors: [number, number, number] = [
    factor(dimensions[0], size[0], autoFactor),
    factor(dimensions[1], size[1], autoFactor),
    factor(dimensions[2], size[2], autoFactor),
  ];

  // Check if all factors are approximately equal (uniform scale)
  // Use relative tolerance since kernel bounding box has floating-point noise
  const isUniform =
    Math.abs(factors[0] - factors[1]) < 1e-6 && Math.abs(factors[1] - factors[2]) < 1e-6;

  if (!isUniform) {
    throw new Error(
      'resize: non-uniform scaling is not supported (WASM build lacks BRepBuilderAPI_GTransform). ' +
        'Use auto: true to scale proportionally, or set all three dimensions to achieve uniform scaling.'
    );
  }

  return scale(shape, factors[0]);
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
 * Uses the fast `kernel transform` path for orthogonal matrices (rotation, uniform scale, mirror)
 * and the general `gp_GTrsf` path for non-orthogonal transforms (shear, non-uniform scale).
 */
export function applyMatrix<T extends AnyShape<Dimension>>(shape: T, matrix: MatrixInput): T {
  const { linear, translation } = parseMatrixInput(matrix);

  const d = det3x3(linear);
  if (Math.abs(d) < 1e-12) {
    throw new Error(
      'applyMatrix: singular matrix (determinant ≈ 0). Cannot apply a non-invertible transform.'
    );
  }

  const orthogonal = isOrthogonalMatrix(linear);

  if (orthogonal) {
    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().generalTransformWithHistory(
      shape.wrapped,
      linear,
      translation,
      true,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    const result = castShape(resultShape) as T;
    propagateOriginsFromEvolution(evolution, [shape], result);
    return result;
  }

  // General path: gp_GTrsf for non-orthogonal transforms
  // Requires BRepBuilderAPI_GTransform in the WASM build (see build-config/*.yml)
  /* v8 ignore start -- untestable until WASM is rebuilt with BRepBuilderAPI_GTransform */
  const resultShape = getKernel().generalTransformNonOrthogonal(shape.wrapped, linear, translation);
  const result = castShape(resultShape) as T;
  propagateOriginsByHash([shape], result);
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

/** An kernel kernel transform with a cleanup function. Call `cleanup()` when done. */
export interface ComposedTransform {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel WASM type
  readonly trsf: any;
  readonly cleanup: () => void;
}

/**
 * Compose multiple translate/rotate operations into a single kernel kernel transform.
 * Operations are applied in order (first element applied first).
 * Call `.cleanup()` on the result when done to free the kernel object.
 */
export function composeTransforms(ops: readonly TransformOp[]): ComposedTransform {
  const kernelOps = ops.map((op) => {
    if (op.type === 'translate') {
      return { type: 'translate' as const, x: op.v[0], y: op.v[1], z: op.v[2] };
    }
    return {
      type: 'rotate' as const,
      angle: op.angle,
      axis: op.axis ? ([...op.axis] as [number, number, number]) : undefined,
      center: op.center ? ([...op.center] as [number, number, number]) : undefined,
    };
  });
  const { handle, dispose } = getKernel().composeTransform(kernelOps);
  return { trsf: handle, cleanup: dispose };
}

/**
 * Clone a shape and apply a pre-composed transform in a single kernel operation.
 * Much faster than separate clone() + translate() + rotate() calls.
 */
export function transformCopy<T extends AnyShape<Dimension>>(
  shape: T,
  composed: ComposedTransform
): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().applyComposedTransformWithHistory(
    shape.wrapped,
    composed.trsf,
    inputFaceHashes,
    HASH_CODE_MAX
  );
  const result = castShape(resultShape) as T;
  propagateOriginsFromEvolution(evolution, [shape], result);
  return result;
}

// ---------------------------------------------------------------------------
// Topology queries (with lazy caching)
// ---------------------------------------------------------------------------

const topoCache = new WeakMap<
  object,
  {
    edges?: Edge<Dimension>[];
    faces?: Face<Dimension>[];
    wires?: Wire<Dimension>[];
    vertices?: Vertex<Dimension>[];
    faceOrigins?: Map<number, number>;
    bounds?: Bounds3D;
  }
>();

function getOrCreateCache(shape: AnyShape<Dimension>) {
  let entry = topoCache.get(shape.wrapped);
  if (!entry) {
    entry = {};
    topoCache.set(shape.wrapped, entry);
  }
  return entry;
}

/**
 * Invalidate cached topology data for a shape.
 * Call this after operations that modify a shape in-place (e.g., unifyFaces).
 */
export function invalidateShapeCache(shape: AnyShape<Dimension>): void {
  topoCache.delete(shape.wrapped);
}

/** Get all edges of a shape as branded Edge handles. Results are cached per shape. */
export function getEdges<D extends Dimension>(shape: AnyShape<D>): Edge<D>[] {
  const cache = getOrCreateCache(shape);
  if (cache.edges) return cache.edges as Edge<D>[];
  const edges = Array.from(iterTopo(shape.wrapped, 'edge')).map(
    (e) => castShape(unwrap(downcast(e))) as Edge<D>
  );
  cache.edges = edges;
  return edges;
}

/**
 * Get all faces of a shape. Results are cached per shape.
 *
 * Returns `Face[]` — use `isOrientedFace()` or `orientedFace()` to narrow
 * individual faces to `OrientedFace` when the orientation guarantee is needed.
 */
export function getFaces<D extends Dimension>(shape: AnyShape<D>): Face<D>[] {
  const cache = getOrCreateCache(shape);
  if (cache.faces) return cache.faces as Face<D>[];
  const faces = Array.from(iterTopo(shape.wrapped, 'face')).map(
    (e) => castShape(unwrap(downcast(e))) as Face<D>
  );
  cache.faces = faces;
  return faces;
}

/** Get all wires of a shape as branded Wire handles. Results are cached per shape. */
export function getWires<D extends Dimension>(shape: AnyShape<D>): Wire<D>[] {
  const cache = getOrCreateCache(shape);
  if (cache.wires) return cache.wires as Wire<D>[];
  const wires = Array.from(iterTopo(shape.wrapped, 'wire')).map(
    (e) => castShape(unwrap(downcast(e))) as Wire<D>
  );
  cache.wires = wires;
  return wires;
}

/**
 * Tag all faces of a shape with an opaque integer origin.
 * Consumers assign meaning (e.g., source line number).
 */
export function setShapeOrigin(shape: AnyShape<Dimension>, origin: number): void {
  const cache = getOrCreateCache(shape);
  const map = new Map<number, number>();
  for (const f of getFaces(shape)) {
    map.set(getKernel().hashCode(f.wrapped, HASH_CODE_MAX), origin);
  }
  cache.faceOrigins = map;
}

/**
 * Get the face origin map for a shape (faceHash → originTag).
 * Returns undefined if no origins have been set or propagated.
 */
export function getFaceOrigins(shape: AnyShape<Dimension>): Map<number, number> | undefined {
  return topoCache.get(shape.wrapped)?.faceOrigins;
}

// ---------------------------------------------------------------------------
// Origin propagation
// ---------------------------------------------------------------------------

/**
 * Propagate face origins using a kernel-provided ShapeEvolution record.
 */
export function propagateOriginsFromEvolution(
  evolution: ShapeEvolution,
  inputs: AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  // Collect all input face origins
  const inputOrigins = new Map<number, number>();
  for (const input of inputs) {
    const origins = getFaceOrigins(input);
    if (!origins) continue;
    for (const [hash, origin] of origins) {
      inputOrigins.set(hash, origin);
    }
  }
  if (inputOrigins.size === 0) return;

  const resultMap = new Map<number, number>();

  for (const [hash, origin] of inputOrigins) {
    if (evolution.deleted.has(hash)) continue;

    const modifiedHashes = evolution.modified.get(hash);
    if (modifiedHashes && modifiedHashes.length > 0) {
      for (const modHash of modifiedHashes) {
        resultMap.set(modHash, origin);
      }
    } else {
      // Face was not modified — reuse original hash
      resultMap.set(hash, origin);
    }

    const generatedHashes = evolution.generated.get(hash);
    if (generatedHashes) {
      for (const genHash of generatedHashes) {
        if (!resultMap.has(genHash)) {
          resultMap.set(genHash, 0);
        }
      }
    }
  }

  if (resultMap.size > 0) {
    const cache = getOrCreateCache(result);
    cache.faceOrigins = resultMap;
  }
}

/**
 * Fallback origin propagation when no kernel op object is available.
 * Matches result faces to input faces by hash code first; if no hash matches
 * are found, falls back to geometric matching (normal + centroid comparison).
 */
export function propagateOriginsByHash(
  inputs: AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  const lookup = new Map<number, number>();
  for (const input of inputs) {
    const origins = getFaceOrigins(input);
    if (!origins) continue;
    for (const [hash, origin] of origins) {
      lookup.set(hash, origin);
    }
  }
  if (lookup.size === 0) return;

  const kernel = getKernel();
  const resultMap = new Map<number, number>();
  const resultFaces = getFaces(result);

  // Try hash-based matching first
  for (const f of resultFaces) {
    const hash = kernel.hashCode(f.wrapped, HASH_CODE_MAX);
    const origin = lookup.get(hash);
    if (origin !== undefined) {
      resultMap.set(hash, origin);
    }
  }

  // Geometric fallback: when hash matching finds nothing, match by normal + centroid
  // This path only triggers with brepkit (arena-based face IDs) — not covered by OCCT tests
  /* v8 ignore start */
  if (resultMap.size === 0) {
    // Collect input face signatures
    const inputSigs: {
      origin: number;
      normal: [number, number, number];
      centroid: [number, number, number];
    }[] = [];
    for (const input of inputs) {
      const origins = getFaceOrigins(input);
      if (!origins) continue;
      for (const f of getFaces(input)) {
        const hash = kernel.hashCode(f.wrapped, HASH_CODE_MAX);
        const origin = origins.get(hash);
        if (origin === undefined) continue;
        try {
          const bounds = kernel.uvBounds(f.wrapped);
          const normal = kernel.surfaceNormal(
            f.wrapped,
            0.5 * (bounds.uMin + bounds.uMax),
            0.5 * (bounds.vMin + bounds.vMax)
          );
          const centroid = kernel.surfaceCenterOfMass(f.wrapped);
          inputSigs.push({ origin, normal, centroid });
        } catch {
          // skip faces that can't compute normal/centroid
        }
      }
    }

    if (inputSigs.length > 0) {
      for (const f of resultFaces) {
        const hash = kernel.hashCode(f.wrapped, HASH_CODE_MAX);
        try {
          const outBounds = kernel.uvBounds(f.wrapped);
          const outNormal = kernel.surfaceNormal(
            f.wrapped,
            0.5 * (outBounds.uMin + outBounds.uMax),
            0.5 * (outBounds.vMin + outBounds.vMax)
          );
          const outCentroid = kernel.surfaceCenterOfMass(f.wrapped);

          let bestScore = -Infinity;
          let bestOrigin: number | undefined;
          for (const inp of inputSigs) {
            const dot =
              outNormal[0] * inp.normal[0] +
              outNormal[1] * inp.normal[1] +
              outNormal[2] * inp.normal[2];
            if (dot < 0.707) continue;
            const dx = outCentroid[0] - inp.centroid[0];
            const dy = outCentroid[1] - inp.centroid[1];
            const dz = outCentroid[2] - inp.centroid[2];
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq > 100) continue;
            const score = dot - distSq / 100;
            if (score > bestScore) {
              bestScore = score;
              bestOrigin = inp.origin;
            }
          }
          if (bestOrigin !== undefined) {
            resultMap.set(hash, bestOrigin);
          }
        } catch {
          // skip faces that can't compute normal/centroid
        }
      }
    }
  }
  /* v8 ignore stop */

  if (resultMap.size > 0) {
    const cache = getOrCreateCache(result);
    cache.faceOrigins = resultMap;
  }
}

/** Get all vertices of a shape as branded Vertex handles. Results are cached per shape. */
export function getVertices<D extends Dimension>(shape: AnyShape<D>): Vertex<D>[] {
  const cache = getOrCreateCache(shape);
  if (cache.vertices) return cache.vertices as Vertex<D>[];
  const vertices = Array.from(iterTopo(shape.wrapped, 'vertex')).map(
    (e) => castShape(unwrap(downcast(e))) as Vertex<D>
  );
  cache.vertices = vertices;
  return vertices;
}

// ---------------------------------------------------------------------------
// Lazy topology iterators (generators)
// ---------------------------------------------------------------------------

/** Lazily iterate edges of a shape, yielding branded Edge handles one at a time. */
export function* iterEdges<D extends Dimension>(shape: AnyShape<D>): Generator<Edge<D>> {
  for (const e of iterTopo(shape.wrapped, 'edge')) {
    yield castShape(unwrap(downcast(e))) as Edge<D>;
  }
}

/** Lazily iterate faces of a shape, yielding branded Face handles one at a time. */
export function* iterFaces<D extends Dimension>(shape: AnyShape<D>): Generator<Face<D>> {
  for (const f of iterTopo(shape.wrapped, 'face')) {
    yield castShape(unwrap(downcast(f))) as Face<D>;
  }
}

/** Lazily iterate wires of a shape, yielding branded Wire handles one at a time. */
export function* iterWires<D extends Dimension>(shape: AnyShape<D>): Generator<Wire<D>> {
  for (const w of iterTopo(shape.wrapped, 'wire')) {
    yield castShape(unwrap(downcast(w))) as Wire<D>;
  }
}

/** Lazily iterate vertices of a shape, yielding branded Vertex handles one at a time. */
export function* iterVertices<D extends Dimension>(shape: AnyShape<D>): Generator<Vertex<D>> {
  for (const v of iterTopo(shape.wrapped, 'vertex')) {
    yield castShape(unwrap(downcast(v))) as Vertex<D>;
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

/** Get the axis-aligned bounding box of a shape. Cached per shape. */
export function getBounds(shape: AnyShape<Dimension>): Bounds3D {
  const cache = getOrCreateCache(shape);
  if (cache.bounds) return cache.bounds;
  const { min, max } = getKernel().boundingBox(shape.wrapped);
  const bounds: Bounds3D = {
    xMin: min[0],
    xMax: max[0],
    yMin: min[1],
    yMax: max[1],
    zMin: min[2],
    zMax: max[2],
  };
  cache.bounds = bounds;
  return bounds;
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
export function describe(shape: AnyShape<Dimension>): ShapeDescription {
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
  return getKernel().vertexPosition(vertex.wrapped);
}
