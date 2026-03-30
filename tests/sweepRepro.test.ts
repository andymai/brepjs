/**
 * Regression test for #744: sweepSketch crash after PR #742 revert.
 *
 * Exercises the exact code path from the gridfinity-layout-tool:
 * drawRoundedRectangle → sketchOnPlane → sweepSketch with L-shaped profile.
 *
 * The root cause: Drawing.cut() can change the inner shape type from
 * Blueprint to Blueprints (plural). When sketchOnPlane() is called on a
 * Blueprints-backed Drawing, it returns Sketches (plural) instead of Sketch.
 * sweepSketch assumes a single Sketch with .wire — Sketches lacks .wire,
 * causing "Cannot read properties of undefined (reading 'wrapped')".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { drawRoundedRectangle, drawRectangle, draw, isSolid } from '@/index.js';
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

  it('sweepSketch with profile after 2D boolean cut produces a solid', () => {
    const spine = drawRoundedRectangle(80, 80, 3.75).sketchOnPlane() as Sketch;

    const swept = spine.sweepSketch(
      (plane, origin) => {
        // Build profile with a 2D boolean cut — this is the gridfinity pattern
        // that triggered the original crash. cut2D can return Blueprints (plural)
        // which Drawing.sketchOnPlane wraps as Sketches instead of Sketch.
        // Cut a rectangle with a strip across the middle — produces Blueprints (plural).
        // This mimics the gridfinity stacking lip pattern where a boolean cut on the
        // profile Drawing produces multiple disjoint pieces.
        const profile = drawRectangle(3, 2).cut(drawRectangle(4, 0.5));

        return profile.sketchOnPlane(plane, origin) as Sketch;
      },
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
