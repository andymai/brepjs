import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initWasm, * as voxelWasm from 'brepjs-voxel-wasm';
import {
  initVoxel,
  voxelField,
  voxelBooleanField,
  fieldBoolean,
  fieldOffset,
  fieldShell,
  fieldReinit,
  fieldContour,
  voxelFieldFromShape,
} from '@/voxel/index.js';
import type { VoxelMeshInput } from '@/voxel/index.js';
import { makeBaseBox } from '@/index.js';
import { unwrap, isErr, isOk, andThen } from '@/core/result.js';
import { getDisposalStats, resetDisposalStats } from '@/core/disposal.js';
import { initOC } from './setup.js';

// Axis-aligned box [min,max] as flat triangle soup (outward CCW). Reused to make
// two overlapping operands and to reason about bbox growth under offset.
function box(min: [number, number, number], max: [number, number, number]): VoxelMeshInput {
  const [a, b, c] = min;
  const [d, e, f] = max;
  const vertices = new Float32Array([
    a,
    b,
    c,
    d,
    b,
    c,
    d,
    e,
    c,
    a,
    e,
    c,
    a,
    b,
    f,
    d,
    b,
    f,
    d,
    e,
    f,
    a,
    e,
    f,
  ]);
  const triangles = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
  ]);
  return { vertices, triangles };
}

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

// Two unit cubes overlapping on x: union spans [0,1.6] × [0,1] × [0,1].
const A = box([0, 0, 0], [1, 1, 1]);
const B = box([0.6, 0, 0], [1.6, 1, 1]);

// A sphere mesh as flat triangle soup (icosphere, 2 subdivisions). Used where a
// hollow shell needs a closed manifold input with curvature.
function sphere(radius: number): VoxelMeshInput {
  const t = (1 + Math.sqrt(5)) / 2;
  let pts: number[][] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(v[0] as number, v[1] as number, v[2] as number);
    return [(v[0] as number) / l, (v[1] as number) / l, (v[2] as number) / l];
  });
  let faces: number[][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let s = 0; s < 2; s++) {
    const cache = new Map<string, number>();
    const next: number[][] = [];
    const mid = (i: number, j: number): number => {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const a = pts[i] as number[];
      const b = pts[j] as number[];
      const m = [
        ((a[0] as number) + (b[0] as number)) / 2,
        ((a[1] as number) + (b[1] as number)) / 2,
        ((a[2] as number) + (b[2] as number)) / 2,
      ];
      const l = Math.hypot(m[0] as number, m[1] as number, m[2] as number);
      const idx = pts.length;
      pts.push([(m[0] as number) / l, (m[1] as number) / l, (m[2] as number) / l]);
      cache.set(key, idx);
      return idx;
    };
    for (const f of faces) {
      const a = mid(f[0] as number, f[1] as number);
      const b = mid(f[1] as number, f[2] as number);
      const c = mid(f[2] as number, f[0] as number);
      next.push([f[0] as number, a, c], [f[1] as number, b, a], [f[2] as number, c, b], [a, b, c]);
    }
    faces = next;
  }
  const vertices = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => {
    vertices[i * 3] = (p[0] as number) * radius;
    vertices[i * 3 + 1] = (p[1] as number) * radius;
    vertices[i * 3 + 2] = (p[2] as number) * radius;
  });
  const triangles = new Uint32Array(faces.flat());
  return { vertices, triangles };
}

// Two unit spheres overlapping on x: centres 0 and 0.8, radius 1.
const SPHERE_A = sphere(1);
const SPHERE_B: VoxelMeshInput = (() => {
  const s = sphere(1);
  const v = Float32Array.from(s.vertices);
  for (let i = 0; i < v.length; i += 3) v[i] += 0.8;
  return { vertices: v, triangles: s.triangles };
})();

beforeAll(async () => {
  const wasmPath = resolve(__dirname, '../packages/brepjs-voxel-wasm/pkg/index_bg.wasm');
  await initWasm({ module_or_path: readFileSync(wasmPath) });
  initVoxel(voxelWasm);
  await initOC();
}, 30000);

describe('voxel field op-chains (persistent grid + Fast Sweeping reinit)', () => {
  it('voxelizes a mesh into a live, disposable field handle', () => {
    using field = unwrap(voxelField(A, { resolution: 32, padding: 3 }));
    expect(field.disposed).toBe(false);
    expect(field.value).toBeDefined();
  });

  it('chains co-registered boolean → offset → contour at the public API (GATE 3b)', () => {
    // A and B have different bboxes, so they must be co-registered onto one grid
    // via voxelBooleanField (the correct path); two independent voxelField()
    // handles would be in different coordinate frames.
    using union = unwrap(voxelBooleanField(A, B, 'union', { resolution: 40, padding: 6 }));
    const unionBox = bboxOf(union.contour().vertices);

    // A fresh co-registered union offset by d must grow the bbox by ~d on every side.
    using grownField = unwrap(voxelBooleanField(A, B, 'union', { resolution: 40, padding: 6 }));
    const d = 0.15;
    const grown = grownField.offset(d).contour();
    const grownBox = bboxOf(grown.vertices);

    expect(grown.vertices.length).toBeGreaterThan(0);
    expect(grown.triangles.length).toBeGreaterThan(0);

    const spacing = 1.6 / 40; // longest axis / resolution
    for (let axis = 0; axis < 3; axis++) {
      const grewLo = (unionBox.min[axis] as number) - (grownBox.min[axis] as number);
      const grewHi = (grownBox.max[axis] as number) - (unionBox.max[axis] as number);
      // Within ~1.5 voxels of the requested outward shift on every face.
      expect(grewLo).toBeGreaterThan(d - 1.5 * spacing);
      expect(grewHi).toBeGreaterThan(d - 1.5 * spacing);
    }
  });

  it('threads a co-registered chain through the Result functional API (no throw)', () => {
    const r = andThen(
      andThen(voxelBooleanField(A, B, 'union', { resolution: 32, padding: 4 }), (f) =>
        fieldOffset(f, 0.1)
      ),
      fieldContour
    );
    expect(isOk(r)).toBe(true);
    const mesh = unwrap(r);
    expect(mesh.triangles.length).toBeGreaterThan(0);
  });

  it('rejects fieldBoolean across mismatched coordinate frames (P1 loud failure)', () => {
    // A (bbox [0,1]) and B (bbox [0.6,1.6]) voxelize onto DIFFERENT grids, so a
    // direct fieldBoolean must error loudly rather than blend mismatched frames.
    using field = unwrap(voxelField(A, { resolution: 32, padding: 4 }));
    using other = unwrap(voxelField(B, { resolution: 32, padding: 4 }));
    const r = fieldBoolean(field, other, 'union');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('VOXEL_FIELD_BOOLEAN_FAILED');
  });

  it('frees the WASM grid exactly once via `using` (GATE 4 — no leak)', () => {
    resetDisposalStats();
    const base = getDisposalStats().liveHandles;
    {
      using field = unwrap(voxelField(A, { resolution: 16, padding: 2 }));
      expect(getDisposalStats().liveHandles).toBe(base + 1);
      expect(field.disposed).toBe(false);
    }
    // Scope exit disposed the handle: live count back to baseline.
    expect(getDisposalStats().liveHandles).toBe(base);
  });

  it('frees the WASM grid via an explicit delete-path dispose (idempotent)', () => {
    resetDisposalStats();
    const base = getDisposalStats().liveHandles;
    const field = unwrap(voxelField(A, { resolution: 16, padding: 2 }));
    expect(getDisposalStats().liveHandles).toBe(base + 1);

    field[Symbol.dispose]();
    expect(field.disposed).toBe(true);
    expect(getDisposalStats().liveHandles).toBe(base);

    // A second dispose is a safe no-op (doesn't double-free, count unchanged).
    field[Symbol.dispose]();
    expect(getDisposalStats().liveHandles).toBe(base);
  });

  it('rejects operating on a disposed handle with VOXEL_FIELD_DISPOSED', () => {
    const field = unwrap(voxelField(A, { resolution: 16, padding: 2 }));
    using other = unwrap(voxelField(B, { resolution: 16, padding: 2 }));
    field[Symbol.dispose]();

    const r = fieldOffset(field, 0.1);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('VOXEL_FIELD_DISPOSED');

    const rb = fieldBoolean(field, other, 'union');
    expect(isErr(rb)).toBe(true);
  });

  it('rejects an empty mesh and a non-finite offset', () => {
    const empty = voxelField({ vertices: new Float32Array(), triangles: new Uint32Array() });
    expect(isErr(empty)).toBe(true);

    using field = unwrap(voxelField(A, { resolution: 16, padding: 2 }));
    const bad = fieldOffset(field, Number.POSITIVE_INFINITY);
    expect(isErr(bad)).toBe(true);
  });

  it('hollows a field into a shell via the chain and the Result API', () => {
    // A solid sphere shell: thin wall hollows it but keeps a non-empty surface.
    using solid = unwrap(voxelField(SPHERE_A, { resolution: 32, padding: 3 }));
    const hollow = solid.shell(0.2).contour();
    expect(hollow.vertices.length).toBeGreaterThan(0);
    expect(hollow.triangles.length).toBeGreaterThan(0);

    using viaApi = unwrap(voxelField(SPHERE_A, { resolution: 32, padding: 3 }));
    const r = andThen(fieldShell(viaApi, 0.2), fieldContour);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r).triangles.length).toBeGreaterThan(0);
  });

  it('surfaces an over-shrunk inward offset as a degenerate-result error', () => {
    // Shrinking the sphere inward by more than its radius erases all geometry, so
    // the contour is empty — a discoverable VOXEL_DEGENERATE_RESULT, not a silent
    // empty mesh.
    using field = unwrap(voxelField(SPHERE_A, { resolution: 24, padding: 2 }));
    const r = andThen(fieldOffset(field, -5), fieldContour);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('VOXEL_DEGENERATE_RESULT');
  });

  it('explicit reinit is a no-op on a clean field (idempotent surface)', () => {
    using field = unwrap(voxelField(SPHERE_A, { resolution: 32, padding: 3 }));
    const before = unwrap(fieldContour(field));
    // A freshly voxelized field is already a true SDF, so reinit must preserve it.
    const re = fieldReinit(field);
    expect(isOk(re)).toBe(true);
    const after = unwrap(fieldContour(field));
    expect(after.vertices.length).toBe(before.vertices.length);
    expect(after.triangles.length).toBe(before.triangles.length);
    // A second reinit is likewise a no-op.
    expect(isOk(fieldReinit(field))).toBe(true);
    const again = unwrap(fieldContour(field));
    expect(again.vertices.length).toBe(before.vertices.length);
  });

  it('voxelizes a B-rep shape into a chainable field', () => {
    const boxShape = makeBaseBox(1, 1, 1);
    using field = unwrap(voxelFieldFromShape(boxShape, { resolution: 48, padding: 3 }));
    const mesh = field.contour();
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
  });

  it('co-registers the intersection op (overlap smaller than the union)', () => {
    using u = unwrap(voxelBooleanField(A, B, 'union', { resolution: 40, padding: 4 }));
    const unionBox = bboxOf(u.contour().vertices);

    using i = unwrap(voxelBooleanField(A, B, 'intersection', { resolution: 40, padding: 4 }));
    const inter = i.contour();
    expect(inter.triangles.length).toBeGreaterThan(0);
    const interBox = bboxOf(inter.vertices);
    // The overlap [0.6,1] is far narrower on x than the union [0,1.6].
    const unionWidth = (unionBox.max[0] as number) - (unionBox.min[0] as number);
    const interWidth = (interBox.max[0] as number) - (interBox.min[0] as number);
    expect(interWidth).toBeLessThan(unionWidth);
  });

  it('co-registers the difference op (A − B carves the overlap off A)', () => {
    using d = unwrap(voxelBooleanField(A, B, 'difference', { resolution: 40, padding: 4 }));
    const diff = d.contour();
    expect(diff.triangles.length).toBeGreaterThan(0);
    const diffBox = bboxOf(diff.vertices);
    // Difference keeps the A-only slab near x∈[0,0.6]; the +x extent of B is gone.
    expect(diffBox.max[0] as number).toBeLessThan(1.4);
  });

  it('co-registers two overlapping spheres via voxelBooleanField, then offsets', () => {
    // The correct path: voxelBooleanField sizes ONE grid to the union bbox and
    // voxelizes both spheres onto it, so the result is a clean chainable field.
    using field = unwrap(
      voxelBooleanField(SPHERE_A, SPHERE_B, 'union', { resolution: 40, padding: 5 })
    );
    const base = field.contour();
    expect(base.triangles.length).toBeGreaterThan(0);

    // Offset the co-registered union outward; it auto-reinitializes (dirty) and
    // the grown surface must extend past the bare union on x.
    using grown = unwrap(
      voxelBooleanField(SPHERE_A, SPHERE_B, 'union', { resolution: 40, padding: 5 })
    );
    const d = 0.15;
    const out = grown.offset(d).contour();
    expect(out.triangles.length).toBeGreaterThan(0);

    const baseBox = bboxOf(base.vertices);
    const outBox = bboxOf(out.vertices);
    // The union spans x∈[-1,1.8] (width 2.8 = the longest axis), so the grid
    // spacing is 2.8/resolution; allow ~2 voxels of Surface-Nets slack.
    const spacing = 2.8 / 40;
    expect((baseBox.min[0] as number) - (outBox.min[0] as number)).toBeGreaterThan(d - 2 * spacing);
    expect((outBox.max[0] as number) - (baseBox.max[0] as number)).toBeGreaterThan(d - 2 * spacing);
  });

  it('rejects voxelBooleanField on an empty operand', () => {
    const empty = { vertices: new Float32Array(), triangles: new Uint32Array() };
    const r = voxelBooleanField(SPHERE_A, empty, 'union');
    expect(isErr(r)).toBe(true);
  });
});
