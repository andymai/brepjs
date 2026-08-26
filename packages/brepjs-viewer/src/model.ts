/**
 * Bridge from an evaluated declarative model (brepjs-families
 * `evaluateModel()` output) to renderable MeshData. Typed structurally so the
 * viewer stays decoupled from brepjs-families: anything with a `byKeyPath`
 * map of key path -> { mesh: Result-like } works.
 *
 * The per-element identity that `byKeyPath` carries is preserved as
 * `ElementRange`s over the merged index buffer, so picking can map a
 * triangle back to its element key path (`findElementAt`).
 */

import type { FaceGroup, MeshData } from './types.js';

export interface ElementMesh {
  readonly triangles: Uint32Array;
  readonly vertices: Float32Array;
  readonly normals: Float32Array;
  readonly faceGroups?: readonly { start: number; count: number; faceId: number }[] | undefined;
  /** Optional edge line segments (x,y,z interleaved, 2 vertices per segment) —
   *  merged into `MeshData.edges` so the EdgeRenderer has real wireframe data. */
  readonly edges?: Float32Array | undefined;
}

export interface EvaluatedNodeLike {
  readonly mesh:
    | { readonly ok: true; readonly value: ElementMesh }
    | { readonly ok: false; readonly value?: undefined };
}

export interface EvaluatedModelLike {
  readonly byKeyPath: ReadonlyMap<string, EvaluatedNodeLike>;
}

/** One element's triangle range in the merged index buffer (index-array units,
 *  i.e. 3 per triangle — the same units as FaceGroup). */
export interface ElementRange {
  readonly keyPath: string;
  readonly start: number;
  readonly count: number;
}

export interface ModelMeshResult {
  readonly data: MeshData;
  /** Insertion-ordered, contiguous, ascending by `start`. */
  readonly elements: readonly ElementRange[];
  /** Key paths whose mesh evaluation failed; absent from the merge. */
  readonly failed: readonly string[];
}

/**
 * Merge every element mesh into one MeshData, preserving element identity as
 * index ranges. Merged faceGroups keep their per-element faceIds, which can
 * collide across elements that share a materialization — `elements` is the
 * authoritative element identity; faceGroups only subdivide within one.
 */
export function modelToMeshData(model: EvaluatedModelLike): ModelMeshResult {
  const parts: { keyPath: string; mesh: ElementMesh }[] = [];
  const failed: string[] = [];
  let floats = 0;
  let indices = 0;
  let edgeFloats = 0;
  for (const [keyPath, node] of model.byKeyPath) {
    if (node.mesh.ok) {
      parts.push({ keyPath, mesh: node.mesh.value });
      floats += node.mesh.value.vertices.length;
      indices += node.mesh.value.triangles.length;
      edgeFloats += node.mesh.value.edges?.length ?? 0;
    } else {
      failed.push(keyPath);
    }
  }

  const position = new Float32Array(floats);
  const normal = new Float32Array(floats);
  const index = new Uint32Array(indices);
  const edges = new Float32Array(edgeFloats);
  const faceGroups: FaceGroup[] = [];
  const elements: ElementRange[] = [];
  let floatOffset = 0;
  let indexOffset = 0;
  let edgeOffset = 0;
  for (const { keyPath, mesh } of parts) {
    if (mesh.edges) {
      edges.set(mesh.edges, edgeOffset);
      edgeOffset += mesh.edges.length;
    }
    position.set(mesh.vertices, floatOffset);
    normal.set(mesh.normals, floatOffset);
    const vertexBase = floatOffset / 3;
    for (let i = 0; i < mesh.triangles.length; i++) {
      index[indexOffset + i] = (mesh.triangles[i] ?? 0) + vertexBase;
    }
    elements.push({ keyPath, start: indexOffset, count: mesh.triangles.length });
    for (const g of mesh.faceGroups ?? []) {
      faceGroups.push({ start: g.start + indexOffset, count: g.count, faceId: g.faceId });
    }
    floatOffset += mesh.vertices.length;
    indexOffset += mesh.triangles.length;
  }

  const data: MeshData = {
    position,
    normal,
    index,
    edges,
    ...(faceGroups.length > 0 ? { faceGroups } : {}),
  };
  return { data, elements, failed };
}

/** Map a picked triangle index back to its element (binary search; ranges are
 *  contiguous and ascending by construction). */
export function findElementAt(
  elements: readonly ElementRange[],
  triangleIndex: number
): ElementRange | null {
  const off = triangleIndex * 3;
  let lo = 0;
  let hi = elements.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const e = elements[mid];
    if (!e) break;
    if (off < e.start) hi = mid - 1;
    else if (off >= e.start + e.count) lo = mid + 1;
    else return e;
  }
  return null;
}
