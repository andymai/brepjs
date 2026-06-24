import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, sphere, meshLODs, toLODGeometryLevels } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const triCount = (m: { triangles: { length: number } }): number => m.triangles.length / 3;
const desc = (xs: number[]): boolean =>
  JSON.stringify([...xs].sort((a, b) => b - a)) === JSON.stringify(xs);
const asc = (xs: number[]): boolean =>
  JSON.stringify([...xs].sort((a, b) => a - b)) === JSON.stringify(xs);

describe('meshLODs', () => {
  it('produces N levels coarse -> fine: tolerances descending, triangle counts non-decreasing', () => {
    const lods = meshLODs(sphere(10), { levels: 3 });
    expect(lods.length).toBe(3);
    expect(desc(lods.map((l) => l.tolerance))).toBe(true);
    expect(asc(lods.map((l) => triCount(l.mesh)))).toBe(true);
  });

  it('defaults to 3 levels', () => {
    expect(meshLODs(box(10, 10, 10)).length).toBe(3);
  });

  it('honors levels: 1', () => {
    expect(meshLODs(sphere(10), { levels: 1 }).length).toBe(1);
  });

  it('derives scale-relative tolerances: a 10x larger shape gets ~10x tolerances, similar triangle counts', () => {
    const small = meshLODs(sphere(10), { levels: 3 });
    const big = meshLODs(sphere(100), { levels: 3 });

    const smallFinest = Math.min(...small.map((l) => l.tolerance));
    const bigFinest = Math.min(...big.map((l) => l.tolerance));
    expect(bigFinest / smallFinest).toBeCloseTo(10, 0); // tolerance tracks the bbox diagonal

    // ...so the finest mesh has ~the same triangle count regardless of absolute size.
    const cSmall = Math.max(...small.map((l) => triCount(l.mesh)));
    const cBig = Math.max(...big.map((l) => triCount(l.mesh)));
    expect(Math.abs(cBig - cSmall) / cSmall).toBeLessThan(0.2);
  });

  it('respects explicit absolute tolerances, sorted coarse -> fine', () => {
    const lods = meshLODs(sphere(10), { tolerances: [0.05, 2, 0.5] });
    expect(lods.map((l) => l.tolerance)).toEqual([2, 0.5, 0.05]);
  });

  it('respects spacing between levels', () => {
    const tols = meshLODs(box(10, 10, 10), { levels: 3, spacing: 8 }).map((l) => l.tolerance);
    // 3 levels at spacing 8 -> coarsest / finest = 8^2 = 64
    expect(Math.max(...tols) / Math.min(...tols)).toBeCloseTo(64, 5);
  });

  it('angular tolerance is coarser on coarser levels (capped at 1 rad)', () => {
    const ang = meshLODs(sphere(10), { levels: 3 }).map((l) => l.angularTolerance);
    expect(desc(ang)).toBe(true); // coarse -> fine: larger angle first
    expect(Math.max(...ang)).toBeLessThanOrEqual(1);
  });

  it('returns coarse -> fine even when spacing < 1', () => {
    const tols = meshLODs(box(10, 10, 10), { levels: 3, spacing: 0.5 }).map((l) => l.tolerance);
    expect(desc(tols)).toBe(true);
  });
});

describe('toLODGeometryLevels', () => {
  it('maps N LOD meshes to THREE.LOD levels, finest at distance 0', () => {
    const levels = toLODGeometryLevels(meshLODs(box(10, 10, 10), { levels: 3 }));
    expect(levels.length).toBe(3);
    // coarse -> fine input; default step 50 -> coarsest 100, finest 0.
    expect(levels.map((l) => l.distance)).toEqual([100, 50, 0]);
    // every level is valid geometry (xyz triples, triangle-index triples)
    expect(levels.map((l) => l.geometry.position.length % 3)).toEqual([0, 0, 0]);
    expect(levels.map((l) => l.geometry.index.length % 3)).toEqual([0, 0, 0]);
  });

  it('honors custom step and explicit distances', () => {
    const lods = meshLODs(box(10, 10, 10), { levels: 2 });
    expect(toLODGeometryLevels(lods, { step: 30 }).map((l) => l.distance)).toEqual([30, 0]);
    expect(toLODGeometryLevels(lods, { distances: [9, 1] }).map((l) => l.distance)).toEqual([9, 1]);
  });

  it('throws when distances length does not match the level count', () => {
    const lods = meshLODs(box(10, 10, 10), { levels: 3 });
    expect(() => toLODGeometryLevels(lods, { distances: [30] })).toThrow('one entry per level');
  });
});
