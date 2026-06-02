import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initWasm, * as voxelWasm from 'brepjs-voxel-wasm';
import {
  initVoxel,
  offsetMesh,
  shellMesh,
  voxelBoolean,
  offsetShape,
  shellShape,
  voxelBooleanShapes,
  type VoxelMeshInput,
} from '@/voxel/index.js';
import { latticeInfillShape } from '@/lattice/index.js';
import { makeBaseBox } from '@/index.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import { unwrap, isErr } from '@/core/result.js';
import { initOC } from './setup.js';

// Watertight unit cube [0,1]^3, outward-facing triangles (CCW from outside).
const VERTS = new Float32Array([
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
]);
const CUBE_TRIS = new Uint32Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6,
  1, 6, 5,
]);

const UNIT_CUBE: VoxelMeshInput = { vertices: VERTS, triangles: CUBE_TRIS };

// A second unit cube translated +0.5 in x: overlaps UNIT_CUBE on [0.5,1].
const SHIFTED_VERTS = Float32Array.from(VERTS, (val, i) => (i % 3 === 0 ? val + 0.5 : val));
const SHIFTED_CUBE: VoxelMeshInput = { vertices: SHIFTED_VERTS, triangles: CUBE_TRIS };

// A unit cube translated +5 in x: fully disjoint from UNIT_CUBE.
const FAR_VERTS = Float32Array.from(VERTS, (val, i) => (i % 3 === 0 ? val + 5 : val));
const FAR_CUBE: VoxelMeshInput = { vertices: FAR_VERTS, triangles: CUBE_TRIS };

interface Bbox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function bbox(out: KernelMeshResult): Bbox {
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
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

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
  await initOC();
}, 30000);

describe('offsetMesh (true-SDF iso-level shift)', () => {
  it('grows the unit cube outward by ~0.2 on every side for distance +0.2', () => {
    const out = unwrap(offsetMesh(UNIT_CUBE, 0.2));
    assertWellFormed(out);

    // Outward offset pushes each face out by ~distance. Surface Nets + the
    // coarse grid blur exact face positions, so allow ~1 decimal of slack.
    const b = bbox(out);
    expect(b.minX).toBeCloseTo(-0.2, 1);
    expect(b.minY).toBeCloseTo(-0.2, 1);
    expect(b.minZ).toBeCloseTo(-0.2, 1);
    expect(b.maxX).toBeCloseTo(1.2, 1);
    expect(b.maxY).toBeCloseTo(1.2, 1);
    expect(b.maxZ).toBeCloseTo(1.2, 1);
  });

  it('shrinks the unit cube inward by ~0.2 on every side for distance -0.2', () => {
    const out = unwrap(offsetMesh(UNIT_CUBE, -0.2));
    assertWellFormed(out);

    const b = bbox(out);
    expect(b.minX).toBeCloseTo(0.2, 1);
    expect(b.minY).toBeCloseTo(0.2, 1);
    expect(b.minZ).toBeCloseTo(0.2, 1);
    expect(b.maxX).toBeCloseTo(0.8, 1);
    expect(b.maxY).toBeCloseTo(0.8, 1);
    expect(b.maxZ).toBeCloseTo(0.8, 1);
  });

  it('errs on a non-finite distance', () => {
    expect(isErr(offsetMesh(UNIT_CUBE, Number.NaN))).toBe(true);
    expect(isErr(offsetMesh(UNIT_CUBE, Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe('shellMesh (inward hollow)', () => {
  it('hollows the cube into a shell with more triangles than a solid surface', () => {
    const solid = unwrap(offsetMesh(UNIT_CUBE, 0));
    const shelled = unwrap(shellMesh(UNIT_CUBE, 0.15));
    assertWellFormed(shelled);

    // A hollow shell has both an outer and an inner wall → strictly more
    // triangles than the contoured solid surface alone.
    expect(shelled.triangles.length).toBeGreaterThan(solid.triangles.length);
  });

  it('errs on a non-positive thickness', () => {
    expect(isErr(shellMesh(UNIT_CUBE, 0))).toBe(true);
    expect(isErr(shellMesh(UNIT_CUBE, -0.15))).toBe(true);
  });
});

describe('voxelBoolean (CSG on a shared grid)', () => {
  it('unions two overlapping cubes into a non-empty mesh spanning both', () => {
    const out = unwrap(voxelBoolean(UNIT_CUBE, SHIFTED_CUBE, 'union'));
    assertWellFormed(out);

    // The union spans x in [0, 1.5] — wider than either operand alone.
    const b = bbox(out);
    expect(b.minX).toBeCloseTo(0.0, 1);
    expect(b.maxX).toBeCloseTo(1.5, 1);
  });

  it('produces a non-empty mesh for difference (A − B)', () => {
    const out = unwrap(voxelBoolean(UNIT_CUBE, SHIFTED_CUBE, 'difference'));
    assertWellFormed(out);
  });

  it('intersects to a non-empty mesh narrower than either operand', () => {
    const out = unwrap(voxelBoolean(UNIT_CUBE, SHIFTED_CUBE, 'intersection'));
    assertWellFormed(out);

    // The overlap is x in [0.5, 1] — its x-extent is far below the unit width.
    const b = bbox(out);
    expect(b.maxX - b.minX).toBeLessThan(0.9);
  });

  it('errs (degenerate result) when intersecting disjoint meshes', () => {
    expect(isErr(voxelBoolean(UNIT_CUBE, FAR_CUBE, 'intersection'))).toBe(true);
  });

  it('errs on an out-of-bounds triangle index in either operand', () => {
    const badTris = new Uint32Array([0, 1, 100]);
    expect(
      isErr(voxelBoolean({ vertices: VERTS, triangles: badTris }, SHIFTED_CUBE, 'union'))
    ).toBe(true);
    expect(isErr(voxelBoolean(UNIT_CUBE, { vertices: VERTS, triangles: badTris }, 'union'))).toBe(
      true
    );
  });
});

describe('B-rep shape conveniences', () => {
  it('latticeInfillShape fills a brepjs box with a gyroid lattice', () => {
    const box = makeBaseBox(1, 1, 1);
    const out = unwrap(latticeInfillShape(box, { type: 'gyroid', period: 0.4, thickness: 0.15 }));
    assertWellFormed(out);
    expect(out.triangles.length / 3).toBeGreaterThan(50);
  });

  it('offsetShape grows a brepjs box outward', () => {
    const box = makeBaseBox(1, 1, 1);
    const out = unwrap(offsetShape(box, 0.2));
    assertWellFormed(out);
  });

  it('shellShape hollows a brepjs box', () => {
    const box = makeBaseBox(1, 1, 1);
    const out = unwrap(shellShape(box, 0.15));
    assertWellFormed(out);
  });

  it('voxelBooleanShapes unions two brepjs boxes', () => {
    const a = makeBaseBox(1, 1, 1);
    const b = makeBaseBox(1, 1, 1);
    const out = unwrap(voxelBooleanShapes(a, b, 'union'));
    assertWellFormed(out);
  });
});
