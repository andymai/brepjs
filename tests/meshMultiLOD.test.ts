import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, sphere, meshMultiLOD, toLODGeometryData } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('meshMultiLOD', () => {
  it('produces coarse and fine meshes', () => {
    const b = box(10, 10, 10);
    const lod = meshMultiLOD(b);
    expect(lod.coarse.vertices.length).toBeGreaterThan(0);
    expect(lod.fine.vertices.length).toBeGreaterThan(0);
    // Fine mesh should have more vertices than coarse
    expect(lod.fine.vertices.length).toBeGreaterThanOrEqual(lod.coarse.vertices.length);
  });

  it('sphere fine mesh has significantly more triangles', () => {
    const s = sphere(10);
    const lod = meshMultiLOD(s, {
      coarseTolerance: 2,
      fineTolerance: 0.1,
    });
    // Sphere with tol=2 should be very coarse, tol=0.1 should be much finer
    expect(lod.fine.triangles.length).toBeGreaterThan(lod.coarse.triangles.length * 2);
  });

  it('respects custom tolerances', () => {
    const b = box(10, 10, 10);
    const defaultLOD = meshMultiLOD(b);
    const customLOD = meshMultiLOD(b, { coarseTolerance: 1, fineTolerance: 0.01 });
    // Custom fine should have at least as many vertices as default fine
    expect(customLOD.fine.vertices.length).toBeGreaterThanOrEqual(defaultLOD.fine.vertices.length);
  });
});

describe('toLODGeometryData', () => {
  it('converts multiLOD to Three.js LOD format', () => {
    const lod = meshMultiLOD(box(10, 10, 10));
    const data = toLODGeometryData(lod);
    expect(data.coarse.position.length).toBeGreaterThan(0);
    expect(data.fine.position.length).toBeGreaterThan(0);
    expect(data.coarseDistance).toBe(50);
    expect(data.fineDistance).toBe(0);
  });

  it('accepts custom distances', () => {
    const lod = meshMultiLOD(box(10, 10, 10));
    const data = toLODGeometryData(lod, { coarse: 100, fine: 10 });
    expect(data.coarseDistance).toBe(100);
    expect(data.fineDistance).toBe(10);
  });

  it('produces valid BufferGeometryData', () => {
    const lod = meshMultiLOD(box(10, 10, 10));
    const data = toLODGeometryData(lod);
    const fine = data.fine;
    // Position should be Float32Array with xyz triples
    expect(fine.position.length % 3).toBe(0);
    // Normal should match position length
    expect(fine.normal.length).toBe(fine.position.length);
    // Index should have triangle triples
    expect(fine.index.length % 3).toBe(0);
  });
});
