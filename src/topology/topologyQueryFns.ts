/**
 * Topology query functions — extract sub-shapes, compute bounds, and
 * describe shape topology. All results are lazily cached per shape.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape, ShapeType, SurfaceType } from '@/kernel/types.js';
import type {
  AnyShape,
  Dimension,
  Edge,
  Face,
  Wire,
  Vertex,
  Shell,
  Solid,
  CompSolid,
  ShapeKind,
} from '@/core/shapeTypes.js';
import { castShapeWithKnownType } from '@/core/shapeTypes.js';
import { getOrQueryType } from '@/core/shapeTypeCache.js';
import type { Vec3 } from '@/core/types.js';

// ---------------------------------------------------------------------------
// Fast sub-shape extraction (avoids per-item downcast + generator overhead)
// ---------------------------------------------------------------------------

/**
 * Extract sub-shapes of a known type, bypassing the generator wrapper and
 * redundant downcast calls. Uses iterShapes (C++ bulk extraction) directly
 * and passes the known type to castShape to skip the shapeType() WASM call.
 */
function castSubShapes<T>(parentShape: KernelShape, type: ShapeType): T[] {
  const kernel = getKernel();
  const rawShapes = kernel.iterShapes(parentShape, type);
  const result: T[] = new Array(rawShapes.length);
  for (let i = 0; i < rawShapes.length; i++) {
    result[i] = castShapeWithKnownType(rawShapes[i], type) as T;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Shared topology cache
// ---------------------------------------------------------------------------

/** @internal Cache entry type — exported for originTrackingFns and adjacencyFns. */
export interface TopoCacheEntry {
  edges?: Edge<Dimension>[];
  faces?: Face<Dimension>[];
  wires?: Wire<Dimension>[];
  vertices?: Vertex<Dimension>[];
  shells?: Shell[];
  solids?: Solid[];
  compSolids?: CompSolid[];
  faceOrigins?: Map<number, number>;
  bounds?: Bounds3D;
  isValid?: boolean;
  surfaceType?: SurfaceType;
  /** Edge hash → edge-face pairs for adjacency queries. Stores the edge alongside
   *  each face so facesOfEdge can verify via isSame without re-extracting face edges. */
  edgeToFaces?: Map<number, Array<{ edge: KernelShape; face: KernelShape }>>;
  /** Vertex hash → vertex-face pairs — the vertex analogue of {@link edgeToFaces}. */
  vertexToFaces?: Map<number, Array<{ vertex: KernelShape; face: KernelShape }>>;
}

const topoCache = new WeakMap<object, TopoCacheEntry>();

/** @internal Get or create a cache entry for a shape. Used by originTrackingFns. */
export function getOrCreateCache(shape: AnyShape<Dimension>): TopoCacheEntry {
  let entry = topoCache.get(shape.wrapped);
  if (!entry) {
    entry = {};
    topoCache.set(shape.wrapped, entry);
  }
  return entry;
}

/** @internal Direct cache access. Used by originTrackingFns for getFaceOrigins. */
export function getCacheEntry(shape: AnyShape<Dimension>): TopoCacheEntry | undefined {
  return topoCache.get(shape.wrapped);
}

/**
 * Invalidate cached topology data for a shape.
 * Call this after operations that modify a shape in-place (e.g., unifyFaces).
 */
export function invalidateShapeCache(shape: AnyShape<Dimension>): void {
  topoCache.delete(shape.wrapped);
}

// ---------------------------------------------------------------------------
// Cached topology extractors
// ---------------------------------------------------------------------------

/** Get all edges of a shape as branded Edge handles. Results are cached per shape. */
export function getEdges<D extends Dimension>(shape: AnyShape<D>): Edge<D>[] {
  const cache = getOrCreateCache(shape);
  if (cache.edges) return cache.edges as Edge<D>[];
  const edges = castSubShapes<Edge<D>>(shape.wrapped, 'edge');
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
  const faces = castSubShapes<Face<D>>(shape.wrapped, 'face');
  cache.faces = faces;
  return faces;
}

/** Get all wires of a shape as branded Wire handles. Results are cached per shape. */
export function getWires<D extends Dimension>(shape: AnyShape<D>): Wire<D>[] {
  const cache = getOrCreateCache(shape);
  if (cache.wires) return cache.wires as Wire<D>[];
  const wires = castSubShapes<Wire<D>>(shape.wrapped, 'wire');
  cache.wires = wires;
  return wires;
}

/** Get all vertices of a shape as branded Vertex handles. Results are cached per shape. */
export function getVertices<D extends Dimension>(shape: AnyShape<D>): Vertex<D>[] {
  const cache = getOrCreateCache(shape);
  if (cache.vertices) return cache.vertices as Vertex<D>[];
  const vertices = castSubShapes<Vertex<D>>(shape.wrapped, 'vertex');
  cache.vertices = vertices;
  return vertices;
}

/**
 * Get all solids of a shape as branded Solid handles. Results are cached per shape.
 *
 * Booleans (`cut`/`fuse`/`fuseAll`), `chamfer`/`fillet`, and some sweeps return a
 * `Compound` wrapping the solid(s); use this to unwrap them without reaching into
 * the kernel. Returns `[]` for shapes with no solids (wires, bare faces, shells).
 */
export function getSolids(shape: AnyShape<Dimension>): Solid[] {
  const cache = getOrCreateCache(shape);
  if (cache.solids) return cache.solids;
  const solids = castSubShapes<Solid>(shape.wrapped, 'solid');
  cache.solids = solids;
  return solids;
}

/** Get all shells of a shape as branded Shell handles. Results are cached per shape. */
export function getShells(shape: AnyShape<Dimension>): Shell[] {
  const cache = getOrCreateCache(shape);
  if (cache.shells) return cache.shells;
  const shells = castSubShapes<Shell>(shape.wrapped, 'shell');
  cache.shells = shells;
  return shells;
}

/** Get all compsolids of a shape as branded CompSolid handles. Results are cached per shape. */
export function getCompSolids(shape: AnyShape<Dimension>): CompSolid[] {
  const cache = getOrCreateCache(shape);
  if (cache.compSolids) return cache.compSolids;
  const compSolids = castSubShapes<CompSolid>(shape.wrapped, 'compsolid');
  cache.compSolids = compSolids;
  return compSolids;
}

// ---------------------------------------------------------------------------
// Lazy topology iterators (generators)
// ---------------------------------------------------------------------------

/** Lazily iterate edges of a shape, yielding branded Edge handles one at a time. */
export function* iterEdges<D extends Dimension>(shape: AnyShape<D>): Generator<Edge<D>> {
  for (const e of getKernel().iterShapes(shape.wrapped, 'edge')) {
    yield castShapeWithKnownType(e, 'edge') as Edge<D>;
  }
}

/** Lazily iterate faces of a shape, yielding branded Face handles one at a time. */
export function* iterFaces<D extends Dimension>(shape: AnyShape<D>): Generator<Face<D>> {
  for (const f of getKernel().iterShapes(shape.wrapped, 'face')) {
    yield castShapeWithKnownType(f, 'face') as Face<D>;
  }
}

/** Lazily iterate wires of a shape, yielding branded Wire handles one at a time. */
export function* iterWires<D extends Dimension>(shape: AnyShape<D>): Generator<Wire<D>> {
  for (const w of getKernel().iterShapes(shape.wrapped, 'wire')) {
    yield castShapeWithKnownType(w, 'wire') as Wire<D>;
  }
}

/** Lazily iterate vertices of a shape, yielding branded Vertex handles one at a time. */
export function* iterVertices<D extends Dimension>(shape: AnyShape<D>): Generator<Vertex<D>> {
  for (const v of getKernel().iterShapes(shape.wrapped, 'vertex')) {
    yield castShapeWithKnownType(v, 'vertex') as Vertex<D>;
  }
}

/** Lazily iterate solids of a shape, yielding branded Solid handles one at a time. */
export function* iterSolids(shape: AnyShape<Dimension>): Generator<Solid> {
  for (const s of getKernel().iterShapes(shape.wrapped, 'solid')) {
    yield castShapeWithKnownType(s, 'solid') as Solid;
  }
}

/** Lazily iterate shells of a shape, yielding branded Shell handles one at a time. */
export function* iterShells(shape: AnyShape<Dimension>): Generator<Shell> {
  for (const s of getKernel().iterShapes(shape.wrapped, 'shell')) {
    yield castShapeWithKnownType(s, 'shell') as Shell;
  }
}

/** Lazily iterate compsolids of a shape, yielding branded CompSolid handles one at a time. */
export function* iterCompSolids(shape: AnyShape<Dimension>): Generator<CompSolid> {
  for (const s of getKernel().iterShapes(shape.wrapped, 'compsolid')) {
    yield castShapeWithKnownType(s, 'compsolid') as CompSolid;
  }
}

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

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
// Cached shape kind
// ---------------------------------------------------------------------------

/** Get the topological kind of a shape. Cached per shape via shapeTypeCache. */
export function getCachedShapeKind(shape: AnyShape<Dimension>): ShapeKind {
  return getOrQueryType(getKernel(), shape.wrapped);
}

/** Get the kernel surface type of a face. Cached per face (shapes are immutable). */
export function getCachedSurfaceType(face: Face<Dimension>): SurfaceType {
  const cache = getOrCreateCache(face);
  if (cache.surfaceType !== undefined) return cache.surfaceType;
  const surfType = getKernel().surfaceType(face.wrapped);
  cache.surfaceType = surfType;
  return surfType;
}

/** Get whether a shape is valid. Cached per shape (shapes are immutable). */
export function getCachedIsValid(shape: AnyShape<Dimension>): boolean {
  const cache = getOrCreateCache(shape);
  if (cache.isValid !== undefined) return cache.isValid;
  const valid = getKernel().isValid(shape.wrapped);
  cache.isValid = valid;
  return valid;
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
    kind: getCachedShapeKind(shape),
    faceCount: getFaces(shape).length,
    edgeCount: getEdges(shape).length,
    wireCount: getWires(shape).length,
    vertexCount: getVertices(shape).length,
    valid: getCachedIsValid(shape),
    bounds: getBounds(shape),
  };
}

// ---------------------------------------------------------------------------
// Vertex position
// ---------------------------------------------------------------------------

/** Get the position of a vertex as a Vec3 tuple. */
export function vertexPosition(vertex: Vertex): Vec3 {
  return getKernel().vertexPosition(vertex.wrapped);
}
