/**
 * Evaluator.evaluateMesh — scale-relative default deflection.
 *
 * The quality tiers' deflections are absolute model units tuned for unit-scale
 * parts; adopted unscaled at BIM (mm) scale they explode a curved surface into
 * 10^5-10^6 triangles. The default now scales with the shape's bounding-box
 * diagonal beyond 10 model units; explicit tolerances are untouched.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import { Evaluator, cylinder, rotate, sphere, translate } from '@/csg/index.js';
import { unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// The manifold preview kernel tessellates from build-time segments and ignores
// extract-time deflection, so density comparisons only hold on B-rep kernels.
const itBrep = it.skipIf(currentKernel === 'manifold');

describe('Evaluator.evaluateMesh scale-relative default', () => {
  itBrep('meshes a BIM-scale sphere with a bounded triangle count', () => {
    using ev = new Evaluator();
    const m = unwrap(ev.evaluateMesh(sphere(2000)));
    expect(m.triangles.length / 3).toBeGreaterThan(100);
    expect(m.triangles.length / 3).toBeLessThan(100_000);
  });

  it('leaves small shapes on the absolute tier default', () => {
    using ev = new Evaluator();
    // Diagonal below 10 model units: the resolved default must equal the
    // absolute standard-tier deflection, triangle for triangle.
    const node = cylinder(1, 2);
    const byDefault = unwrap(ev.evaluateMesh(node));
    const explicit = unwrap(ev.evaluateMesh(node, {}, { tolerance: 1e-3 }));
    expect(byDefault.triangles.length).toBe(explicit.triangles.length);
  });

  it('caches the relative default without re-evaluating', () => {
    using ev = new Evaluator();
    const node = sphere(2000);
    const m1 = unwrap(ev.evaluateMesh(node));
    ev.resetStats();
    const m2 = unwrap(ev.evaluateMesh(node));
    expect(m2).toBe(m1);
    expect(ev.cacheStats().misses).toBe(0);
    expect(ev.cacheStats().hits).toBe(0);
  });

  itBrep('keeps explicit and default tolerances as distinct cache entries', () => {
    using ev = new Evaluator();
    const node = sphere(2000);
    // Coarse explicit deflections first: OCCT keeps a shape's existing
    // triangulation when a coarser re-mesh is requested, so the coarse call
    // must not follow the finer default. Coarsen both knobs — either alone
    // stays bound by the other's default on a large sphere.
    const explicit = unwrap(ev.evaluateMesh(node, {}, { tolerance: 40, angularTolerance: 0.5 }));
    const byDefault = unwrap(ev.evaluateMesh(node));
    expect(explicit).not.toBe(byDefault);
    expect(explicit.triangles.length).toBeLessThan(byDefault.triangles.length);
  });

  it('reuses the rigid-motion path at scale: a placed sphere matches its source density', () => {
    using ev = new Evaluator();
    const source = sphere(2000);
    const placed = translate(source, [5000, 0, 0]);
    const sourceMesh = unwrap(ev.evaluateMesh(source));
    const placedMesh = unwrap(ev.evaluateMesh(placed));
    expect(placedMesh.triangles.length).toBe(sourceMesh.triangles.length);
  });

  it('resolves the same default density with and without the mesh cache for a rotated placement', () => {
    // A rotated placement's axis-aligned bounds inflate the diagonal; the
    // default must come from the placement-stripped shape on both paths.
    const node = rotate(cylinder(200, 4000), 45, { axis: [1, 0, 0] });
    using cached = new Evaluator();
    const viaReuse = unwrap(cached.evaluateMesh(node));
    using uncached = new Evaluator();
    const direct = unwrap(uncached.evaluateMesh(node, {}, { cache: false }));
    expect(direct.triangles.length).toBe(viaReuse.triangles.length);
  });
});
