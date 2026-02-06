/**
 * Topology adjacency queries — find related sub-shapes within a parent shape.
 *
 * Uses TopExp_Explorer to discover ancestor/descendant relationships
 * without requiring TopExp::MapShapesAndAncestors (not available in WASM).
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Edge, Face, Vertex, Wire } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import { unwrap } from '../core/result.js';
import { downcast } from './cast.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find all unique sub-shapes of `targetType` within `parent` that contain `child`.
 * Uses TopExp_Explorer to iterate `targetType` sub-shapes of `parent`,
 * then for each candidate, explores its children of `child`'s type to check
 * if `child` is among them (via IsSame).
 */
function findAncestors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape type
  parent: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape type
  child: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum value
  targetType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum value
  childType: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- returns OCCT shapes
): any[] {
  const oc = getKernel().oc;
  const shapeEnum = oc.TopAbs_ShapeEnum.TopAbs_SHAPE;

  // Iterate all sub-shapes of targetType within parent
  const outerExplorer = new oc.TopExp_Explorer_2(parent, targetType, shapeEnum);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape collection
  const results: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shapes for IsSame dedup
  const seen = new Map<number, any[]>();

  while (outerExplorer.More()) {
    const candidate = outerExplorer.Current();

    // Check if child is a sub-shape of candidate
    const innerExplorer = new oc.TopExp_Explorer_2(candidate, childType, shapeEnum);
    let found = false;
    while (innerExplorer.More()) {
      if (innerExplorer.Current().IsSame(child)) {
        found = true;
        break;
      }
      innerExplorer.Next();
    }
    innerExplorer.delete();

    if (found) {
      // Deduplicate using hash + IsSame within bucket
      const hash = candidate.HashCode(HASH_CODE_MAX);
      const bucket = seen.get(hash);
      if (!bucket) {
        seen.set(hash, [candidate]);
        results.push(candidate);
      } else if (!bucket.some((r) => r.IsSame(candidate))) {
        bucket.push(candidate);
        results.push(candidate);
      }
    }

    outerExplorer.Next();
  }
  outerExplorer.delete();

  return results;
}

/**
 * Find all unique sub-shapes of `childType` within `parent`.
 * Simple wrapper around TopExp_Explorer with deduplication.
 */
function findChildren(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape type
  parent: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum value
  childType: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- returns OCCT shapes
): any[] {
  const oc = getKernel().oc;
  const explorer = new oc.TopExp_Explorer_2(parent, childType, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape collection
  const results: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shapes for IsSame dedup
  const seen = new Map<number, any[]>();

  while (explorer.More()) {
    const item = explorer.Current();
    const hash = item.HashCode(HASH_CODE_MAX);
    const bucket = seen.get(hash);
    if (!bucket) {
      seen.set(hash, [item]);
      results.push(item);
    } else if (!bucket.some((r) => r.IsSame(item))) {
      bucket.push(item);
      results.push(item);
    }
    explorer.Next();
  }
  explorer.delete();

  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wraps OCCT shapes to branded types
function wrapAll<T extends AnyShape>(shapes: any[]): T[] {
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
export function facesOfEdge(parent: AnyShape, edge: Edge): Face[] {
  const oc = getKernel().oc;
  const raw = findAncestors(
    parent.wrapped,
    edge.wrapped,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE
  );
  return wrapAll<Face>(raw);
}

/**
 * Get all edges bounding a face.
 *
 * @param face - The face whose edges to enumerate.
 * @returns Array of unique edges forming the face boundary.
 */
export function edgesOfFace(face: Face): Edge[] {
  const oc = getKernel().oc;
  const raw = findChildren(face.wrapped, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
  return wrapAll<Edge>(raw);
}

/**
 * Get all wires of a face (outer wire + inner hole wires).
 *
 * @param face - The face whose wires to enumerate.
 */
export function wiresOfFace(face: Face): Wire[] {
  const oc = getKernel().oc;
  const raw = findChildren(face.wrapped, oc.TopAbs_ShapeEnum.TopAbs_WIRE);
  return wrapAll<Wire>(raw);
}

/**
 * Get the start and end vertices of an edge.
 *
 * @param edge - The edge whose vertices to retrieve.
 * @returns Array of 1-2 vertices (1 if degenerate/closed, 2 otherwise).
 */
export function verticesOfEdge(edge: Edge): Vertex[] {
  const oc = getKernel().oc;
  const raw = findChildren(edge.wrapped, oc.TopAbs_ShapeEnum.TopAbs_VERTEX);
  return wrapAll<Vertex>(raw);
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
export function adjacentFaces(parent: AnyShape, face: Face): Face[] {
  const oc = getKernel().oc;
  const faceEdges = findChildren(face.wrapped, oc.TopAbs_ShapeEnum.TopAbs_EDGE);

  // Collect all faces that share any edge with the input face
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape collection
  const neighborRaw: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shapes for IsSame dedup
  const seen = new Map<number, any[]>();

  for (const edgeOc of faceEdges) {
    const edgeFaces = findAncestors(
      parent.wrapped,
      edgeOc,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE
    );
    for (const f of edgeFaces) {
      // Skip the input face itself
      if (f.IsSame(face.wrapped)) continue;
      const hash = f.HashCode(HASH_CODE_MAX);
      const bucket = seen.get(hash);
      if (!bucket) {
        seen.set(hash, [f]);
        neighborRaw.push(f);
      } else if (!bucket.some((r) => r.IsSame(f))) {
        bucket.push(f);
        neighborRaw.push(f);
      }
    }
  }

  return wrapAll<Face>(neighborRaw);
}

/**
 * Get all edges shared between two faces.
 *
 * @param face1 - The first face.
 * @param face2 - The second face.
 * @returns Array of edges present in both faces (via IsSame comparison).
 */
export function sharedEdges(face1: Face, face2: Face): Edge[] {
  const oc = getKernel().oc;
  const edges1 = findChildren(face1.wrapped, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
  const edges2 = findChildren(face2.wrapped, oc.TopAbs_ShapeEnum.TopAbs_EDGE);

  // Find edges that exist in both faces using IsSame
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape collection
  const shared: any[] = [];
  for (const e1 of edges1) {
    if (edges2.some((e2) => e1.IsSame(e2))) {
      shared.push(e1);
    }
  }

  return wrapAll<Edge>(shared);
}
