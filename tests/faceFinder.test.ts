import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, makeCylinder, makeSphere, FaceFinder, Plane, unwrap, isErr } from '../src/index.js';

beforeAll(async () => { await initOC(); }, 30000);

describe('FaceFinder extra coverage', () => {
  it('ofSurfaceType CYLINDRE', () => {
    expect(new FaceFinder().ofSurfaceType('CYLINDRE').find(makeCylinder(5, 20)).length).toBe(1);
  });
  it('ofSurfaceType PLANE on cylinder', () => {
    expect(new FaceFinder().ofSurfaceType('PLANE').find(makeCylinder(5, 20)).length).toBe(2);
  });
  it('ofSurfaceType SPHERE', () => {
    expect(new FaceFinder().ofSurfaceType('SPHERE').find(makeSphere(10)).length).toBe(1);
  });
  it('ofSurfaceType no match', () => {
    expect(new FaceFinder().ofSurfaceType('PLANE').find(makeSphere(10)).length).toBe(0);
  });
  it('parallelTo XY', () => {
    expect(new FaceFinder().parallelTo('XY').find(makeBox([10, 20, 30])).length).toBe(2);
  });
  it('parallelTo XZ', () => {
    expect(new FaceFinder().parallelTo('XZ').find(makeBox([10, 20, 30])).length).toBe(2);
  });
  it('parallelTo YZ', () => {
    expect(new FaceFinder().parallelTo('YZ').find(makeBox([10, 20, 30])).length).toBe(2);
  });
  it('parallelTo Plane object', () => {
    const plane = new Plane([0,0,0], null, [0,0,1]);
    expect(new FaceFinder().parallelTo(plane).find(makeBox([10,20,30])).length).toBe(2);
  });
  it('parallelTo a face', () => {
    const box = makeBox([10, 20, 30]);
    const ref = new FaceFinder().atAngleWith('Z').find(box)[0]!;
    expect(new FaceFinder().parallelTo(ref).find(box).length).toBe(2);
  });
  it('inPlane XY origin', () => {
    expect(new FaceFinder().inPlane('XY').find(makeBox([10, 20, 30])).length).toBe(1);
  });
  it('inPlane XY at 30', () => {
    expect(new FaceFinder().inPlane('XY', 30).find(makeBox([10, 20, 30])).length).toBe(1);
  });
  it('inPlane XZ', () => {
    expect(new FaceFinder().inPlane('XZ').find(makeBox([10, 20, 30])).length).toBe(1);
  });
  it('inPlane YZ', () => {
    expect(new FaceFinder().inPlane('YZ').find(makeBox([10, 20, 30])).length).toBe(1);
  });
  it('inPlane Plane object', () => {
    const plane = new Plane([0,0,30], null, [0,0,1]);
    expect(new FaceFinder().inPlane(plane).find(makeBox([10,20,30])).length).toBe(1);
  });
  it('containsPoint corner', () => {
    expect(new FaceFinder().containsPoint([0,0,0]).find(makeBox([10,20,30])).length).toBe(3);
  });
  it('containsPoint single face', () => {
    expect(new FaceFinder().containsPoint([5,10,30]).find(makeBox([10,20,30])).length).toBe(1);
  });
  it('not negation', () => {
    expect(new FaceFinder().not((f) => f.atAngleWith('Z')).find(makeBox([10,20,30])).length).toBe(4);
  });
  it('either or', () => {
    const finder = new FaceFinder().either([(f) => f.atAngleWith('X'), (f) => f.atAngleWith('Y')]);
    expect(finder.find(makeBox([10, 20, 30])).length).toBe(4);
  });
  it('unique single', () => {
    const r = new FaceFinder().inPlane('XY', 30).find(makeBox([10,20,30]), { unique: true });
    expect(unwrap(r)).toBeDefined();
  });
  it('unique errors multiple', () => {
    const r = new FaceFinder().ofSurfaceType('PLANE').find(makeBox([10,10,10]), { unique: true });
    expect(isErr(r)).toBe(true);
  });
  it('unique errors zero', () => {
    const r = new FaceFinder().ofSurfaceType('SPHERE').find(makeBox([10,10,10]), { unique: true });
    expect(isErr(r)).toBe(true);
  });
});
