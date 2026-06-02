import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initWasm, * as voxelWasm from 'brepjs-voxel-wasm';
import { initVoxel } from '@/voxel/index.js';
import { latticeInfill, tpmsLattice, type LatticeType } from '@/lattice/index.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import { unwrap, isErr } from '@/core/result.js';

// Unit cube [0,1]^3, outward-facing triangles (CCW from outside) — watertight.
const VERTS = new Float32Array([
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
]);
const CUBE_TRIS = new Uint32Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6,
  1, 6, 5,
]);

function assertWellFormed(out: KernelMeshResult): void {
  expect(out.vertices.length).toBeGreaterThan(0);
  expect(out.triangles.length).toBeGreaterThan(0);
  expect(out.vertices.length % 3).toBe(0);
  expect(out.triangles.length % 3).toBe(0);

  const vertexCount = out.vertices.length / 3;
  for (let i = 0; i < out.triangles.length; i++) {
    const idx = out.triangles[i];
    expect(idx).toBeDefined();
    expect(idx).toBeLessThan(vertexCount);
  }

  expect(out.normals.length).toBe(out.vertices.length);
  expect(out.uvs.length).toBe(vertexCount * 2);

  expect(out.faceGroups).toHaveLength(1);
  const group = out.faceGroups[0];
  expect(group).toBeDefined();
  if (group) {
    expect(group.start).toBe(0);
    expect(group.count).toBe(out.triangles.length / 3);
    expect(group.faceHash).toBe(0);
  }
}

beforeAll(async () => {
  const wasmPath = resolve(__dirname, '../packages/brepjs-voxel-wasm/pkg/index_bg.wasm');
  await initWasm({ module_or_path: readFileSync(wasmPath) });
  initVoxel(voxelWasm);
}, 30000);

describe('lattice infill (TPMS field ∩ FWN-signed solid → Surface Nets)', () => {
  it('fills the unit cube with a gyroid lattice, bbox within the cube', () => {
    const out = unwrap(
      latticeInfill(
        { vertices: VERTS, triangles: CUBE_TRIS },
        { type: 'gyroid', period: 0.5, thickness: 0.15 }
      )
    );

    assertWellFormed(out);
    // A gyroid filling the unit cube yields many cells → hundreds of triangles.
    expect(out.triangles.length / 3).toBeGreaterThan(100);

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < out.vertices.length; i += 3) {
      const x = out.vertices[i] ?? 0;
      const y = out.vertices[i + 1] ?? 0;
      const z = out.vertices[i + 2] ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    // The infill sits within the unit cube (loose precision — the field clips
    // near, not exactly at, the cube faces).
    expect(minX).toBeCloseTo(0.0, 0);
    expect(minY).toBeCloseTo(0.0, 0);
    expect(minZ).toBeCloseTo(0.0, 0);
    expect(maxX).toBeCloseTo(1.0, 0);
    expect(maxY).toBeCloseTo(1.0, 0);
    expect(maxZ).toBeCloseTo(1.0, 0);
  });

  it.each<LatticeType>(['gyroid', 'schwarzP', 'diamond'])(
    'produces a non-empty infill mesh for the %s family',
    (type) => {
      const out = unwrap(
        latticeInfill(
          { vertices: VERTS, triangles: CUBE_TRIS },
          { type, period: 0.5, thickness: 0.15 }
        )
      );
      assertWellFormed(out);
    }
  );

  it('errors on a non-positive period', () => {
    expect(
      isErr(
        latticeInfill(
          { vertices: VERTS, triangles: CUBE_TRIS },
          { type: 'gyroid', period: 0, thickness: 0.15 }
        )
      )
    ).toBe(true);
  });

  it('errors on a non-positive thickness', () => {
    expect(
      isErr(
        latticeInfill(
          { vertices: VERTS, triangles: CUBE_TRIS },
          { type: 'gyroid', period: 0.5, thickness: 0 }
        )
      )
    ).toBe(true);
  });

  it('errors on padding below 1', () => {
    expect(
      isErr(
        latticeInfill(
          { vertices: VERTS, triangles: CUBE_TRIS },
          { type: 'gyroid', period: 0.5, thickness: 0.15, padding: 0 }
        )
      )
    ).toBe(true);
  });

  it('errors on an out-of-bounds triangle index instead of trapping in wasm', () => {
    const badTris = new Uint32Array([0, 1, 100]);
    expect(
      isErr(
        latticeInfill(
          { vertices: VERTS, triangles: badTris },
          { type: 'gyroid', period: 0.5, thickness: 0.15 }
        )
      )
    ).toBe(true);
  });
});

describe('tpms lattice (box-clipped TPMS → Surface Nets)', () => {
  it('contours a schwarzP lattice over the unit box', () => {
    const out = unwrap(
      tpmsLattice(
        { min: [0, 0, 0], max: [1, 1, 1] },
        { type: 'schwarzP', period: 0.5, thickness: 0.15 }
      )
    );
    assertWellFormed(out);
  });

  it('clips the lattice to the requested box (no padding overrun)', () => {
    const out = unwrap(
      tpmsLattice(
        { min: [0, 0, 0], max: [1, 1, 1] },
        { type: 'gyroid', period: 0.4, thickness: 0.15, resolution: 16 }
      )
    );
    assertWellFormed(out);
    // The box SDF clip bounds the lattice at [0,1]; before the clip it ran the
    // full padding ring past the box. Allow ~1 voxel of Surface Nets slack.
    const tol = 0.1;
    for (let i = 0; i < out.vertices.length; i++) {
      const v = out.vertices[i] ?? 0;
      expect(v).toBeGreaterThanOrEqual(-tol);
      expect(v).toBeLessThanOrEqual(1 + tol);
    }
  });

  it('errors when min >= max on any axis', () => {
    expect(
      isErr(
        tpmsLattice(
          { min: [0, 0, 0], max: [1, 0, 1] },
          { type: 'schwarzP', period: 0.5, thickness: 0.15 }
        )
      )
    ).toBe(true);
  });
});
