/**
 * STEP I/O benchmarks — measures import/export performance.
 *
 * Run: npx vitest run benchmarks/step-io.bench.test.ts --config vitest.bench.config.ts
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { getKernel } from '../src/kernel/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

const ALL_RESULTS: BenchResult[] = [];

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('STEP Export', () => {
  const results: BenchResult[] = [];

  it('exportSTEP single box ×10', async () => {
    collectResults(
      results,
      await benchBoth('exportSTEP(box) ×10', () => {
        const k = getKernel();
        const box = k.makeBox(10, 10, 10);
        for (let i = 0; i < 10; i++) k.exportSTEP([box]);
      })
    );
  });

  it('exportSTEP complex model', async () => {
    collectResults(
      results,
      await benchBoth('exportSTEP(complex)', () => {
        const k = getKernel();
        let result = k.makeBox(50, 50, 10);
        for (let x = -15; x <= 15; x += 10) {
          for (let y = -15; y <= 15; y += 10) {
            const hole = k.translate(k.makeCylinder(3, 20), x, y, -5);
            result = k.cut(result, hole);
          }
        }
        k.exportSTEP([result]);
      })
    );
  });

  afterAll(() => {
    printResults(results);
    ALL_RESULTS.push(...results);
  });
});

describe('STEP Import', () => {
  const results: BenchResult[] = [];
  let simpleSTEP: string;
  let complexSTEP: string;

  beforeAll(() => {
    const k = getKernel();
    simpleSTEP = k.exportSTEP([k.makeBox(10, 10, 10)]);
    let complex = k.makeBox(50, 50, 10);
    for (let x = -15; x <= 15; x += 10) {
      for (let y = -15; y <= 15; y += 10) {
        complex = k.cut(complex, k.translate(k.makeCylinder(3, 20), x, y, -5));
      }
    }
    complexSTEP = k.exportSTEP([complex]);
  });

  it('importSTEP simple ×10', async () => {
    collectResults(
      results,
      await benchBoth('importSTEP(simple) ×10', () => {
        const k = getKernel();
        for (let i = 0; i < 10; i++) k.importSTEP(simpleSTEP);
      })
    );
  });

  it('importSTEP complex', async () => {
    collectResults(
      results,
      await benchBoth('importSTEP(complex)', () => {
        const k = getKernel();
        k.importSTEP(complexSTEP);
      })
    );
  });

  afterAll(() => {
    printResults(results);
    ALL_RESULTS.push(...results);
  });
});

afterAll(() => {
  printResults(ALL_RESULTS);
});
