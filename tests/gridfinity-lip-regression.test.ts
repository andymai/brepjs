/**
 * Regression test for #712 / #719 — Gridfinity lip profile 2D boolean pipeline.
 *
 * The lip cross-section is built via sequential 2D boolean operations:
 * 1. Sketch a polygon with diagonal + vertical segments
 * 2. intersect() with a rounded rectangle
 * 3. cut() with a rectangle
 * 4. sweepSketch() around a rounded rectangle path
 *
 * All worked on v14.6.9. The v15 2D boolean rewrite broke steps 2 and 3.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  draw,
  drawRoundedRectangle,
  drawRectangle,
  mesh,
  fuse,
  shell,
  translate,
  faceFinder,
  isOk,
  unwrap,
} from '@/index.js';
import type { Drawing, Sketch, Plane, Vec3, ValidSolid } from '@/index.js';

// Gridfinity spec v5 constants
const LIP_TAPER_WIDTH = 2.6;
const LIP_SMALL_TAPER = 0.7;
const LIP_VERTICAL_PART = 1.8;
const LIP_BIG_TAPER = 1.9;
const _LIP_HEIGHT = LIP_SMALL_TAPER + LIP_VERTICAL_PART + LIP_BIG_TAPER; // 4.4
const LIP_EXTENSION = 1.2;
const BOX_CORNER_RADIUS = 3.75;

beforeAll(async () => {
  await initKernel();
}, 30000);

function buildLipSketch(includeLip: boolean): Drawing {
  let sketcher = draw([-LIP_TAPER_WIDTH, 0])
    .line(LIP_SMALL_TAPER, LIP_SMALL_TAPER)
    .vLine(LIP_VERTICAL_PART)
    .line(LIP_BIG_TAPER, LIP_BIG_TAPER);

  if (includeLip) {
    sketcher = sketcher
      .vLineTo(-(LIP_TAPER_WIDTH + LIP_EXTENSION))
      .lineTo([-LIP_TAPER_WIDTH, -LIP_EXTENSION]);
  } else {
    sketcher = sketcher.vLineTo(0);
  }

  return sketcher.close();
}

describe('gridfinity lip profile 2D boolean pipeline (#712, #719)', () => {
  it('step 1: intersect lip profile with rounded rectangle', () => {
    const basicShape = buildLipSketch(true);
    const clipped = basicShape.intersect(drawRoundedRectangle(10, 10).translate(-5, 0));
    expect(clipped).toBeDefined();
    expect(clipped).not.toBeNull();
  });

  it('step 2: cut lip extension notch from intersected profile', () => {
    const basicShape = buildLipSketch(true);
    const clipped = basicShape.intersect(drawRoundedRectangle(10, 10).translate(-5, 0));
    const cut = clipped.cut(drawRectangle(LIP_EXTENSION, 10).translate(-LIP_EXTENSION / 2, -5));
    expect(cut).toBeDefined();
    expect(cut).not.toBeNull();
  });

  it('step 3: sweep lip profile around rounded rectangle path', () => {
    const topProfile = (plane: Plane, _origin: Vec3): Sketch => {
      const basicShape = buildLipSketch(true);
      let topProfileShape = basicShape.intersect(drawRoundedRectangle(10, 10).translate(-5, 0));
      topProfileShape = topProfileShape.cut(
        drawRectangle(LIP_EXTENSION, 10).translate(-LIP_EXTENSION / 2, -5)
      );
      return topProfileShape.sketchOnPlane(plane) as Sketch;
    };

    const outerW = 2 * 42 - 0.5; // 83.5mm (2-unit bin)
    const outerD = 2 * 42 - 0.5;
    const boxSketch = drawRoundedRectangle(
      outerW,
      outerD,
      BOX_CORNER_RADIUS
    ).sketchOnPlane() as Sketch;
    const swept = boxSketch.sweepSketch(topProfile, { withContact: true });

    expect(swept).toBeDefined();
    const result = mesh(swept);
    const triangleCount = result.triangles.length / 3;
    expect(triangleCount).toBeGreaterThan(0);
  });

  it('no-lip variant works (control test)', () => {
    const basicShape = buildLipSketch(false);
    const clipped = basicShape.intersect(drawRoundedRectangle(10, 10).translate(-5, 5));
    expect(clipped).toBeDefined();
  });
});

describe('gridfinity lip fuse regression (#724)', () => {
  it('fuse: shelled box + translated lip sweep', () => {
    const outerW = 2 * 42 - 0.5; // 83.5mm (2-unit bin)
    const outerD = 2 * 42 - 0.5;
    const boxHeight = 21;

    // Build shelled box
    const boxSketch = drawRoundedRectangle(
      outerW,
      outerD,
      BOX_CORNER_RADIUS
    ).sketchOnPlane() as Sketch;
    const box = boxSketch.extrude(boxHeight);
    const topFaces = faceFinder().parallelTo('Z').atDistance(boxHeight, [0, 0, 0]).findAll(box);
    const shelled = unwrap(shell(box as ValidSolid, topFaces, 1.2));

    // Build lip sweep
    const topProfile = (plane: Plane, _origin: Vec3): Sketch => {
      const basicShape = buildLipSketch(true);
      let topProfileShape = basicShape.intersect(drawRoundedRectangle(10, 10).translate(-5, 0));
      topProfileShape = topProfileShape.cut(
        drawRectangle(LIP_EXTENSION, 10).translate(-LIP_EXTENSION / 2, -5)
      );
      return topProfileShape.sketchOnPlane(plane) as Sketch;
    };

    const pathSketch = drawRoundedRectangle(
      outerW,
      outerD,
      BOX_CORNER_RADIUS
    ).sketchOnPlane() as Sketch;
    const lip = pathSketch.sweepSketch(topProfile, { withContact: true });
    const translatedLip = translate(lip, [0, 0, boxHeight]);

    // This should succeed, not throw BOOLEAN_HAS_ERRORS
    const fused = fuse(shelled, translatedLip);
    expect(isOk(fused)).toBe(true);

    // Verify the result is meshable
    const result = mesh(unwrap(fused));
    const triangleCount = result.triangles.length / 3;
    expect(triangleCount).toBeGreaterThan(0);
  });
});
