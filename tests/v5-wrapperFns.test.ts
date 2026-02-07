/**
 * v5 shape() wrapper — tests for fluent chaining API.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  shape,
  box,
  cylinder,
  sphere,
  polygon,
  circle,
  line,
  wire,
  translate,
  fuse,
  BrepWrapperError,
  measureVolume,
  unwrap,
  edgeFinder,
  faceFinder,
  isOk,
  sketchCircle,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

// ---------------------------------------------------------------------------
// shape() factory
// ---------------------------------------------------------------------------

describe('shape() factory', () => {
  it('wraps a Solid into Wrapped3D', () => {
    const s = shape(box(10, 10, 10));
    expect(s.val).toBeDefined();
    expect(s.__wrapped).toBe(true);
  });

  it('wraps a Face into WrappedFace', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    const s = shape(f);
    expect(s.val).toBeDefined();
    expect(typeof s.area).toBe('function');
    expect(typeof s.extrude).toBe('function');
  });

  it('wraps an Edge into WrappedCurve', () => {
    const e = line([0, 0, 0], [10, 0, 0]);
    const s = shape(e);
    expect(typeof s.length).toBe('function');
    expect(typeof s.startPoint).toBe('function');
  });

  it('wraps a Wire into WrappedCurve', () => {
    const w = unwrap(wire([line([0, 0, 0], [10, 0, 0]), line([10, 0, 0], [10, 10, 0])]));
    const s = shape(w);
    expect(typeof s.length).toBe('function');
  });

  it('wraps a Sketch into WrappedFace', () => {
    const sketch = sketchCircle(5);
    const s = shape(sketch);
    expect(typeof s.extrude).toBe('function');
    expect(typeof s.area).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Wrapped<T> — base transforms
// ---------------------------------------------------------------------------

describe('Wrapped transforms', () => {
  it('translate() returns a new wrapper', () => {
    const s = shape(box(10, 10, 10)).translate([5, 0, 0]);
    expect(measureVolume(s.val)).toBeCloseTo(1000, 0);
  });

  it('rotate() with default axis', () => {
    const s = shape(box(10, 10, 10)).rotate(45);
    expect(measureVolume(s.val)).toBeCloseTo(1000, 0);
  });

  it('mirror() with default plane', () => {
    const s = shape(box(10, 10, 10)).mirror();
    expect(measureVolume(s.val)).toBeCloseTo(1000, 0);
  });

  it('scale() by factor', () => {
    const s = shape(box(10, 10, 10)).scale(2);
    expect(measureVolume(s.val)).toBeCloseTo(8000, 0);
  });

  it('moveX/Y/Z shortcuts', () => {
    const s = shape(box(10, 10, 10))
      .moveX(5)
      .moveY(3)
      .moveZ(1);
    expect(measureVolume(s.val)).toBeCloseTo(1000, 0);
  });

  it('rotateX/Y/Z shortcuts', () => {
    const s = shape(box(10, 10, 10))
      .rotateX(45)
      .rotateY(30)
      .rotateZ(15);
    expect(measureVolume(s.val)).toBeCloseTo(1000, 0);
  });

  it('clone() deep copies', () => {
    const s = shape(box(10, 10, 10)).clone();
    expect(measureVolume(s.val)).toBeCloseTo(1000, 0);
  });

  it('bounds() returns bounding box', () => {
    const b = shape(box(10, 10, 10)).bounds();
    expect(b.xMax - b.xMin).toBeCloseTo(10, 0);
    expect(b.yMax - b.yMin).toBeCloseTo(10, 0);
    expect(b.zMax - b.zMin).toBeCloseTo(10, 0);
  });

  it('describe() returns shape info', () => {
    const desc = shape(box(10, 10, 10)).describe();
    expect(desc).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Wrapped3D<T> — booleans
// ---------------------------------------------------------------------------

describe('Wrapped3D booleans', () => {
  it('fuse() unions two shapes', () => {
    const s = shape(box(10, 10, 10)).fuse(translate(box(10, 10, 10), [5, 0, 0]));
    expect(measureVolume(s.val)).toBeCloseTo(1500, 0);
  });

  it('cut() subtracts a shape', () => {
    const s = shape(box(10, 10, 10)).cut(translate(box(5, 10, 10), [5, 0, 0]));
    expect(measureVolume(s.val)).toBeCloseTo(500, 0);
  });

  it('intersect() computes overlap', () => {
    const s = shape(box(10, 10, 10)).intersect(translate(box(10, 10, 10), [5, 0, 0]));
    expect(measureVolume(s.val)).toBeCloseTo(500, 0);
  });
});

// ---------------------------------------------------------------------------
// Wrapped3D<T> — modifiers
// ---------------------------------------------------------------------------

describe('Wrapped3D modifiers', () => {
  it('fillet() all edges', () => {
    const s = shape(box(10, 10, 10)).fillet(1);
    expect(measureVolume(s.val)).toBeLessThan(1000);
    expect(measureVolume(s.val)).toBeGreaterThan(0);
  });

  it('fillet() selected edges with FinderFn', () => {
    const s = shape(box(10, 10, 10)).fillet((e) => e.inDirection('Z'), 1);
    expect(measureVolume(s.val)).toBeLessThan(1000);
  });

  it('chamfer() all edges', () => {
    const s = shape(box(10, 10, 10)).chamfer(1);
    expect(measureVolume(s.val)).toBeLessThan(1000);
  });

  it('shell() with FinderFn', () => {
    const s = shape(box(20, 20, 20)).shell((f) => f.inDirection('Z'), 2);
    expect(measureVolume(s.val)).toBeLessThan(8000);
  });

  it('offset() expands a shape', () => {
    const s = shape(box(10, 10, 10)).offset(1);
    expect(measureVolume(s.val)).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Wrapped3D<T> — measurement and queries
// ---------------------------------------------------------------------------

describe('Wrapped3D measurement', () => {
  it('volume() returns solid volume', () => {
    expect(shape(box(10, 10, 10)).volume()).toBeCloseTo(1000, 0);
  });

  it('area() returns surface area', () => {
    expect(shape(box(10, 10, 10)).area()).toBeCloseTo(600, 0);
  });
});

describe('Wrapped3D queries', () => {
  it('edges() returns edge array', () => {
    expect(shape(box(10, 10, 10)).edges().length).toBe(12);
  });

  it('faces() returns face array', () => {
    expect(shape(box(10, 10, 10)).faces().length).toBe(6);
  });

  it('wires() returns wire array', () => {
    expect(shape(box(10, 10, 10)).wires().length).toBeGreaterThan(0);
  });

  it('vertices() returns vertex array', () => {
    expect(shape(box(10, 10, 10)).vertices().length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Wrapped3D<T> — chaining
// ---------------------------------------------------------------------------

describe('Wrapped3D chaining', () => {
  it('chains multiple operations', () => {
    const bracket = shape(box(30, 20, 10))
      .fillet(1)
      .moveZ(5);

    const vol = measureVolume(bracket.val);
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(6000);
  });

  it('cut + fillet chain', () => {
    const s = shape(box(20, 20, 10))
      .cut(translate(cylinder(3, 15), [10, 10, -1]))
      .fillet((e) => e.inDirection('Z'), 1);
    expect(measureVolume(s.val)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Wrapped3D<T> — escape hatches
// ---------------------------------------------------------------------------

describe('escape hatches', () => {
  it('apply() transforms with a function', () => {
    const s = shape(box(10, 10, 10)).apply((s) => translate(s, [10, 0, 0]));
    expect(measureVolume(s.val)).toBeCloseTo(1000, 0);
  });

  it('applyResult() handles Result-returning functions', () => {
    const s = shape(box(10, 10, 10)).applyResult((s) =>
      fuse(s, translate(box(10, 10, 10), [5, 0, 0]))
    );
    expect(measureVolume(s.val)).toBeCloseTo(1500, 0);
  });
});

// ---------------------------------------------------------------------------
// WrappedFace — face-specific
// ---------------------------------------------------------------------------

describe('WrappedFace', () => {
  it('extrude() creates a Wrapped3D<Solid>', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    const s = shape(f).extrude(5);
    expect(measureVolume(s.val)).toBeCloseTo(500, 0);
  });

  it('extrude() with number shorthand for Z', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    const s = shape(f).extrude(10);
    expect(measureVolume(s.val)).toBeCloseTo(1000, 0);
  });

  it('area() returns face area', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    expect(shape(f).area()).toBeCloseTo(100, 0);
  });

  it('center() returns face center', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    const center = shape(f).center();
    expect(center[0]).toBeCloseTo(5, 0);
    expect(center[1]).toBeCloseTo(5, 0);
    expect(center[2]).toBeCloseTo(0, 0);
  });

  it('outerWire() returns the outer wire', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    expect(shape(f).outerWire()).toBeDefined();
  });

  it('Sketch → WrappedFace → extrude', () => {
    const sketch = sketchCircle(5);
    const solid = shape(sketch).extrude(10);
    expect(measureVolume(solid.val)).toBeCloseTo(Math.PI * 25 * 10, 0);
  });
});

// ---------------------------------------------------------------------------
// Shapeable interop
// ---------------------------------------------------------------------------

describe('Shapeable interop', () => {
  it('functional API accepts wrapped shapes', () => {
    const wrapped = shape(box(10, 10, 10));
    // fuse() accepts Shapeable<T> which includes Wrapped<T>
    const result = fuse(wrapped, translate(box(10, 10, 10), [5, 0, 0]));
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });

  it('wrapper methods accept both raw and wrapped shapes', () => {
    const base = shape(box(10, 10, 10));
    const tool = shape(translate(cylinder(3, 15), [5, 5, -1]));
    // Pass wrapper to .cut()
    const result = base.cut(tool);
    expect(measureVolume(result.val)).toBeLessThan(1000);
  });
});
