/**
 * Regression benchmark targeting changes introduced around v8.8.5–v9.x:
 *
 * 1. DisposalScope wrapping every transform (v8.8.7 #322)
 * 2. Kernel registry Map lookup in getKernel() (v8.8.11 #324)
 * 3. iterOcList native iterator vs copy-and-destroy (v8.8.5 #309)
 * 4. Hash-bucket sharedEdges optimization (v8.8.5 #309)
 * 5. propagateOrigins hash caching (v8.8.5 #309)
 */
import { describe, it, beforeAll } from 'vitest';
import { initBothKernels, benchBoth } from './setup.js';
import {
  box,
  cylinder,
  sphere,
  translate,
  rotate,
  scale,
  fuse,
  cut,
  getKernel,
  unwrap,
} from '../src/index.js';
import { sharedEdges } from '../src/topology/adjacencyFns.js';
import { getFaces, getEdges, getBounds } from '../src/topology/shapeFns.js';
import { bench, collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Regression benchmarks (v8.8.5+ changes)', () => {
  const results: BenchResult[] = [];

  // --- getKernel() overhead (called on every operation) ---
  it('getKernel() 100k calls', async () => {
    results.push(
      await bench(
        'getKernel() x100k',
        () => {
          for (let i = 0; i < 100_000; i++) {
            getKernel();
          }
        },
        { warmup: 3, iterations: 10 }
      )
    );
  });

  // --- Transform overhead (DisposalScope wrapping) ---
  // NOTE: shape must be created inside the closure so each kernel gets its own handle.
  it('translate 100x', async () => {
    collectResults(results, await benchBoth(
      'translate x100',
      () => {
        const b = box(10, 10, 10);
        for (let i = 0; i < 100; i++) {
          translate(b, [i * 0.01, 0, 0]);
        }
      },
      { warmup: 2, iterations: 5 }
    ));
  });

  it('rotate 100x', async () => {
    collectResults(results, await benchBoth(
      'rotate x100',
      () => {
        const b = box(10, 10, 10);
        for (let i = 0; i < 100; i++) {
          rotate(b, i * 0.1);
        }
      },
      { warmup: 2, iterations: 5 }
    ));
  });

  it('scale 100x', async () => {
    collectResults(results, await benchBoth(
      'scale x100',
      () => {
        const b = box(10, 10, 10);
        for (let i = 0; i < 100; i++) {
          scale(b, 1 + i * 0.001);
        }
      },
      { warmup: 2, iterations: 5 }
    ));
  });

  it('getBounds 200x', async () => {
    collectResults(results, await benchBoth(
      'getBounds x200',
      () => {
        const b = box(10, 10, 10);
        for (let i = 0; i < 200; i++) {
          getBounds(b);
        }
      },
      { warmup: 2, iterations: 5 }
    ));
  });

  // --- Boolean ops (tests propagateOrigins, iterOcList) ---
  it('box + cylinder fuse', async () => {
    collectResults(results, await benchBoth('box+cyl fuse', () => {
      const b = box(10, 10, 10);
      const c = translate(cylinder(3, 10), [5, 5, 0]);
      unwrap(fuse(b, c));
    }));
  });

  it('box - sphere cut', async () => {
    collectResults(results, await benchBoth('box-sphere cut', () => {
      const b = box(10, 10, 10);
      const s = translate(sphere(4), [5, 5, 5]);
      unwrap(cut(b, s));
    }));
  });

  // --- sharedEdges (hash-bucket optimization) ---
  it('sharedEdges on fused result', async () => {
    const b = box(10, 10, 10);
    const c = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, c));
    const faces = getFaces(fused);

    results.push(
      await bench(
        'sharedEdges (all face pairs)',
        () => {
          for (let i = 0; i < faces.length; i++) {
            for (let j = i + 1; j < faces.length; j++) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              sharedEdges(faces[i]!, faces[j]!);
            }
          }
        },
        { warmup: 1, iterations: 3 }
      )
    );
  });

  // --- Topology iteration (getEdges, getFaces on complex shape) ---
  it('getFaces + getEdges on complex shape', async () => {
    collectResults(results, await benchBoth(
      'getFaces+getEdges x50',
      () => {
        for (let i = 0; i < 50; i++) {
          // Force uncached by creating new cut each time
          const b = box(10 + i * 0.001, 10, 10);
          const s = translate(sphere(4), [5, 5, 5]);
          const r = unwrap(cut(b, s));
          getFaces(r);
          getEdges(r);
        }
      },
      { warmup: 1, iterations: 3 }
    ));
  });

  it('prints results', () => {
    printResults(results);
  });
});
