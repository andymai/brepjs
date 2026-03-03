/**
 * Kernel comparison benchmarks — brepkit vs OCCT.
 *
 * Compares identical operations through both kernel adapters.
 * Results are printed as a markdown table for easy comparison.
 *
 * ## Prerequisites
 *
 * 1. OCCT: `npm install` (brepjs-opencascade already bundled)
 * 2. brepkit: build WASM and copy to node_modules or use a local path:
 *    ```bash
 *    cd ~/Git/brepkit && ./scripts/build-wasm-release.sh
 *    ```
 *
 * ## Running
 *
 * ```bash
 * npx vitest run benchmarks/kernel-comparison.bench.test.ts
 * ```
 *
 * If brepkit WASM is not available, brepkit benchmarks are skipped gracefully.
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { getKernel, registerKernel, withKernel } from '../src/kernel/index.js';
import { BrepkitAdapter } from '../src/kernel/brepkitAdapter.js';
import { bench, printResults, writeResultsJSON, type BenchResult } from './harness.js';

// Accumulate all results for JSON output
const ALL_RESULTS: BenchResult[] = [];

let hasBrepkit = false;

beforeAll(async () => {
  // Always init OCCT
  await initOC();

  // Try to init brepkit
  try {
    // Dynamic import — will fail if WASM not available
    const brepkitWasm = await import('brepkit-wasm');
    if (brepkitWasm.default) {
      await brepkitWasm.default(); // init WASM
    }
    const kernel = new brepkitWasm.BrepKernel();
    registerKernel('brepkit', new BrepkitAdapter(kernel));
    hasBrepkit = true;
    console.log('[benchmark] brepkit WASM loaded successfully');
  } catch {
    console.log('[benchmark] brepkit WASM not available — brepkit benchmarks will be skipped');
  }
}, 30000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type KernelId = 'occt' | 'brepkit';

async function benchKernel(
  kernelId: KernelId,
  name: string,
  fn: () => void
): Promise<BenchResult | null> {
  if (kernelId === 'brepkit' && !hasBrepkit) return null;

  return bench(`[${kernelId}] ${name}`, () => {
    withKernel(kernelId, fn);
  });
}

async function benchBoth(
  name: string,
  fn: () => void
): Promise<{ occt: BenchResult; brepkit: BenchResult | null }> {
  const occt = (await benchKernel('occt', name, fn))!;
  occt.kernel = 'occt';
  ALL_RESULTS.push(occt);

  const brepkit = await benchKernel('brepkit', name, fn);
  if (brepkit) {
    brepkit.kernel = 'brepkit';
    ALL_RESULTS.push(brepkit);
  }

  return { occt, brepkit };
}

// ---------------------------------------------------------------------------
// Primitive construction benchmarks
// ---------------------------------------------------------------------------

describe('Kernel comparison: Primitives', () => {
  const results: BenchResult[] = [];

  it('makeBox', async () => {
    const { occt, brepkit } = await benchBoth('makeBox(10,20,30)', () => {
      const k = getKernel();
      for (let i = 0; i < 100; i++) {
        k.makeBox(10, 20, 30);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('makeCylinder', async () => {
    const { occt, brepkit } = await benchBoth('makeCylinder(5,20)', () => {
      const k = getKernel();
      for (let i = 0; i < 100; i++) {
        k.makeCylinder(5, 20);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('makeSphere', async () => {
    const { occt, brepkit } = await benchBoth('makeSphere(10)', () => {
      const k = getKernel();
      for (let i = 0; i < 100; i++) {
        k.makeSphere(10);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('print primitive results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// Boolean operation benchmarks
// ---------------------------------------------------------------------------

describe('Kernel comparison: Booleans', () => {
  const results: BenchResult[] = [];

  it('fuse (box ∪ box)', async () => {
    const { occt, brepkit } = await benchBoth('fuse(box,box)', () => {
      const k = getKernel();
      for (let i = 0; i < 10; i++) {
        const a = k.makeBox(10, 10, 10);
        const b = k.translate(k.makeBox(5, 5, 5), 5, 5, 5);
        k.fuse(a, b);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('cut (box - cylinder)', async () => {
    const { occt, brepkit } = await benchBoth('cut(box,cyl)', () => {
      const k = getKernel();
      for (let i = 0; i < 10; i++) {
        const box = k.makeBox(10, 10, 10);
        const cyl = k.makeCylinder(3, 20);
        k.cut(box, cyl);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('intersect (box ∩ sphere)', async () => {
    const { occt, brepkit } = await benchBoth('intersect(box,sphere)', () => {
      const k = getKernel();
      for (let i = 0; i < 10; i++) {
        const box = k.makeBox(10, 10, 10);
        const sph = k.makeSphere(8);
        k.intersect(box, sph);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('print boolean results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// Transform benchmarks
// ---------------------------------------------------------------------------

describe('Kernel comparison: Transforms', () => {
  const results: BenchResult[] = [];

  it('translate ×1000', async () => {
    const { occt, brepkit } = await benchBoth('translate ×1000', () => {
      const k = getKernel();
      let shape = k.makeBox(1, 1, 1);
      for (let i = 0; i < 1000; i++) {
        shape = k.translate(shape, 0.01, 0, 0);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('rotate ×100', async () => {
    const { occt, brepkit } = await benchBoth('rotate ×100', () => {
      const k = getKernel();
      let shape = k.makeBox(5, 5, 5);
      for (let i = 0; i < 100; i++) {
        shape = k.rotate(shape, 3.6, [0, 0, 1]);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('print transform results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// Meshing benchmarks
// ---------------------------------------------------------------------------

describe('Kernel comparison: Meshing', () => {
  const results: BenchResult[] = [];

  it('mesh box (coarse)', async () => {
    const { occt, brepkit } = await benchBoth('mesh box (tol=0.1)', () => {
      const k = getKernel();
      const box = k.makeBox(10, 10, 10);
      k.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('mesh sphere (fine)', async () => {
    const { occt, brepkit } = await benchBoth('mesh sphere (tol=0.01)', () => {
      const k = getKernel();
      const sph = k.makeSphere(10);
      k.mesh(sph, { tolerance: 0.01, angularTolerance: 0.1 });
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('print meshing results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// Measurement benchmarks
// ---------------------------------------------------------------------------

describe('Kernel comparison: Measurement', () => {
  const results: BenchResult[] = [];

  it('volume ×100', async () => {
    const { occt, brepkit } = await benchBoth('volume ×100', () => {
      const k = getKernel();
      const box = k.makeBox(10, 10, 10);
      for (let i = 0; i < 100; i++) {
        k.volume(box);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('boundingBox ×100', async () => {
    const { occt, brepkit } = await benchBoth('boundingBox ×100', () => {
      const k = getKernel();
      const box = k.makeBox(10, 10, 10);
      for (let i = 0; i < 100; i++) {
        k.boundingBox(box);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('print measurement results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// I/O benchmarks
// ---------------------------------------------------------------------------

describe('Kernel comparison: I/O', () => {
  const results: BenchResult[] = [];

  it('exportSTEP ×10', async () => {
    const { occt, brepkit } = await benchBoth('exportSTEP ×10', () => {
      const k = getKernel();
      const box = k.makeBox(10, 10, 10);
      for (let i = 0; i < 10; i++) {
        k.exportSTEP([box]);
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('print I/O results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// End-to-end model benchmark
// ---------------------------------------------------------------------------

describe('Kernel comparison: End-to-end model', () => {
  const results: BenchResult[] = [];

  it('box with chamfered edges', async () => {
    const { occt, brepkit } = await benchBoth('box+chamfer', () => {
      const k = getKernel();
      const box = k.makeBox(20, 20, 20);
      const edges = k.iterShapes(box, 'edge');
      k.chamfer(box, edges, 1);
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('box with filleted edges', async () => {
    const { occt, brepkit } = await benchBoth('box+fillet', () => {
      const k = getKernel();
      const box = k.makeBox(20, 20, 20);
      const edges = k.iterShapes(box, 'edge');
      k.fillet(box, edges, 1);
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('box - holes + fuse', async () => {
    const { occt, brepkit } = await benchBoth('multi-boolean model', () => {
      const k = getKernel();
      let result = k.makeBox(50, 50, 10);

      // Punch 4 holes
      for (let x = -15; x <= 15; x += 10) {
        for (let y = -15; y <= 15; y += 10) {
          const hole = k.translate(k.makeCylinder(3, 20), x, y, -5);
          result = k.cut(result, hole);
        }
      }
    });
    results.push(occt);
    if (brepkit) results.push(brepkit);
  });

  it('print end-to-end results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// JSON output for CI / bench-compare.sh
// ---------------------------------------------------------------------------

afterAll(() => {
  if (process.env.BENCH_OUTPUT_JSON) {
    writeResultsJSON(ALL_RESULTS);
  }
});
