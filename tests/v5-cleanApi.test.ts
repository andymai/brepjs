/**
 * v5 Clean API — tests for renamed functions.
 *
 * Exercises the new short names (box, translate, fuse, fillet, etc.)
 * to ensure they delegate correctly to the underlying implementations.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  // Primitives
  box,
  cylinder,
  sphere,
  cone,
  torus,
  ellipsoid,
  line,
  circle,
  ellipse,
  helix,
  threePointArc,
  ellipseArc,
  bezier,
  tangentArc,
  wire,
  face,
  filledFace,
  polygon,
  vertex,
  compound,
  // Transforms
  translate,
  rotate,
  mirror,
  scale,
  clone,
  // Booleans
  fuse,
  cut,
  intersect,
  // Modifiers
  fillet,
  chamfer,
  shell,
  offset,
  thicken,
  // 3D operations
  extrude,
  revolve,
  loft,
  // Utilities
  heal,
  simplify,
  mesh,
  meshEdges,
  describe as describeShape,
  toBREP,
  fromBREP,
  isValid,
  isEmpty,
  // Support
  unwrap,
  isOk,
  measureVolume,
  measureArea,
  getEdges,
  getFaces,
  faceFinder,
  edgeFinder,
  sketchCircle,
} from '../src/index.js';
import type { Face, Edge, Solid, Wire } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('box()', () => {
  it('creates a box with given dimensions', () => {
    const b = box(10, 20, 30);
    expect(measureVolume(b)).toBeCloseTo(6000, 0);
  });

  it('centers a box at origin', () => {
    const b = box(10, 10, 10, { center: true });
    expect(measureVolume(b)).toBeCloseTo(1000, 0);
  });

  it('centers a box at a specific point', () => {
    const b = box(10, 10, 10, { center: [5, 5, 5] });
    expect(measureVolume(b)).toBeCloseTo(1000, 0);
  });
});

describe('cylinder()', () => {
  it('creates a cylinder with radius and height', () => {
    const c = cylinder(5, 10);
    const vol = measureVolume(c);
    expect(vol).toBeCloseTo(Math.PI * 25 * 10, 0);
  });

  it('supports centered option', () => {
    const c = cylinder(5, 10, { centered: true });
    expect(measureVolume(c)).toBeCloseTo(Math.PI * 25 * 10, 0);
  });
});

describe('sphere()', () => {
  it('creates a sphere with given radius', () => {
    const s = sphere(10);
    const vol = measureVolume(s);
    expect(vol).toBeCloseTo((4 / 3) * Math.PI * 1000, 0);
  });

  it('supports at option', () => {
    const s = sphere(5, { at: [10, 0, 0] });
    expect(measureVolume(s)).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
  });
});

describe('cone()', () => {
  it('creates a full cone', () => {
    const c = cone(5, 0, 10);
    const vol = measureVolume(c);
    // Volume of cone = (1/3) * pi * r^2 * h
    expect(vol).toBeCloseTo((1 / 3) * Math.PI * 25 * 10, 0);
  });

  it('creates a frustum', () => {
    const c = cone(5, 3, 10);
    expect(measureVolume(c)).toBeGreaterThan(0);
  });
});

describe('torus()', () => {
  it('creates a torus', () => {
    const t = torus(10, 3);
    expect(measureVolume(t)).toBeGreaterThan(0);
  });
});

describe('ellipsoid()', () => {
  it('creates an ellipsoid', () => {
    const e = ellipsoid(10, 5, 3);
    expect(measureVolume(e)).toBeGreaterThan(0);
  });
});

describe('curve primitives', () => {
  it('line() creates an edge between two points', () => {
    const l = line([0, 0, 0], [10, 0, 0]);
    expect(l).toBeDefined();
  });

  it('circle() creates a circular edge', () => {
    const c = circle(5);
    expect(c).toBeDefined();
  });

  it('ellipse() creates an elliptical edge', () => {
    const result = ellipse(10, 5);
    expect(isOk(result)).toBe(true);
  });

  it('helix() creates a helical wire', () => {
    const h = helix(5, 20, 3);
    expect(h).toBeDefined();
  });

  it('threePointArc() creates an arc through 3 points', () => {
    const arc = threePointArc([0, 0, 0], [5, 5, 0], [10, 0, 0]);
    expect(arc).toBeDefined();
  });

  it('ellipseArc() uses degrees', () => {
    const result = ellipseArc(10, 5, 0, 90);
    expect(isOk(result)).toBe(true);
  });

  it('bezier() creates a Bezier curve', () => {
    const result = bezier([
      [0, 0, 0],
      [5, 10, 0],
      [10, 0, 0],
    ]);
    expect(isOk(result)).toBe(true);
  });

  it('tangentArc() creates a tangent arc', () => {
    const arc = tangentArc([0, 0, 0], [1, 0, 0], [5, 5, 0]);
    expect(arc).toBeDefined();
  });
});

describe('topology constructors', () => {
  it('wire() assembles edges into a wire', () => {
    const e1 = line([0, 0, 0], [10, 0, 0]);
    const e2 = line([10, 0, 0], [10, 10, 0]);
    const w = unwrap(wire([e1, e2]));
    expect(w).toBeDefined();
  });

  it('face() creates a planar face from a closed wire', () => {
    const e1 = line([0, 0, 0], [10, 0, 0]);
    const e2 = line([10, 0, 0], [10, 10, 0]);
    const e3 = line([10, 10, 0], [0, 10, 0]);
    const e4 = line([0, 10, 0], [0, 0, 0]);
    const w = unwrap(wire([e1, e2, e3, e4]));
    const f = unwrap(face(w));
    expect(measureArea(f)).toBeCloseTo(100, 0);
  });

  it('polygon() creates a polygonal face', () => {
    const result = polygon([
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
    ]);
    expect(isOk(result)).toBe(true);
    expect(measureArea(unwrap(result))).toBeCloseTo(100, 0);
  });

  it('vertex() creates a vertex at a point', () => {
    const v = vertex([5, 5, 5]);
    expect(v).toBeDefined();
  });

  it('compound() builds a compound from shapes', () => {
    const b1 = box(5, 5, 5);
    const b2 = box(3, 3, 3);
    const c = compound([b1, b2]);
    expect(c).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

describe('translate()', () => {
  it('moves a shape by a vector', () => {
    const b = box(10, 10, 10);
    const moved = translate(b, [10, 0, 0]);
    expect(measureVolume(moved)).toBeCloseTo(1000, 0);
  });
});

describe('rotate()', () => {
  it('rotates a shape by an angle', () => {
    const b = box(10, 10, 10);
    const rotated = rotate(b, 45);
    expect(measureVolume(rotated)).toBeCloseTo(1000, 0);
  });

  it('supports axis and around options', () => {
    const b = box(10, 10, 10);
    const rotated = rotate(b, 90, { axis: [1, 0, 0], around: [5, 5, 5] });
    expect(measureVolume(rotated)).toBeCloseTo(1000, 0);
  });
});

describe('mirror()', () => {
  it('mirrors a shape through a plane', () => {
    const b = box(10, 10, 10);
    const mirrored = mirror(b);
    expect(measureVolume(mirrored)).toBeCloseTo(1000, 0);
  });

  it('supports normal and origin options', () => {
    const b = box(10, 10, 10);
    const mirrored = mirror(b, { normal: [0, 1, 0], origin: [0, 5, 0] });
    expect(measureVolume(mirrored)).toBeCloseTo(1000, 0);
  });
});

describe('scale()', () => {
  it('scales a shape uniformly', () => {
    const b = box(10, 10, 10);
    const scaled = scale(b, 2);
    expect(measureVolume(scaled)).toBeCloseTo(8000, 0);
  });
});

describe('clone()', () => {
  it('deep copies a shape', () => {
    const b = box(10, 10, 10);
    const cloned = clone(b);
    expect(measureVolume(cloned)).toBeCloseTo(1000, 0);
  });
});

// ---------------------------------------------------------------------------
// Booleans
// ---------------------------------------------------------------------------

describe('fuse()', () => {
  it('fuses two overlapping shapes', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(10, 10, 10), [5, 0, 0]);
    const result = fuse(b1, b2);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });
});

describe('cut()', () => {
  it('subtracts one shape from another', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(5, 10, 10), [5, 0, 0]);
    const result = cut(b1, b2);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('intersect()', () => {
  it('computes intersection of two shapes', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(10, 10, 10), [5, 0, 0]);
    const result = intersect(b1, b2);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

describe('fillet()', () => {
  it('fillets all edges of a shape (2-arg)', () => {
    const b = box(10, 10, 10);
    const result = fillet(b, 1);
    expect(isOk(result)).toBe(true);
    expect(isValid(unwrap(result))).toBe(true);
  });

  it('fillets selected edges (3-arg with FinderFn)', () => {
    const b = box(10, 10, 10);
    const result = fillet(b, (e) => e.inDirection('Z'), 1);
    expect(isOk(result)).toBe(true);
    expect(isValid(unwrap(result))).toBe(true);
  });
});

describe('chamfer()', () => {
  it('chamfers all edges', () => {
    const b = box(10, 10, 10);
    const result = chamfer(b, 1);
    expect(isOk(result)).toBe(true);
    expect(isValid(unwrap(result))).toBe(true);
  });

  it('chamfers with distance-angle mode', () => {
    const b = box(20, 20, 20);
    const result = chamfer(b, (e) => e.inDirection('Z'), { distance: 2, angle: 45 });
    expect(isOk(result)).toBe(true);
  });
});

describe('shell()', () => {
  it('hollows a shape by removing a face', () => {
    const b = box(20, 20, 20);
    const topFaces = faceFinder().inDirection('Z').findAll(b);
    const result = shell(b, topFaces, 2);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeLessThan(8000);
    expect(vol).toBeGreaterThan(0);
  });

  it('accepts FinderFn for faces', () => {
    const b = box(20, 20, 20);
    const result = shell(b, (f) => f.inDirection('Z'), 2);
    expect(isOk(result)).toBe(true);
  });
});

describe('offset()', () => {
  it('offsets a shape outward', () => {
    const b = box(10, 10, 10);
    const result = offset(b, 1);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeGreaterThan(1000);
  });
});

describe('thicken()', () => {
  it('thickens a face into a solid', () => {
    const sketch = sketchCircle(10);
    const f = sketch.face();
    const result = thicken(f, 5);
    expect(isOk(result)).toBe(true);
    // Volume may be negative depending on face orientation; check absolute value
    const vol = Math.abs(measureVolume(unwrap(result)));
    expect(vol).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3D Operations
// ---------------------------------------------------------------------------

describe('extrude()', () => {
  it('extrudes a face with a number (Z direction)', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    const solid = extrude(f, 5);
    expect(measureVolume(solid)).toBeCloseTo(500, 0);
  });

  it('extrudes with a Vec3 direction', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    const solid = extrude(f, [0, 0, 10]);
    expect(measureVolume(solid)).toBeCloseTo(1000, 0);
  });

  it('throws on zero-length vector', () => {
    const f = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    expect(() => extrude(f, 0)).toThrow();
  });
});

describe('revolve()', () => {
  it('revolves a face into a solid of revolution', () => {
    const f = unwrap(
      polygon([
        [5, 0, 0],
        [10, 0, 0],
        [10, 0, 5],
        [5, 0, 5],
      ])
    );
    const result = revolve(f, { axis: [0, 0, 1] });
    expect(isOk(result)).toBe(true);
  });
});

describe('loft()', () => {
  it('lofts through wire profiles', () => {
    const w1 = unwrap(wire([circle(5, { at: [0, 0, 0] })]));
    const w2 = unwrap(wire([circle(3, { at: [0, 0, 10] })]));
    const result = loft([w1, w2]);
    expect(isOk(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

describe('heal()', () => {
  it('heals a shape', () => {
    const b = box(10, 10, 10);
    const result = heal(b);
    expect(isOk(result)).toBe(true);
  });
});

describe('simplify()', () => {
  it('simplifies a shape', () => {
    const b = box(10, 10, 10);
    const simplified = simplify(b);
    expect(simplified).toBeDefined();
  });
});

describe('mesh()', () => {
  it('meshes a shape for rendering', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    expect(m.vertices.length).toBeGreaterThan(0);
    expect(m.triangles.length).toBeGreaterThan(0);
  });
});

describe('meshEdges()', () => {
  it('meshes edges for wireframe', () => {
    const b = box(10, 10, 10);
    const m = meshEdges(b);
    expect(m.lines.length).toBeGreaterThan(0);
  });
});

describe('describe()', () => {
  it('returns shape description', () => {
    const b = box(10, 10, 10);
    const desc = describeShape(b);
    expect(desc).toBeDefined();
  });
});

describe('toBREP() / fromBREP()', () => {
  it('round-trips through BREP serialization', () => {
    const b = box(10, 10, 10);
    const brep = toBREP(b);
    expect(brep).toBeTruthy();
    const result = fromBREP(brep);
    expect(isOk(result)).toBe(true);
  });
});

describe('isValid()', () => {
  it('returns true for valid shapes', () => {
    expect(isValid(box(10, 10, 10))).toBe(true);
  });
});

describe('isEmpty()', () => {
  it('returns false for non-empty shapes', () => {
    expect(isEmpty(box(10, 10, 10))).toBe(false);
  });
});
