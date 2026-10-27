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

import type { FaceGroup, MeshData, ViewMode } from './types.js';

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
  /** The element's slice of `MeshData.edges`, in float units (6 per segment). Present only for
   *  elements that carry edges, so a consumer can draw one element's edges on its own. */
  readonly edgeStart?: number | undefined;
  readonly edgeCount?: number | undefined;
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
    const edgeStart = edgeOffset;
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
    const edgeCount = edgeOffset - edgeStart;
    elements.push({
      keyPath,
      start: indexOffset,
      count: mesh.triangles.length,
      ...(edgeCount > 0 ? { edgeStart, edgeCount } : {}),
    });
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

/** One group of elements drawn alike: in `color`, opaque (`solid`) or see-through (`ghost`). */
export interface ElementLayer {
  readonly keyPaths: readonly string[];
  readonly color?: string | undefined;
  readonly mode?: 'solid' | 'ghost' | undefined;
}

/**
 * Per-element styling for a merged model. An element takes the first layer that lists it; every
 * element no layer lists is drawn per `others` (default `solid`), and `hidden` leaves it out.
 */
export interface ElementStyle {
  readonly layers: readonly ElementLayer[];
  readonly others?: 'solid' | 'ghost' | 'hidden' | undefined;
}

export interface StyledMesh {
  readonly key: string;
  readonly data: MeshData;
  readonly viewMode: ViewMode;
}

export interface StyledModel {
  readonly meshes: readonly StyledMesh[];
  /** Every drawn element in one compact mesh (only the vertices it uses), for framing the camera
   *  and measuring what is shown. */
  readonly visible: MeshData;
}

function subsetMesh(data: MeshData, ranges: readonly ElementRange[], color?: string): MeshData {
  let indexCount = 0;
  let edgeCount = 0;
  for (const r of ranges) {
    indexCount += r.count;
    edgeCount += r.edgeCount ?? 0;
  }
  const index = new Uint32Array(indexCount);
  const edges = new Float32Array(edgeCount);
  let i = 0;
  let e = 0;
  for (const r of ranges) {
    index.set(data.index.subarray(r.start, r.start + r.count), i);
    i += r.count;
    if (r.edgeStart !== undefined && r.edgeCount !== undefined) {
      edges.set(data.edges.subarray(r.edgeStart, r.edgeStart + r.edgeCount), e);
      e += r.edgeCount;
    }
  }
  // Vertex buffers are shared: only the index (and edge) selection changes per layer.
  return {
    position: data.position,
    normal: data.normal,
    index,
    edges,
    ...(color !== undefined ? { color } : {}),
  };
}

/** A standalone copy of `ranges`, holding only the vertices they index. */
function compactMesh(data: MeshData, ranges: readonly ElementRange[]): MeshData {
  const shared = subsetMesh(data, ranges);
  const remap = new Map<number, number>();
  const index = new Uint32Array(shared.index.length);
  shared.index.forEach((v, i) => {
    let to = remap.get(v);
    if (to === undefined) {
      to = remap.size;
      remap.set(v, to);
    }
    index[i] = to;
  });
  const position = new Float32Array(remap.size * 3);
  const normal = new Float32Array(remap.size * 3);
  for (const [from, to] of remap) {
    position.set(data.position.subarray(from * 3, from * 3 + 3), to * 3);
    normal.set(data.normal.subarray(from * 3, from * 3 + 3), to * 3);
  }
  return { position, normal, index, edges: shared.edges };
}

/** Split a merged model into one mesh per style layer. Solid layers use `viewMode`; ghosts use xray. */
export function styleElements(
  data: MeshData,
  elements: readonly ElementRange[],
  style: ElementStyle,
  viewMode: ViewMode = 'solid'
): StyledModel {
  const byKey = new Map(elements.map((r) => [r.keyPath, r]));
  const taken = new Set<string>();
  const meshes: StyledMesh[] = [];
  const drawn: ElementRange[] = [];
  const modeOf = (m: 'solid' | 'ghost' | undefined): ViewMode =>
    m === 'ghost' ? 'xray' : viewMode;
  style.layers.forEach((layer, n) => {
    const ranges: ElementRange[] = [];
    for (const k of layer.keyPaths) {
      const r = byKey.get(k);
      if (r === undefined || taken.has(k)) continue;
      taken.add(k);
      ranges.push(r);
    }
    if (ranges.length === 0) return;
    meshes.push({
      key: `layer-${n}`,
      data: subsetMesh(data, ranges, layer.color),
      viewMode: modeOf(layer.mode),
    });
    drawn.push(...ranges);
  });
  const others = style.others ?? 'solid';
  if (others !== 'hidden') {
    const rest = elements.filter((r) => !taken.has(r.keyPath));
    if (rest.length > 0) {
      meshes.push({ key: 'others', data: subsetMesh(data, rest), viewMode: modeOf(others) });
      drawn.push(...rest);
    }
  }
  drawn.sort((a, b) => a.start - b.start);
  return { meshes, visible: compactMesh(data, drawn) };
}
