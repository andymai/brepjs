import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { importOBJ, measureVolume, unwrap } from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('importOBJ', () => {
  it('imports a cube from OBJ', async () => {
    const buf = readFileSync(join(__dirname, 'fixtures/test-cube.obj'));
    const blob = new Blob([buf]);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = unwrap(measureVolume(result.value));
    expect(vol).toBeCloseTo(1, 1);
  });

  it('fails on empty input', async () => {
    const blob = new Blob(['']);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(false);
  });

  it('handles triangulated faces', async () => {
    const obj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 0 1\nf 1 2 3\nf 1 3 4\n';
    const blob = new Blob([obj]);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(true);
  });

  it('handles negative (relative) face indices', async () => {
    // 4 vertices, face uses negative indices: -4 -3 -2 means "last 4, last 3, last 2"
    const obj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 0 1\nf -4 -3 -2\nf -4 -2 -1\n';
    const blob = new Blob([obj]);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(true);
  });

  it('returns error when face indices reference out-of-range vertices', async () => {
    // Face references vertex 100 which doesn't exist — all triangles skip → no valid faces
    const obj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nf 100 200 300\n';
    const blob = new Blob([obj]);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(false);
  });

  it('returns error for vertices-only OBJ (no faces)', async () => {
    const obj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\n';
    const blob = new Blob([obj]);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(false);
  });
});
