/**
 * Targeted benchmark: topology extraction performance.
 *
 * Isolates JUST the getEdges/getFaces call on pre-built shapes
 * to measure the castShape optimization impact.
 */
import { describe, it, beforeAll } from 'vitest';
import { box, cylinder, translate, fuse, unwrap } from '../src/index.js';
import { getEdges, getFaces, invalidateShapeCache } from '../src/topology/topologyQueryFns.js';
import { initBothKernels } from './setup.js';
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Topology extraction micro-benchmarks', () => {
  const results: BenchResult[] = [];

  it('getEdges on fresh fused shape (no cache)', async () => {
    // Pre-build shapes outside the benchmark, then measure ONLY extraction
    const shapes = Array.from({ length: 10 }, () => {
      const b = box(20, 10, 10);
      const c = translate(cylinder(3, 10), [10, 5, 0]);
      return unwrap(fuse(b, c));
    });
    let idx = 0;
    results.push(
      await bench(
        'getEdges fresh fused (no cache)',
        () => {
          // Cycle through pre-built shapes, invalidating cache each time
          const s = shapes[idx % shapes.length]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
          invalidateShapeCache(s);
          getEdges(s);
          idx++;
        },
        { warmup: 3, iterations: 10 }
      )
    );
  });

  it('getFaces on fresh fused shape (no cache)', async () => {
    const shapes = Array.from({ length: 10 }, () => {
      const b = box(20, 10, 10);
      const c = translate(cylinder(3, 10), [10, 5, 0]);
      return unwrap(fuse(b, c));
    });
    let idx = 0;
    results.push(
      await bench(
        'getFaces fresh fused (no cache)',
        () => {
          const s = shapes[idx % shapes.length]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
          invalidateShapeCache(s);
          getFaces(s);
          idx++;
        },
        { warmup: 3, iterations: 10 }
      )
    );
  });

  it('getEdges+getFaces on complex shape (8 holes, no cache)', async () => {
    // Build a complex shape with many sub-shapes
    let s = box(40, 20, 10);
    for (let i = 0; i < 8; i++) {
      s = unwrap(fuse(s, translate(cylinder(1.5, 10), [3 + i * 4.5, 10, 0])));
    }
    results.push(
      await bench(
        'getEdges+getFaces 8-hole (no cache)',
        () => {
          invalidateShapeCache(s);
          getEdges(s);
          getFaces(s);
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('getEdges cached x1000', async () => {
    const b = box(10, 10, 10);
    const c = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, c));
    getEdges(fused); // prime cache
    results.push(
      await bench(
        'getEdges cached x1000',
        () => {
          for (let i = 0; i < 1000; i++) {
            getEdges(fused);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
