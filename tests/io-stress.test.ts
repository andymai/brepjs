import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  mesh,
  translate,
  compound,
  exportThreeMF,
  exportGltf,
  exportGlb,
  exportOBJ,
  exportSTEP,
  exportSTL,
} from '@/index.js';
import type { ShapeMesh, Compound } from '@/index.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let largeMesh: ShapeMesh;
let largeShape: Compound;

beforeAll(async () => {
  await initKernel();

  // Build a compound of 15x15 = 225 boxes (no fusion — fast to create)
  // Each box is 1x1x1, spaced 2 apart → ~50k+ vertices after meshing
  const shapes = [];
  for (let x = 0; x < 15; x++) {
    for (let y = 0; y < 15; y++) {
      shapes.push(translate(box(1, 1, 1), [x * 2, y * 2, 0]));
    }
  }
  largeShape = compound(shapes);
  largeMesh = mesh(largeShape, { tolerance: 0.1 });
}, 60000);

// ---------------------------------------------------------------------------
// Large model export stress tests
// ---------------------------------------------------------------------------

describe('large model export', () => {
  it('mesh has >1k vertices', () => {
    expect(largeMesh.vertices.length / 3).toBeGreaterThan(1000);
  });

  it('exports to 3MF', () => {
    const buf = exportThreeMF(largeMesh);
    expect(buf.byteLength).toBeGreaterThan(100_000);
  }, 30000);

  it('exports to glTF JSON', () => {
    const json = exportGltf(largeMesh);
    expect(json.length).toBeGreaterThan(100_000);
    expect(() => JSON.parse(json)).not.toThrow();
  }, 30000);

  it('exports to GLB', () => {
    const buf = exportGlb(largeMesh);
    expect(buf.byteLength).toBeGreaterThan(50_000);
  }, 30000);

  it('exports to OBJ', () => {
    const obj = exportOBJ(largeMesh);
    expect(obj.length).toBeGreaterThan(100_000);
    expect(obj).toContain('v ');
    expect(obj).toContain('f ');
  }, 30000);

  it('exports to STEP', () => {
    const result = exportSTEP(largeShape);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBeGreaterThan(10_000);
    }
  }, 60000);

  it('exports to STL', () => {
    const result = exportSTL(largeShape);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBeGreaterThan(10_000);
    }
  }, 60000);
});

// ---------------------------------------------------------------------------
// Concurrent export safety
// ---------------------------------------------------------------------------

describe('concurrent export safety', () => {
  it('sequential rapid-fire 3MF exports produce identical output', () => {
    const baseline = exportThreeMF(largeMesh);
    for (let i = 0; i < 10; i++) {
      const result = exportThreeMF(largeMesh);
      expect(result.byteLength).toBe(baseline.byteLength);
      const a = new Uint8Array(baseline);
      const b = new Uint8Array(result);
      expect(a).toEqual(b);
    }
  }, 30000);

  it('sequential rapid-fire glTF exports produce identical output', () => {
    const baseline = exportGltf(largeMesh);
    for (let i = 0; i < 10; i++) {
      expect(exportGltf(largeMesh)).toBe(baseline);
    }
  }, 30000);

  it('sequential rapid-fire OBJ exports produce identical output', () => {
    const baseline = exportOBJ(largeMesh);
    for (let i = 0; i < 10; i++) {
      expect(exportOBJ(largeMesh)).toBe(baseline);
    }
  }, 30000);

  it('cross-format interleaving produces correct output', () => {
    const threemfBaseline = exportThreeMF(largeMesh);
    const gltfBaseline = exportGltf(largeMesh);
    const objBaseline = exportOBJ(largeMesh);
    const glbBaseline = exportGlb(largeMesh);

    for (let i = 0; i < 5; i++) {
      expect(new Uint8Array(exportThreeMF(largeMesh))).toEqual(new Uint8Array(threemfBaseline));
      expect(exportGltf(largeMesh)).toBe(gltfBaseline);
      expect(exportOBJ(largeMesh)).toBe(objBaseline);
      expect(new Uint8Array(exportGlb(largeMesh))).toEqual(new Uint8Array(glbBaseline));
    }
  }, 30000);

  it('Promise.all calling pattern does not corrupt output', async () => {
    const [threemf, gltf, obj, glb] = await Promise.all([
      Promise.resolve(exportThreeMF(largeMesh)),
      Promise.resolve(exportGltf(largeMesh)),
      Promise.resolve(exportOBJ(largeMesh)),
      Promise.resolve(exportGlb(largeMesh)),
    ]);

    expect(threemf.byteLength).toBeGreaterThan(0);
    expect(gltf.length).toBeGreaterThan(0);
    expect(obj.length).toBeGreaterThan(0);
    expect(glb.byteLength).toBeGreaterThan(0);

    expect(() => JSON.parse(gltf)).not.toThrow();
  }, 30000);

  it('kernel exports (STEP/STL) interleaved with mesh exports', () => {
    const stepResult = exportSTEP(largeShape);
    const threemf = exportThreeMF(largeMesh);
    const stlResult = exportSTL(largeShape);
    const gltf = exportGltf(largeMesh);

    expect(stepResult.ok).toBe(true);
    expect(stlResult.ok).toBe(true);
    expect(threemf.byteLength).toBeGreaterThan(0);
    expect(gltf.length).toBeGreaterThan(0);
  }, 60000);
});
