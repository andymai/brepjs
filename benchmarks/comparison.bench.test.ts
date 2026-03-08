/**
 * A/B comparison benchmarks measuring the impact of each optimization.
 *
 * Compares:
 * 1. native (BuilderAlgo) vs pairwise fuseAll
 * 2. simplify=false vs simplify=true
 * 3. mesh cache hit vs miss
 */
import { describe, it, beforeAll } from 'vitest';
import {
  box,
  sphere,
  translate,
  fuse,
  cut,
  fuseAll,
  unwrap,
  mesh,
  clearMeshCache,
} from '../src/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { bench, collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Native vs Pairwise fuseAll', () => {
  const results: BenchResult[] = [];

  for (const n of [4, 8, 16]) {
    it(`fuseAll N=${n} — native (BuilderAlgo)`, async () => {
      collectResults(results, await benchBoth(`native N=${n}`, () => {
        const shapes = Array.from({ length: n }, (_, i) =>
          translate(box(5, 5, 5), [i * 2, 0, 0])
        );
        unwrap(fuseAll(shapes, { strategy: 'native' }));
      }));
    });

    it(`fuseAll N=${n} — pairwise`, async () => {
      collectResults(results, await benchBoth(`pairwise N=${n}`, () => {
        const shapes = Array.from({ length: n }, (_, i) =>
          translate(box(5, 5, 5), [i * 2, 0, 0])
        );
        unwrap(fuseAll(shapes, { strategy: 'pairwise' }));
      }));
    });
  }

  it('prints native vs pairwise', () => {
    printResults(results);
  });
});

describe('simplify=false vs simplify=true', () => {
  const results: BenchResult[] = [];

  it('fuse two boxes — simplify=false', async () => {
    collectResults(results, await benchBoth('fuse simplify=false', () => {
      const b1 = box(10, 10, 10);
      const b2 = translate(box(10, 10, 10), [5, 0, 0]);
      unwrap(fuse(b1, b2, { simplify: false }));
    }));
  });

  it('fuse two boxes — simplify=true', async () => {
    collectResults(results, await benchBoth('fuse simplify=true', () => {
      const b1 = box(10, 10, 10);
      const b2 = translate(box(10, 10, 10), [5, 0, 0]);
      unwrap(fuse(b1, b2, { simplify: true }));
    }));
  });

  it('fuseAll N=8 — simplify=false', async () => {
    collectResults(results, await benchBoth('fuseAll(8) simplify=false', () => {
      const shapes = Array.from({ length: 8 }, (_, i) =>
        translate(box(5, 5, 5), [i * 2, 0, 0])
      );
      unwrap(fuseAll(shapes, { simplify: false }));
    }));
  });

  it('fuseAll N=8 — simplify=true', async () => {
    collectResults(results, await benchBoth('fuseAll(8) simplify=true', () => {
      const shapes = Array.from({ length: 8 }, (_, i) =>
        translate(box(5, 5, 5), [i * 2, 0, 0])
      );
      unwrap(fuseAll(shapes, { simplify: true }));
    }));
  });

  it('cut box-sphere — simplify=false', async () => {
    collectResults(results, await benchBoth('cut simplify=false', () => {
      const b = box(10, 10, 10);
      const s = translate(sphere(4), [5, 5, 5]);
      unwrap(cut(b, s, { simplify: false }));
    }));
  });

  it('cut box-sphere — simplify=true', async () => {
    collectResults(results, await benchBoth('cut simplify=true', () => {
      const b = box(10, 10, 10);
      const s = translate(sphere(4), [5, 5, 5]);
      unwrap(cut(b, s, { simplify: true }));
    }));
  });

  it('prints simplify comparison', () => {
    printResults(results);
  });
});

describe('Mesh cache hit vs miss', () => {
  const results: BenchResult[] = [];

  it('mesh sphere — cache miss (first call)', async () => {
    collectResults(results, await benchBoth(
      'mesh sphere (no cache)',
      () => {
        clearMeshCache();
        const s = sphere(10);
        mesh(s);
      },
      { warmup: 1, iterations: 5 }
    ));
  });

  it('mesh sphere — cache hit (repeated)', async () => {
    // Cache-hit test: create shape + prime cache in setup, then time only the cached call.
    // Uses plain bench() since this measures cache behavior, not kernel differences.
    const s = sphere(10);
    clearMeshCache();
    mesh(s); // prime cache
    results.push(
      await bench('mesh sphere (cached)', () => {
        mesh(s);
      }, { warmup: 0, iterations: 10 })
    );
  });

  it('mesh box — cache miss', async () => {
    collectResults(results, await benchBoth(
      'mesh box (no cache)',
      () => {
        clearMeshCache();
        const b = box(10, 10, 10);
        mesh(b);
      },
      { warmup: 1, iterations: 5 }
    ));
  });

  it('mesh box — cache hit', async () => {
    const b = box(10, 10, 10);
    clearMeshCache();
    mesh(b); // prime cache
    results.push(
      await bench('mesh box (cached)', () => {
        mesh(b);
      }, { warmup: 0, iterations: 10 })
    );
  });

  it('prints cache comparison', () => {
    printResults(results);
  });
});
