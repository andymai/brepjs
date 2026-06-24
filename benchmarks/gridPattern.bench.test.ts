// A/B: brepjs `gridPattern` (kernel bulk-copy + `sameFace` fuseAll) vs the
// hand-rolled "translate each cell + fuseAll" array that consumers like
// gridfinity-layout-tool build by hand. Informs whether the instancing path
// (#1604) should route through gridPattern, and whether the gridfinity tool
// should switch from its hand-rolled clone+fuseAll.
//
// Cells are 42x42 on a 42 pitch, so adjacent cells share exact coplanar faces
// (the realistic continuous-baseplate case) — that's where `sameFace` glue
// applies, and it avoids the degenerate disjoint-fuse path.
//
// NOTE: under brepkit, gridPattern uses a native op that returns an UNFUSED
// compound (no boolean cost) — fast, but a different result than the fused
// hand-rolled array. **occt-wasm is the apples-to-apples comparison** (both
// produce a single fused solid); read that row when judging the trade-off.
//
// FINDINGS (occt-wasm, directional — re-run after kernel bumps):
//   - gridPattern ≈ hand-rolled at small grids (~16 cells), then pulls ahead
//     ~20% as the grid grows (36–64 cells). The win is the kernel bulk-copy +
//     nested row/column fuse, not `sameFace` glue — under occt-wasm,
//     `+sameFace` ≈ plain `fuseAll` (sameFace helps more under native occt).
//   - Under brepkit, gridPattern returns an unfused compound (near-free):
//     ideal for instanced previews, not for a single fused export solid.

import { describe, it, beforeAll } from 'vitest';
import { box, translate, fuseAll, unwrap, DisposalScope } from '../src/index.js';
import type { Shape3D } from '../src/index.js';
// gridPattern isn't re-exported from the top-level index (unlike its siblings
// linearPattern/circularPattern) — a small public-surface gap. Import direct.
import { gridPattern } from '../src/operations/patternFns.js';
import { initBenchKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBenchKernels();
}, 30000);

const PITCH = 42;
const CELL = (): Shape3D => box(PITCH, PITCH, 7);

function handRolled(cols: number, rows: number, sameFace: boolean): void {
  using scope = new DisposalScope();
  const copies: Shape3D[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cell = scope.register(CELL());
      copies.push(scope.register(translate(cell, [i * PITCH, j * PITCH, 0])));
    }
  }
  scope.register(
    unwrap(sameFace ? fuseAll(copies, { optimisation: 'sameFace', unsafe: true }) : fuseAll(copies))
  );
}

for (const [cols, rows] of [
  [4, 4],
  [6, 6],
  [8, 8],
] as const) {
  describe(`grid ${cols}x${rows} (${cols * rows} cells)`, () => {
    const results: BenchResult[] = [];

    it('gridPattern', async () => {
      collectResults(
        results,
        await benchBoth(`gridPattern ${cols}x${rows}`, () => {
          using scope = new DisposalScope();
          const cell = scope.register(CELL());
          scope.register(unwrap(gridPattern(cell, [1, 0, 0], [0, 1, 0], cols, rows, PITCH, PITCH)));
        })
      );
    });

    it('hand-rolled fuseAll', async () => {
      collectResults(
        results,
        await benchBoth(`handrolled ${cols}x${rows}`, () => {
          handRolled(cols, rows, false);
        })
      );
    });

    it('hand-rolled fuseAll + sameFace', async () => {
      collectResults(
        results,
        await benchBoth(`handrolled+sameFace ${cols}x${rows}`, () => {
          handRolled(cols, rows, true);
        })
      );
    });

    it('prints results', () => {
      printResults(results);
    });
  });
}
