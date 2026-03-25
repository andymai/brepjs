/**
 * Boolean pipeline benchmark — compares chained pipeline vs sequential operations.
 *
 * Run: npx vitest run benchmarks/boolean-pipeline.bench.test.ts --config vitest.bench.config.ts
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { getKernel } from '../src/kernel/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

const ALL: BenchResult[] = [];

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Sequential vs Pipeline: 8-step fuse', () => {
  const results: BenchResult[] = [];

  it('sequential fuse ×8', async () => {
    collectResults(
      results,
      await benchBoth('sequential fuse ×8', () => {
        const k = getKernel();
        let result = k.makeBox(10, 10, 10);
        for (let i = 1; i <= 8; i++) {
          const tool = k.translate(k.makeBox(5, 5, 5), i * 3, 0, 0);
          result = k.fuse(result, tool, {});
        }
      })
    );
  });

  it('pipeline fuse ×8', async () => {
    collectResults(
      results,
      await benchBoth('pipeline fuse ×8', () => {
        const k = getKernel();
        const base = k.makeBox(10, 10, 10);
        const steps = Array.from({ length: 8 }, (_, i) => ({
          op: 'fuse' as const,
          tool: k.translate(k.makeBox(5, 5, 5), (i + 1) * 3, 0, 0),
        }));
        if (typeof k.booleanPipeline === 'function') {
          k.booleanPipeline(base, steps, {});
        } else {
          // Fallback: same as sequential
          let result = base;
          for (const step of steps) {
            result = k.fuse(result, step.tool, {});
          }
        }
      })
    );
  });

  afterAll(() => {
    printResults(results);
    ALL.push(...results);
  });
});

describe('Sequential vs Pipeline: 4-step mixed', () => {
  const results: BenchResult[] = [];

  it('sequential mixed ×4', async () => {
    collectResults(
      results,
      await benchBoth('sequential mixed ×4', () => {
        const k = getKernel();
        let result = k.makeBox(20, 20, 20);
        result = k.fuse(result, k.translate(k.makeBox(10, 10, 10), 10, 0, 0), {});
        result = k.cut(result, k.makeCylinder(3, 40), {});
        result = k.fuse(result, k.translate(k.makeBox(5, 5, 5), -5, 0, 0), {});
        result = k.cut(result, k.translate(k.makeCylinder(2, 40), 5, 5, 0), {});
      })
    );
  });

  it('pipeline mixed ×4', async () => {
    collectResults(
      results,
      await benchBoth('pipeline mixed ×4', () => {
        const k = getKernel();
        const base = k.makeBox(20, 20, 20);
        const steps = [
          { op: 'fuse' as const, tool: k.translate(k.makeBox(10, 10, 10), 10, 0, 0) },
          { op: 'cut' as const, tool: k.makeCylinder(3, 40) },
          { op: 'fuse' as const, tool: k.translate(k.makeBox(5, 5, 5), -5, 0, 0) },
          { op: 'cut' as const, tool: k.translate(k.makeCylinder(2, 40), 5, 5, 0) },
        ];
        if (typeof k.booleanPipeline === 'function') {
          k.booleanPipeline(base, steps, {});
        } else {
          let result = base;
          for (const step of steps) {
            if (step.op === 'fuse') result = k.fuse(result, step.tool, {});
            else result = k.cut(result, step.tool, {});
          }
        }
      })
    );
  });

  afterAll(() => {
    printResults(results);
    ALL.push(...results);
  });
});

afterAll(() => {
  printResults(ALL);
});
