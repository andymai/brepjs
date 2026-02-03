import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeDirection,
  isPoint,
  makePlane,
  findCurveType,
  unwrap,
  isOk,
  isErr,
  makeBox,
  getOC,
  type PlaneName,
  fnCreateNamedPlane,
} from '../src/index.js';
// Functional plane API
import { createNamedPlane, resolvePlane } from '../src/core/planeOps.js';
// OCCT boundary functions
import { toOcPnt } from '../src/core/occtBoundary.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('isPoint', () => {
  it('returns true for a 3-element array', () => {
    expect(isPoint([1, 2, 3])).toBe(true);
  });
  it('returns true for a 2-element array', () => {
    expect(isPoint([1, 2])).toBe(true);
  });
  it('returns true for an OCCT duck-typed object with XYZ', () => {
    const pnt = toOcPnt([1, 2, 3]);
    expect(isPoint(pnt)).toBe(true);
    pnt.delete();
  });
  it('returns false for a number', () => {
    expect(isPoint(42)).toBe(false);
  });
  it('returns false for a string', () => {
    expect(isPoint('hello')).toBe(false);
  });
  it('returns false for null', () => {
    expect(isPoint(null)).toBe(false);
  });
  it('returns false for undefined', () => {
    expect(isPoint(undefined)).toBe(false);
  });
  it('returns false for a 1-element array', () => {
    expect(isPoint([1])).toBe(false);
  });
  it('returns false for a 4-element array', () => {
    expect(isPoint([1, 2, 3, 4])).toBe(false);
  });
  it('returns false for an empty array', () => {
    expect(isPoint([])).toBe(false);
  });
  it('returns false for a plain object without XYZ', () => {
    expect(isPoint({ x: 1, y: 2 })).toBe(false);
  });
});

describe('makeDirection', () => {
  it('returns [1,0,0] for X', () => {
    expect(makeDirection('X')).toEqual([1, 0, 0]);
  });
  it('returns [0,1,0] for Y', () => {
    expect(makeDirection('Y')).toEqual([0, 1, 0]);
  });
  it('returns [0,0,1] for Z', () => {
    expect(makeDirection('Z')).toEqual([0, 0, 1]);
  });
  it('passes through a Point value unchanged', () => {
    const pt: [number, number, number] = [3, 4, 5];
    expect(makeDirection(pt)).toBe(pt);
  });
});

// Vector class is deprecated - these tests are skipped
describe.skip('Vector (deprecated)', () => {
  it('constructs from a 3-element array', () => {
    const v = new Vector([1, 2, 3]);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(2);
    expect(v.z).toBeCloseTo(3);
    v.delete();
  });
  it('constructs from a 2-element array (z defaults to 0)', () => {
    const v = new Vector([5, 7]);
    expect(v.x).toBeCloseTo(5);
    expect(v.y).toBeCloseTo(7);
    expect(v.z).toBeCloseTo(0);
    v.delete();
  });
  it('constructs from another Vector', () => {
    const a = new Vector([1, 2, 3]);
    const b = new Vector(a);
    expect(b.x).toBeCloseTo(1);
    expect(b.y).toBeCloseTo(2);
    expect(b.z).toBeCloseTo(3);
    a.delete();
    b.delete();
  });
  it('constructs with default [0,0,0]', () => {
    const v = new Vector();
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(0);
    v.delete();
  });
  it('constructs from an OCCT point-like object', () => {
    const pnt = asPnt([4, 5, 6]);
    const v = new Vector(pnt);
    expect(v.x).toBeCloseTo(4);
    expect(v.y).toBeCloseTo(5);
    expect(v.z).toBeCloseTo(6);
    pnt.delete();
    v.delete();
  });
  it('repr returns a formatted string', () => {
    const v = new Vector([1.1234, 2.5678, 3.9999]);
    expect(v.repr).toContain('x:');
    expect(v.repr).toContain('y:');
    expect(v.repr).toContain('z:');
    v.delete();
  });
  it('Length returns the magnitude', () => {
    const v = new Vector([3, 4, 0]);
    expect(v.Length).toBeCloseTo(5);
    v.delete();
  });
  it('toTuple returns [x, y, z]', () => {
    const v = new Vector([1, 2, 3]);
    const t = v.toTuple();
    expect(t).toHaveLength(3);
    expect(t[0]).toBeCloseTo(1);
    expect(t[1]).toBeCloseTo(2);
    expect(t[2]).toBeCloseTo(3);
    v.delete();
  });
  it('cross computes the cross product', () => {
    const a = new Vector([1, 0, 0]);
    const b = new Vector([0, 1, 0]);
    const c = a.cross(b);
    expect(c.z).toBeCloseTo(1);
    a.delete();
    b.delete();
    c.delete();
  });
  it('dot computes the dot product', () => {
    const a = new Vector([1, 2, 3]);
    const b = new Vector([4, 5, 6]);
    expect(a.dot(b)).toBeCloseTo(32);
    a.delete();
    b.delete();
  });
  it('sub subtracts vectors', () => {
    const a = new Vector([5, 7, 9]);
    const b = new Vector([1, 2, 3]);
    const c = a.sub(b);
    expect(c.x).toBeCloseTo(4);
    expect(c.y).toBeCloseTo(5);
    expect(c.z).toBeCloseTo(6);
    a.delete();
    b.delete();
    c.delete();
  });
  it('add adds vectors', () => {
    const a = new Vector([1, 2, 3]);
    const b = new Vector([4, 5, 6]);
    const c = a.add(b);
    expect(c.x).toBeCloseTo(5);
    expect(c.y).toBeCloseTo(7);
    expect(c.z).toBeCloseTo(9);
    a.delete();
    b.delete();
    c.delete();
  });
  it('multiply scales a vector', () => {
    const v = new Vector([1, 2, 3]);
    const s = v.multiply(3);
    expect(s.x).toBeCloseTo(3);
    expect(s.y).toBeCloseTo(6);
    expect(s.z).toBeCloseTo(9);
    v.delete();
    s.delete();
  });
  it('normalized returns a unit vector', () => {
    const v = new Vector([3, 4, 0]);
    const n = v.normalized();
    expect(n.Length).toBeCloseTo(1);
    v.delete();
    n.delete();
  });
  it('normalize mutates in place', () => {
    const v = new Vector([0, 0, 5]);
    const r = v.normalize();
    expect(r).toBe(v);
    expect(v.Length).toBeCloseTo(1);
    v.delete();
  });
  it('getCenter returns this', () => {
    const v = new Vector([1, 2, 3]);
    expect(v.getCenter()).toBe(v);
    v.delete();
  });
  it('getAngle returns angle in degrees', () => {
    const a = new Vector([1, 0, 0]);
    const b = new Vector([0, 1, 0]);
    expect(a.getAngle(b)).toBeCloseTo(90);
    a.delete();
    b.delete();
  });
  it('equals returns true for equal vectors', () => {
    const a = new Vector([1, 2, 3]);
    const b = new Vector([1, 2, 3]);
    expect(a.equals(b)).toBe(true);
    a.delete();
    b.delete();
  });
  it('equals returns false for different vectors', () => {
    const a = new Vector([1, 2, 3]);
    const b = new Vector([4, 5, 6]);
    expect(a.equals(b)).toBe(false);
    a.delete();
    b.delete();
  });
  it('toPnt creates an OCCT gp_Pnt', () => {
    const v = new Vector([10, 20, 30]);
    const pnt = v.toPnt();
    expect(pnt.X()).toBeCloseTo(10);
    pnt.delete();
    v.delete();
  });
  it('toDir creates an OCCT gp_Dir', () => {
    const v = new Vector([0, 0, 1]);
    const dir = v.toDir();
    expect(dir.Z()).toBeCloseTo(1);
    dir.delete();
    v.delete();
  });
  it('rotate rotates the vector in place', () => {
    const v = new Vector([1, 0, 0]);
    const r = v.rotate(90, [0, 0, 0], [0, 0, 1]);
    expect(r).toBe(v);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
    v.delete();
  });
  it('rotate uses default center and direction', () => {
    const v = new Vector([1, 0, 0]);
    v.rotate(180);
    expect(v.x).toBeCloseTo(-1);
    v.delete();
  });
  it('projectToPlane projects onto the XY plane', () => {
    const v = new Vector([3, 4, 5]);
    const plane = unwrap(createNamedPlane('XY'));
    const proj = v.projectToPlane(plane);
    expect(proj.x).toBeCloseTo(3);
    expect(proj.y).toBeCloseTo(4);
    expect(proj.z).toBeCloseTo(0);
    v.delete();
    proj.delete();
    plane.delete();
  });
});

// Deprecated API tests - these APIs are no longer exported from the main index
describe.skip('asPnt (deprecated)', () => {
  it('creates an OCCT point from a 3D tuple', () => {
    const pnt = asPnt([1, 2, 3]);
    expect(pnt.X()).toBeCloseTo(1);
    expect(pnt.Y()).toBeCloseTo(2);
    expect(pnt.Z()).toBeCloseTo(3);
    pnt.delete();
  });
  it('creates an OCCT point from a 2D tuple', () => {
    const pnt = asPnt([5, 10]);
    expect(pnt.X()).toBeCloseTo(5);
    expect(pnt.Y()).toBeCloseTo(10);
    expect(pnt.Z()).toBeCloseTo(0);
    pnt.delete();
  });
});

describe.skip('asDir (deprecated)', () => {
  it('creates an OCCT direction from a tuple', () => {
    const dir = asDir([0, 0, 1]);
    expect(dir.Z()).toBeCloseTo(1);
    dir.delete();
  });
});

describe.skip('makeAx1 (deprecated)', () => {
  it('creates an axis', () => {
    const ax = makeAx1([0, 0, 0], [0, 0, 1]);
    expect(ax).toBeDefined();
    ax.delete();
  });
});

describe.skip('makeAx2 (deprecated)', () => {
  it('creates an axis without xDir', () => {
    const ax = makeAx2([0, 0, 0], [0, 0, 1]);
    expect(ax).toBeDefined();
    ax.delete();
  });
  it('creates an axis with xDir', () => {
    const ax = makeAx2([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    expect(ax).toBeDefined();
    ax.delete();
  });
});

describe.skip('makeAx3 (deprecated)', () => {
  it('creates an axis without xDir', () => {
    const ax = makeAx3([0, 0, 0], [0, 0, 1]);
    expect(ax).toBeDefined();
    ax.delete();
  });
  it('creates an axis with xDir', () => {
    const ax = makeAx3([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    expect(ax).toBeDefined();
    ax.delete();
  });
});

describe.skip('Transformation (deprecated)', () => {
  it('constructs with no arguments', () => {
    const t = new Transformation();
    expect(t).toBeDefined();
    t.delete();
  });
  it('translate with vector', () => {
    const t = new Transformation();
    t.translate([10, 20, 30]);
    const pnt = t.transformPoint([0, 0, 0]);
    expect(pnt.X()).toBeCloseTo(10);
    expect(pnt.Y()).toBeCloseTo(20);
    expect(pnt.Z()).toBeCloseTo(30);
    pnt.delete();
    t.delete();
  });
  it('translate with three numbers', () => {
    const t = new Transformation();
    t.translate(5, 10, 15);
    const pnt = t.transformPoint([0, 0, 0]);
    expect(pnt.X()).toBeCloseTo(5);
    expect(pnt.Y()).toBeCloseTo(10);
    expect(pnt.Z()).toBeCloseTo(15);
    pnt.delete();
    t.delete();
  });
  it('rotate around Z axis', () => {
    const t = new Transformation();
    t.rotate(90, [0, 0, 0], [0, 0, 1]);
    const pnt = t.transformPoint([1, 0, 0]);
    expect(pnt.X()).toBeCloseTo(0);
    expect(pnt.Y()).toBeCloseTo(1);
    pnt.delete();
    t.delete();
  });
  it('rotate uses defaults', () => {
    const t = new Transformation();
    t.rotate(180);
    const pnt = t.transformPoint([1, 0, 0]);
    expect(pnt.X()).toBeCloseTo(-1);
    pnt.delete();
    t.delete();
  });
  it('mirror with string plane YZ', () => {
    const t = new Transformation();
    t.mirror('YZ');
    const pnt = t.transformPoint([5, 0, 0]);
    expect(pnt.X()).toBeCloseTo(-5);
    pnt.delete();
    t.delete();
  });
  it('mirror with string plane XZ', () => {
    const t = new Transformation();
    t.mirror('XZ');
    const pnt = t.transformPoint([0, 5, 0]);
    expect(pnt.Y()).toBeCloseTo(-5);
    pnt.delete();
    t.delete();
  });
  it('mirror with a Plane instance', () => {
    const plane = unwrap(createNamedPlane('YZ'));
    const t = new Transformation();
    t.mirror(plane);
    const pnt = t.transformPoint([3, 0, 0]);
    expect(pnt.X()).toBeCloseTo(-3);
    pnt.delete();
    t.delete();
    plane.delete();
  });
  it('mirror with Plane and custom origin', () => {
    const plane = unwrap(createNamedPlane('YZ'));
    const t = new Transformation();
    t.mirror(plane, [5, 0, 0]);
    const pnt = t.transformPoint([7, 0, 0]);
    expect(pnt.X()).toBeCloseTo(3);
    pnt.delete();
    t.delete();
    plane.delete();
  });
  it('mirror with direction Point', () => {
    const t = new Transformation();
    t.mirror([1, 0, 0]);
    const pnt = t.transformPoint([5, 3, 0]);
    expect(pnt.X()).toBeCloseTo(-5);
    expect(pnt.Y()).toBeCloseTo(3);
    pnt.delete();
    t.delete();
  });
  it('mirror with direction Point and custom origin', () => {
    const t = new Transformation();
    t.mirror([1, 0, 0], [2, 0, 0]);
    const pnt = t.transformPoint([5, 0, 0]);
    expect(pnt.X()).toBeCloseTo(-1);
    pnt.delete();
    t.delete();
  });
  it('mirror with default (no args)', () => {
    const t = new Transformation();
    t.mirror();
    const pnt = t.transformPoint([5, 0, 0]);
    expect(pnt.X()).toBeCloseTo(-5);
    pnt.delete();
    t.delete();
  });
  it('scale from origin', () => {
    const t = new Transformation();
    t.scale([0, 0, 0], 2);
    const pnt = t.transformPoint([3, 4, 5]);
    expect(pnt.X()).toBeCloseTo(6);
    expect(pnt.Y()).toBeCloseTo(8);
    expect(pnt.Z()).toBeCloseTo(10);
    pnt.delete();
    t.delete();
  });
  it('coordSystemChange reference to custom', () => {
    const t = new Transformation();
    t.coordSystemChange('reference', { origin: [10, 0, 0], zDir: [0, 0, 1], xDir: [1, 0, 0] });
    const pnt = t.transformPoint([0, 0, 0]);
    expect(pnt).toBeDefined();
    pnt.delete();
    t.delete();
  });
  it('coordSystemChange custom to reference', () => {
    const t = new Transformation();
    t.coordSystemChange({ origin: [10, 0, 0], zDir: [0, 0, 1], xDir: [1, 0, 0] }, 'reference');
    const pnt = t.transformPoint([0, 0, 0]);
    expect(pnt.X()).toBeCloseTo(10);
    pnt.delete();
    t.delete();
  });
  it('transform applies to a shape', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const t = new Transformation();
    t.translate([50, 0, 0]);
    const moved = t.transform(box.wrapped);
    expect(moved).toBeDefined();
    t.delete();
  });
});

describe.skip('Plane (deprecated)', () => {
  it('constructs with origin and default normal', () => {
    const p = new Plane([0, 0, 0]);
    expect(p.zDir.z).toBeCloseTo(1);
    p.delete();
  });
  it('constructs with explicit xDir and normal', () => {
    const p = new Plane([0, 0, 0], [1, 0, 0], [0, 0, 1]);
    expect(p.xDir.x).toBeCloseTo(1);
    expect(p.zDir.z).toBeCloseTo(1);
    p.delete();
  });
  it('constructs with null xDir (auto-computed)', () => {
    const p = new Plane([0, 0, 0], null, [0, 1, 0]);
    expect(p.zDir.y).toBeCloseTo(1);
    expect(p.xDir.Length).toBeCloseTo(1);
    p.delete();
  });
  it('clone creates an independent copy', () => {
    const p = new Plane([1, 2, 3], [1, 0, 0], [0, 0, 1]);
    const c = p.clone();
    expect(c.origin.x).toBeCloseTo(1);
    p.delete();
    c.delete();
  });
  it('translateTo moves the plane origin', () => {
    const p = new Plane([0, 0, 0]);
    const m = p.translateTo([10, 20, 30]);
    expect(m.origin.x).toBeCloseTo(10);
    p.delete();
    m.delete();
  });
  it('translate with vector', () => {
    const p = new Plane([0, 0, 0]);
    const m = p.translate([5, 10, 15]);
    expect(m.origin.x).toBeCloseTo(5);
    p.delete();
    m.delete();
  });
  it('translate with three numbers', () => {
    const p = new Plane([0, 0, 0]);
    const m = p.translate(1, 2, 3);
    expect(m.origin.x).toBeCloseTo(1);
    expect(m.origin.y).toBeCloseTo(2);
    expect(m.origin.z).toBeCloseTo(3);
    p.delete();
    m.delete();
  });
  it('translateX', () => {
    const p = new Plane([0, 0, 0]);
    const m = p.translateX(7);
    expect(m.origin.x).toBeCloseTo(7);
    p.delete();
    m.delete();
  });
  it('translateY', () => {
    const p = new Plane([0, 0, 0]);
    const m = p.translateY(8);
    expect(m.origin.y).toBeCloseTo(8);
    p.delete();
    m.delete();
  });
  it('translateZ', () => {
    const p = new Plane([0, 0, 0]);
    const m = p.translateZ(9);
    expect(m.origin.z).toBeCloseTo(9);
    p.delete();
    m.delete();
  });
  it('pivot rotates normal and xDir', () => {
    const p = new Plane([0, 0, 0], [1, 0, 0], [0, 0, 1]);
    const pv = p.pivot(90, [1, 0, 0]);
    // [0,0,1] rotated 90 around X -> [0,-1,0]
    expect(pv.zDir.y).toBeCloseTo(-1, 0);
    p.delete();
    pv.delete();
  });
  it('pivot with named direction', () => {
    const p = new Plane([0, 0, 0], [1, 0, 0], [0, 0, 1]);
    const pv = p.pivot(90, 'X');
    expect(pv.zDir.y).toBeCloseTo(-1, 0);
    p.delete();
    pv.delete();
  });
  it('rotate2DAxes rotates xDir around normal', () => {
    const p = new Plane([0, 0, 0], [1, 0, 0], [0, 0, 1]);
    const r = p.rotate2DAxes(90);
    expect(r.xDir.x).toBeCloseTo(0);
    expect(r.xDir.y).toBeCloseTo(1);
    p.delete();
    r.delete();
  });
  it('setOrigin2d sets origin using local 2D coords', () => {
    const p = new Plane([0, 0, 0], [1, 0, 0], [0, 0, 1]);
    p.setOrigin2d(5, 10);
    expect(p.origin.x).toBeCloseTo(5);
    expect(p.origin.y).toBeCloseTo(10);
    p.delete();
  });
  it('toLocalCoords and toWorldCoords are inverse', () => {
    const p = new Plane([10, 20, 30], [1, 0, 0], [0, 0, 1]);
    const world = new Vector([15, 25, 35]);
    const local = p.toLocalCoords(world);
    const back = p.toWorldCoords(local);
    expect(back.x).toBeCloseTo(world.x, 3);
    expect(back.y).toBeCloseTo(world.y, 3);
    expect(back.z).toBeCloseTo(world.z, 3);
    world.delete();
    local.delete();
    back.delete();
    p.delete();
  });
  it('toWorldCoords maps local origin to plane origin', () => {
    const p = new Plane([10, 20, 30]);
    const w = p.toWorldCoords([0, 0, 0]);
    expect(w.x).toBeCloseTo(10);
    expect(w.y).toBeCloseTo(20);
    expect(w.z).toBeCloseTo(30);
    w.delete();
    p.delete();
  });
});

describe.skip('createNamedPlane (deprecated)', () => {
  const planeNames: PlaneName[] = [
    'XY',
    'YZ',
    'ZX',
    'XZ',
    'YX',
    'ZY',
    'front',
    'back',
    'left',
    'right',
    'top',
    'bottom',
  ];
  for (const name of planeNames) {
    it('creates ' + name + ' plane', () => {
      const result = createNamedPlane(name);
      expect(isOk(result)).toBe(true);
      const plane = unwrap(result);
      expect(plane.zDir.Length).toBeCloseTo(1);
      plane.delete();
    });
  }
  it('accepts a numeric origin', () => {
    const result = createNamedPlane('XY', 5);
    expect(isOk(result)).toBe(true);
    const plane = unwrap(result);
    expect(plane.origin.z).toBeCloseTo(5);
    plane.delete();
  });
  it('accepts a Point origin', () => {
    const result = createNamedPlane('XY', [1, 2, 3]);
    expect(isOk(result)).toBe(true);
    const plane = unwrap(result);
    expect(plane.origin.x).toBeCloseTo(1);
    plane.delete();
  });
  it('returns an error for an unknown plane name', () => {
    const result = createNamedPlane('INVALID' as PlaneName);
    expect(isErr(result)).toBe(true);
  });
});

describe.skip('BoundingBox (deprecated)', () => {
  it('constructs an empty bounding box', () => {
    const bb = new BoundingBox();
    expect(bb).toBeDefined();
    bb.delete();
  });
  it('has correct bounds, center, width, height, depth', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const bb = box.boundingBox;
    const [min, max] = bb.bounds;
    expect(min[0]).toBeCloseTo(0, 0);
    expect(max[0]).toBeCloseTo(10, 0);
    expect(bb.width).toBeCloseTo(10, 0);
    expect(bb.height).toBeCloseTo(20, 0);
    expect(bb.depth).toBeCloseTo(30, 0);
    const c = bb.center;
    expect(c[0]).toBeCloseTo(5, 0);
    expect(c[1]).toBeCloseTo(10, 0);
    expect(c[2]).toBeCloseTo(15, 0);
  });
  it('repr returns a formatted string', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(typeof box.boundingBox.repr).toBe('string');
  });
  it('add merges two bounding boxes', () => {
    const bb1 = makeBox([0, 0, 0], [10, 10, 10]).boundingBox;
    const bb2 = makeBox([0, 0, 0], [5, 5, 5]).boundingBox;
    bb1.add(bb2);
    expect(bb1.width).toBeGreaterThanOrEqual(10);
  });
  it('isOut checks overlap', () => {
    const bb1 = makeBox([0, 0, 0], [2, 2, 2]).boundingBox;
    const bb2 = makeBox([0, 0, 0], [2, 2, 2]).boundingBox;
    expect(bb1.isOut(bb2)).toBe(false);
  });
});

describe('makePlane', () => {
  it('creates a plane from a PlaneName', () => {
    const p = makePlane('XY');
    expect(p.zDir[2]).toBeCloseTo(1);
  });
  it('creates a plane with origin', () => {
    const p = makePlane('XY', [1, 2, 3]);
    expect(p.origin[0]).toBeCloseTo(1);
  });
  it('clones a Plane instance', () => {
    const orig = makePlane('XY', [5, 5, 5]);
    const cl = makePlane(orig);
    expect(cl.origin[0]).toBeCloseTo(5);
    expect(cl).not.toBe(orig);
  });
  it('defaults to XY plane', () => {
    const p = makePlane();
    expect(p.zDir[2]).toBeCloseTo(1);
  });
  it('creates a plane with numeric origin', () => {
    const p = makePlane('XY', 5);
    expect(p.origin[2]).toBeCloseTo(5);
  });
});

describe('findCurveType', () => {
  it('returns an error for an unknown type', () => {
    expect(isErr(findCurveType(-9999))).toBe(true);
  });
  it('finds LINE', () => {
    const oc = getOC();
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_Line);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('LINE');
  });
  it('finds CIRCLE', () => {
    const oc = getOC();
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_Circle);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('CIRCLE');
  });
  it('finds BSPLINE_CURVE', () => {
    const oc = getOC();
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_BSplineCurve);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('BSPLINE_CURVE');
  });
  it('finds ELLIPSE', () => {
    const oc = getOC();
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_Ellipse);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('ELLIPSE');
  });
  it('finds BEZIER_CURVE', () => {
    const oc = getOC();
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_BezierCurve);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('BEZIER_CURVE');
  });
});
