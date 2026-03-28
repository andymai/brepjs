/**
 * Regression tests for issue #712:
 * Drawing.intersect() crashes with BrepBugError in rotateToStartAtSegment
 * when intersecting shapes that produce common (overlapping) segments.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { drawRectangle, drawRoundedRectangle } from '@/index.js';
import type { Drawing } from '@/sketching/draw.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Assert that a Drawing's bounding box matches expected width/height. */
function expectBounds(d: Drawing, width: number, height: number, precision = 0.1) {
  const [[xMin, yMin], [xMax, yMax]] = d.boundingBox.bounds;
  expect(xMax - xMin).toBeCloseTo(width, precision);
  expect(yMax - yMin).toBeCloseTo(height, precision);
}

describe('issue #712: rotateToStartAtSegment crash', () => {
  it('intersects two rectangles with shared edge (translate by half width)', () => {
    // 10×10 rects offset by 5 → overlap is 5×10
    const a = drawRectangle(10, 10);
    const b = drawRectangle(10, 10).translate(5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
    expectBounds(result, 5, 10);
  });

  it('intersects two rectangles with shared edge (exact edge alignment)', () => {
    const a = drawRectangle(10, 10);
    const b = drawRectangle(10, 10).translate(10, 0);
    expect(() => a.intersect(b)).not.toThrow();
  });

  it('intersects rectangle with rounded rectangle (shared straight segments)', () => {
    const a = drawRectangle(10, 10);
    const b = drawRoundedRectangle(10, 10, 1).translate(-5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
    // Overlap is the portion of the rounded rect inside the rectangle
    const [[xMin, yMin], [xMax, yMax]] = result.boundingBox.bounds;
    expect(xMax - xMin).toBeGreaterThan(0);
    expect(yMax - yMin).toBeGreaterThan(0);
  });

  it('intersects two rounded rectangles with shared segments', () => {
    const a = drawRoundedRectangle(10, 10, 1);
    const b = drawRoundedRectangle(10, 10, 1).translate(3, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
    const [[xMin, yMin], [xMax, yMax]] = result.boundingBox.bounds;
    expect(xMax - xMin).toBeGreaterThan(0);
    expect(yMax - yMin).toBeGreaterThan(0);
  });

  it('intersects rectangle with translated rounded rectangle (issue repro)', () => {
    const a = drawRectangle(12, 8);
    const b = drawRoundedRectangle(10, 10, 1).translate(-5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
  });

  it('intersects drawing with rounded rect (approximate lip profile)', () => {
    const profile = drawRectangle(6, 4).translate(0, 2);
    const clip = drawRoundedRectangle(10, 10, 1).translate(-5, 0);
    const result = profile.intersect(clip);
    expect(result).toBeDefined();
  });

  it('intersects shapes with near-boundary common segments', () => {
    // r=2 with offset 5 produces arcs near segment boundaries — must not crash
    const a = drawRoundedRectangle(10, 10, 2);
    const b = drawRoundedRectangle(10, 10, 2).translate(5, 0);
    expect(() => a.intersect(b)).not.toThrow();
  });

  it('intersects with negative translate (r=0 sharp corners)', () => {
    // r=0 means sharp corners — tests the same path as drawRectangle
    const a = drawRectangle(10, 10);
    const b = drawRoundedRectangle(10, 10, 0).translate(-5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
    expectBounds(result, 5, 10);
  });

  it('fuses then intersects rounded rectangles (compound boolean)', () => {
    const a = drawRoundedRectangle(10, 10, 1);
    const b = drawRoundedRectangle(8, 8, 1).translate(2, 0);
    const fused = a.fuse(b);
    const clip = drawRectangle(20, 6);
    const result = fused.intersect(clip);
    expect(result).toBeDefined();
  });

  it('intersects rounded rects with various radii and offsets', () => {
    // Stress-test common segment detection at arc/line junctions
    for (const r of [0.5, 1, 1.5, 2, 3]) {
      for (const offset of [2, 3, 4, 5]) {
        const a = drawRoundedRectangle(10, 10, r);
        const b = drawRoundedRectangle(10, 10, r).translate(offset, 0);
        expect(() => a.intersect(b), `r=${r} offset=${offset}`).not.toThrow();
      }
    }
  });
});
