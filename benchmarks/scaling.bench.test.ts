import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { makeBox, makeCylinder, fuseAll, cutAll, unwrap } from '../src/index.js';
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Scaling benchmarks — fuseAll', () => {
  const results: BenchResult[] = [];

  for (const n of [4, 8, 16, 32]) {
    it(`fuseAll with ${n} overlapping boxes`, async () => {
      results.push(
        await bench(`fuseAll N=${n}`, () => {
          const shapes = Array.from({ length: n }, (_, i) =>
            makeBox([5, 5, 5]).translate([i * 2, 0, 0])
          );
          unwrap(fuseAll(shapes));
        })
      );
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
      results.push(
        await bench(`cutAll N=${n}`, () => {
          const base = makeBox([40, 40, 10]);
          const tools = Array.from({ length: n }, (_, i) => {
            const row = Math.floor(i / 4);
            const col = i % 4;
            return makeCylinder(1, 10).translate([5 + col * 8, 5 + row * 8, 0]);
          });
          unwrap(cutAll(base, tools));
        })
      );
    });
  }

  it('prints cutAll results', () => {
    printResults(results);
  });
});
