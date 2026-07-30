/**
 * Regression tests for gh #1910 — `Blueprints`, `CompoundBlueprint` and
 * `Drawing` cached a `BoundingBox2d` with no disposal path, so the box (and
 * every child blueprint's own cache) survived until GC. `Blueprint` already
 * disposed its cache; the containers above it did not exist as disposables at
 * all, which also meant a `Drawing` could not be released by a caller.
 *
 * The GC probes require --expose-gc (set in vitest.config.ts execArgv).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import { getKernelCapabilities } from './helpers/kernelRegistry.js';
import { drawCircle, drawRectangle } from '@/index.js';
import { Drawing } from '@/sketching/drawing.js';
import { getDisposalStats } from '@/core/disposal.js';
import Blueprints from '@/2d/blueprints/blueprints.js';
import CompoundBlueprint from '@/2d/blueprints/compoundBlueprint.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const forceGc = (globalThis as { gc?: () => void }).gc;
const gcIt = forceGc ? it : it.skip;

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

describe('Drawing disposal', () => {
  it('disposes the box an empty drawing hands out', () => {
    const drawing = new Drawing();
    const box = drawing.boundingBox;

    expect(drawing.boundingBox).toBe(box);

    drawing.delete();

    expect(() => box.wrapped).toThrow();
  });

  it('cascades to the blueprint and its cached box', () => {
    const drawing = drawRectangle(10, 10);
    const blueprint = drawing.blueprint;
    const box = drawing.boundingBox;
    const curve = blueprint.curves[0];

    drawing.delete();

    expect(() => box.wrapped).toThrow();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(() => curve!.wrapped).toThrow();
  });

  it('is idempotent', () => {
    const drawing = drawRectangle(10, 10);
    void drawing.boundingBox;
    drawing.delete();

    expect(() => {
      drawing.delete();
    }).not.toThrow();
  });

  it('works with the using keyword', () => {
    let box;
    {
      using drawing = drawRectangle(10, 10);
      box = drawing.boundingBox;
      expect(box.width).toBeCloseTo(10, 6);
    }

    expect(() => box.wrapped).toThrow();
  });
});

describe('blueprint container disposal', () => {
  it('Blueprints disposes its own box and its children', () => {
    const first = drawRectangle(10, 10).blueprint;
    const second = drawRectangle(4, 4).blueprint;
    const container = new Blueprints([first, second]);

    const containerBox = container.boundingBox;
    const childBox = first.boundingBox;

    container.delete();

    expect(() => containerBox.wrapped).toThrow();
    expect(() => childBox.wrapped).toThrow();
  });

  it('CompoundBlueprint disposes its own box and its children', () => {
    const outer = drawCircle(10).blueprint;
    const inner = drawCircle(4).blueprint;
    const compound = new CompoundBlueprint([outer, inner]);

    const compoundBox = compound.boundingBox;
    const childBox = inner.boundingBox;

    compound.delete();

    expect(() => compoundBox.wrapped).toThrow();
    expect(() => childBox.wrapped).toThrow();
  });
});

// The container leak is measured on a drawing whose innerShape is a Blueprints,
// which a cut into disjoint regions produces. manifold has no 2D booleans.
describe.skipIf(!getKernelCapabilities(currentKernel).kernel2D)('container box leak', () => {
  gcIt(
    'reading a Blueprint drawing bounding box leaks nothing once disposed',
    async () => {
      const leak = await leakPerCall(() => {
        const drawing = drawRectangle(20, 2);
        void drawing.boundingBox;
        drawing.delete();
      });
      expect(leak).toBeLessThan(0.5);
    },
    60000
  );

  gcIt(
    'reading a Blueprints bounding box adds no leak of its own',
    async () => {
      const withoutRead = await leakPerCall(() => {
        drawRectangle(20, 2).cut(drawRectangle(2, 10));
      });
      const withRead = await leakPerCall(() => {
        const drawing = drawRectangle(20, 2).cut(drawRectangle(2, 10));
        void drawing.boundingBox;
        drawing.delete();
      });

      // The 2D boolean itself strands handles (gh #1910 follow-up); this asserts
      // only that reading and disposing the container adds nothing on top.
      expect(withRead).toBeLessThanOrEqual(withoutRead);
    },
    90000
  );
});
