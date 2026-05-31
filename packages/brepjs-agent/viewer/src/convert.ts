import type { MeshData } from 'brepjs-viewer';

export interface ShapeMeshLike {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  faceGroups: { start: number; count: number; faceId: number; origin: number }[];
}
export interface ConvertOptions {
  color?: string;
}

// Drop ShapeMesh's `origin` (playground-only) and re-key to MeshData; `edges` is
// meshEdges(shape).lines, passed in by the caller so this stays pure.
export function shapeMeshToMeshData(
  shapeMesh: ShapeMeshLike,
  edges: Float32Array,
  opts: ConvertOptions = {},
): MeshData {
  const md: MeshData = {
    position: shapeMesh.vertices,
    normal: shapeMesh.normals,
    index: shapeMesh.triangles,
    edges,
    faceGroups: shapeMesh.faceGroups.map((g) => ({
      start: g.start,
      count: g.count,
      faceId: g.faceId,
    })),
  };
  if (opts.color) md.color = opts.color;
  return md;
}
