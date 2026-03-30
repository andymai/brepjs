/**
 * Regression test for #753: sweepSketch produces outward-oriented lip profile.
 *
 * A profile swept along a rounded-rectangle spine should extend INWARD
 * (toward the rectangle's center), not outward.  We verify this by
 * comparing the bounding box of the swept shape against the spine's
 * bounding box — the swept bounds must be ≤ the spine bounds in X and Y.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { drawRoundedRectangle, draw, getBounds } from '@/index.js';
import type { AnyShape } from '@/core/shapeTypes.js';
import type Sketch from '@/sketching/sketch.js';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('sweepSketch orientation #753', () => {
  it('positive-X profile sweeps inward (no overhang)', (ctx) => {
    skipIfDiverges(ctx, 'sweepSketch.inwardOverhang');
    // Profile entirely in positive X should sweep inward with no overhang.
    const spine = drawRoundedRectangle(80, 80, 3.75).sketchOnPlane('XY') as Sketch;
    const spineBounds = getBounds(spine.wire as AnyShape);

    const swept = spine.sweepSketch(
      (plane, origin) =>
        draw([0, 0])
          .lineTo([2, 0])
          .lineTo([2, 2])
          .lineTo([0, 2])
          .close()
          .sketchOnPlane(plane, origin) as Sketch,
      { withContact: true }
    );

    const sweptBounds = getBounds(swept as AnyShape);

    expect(sweptBounds.xMax).toBeLessThanOrEqual(spineBounds.xMax + 0.1);
    expect(sweptBounds.xMin).toBeGreaterThanOrEqual(spineBounds.xMin - 0.1);
    expect(sweptBounds.yMax).toBeLessThanOrEqual(spineBounds.yMax + 0.1);
    expect(sweptBounds.yMin).toBeGreaterThanOrEqual(spineBounds.yMin - 0.1);
  });

  it('raw lip profile has at most 0.8mm outward extent (negative-X portion)', (ctx) => {
    skipIfDiverges(ctx, 'sweepSketch.lipOverhangTolerance');

    const w = 125.5;
    const d = 125.5;

    const spine = drawRoundedRectangle(w, d, 3.75).sketchOnPlane('XY') as Sketch;
    const spineBounds = getBounds(spine.wire as AnyShape);

    // Raw gridfinity lip profile without 2D booleans — starts at x=-0.7,
    // so 0.7mm naturally extends outward. Before the fix this was ~1.8mm.
    const swept = spine.sweepSketch(
      (plane, origin) => {
        const shape = draw([-0.7, 0])
          .line(0.7, 0.7)
          .vLine(1.8)
          .line(1.9, 1.9)
          .vLineTo(-1.9)
          .lineTo([-0.7, -1.2])
          .close();
        return shape.sketchOnPlane(plane, origin) as Sketch;
      },
      { withContact: true }
    );

    const sweptBounds = getBounds(swept as AnyShape);

    // The profile's negative-X extent (-0.7) maps to ≤0.8mm outward.
    // Before the fix, this was ~1.8mm outward (positive-X extent mapped outward).
    const overhangX = Math.max(
      sweptBounds.xMax - spineBounds.xMax,
      spineBounds.xMin - sweptBounds.xMin
    );
    const overhangY = Math.max(
      sweptBounds.yMax - spineBounds.yMax,
      spineBounds.yMin - sweptBounds.yMin
    );

    expect(overhangX).toBeLessThanOrEqual(0.8);
    expect(overhangY).toBeLessThanOrEqual(0.8);
  });
});
