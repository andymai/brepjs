/**
 * Reproduction test for #744 — Drawing with 2D booleans → sweepSketch crash.
 * Mimics the gridfinity stacking lip builder pattern.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  draw,
  drawRoundedRectangle,
  drawRectangle,
} from '../src/index.js';
import type { Sketch, Plane, Vec3 } from '../src/index.js';

beforeAll(() => initKernel());

describe('sweepSketch with Drawing booleans (#744)', () => {
  it('sweeps a profile that uses Drawing.intersect() + Drawing.cut()', () => {
    const LIP_TAPER_WIDTH = 0.7;
    const LIP_SMALL_TAPER = 0.7;
    const LIP_VERTICAL_PART = 1.8;
    const LIP_BIG_TAPER = 1.9;
    const LIP_EXTENSION = 1.2;

    const topProfile = (plane: Plane, _origin: Vec3): Sketch => {
      const basicShape = draw([-LIP_TAPER_WIDTH, 0])
        .line(LIP_SMALL_TAPER, LIP_SMALL_TAPER)
        .vLine(LIP_VERTICAL_PART)
        .line(LIP_BIG_TAPER, LIP_BIG_TAPER)
        .vLineTo(-(LIP_TAPER_WIDTH + LIP_EXTENSION))
        .lineTo([-LIP_TAPER_WIDTH, -LIP_EXTENSION])
        .close();

      let topProfileShape = basicShape.intersect(
        drawRoundedRectangle(10, 10).translate(-5, 0)
      );

      topProfileShape = topProfileShape.cut(
        drawRectangle(LIP_EXTENSION, 10).translate(-LIP_EXTENSION / 2, -5)
      );

      const result = topProfileShape.sketchOnPlane(plane);
      console.log('sketchOnPlane result type:', result.constructor.name);
      console.log('has wire?', 'wire' in result);
      console.log('has sketches?', 'sketches' in result);
      if ('sketches' in result) {
        const sketches = (result as { sketches: unknown[] }).sketches;
        console.log('sketches count:', sketches.length);
        console.log('sketches[0] type:', sketches[0]?.constructor.name);
        console.log('sketches[0] has wire?', sketches[0] && 'wire' in (sketches[0] as object));
      }
      return result as Sketch;
    };

    const outerW = 2 * 42 - 0.5;
    const outerD = 2 * 42 - 0.5;
    const BOX_CORNER_RADIUS = 3.75;

    const boxSketch = drawRoundedRectangle(outerW, outerD, BOX_CORNER_RADIUS)
      .sketchOnPlane() as Sketch;

    expect(() => {
      boxSketch.sweepSketch(topProfile as (plane: Plane, origin: Vec3) => typeof boxSketch, { withContact: true });
    }).not.toThrow();
  });
});
