import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, sphere, meshLODsProgressive } from '@/index.js';
import type { ShapeMesh, MeshLevelFn } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const fakeMesh = (): ShapeMesh => ({
  vertices: new Float32Array(),
  normals: new Float32Array(),
  triangles: new Uint32Array(),
  uvs: new Float32Array(),
  faceGroups: [],
});

describe('meshLODsProgressive', () => {
  it('meshes and delivers levels coarse -> fine, calling onLevel in order', async () => {
    const meshedOrder: number[] = [];
    const delivered: Array<[number, number]> = [];
    const meshLevel: MeshLevelFn = (_s, tolerance) => {
      meshedOrder.push(tolerance);
      return fakeMesh();
    };

    const levels = await meshLODsProgressive(box(10, 10, 10), {
      tolerances: [0.05, 0.5, 0.2], // unsorted on purpose
      meshLevel,
      onLevel: (level, index) => delivered.push([index, level.tolerance]),
    });

    // Ladder is sorted coarse -> fine before meshing.
    expect(levels.map((l) => l.tolerance)).toEqual([0.5, 0.2, 0.05]);
    expect(meshedOrder).toEqual([0.5, 0.2, 0.05]); // coarsest meshed first
    expect(delivered).toEqual([
      [0, 0.5],
      [1, 0.2],
      [2, 0.05],
    ]);
  });

  it('supports an async (worker-like) meshLevel', async () => {
    const meshLevel: MeshLevelFn = async () => {
      await Promise.resolve();
      return fakeMesh();
    };
    const levels = await meshLODsProgressive(box(10, 10, 10), {
      tolerances: [1, 0.1],
      meshLevel,
    });
    expect(levels.length).toBe(2);
  });

  it('a pre-aborted signal yields no levels', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const levels = await meshLODsProgressive(box(10, 10, 10), {
      tolerances: [1, 0.1, 0.01],
      meshLevel: fakeMesh,
      signal: ctrl.signal,
    });
    expect(levels).toEqual([]);
  });

  it('aborting during a level delivers that level and stops refinement', async () => {
    const ctrl = new AbortController();
    const meshLevel: MeshLevelFn = () => {
      ctrl.abort(); // abort while meshing the first level
      return fakeMesh();
    };
    const levels = await meshLODsProgressive(box(10, 10, 10), {
      tolerances: [1, 0.1, 0.01],
      meshLevel,
      signal: ctrl.signal,
    });
    expect(levels.length).toBe(1); // first level delivered, no further levels
  });

  it('default meshLevel meshes real geometry, coarse -> fine', async () => {
    const levels = await meshLODsProgressive(sphere(10), { levels: 3 });
    expect(levels.length).toBe(3);
    const counts = levels.map((l) => l.mesh.triangles.length);
    expect(counts.every((n) => n > 0)).toBe(true);
    // non-decreasing triangle count coarse -> fine
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
  });

  it('a meshLevel that rejects on abort still resolves with the prior levels', async () => {
    const ctrl = new AbortController();
    let calls = 0;
    const meshLevel: MeshLevelFn = async () => {
      await Promise.resolve(); // simulate the worker round-trip
      calls += 1;
      if (calls === 1) return fakeMesh(); // first level succeeds
      ctrl.abort(); // a worker-backed meshLevel observes the abort...
      throw new Error('aborted'); // ...and rejects
    };
    const levels = await meshLODsProgressive(box(10, 10, 10), {
      tolerances: [1, 0.1, 0.01],
      meshLevel,
      signal: ctrl.signal,
    });
    expect(levels.length).toBe(1); // first level kept; abort rejection swallowed as a stop
  });

  it('rethrows a genuine meshLevel error (not an abort)', async () => {
    const meshLevel: MeshLevelFn = () => {
      throw new Error('kernel exploded');
    };
    await expect(
      meshLODsProgressive(box(10, 10, 10), { tolerances: [1], meshLevel })
    ).rejects.toThrow('kernel exploded');
  });
});
