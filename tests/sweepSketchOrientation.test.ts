/**
 * Regression test for sweepSketch xDir convention.
 *
 * In sweepSketch, the profile's local X axis maps OUTWARD from the spine
 * center (positive-X = outward). Negative-X maps inward. This convention
 * is relied upon by gridfinity-layout-tool and other consumers.
 *
 * See also: gridfinity-smoke.test.ts "real lip profile" test for the
 * end-to-end verification of this convention.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { drawRoundedRectangle, draw, getBounds } from '@/index.js';
import type { AnyShape } from '@/core/shapeTypes.js';
import type Sketch from '@/sketching/sketch.js';
import { initKernel } from './setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('sweepSketch orientation', () => {
  it('positive-X profile sweeps outward from spine', () => {
    // Profile entirely in positive X should sweep outward (away from center).
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

    // Positive-X = outward, so swept bounds should EXCEED spine bounds
    expect(sweptBounds.xMax).toBeGreaterThan(spineBounds.xMax);
    expect(sweptBounds.yMax).toBeGreaterThan(spineBounds.yMax);
  });

  it('lip profile with negative-X start has controlled outward extent', () => {
    const w = 125.5;
    const d = 125.5;

    const spine = drawRoundedRectangle(w, d, 3.75).sketchOnPlane('XY') as Sketch;
    const spineBounds = getBounds(spine.wire as AnyShape);

    // Gridfinity lip profile — starts at x=-0.7 (inward), extends via
    // positive-X line() calls (outward). The max positive-X extent from
    // the line() calls is ~1.9mm.
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

    // The profile's positive-X extent maps outward (~1.9mm).
    const overhangX = Math.max(
      sweptBounds.xMax - spineBounds.xMax,
      spineBounds.xMin - sweptBounds.xMin
    );

    // Overhang should be roughly the positive-X extent of the profile
    expect(overhangX).toBeGreaterThan(1.0);
    expect(overhangX).toBeLessThan(3.0);
  });
});
