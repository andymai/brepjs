/**
 * Regression tests for gh #1906 — 2D handle leaks on the custom-corner path.
 *
 * `Curve2D.boundingBox` caches a `BoundingBox2d`, and `intersectCurves` reads
 * both operands' boxes. `removeCorner` / `dogboneFilletCurves` built offset
 * curves purely to locate the corner centre and dropped them, so every rounded
 * corner stranded those curves and their cached boxes in the
 * FinalizationRegistry: reclaimed on GC, never by disposal.
 *
 * The probes force collection and count `gcCollected` deltas, so a handle that
 * is only reachable by the registry reads as a leak. Requires --expose-gc
 * (set in vitest.config.ts execArgv).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import { getKernelCapabilities } from './helpers/kernelRegistry.js';
import { draw, drawRectangle } from '@/index.js';
import { getDisposalStats } from '@/core/disposal.js';
import { filletCurves, chamferCurves, dogboneFilletCurves } from '@/2d/lib/customCorners.js';
import { curve2dBoundingBox } from '@/2d/lib/curve2dFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const forceGc = (globalThis as { gc?: () => void }).gc;

async function drainGc(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    forceGc?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Average number of GC-reclaimed (i.e. never explicitly disposed) handles per call. */
async function leakPerCall(build: () => void, n = 20): Promise<number> {
  build();
  await drainGc();
  const start = getDisposalStats().gcCollected;
  for (let i = 0; i < n; i++) build();
  await drainGc();
  return (getDisposalStats().gcCollected - start) / n;
}

const gcIt = forceGc ? it : it.skip;

describe('custom corner handle leaks', () => {
  gcIt(
    'a sharp-cornered drawing leaks nothing (baseline)',
    async () => {
      const leak = await leakPerCall(() => {
        draw([0, 0]).lineTo([10, 0]).lineTo([10, 10]).lineTo([0, 10]).close();
      });
      expect(leak).toBeLessThan(0.5);
    },
    60000
  );

  gcIt(
    'a filleted corner leaks nothing',
    async () => {
      const leak = await leakPerCall(() => {
        draw([0, 0]).lineTo([10, 0]).customCorner(2).lineTo([10, 10]).lineTo([0, 10]).close();
      });
      expect(leak).toBeLessThan(0.5);
    },
    60000
  );

  gcIt(
    'a chamfered corner leaks nothing',
    async () => {
      const leak = await leakPerCall(() => {
        draw([0, 0])
          .lineTo([10, 0])
          .customCorner(2, 'chamfer')
          .lineTo([10, 10])
          .lineTo([0, 10])
          .close();
      });
      expect(leak).toBeLessThan(0.5);
    },
    60000
  );

  gcIt(
    'a dogbone corner leaks nothing',
    async () => {
      const leak = await leakPerCall(() => {
        draw([0, 0])
          .lineTo([10, 0])
          .lineTo([10, 10])
          .lineTo([0, 10])
          .closeWithCustomCorner(2, 'dogbone');
      });
      expect(leak).toBeLessThan(0.5);
    },
    60000
  );
});

// Corner treatments need 2D offsets, which manifold does not provide: it bails
// out and returns the two input curves untouched.
describe.skipIf(!getKernelCapabilities(currentKernel).kernel2D)(
  'custom corner geometry is unchanged',
  () => {
    const cornerCurves = () => {
      const curves = drawRectangle(10, 10).blueprint.curves;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return [curves[0]!, curves[1]!] as const;
    };

    it.each([
      ['fillet', filletCurves],
      ['chamfer', chamferCurves],
      ['dogbone', dogboneFilletCurves],
    ])('%s returns three connected curves', (_name, cornerFn) => {
      const [first, second] = cornerCurves();
      const result = cornerFn(first, second, 2);

      expect(result).toHaveLength(3);
      for (let i = 0; i < result.length - 1; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const end = result[i]!.lastPoint;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const start = result[i + 1]!.firstPoint;
        expect(start[0]).toBeCloseTo(end[0], 6);
        expect(start[1]).toBeCloseTo(end[1], 6);
      }
    });

    it('collinear curves are returned untouched and still usable', () => {
      const first = drawRectangle(10, 10).blueprint.curves[0];
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = filletCurves(first!, first!, 2);

      expect(result).toHaveLength(2);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(curve2dBoundingBox(result[0]!).width).toBeGreaterThanOrEqual(0);
    });
  }
);
