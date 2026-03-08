/**
 * Benchmark for specific optimization targets.
 * Tests castShape overhead, getBounds caching, findUnique early exit,
 * meshEdges pre-allocation, and evolution object reuse.
 */
import { describe, it, beforeAll } from 'vitest';
import { initBothKernels, benchBoth } from './setup.js';
import {
  box,
  cylinder,
  sphere,
  translate,
  rotate,
  fuse,
  cut,
  fillet,
  getKernel,
  unwrap,
  mesh,
  meshEdges,
  measureVolume,
  measureArea,
  checkAllInterferences,
} from '../src/index.js';
import { castShape } from '../src/core/shapeTypes.js';
import { getFaces, getEdges, getBounds } from '../src/topology/shapeFns.js';
import { faceFinder } from '../src/query/faceFinder.js';
import { bench, collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Optimization target benchmarks', () => {
  const results: BenchResult[] = [];

  // --- castShape overhead (called per sub-shape in topology iteration) ---
  // OCCT-only: uses getKernel().iterShapes which is kernel-internal
  it('castShape x500 (on raw kernel shapes)', async () => {
    const b = box(10, 10, 10);
    // Get raw faces from kernel to benchmark pure castShape cost
    const rawFaces = getKernel().iterShapes(b.wrapped, 'face');
    results.push(
      await bench(
        'castShape x500',
        () => {
          for (let i = 0; i < 500; i++) {
            for (const raw of rawFaces) {
              castShape(raw);
            }
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // --- getBounds repeated calls (should be cacheable) ---
  it('getBounds x1000 on same shape (cache hit scenario)', async () => {
    collectResults(results, await benchBoth(
      'getBounds x1000 same',
      () => {
        const b = box(10, 10, 10);
        for (let i = 0; i < 1000; i++) {
          getBounds(b);
        }
      },
      { warmup: 2, iterations: 5 }
    ));
  });

  it('getBounds on 50 unique shapes', async () => {
    collectResults(results, await benchBoth(
      'getBounds x50 unique',
      () => {
        const shapes = Array.from({ length: 50 }, (_, i) => box(10 + i * 0.01, 10, 10));
        for (const s of shapes) {
          getBounds(s);
        }
      },
      { warmup: 2, iterations: 5 }
    ));
  });

  // --- findUnique early termination ---
  it('findUnique on complex shape (should match 1)', async () => {
    collectResults(results, await benchBoth(
      'faceFinder.findAll',
      () => {
        const b = box(20, 10, 10);
        const c = translate(cylinder(3, 10), [10, 5, 0]);
        const fused = unwrap(fuse(b, c));
        const f = faceFinder().parallelTo([0, 0, 1]);
        f.findAll(fused);
      },
      { warmup: 2, iterations: 10 }
    ));
  });

  // --- meshEdges performance ---
  it('meshEdges on fused shape', async () => {
    collectResults(results, await benchBoth(
      'meshEdges fused',
      () => {
        const b = box(10, 10, 10);
        const c = translate(cylinder(3, 10), [5, 5, 0]);
        const fused = unwrap(fuse(b, c));
        mesh(fused, { tolerance: 1, angularTolerance: 0.5 });
        meshEdges(fused, { tolerance: 1, angularTolerance: 0.5 });
      },
      { warmup: 1, iterations: 5 }
    ));
  });

  it('meshEdges on complex cut shape', async () => {
    collectResults(results, await benchBoth(
      'meshEdges 4-hole',
      () => {
        const b = box(20, 20, 10);
        const holes = Array.from({ length: 4 }, (_, i) =>
          translate(cylinder(2, 10), [5 + i * 4, 10, 0])
        );
        let s = b;
        for (const h of holes) {
          s = unwrap(cut(s, h));
        }
        mesh(s, { tolerance: 1, angularTolerance: 0.5 });
        meshEdges(s, { tolerance: 1, angularTolerance: 0.5 });
      },
      { warmup: 1, iterations: 3 }
    ));
  });

  // --- Transform with no origin tracking (empty evolution fast path) ---
  it('translate x200 (no origins)', async () => {
    collectResults(results, await benchBoth(
      'translate x200 no-origins',
      () => {
        const b = box(10, 10, 10);
        for (let i = 0; i < 200; i++) {
          translate(b, [i * 0.01, 0, 0]);
        }
      },
      { warmup: 2, iterations: 5 }
    ));
  });

  // --- Topology iteration (getEdges/getFaces) on shapes of increasing complexity ---
  // OCCT-only: uses castShape on raw .wrapped handle
  it('getEdges on sphere (many edges)', async () => {
    const s = sphere(10);
    const c = translate(cylinder(3, 20), [0, 0, -10]);
    const complex = unwrap(cut(s, c));
    results.push(
      await bench(
        'getEdges sphere-cut',
        () => {
          // Force fresh iteration by creating new branded handle
          const fresh = castShape(complex.wrapped);
          getEdges(fresh);
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // --- Fillet with no metadata (modifierFns fast-path) ---
  it('fillet x10 (no metadata)', async () => {
    collectResults(results, await benchBoth(
      'fillet x10 no-metadata',
      () => {
        const b = box(10, 10, 10);
        for (let i = 0; i < 10; i++) {
          unwrap(fillet(b, 0.5));
        }
      },
      { warmup: 1, iterations: 3 }
    ));
  });

  // --- UV mesh caching ---
  it('mesh with UVs x5 (should cache)', async () => {
    collectResults(results, await benchBoth(
      'mesh UV x5 cached',
      () => {
        const b = box(10, 10, 10);
        mesh(b, { includeUVs: true }); // prime cache
        for (let i = 0; i < 5; i++) {
          mesh(b, { includeUVs: true });
        }
      },
      { warmup: 1, iterations: 5 }
    ));
  });

  // --- Measurement caching (cache-first path) ---
  it('measureVolume+Area x100 cached', async () => {
    collectResults(results, await benchBoth(
      'measure x100 cached',
      () => {
        const b = box(10, 10, 10);
        measureVolume(b); // prime cache
        measureArea(b);
        for (let i = 0; i < 100; i++) {
          measureVolume(b);
          measureArea(b);
        }
      },
      { warmup: 2, iterations: 5 }
    ));
  });

  // --- rotate/scale without spread overhead ---
  it('rotate x100', async () => {
    collectResults(results, await benchBoth(
      'rotate x100',
      () => {
        const b = box(10, 10, 10);
        for (let i = 0; i < 100; i++) {
          rotate(b, 5 * i, { at: [0, 0, 0], axis: [0, 0, 1] });
        }
      },
      { warmup: 1, iterations: 3 }
    ));
  });

  // --- Interference checking with AABB pre-filter ---
  it('checkAllInterferences 10 shapes', async () => {
    collectResults(results, await benchBoth(
      'interference 10 separated',
      () => {
        const shapes = Array.from({ length: 10 }, (_, i) =>
          translate(box(5, 5, 5), [i * 20, 0, 0])
        );
        checkAllInterferences(shapes);
      },
      { warmup: 1, iterations: 5 }
    ));
  });

  it('prints results', () => {
    printResults(results);
  });
});
