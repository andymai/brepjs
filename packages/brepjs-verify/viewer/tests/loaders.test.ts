import { describe, it, expect, vi } from 'vitest';
import { loadModel, importerFor } from '@viewer/loaders.js';

const fakeShape = { __fake: true };
const fakeMesh = {
  vertices: new Float32Array([0, 0, 0]),
  normals: new Float32Array([0, 0, 1]),
  triangles: new Uint32Array([0]),
  uvs: new Float32Array([]),
  faceGroups: [{ start: 0, count: 1, faceId: 7, origin: 0 }],
};
function makeFakeBrepjs() {
  return {
    isOk: (r: { ok: boolean }) => r.ok,
    importSTEP: vi.fn(() => Promise.resolve({ ok: true, value: fakeShape })),
    importSTL: vi.fn(() => Promise.resolve({ ok: true, value: fakeShape })),
    importGLB: vi.fn(() => Promise.resolve({ ok: true, value: fakeShape })),
    importIGES: vi.fn(() => Promise.resolve({ ok: true, value: fakeShape })),
    importThreeMF: vi.fn(() => Promise.resolve({ ok: true, value: fakeShape })),
    importOBJ: vi.fn(() => Promise.resolve({ ok: true, value: fakeShape })),
    mesh: vi.fn(() => fakeMesh),
    meshEdges: vi.fn(() => ({ lines: new Float32Array([0, 0, 0, 1, 0, 0]), edgeGroups: [] })),
    measureVolume: vi.fn(() => ({ ok: true, value: 42 })),
    measureArea: vi.fn(() => ({ ok: true, value: 84 })),
    isValid: vi.fn(() => true),
    getFaces: vi.fn(() => [{ id: 1 }, { id: 2 }]),
    getSurfaceType: vi.fn(() => ({ ok: true, value: 'PLANE' })),
    normalAt: vi.fn(() => [0, 0, 1] as [number, number, number]),
    getHashCode: vi.fn((f: { id: number }) => f.id),
  };
}
describe('importerFor', () => {
  it('routes aliases case-insensitively', () => {
    const bk = makeFakeBrepjs();
    expect(importerFor(bk, '.step')).toBe(bk.importSTEP);
    expect(importerFor(bk, '.STP')).toBe(bk.importSTEP);
    expect(importerFor(bk, 'stl')).toBe(bk.importSTL);
    expect(importerFor(bk, '.3mf')).toBe(bk.importThreeMF);
  });
  it('throws on unsupported extension', () => {
    expect(() => importerFor(makeFakeBrepjs(), '.txt')).toThrow(/unsupported/i);
  });
});
describe('loadModel', () => {
  it('imports, meshes, converts', async () => {
    const bk = makeFakeBrepjs();
    const { meshData } = await loadModel(bk, new Blob([new Uint8Array([1, 2, 3])]), '.step');
    expect(bk.importSTEP).toHaveBeenCalledOnce();
    expect(meshData.position).toBe(fakeMesh.vertices);
    expect(meshData.faceGroups).toEqual([{ start: 0, count: 1, faceId: 7 }]);
  });
  it('measures volume, area, and validity', async () => {
    const bk = makeFakeBrepjs();
    const { measurements } = await loadModel(bk, new Blob([new Uint8Array([1])]), '.step');
    expect(measurements).toEqual({ volume: 42, area: 84, valid: true });
  });
  it('omits non-positive volume and surfaces invalid shapes', async () => {
    const bk = makeFakeBrepjs();
    bk.measureVolume = vi.fn(() => ({ ok: true, value: 0 }));
    bk.isValid = vi.fn(() => false);
    const { measurements } = await loadModel(bk, new Blob([new Uint8Array([1])]), '.step');
    expect(measurements.volume).toBeUndefined();
    expect(measurements.valid).toBe(false);
    expect(measurements.area).toBe(84);
  });
  it('omits face metadata by default (snapshot path)', async () => {
    const bk = makeFakeBrepjs();
    const { meshData } = await loadModel(bk, new Blob([new Uint8Array([1])]), '.step');
    expect(meshData.faceInfos).toBeUndefined();
    expect(bk.getFaces).not.toHaveBeenCalled();
  });
  it('collects per-face metadata when inspecting', async () => {
    const bk = makeFakeBrepjs();
    const { meshData } = await loadModel(bk, new Blob([new Uint8Array([1])]), '.step', true);
    expect(meshData.faceInfos).toEqual([
      { faceId: 1, surfaceType: 'PLANE', area: 84, normal: [0, 0, 1] },
      { faceId: 2, surfaceType: 'PLANE', area: 84, normal: [0, 0, 1] },
    ]);
  });
  it('skips a face whose metadata throws', async () => {
    const bk = makeFakeBrepjs();
    bk.normalAt = vi.fn((f: { id: number }) => {
      if (f.id === 1) throw new Error('degenerate UV');
      return [0, 0, 1];
    });
    const { meshData } = await loadModel(bk, new Blob([new Uint8Array([1])]), '.step', true);
    expect(meshData.faceInfos?.map((f) => f.faceId)).toEqual([2]);
  });
  it('rejects on Err', async () => {
    const bk = makeFakeBrepjs();
    bk.importSTEP = vi.fn(
      () => Promise.resolve({ ok: false, error: 'bad STEP' }) as Promise<{ ok: boolean }>,
    );
    await expect(loadModel(bk, new Blob([]), '.step')).rejects.toThrow(/bad STEP/);
  });
});
