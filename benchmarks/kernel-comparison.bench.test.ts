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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { getKernel } from '../src/kernel/index.js';
import {
  collectResults,
  printResults,
  writeResultsJSON,
  generateReport,
  type BenchResult,
  type ReportSection,
} from './harness.js';
import { initBenchKernels, benchAll, hasBrepkit, getBrepkitVersion } from './setup.js';

// Accumulate all results for JSON output
const ALL_RESULTS: BenchResult[] = [];

/** Run benchAll and collect results into both a local array and ALL_RESULTS. */
async function benchAndCollect(
  target: BenchResult[],
  name: string,
  fn: () => void
): Promise<void> {
  const result = await benchAll(name, fn);
  collectResults(target, result);
  collectResults(ALL_RESULTS, result);
}

beforeAll(async () => {
  await initBenchKernels();
}, 30000);

// ---------------------------------------------------------------------------
// Primitive construction benchmarks
// ---------------------------------------------------------------------------

describe('Kernel comparison: Primitives', () => {
  const results: BenchResult[] = [];

  it('makeBox', async () => {
    await benchAndCollect(results, 'makeBox(10,20,30)', () => {
      const k = getKernel();
      for (let i = 0; i < 100; i++) {
        k.makeBox(10, 20, 30);
      }
    });
  });

  it('makeCylinder', async () => {
    await benchAndCollect(results, 'makeCylinder(5,20)', () => {
      const k = getKernel();
      for (let i = 0; i < 100; i++) {
        k.makeCylinder(5, 20);
      }
    });
  });

  it('makeSphere', async () => {
    await benchAndCollect(results, 'makeSphere(10)', () => {
      const k = getKernel();
      for (let i = 0; i < 100; i++) {
        k.makeSphere(10);
      }
    });
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
    await benchAndCollect(results, 'fuse(box,box)', () => {
      const k = getKernel();
      for (let i = 0; i < 10; i++) {
        const a = k.makeBox(10, 10, 10);
        const b = k.translate(k.makeBox(5, 5, 5), 5, 5, 5);
        k.fuse(a, b);
      }
    });
  });

  it('cut (box - cylinder)', async () => {
    await benchAndCollect(results, 'cut(box,cyl)', () => {
      const k = getKernel();
      for (let i = 0; i < 10; i++) {
        const box = k.makeBox(10, 10, 10);
        const cyl = k.makeCylinder(3, 20);
        k.cut(box, cyl);
      }
    });
  });

  it('intersect (box ∩ sphere)', async () => {
    await benchAndCollect(results, 'intersect(box,sphere)', () => {
      const k = getKernel();
      for (let i = 0; i < 10; i++) {
        const box = k.makeBox(10, 10, 10);
        const sph = k.makeSphere(8);
        k.intersect(box, sph);
      }
    });
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
    await benchAndCollect(results, 'translate ×1000', () => {
      const k = getKernel();
      let shape = k.makeBox(1, 1, 1);
      for (let i = 0; i < 1000; i++) {
        shape = k.translate(shape, 0.01, 0, 0);
      }
    });
  });

  it('rotate ×100', async () => {
    await benchAndCollect(results, 'rotate ×100', () => {
      const k = getKernel();
      let shape = k.makeBox(5, 5, 5);
      for (let i = 0; i < 100; i++) {
        shape = k.rotate(shape, 3.6, [0, 0, 1]);
      }
    });
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
    await benchAndCollect(results, 'mesh box (tol=0.1)', () => {
      const k = getKernel();
      const box = k.makeBox(10, 10, 10);
      k.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });
    });
  });

  it('mesh sphere (fine)', async () => {
    await benchAndCollect(results, 'mesh sphere (tol=0.01)', () => {
      const k = getKernel();
      const sph = k.makeSphere(10);
      k.mesh(sph, { tolerance: 0.01, angularTolerance: 0.1 });
    });
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
    await benchAndCollect(results, 'volume ×100', () => {
      const k = getKernel();
      const box = k.makeBox(10, 10, 10);
      for (let i = 0; i < 100; i++) {
        k.volume(box);
      }
    });
  });

  it('boundingBox ×100', async () => {
    await benchAndCollect(results, 'boundingBox ×100', () => {
      const k = getKernel();
      const box = k.makeBox(10, 10, 10);
      for (let i = 0; i < 100; i++) {
        k.boundingBox(box);
      }
    });
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
    await benchAndCollect(results, 'exportSTEP ×10', () => {
      const k = getKernel();
      const box = k.makeBox(10, 10, 10);
      for (let i = 0; i < 10; i++) {
        k.exportSTEP([box]);
      }
    });
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
    await benchAndCollect(results, 'box+chamfer', () => {
      const k = getKernel();
      const box = k.makeBox(20, 20, 20);
      const edges = k.iterShapes(box, 'edge');
      k.chamfer(box, edges, 1);
    });
  });

  it('box with filleted edges', async () => {
    await benchAndCollect(results, 'box+fillet', () => {
      const k = getKernel();
      const box = k.makeBox(20, 20, 20);
      const edges = k.iterShapes(box, 'edge');
      k.fillet(box, edges, 1);
    });
  });

  it('box - holes + fuse', async () => {
    await benchAndCollect(results, 'multi-boolean model', () => {
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

  // Auto-generate latest.md when at least 2 kernels ran
  if (ALL_RESULTS.length > 0) {
    const sectionDefs = [
      { title: 'Primitives', names: ['makeBox', 'makeCylinder', 'makeSphere'] },
      { title: 'Booleans', names: ['fuse', 'cut', 'intersect'] },
      { title: 'Transforms', names: ['translate', 'rotate'] },
      { title: 'Meshing', names: ['mesh box', 'mesh sphere'] },
      { title: 'Measurement', names: ['volume', 'boundingBox'] },
      { title: 'I/O', names: ['exportSTEP'] },
      { title: 'End-to-end', names: ['box+chamfer', 'box+fillet', 'multi-boolean'] },
    ];

    const sections: ReportSection[] = sectionDefs.map(({ title }) => ({
      title,
      results: [],
    }));

    for (const r of ALL_RESULTS) {
      const baseName = r.name.replace(/^\[[^\]]+] /, '');
      const idx = sectionDefs.findIndex((s) => s.names.some((n) => baseName.includes(n)));
      sections[idx === -1 ? sections.length - 1 : idx]!.results.push(r); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    }

    const nonEmptySections = sections.filter((s) => s.results.length > 0);
    const version = getBrepkitVersion();
    const dateStr = new Date().toISOString().slice(0, 10);
    const report = generateReport(nonEmptySections, version, dateStr);

    const dir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    const outPath = path.resolve(dir, 'results/latest.md');
    fs.writeFileSync(outPath, report, 'utf-8');
    console.log(`\n[benchmark] Report written to ${outPath}`);
  }
});
