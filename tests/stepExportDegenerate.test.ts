import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import {
  draw,
  translate,
  fuseAll,
  helix,
  sweep,
  sketchCircle,
  createPlane,
  box,
  exportSTEP,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  type AnyShape,
  type Result,
} from '@/index.js';

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * Reconstructs the smallest known reproduction of #1126: fusing an annular-sector
 * tread (arc-cylinder + planar faces, from `threePointsArcTo` + `extrude`) with a
 * frenet-swept helical rail tube. The two solids are *geometrically disjoint*, yet
 * OCCT's BOPAlgo corrupts both outputs' exact topology — they pass
 * `isValid`/`validSolid`/`mesh`/`getBounds`/`measureArea` but OOB-trap the STEP/BREP
 * writer. Each input serializes fine on its own; only this specific pairing triggers it.
 *
 * Note: the list-builder `fuseAll` path reproduces this deterministically; the
 * pairwise `fuse` path (a different OCCT algorithm) does not, so this must use `fuseAll`.
 */
function buildCorruptingFuse(): AnyShape {
  const TREAD_T = 4,
    TREAD_INNER_R = 10,
    TREAD_OUTER_R = 62,
    TREAD_SWEEP = 24,
    TREAD_Z0 = 4;
  const RAIL_DIA = 5,
    RAIL_R = 66,
    RAIL_Z_START = 14,
    RAIL_Z_END = 130;

  const half = TREAD_SWEEP / 2;
  const pt = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];
  const tread = draw(pt(TREAD_INNER_R, deg(-half)))
    .lineTo(pt(TREAD_OUTER_R, deg(-half)))
    .threePointsArcTo(pt(TREAD_OUTER_R, deg(half)), [TREAD_OUTER_R, 0])
    .lineTo(pt(TREAD_INNER_R, deg(half)))
    .threePointsArcTo(pt(TREAD_INNER_R, deg(-half)), [TREAD_INNER_R, 0])
    .close()
    .sketchOnPlane('XY')
    .extrude(TREAD_T);
  const tread0 = translate(tread, [0, 0, TREAD_Z0]);

  const railHeight = RAIL_Z_END - RAIL_Z_START;
  const railPath = helix(railHeight, railHeight, RAIL_R, { at: [0, 0, RAIL_Z_START] });
  const railPlane = createPlane([RAIL_R, 0, RAIL_Z_START], null, [
    0,
    RAIL_R,
    railHeight / (2 * Math.PI),
  ]);
  const railProfile = sketchCircle(RAIL_DIA / 2, { plane: railPlane }).wire;
  const rail = unwrap(sweep(railProfile, railPath, { frenet: true }));

  return unwrap(fuseAll([tread0, rail]));
}

// Isolated in its own file: a successful trap poisons the kernel's writer for the
// rest of the worker, so this must not share a process with other export tests.
// Gated to occt — the BOPAlgo corruption is specific to the occt-wasm build (the
// manifold mesh kernel doesn't export STEP at all).
describe.skipIf(currentKernel !== 'occt')(
  'STEP export of BOPAlgo-corrupted geometry (#1126)',
  () => {
    beforeAll(async () => {
      await initKernel();
    }, 30000);

    it('exports a healthy box before the poisoning call', () => {
      // Proves the kernel is alive, so a later failure is attributable to the shape.
      expect(isOk(exportSTEP(box(5, 5, 5)))).toBe(true);
    });

    it('returns a clean Err (never throws, never a phantom file-read error)', () => {
      const shape = buildCorruptingFuse();

      // Core #1126/#1128 guarantee: the writer trap is caught and returned as a Result,
      // never an uncaught WASM trap escaping to the caller. Assert the no-throw contract
      // directly (one call only — a second would hit the now-poisoned writer).
      let result: Result<Blob> | undefined;
      expect(() => {
        result = exportSTEP(shape);
      }).not.toThrow();

      // A future OCCT fix flips this to Ok — allowed. What must never regress: the trap
      // being mislabelled as the phantom "Failed to read exported STEP file" error.
      if (result && isErr(result)) {
        const { code } = unwrapErr(result);
        expect(['STEP_EXPORT_CRASHED', 'STEP_EXPORT_UNSERIALIZABLE']).toContain(code);
        expect(code).not.toBe('STEP_FILE_READ_ERROR');
      }
    });
  }
);
