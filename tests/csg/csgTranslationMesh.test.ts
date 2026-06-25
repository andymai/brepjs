/**
 * Placement-stripped mesh reuse (#1603 / #1606 item 1). A rigid-motion node
 * (translate/rotate) meshes its inner geometry once and moves the cached mesh
 * per placement, instead of re-tessellating the relocated shape. The shape path
 * already reuses geometry via locate (#1633); this closes the "no re-mesh on a
 * pure move" half for both translation and rotation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import { Evaluator, box, translate, rotate } from '@/csg/index.js';
import { getFaces, getHashCode, mesh, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('CSG placement-stripped mesh reuse (translation + rotation)', () => {
  it('a translated box is the base mesh shifted by the offset', () => {
    const ev = new Evaluator();
    const base = unwrap(ev.evaluateMesh(box(10, 10, 10)));
    const moved = unwrap(ev.evaluateMesh(translate(box(10, 10, 10), [5, 0, 0])));

    expect(moved.vertices.length).toBe(base.vertices.length);
    expect(moved.triangles.length).toBe(base.triangles.length);
    for (let i = 0; i < base.vertices.length; i += 3) {
      expect(moved.vertices[i]).toBeCloseTo((base.vertices[i] ?? 0) + 5, 4);
      expect(moved.vertices[i + 1]).toBeCloseTo(base.vertices[i + 1] ?? 0, 4);
      expect(moved.vertices[i + 2]).toBeCloseTo(base.vertices[i + 2] ?? 0, 4);
    }
    // A translation leaves normals unchanged.
    expect(Array.from(moved.normals)).toEqual(Array.from(base.normals));
  });

  it('composes nested translations into one offset', () => {
    const ev = new Evaluator();
    const base = unwrap(ev.evaluateMesh(box(8, 8, 8)));
    const moved = unwrap(ev.evaluateMesh(translate(translate(box(8, 8, 8), [1, 2, 3]), [4, 5, 6])));
    for (let i = 0; i < base.vertices.length; i += 3) {
      expect(moved.vertices[i]).toBeCloseTo((base.vertices[i] ?? 0) + 5, 4); // 1+4
      expect(moved.vertices[i + 1]).toBeCloseTo((base.vertices[i + 1] ?? 0) + 7, 4); // 2+5
      expect(moved.vertices[i + 2]).toBeCloseTo((base.vertices[i + 2] ?? 0) + 9, 4); // 3+6
    }
  });

  it('reuses one inner mesh across distinct placements (no re-tessellation)', () => {
    const ev = new Evaluator();
    const a = unwrap(ev.evaluateMesh(translate(box(6, 6, 6), [1, 0, 0])));
    const b = unwrap(ev.evaluateMesh(translate(box(6, 6, 6), [9, 0, 0])));
    // Both are shifts of the SAME cached box mesh, so they share its (untouched)
    // normals array by reference — impossible if each placement re-meshed.
    expect(a.normals).toBe(b.normals);
  });

  // Convention lock: the reused (rotation-stripped) mesh must equal the kernel's
  // own tessellation of the located shape, pinning the degree/axis/sign
  // convention against real kernel output. OCCT-family only: locate shares the
  // source triangulation so vertex order is preserved 1:1; brepkit/manifold
  // re-tessellate the located shape in a different order (the analytic tests
  // below cover those — they compare against the base mesh, not kernel output).
  it.skipIf(!currentKernel.startsWith('occt'))(
    'a rotated box matches the kernel-meshed rotation (vertices + normals)',
    () => {
      const ev = new Evaluator();
      const node = rotate(box(10, 10, 10), 90, { axis: [0, 0, 1] });
      const reused = unwrap(ev.evaluateMesh(node));
      const direct = mesh(unwrap(ev.evaluate(node)), { cache: false });

      expect(reused.vertices.length).toBe(direct.vertices.length);
      for (let i = 0; i < direct.vertices.length; i++) {
        expect(reused.vertices[i]).toBeCloseTo(direct.vertices[i] ?? 0, 4);
      }
      expect(reused.normals.length).toBe(direct.normals.length);
      for (let i = 0; i < direct.normals.length; i++) {
        expect(reused.normals[i]).toBeCloseTo(direct.normals[i] ?? 0, 4);
      }
    }
  );

  it('rotates the cached inner mesh: 90° about Z maps (x,y,z) → (−y,x,z)', () => {
    const ev = new Evaluator();
    const base = unwrap(ev.evaluateMesh(box(10, 10, 10)));
    const rotated = unwrap(ev.evaluateMesh(rotate(box(10, 10, 10), 90, { axis: [0, 0, 1] })));

    expect(rotated.vertices.length).toBe(base.vertices.length);
    for (let i = 0; i < base.vertices.length; i += 3) {
      const bx = base.vertices[i] ?? 0;
      const by = base.vertices[i + 1] ?? 0;
      const bz = base.vertices[i + 2] ?? 0;
      expect(rotated.vertices[i]).toBeCloseTo(-by, 4);
      expect(rotated.vertices[i + 1]).toBeCloseTo(bx, 4);
      expect(rotated.vertices[i + 2]).toBeCloseTo(bz, 4);
    }
    // Normals rotate too (a rotation is not normal-invariant) — fresh array.
    expect(rotated.normals).not.toBe(base.normals);
    for (let i = 0; i < base.normals.length; i += 3) {
      const nx = base.normals[i] ?? 0;
      const ny = base.normals[i + 1] ?? 0;
      expect(rotated.normals[i]).toBeCloseTo(-ny, 4);
      expect(rotated.normals[i + 1]).toBeCloseTo(nx, 4);
    }
  });

  it('composes a mixed translate∘rotate chain (rotate then translate)', () => {
    // Outer translate applies after inner rotate: p → rot90Z(p) → +[5,0,0].
    const ev = new Evaluator();
    const base = unwrap(ev.evaluateMesh(box(8, 8, 8)));
    const node = translate(rotate(box(8, 8, 8), 90, { axis: [0, 0, 1] }), [5, 0, 0]);
    const moved = unwrap(ev.evaluateMesh(node));

    expect(moved.vertices.length).toBe(base.vertices.length);
    for (let i = 0; i < base.vertices.length; i += 3) {
      const bx = base.vertices[i] ?? 0;
      const by = base.vertices[i + 1] ?? 0;
      const bz = base.vertices[i + 2] ?? 0;
      expect(moved.vertices[i]).toBeCloseTo(-by + 5, 4);
      expect(moved.vertices[i + 1]).toBeCloseTo(bx, 4);
      expect(moved.vertices[i + 2]).toBeCloseTo(bz, 4);
    }
  });

  it('composes a mixed rotate∘translate chain (translate then rotate)', () => {
    // Inner translate applies before outer rotate: p → p+[5,0,0] → rot90Z = (−by, bx+5, bz).
    // Exercises peelRigid's Translate branch with a non-identity accumulated rotation
    // (rv = quatRotate(rot, v)) — the inverse of the translate∘rotate case above.
    const ev = new Evaluator();
    const base = unwrap(ev.evaluateMesh(box(8, 8, 8)));
    const node = rotate(translate(box(8, 8, 8), [5, 0, 0]), 90, { axis: [0, 0, 1] });
    const moved = unwrap(ev.evaluateMesh(node));

    expect(moved.vertices.length).toBe(base.vertices.length);
    for (let i = 0; i < base.vertices.length; i += 3) {
      const bx = base.vertices[i] ?? 0;
      const by = base.vertices[i + 1] ?? 0;
      const bz = base.vertices[i + 2] ?? 0;
      expect(moved.vertices[i]).toBeCloseTo(-by, 4);
      expect(moved.vertices[i + 1]).toBeCloseTo(bx + 5, 4);
      expect(moved.vertices[i + 2]).toBeCloseTo(bz, 4);
    }
  });

  it('rotates about an off-origin pivot (R·(p−c)+c)', () => {
    const ev = new Evaluator();
    const base = unwrap(ev.evaluateMesh(box(6, 6, 6)));
    const c = [3, 3, 0] as const;
    const node = rotate(box(6, 6, 6), 45, { axis: [0, 0, 1], at: [...c] });
    const moved = unwrap(ev.evaluateMesh(node));
    const cos = Math.cos(Math.PI / 4);
    const sin = Math.sin(Math.PI / 4);

    expect(moved.vertices.length).toBe(base.vertices.length);
    for (let i = 0; i < base.vertices.length; i += 3) {
      const dx = (base.vertices[i] ?? 0) - c[0];
      const dy = (base.vertices[i + 1] ?? 0) - c[1];
      expect(moved.vertices[i]).toBeCloseTo(dx * cos - dy * sin + c[0], 4);
      expect(moved.vertices[i + 1]).toBeCloseTo(dx * sin + dy * cos + c[1], 4);
      expect(moved.vertices[i + 2]).toBeCloseTo(base.vertices[i + 2] ?? 0, 4);
    }
  });

  it('re-keys face groups onto the placed rotated shape', () => {
    const ev = new Evaluator();
    const node = rotate(box(10, 10, 10), 90, { axis: [1, 0, 0] });
    const placedFaceIds = new Set(getFaces(unwrap(ev.evaluate(node))).map(getHashCode));
    const moved = unwrap(ev.evaluateMesh(node));
    expect(moved.faceGroups.length).toBeGreaterThan(0);
    for (const g of moved.faceGroups) {
      expect(placedFaceIds.has(g.faceId)).toBe(true);
    }
  });

  it('re-keys face groups onto the placed shape (picking/metadata stay valid)', () => {
    const ev = new Evaluator();
    const placedShape = unwrap(ev.evaluate(translate(box(10, 10, 10), [5, 0, 0])));
    const placedFaceIds = new Set(getFaces(placedShape).map(getHashCode));
    const moved = unwrap(ev.evaluateMesh(translate(box(10, 10, 10), [5, 0, 0])));
    // Each group's faceId is a face of the PLACED shape, not the unplaced inner.
    expect(moved.faceGroups.length).toBeGreaterThan(0);
    for (const g of moved.faceGroups) {
      expect(placedFaceIds.has(g.faceId)).toBe(true);
    }
  });

  it('survives a tiny bounded shape cache (no use-after-dispose)', () => {
    // maxCacheEntries:1 means evaluating the placed then inner shape evicts and
    // disposes the first — the fast path must read hashes before that, not hold a
    // shape handle across the next evaluate.
    const ev = new Evaluator({ maxCacheEntries: 1 });
    const moved = unwrap(ev.evaluateMesh(translate(box(10, 10, 10), [5, 0, 0])));
    expect(moved.vertices.length).toBeGreaterThan(0);
    expect(moved.faceGroups.length).toBeGreaterThan(0);
    // faceIds resolve to real placed faces, not garbage from a freed handle.
    const placedIds = new Set(
      getFaces(unwrap(ev.evaluate(translate(box(10, 10, 10), [5, 0, 0])))).map(getHashCode)
    );
    for (const g of moved.faceGroups) expect(placedIds.has(g.faceId)).toBe(true);
  });

  it('falls back to re-mesh when an inner mesh outlives its shape (cache churn)', () => {
    const ev = new Evaluator({ maxCacheEntries: 1 });
    ev.evaluateMesh(box(10, 10, 10)); // cache box(10)'s mesh + shape
    ev.evaluate(box(7, 7, 7)); // evict box(10)'s shape; its mesh stays cached
    // The reused inner mesh now references an evicted instance; the fast path
    // must detect the unmappable IDs and re-mesh the placed shape.
    const moved = unwrap(ev.evaluateMesh(translate(box(10, 10, 10), [5, 0, 0])));
    expect(moved.faceGroups.length).toBeGreaterThan(0);
    const placedIds = new Set(
      getFaces(unwrap(ev.evaluate(translate(box(10, 10, 10), [5, 0, 0])))).map(getHashCode)
    );
    for (const g of moved.faceGroups) expect(placedIds.has(g.faceId)).toBe(true);
  });
});
