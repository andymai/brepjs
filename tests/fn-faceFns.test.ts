import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  cylinder as _cylinder,
  sketchRectangle,
  castShape,
  getFaces as _getFaces,
  getSurfaceType,
  faceGeomType,
  faceOrientation,
  flipFaceOrientation,
  uvBounds,
  pointOnSurface as _pointOnSurface,
  uvCoordinates,
  normalAt as _normalAt,
  faceCenter,
  outerWire,
  innerWires,
  unwrap as _unwrap,
  isWire,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function getFirstFace(shape: ReturnType<typeof box>) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return getFaces(castShape(shape.wrapped))[0]!;
}

describe('getSurfaceType / faceGeomType', () => {
  it('returns PLANE for box face', () => {
    const f = getFirstFace(box(10, 10, 10));
    expect(unwrap(getSurfaceType(f))).toBe('PLANE');
    expect(faceGeomType(f)).toBe('PLANE');
  });

  it('returns CYLINDRE for cylinder face', () => {
    const cyl = cylinder(5, 10);
    const faces = getFaces(castShape(cyl.wrapped));
    const types = faces.map((f) => faceGeomType(f));
    expect(types).toContain('CYLINDRE');
  });
});

describe('faceOrientation / flipFaceOrientation', () => {
  it('returns forward or backward', () => {
    const f = getFirstFace(box(10, 10, 10));
    const o = faceOrientation(f);
    expect(['forward', 'backward']).toContain(o);
  });

  it('flips orientation', () => {
    const f = getFirstFace(box(10, 10, 10));
    const flipped = flipFaceOrientation(f);
    expect(flipped).toBeDefined();
  });
});

describe('uvBounds', () => {
  it('returns valid UV bounds', () => {
    const f = getFirstFace(box(10, 10, 10));
    const b = uvBounds(f);
    expect(b.uMax).toBeGreaterThan(b.uMin);
    expect(b.vMax).toBeGreaterThan(b.vMin);
  });
});

describe('pointOnSurface', () => {
  it('returns a Vec3 point', () => {
    const rect = sketchRectangle(10, 10);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = getFaces(castShape(rect.face().wrapped))[0]!;
    const pt = pointOnSurface(f, 0.5, 0.5);
    expect(pt).toHaveLength(3);
    expect(typeof pt[0]).toBe('number');
  });
});

describe('uvCoordinates', () => {
  it('returns [u, v] pair', () => {
    const rect = sketchRectangle(10, 10);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = getFaces(castShape(rect.face().wrapped))[0]!;
    const [u, v] = uvCoordinates(f, [0, 0, 0]);
    expect(typeof u).toBe('number');
    expect(typeof v).toBe('number');
  });
});

describe('normalAt', () => {
  it('returns normal vector', () => {
    const rect = sketchRectangle(10, 10);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = getFaces(castShape(rect.face().wrapped))[0]!;
    const n = normalAt(f);
    // Normal of XY plane face should be approx [0,0,+/-1]
    expect(Math.abs(n[2])).toBeCloseTo(1, 1);
  });
});

describe('faceCenter', () => {
  it('returns center Vec3', () => {
    const rect = sketchRectangle(10, 10);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = getFaces(castShape(rect.face().wrapped))[0]!;
    const c = faceCenter(f);
    expect(c).toHaveLength(3);
    expect(c[0]).toBeCloseTo(0, 0);
    expect(c[1]).toBeCloseTo(0, 0);
  });
});

describe('outerWire / innerWires', () => {
  it('returns outer wire of a face', () => {
    const rect = sketchRectangle(10, 10);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = getFaces(castShape(rect.face().wrapped))[0]!;
    const w = outerWire(f);
    expect(isWire(w)).toBe(true);
  });

  it('returns empty inner wires for simple face', () => {
    const rect = sketchRectangle(10, 10);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const f = getFaces(castShape(rect.face().wrapped))[0]!;
    const inner = innerWires(f);
    expect(inner).toHaveLength(0);
  });
});
