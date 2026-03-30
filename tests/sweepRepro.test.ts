/**
 * Regression test for #744: sweepSketch crash after PR #742 revert.
 *
 * Exercises the exact code path from the gridfinity-layout-tool:
 * drawRoundedRectangle → sketchOnPlane → sweepSketch with L-shaped profile.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { drawRoundedRectangle, draw, isSolid } from '@/index.js';
import type { AnyShape } from '@/core/shapeTypes.js';
import type Sketch from '@/sketching/sketch.js';
import { measureVolume } from '@/measurement/measureFns.js';
import { unwrap } from '@/core/result.js';
import { initKernel } from './setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('sweepSketch regression #744', () => {
  it('sweepSketch with drawRoundedRectangle spine produces a solid', () => {
    const spine = drawRoundedRectangle(80, 80, 3.75).sketchOnPlane() as Sketch;

    const swept = spine.sweepSketch(
      (plane, origin) =>
        draw([0, 0])
          .lineTo([1.5, 0])
          .lineTo([1.5, 0.5])
          .lineTo([0.5, 0.5])
          .lineTo([0.5, 1.8])
          .lineTo([0, 1.8])
          .close()
          .sketchOnPlane(plane, origin) as Sketch,
      { withContact: true }
    );

    expect(swept).toBeDefined();
    expect(isSolid(swept as AnyShape)).toBe(true);
    expect(unwrap(measureVolume(swept as AnyShape))).toBeGreaterThan(0);
  });

  it('sweepSketch with drawRoundedRectangle spine on XY plane', () => {
    const spine = drawRoundedRectangle(84, 84, 3.75).sketchOnPlane('XY') as Sketch;

    const swept = spine.sweepSketch(
      (plane, origin) =>
        draw([0, 0])
          .lineTo([1.5, 0])
          .lineTo([1.5, 0.5])
          .lineTo([0.5, 0.5])
          .lineTo([0.5, 1.8])
          .lineTo([0, 1.8])
          .close()
          .sketchOnPlane(plane, origin) as Sketch,
      { withContact: true }
    );

    expect(swept).toBeDefined();
    expect(isSolid(swept as AnyShape)).toBe(true);
    expect(unwrap(measureVolume(swept as AnyShape))).toBeGreaterThan(0);
  });

  it('sweepSketch with simple square profile', () => {
    const spine = drawRoundedRectangle(80, 80, 3.75).sketchOnPlane() as Sketch;

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

    expect(swept).toBeDefined();
    expect(isSolid(swept as AnyShape)).toBe(true);
    expect(unwrap(measureVolume(swept as AnyShape))).toBeGreaterThan(0);
  });
});
