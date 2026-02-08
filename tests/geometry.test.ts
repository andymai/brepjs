import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  isPoint,
  makePlane,
  findCurveType,
  unwrap as _unwrap,
  isOk,
  isErr as _isErr,
  resolveDirection,
  type PlaneName as _PlaneName,
  createNamedPlane as _createNamedPlane,
  getKernel,
  resolvePlane as _resolvePlane,
} from '../src/index.js';
// OCCT boundary functions (not in barrel)
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

describe('resolveDirection', () => {
  it('returns [1,0,0] for X', () => {
    expect(resolveDirection('X')).toEqual([1, 0, 0]);
  });
  it('returns [0,1,0] for Y', () => {
    expect(resolveDirection('Y')).toEqual([0, 1, 0]);
  });
  it('returns [0,0,1] for Z', () => {
    expect(resolveDirection('Z')).toEqual([0, 0, 1]);
  });
  it('passes through a Vec3 value', () => {
    expect(resolveDirection([3, 4, 5])).toEqual([3, 4, 5]);
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
    const oc = getKernel().oc;
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_Line);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('LINE');
  });
  it('finds CIRCLE', () => {
    const oc = getKernel().oc;
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_Circle);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('CIRCLE');
  });
  it('finds BSPLINE_CURVE', () => {
    const oc = getKernel().oc;
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_BSplineCurve);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('BSPLINE_CURVE');
  });
  it('finds ELLIPSE', () => {
    const oc = getKernel().oc;
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_Ellipse);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('ELLIPSE');
  });
  it('finds BEZIER_CURVE', () => {
    const oc = getKernel().oc;
    const r = findCurveType(oc.GeomAbs_CurveType.GeomAbs_BezierCurve);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBe('BEZIER_CURVE');
  });
});
