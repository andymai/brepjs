import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeCylinder,
  sketchRectangle,
  // functional API
  castShape,
  getFaces,
  meshShape,
  getSurfaceType,
  faceGeomType,
  faceOrientation,
  flipFaceOrientation,
  uvBounds,
  fnPointOnSurface,
  fnUvCoordinates,
  fnNormalAt,
  faceCenter,
  fnOuterWire,
  fnInnerWires,
  triangulateFace,
  unwrap,
  fnIsWire,
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

describe('fnPointOnSurface', () => {
  it('returns a Vec3 point', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const pt = fnPointOnSurface(face, 0.5, 0.5);
    expect(pt).toHaveLength(3);
    expect(typeof pt[0]).toBe('number');
  });
});

describe('fnUvCoordinates', () => {
  it('returns [u, v] pair', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const [u, v] = fnUvCoordinates(face, [0, 0, 0]);
    expect(typeof u).toBe('number');
    expect(typeof v).toBe('number');
  });
});

describe('fnNormalAt', () => {
  it('returns normal vector', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const n = fnNormalAt(face);
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

describe('fnOuterWire / fnInnerWires', () => {
  it('returns outer wire of a face', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const wire = fnOuterWire(face);
    expect(fnIsWire(wire)).toBe(true);
  });

  it('returns empty inner wires for simple face', () => {
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const inner = fnInnerWires(face);
    expect(inner).toHaveLength(0);
  });
});

describe('triangulateFace', () => {
  it('returns vertices and triangles after meshing', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const boxShape = castShape(box.wrapped);
    // Mesh the shape first so face triangulation is available
    meshShape(boxShape);
    const face = getFaces(boxShape)[0]!;
    const tri = triangulateFace(face);
    expect(tri).not.toBeNull();
    expect(tri!.vertices.length).toBeGreaterThan(0);
    expect(tri!.trianglesIndexes.length).toBeGreaterThan(0);
    expect(tri!.verticesNormals.length).toBeGreaterThan(0);
  });
});
