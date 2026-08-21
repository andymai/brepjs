import { describe, it, expect } from 'vitest';
import { modelToMeshData, findElementAt, type EvaluatedNodeLike } from '@/model.js';

function tri(offset: number): EvaluatedNodeLike {
  return {
    mesh: {
      ok: true,
      value: {
        triangles: new Uint32Array([0, 1, 2]),
        vertices: new Float32Array([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        faceGroups: [{ start: 0, count: 3, faceId: 42 }],
      },
    },
  };
}

describe('modelToMeshData', () => {
  it('merges element meshes with rebased indices and per-element ranges', () => {
    const model = {
      byKeyPath: new Map([
        ['ground/south', tri(0)],
        ['ground/north', tri(10)],
      ]),
    };
    const { data, elements, failed } = modelToMeshData(model);
    expect(failed).toEqual([]);
    expect(data.position.length).toBe(18);
    expect(data.normal.length).toBe(18);
    expect(Array.from(data.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(elements).toEqual([
      { keyPath: 'ground/south', start: 0, count: 3 },
      { keyPath: 'ground/north', start: 3, count: 3 },
    ]);
    expect(data.faceGroups).toEqual([
      { start: 0, count: 3, faceId: 42 },
      { start: 3, count: 3, faceId: 42 },
    ]);
    expect(data.edges.length).toBe(0);
  });

  it('collects failed elements instead of dropping them silently', () => {
    const model = {
      byKeyPath: new Map<string, EvaluatedNodeLike>([
        ['good', tri(0)],
        ['bad', { mesh: { ok: false } }],
      ]),
    };
    const { data, elements, failed } = modelToMeshData(model);
    expect(failed).toEqual(['bad']);
    expect(elements.map((e) => e.keyPath)).toEqual(['good']);
    expect(data.index.length).toBe(3);
  });

  it('findElementAt maps a picked triangle back to its key path', () => {
    const model = {
      byKeyPath: new Map([
        ['a', tri(0)],
        ['b', tri(5)],
      ]),
    };
    const { elements } = modelToMeshData(model);
    expect(findElementAt(elements, 0)?.keyPath).toBe('a');
    expect(findElementAt(elements, 1)?.keyPath).toBe('b');
    expect(findElementAt(elements, 2)).toBeNull();
  });
});
