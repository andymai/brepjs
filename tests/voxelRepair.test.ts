import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initWasm, * as voxelWasm from 'brepjs-voxel-wasm';
import { initVoxel, repairMesh } from '@/voxel/index.js';
import { unwrap, isErr } from '@/core/result.js';

// Unit cube [0,1]^3, outward-facing triangles (CCW from outside).
const VERTS = new Float32Array([
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
]);
// +z face removed → 10 triangles, non-watertight (open hole on top).
const HOLEY = new Uint32Array([
  0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
]);

beforeAll(async () => {
  const wasmPath = resolve(__dirname, '../packages/brepjs-voxel-wasm/pkg/index_bg.wasm');
  await initWasm({ module_or_path: readFileSync(wasmPath) });
  initVoxel(voxelWasm);
}, 30000);

describe('voxel repair (FWN-signed SDF → Surface Nets)', () => {
  it('repairs the holey cube into a closed, well-formed mesh', () => {
    const out = unwrap(repairMesh({ vertices: VERTS, triangles: HOLEY }));

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

    // The hole is closed: the repaired surface has far more triangles than the
    // 10-triangle open input, and its bbox still hugs the unit cube.
    expect(out.triangles.length / 3).toBeGreaterThan(10);

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
    // Closing the top means the surface reaches up to ~z=1, not stopping below.
    expect(maxZ).toBeCloseTo(1.0, 1);
    expect(minZ).toBeCloseTo(0.0, 1);
    expect(minX).toBeCloseTo(0.0, 1);
    expect(maxX).toBeCloseTo(1.0, 1);
    expect(minY).toBeCloseTo(0.0, 1);
    expect(maxY).toBeCloseTo(1.0, 1);
  });

  it('errors on an out-of-bounds triangle index instead of trapping in wasm', () => {
    // 100 >= 8 vertices: would panic in Rust without the TS bounds check.
    const badTris = new Uint32Array([0, 1, 100]);
    const result = repairMesh({ vertices: VERTS, triangles: badTris });
    expect(isErr(result)).toBe(true);
  });

  it('errors on an empty mesh', () => {
    const result = repairMesh({ vertices: new Float32Array(), triangles: new Uint32Array() });
    expect(isErr(result)).toBe(true);
  });

  it('errors on a non-integer or out-of-range resolution', () => {
    expect(isErr(repairMesh({ vertices: VERTS, triangles: HOLEY }, { resolution: 0 }))).toBe(true);
    expect(isErr(repairMesh({ vertices: VERTS, triangles: HOLEY }, { resolution: 1.5 }))).toBe(
      true
    );
    expect(isErr(repairMesh({ vertices: VERTS, triangles: HOLEY }, { padding: 0 }))).toBe(true);
  });

  it('repairs at a LARGE resolution via the sparse tiled path (raised ceiling)', () => {
    // res 170 on the unit cube is ~174^3 ≈ 5.3M would-be-dense voxels, past the
    // dense routing threshold, so this drives the sparse tiled pipeline end-to-end
    // through wasm — a grid the old dense-only path would refuse near this size,
    // the sparse path completes. Proves the resolution ceiling rose.
    const out = unwrap(repairMesh({ vertices: VERTS, triangles: HOLEY }, { resolution: 170 }));
    expect(out.vertices.length).toBeGreaterThan(0);
    expect(out.triangles.length).toBeGreaterThan(0);
    expect(out.vertices.length % 3).toBe(0);
    expect(out.triangles.length % 3).toBe(0);

    // The surface still hugs the unit cube on all six sides (sparse == dense here).
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < out.vertices.length; i += 3) {
      for (let d = 0; d < 3; d++) {
        const v = out.vertices[i + d] as number;
        lo[d] = Math.min(lo[d] as number, v);
        hi[d] = Math.max(hi[d] as number, v);
      }
    }
    for (let d = 0; d < 3; d++) {
      expect(lo[d]).toBeCloseTo(0, 1);
      expect(hi[d]).toBeCloseTo(1, 1);
    }
  });

  it('returns err (not a wasm trap) when the band exceeds the sparse voxel cap', () => {
    // An absurd resolution makes even the near-surface band exceed MAX_ACTIVE_TILES;
    // the Rust JsError must surface as err() (refused in Phase-1 tile activation,
    // before any large allocation), not a wasm trap.
    const result = repairMesh({ vertices: VERTS, triangles: HOLEY }, { resolution: 3000 });
    expect(isErr(result)).toBe(true);
  });
});

// GLB round-trip is intentionally NOT tested here: the public GLB exporter
// (exportGlb) accepts ShapeMesh (faceGroups[].faceId + origin), and there is no
// public path that accepts a bare KernelMeshResult (faceGroups[].faceHash).
// Building such an adapter is out of scope for this v1 repair slice.
