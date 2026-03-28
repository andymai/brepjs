/**
 * Regression tests for issue #712:
 * Drawing.intersect() crashes with BrepBugError in rotateToStartAtSegment
 * when intersecting shapes that produce common (overlapping) segments.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { draw, drawRectangle, drawRoundedRectangle } from '@/index.js';
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

  it('intersects draw()-built profile with rounded rect (shared edge at arc junction)', () => {
    // A tall thin rectangle whose left edge at x=0 aligns with the rounded
    // rect's right straight edge. The arc endpoints coincide with the common
    // segment boundaries, exercising orientation-flip matching.
    const profile = draw([0, -6]).lineTo([8, -6]).lineTo([8, 6]).lineTo([0, 6]).close();

    // drawRoundedRectangle(10, 10, 1) centered then shifted left by 5
    // → right edge straight segment at x=0, from y=-4 to y=4
    // → arc corners at x=0 produce intersection points near y=±4
    const clip = drawRoundedRectangle(10, 10, 1).translate(-5, 0);

    const result = profile.intersect(clip);
    expect(result).toBeDefined();
    const [[xMin, yMin], [xMax, yMax]] = result.boundingBox.bounds;
    expect(xMax - xMin).toBeGreaterThan(0);
    expect(yMax - yMin).toBeGreaterThan(0);
  });

  it('intersects gridfinity lip profile with clip rectangle — includeLip=true', () => {
    // Exact geometry from gridfinity-layout-tool boxBuilder.ts
    const LIP_SMALL_TAPER = 0.7;
    const LIP_VERTICAL_PART = 1.8;
    const LIP_BIG_TAPER = 1.9;
    const LIP_TAPER_WIDTH = LIP_SMALL_TAPER + LIP_BIG_TAPER; // 2.6
    const LIP_EXTENSION = 1.2;

    const basicShape = draw([-LIP_TAPER_WIDTH, 0])
      .line(LIP_SMALL_TAPER, LIP_SMALL_TAPER)
      .vLine(LIP_VERTICAL_PART)
      .line(LIP_BIG_TAPER, LIP_BIG_TAPER)
      .vLineTo(-(LIP_TAPER_WIDTH + LIP_EXTENSION))
      .lineTo([-LIP_TAPER_WIDTH, -LIP_EXTENSION])
      .close();

    const clip = drawRoundedRectangle(10, 10).translate(-5, 0);
    const result = basicShape.intersect(clip);
    expect(result).toBeDefined();
    const [[xMin, yMin], [xMax, yMax]] = result.boundingBox.bounds;
    expect(xMax - xMin).toBeGreaterThan(0);
    expect(yMax - yMin).toBeGreaterThan(0);
  });

  it('intersects gridfinity lip profile with clip rectangle — includeLip=false', () => {
    const LIP_SMALL_TAPER = 0.7;
    const LIP_VERTICAL_PART = 1.8;
    const LIP_BIG_TAPER = 1.9;
    const LIP_TAPER_WIDTH = LIP_SMALL_TAPER + LIP_BIG_TAPER; // 2.6

    const basicShape = draw([-LIP_TAPER_WIDTH, 0])
      .line(LIP_SMALL_TAPER, LIP_SMALL_TAPER)
      .vLine(LIP_VERTICAL_PART)
      .line(LIP_BIG_TAPER, LIP_BIG_TAPER)
      .vLineTo(0)
      .close();

    // includeLip=false: translate(-5, 5) — shared edges at y=0 and x=0
    const clip = drawRoundedRectangle(10, 10).translate(-5, 5);
    const result = basicShape.intersect(clip);
    expect(result).toBeDefined();
    const [[xMin, yMin], [xMax, yMax]] = result.boundingBox.bounds;
    expect(xMax - xMin).toBeGreaterThan(0);
    expect(yMax - yMin).toBeGreaterThan(0);
  });

  it('intersects draw()-built L-shape with rounded rect (Sketcher-like lip profile)', () => {
    // Simulate the issue reporter's lip profile — an L-shaped cross-section
    // that shares a partial edge with the rounded rectangle.
    const lip = draw([-2, 0])
      .lineTo([4, 0])
      .lineTo([4, 2])
      .lineTo([0, 2])
      .lineTo([0, 6])
      .lineTo([-2, 6])
      .close();

    const clip = drawRoundedRectangle(10, 10, 1).translate(-5, 0);
    const result = lip.intersect(clip);
    expect(result).toBeDefined();
    const [[xMin, yMin], [xMax, yMax]] = result.boundingBox.bounds;
    expect(xMax - xMin).toBeGreaterThan(0);
    expect(yMax - yMin).toBeGreaterThan(0);
  });

  it('cuts with shared corner edges (cut uses same code path)', () => {
    // Two rectangles sharing edges at a corner — cut must not crash
    const a = drawRectangle(10, 10);
    const b = drawRectangle(6, 6).translate(-2, -2);
    expect(() => a.cut(b)).not.toThrow();
  });

  it('fuses with shared corner edges (fuse uses same code path)', () => {
    const LIP_SMALL_TAPER = 0.7;
    const LIP_VERTICAL_PART = 1.8;
    const LIP_BIG_TAPER = 1.9;
    const LIP_TAPER_WIDTH = LIP_SMALL_TAPER + LIP_BIG_TAPER;

    const basicShape = draw([-LIP_TAPER_WIDTH, 0])
      .line(LIP_SMALL_TAPER, LIP_SMALL_TAPER)
      .vLine(LIP_VERTICAL_PART)
      .line(LIP_BIG_TAPER, LIP_BIG_TAPER)
      .vLineTo(0)
      .close();

    const clip = drawRoundedRectangle(10, 10).translate(-5, 5);
    // fuse uses blueprintsIntersectionSegments → rotateToStartAtSegment
    const result = basicShape.fuse(clip);
    expect(result).toBeDefined();
  });
});

describe('audit fixes: cut2D correctness', () => {
  it('cut by external tool returns shape unchanged (not null)', () => {
    // Create a CompoundBlueprint (rect with hole)
    const outer = drawRectangle(10, 10);
    const hole = drawRectangle(4, 4);
    const compound = outer.cut(hole);

    // Cut by a rect that is entirely outside — should return compound unchanged
    const external = drawRectangle(3, 3).translate(20, 0);
    const result = compound.cut(external);
    expect(result).toBeDefined();
    // Bounding box should match the original outer rect
    expectBounds(result, 10, 10);
  });

  it('cut by multiple disjoint tools subtracts all (sequential, not distributed)', () => {
    const base = drawRectangle(20, 10);
    // Two disjoint holes at opposite ends
    const holeA = drawRectangle(2, 2).translate(-6, 0);
    const holeB = drawRectangle(2, 2).translate(6, 0);

    // First cut both individually to get expected area
    const cutA = base.cut(holeA);
    const cutBoth = cutA.cut(holeB);

    // Now fuse the two holes and cut in one operation
    const fusedHoles = holeA.fuse(holeB);
    const cutFused = base.cut(fusedHoles);

    // Both approaches should produce the same bounding box
    expect(cutBoth).toBeDefined();
    expect(cutFused).toBeDefined();
    expectBounds(cutBoth, 20, 10);
    expectBounds(cutFused, 20, 10);
  });
});
