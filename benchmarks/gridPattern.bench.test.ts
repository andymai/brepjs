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
// FINDINGS (occt-wasm 3.6.0, directional — re-run after kernel bumps):
//   - gridPattern is the FASTEST approach here — faster than every hand-rolled
//     baseline, pulling ~25% ahead as the grid grows (6x6: 37 vs 46 ms; 8x8:
//     65 vs 87 ms vs the commonFace hand-roll). The win is the kernel bulk-copy
//     + balanced row/column fuse, NOT glue.
//   - Glue is a no-op on this build: `+sameFace` ≈ `+commonFace` ≈ plain
//     `fuseAll`. The glue lever the consumer's "tuned" path relies on doesn't
//     engage under occt-wasm (it helps more under native occt).
//   - The `booleanPipeline + commonFace` baseline (#1659's cited "tuned" path)
//     is DRAMATICALLY slower — measured once on occt-wasm 3.6.0 at ~8x (36
//     cells) to ~11.5x (64 cells: 748 vs 65 ms). It isn't a live row here:
//     booleanPipeline needs the native pipeline class, which not all builds
//     ship, and a missing-class run would record a misleading no-fuse timing.
//     Chaining N sequential fuses re-walks the growing accumulator each step;
//     for many independent cells, gridPattern's batched fuse is the right tool.
//   - Net: gridPattern already matches/beats the tuned baseline on occt-wasm
//     (#1659 acceptance #1). The 2.1x gap reported on brepjs 18.104.0 is closed
//     — a downstream tool should delete its bespoke grid-fuse layer and call
//     gridPattern (the #1606 goal). The pocket-grid (CUT) case is a different
//     operation and out of gridPattern's fuse scope.
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

function handRolled(cols: number, rows: number, glue: 'none' | 'sameFace' | 'commonFace'): void {
  using scope = new DisposalScope();
  const copies: Shape3D[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cell = scope.register(CELL());
      copies.push(scope.register(translate(cell, [i * PITCH, j * PITCH, 0])));
    }
  }
  scope.register(
    unwrap(
      glue === 'none' ? fuseAll(copies) : fuseAll(copies, { optimisation: glue, unsafe: true })
    )
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
          handRolled(cols, rows, 'none');
        })
      );
    });

    it('hand-rolled fuseAll + sameFace', async () => {
      collectResults(
        results,
        await benchBoth(`handrolled+sameFace ${cols}x${rows}`, () => {
          handRolled(cols, rows, 'sameFace');
        })
      );
    });

    // The tuned baseline a downstream consumer (gridfinity-layout-tool) builds by
    // hand — translate each cell + a commonFace-glued fuse. #1659 is about
    // gridPattern matching or beating *this*, not just the naive fuseAll.
    it('hand-rolled fuseAll + commonFace (tuned baseline)', async () => {
      collectResults(
        results,
        await benchBoth(`handrolled+commonFace ${cols}x${rows}`, () => {
          handRolled(cols, rows, 'commonFace');
        })
      );
    });

    it('prints results', () => {
      printResults(results);
    });
  });
}
