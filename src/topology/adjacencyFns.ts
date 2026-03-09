/**
 * Topology adjacency queries — find related sub-shapes within a parent shape.
 *
 * Uses kernel iterShapes to discover ancestor/descendant relationships
 * without requiring TopExp::MapShapesAndAncestors (not available in WASM).
 */

import { getKernel } from '../kernel/index.js';
import type { ShapeType } from '../kernel/index.js';
import type { AnyShape, ClosedWire, Dimension, Edge, Face, Vertex } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import { unwrap } from '../core/result.js';
import { downcast } from './cast.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find all unique sub-shapes of `targetType` within `parent` that contain `child`.
 * Iterates `targetType` sub-shapes of `parent`, then for each candidate,
 * explores its children of `childType` to check if `child` is among them (via isSame).
 */
function findAncestors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape type
  parent: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape type
  child: any,
  targetType: ShapeType,
  childType: ShapeType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- returns kernel shapes
): any[] {
  const kernel = getKernel();
  const candidates = kernel.iterShapes(parent, targetType);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape collection
  const results: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shapes for isSame dedup
  const seen = new Map<number, any[]>();

  for (const candidate of candidates) {
    // Check if child is a sub-shape of candidate
    const children = kernel.iterShapes(candidate, childType);
    const found = children.some((c) => kernel.isSame(c, child));

    if (found) {
      // Deduplicate using hash + isSame within bucket
      const hash = kernel.hashCode(candidate, HASH_CODE_MAX);
      const bucket = seen.get(hash);
      if (!bucket) {
        seen.set(hash, [candidate]);
        results.push(candidate);
      } else if (!bucket.some((r) => kernel.isSame(r, candidate))) {
        bucket.push(candidate);
        results.push(candidate);
      }
    }
  }

  return results;
}

/**
 * Find all unique sub-shapes of `childType` within `parent`.
 * Simple wrapper around iterShapes with deduplication.
 */
function findChildren(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape type
  parent: any,
  childType: ShapeType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- returns kernel shapes
): any[] {
  const kernel = getKernel();
  const items = kernel.iterShapes(parent, childType);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape collection
  const results: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shapes for isSame dedup
  const seen = new Map<number, any[]>();

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

  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wraps kernel shapes to branded types
function wrapAll<T extends AnyShape<Dimension>>(shapes: any[]): T[] {
  return shapes.map((s) => castShape(unwrap(downcast(s))) as T);
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
  const raw = findAncestors(parent.wrapped, edge.wrapped, 'face', 'edge');
  return wrapAll<Face<D>>(raw);
}

/**
 * Get all edges bounding a face.
 *
 * @param face - The face whose edges to enumerate.
 * @returns Array of unique edges forming the face boundary.
 */
export function edgesOfFace<D extends Dimension>(face: Face<D>): Edge<D>[] {
  const raw = findChildren(face.wrapped, 'edge');
  return wrapAll<Edge<D>>(raw);
}

/**
 * Get all wires of a face (outer wire + inner hole wires).
 * All wires bounding a face are closed by definition.
 *
 * @param face - The face whose wires to enumerate.
 */
export function wiresOfFace<D extends Dimension>(face: Face<D>): ClosedWire<D>[] {
  const raw = findChildren(face.wrapped, 'wire');
  return wrapAll<ClosedWire<D>>(raw);
}

/**
 * Get the start and end vertices of an edge.
 *
 * @param edge - The edge whose vertices to retrieve.
 * @returns Array of 1-2 vertices (1 if degenerate/closed, 2 otherwise).
 */
export function verticesOfEdge<D extends Dimension>(edge: Edge<D>): Vertex<D>[] {
  const raw = findChildren(edge.wrapped, 'vertex');
  return wrapAll<Vertex<D>>(raw);
}

/**
 * Get all faces that share at least one edge with the given face.
 *
 * The returned list does not include the input face itself.
 *
 * @param parent - The parent shape to search within.
 * @param face - The face whose neighbors to find.
 * @returns Array of unique adjacent faces (excluding the input face).
 */
export function adjacentFaces<D extends Dimension>(parent: AnyShape<D>, face: Face<D>): Face<D>[] {
  const kernel = getKernel();

  // Build edge->faces map in a single pass over all faces in parent.
  // This replaces the O(E_face x F x E_per_face) nested exploration with
  // O(F x E_per_face) to build + O(E_face) to query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape collections
  const edgeToFaces = new Map<number, any[]>();
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
      // Dedup faces within the same hash bucket
      if (!bucket.some((existing) => kernel.isSame(existing, f))) {
        bucket.push(f);
      }
    }
  }

  // For each edge of the input face, look up adjacent faces from the map
  const faceEdges = findChildren(face.wrapped, 'edge');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape collection
  const neighborRaw: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shapes for isSame dedup
  const seen = new Map<number, any[]>();

  for (const edgeOc of faceEdges) {
    const hash = kernel.hashCode(edgeOc, HASH_CODE_MAX);
    const facesForEdge = edgeToFaces.get(hash) ?? [];
    for (const f of facesForEdge) {
      if (kernel.isSame(f, face.wrapped)) continue;
      const fHash = kernel.hashCode(f, HASH_CODE_MAX);
      const bucket = seen.get(fHash);
      if (!bucket) {
        seen.set(fHash, [f]);
        neighborRaw.push(f);
      } else if (!bucket.some((r) => kernel.isSame(r, f))) {
        bucket.push(f);
        neighborRaw.push(f);
      }
    }
  }

  return wrapAll<Face<D>>(neighborRaw);
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
  const edges1 = findChildren(face1.wrapped, 'edge');
  const edges2 = findChildren(face2.wrapped, 'edge');

  // Build hash-bucket index of edges2 for O(1) average lookup instead of O(nxm) isSame scans
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape collection
  const edge2Map = new Map<number, any[]>();
  for (const e2 of edges2) {
    const hash = kernel.hashCode(e2, HASH_CODE_MAX);
    let bucket = edge2Map.get(hash);
    if (!bucket) {
      bucket = [];
      edge2Map.set(hash, bucket);
    }
    bucket.push(e2);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape collection
  const shared: any[] = [];
  for (const e1 of edges1) {
    const bucket = edge2Map.get(kernel.hashCode(e1, HASH_CODE_MAX));
    if (bucket?.some((e2) => kernel.isSame(e1, e2))) {
      shared.push(e1);
    }
  }

  return wrapAll<Edge<D>>(shared);
}
