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
    const md = await loadModel(bk, new Blob([new Uint8Array([1, 2, 3])]), '.step');
    expect(bk.importSTEP).toHaveBeenCalledOnce();
    expect(md.position).toBe(fakeMesh.vertices);
    expect(md.faceGroups).toEqual([{ start: 0, count: 1, faceId: 7 }]);
  });
  it('rejects on Err', async () => {
    const bk = makeFakeBrepjs();
    bk.importSTEP = vi.fn(
      () => Promise.resolve({ ok: false, error: 'bad STEP' }) as Promise<{ ok: boolean }>,
    );
    await expect(loadModel(bk, new Blob([]), '.step')).rejects.toThrow(/bad STEP/);
  });
});
