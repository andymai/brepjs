/**
 * Wavefront OBJ export from ShapeMesh data.
 * Pure string formatting — no OCCT dependency.
 */

import type { ShapeMesh } from '../topology/meshFns.js';

/** Read a vec3 from a typed array at the given vertex index. */
function vec3At(arr: Float32Array, i: number): [number, number, number] {
  const off = i * 3;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by caller
  return [arr[off]!, arr[off + 1]!, arr[off + 2]!];
}

/** Read a triangle's three vertex indices from the triangles array. */
function triAt(arr: Uint32Array, offset: number): [number, number, number] {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by caller
  return [arr[offset]!, arr[offset + 1]!, arr[offset + 2]!];
}

/**
 * Export a ShapeMesh as a Wavefront OBJ string.
 *
 * The mesh should be obtained from `meshShape()`.
 */
export function exportOBJ(mesh: ShapeMesh): string {
  const lines: string[] = ['# brepjs OBJ export'];

  // Vertices
  const vertCount = mesh.vertices.length / 3;
  for (let i = 0; i < vertCount; i++) {
    const [x, y, z] = vec3At(mesh.vertices, i);
    lines.push(`v ${x} ${y} ${z}`);
  }

  // Normals
  const normalCount = mesh.normals.length / 3;
  for (let i = 0; i < normalCount; i++) {
    const [nx, ny, nz] = vec3At(mesh.normals, i);
    lines.push(`vn ${nx} ${ny} ${nz}`);
  }

  // Faces (triangles) — faceGroups use index offsets into the triangles array
  const pushTri = (offset: number) => {
    const [a, b, c] = triAt(mesh.triangles, offset);
    // OBJ indices are 1-based; vertex and normal share the same index
    lines.push(`f ${a + 1}//${a + 1} ${b + 1}//${b + 1} ${c + 1}//${c + 1}`);
  };

  if (mesh.faceGroups.length > 0) {
    for (const group of mesh.faceGroups) {
      lines.push(`g face_${group.faceId}`);
      const triCount = group.count / 3;
      for (let t = 0; t < triCount; t++) {
        pushTri(group.start + t * 3);
      }
    }
  } else {
    const triCount = mesh.triangles.length / 3;
    for (let t = 0; t < triCount; t++) {
      pushTri(t * 3);
    }
  }

  return lines.join('\n') + '\n';
}
