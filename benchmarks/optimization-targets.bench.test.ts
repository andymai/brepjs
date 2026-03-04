/**
 * Benchmark for specific optimization targets.
 * Tests castShape overhead, getBounds caching, findUnique early exit,
 * meshEdges pre-allocation, and evolution object reuse.
 */
import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
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
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Optimization target benchmarks', () => {
  const results: BenchResult[] = [];

  // --- castShape overhead (called per sub-shape in topology iteration) ---
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
    const b = box(10, 10, 10);
    results.push(
      await bench(
        'getBounds x1000 same',
        () => {
          for (let i = 0; i < 1000; i++) {
            getBounds(b);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('getBounds on 50 unique shapes', async () => {
    const shapes = Array.from({ length: 50 }, (_, i) => box(10 + i * 0.01, 10, 10));
    results.push(
      await bench(
        'getBounds x50 unique',
        () => {
          for (const s of shapes) {
            getBounds(s);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // --- findUnique early termination ---
  it('findUnique on complex shape (should match 1)', async () => {
    const b = box(20, 10, 10);
    const c = translate(cylinder(3, 10), [10, 5, 0]);
    const fused = unwrap(fuse(b, c));
    // Find faces using geometry filter — tests findAll/findUnique overhead
    const f = faceFinder().parallelTo([0, 0, 1]);
    results.push(
      await bench(
        'faceFinder.findAll',
        () => {
          f.findAll(fused);
        },
        { warmup: 2, iterations: 10 }
      )
    );
  });

  // --- meshEdges performance ---
  it('meshEdges on fused shape', async () => {
    const b = box(10, 10, 10);
    const c = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, c));
    // Mesh first (face mesh), then edge mesh
    mesh(fused, { tolerance: 1, angularTolerance: 0.5 });
    results.push(
      await bench(
        'meshEdges fused',
        () => {
          meshEdges(fused, { tolerance: 1, angularTolerance: 0.5 });
        },
        { warmup: 1, iterations: 5 }
      )
    );
  });

  it('meshEdges on complex cut shape', async () => {
    const b = box(20, 20, 10);
    const holes = Array.from({ length: 4 }, (_, i) =>
      translate(cylinder(2, 10), [5 + i * 4, 10, 0])
    );
    let shape = b;
    for (const h of holes) {
      shape = unwrap(cut(shape, h));
    }
    mesh(shape, { tolerance: 1, angularTolerance: 0.5 });
    results.push(
      await bench(
        'meshEdges 4-hole',
        () => {
          meshEdges(shape, { tolerance: 1, angularTolerance: 0.5 });
        },
        { warmup: 1, iterations: 3 }
      )
    );
  });

  // --- Transform with no origin tracking (empty evolution fast path) ---
  it('translate x200 (no origins)', async () => {
    const b = box(10, 10, 10);
    results.push(
      await bench(
        'translate x200 no-origins',
        () => {
          for (let i = 0; i < 200; i++) {
            translate(b, [i * 0.01, 0, 0]);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // --- Topology iteration (getEdges/getFaces) on shapes of increasing complexity ---
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
    const b = box(10, 10, 10);
    results.push(
      await bench(
        'fillet x10 no-metadata',
        () => {
          for (let i = 0; i < 10; i++) {
            unwrap(fillet(b, undefined, 0.5));
          }
        },
        { warmup: 1, iterations: 3 }
      )
    );
  });

  // --- UV mesh caching ---
  it('mesh with UVs x5 (should cache)', async () => {
    const b = box(10, 10, 10);
    mesh(b, { includeUVs: true }); // prime cache
    results.push(
      await bench(
        'mesh UV x5 cached',
        () => {
          for (let i = 0; i < 5; i++) {
            mesh(b, { includeUVs: true });
          }
        },
        { warmup: 1, iterations: 5 }
      )
    );
  });

  // --- Measurement caching (cache-first path) ---
  it('measureVolume+Area x100 cached', async () => {
    const b = box(10, 10, 10);
    measureVolume(b); // prime cache
    measureArea(b);
    results.push(
      await bench(
        'measure x100 cached',
        () => {
          for (let i = 0; i < 100; i++) {
            measureVolume(b);
            measureArea(b);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // --- rotate/scale without spread overhead ---
  it('rotate x100', async () => {
    const b = box(10, 10, 10);
    results.push(
      await bench(
        'rotate x100',
        () => {
          for (let i = 0; i < 100; i++) {
            rotate(b, 5 * i, [0, 0, 0], [0, 0, 1]);
          }
        },
        { warmup: 1, iterations: 3 }
      )
    );
  });

  // --- Interference checking with AABB pre-filter ---
  it('checkAllInterferences 10 shapes', async () => {
    const shapes = Array.from({ length: 10 }, (_, i) =>
      translate(box(5, 5, 5), [i * 20, 0, 0])
    );
    results.push(
      await bench(
        'interference 10 separated',
        () => {
          checkAllInterferences(shapes);
        },
        { warmup: 1, iterations: 5 }
      )
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
