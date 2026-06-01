import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initWasm, * as voxelWasm from 'brepjs-voxel-wasm';
import { initVoxel, windingNumbers, pointsInside, getActiveVoxelId } from '@/voxel/index.js';
import { unwrap, isErr } from '@/core/result.js';

// Unit cube [0,1]^3, outward-facing triangles (CCW from outside).
const VERTS = new Float32Array([
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
]);
// 12 triangles; the last two (indices 6,7 — the +z face) are dropped for the holey case.
const WATERTIGHT = new Uint32Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6,
  1, 6, 5,
]);
// +z face removed → non-watertight (the case ray-parity gets wrong).
const HOLEY = new Uint32Array([
  0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
]);

// Query points: cube center (inside) and a point above the (missing) top face.
const QUERIES = new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 2.0]);

beforeAll(async () => {
  const wasmPath = resolve(__dirname, '../packages/brepjs-voxel-wasm/pkg/index_bg.wasm');
  await initWasm({ module_or_path: readFileSync(wasmPath) });
  initVoxel(voxelWasm);
}, 30000);

describe('voxel sign engine (FWN keystone)', () => {
  it('registers the engine as the default domain', () => {
    expect(getActiveVoxelId()).toBe('voxel');
    expect(voxelWasm.version()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('errors on an unregistered engine id', () => {
    const result = windingNumbers({ vertices: VERTS, triangles: WATERTIGHT }, QUERIES, 'nope');
    expect(isErr(result)).toBe(true);
  });

  it('classifies a watertight cube exactly', () => {
    const [center, above] = unwrap(
      windingNumbers({ vertices: VERTS, triangles: WATERTIGHT }, QUERIES)
    );
    expect(center).toBeCloseTo(1.0, 5);
    expect(above).toBeCloseTo(0.0, 5);
  });

  it('still classifies the holey cube center as inside (the keystone)', () => {
    const [center, above] = unwrap(pointsInside({ vertices: VERTS, triangles: HOLEY }, QUERIES));
    // Center stays inside despite a whole missing face, where a ray cast up
    // through the hole would misclassify. Above the hole stays outside.
    expect(center).toBe(true);
    expect(above).toBe(false);
  });

  it('rejects mis-shaped query buffers with a validation error', () => {
    const result = windingNumbers(
      { vertices: VERTS, triangles: WATERTIGHT },
      new Float32Array([0, 0])
    );
    expect(isErr(result)).toBe(true);
  });

  it('errors on out-of-bounds triangle index instead of trapping in wasm', () => {
    // 100 >= 8 vertices: would panic in Rust without the bounds check.
    const badTris = new Uint32Array([0, 1, 100]);
    const result = windingNumbers({ vertices: VERTS, triangles: badTris }, QUERIES);
    expect(isErr(result)).toBe(true);
  });
});
