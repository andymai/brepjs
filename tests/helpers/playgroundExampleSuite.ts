/**
 * The geometry gate for the playground examples. It is in several test files
 * (`EXAMPLE_TEST_FILES`), so the CI forks share the work. Each of those files
 * is one call of `describeExamplesOfFile`.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from '../setup.js';
import { CONNECTED_BODY_EXAMPLES, examplesOfFile } from './playgroundExampleCategories.js';
import { evalAndMeshExample, bodySolidCounts } from './playgroundExampleEval.js';
import { shouldSkipSuite } from './kernelDivergences.js';

// The largest hero takes about 40 s alone, and in CI its fork shares the
// runner with the forks of the other example files. It went past the default
// limit of 90 s there (92 s on #2707).
const HEAVY_EXAMPLE_TIMEOUT = 300_000;

// A test timeout cannot stop a synchronous kernel call that never returns, so
// an example that hangs on a kernel must be skipped before it starts.
const hangs = (id: string): boolean =>
  id === 'bench-vise' && shouldSkipSuite('playgroundExamples.benchVise');

/** Every example of the test file at `path` must evaluate and mesh against the kernel under test. */
export function describeExamplesOfFile(path: string): void {
  const examples = examplesOfFile(path);

  beforeAll(async () => {
    await initKernel();
  }, 60000);

  describe('playground examples', () => {
    for (const example of examples) {
      it.skipIf(hangs(example.id))(
        `evaluates and meshes: ${example.id}`,
        async () => {
          const { shapeCount, totalVertices } = await evalAndMeshExample(example.code);
          expect(shapeCount).toBeGreaterThan(0);
          expect(totalVertices).toBeGreaterThan(0);
        },
        HEAVY_EXAMPLE_TIMEOUT
      );
    }

    for (const example of examples) {
      if (!CONNECTED_BODY_EXAMPLES.includes(example.id)) continue;
      const { id, code } = example;
      it.skipIf(hangs(id))(
        `every returned body is a single connected solid: ${id}`,
        async () => {
          const counts = await bodySolidCounts(code);
          expect(counts.length).toBeGreaterThan(0);
          counts.forEach((n, i) => {
            expect(n, `${id} body[${i}] is not one solid (getSolids=${n})`).toBe(1);
          });
        },
        HEAVY_EXAMPLE_TIMEOUT
      );
    }
  });
}
