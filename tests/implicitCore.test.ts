import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initWasm, * as voxelWasm from 'brepjs-voxel-wasm';
import { initVoxel } from '@/voxel/index.js';
import { sdfSphere, sdfBox, sdfCone, sdfCylinder } from '@/index.js';
import type { SdfHandle } from '@/index.js';
import { unwrap, isErr } from '@/core/result.js';
import { initOC } from './setup.js';

beforeAll(async () => {
  const wasmPath = resolve(__dirname, '../packages/brepjs-voxel-wasm/pkg/index_bg.wasm');
  await initWasm({ module_or_path: readFileSync(wasmPath) });
  initVoxel(voxelWasm);
  await initOC();
}, 30000);

function bboxOf(vertices: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const v = vertices[i + axis] as number;
      if (v < (min[axis] as number)) min[axis] = v;
      if (v > (max[axis] as number)) max[axis] = v;
    }
  }
  return { min, max };
}

describe('implicit SDF builder (field-first authoring against the real wasm engine)', () => {
  it('rasterizes a sphere to a non-empty mesh with a sane bounding box', () => {
    using s = unwrap(sdfSphere(1.5));
    using field = unwrap(s.rasterize({ resolution: 28, padding: 2 }));
    const result = field.contour();
    expect(result.vertices.length).toBeGreaterThan(0);
    expect(result.triangles.length).toBeGreaterThan(0);
    expect(result.triangles.length % 3).toBe(0);

    const { min, max } = bboxOf(result.vertices);
    for (let axis = 0; axis < 3; axis++) {
      const halfExtent = ((max[axis] as number) - (min[axis] as number)) / 2;
      expect(halfExtent).toBeCloseTo(1.5, 0);
    }
  });

  it('composes a CSG difference (box minus sphere) into a non-empty solid', () => {
    using outer = unwrap(sdfBox(1, 1, 1));
    using hole = unwrap(sdfSphere(0.6));
    using cut = outer.difference(hole);
    using field = unwrap(cut.rasterize({ resolution: 32, padding: 2 }));
    const mesh = field.contour();
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
  });

  it('offsets a rasterized field outward (grows the contoured bbox)', () => {
    using base = unwrap(sdfSphere(1));
    using grown = base.offset(0.4);
    using field = unwrap(grown.rasterize({ resolution: 28, padding: 3 }));
    const mesh = field.contour();
    const { min, max } = bboxOf(mesh.vertices);
    const halfExtent = ((max[0] as number) - (min[0] as number)) / 2;
    expect(halfExtent).toBeGreaterThan(1.2);
  });

  it('reports an error for an over-large grid rather than throwing', () => {
    using s = unwrap(sdfSphere(1));
    const res = s.rasterize({ resolution: 2000, padding: 2 });
    expect(isErr(res)).toBe(true);
  });

  it('builds and rasterizes the skeleton chamber v0 (hollow cone + cooling channels)', () => {
    using chamber = buildChamber();
    using field = unwrap(chamber.rasterize({ resolution: 40, padding: 3 }));
    const mesh = field.contour();

    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
    expect(mesh.triangles.length % 3).toBe(0);

    // A sane chamber bbox: the cone body spans ~[-2,2] radially and ~[-2,2] axially.
    const { min, max } = bboxOf(mesh.vertices);
    for (let axis = 0; axis < 3; axis++) {
      const extent = (max[axis] as number) - (min[axis] as number);
      expect(extent).toBeGreaterThan(1);
      expect(extent).toBeLessThan(10);
    }
  });
});

/**
 * The chamber skeleton (mirrors the rust `chamber_expr` fixture): a capped cone
 * shelled into a hollow body, unioned with four cooling channels translated around
 * the axis. Intermediate handles are disposed eagerly; the returned handle owns the
 * final tree and is disposed by the caller.
 */
function buildChamber(): SdfHandle {
  using cone = unwrap(sdfCone(2.0, 4.0));
  using body = cone.shell(0.25);
  let acc: SdfHandle = body.translate(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    using channel = unwrap(sdfCylinder(0.3, 4.0));
    using placed = channel.translate(1.4 * Math.cos(angle), 1.4 * Math.sin(angle), 0);
    const next = acc.union(placed);
    acc[Symbol.dispose]();
    acc = next;
  }
  return acc;
}
