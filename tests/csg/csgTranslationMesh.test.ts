/**
 * Placement-stripped mesh reuse (#1603 / #1606 item 1). A pure-translation node
 * meshes its inner geometry once and shifts the cached mesh per placement,
 * instead of re-tessellating the relocated shape. The shape path already reuses
 * geometry via locate (#1633); this closes the "no re-mesh on a pure move" half.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import { Evaluator, box, translate, rotate } from '@/csg/index.js';
import { getFaces, getHashCode, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('CSG translation-stripped mesh reuse', () => {
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

  it('leaves non-translation nodes on the normal mesh path', () => {
    const ev = new Evaluator();
    const m = unwrap(ev.evaluateMesh(rotate(box(10, 10, 10), Math.PI / 4)));
    expect(m.vertices.length).toBeGreaterThan(0);
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
