import { describe, it, expect } from 'vitest';
import { shapeMeshToMeshData } from '@viewer/convert.js';

const shapeMesh = {
  vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  triangles: new Uint32Array([0, 1, 2]),
  uvs: new Float32Array([]),
  faceGroups: [{ start: 0, count: 3, faceId: 42, origin: 0 }],
};
const edges = new Float32Array([0, 0, 0, 1, 0, 0]);

describe('shapeMeshToMeshData', () => {
  it('maps fields onto MeshData and drops origin from faceGroups', () => {
    const md = shapeMeshToMeshData(shapeMesh, edges, { color: '#ff0000' });
    expect(md.position).toBe(shapeMesh.vertices);
    expect(md.normal).toBe(shapeMesh.normals);
    expect(md.index).toBe(shapeMesh.triangles);
    expect(md.edges).toBe(edges);
    expect(md.faceGroups).toEqual([{ start: 0, count: 3, faceId: 42 }]);
    expect(md.color).toBe('#ff0000');
  });
  it('omits color when not provided and tolerates empty faceGroups', () => {
    const md = shapeMeshToMeshData({ ...shapeMesh, faceGroups: [] }, new Float32Array([]));
    expect(md.color).toBeUndefined();
    expect(md.faceGroups).toEqual([]);
  });
});
