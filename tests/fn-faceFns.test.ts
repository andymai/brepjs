import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeCylinder,
  sketchRectangle,
  // functional API
  castShape,
  getFaces,
  getSurfaceType,
  faceGeomType,
  faceOrientation,
  flipFaceOrientation,
  uvBounds,
  pointOnSurface,
  uvCoordinates,
  normalAt,
  faceCenter,
  outerWire,
  innerWires,
  unwrap,
  isWire,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function getFirstFace(shape: ReturnType<typeof makeBox>) {
  return getFaces(castShape(shape.wrapped))[0]!;
}

describe('getSurfaceType / faceGeomType', () => {
  it('returns PLANE for box face', () => {
    const face = getFirstFace(makeBox([0, 0, 0], [10, 10, 10]));
    expect(unwrap(getSurfaceType(face))).toBe('PLANE');
    expect(faceGeomType(face)).toBe('PLANE');
  });

  it('returns CYLINDRE for cylinder face', () => {
    const cyl = makeCylinder(5, 10);
    const faces = getFaces(castShape(cyl.wrapped));
    const types = faces.map((f) => faceGeomType(f));
    expect(types).toContain('CYLINDRE');
  });
});

describe('faceOrientation / flipFaceOrientation', () => {
  it('returns forward or backward', () => {
    const face = getFirstFace(makeBox([0, 0, 0], [10, 10, 10]));
    const o = faceOrientation(face);
    expect(['forward', 'backward']).toContain(o);
  });

  it('flips orientation', () => {
    const face = getFirstFace(makeBox([0, 0, 0], [10, 10, 10]));
    const flipped = flipFaceOrientation(face);
    expect(flipped).toBeDefined();
  });
});

describe('uvBounds', () => {
  it('returns valid UV bounds', () => {
    const face = getFirstFace(makeBox([0, 0, 0], [10, 10, 10]));
    const b = uvBounds(face);
    expect(b.uMax).toBeGreaterThan(b.uMin);
    expect(b.vMax).toBeGreaterThan(b.vMin);
  });
});

describe('pointOnSurface', () => {
  it('returns a Vec3 point', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const pt = pointOnSurface(face, 0.5, 0.5);
    expect(pt).toHaveLength(3);
    expect(typeof pt[0]).toBe('number');
  });
});

describe('uvCoordinates', () => {
  it('returns [u, v] pair', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const [u, v] = uvCoordinates(face, [0, 0, 0]);
    expect(typeof u).toBe('number');
    expect(typeof v).toBe('number');
  });
});

describe('normalAt', () => {
  it('returns normal vector', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const n = normalAt(face);
    // Normal of XY plane face should be approx [0,0,±1]
    expect(Math.abs(n[2])).toBeCloseTo(1, 1);
  });
});

describe('faceCenter', () => {
  it('returns center Vec3', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const c = faceCenter(face);
    expect(c).toHaveLength(3);
    expect(c[0]).toBeCloseTo(0, 0);
    expect(c[1]).toBeCloseTo(0, 0);
  });
});

describe('outerWire / innerWires', () => {
  it('returns outer wire of a face', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const wire = outerWire(face);
    expect(isWire(wire)).toBe(true);
  });

  it('returns empty inner wires for simple face', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const inner = innerWires(face);
    expect(inner).toHaveLength(0);
  });
});
