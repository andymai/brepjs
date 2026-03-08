import { describe, it, beforeAll } from 'vitest';
import { box, cylinder, translate, fuseAll, cutAll, unwrap } from '../src/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Scaling benchmarks — fuseAll', () => {
  const results: BenchResult[] = [];

  for (const n of [4, 8, 16, 32]) {
    it(`fuseAll with ${n} overlapping boxes`, async () => {
      collectResults(results, await benchBoth(`fuseAll N=${n}`, () => {
        const shapes = Array.from({ length: n }, (_, i) =>
          translate(box(5, 5, 5), [i * 2, 0, 0])
        );
        unwrap(fuseAll(shapes));
      }));
    });
  }

  it('prints fuseAll results', () => {
    printResults(results);
  });
});

describe('Scaling benchmarks — cutAll', () => {
  const results: BenchResult[] = [];

  for (const n of [4, 8, 16]) {
    it(`cutAll with ${n} cylindrical holes`, async () => {
      collectResults(results, await benchBoth(`cutAll N=${n}`, () => {
        const base = box(40, 40, 10);
        const tools = Array.from({ length: n }, (_, i) => {
          const row = Math.floor(i / 4);
          const col = i % 4;
          return translate(cylinder(1, 10), [5 + col * 8, 5 + row * 8, 0]);
        });
        unwrap(cutAll(base, tools));
      }));
    });
  }

  it('prints cutAll results', () => {
    printResults(results);
  });
});
