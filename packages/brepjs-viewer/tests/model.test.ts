import { describe, it, expect } from 'vitest';
import { modelToMeshData, findElementAt, styleElements, type EvaluatedNodeLike } from '@/model.js';

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

  it('merges per-element edge segments into MeshData.edges', () => {
    const withEdges = (offset: number): EvaluatedNodeLike => {
      const base = tri(offset);
      if (!base.mesh.ok) throw new Error('unreachable');
      return {
        mesh: {
          ok: true,
          value: { ...base.mesh.value, edges: new Float32Array([offset, 0, 0, offset + 1, 0, 0]) },
        },
      };
    };
    const model = {
      byKeyPath: new Map([
        ['a', withEdges(0)],
        ['b', withEdges(10)],
        ['c', tri(20)],
      ]),
    };
    const { data, elements } = modelToMeshData(model);
    expect(Array.from(data.edges)).toEqual([0, 0, 0, 1, 0, 0, 10, 0, 0, 11, 0, 0]);
    expect(elements.map((e) => [e.keyPath, e.edgeStart, e.edgeCount])).toEqual([
      ['a', 0, 6],
      ['b', 6, 6],
      ['c', undefined, undefined],
    ]);
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

describe('styleElements', () => {
  function edged(offset: number): EvaluatedNodeLike {
    const base = tri(offset);
    if (!base.mesh.ok) throw new Error('unreachable');
    return {
      mesh: {
        ok: true,
        value: { ...base.mesh.value, edges: new Float32Array([offset, 0, 0, offset, 1, 0]) },
      },
    };
  }
  const merged = modelToMeshData({
    byKeyPath: new Map([
      ['a', edged(0)],
      ['b', edged(10)],
      ['c', edged(20)],
    ]),
  });

  it('draws each layer from its own index and edge slices over the shared vertices', () => {
    const styled = styleElements(merged.data, merged.elements, {
      layers: [{ keyPaths: ['b'], color: '#ff6b00' }],
      others: 'ghost',
    });
    expect(styled.meshes.map((m) => [m.key, m.viewMode, m.data.color])).toEqual([
      ['layer-0', 'solid', '#ff6b00'],
      ['others', 'xray', undefined],
    ]);
    expect(Array.from(styled.meshes[0]?.data.index ?? [])).toEqual([3, 4, 5]);
    expect(Array.from(styled.meshes[0]?.data.edges ?? [])).toEqual([10, 0, 0, 10, 1, 0]);
    expect(Array.from(styled.meshes[1]?.data.index ?? [])).toEqual([0, 1, 2, 6, 7, 8]);
    expect(styled.meshes[0]?.data.position).toBe(merged.data.position);
    expect(styled.visible.index.length).toBe(9);
  });

  it('leaves hidden elements out of the drawing and the framing mesh', () => {
    const styled = styleElements(
      merged.data,
      merged.elements,
      { layers: [{ keyPaths: ['c', 'a', 'missing'] }], others: 'hidden' },
      'wireframe'
    );
    expect(styled.meshes.map((m) => [m.key, m.viewMode])).toEqual([['layer-0', 'wireframe']]);
    expect(Array.from(styled.visible.index)).toEqual([0, 1, 2, 3, 4, 5]);
    // Only a's and c's vertices, so bounds and framing cover what is drawn, not b at x=10.
    expect(Array.from(styled.visible.position).filter((_, i) => i % 3 === 0)).toEqual([
      0, 1, 0, 20, 21, 20,
    ]);
  });

  it('gives an element to the first layer that lists it', () => {
    const styled = styleElements(merged.data, merged.elements, {
      layers: [
        { keyPaths: ['a'], color: 'red' },
        { keyPaths: ['a', 'b'], color: 'blue', mode: 'ghost' },
      ],
      others: 'hidden',
    });
    expect(styled.meshes.map((m) => [m.data.color, m.viewMode, m.data.index.length])).toEqual([
      ['red', 'solid', 3],
      ['blue', 'xray', 3],
    ]);
  });
});
