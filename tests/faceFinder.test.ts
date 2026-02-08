import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, cylinder, sphere, unwrap, isErr, faceFinder, normalAt } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('FaceFinder extra coverage', () => {
  it('ofSurfaceType CYLINDRE', () => {
    expect(faceFinder().ofSurfaceType('CYLINDRE').findAll(cylinder(5, 20)).length).toBe(1);
  });
  it('ofSurfaceType PLANE on cylinder', () => {
    expect(faceFinder().ofSurfaceType('PLANE').findAll(cylinder(5, 20)).length).toBe(2);
  });
  it('ofSurfaceType SPHERE', () => {
    expect(faceFinder().ofSurfaceType('SPHERE').findAll(sphere(10)).length).toBe(1);
  });
  it('ofSurfaceType no match', () => {
    expect(faceFinder().ofSurfaceType('PLANE').findAll(sphere(10)).length).toBe(0);
  });
  it('parallelTo Z (faces with Z-normal)', () => {
    expect(
      faceFinder()
        .parallelTo('Z')
        .findAll(box(10, 20, 30)).length
    ).toBe(2);
  });
  it('parallelTo X', () => {
    expect(
      faceFinder()
        .parallelTo('X')
        .findAll(box(10, 20, 30)).length
    ).toBe(2);
  });
  it('parallelTo Y', () => {
    expect(
      faceFinder()
        .parallelTo('Y')
        .findAll(box(10, 20, 30)).length
    ).toBe(2);
  });
  it('atDistance', () => {
    const b = box(10, 10, 10);
    const faces = faceFinder().atDistance(0, [0, 0, 0]).findAll(b);
    // 3 faces pass through origin (XY, XZ, YZ planes)
    expect(faces.length).toBe(3);
  });
  it('not negation', () => {
    expect(
      faceFinder()
        .not((f) => f.when((face) => Math.abs(normalAt(face)[2]) > 0.9))
        .findAll(box(10, 20, 30)).length
    ).toBe(4);
  });
  it('either or', () => {
    const finder = faceFinder().either([
      (f) => f.when((face) => Math.abs(normalAt(face)[0]) > 0.9),
      (f) => f.when((face) => Math.abs(normalAt(face)[1]) > 0.9),
    ]);
    expect(finder.findAll(box(10, 20, 30)).length).toBe(4);
  });
  it('findUnique single', () => {
    const r = faceFinder()
      .parallelTo('Z')
      .atDistance(30, [0, 0, 0])
      .findUnique(box(10, 20, 30));
    expect(unwrap(r)).toBeDefined();
  });
  it('findUnique errors multiple', () => {
    const r = faceFinder()
      .ofSurfaceType('PLANE')
      .findUnique(box(10, 10, 10));
    expect(isErr(r)).toBe(true);
  });
  it('findUnique errors zero', () => {
    const r = faceFinder()
      .ofSurfaceType('SPHERE')
      .findUnique(box(10, 10, 10));
    expect(isErr(r)).toBe(true);
  });
  it('ofArea finds faces with specific area', () => {
    const b = box(10, 20, 30);
    // 10x20 faces (area=200): 2 faces
    expect(faceFinder().ofArea(200).findAll(b).length).toBe(2);
    // 10x30 faces (area=300): 2 faces
    expect(faceFinder().ofArea(300).findAll(b).length).toBe(2);
    // 20x30 faces (area=600): 2 faces
    expect(faceFinder().ofArea(600).findAll(b).length).toBe(2);
  });
  it('ofArea returns empty for no match', () => {
    expect(
      faceFinder()
        .ofArea(999)
        .findAll(box(10, 10, 10)).length
    ).toBe(0);
  });
});
