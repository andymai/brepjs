/* eslint-disable @typescript-eslint/no-non-null-assertion -- test array indexing */
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import type { Blueprint } from '../src/index.js';
import {
  CompoundBlueprint,
  Blueprints,
  draw,
  drawRectangle,
  drawCircle,
  drawPolysides,
  polysidesBlueprint,
  roundedRectangleBlueprint,
  organiseBlueprints,
  fuseBlueprints,
  cutBlueprints,
  intersectBlueprints,
  fuse2D,
  cut2D,
  intersect2D,
  box,
  getFaces,
} from '../src/index.js';
import { fillet2D, chamfer2D } from '../src/2d/blueprints/customCorners.js';
import { offsetBlueprint } from '../src/2d/blueprints/offset.js';
import offset from '../src/2d/blueprints/offset.js';
import { approximateForSVG } from '../src/2d/blueprints/approximations.js';
import {
  blueprintsIntersectionSegments,
  isCommonSegmentMatch,
} from '../src/2d/blueprints/intersectionSegments.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function rect(w = 10, h = 20, cx = 0, cy = 0): Blueprint {
  return drawRectangle(w, h).translate(cx, cy).blueprint;
}

function circ(r = 5, cx = 0, cy = 0): Blueprint {
  return drawCircle(r).translate(cx, cy).blueprint;
}

describe('Blueprint', () => {
  it('basic properties and SVG', () => {
    const bp = rect();
    expect(bp).toBeDefined();
    expect(bp.curves.length).toBeGreaterThan(0);
    expect(bp.isClosed()).toBe(true);
    expect(bp.firstPoint).toHaveLength(2);
    expect(bp.lastPoint).toHaveLength(2);
    expect(typeof bp.repr).toBe('string');
    expect(['clockwise', 'counterClockwise']).toContain(bp.orientation);
    expect(bp.toSVG()).toContain('<svg');
    expect(typeof bp.toSVGViewBox(1)).toBe('string');
    expect(bp.toSVGPaths().length).toBeGreaterThan(0);
    bp.delete();
  });

  it('boundingBox', () => {
    const bp = rect(10, 20);
    const bb = bp.boundingBox;
    expect(bb.width).toBeCloseTo(10, 1);
    expect(bb.height).toBeCloseTo(20, 1);
    bp.delete();
  });

  it('clone', () => {
    const bp = rect();
    const c = bp.clone();
    expect(c).toBeDefined();
    expect(c).not.toBe(bp);
    // clone shares curves, only delete one
    c.delete();
  });

  it('translate', () => {
    const t1 = rect(10, 10).translate(5, 5);
    expect(t1.boundingBox.center[0]).toBeCloseTo(5, 1);
    const t2 = rect(10, 10).translate([3, 4]);
    expect(t2.boundingBox.center[0]).toBeCloseTo(3, 1);
    t1.delete();
    t2.delete();
  });

  it('rotate', () => {
    const r = rect(10, 10).rotate(45);
    expect(r.boundingBox.width).toBeGreaterThan(0);
    r.delete();
  });

  it('scale', () => {
    const s = rect(10, 20).scale(2);
    expect(s.boundingBox.width).toBeCloseTo(20, 0);
    expect(s.boundingBox.height).toBeCloseTo(40, 0);
    s.delete();
  });

  it('mirror', () => {
    const m1 = rect(10, 10).mirror([0, 1], [0, 0], 'plane');
    expect(m1).toBeDefined();
    const m2 = rect(10, 10).mirror([5, 5]);
    expect(m2).toBeDefined();
    m1.delete();
    m2.delete();
  });

  it('stretch', () => {
    const s = rect(10, 10).stretch(2, [1, 0], [0, 0]);
    expect(s.boundingBox.width).toBeGreaterThan(0);
    expect(s.boundingBox.height).toBeGreaterThan(0);
    s.delete();
  });

  it('isInside', () => {
    const bp = rect(10, 10);
    expect(bp.isInside([0, 0])).toBe(true);
    expect(bp.isInside([100, 100])).toBe(false);
    bp.delete();
  });

  it('intersects', () => {
    const a = rect(10, 10);
    const b1 = rect(10, 10, 5, 5);
    const b2 = rect(10, 10, 100, 100);
    expect(a.intersects(b1)).toBe(true);
    expect(a.intersects(b2)).toBe(false);
    a.delete();
    b1.delete();
    b2.delete();
  });
});

describe('BoundingBox2d', () => {
  it('bounds, center, dimensions, repr', () => {
    const bp = rect(10, 20);
    const bb = bp.boundingBox;
    const [min, max] = bb.bounds;
    expect(min[0]).toBeCloseTo(-5, 1);
    expect(max[0]).toBeCloseTo(5, 1);
    expect(min[1]).toBeCloseTo(-10, 1);
    expect(max[1]).toBeCloseTo(10, 1);
    expect(bb.center[0]).toBeCloseTo(0, 1);
    expect(bb.center[1]).toBeCloseTo(0, 1);
    expect(bb.width).toBeCloseTo(10, 1);
    expect(bb.height).toBeCloseTo(20, 1);
    expect(typeof bb.repr).toBe('string');
    bp.delete();
  });

  it('outsidePoint and containsPoint', () => {
    const bp = rect(10, 20);
    const bb = bp.boundingBox;
    expect(bb.containsPoint(bb.outsidePoint())).toBe(false);
    expect(bb.containsPoint([0, 0])).toBe(true);
    expect(bb.containsPoint([100, 100])).toBe(false);
    bp.delete();
  });

  it('isOut and add', () => {
    const bp1 = rect(10, 10);
    const bp2 = rect(10, 10, 100, 100);
    const bp3 = rect(10, 10, 3, 3);
    const bp4 = rect(10, 10, 20, 0);
    expect(bp1.boundingBox.isOut(bp2.boundingBox)).toBe(true);
    expect(bp1.boundingBox.isOut(bp3.boundingBox)).toBe(false);
    bp1.boundingBox.add(bp4.boundingBox);
    expect(bp1.boundingBox.width).toBeGreaterThan(15);
    bp1.delete();
    bp2.delete();
    bp3.delete();
    bp4.delete();
  });
});

describe('Curve2D', () => {
  it('basic properties', () => {
    const bp = rect();
    const curve = bp.curves[0]!;
    expect(curve.firstPoint).toHaveLength(2);
    expect(curve.lastPoint).toHaveLength(2);
    expect(curve.firstParameter).toBeLessThanOrEqual(curve.lastParameter);
    expect(typeof curve.geomType).toBe('string');
    expect(curve.boundingBox).toBeDefined();
    expect(typeof curve.repr).toBe('string');
    expect(curve.value(curve.firstParameter)).toHaveLength(2);
    bp.delete();
  });

  it('clone and reverse', () => {
    const bp = rect();
    const cloned = bp.curves[0]!.clone();
    const fp = cloned.firstPoint;
    const lp = cloned.lastPoint;
    cloned.reverse();
    expect(cloned.firstPoint[0]).toBeCloseTo(lp[0], 5);
    expect(cloned.lastPoint[0]).toBeCloseTo(fp[0], 5);
    bp.delete();
  });

  it('serialize', () => {
    const bp = rect();
    const data = bp.curves[0]!.serialize();
    expect(typeof data).toBe('string');
    expect(data.length).toBeGreaterThan(0);
    bp.delete();
  });

  it('isOnCurve and parameter', () => {
    const bp = rect();
    const curve = bp.curves[0]!;
    expect(curve.isOnCurve(curve.firstPoint)).toBe(true);
    expect(curve.isOnCurve([1000, 1000])).toBe(false);
    const result = curve.parameter(curve.firstPoint);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(curve.firstParameter, 5);
    expect(curve.parameter([1000, 1000]).ok).toBe(false);
    bp.delete();
  });

  it('tangentAt', () => {
    const bp = rect();
    const curve = bp.curves[0]!;
    expect(curve.tangentAt(0.5)).toHaveLength(2);
    const mid = curve.value((curve.firstParameter + curve.lastParameter) / 2);
    expect(curve.tangentAt(mid)).toHaveLength(2);
    bp.delete();
  });

  it('splitAt', () => {
    const bp = rect();
    const curve = bp.curves[0]!;
    const midParam = (curve.firstParameter + curve.lastParameter) / 2;
    expect(curve.splitAt([midParam]).length).toBe(2);
    expect(curve.splitAt([curve.value(midParam)]).length).toBe(2);
    bp.delete();
  });

  it('distanceFrom', () => {
    const bp1 = rect(10, 10);
    const bp2 = rect(10, 10, 100, 100);
    const curve = bp1.curves[0]!;
    expect(curve.distanceFrom([1000, 1000])).toBeGreaterThan(0);
    expect(curve.distanceFrom(curve.firstPoint)).toBeCloseTo(0, 5);
    expect(curve.distanceFrom(bp2.curves[0]!)).toBeGreaterThan(0);
    bp1.delete();
    bp2.delete();
  });
});

describe('cannedBlueprints', () => {
  it('polysidesBlueprint', () => {
    expect(polysidesBlueprint(5, 6).curves.length).toBe(6);
    expect(polysidesBlueprint(5, 3).curves.length).toBe(3);
    expect(polysidesBlueprint(5, 6, 0.5)).toBeDefined();
  });

  it('roundedRectangleBlueprint', () => {
    const bp = roundedRectangleBlueprint(10, 20, 2);
    expect(bp.curves.length).toBe(8);
    expect(bp.boundingBox.width).toBeCloseTo(10, 0);
    expect(bp.boundingBox.height).toBeCloseTo(20, 0);
  });
});

describe('booleanOperations', () => {
  it('fuseBlueprints', () => {
    const result = fuseBlueprints(rect(10, 10), rect(10, 10, 5, 0));
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });
  it('cutBlueprints', () => {
    const result = cutBlueprints(rect(10, 10), rect(10, 10, 5, 0));
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });
  it('intersectBlueprints', () => {
    const result = intersectBlueprints(rect(10, 10), rect(10, 10, 5, 0));
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });
});

describe('fuse2D', () => {
  it('fuses two Blueprints', () => {
    expect(fuse2D(rect(10, 10), rect(10, 10, 5, 0))).toBeDefined();
  });
  it('null handling', () => {
    expect(fuse2D(null, rect(10, 10))).toBeDefined();
    expect(fuse2D(rect(10, 10), null)).toBeDefined();
    expect(fuse2D(null, null)).toBeNull();
  });
  it('non-overlapping', () => {
    expect(fuse2D(rect(10, 10), rect(10, 10, 100, 100))).toBeDefined();
  });
});

describe('cut2D', () => {
  it('cuts overlapping', () => {
    expect(cut2D(rect(20, 20), rect(10, 10, 5, 0))).toBeDefined();
  });
  it('null handling', () => {
    expect(cut2D(null, rect())).toBeNull();
    expect(cut2D(rect(), null)).toBeDefined();
  });
});

describe('intersect2D', () => {
  it('intersects overlapping', () => {
    expect(intersect2D(rect(20, 20), rect(20, 20, 5, 5))).toBeDefined();
  });
  it('null handling', () => {
    expect(intersect2D(null, rect())).toBeNull();
    expect(intersect2D(rect(), null)).toBeNull();
  });
});

describe('CompoundBlueprint', () => {
  it('basic properties and SVG', () => {
    const c = new CompoundBlueprint([rect(30, 30), rect(10, 10)]);
    expect(c.boundingBox.width).toBeCloseTo(30, 0);
    expect(typeof c.repr).toBe('string');
    expect(c.toSVG()).toContain('<svg');
    expect(typeof c.toSVGViewBox(1)).toBe('string');
    expect(Array.isArray(c.toSVGPaths())).toBe(true);
  });

  it('clone', () => {
    const c = new CompoundBlueprint([rect(30, 30), rect(10, 10)]);
    const cloned = c.clone();
    expect(cloned).not.toBe(c);
  });

  it('transforms', () => {
    const c = new CompoundBlueprint([rect(30, 30), rect(10, 10)]);
    expect(c.translate(10, 10).boundingBox.center[0]).toBeCloseTo(10, 0);
    expect(c.rotate(45)).toBeDefined();
    expect(c.scale(2).boundingBox.width).toBeCloseTo(60, 0);
    expect(c.mirror([0, 1], [0, 0], 'plane')).toBeDefined();
    expect(c.stretch(2, [1, 0], [0, 0]).boundingBox.width).toBeGreaterThan(0);
  });
});

describe('Blueprints', () => {
  it('basic properties and SVG', () => {
    const b = new Blueprints([rect(10, 10), rect(10, 10, 30, 0)]);
    expect(b.boundingBox.width).toBeGreaterThan(20);
    expect(typeof b.repr).toBe('string');
    expect(b.toSVG()).toContain('<svg');
    expect(Array.isArray(b.toSVGPaths())).toBe(true);
  });

  it('toSVGViewBox', () => {
    const b = new Blueprints([rect(10, 10), rect(10, 10, 30, 0)]);
    const viewBox = b.toSVGViewBox(1);
    expect(typeof viewBox).toBe('string');
    expect(viewBox).toMatch(/^-?\d+(\.\d+)? -?\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$/);
  });

  it('clone', () => {
    const b = new Blueprints([rect(10, 10), rect(10, 10, 30, 0)]);
    expect(b.clone()).not.toBe(b);
  });

  it('transforms', () => {
    const b = new Blueprints([rect(10, 10), rect(10, 10, 30, 0)]);
    expect(b.translate(10, 0)).toBeDefined();
    expect(b.rotate(45)).toBeDefined();
    expect(b.scale(2)).toBeDefined();
    expect(b.mirror([0, 1], [0, 0], 'plane')).toBeDefined();
    expect(b.stretch(2, [1, 0], [0, 0])).toBeDefined();
  });

  it('sketchOnPlane', () => {
    const b = new Blueprints([rect(10, 10), rect(10, 10, 30, 0)]);
    const sketches = b.sketchOnPlane('XY');
    expect(Array.isArray(sketches)).toBe(true);
    expect(sketches.length).toBe(2);
  });
});

describe('organiseBlueprints', () => {
  it('various configurations', () => {
    expect(organiseBlueprints([rect(10, 10)])).toBeDefined();
    expect(organiseBlueprints([rect(30, 30), rect(10, 10)])).toBeDefined();
    expect(organiseBlueprints([rect(10, 10), rect(10, 10, 100, 100)])).toBeDefined();
  });
});

describe('boolean2D with compound types', () => {
  it('fuse with CompoundBlueprint', () => {
    const compound = new CompoundBlueprint([rect(30, 30), circ(3)]);
    expect(fuse2D(rect(10, 10, 12, 0), compound)).toBeDefined();
    expect(fuse2D(compound, rect(10, 10, 12, 0))).toBeDefined();
  });

  it('fuse with Blueprints', () => {
    const bps = new Blueprints([rect(10, 10, -20, 0), rect(10, 10, 20, 0)]);
    expect(fuse2D(bps, rect(10, 10))).toBeDefined();
  });

  it('cut and intersect with CompoundBlueprint', () => {
    const compound = new CompoundBlueprint([rect(30, 30), circ(3)]);
    expect(cut2D(compound, rect(10, 10, 10, 0))).toBeDefined();
    expect(intersect2D(compound, rect(10, 10))).toBeDefined();
  });
});

describe('Drawing API', () => {
  it('drawRectangle returns a Drawing with blueprint', () => {
    const d = drawRectangle(10, 20);
    expect(d).toBeDefined();
    expect(d.blueprint).toBeDefined();
    expect(d.boundingBox.width).toBeCloseTo(10, 0);
    expect(d.boundingBox.height).toBeCloseTo(20, 0);
  });

  it('drawCircle returns a Drawing', () => {
    expect(drawCircle(5)).toBeDefined();
  });

  it('drawPolysides returns a Drawing', () => {
    expect(drawPolysides(5, 6)).toBeDefined();
  });

  it('draw pen creates closed shape', () => {
    const d = draw().hLine(10).vLine(10).hLine(-10).close();
    expect(d.blueprint).toBeDefined();
  });

  it('Drawing transforms', () => {
    const d = drawRectangle(10, 10);
    expect(d.translate(5, 5)).toBeDefined();
    expect(d.translate([3, 4])).toBeDefined();
    expect(d.rotate(45)).toBeDefined();
    expect(d.scale(2)).toBeDefined();
    expect(d.mirror([0, 1], [0, 0], 'plane')).toBeDefined();
    expect(d.stretch(2, [1, 0], [0, 0])).toBeDefined();
  });

  it('Drawing clone, repr, SVG', () => {
    const d = drawRectangle(10, 10);
    expect(d.clone()).not.toBe(d);
    expect(typeof d.repr).toBe('string');
    expect(d.toSVG()).toContain('<svg');
    expect(typeof d.toSVGViewBox(1)).toBe('string');
    expect(d.toSVGPaths().length).toBeGreaterThan(0);
  });
});

describe('customCorners', () => {
  it('fillet2D rounds corners', () => {
    const bp = rect(10, 10);
    const filleted = fillet2D(bp, 1);
    expect(filleted).toBeDefined();
    // Filleted shape has more curves than original (4 lines -> 4 lines + 4 arcs)
    if (filleted) {
      expect(filleted.curves.length).toBeGreaterThan(bp.curves.length);
    }
  });

  it('chamfer2D cuts corners', () => {
    const bp = rect(10, 10);
    const chamfered = chamfer2D(bp, 1);
    expect(chamfered).toBeDefined();
    // Chamfered shape has more curves than original (4 lines -> 8 lines)
    if (chamfered) {
      expect(chamfered.curves.length).toBeGreaterThan(bp.curves.length);
    }
  });
});

describe('offsetBlueprint', () => {
  it('offsets a rectangle outward', () => {
    const bp = rect(10, 10);
    const offset = offsetBlueprint(bp, 1);
    expect(offset).toBeDefined();
    if (offset) {
      expect(offset.boundingBox.width).toBeGreaterThan(bp.boundingBox.width);
    }
  });

  it('offsets a rectangle inward', () => {
    const bp = rect(10, 10);
    const offset = offsetBlueprint(bp, -1);
    expect(offset).toBeDefined();
    if (offset) {
      expect(offset.boundingBox.width).toBeLessThan(bp.boundingBox.width);
    }
  });
});

describe('Blueprints.sketchOnFace', () => {
  it('sketches blueprints on a box face', () => {
    const b = new Blueprints([rect(5, 5), rect(5, 5, 10, 0)]);
    const solid = box(30, 30, 30);
    const f = getFaces(solid)[0];
    const sketches = b.sketchOnFace(f, 'original');
    expect(Array.isArray(sketches)).toBe(true);
    expect(sketches.length).toBe(2);
  });
});

describe('fuse2D extended', () => {
  it('fuses Blueprints with Blueprints', () => {
    const a = new Blueprints([rect(10, 10, -3, 0)]);
    const b = new Blueprints([rect(10, 10, 3, 0)]);
    const result = fuse2D(a, b);
    expect(result).not.toBeNull();
  });

  it('fuses CompoundBlueprint with CompoundBlueprint', () => {
    const a = new CompoundBlueprint([rect(20, 20), circ(3)]);
    const b = new CompoundBlueprint([rect(20, 20, 10, 0), circ(3, 10, 0)]);
    const result = fuse2D(a, b);
    expect(result).not.toBeNull();
  });

  it('fuses Blueprint with Blueprints', () => {
    const a = rect(10, 10);
    const b = new Blueprints([rect(10, 10, 5, 0)]);
    const result = fuse2D(a, b);
    expect(result).not.toBeNull();
  });

  it('fuses Blueprints with Blueprint', () => {
    const a = new Blueprints([rect(10, 10)]);
    const b = rect(10, 10, 5, 0);
    const result = fuse2D(a, b);
    expect(result).not.toBeNull();
  });
});

describe('cut2D extended', () => {
  it('cuts Blueprints from Blueprint', () => {
    const base = rect(20, 20);
    const tool = new Blueprints([rect(5, 5, 3, 3)]);
    const result = cut2D(base, tool);
    expect(result).not.toBeNull();
  });

  it('cuts Blueprint from Blueprints', () => {
    const base = new Blueprints([rect(20, 20)]);
    const tool = rect(5, 5);
    const result = cut2D(base, tool);
    expect(result).not.toBeNull();
  });

  it('cuts CompoundBlueprint tool from Blueprint', () => {
    const base = rect(30, 30);
    const tool = new CompoundBlueprint([rect(20, 20), circ(3)]);
    const result = cut2D(base, tool);
    expect(result).not.toBeNull();
  });
});

describe('intersect2D extended', () => {
  it('intersects Blueprints with Blueprint', () => {
    const a = new Blueprints([rect(10, 10)]);
    const b = rect(10, 10, 3, 3);
    const result = intersect2D(a, b);
    expect(result).not.toBeNull();
  });

  it('intersects Blueprint with Blueprints', () => {
    const a = rect(10, 10);
    const b = new Blueprints([rect(10, 10, 3, 3)]);
    const result = intersect2D(a, b);
    expect(result).not.toBeNull();
  });

  it('returns null for non-overlapping shapes', () => {
    const a = rect(5, 5);
    const b = rect(5, 5, 100, 100);
    const result = intersect2D(a, b);
    expect(result).toBeNull();
  });
});

describe('isCommonSegmentMatch (reverse-oriented common segments)', () => {
  it('matches forward-oriented common segment', () => {
    const commonSegmentsPoints = [[[0, 0] as [number, number], [10, 0] as [number, number]]];
    expect(isCommonSegmentMatch(commonSegmentsPoints, [0, 0], [10, 0])).toBe(true);
  });

  it('matches reverse-oriented common segment', () => {
    // The segment runs (10,0)→(0,0) but the common segment was detected as (0,0)→(10,0).
    // This exercises the reverse-orientation branch fixed by the copy-paste bug.
    const commonSegmentsPoints = [[[0, 0] as [number, number], [10, 0] as [number, number]]];
    expect(isCommonSegmentMatch(commonSegmentsPoints, [10, 0], [0, 0])).toBe(true);
  });

  it('rejects non-matching segment', () => {
    const commonSegmentsPoints = [[[0, 0] as [number, number], [10, 0] as [number, number]]];
    expect(isCommonSegmentMatch(commonSegmentsPoints, [0, 0], [5, 5])).toBe(false);
  });

  it('edge-adjacent rectangles detect common segments', () => {
    const a = drawRectangle(10, 10).blueprint;
    const b = drawRectangle(10, 10).translate(10, 0).blueprint;

    const segments = blueprintsIntersectionSegments(a, b);
    expect(segments).not.toBeNull();
    const sameCount = segments!.filter(([, second]) => second === 'same').length;
    expect(sameCount).toBeGreaterThan(0);
  });
});

describe('customCorners extended', () => {
  it('fillet2D on null returns null', () => {
    const result = fillet2D(null, 1);
    expect(result).toBeNull();
  });

  it('chamfer2D on null returns null', () => {
    const result = chamfer2D(null, 1);
    expect(result).toBeNull();
  });

  it('fillet2D on CompoundBlueprint', () => {
    const compound = new CompoundBlueprint([rect(30, 30), rect(10, 10)]);
    const result = fillet2D(compound, 1);
    expect(result).toBeInstanceOf(CompoundBlueprint);
  });

  it('chamfer2D on CompoundBlueprint', () => {
    const compound = new CompoundBlueprint([rect(30, 30), rect(10, 10)]);
    const result = chamfer2D(compound, 1);
    expect(result).toBeInstanceOf(CompoundBlueprint);
  });

  it('fillet2D on Blueprints', () => {
    const bps = new Blueprints([rect(10, 10, -10, 0), rect(10, 10, 10, 0)]);
    const result = fillet2D(bps, 1);
    expect(result).toBeInstanceOf(Blueprints);
  });

  it('chamfer2D on Blueprints', () => {
    const bps = new Blueprints([rect(10, 10, -10, 0), rect(10, 10, 10, 0)]);
    const result = chamfer2D(bps, 1);
    expect(result).toBeInstanceOf(Blueprints);
  });
});

describe('offset extended', () => {
  it('offsets Blueprint with lineJoinType bevel', () => {
    const bp = rect(10, 10);
    const result = offsetBlueprint(bp, 2, { lineJoinType: 'bevel' });
    expect(result).not.toBeNull();
  });

  it('offsets Blueprint with lineJoinType miter', () => {
    const bp = rect(10, 10);
    const result = offsetBlueprint(bp, 2, { lineJoinType: 'miter' });
    expect(result).not.toBeNull();
  });

  it('offset default export with null input returns null', () => {
    const result = offset(null, 5);
    expect(result).toBeNull();
  });

  it('offset default export with Blueprints input', () => {
    const bps = new Blueprints([rect(10, 10, -15, 0), rect(10, 10, 15, 0)]);
    const result = offset(bps, 1);
    expect(result).not.toBeNull();
  });

  it('offset default export with CompoundBlueprint input', () => {
    const compound = new CompoundBlueprint([rect(30, 30), circ(3)]);
    const result = offset(compound, 1);
    expect(result).not.toBeNull();
  });
});

describe('approximateForSVG', () => {
  it('approximates blueprint curves for SVG compatibility', () => {
    const bp = circ(5);
    const approximated = approximateForSVG(bp, { precision: 0.1 });
    expect(approximated).toBeDefined();
    expect(approximated.curves.length).toBeGreaterThan(0);
  });

  it('approximates CompoundBlueprint', () => {
    const c = new CompoundBlueprint([rect(30, 30), circ(3)]);
    const approximated = approximateForSVG(c, { precision: 0.1 });
    expect(approximated).toBeDefined();
  });

  it('approximates Blueprints', () => {
    const b = new Blueprints([rect(10, 10), circ(5, 20, 0)]);
    const approximated = approximateForSVG(b, { precision: 0.1 });
    expect(approximated).toBeDefined();
  });
});
