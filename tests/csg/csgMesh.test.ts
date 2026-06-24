/**
 * Evaluator.evaluateMesh — content-addressed mesh caching tied to the CSG cache.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import { Evaluator, box, sphere, param } from '@/csg/index.js';
import { unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('Evaluator.evaluateMesh', () => {
  it('materializes a node and returns a mesh', () => {
    using ev = new Evaluator();
    const m = unwrap(ev.evaluateMesh(box(10, 10, 10)));
    expect(m.triangles.length).toBeGreaterThan(0);
    expect(m.vertices.length).toBeGreaterThan(0);
  });

  it('a repeat call is a content-cache hit: same mesh object, no re-materialization', () => {
    using ev = new Evaluator();
    const node = box(10, 10, 10);
    const m1 = unwrap(ev.evaluateMesh(node));
    ev.resetStats();
    const m2 = unwrap(ev.evaluateMesh(node));
    expect(m2).toBe(m1); // cached mesh returned by identity
    // A mesh-cache hit never touches the shape cache.
    expect(ev.cacheStats().misses).toBe(0);
    expect(ev.cacheStats().hits).toBe(0);
  });

  it('keys the mesh by mesh params: a finer tolerance is a distinct, denser mesh', () => {
    using ev = new Evaluator();
    const node = sphere(10);
    // Both linear and angular deflection bind a sphere's tessellation, so vary
    // both — otherwise whichever default is finer dominates and the counts match.
    const coarse = unwrap(ev.evaluateMesh(node, {}, { tolerance: 3, angularTolerance: 1.2 }));
    const fine = unwrap(ev.evaluateMesh(node, {}, { tolerance: 0.05, angularTolerance: 0.1 }));
    expect(fine).not.toBe(coarse); // mesh params are part of the cache key
    expect(fine.triangles.length).toBeGreaterThan(coarse.triangles.length);
  });

  it('keys the mesh by env: same params hit, different params miss', () => {
    using ev = new Evaluator();
    const node = box(param('w'), 10, 10);
    const m5 = unwrap(ev.evaluateMesh(node, { w: 5 }));
    const m5again = unwrap(ev.evaluateMesh(node, { w: 5 }));
    const m20 = unwrap(ev.evaluateMesh(node, { w: 20 }));
    expect(m5again).toBe(m5); // same env → cache hit
    expect(m20).not.toBe(m5); // different env → distinct entry (no stale hit)
  });

  it('a mesh outlives an evicted shape: re-meshing evicted content is zero kernel work', () => {
    // Shape cache bounded to 1; mesh cache unbounded (the default).
    using ev = new Evaluator({ maxCacheEntries: 1 });
    const a = box(10, 10, 10);
    const meshA = unwrap(ev.evaluateMesh(a)); // shape A cached + meshed
    unwrap(ev.evaluateMesh(sphere(8))); // materializing B evicts shape A from the bound-1 cache
    ev.resetStats();

    const meshA2 = unwrap(ev.evaluateMesh(a));
    expect(meshA2).toBe(meshA); // the mesh survived shape eviction
    expect(ev.cacheStats().misses).toBe(0); // shape A was NOT re-materialized
  });

  it('maxMeshCacheEntries evicts: a mesh no longer outlives its evicted shape', () => {
    // Same shape-eviction setup as above, but the mesh cache is also bounded —
    // so the mesh does NOT survive (the contrast isolates maxMeshCacheEntries).
    using ev = new Evaluator({ maxCacheEntries: 1, maxMeshCacheEntries: 1 });
    const a = box(10, 10, 10);
    const meshA = unwrap(ev.evaluateMesh(a));
    unwrap(ev.evaluateMesh(sphere(8))); // evicts both shape A and mesh A
    const meshA2 = unwrap(ev.evaluateMesh(a)); // both miss → re-materialize + re-mesh
    expect(meshA2).not.toBe(meshA);
  });

  it('rejects an invalid maxMeshCacheEntries', () => {
    expect(() => new Evaluator({ maxMeshCacheEntries: 0 })).toThrow('positive integer');
    expect(() => new Evaluator({ maxMeshCacheEntries: 1.5 })).toThrow('positive integer');
  });

  it('throws on an aborted signal even when the mesh is cached', () => {
    using ev = new Evaluator();
    const node = box(10, 10, 10);
    unwrap(ev.evaluateMesh(node)); // populate the content cache
    const ctrl = new AbortController();
    ctrl.abort();
    expect(() => ev.evaluateMesh(node, {}, { signal: ctrl.signal })).toThrow();
  });

  it('throws on an aborted signal before materializing the node', () => {
    using ev = new Evaluator();
    const ctrl = new AbortController();
    ctrl.abort();
    expect(() => ev.evaluateMesh(box(10, 10, 10), {}, { signal: ctrl.signal })).toThrow();
    expect(ev.cacheStats().misses).toBe(0); // the CSG node was never evaluated
  });

  it('cache: false bypasses the cache and re-meshes each call', () => {
    using ev = new Evaluator();
    const node = box(10, 10, 10);
    const m1 = unwrap(ev.evaluateMesh(node, {}, { cache: false }));
    const m2 = unwrap(ev.evaluateMesh(node, {}, { cache: false }));
    expect(m2).not.toBe(m1); // no content cache; cache:false bypasses mesh()'s identity cache too
  });
});
