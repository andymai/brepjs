import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { initKernel } from './setup.js';
import {
  getBounds,
  getKernel,
  getSolids,
  importOBJ,
  isCompound,
  isShape3D,
  isSolid,
  measureVolume,
  unwrap,
} from '@/index.js';
import type { Shape3D } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** A 10 mm right tetrahedron at `x`, its faces using absolute indices from `first`. */
function tetrahedron(x: number, first: number): string[] {
  const [a, b, c, d] = [first, first + 1, first + 2, first + 3];
  return [
    `v ${x} 0 0`,
    `v ${x + 10} 0 0`,
    `v ${x} 10 0`,
    `v ${x} 0 10`,
    `f ${a} ${c} ${b}`,
    `f ${a} ${b} ${d}`,
    `f ${a} ${d} ${c}`,
    `f ${b} ${c} ${d}`,
  ];
}

const twoTetrahedra = [...tetrahedron(0, 1), ...tetrahedron(50, 5)].join('\n');

describe('importOBJ', () => {
  it('imports a cube from OBJ', async () => {
    const buf = readFileSync(join(__dirname, 'fixtures/test-cube.obj'));
    const blob = new Blob([buf]);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (!isShape3D(result.value)) throw new Error('expected a 3D shape');
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

  it('resolves relative face indices against the vertices defined so far', async () => {
    // Two 10 mm right tetrahedra, each written as 4 vertices then 4 faces with
    // relative indices; -4 names the first vertex of the tetrahedron just written.
    const tetra = (x: number) => [
      `v ${x} 0 0`,
      `v ${x + 10} 0 0`,
      `v ${x} 10 0`,
      `v ${x} 0 10`,
      'f -4 -2 -3',
      'f -4 -3 -1',
      'f -4 -1 -2',
      'f -3 -2 -1',
    ];
    const obj = [...tetra(0), ...tetra(50)].join('\n');
    using imported = unwrap(await importOBJ(new Blob([obj])));
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000 / 6, 6);
    const bounds = getBounds(imported);
    expect(bounds.xMin).toBeCloseTo(0, 6);
    expect(bounds.xMax).toBeCloseTo(60, 6);
  });

  it('imports disjoint closed bodies as a compound of solids', async () => {
    using imported = unwrap(await importOBJ(new Blob([twoTetrahedra])));
    expect(isCompound(imported)).toBe(true);
    expect(getSolids(imported)).toHaveLength(2);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000 / 6, 6);
  });

  it('splits bodies when the kernel returns the sewn compound instead of throwing', async () => {
    // opencascade.js's sewAndSolidify hands back the sewn shape when it is not a
    // single shell; mimic that contract on whichever kernel runs the test.
    const kernel = getKernel();
    const original = kernel.sewAndSolidify.bind(kernel);
    const spy = vi.spyOn(kernel, 'sewAndSolidify').mockImplementation((faces, tolerance) => {
      const sewn = kernel.sew(faces, tolerance);
      if (kernel.shapeType(sewn) === 'compound') return sewn;
      kernel.dispose(sewn);
      return original(faces, tolerance);
    });
    try {
      using imported = unwrap(await importOBJ(new Blob([twoTetrahedra])));
      expect(getSolids(imported)).toHaveLength(2);
      expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000 / 6, 6);
    } finally {
      spy.mockRestore();
    }
  });

  it('reads tab-separated vertex and face lines', async () => {
    const obj = [
      'v\t0\t0\t0',
      'v\t10\t0\t0',
      'v\t0\t10\t0',
      'v\t0\t0\t10',
      'f\t1\t3\t2',
      'f\t1\t2\t4',
      'f\t1\t4\t3',
      'f\t2\t3\t4',
    ].join('\n');
    using imported = unwrap(await importOBJ(new Blob([obj])));
    expect(isSolid(imported)).toBe(true);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(1000 / 6, 6);
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
