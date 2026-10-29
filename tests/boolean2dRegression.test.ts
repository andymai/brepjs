/**
 * Regression tests for issue #712:
 * Drawing.intersect() crashes with BrepBugError in rotateToStartAtSegment
 * when intersecting shapes that produce common (overlapping) segments.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  CompoundSketch,
  draw,
  drawCircle,
  drawRectangle,
  drawRoundedRectangle,
  fuseBlueprints,
  cutBlueprints,
  intersectBlueprints,
  measureArea,
  Sketch,
  Sketches,
  unwrap,
} from '@/index.js';
import Blueprint from '@/2d/blueprints/blueprint.js';
import { intersectCurves } from '@/2d/lib/index.js';
import { Curve2D } from '@/2d/lib/curve2D.js';
import { makeCircle2d } from '@/kernel/geometry2d.js';
import type { Drawing } from '@/sketching/drawing.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Summed face area of every outline in a drawing (holes subtracted); 0 when empty. */
function totalArea(d: Drawing): number {
  if (d.repr === '=== empty shape') return 0;
  const sketch = d.sketchOnPlane('XY');
  const parts = sketch instanceof Sketches ? sketch.sketches : [sketch];
  let total = 0;
  for (const part of parts) {
    if (!(part instanceof Sketch || part instanceof CompoundSketch)) {
      throw new Error('unexpected sketch type');
    }
    try {
      using face = part.face();
      total += unwrap(measureArea(face));
    } finally {
      part.delete();
    }
  }
  return total;
}

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

    // The outlines lie on either side of x=0 and only touch along it.
    expect(totalArea(profile.intersect(clip))).toBe(0);
    expect(totalArea(profile.fuse(clip))).toBeCloseTo(96 + 96 + Math.PI, 3);
    expect(totalArea(profile.cut(clip))).toBeCloseTo(96, 3);
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

describe('issue #719: degenerate curves in chained boolean pipeline', () => {
  it('cuts intersect result with rectangle — gridfinity lip pipeline', () => {
    // Exact geometry from gridfinity-layout-tool boxBuilder.ts
    // Step 1: intersect lip profile with rounded rect (fixed by #717)
    // Step 2: cut result with a rectangle → crashed with
    // "removeNonCrossingPoints: Odd number of segments at intersection point"
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

    // Step 1: intersect
    const step1 = basicShape.intersect(drawRoundedRectangle(10, 10).translate(-5, 0));
    expect(step1).toBeDefined();

    // Step 2: cut — this is the crash from #719
    const step2 = step1.cut(drawRectangle(LIP_EXTENSION, 10).translate(-LIP_EXTENSION / 2, -5));
    expect(step2).toBeDefined();

    // Verify the result has sensible dimensions: the lip profile is ~2.6mm
    // wide; height depends on intersection/cut geometry.
    const [[xMin, yMin], [xMax, yMax]] = step2.boundingBox.bounds;
    expect(xMax - xMin).toBeCloseTo(2.6, 0);
    expect(yMax - yMin).toBeGreaterThan(3);
  });
});

describe('geometric correctness', () => {
  it('fuseBlueprints produces correct bounding box for overlapping rectangles', () => {
    const r1 = drawRectangle(10, 10);
    const r2 = drawRectangle(10, 10).translate(5, 0);
    const result = fuseBlueprints(r1.blueprint, r2.blueprint);
    expect(result).toBeInstanceOf(Blueprint);
    if (result instanceof Blueprint) {
      const bb = result.boundingBox;
      expect(bb.width).toBeCloseTo(15, 1);
      expect(bb.height).toBeCloseTo(10, 1);
    }
  });

  it('cutBlueprints produces correct bounding box', () => {
    const r1 = drawRectangle(10, 10);
    const r2 = drawRectangle(10, 10).translate(5, 0);
    const result = cutBlueprints(r1.blueprint, r2.blueprint);
    expect(result).toBeInstanceOf(Blueprint);
    if (result instanceof Blueprint) {
      const bb = result.boundingBox;
      expect(bb.width).toBeCloseTo(5, 0);
      expect(bb.height).toBeCloseTo(10, 1);
    }
  });

  it('intersectBlueprints produces correct bounding box', () => {
    const r1 = drawRectangle(10, 10);
    const r2 = drawRectangle(10, 10).translate(5, 0);
    const result = intersectBlueprints(r1.blueprint, r2.blueprint);
    expect(result).toBeInstanceOf(Blueprint);
    if (result instanceof Blueprint) {
      const bb = result.boundingBox;
      expect(bb.width).toBeCloseTo(5, 0);
      expect(bb.height).toBeCloseTo(10, 1);
    }
  });

  it('fuse of identical shapes returns a clone', () => {
    const r = drawRectangle(10, 10);
    const result = fuseBlueprints(r.blueprint, r.blueprint);
    expect(result).toBeInstanceOf(Blueprint);
    if (result instanceof Blueprint) {
      const bb = result.boundingBox;
      expect(bb.width).toBeCloseTo(10, 1);
      expect(bb.height).toBeCloseTo(10, 1);
    }
  });

  it('cut of identical shapes returns null', () => {
    const r = drawRectangle(10, 10);
    const result = cutBlueprints(r.blueprint, r.blueprint);
    expect(result).toBeNull();
  });

  it('fuse of fully contained shape returns outer', () => {
    const outer = drawRectangle(10, 10);
    const inner = drawRectangle(4, 4);
    const result = fuseBlueprints(outer.blueprint, inner.blueprint);
    expect(result).toBeInstanceOf(Blueprint);
    if (result instanceof Blueprint) {
      const bb = result.boundingBox;
      expect(bb.width).toBeCloseTo(10, 1);
      expect(bb.height).toBeCloseTo(10, 1);
    }
  });

  it('cut of fully contained shape creates compound', () => {
    const outer = drawRectangle(10, 10);
    const inner = drawRectangle(4, 4);
    const result = cutBlueprints(outer.blueprint, inner.blueprint);
    expect(result).not.toBeNull();
  });
});

describe.skipIf(shouldSkipSuite('boolean2dRegression.arcCrossings'))(
  'arcs crossing lines and arcs',
  () => {
    function areaOf(d: Drawing): number {
      const sketch = d.sketchOnPlane('XY');
      if (!(sketch instanceof Sketch)) throw new Error('expected a single outline');
      try {
        using face = sketch.face();
        return unwrap(measureArea(face));
      } finally {
        sketch.delete();
      }
    }

    // Area of the part of a radius-r circle beyond a chord at distance d from its center.
    function circularSegment(r: number, d: number): number {
      return r * r * Math.acos(d / r) - d * Math.sqrt(r * r - d * d);
    }

    const rectArea = 50 * 30;
    const circleArea = Math.PI * 8 * 8;

    it('cuts a circle centered on the outline', () => {
      const result = drawRectangle(50, 30).cut(drawCircle(8).translate(25, 0));
      expect(areaOf(result)).toBeCloseTo(rectArea - circleArea / 2, 3);
    });

    it('fuses a circle centered on the outline', () => {
      const result = drawRectangle(50, 30).fuse(drawCircle(8).translate(25, 0));
      expect(areaOf(result)).toBeCloseTo(rectArea + circleArea / 2, 3);
    });

    it('cuts and fuses a circle centered inside that crosses one edge', () => {
      const outside = circularSegment(8, 5);
      const tool = drawCircle(8).translate(20, 0);
      expect(areaOf(drawRectangle(50, 30).cut(tool))).toBeCloseTo(
        rectArea - (circleArea - outside),
        3
      );
      expect(areaOf(drawRectangle(50, 30).fuse(tool))).toBeCloseTo(rectArea + outside, 3);
      expect(areaOf(drawRectangle(50, 30).intersect(tool))).toBeCloseTo(circleArea - outside, 3);
    });

    it('cuts a circle crossing an edge off-center', () => {
      const result = drawRectangle(50, 30).cut(drawCircle(8).translate(3, 15));
      expect(areaOf(result)).toBeCloseTo(rectArea - circleArea / 2, 3);
    });

    it('combines two crossing circles', () => {
      const r = 5;
      const lens = 2 * circularSegment(r, 3);
      const a = drawCircle(r);
      const b = drawCircle(r).translate(6, 0);
      const disk = Math.PI * r * r;
      expect(areaOf(a.fuse(b))).toBeCloseTo(2 * disk - lens, 3);
      expect(areaOf(a.cut(b))).toBeCloseTo(disk - lens, 3);
      expect(areaOf(a.intersect(b))).toBeCloseTo(lens, 3);
    });
  }
);

describe('chained booleans across already-split edges', () => {
  const rectArea = 50 * 30;

  it('cuts a second half disc from an edge split by the first', () => {
    const result = drawRectangle(50, 30)
      .cut(drawCircle(2).translate(25, 6))
      .cut(drawCircle(2).translate(25, -6));
    expect(totalArea(result)).toBeCloseTo(rectArea - 4 * Math.PI, 3);
  });

  it('cuts two notches from the same edge', () => {
    const result = drawRectangle(50, 30)
      .cut(drawRectangle(4, 4).translate(-10, -15))
      .cut(drawRectangle(4, 4).translate(10, -15));
    expect(totalArea(result)).toBeCloseTo(rectArea - 16, 3);
  });

  it.skipIf(shouldSkipSuite('boolean2dRegression.arcCrossings'))(
    'fuses a circle onto an edge split by an earlier notch',
    () => {
      const result = drawRectangle(50, 30)
        .cut(drawRectangle(4, 4).translate(-10, -15))
        .fuse(drawCircle(3).translate(10, -15));
      expect(totalArea(result)).toBeCloseTo(rectArea - 8 + (9 * Math.PI) / 2, 3);
    }
  );

  it.skipIf(shouldSkipSuite('boolean2dRegression.arcCrossings'))(
    'cuts a circle across a full-width slot',
    () => {
      const result = drawRectangle(50, 30).cut(drawRectangle(60, 4)).cut(drawCircle(8));
      // The circle only removes what lies outside the slot (|y| > 2).
      const inSlot = 2 * (2 * Math.sqrt(60) + 64 * Math.asin(0.25));
      expect(totalArea(result)).toBeCloseTo(rectArea - 50 * 4 - (64 * Math.PI - inSlot), 3);
    }
  );

  it('offsets a rectangle inward', () => {
    expect(totalArea(drawRectangle(40, 20).offset(-2))).toBeCloseTo(36 * 16, 6);
  });
});

describe('outlines sharing an exact edge', () => {
  it('fuses two squares that share a whole edge', () => {
    const result = drawRectangle(10, 10).fuse(drawRectangle(10, 10).translate(10, 0));
    expect(totalArea(result)).toBeCloseTo(200, 3);
  });

  it('cuts a notch that shares part of an edge', () => {
    const result = drawRectangle(10, 10).cut(drawRectangle(4, 2).translate(0, 4));
    expect(totalArea(result)).toBeCloseTo(92, 3);
  });
});

describe('outlines nested without crossing', () => {
  const rectArea = 50 * 30;
  const holed = () => drawRectangle(50, 30).cut(drawCircle(8));

  it('fuses separate outlines into one that contains them all', () => {
    const result = drawCircle(2).fuse(drawCircle(2).translate(10, 0)).fuse(drawRectangle(50, 50));
    expect(totalArea(result)).toBeCloseTo(2500, 3);
  });

  it('fills a hole with an outline that covers it', () => {
    expect(totalArea(holed().fuse(drawCircle(9)))).toBeCloseTo(rectArea, 3);
  });

  it('cuts an outline that sits inside an existing hole', () => {
    expect(totalArea(holed().cut(drawCircle(3)))).toBeCloseTo(rectArea - 64 * Math.PI, 3);
  });

  it('cuts away a holed outline with a tool that covers it', () => {
    expect(totalArea(holed().cut(drawRectangle(100, 100)))).toBe(0);
  });
});

describe('arcs that coincide along part of their length', () => {
  const disk = 25 * Math.PI;

  it('combines a circle with an identical copy', () => {
    expect(totalArea(drawCircle(5).fuse(drawCircle(5)))).toBeCloseTo(disk, 3);
    expect(totalArea(drawCircle(5).intersect(drawCircle(5)))).toBeCloseTo(disk, 3);
    expect(totalArea(drawCircle(5).cut(drawCircle(5)))).toBe(0);
  });

  it('combines a circle with a copy split at different points', () => {
    // drawCircle splits at (+-5, 0); this copy splits at (0, +-5).
    const resplit = draw([0, -5]).sagittaArc(0, 10, 5).sagittaArc(0, -10, 5).close();
    expect(totalArea(drawCircle(5).fuse(resplit))).toBeCloseTo(disk, 3);
    expect(totalArea(drawCircle(5).cut(resplit))).toBe(0);
  });

  it('cuts a circle that coincides with a rounded end', () => {
    const result = drawRoundedRectangle(20, 10, 5).cut(drawCircle(5).translate(-5, 0));
    expect(totalArea(result)).toBeCloseTo(100, 3);
  });

  it.each([0.0005, 1e-7])(
    'keeps large concentric circles apart when their radii differ by %s',
    (delta) => {
      const inner = drawCircle(1_000_000).blueprint;
      const outer = drawCircle(1_000_000 + delta).blueprint;
      for (const a of inner.curves) {
        for (const b of outer.curves) {
          const { intersections, commonSegments } = unwrap(intersectCurves(a, b, 1e-9));
          expect(commonSegments).toHaveLength(0);
          expect(intersections).toHaveLength(0);
        }
      }
    }
  );

  it.skipIf(currentKernel !== 'occt-wasm').each([5e-11, 5e-13])(
    'keeps a %s radian gap of a nearly full arc out of its overlap with a circle',
    (gap) => {
      const radius = 1_000_000;
      const circle = new Curve2D(makeCircle2d(0, 0, radius, true));
      const arc = new Curve2D({
        __bk2d: 'trimmed',
        basis: makeCircle2d(0, 0, radius, true),
        tStart: 0,
        tEnd: 2 * Math.PI - gap,
      });
      const { commonSegments } = unwrap(intersectCurves(circle, arc, 1e-9));
      expect(commonSegments).toHaveLength(1);
      const [x0, y0] = (commonSegments[0] as Curve2D).firstPoint;
      const [x1, y1] = (commonSegments[0] as Curve2D).lastPoint;
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(radius * gap, 7);
    }
  );
});

describe('outlines that touch without crossing', () => {
  const square = () => drawRectangle(10, 10);
  const inscribed = () => drawCircle(5);
  const disk = 25 * Math.PI;

  it('combines a square with its inscribed circle', () => {
    expect(totalArea(square().cut(inscribed()))).toBeCloseTo(100 - disk, 3);
    expect(totalArea(square().fuse(inscribed()))).toBeCloseTo(100, 3);
    expect(totalArea(square().intersect(inscribed()))).toBeCloseTo(disk, 3);
    expect(totalArea(inscribed().cut(square()))).toBe(0);
  });

  it('keeps outlines that touch at a single point apart', () => {
    const result = square().fuse(drawCircle(5).translate(10, 0));
    expect(totalArea(result)).toBeCloseTo(100 + disk, 3);
  });
});
