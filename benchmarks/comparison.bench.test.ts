/**
 * A/B comparison benchmarks measuring the impact of each optimization.
 *
 * Compares:
 * 1. native (BuilderAlgo) vs pairwise fuseAll
 * 2. simplify=false vs simplify=true
 * 3. mesh cache hit vs miss
 */
import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import {
  makeBox,
  makeCylinder,
  makeSphere,
  fuseAll,
  cutAll,
  unwrap,
  castShape,
  meshShape,
  clearMeshCache,
  fnFuseAll,
} from '../src/index.js';
import { translateShape } from '../src/topology/shapeFns.js';
import { fuseShapes, cutShape } from '../src/topology/booleanFns.js';
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Native vs Pairwise fuseAll', () => {
  const results: BenchResult[] = [];

  for (const n of [4, 8, 16]) {
    it(`fuseAll N=${n} — native (BuilderAlgo)`, async () => {
      results.push(
        await bench(`native N=${n}`, () => {
          const shapes = Array.from({ length: n }, (_, i) =>
            translateShape(makeBox([5, 5, 5]) as any, [i * 2, 0, 0])
          );
          unwrap(fuseAll(shapes, { strategy: 'native' }));
        })
      );
    });

    it(`fuseAll N=${n} — pairwise`, async () => {
      results.push(
        await bench(`pairwise N=${n}`, () => {
          const shapes = Array.from({ length: n }, (_, i) =>
            translateShape(makeBox([5, 5, 5]) as any, [i * 2, 0, 0])
          );
          unwrap(fuseAll(shapes, { strategy: 'pairwise' }));
        })
      );
    });
  }

  it('prints native vs pairwise', () => {
    printResults(results);
  });
});

describe('simplify=false vs simplify=true', () => {
  const results: BenchResult[] = [];

  it('fuse two boxes — simplify=false', async () => {
    results.push(
      await bench('fuse simplify=false', () => {
        const box1 = makeBox([10, 10, 10]);
        const box2 = translateShape(makeBox([10, 10, 10]) as any, [5, 0, 0]);
        unwrap(fuseShapes(box1 as any, box2, { simplify: false }));
      })
    );
  });

  it('fuse two boxes — simplify=true', async () => {
    results.push(
      await bench('fuse simplify=true', () => {
        const box1 = makeBox([10, 10, 10]);
        const box2 = translateShape(makeBox([10, 10, 10]) as any, [5, 0, 0]);
        unwrap(fuseShapes(box1 as any, box2, { simplify: true }));
      })
    );
  });

  it('fuseAll N=8 — simplify=false', async () => {
    results.push(
      await bench('fuseAll(8) simplify=false', () => {
        const shapes = Array.from({ length: 8 }, (_, i) =>
          translateShape(makeBox([5, 5, 5]) as any, [i * 2, 0, 0])
        );
        unwrap(fuseAll(shapes, { simplify: false }));
      })
    );
  });

  it('fuseAll N=8 — simplify=true', async () => {
    results.push(
      await bench('fuseAll(8) simplify=true', () => {
        const shapes = Array.from({ length: 8 }, (_, i) =>
          translateShape(makeBox([5, 5, 5]) as any, [i * 2, 0, 0])
        );
        unwrap(fuseAll(shapes, { simplify: true }));
      })
    );
  });

  it('cut box-sphere — simplify=false', async () => {
    results.push(
      await bench('cut simplify=false', () => {
        const box = makeBox([10, 10, 10]);
        const sphere = translateShape(makeSphere(4) as any, [5, 5, 5]);
        unwrap(cutShape(box as any, sphere, { simplify: false }));
      })
    );
  });

  it('cut box-sphere — simplify=true', async () => {
    results.push(
      await bench('cut simplify=true', () => {
        const box = makeBox([10, 10, 10]);
        const sphere = translateShape(makeSphere(4) as any, [5, 5, 5]);
        unwrap(cutShape(box as any, sphere, { simplify: true }));
      })
    );
  });

  it('prints simplify comparison', () => {
    printResults(results);
  });
});

describe('Mesh cache hit vs miss', () => {
  const results: BenchResult[] = [];

  it('mesh sphere — cache miss (first call)', async () => {
    results.push(
      await bench(
        'mesh sphere (no cache)',
        () => {
          clearMeshCache();
          const sphere = makeSphere(10);
          meshShape(castShape(sphere.wrapped));
        },
        { warmup: 1, iterations: 5 }
      )
    );
  });

  it('mesh sphere — cache hit (repeated)', async () => {
    const sphere = makeSphere(10);
    // Prime the cache
    clearMeshCache();
    meshShape(castShape(sphere.wrapped));

    results.push(
      await bench(
        'mesh sphere (cached)',
        () => {
          meshShape(castShape(sphere.wrapped));
        },
        { warmup: 0, iterations: 10 }
      )
    );
  });

  it('mesh box — cache miss', async () => {
    results.push(
      await bench(
        'mesh box (no cache)',
        () => {
          clearMeshCache();
          const box = makeBox([10, 10, 10]);
          meshShape(castShape(box.wrapped));
        },
        { warmup: 1, iterations: 5 }
      )
    );
  });

  it('mesh box — cache hit', async () => {
    const box = makeBox([10, 10, 10]);
    clearMeshCache();
    meshShape(castShape(box.wrapped));

    results.push(
      await bench(
        'mesh box (cached)',
        () => {
          meshShape(castShape(box.wrapped));
        },
        { warmup: 0, iterations: 10 }
      )
    );
  });

  it('prints cache comparison', () => {
    printResults(results);
  });
});
