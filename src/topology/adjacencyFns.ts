/**
 * Topology adjacency queries — find related sub-shapes within a parent shape.
 *
 * Uses cached topology extraction and an edge→faces adjacency map
 * (built once per parent shape and cached) to avoid redundant WASM calls.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape, ShapeType } from '@/kernel/types.js';
import type { AnyShape, ClosedWire, Dimension, Edge, Face, Vertex } from '@/core/shapeTypes.js';
import { castShapeWithKnownType } from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { getOrCreateCache } from './topologyQueryFns.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function wrapAll<T extends AnyShape<Dimension>>(shapes: KernelShape[], type: ShapeType): T[] {
  return shapes.map((s) => castShapeWithKnownType(s, type) as T);
}

/**
 * Iterate sub-shapes of `parentKernel` of the given `type`, deduplicate by
 * hash+isSame, and return branded handles of type `T`.
 *
 * Used by edgesOfFace, wiresOfFace, and verticesOfEdge — all of which need
 * the same deduplicated-children pattern on a raw KernelShape.
 */
function deduplicatedSubShapes<T extends AnyShape<Dimension>>(
  parentKernel: KernelShape,
  type: ShapeType
): T[] {
  const kernel = getKernel();
  const items = kernel.iterShapes(parentKernel, type);

  const results: KernelShape[] = [];
  const seen = new Map<number, KernelShape[]>();

  for (const item of items) {
    const hash = kernel.hashCode(item, HASH_CODE_MAX);
    const bucket = seen.get(hash);
    if (!bucket) {
      seen.set(hash, [item]);
      results.push(item);
    } else if (!bucket.some((r) => kernel.isSame(r, item))) {
      bucket.push(item);
      results.push(item);
    }
  }

  return wrapAll<T>(results, type);
}

/** Edge-face pair stored in the adjacency map. */
interface EdgeFaceEntry {
  readonly edge: KernelShape;
  readonly face: KernelShape;
}

/**
 * Build or retrieve the cached edge→faces adjacency map for a parent shape.
 * Maps edge hash codes to edge-face pairs, storing the edge alongside each
 * face so facesOfEdge can verify via isSame without re-extracting face edges.
 */
function getEdgeToFacesMap(parent: AnyShape<Dimension>): Map<number, EdgeFaceEntry[]> {
  const cache = getOrCreateCache(parent);
  if (cache.edgeToFaces) return cache.edgeToFaces;

  const kernel = getKernel();
  const edgeToFaces = new Map<number, EdgeFaceEntry[]>();
  const allFaces = kernel.iterShapes(parent.wrapped, 'face');

  for (const f of allFaces) {
    const edges = kernel.iterShapes(f, 'edge');
    for (const e of edges) {
      const hash = kernel.hashCode(e, HASH_CODE_MAX);
      let bucket = edgeToFaces.get(hash);
      if (!bucket) {
        bucket = [];
        edgeToFaces.set(hash, bucket);
      }
      // Store each edge-face pair; dedup faces within same edge identity
      if (!bucket.some((entry) => kernel.isSame(entry.edge, e) && kernel.isSame(entry.face, f))) {
        bucket.push({ edge: e, face: f });
      }
    }
  }

  cache.edgeToFaces = edgeToFaces;
  return edgeToFaces;
}

/** Vertex-face pair stored in the adjacency map. */
interface VertexFaceEntry {
  readonly vertex: KernelShape;
  readonly face: KernelShape;
}

/**
 * Build or retrieve the cached vertex→faces adjacency map for a parent shape —
 * the vertex analogue of {@link getEdgeToFacesMap}.
 */
function getVertexToFacesMap(parent: AnyShape<Dimension>): Map<number, VertexFaceEntry[]> {
  const cache = getOrCreateCache(parent);
  if (cache.vertexToFaces) return cache.vertexToFaces;

  const kernel = getKernel();
  const vertexToFaces = new Map<number, VertexFaceEntry[]>();
  for (const f of kernel.iterShapes(parent.wrapped, 'face')) {
    for (const v of kernel.iterShapes(f, 'vertex')) {
      const hash = kernel.hashCode(v, HASH_CODE_MAX);
      let bucket = vertexToFaces.get(hash);
      if (!bucket) {
        bucket = [];
        vertexToFaces.set(hash, bucket);
      }
      if (!bucket.some((entry) => kernel.isSame(entry.vertex, v) && kernel.isSame(entry.face, f))) {
        bucket.push({ vertex: v, face: f });
      }
    }
  }

  cache.vertexToFaces = vertexToFaces;
  return vertexToFaces;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all faces adjacent to a given edge within a parent shape.
 *
 * An edge typically borders exactly two faces in a solid, or one face
 * if the edge is on a boundary.
 *
 * @param parent - The parent shape to search within.
 * @param edge - The edge whose adjacent faces to find.
 * @returns Array of unique faces containing the given edge.
 */
export function facesOfEdge<D extends Dimension>(parent: AnyShape<D>, edge: Edge<D>): Face<D>[] {
  const kernel = getKernel();
  const edgeToFaces = getEdgeToFacesMap(parent);
  const hash = kernel.hashCode(edge.wrapped, HASH_CODE_MAX);
  const bucket = edgeToFaces.get(hash) ?? [];

  // Verify via isSame on the stored edge — no need to re-extract face edges.
  // Dedup faces in case the same face appears with different edge instances.
  const results: KernelShape[] = [];
  const seen = new Map<number, KernelShape[]>();
  for (const entry of bucket) {
    if (!kernel.isSame(entry.edge, edge.wrapped)) continue;
    const fHash = kernel.hashCode(entry.face, HASH_CODE_MAX);
    const fBucket = seen.get(fHash);
    if (!fBucket) {
      seen.set(fHash, [entry.face]);
      results.push(entry.face);
    } else if (!fBucket.some((r) => kernel.isSame(r, entry.face))) {
      fBucket.push(entry.face);
      results.push(entry.face);
    }
  }

  return wrapAll<Face<D>>(results, 'face');
}

/**
 * Get all faces meeting at a vertex (≥3 for a solid corner, fewer on a
 * boundary), via the cached vertex→faces map. The vertex equivalent of
 * {@link facesOfEdge}, with the same hash-bucket + isSame verification.
 *
 * @param parent - The parent shape to search within.
 * @param vertex - The vertex whose adjacent faces to find.
 */
export function facesOfVertex<D extends Dimension>(
  parent: AnyShape<D>,
  vertex: Vertex<D>
): Face<D>[] {
  const kernel = getKernel();
  const vertexToFaces = getVertexToFacesMap(parent);
  const hash = kernel.hashCode(vertex.wrapped, HASH_CODE_MAX);
  const bucket = vertexToFaces.get(hash) ?? [];

  const results: KernelShape[] = [];
  const seen = new Map<number, KernelShape[]>();
  for (const entry of bucket) {
    if (!kernel.isSame(entry.vertex, vertex.wrapped)) continue;
    const fHash = kernel.hashCode(entry.face, HASH_CODE_MAX);
    const fBucket = seen.get(fHash);
    if (!fBucket) {
      seen.set(fHash, [entry.face]);
      results.push(entry.face);
    } else if (!fBucket.some((r) => kernel.isSame(r, entry.face))) {
      fBucket.push(entry.face);
      results.push(entry.face);
    }
  }

  return wrapAll<Face<D>>(results, 'face');
}

/**
 * Get all edges bounding a face.
 *
 * @param face - The face whose edges to enumerate.
 * @returns Array of unique edges forming the face boundary.
 */
export function edgesOfFace<D extends Dimension>(face: Face<D>): Edge<D>[] {
  return deduplicatedSubShapes<Edge<D>>(face.wrapped, 'edge');
}

/**
 * Get all vertices of a face. The vertex equivalent of {@link edgesOfFace}.
 *
 * @param face - The face whose vertices to enumerate.
 */
export function verticesOfFace<D extends Dimension>(face: Face<D>): Vertex<D>[] {
  return deduplicatedSubShapes<Vertex<D>>(face.wrapped, 'vertex');
}

/**
 * Get all wires of a face (outer wire + inner hole wires).
 * All wires bounding a face are closed by definition.
 *
 * @param face - The face whose wires to enumerate.
 */
export function wiresOfFace<D extends Dimension>(face: Face<D>): ClosedWire<D>[] {
  return deduplicatedSubShapes<ClosedWire<D>>(face.wrapped, 'wire');
}

/**
 * Get the start and end vertices of an edge.
 *
 * @param edge - The edge whose vertices to retrieve.
 * @returns Array of 1-2 vertices (1 if degenerate/closed, 2 otherwise).
 */
export function verticesOfEdge<D extends Dimension>(edge: Edge<D>): Vertex<D>[] {
  return deduplicatedSubShapes<Vertex<D>>(edge.wrapped, 'vertex');
}

/**
 * Get all faces that share at least one edge with the given face.
 *
 * The returned list does not include the input face itself.
 * Uses the cached edge→faces adjacency map for the parent shape.
 *
 * @param parent - The parent shape to search within.
 * @param face - The face whose neighbors to find.
 * @returns Array of unique adjacent faces (excluding the input face).
 */
export function adjacentFaces<D extends Dimension>(parent: AnyShape<D>, face: Face<D>): Face<D>[] {
  const kernel = getKernel();
  const edgeToFaces = getEdgeToFacesMap(parent);

  // Deduplicate face edges to avoid redundant bucket lookups
  const faceEdgeHandles = deduplicatedSubShapes<Edge<D>>(face.wrapped, 'edge');
  const neighborRaw: KernelShape[] = [];
  const seen = new Map<number, KernelShape[]>();

  for (const edgeHandle of faceEdgeHandles) {
    const hash = kernel.hashCode(edgeHandle.wrapped, HASH_CODE_MAX);
    const entries = edgeToFaces.get(hash) ?? [];
    for (const entry of entries) {
      if (kernel.isSame(entry.face, face.wrapped)) continue;
      const fHash = kernel.hashCode(entry.face, HASH_CODE_MAX);
      const bucket = seen.get(fHash);
      if (!bucket) {
        seen.set(fHash, [entry.face]);
        neighborRaw.push(entry.face);
      } else if (!bucket.some((r) => kernel.isSame(r, entry.face))) {
        bucket.push(entry.face);
        neighborRaw.push(entry.face);
      }
    }
  }

  return wrapAll<Face<D>>(neighborRaw, 'face');
}

/**
 * Get all edges shared between two faces.
 *
 * @param face1 - The first face.
 * @param face2 - The second face.
 * @returns Array of edges present in both faces (via isSame comparison).
 */
export function sharedEdges<D extends Dimension>(face1: Face<D>, face2: Face<D>): Edge<D>[] {
  const kernel = getKernel();
  const edges1 = kernel.iterShapes(face1.wrapped, 'edge');
  const edges2 = kernel.iterShapes(face2.wrapped, 'edge');

  // Build hash-bucket index of edges2 for O(1) average lookup instead of O(nxm) isSame scans
  const edge2Map = new Map<number, KernelShape[]>();
  for (const e2 of edges2) {
    const hash = kernel.hashCode(e2, HASH_CODE_MAX);
    let bucket = edge2Map.get(hash);
    if (!bucket) {
      bucket = [];
      edge2Map.set(hash, bucket);
    }
    bucket.push(e2);
  }

  const shared: KernelShape[] = [];
  for (const e1 of edges1) {
    const bucket = edge2Map.get(kernel.hashCode(e1, HASH_CODE_MAX));
    if (bucket?.some((e2) => kernel.isSame(e1, e2))) {
      shared.push(e1);
    }
  }

  return wrapAll<Edge<D>>(shared, 'edge');
}
