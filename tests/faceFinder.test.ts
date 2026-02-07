import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeCylinder,
  makeSphere,
  FaceFinder,
  createNamedPlane,
  unwrap,
  isErr,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

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
    expect(new FaceFinder().parallelTo('XY').find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(2);
  });
  it('parallelTo XZ', () => {
    expect(new FaceFinder().parallelTo('XZ').find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(2);
  });
  it('parallelTo YZ', () => {
    expect(new FaceFinder().parallelTo('YZ').find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(2);
  });
  it('parallelTo Plane object', () => {
    const plane = unwrap(createNamedPlane('XY'));
    expect(new FaceFinder().parallelTo(plane).find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(
      2
    );
  });
  it('parallelTo a face', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const ref = new FaceFinder().atAngleWith('Z').find(box)[0]!;
    expect(new FaceFinder().parallelTo(ref).find(box).length).toBe(2);
  });
  it('inPlane XY origin', () => {
    expect(new FaceFinder().inPlane('XY').find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(1);
  });
  it('inPlane XY at 30', () => {
    expect(new FaceFinder().inPlane('XY', 30).find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(
      1
    );
  });
  it('inPlane XZ', () => {
    expect(new FaceFinder().inPlane('XZ').find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(1);
  });
  it('inPlane YZ', () => {
    expect(new FaceFinder().inPlane('YZ').find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(1);
  });
  it('inPlane Plane object', () => {
    const plane = unwrap(createNamedPlane('XY', [0, 0, 30]));
    expect(new FaceFinder().inPlane(plane).find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(1);
  });
  it('containsPoint corner', () => {
    expect(
      new FaceFinder().containsPoint([0, 0, 0]).find(makeBox([0, 0, 0], [10, 20, 30])).length
    ).toBe(3);
  });
  it('containsPoint single face', () => {
    expect(
      new FaceFinder().containsPoint([5, 10, 30]).find(makeBox([0, 0, 0], [10, 20, 30])).length
    ).toBe(1);
  });
  it('not negation', () => {
    expect(
      new FaceFinder().not((f) => f.atAngleWith('Z')).find(makeBox([0, 0, 0], [10, 20, 30])).length
    ).toBe(4);
  });
  it('either or', () => {
    const finder = new FaceFinder().either([(f) => f.atAngleWith('X'), (f) => f.atAngleWith('Y')]);
    expect(finder.find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(4);
  });
  it('unique single', () => {
    const r = new FaceFinder()
      .inPlane('XY', 30)
      .find(makeBox([0, 0, 0], [10, 20, 30]), { unique: true });
    expect(unwrap(r)).toBeDefined();
  });
  it('unique errors multiple', () => {
    const r = new FaceFinder()
      .ofSurfaceType('PLANE')
      .find(makeBox([0, 0, 0], [10, 10, 10]), { unique: true });
    expect(isErr(r)).toBe(true);
  });
  it('unique errors zero', () => {
    const r = new FaceFinder()
      .ofSurfaceType('SPHERE')
      .find(makeBox([0, 0, 0], [10, 10, 10]), { unique: true });
    expect(isErr(r)).toBe(true);
  });
  it('clone preserves filters', () => {
    const original = new FaceFinder().parallelTo('XY');
    const cloned = original.clone();
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(cloned.find(box).length).toBe(2);
    // Original and clone should produce same results
    expect(original.find(box).length).toBe(cloned.find(box).length);
  });
  it('clone is independent of original', () => {
    const original = new FaceFinder().parallelTo('XY');
    const cloned = original.clone();
    // Adding filter to original doesn't affect clone
    original.inPlane('XY');
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(cloned.find(box).length).toBe(2);
    expect(original.find(box).length).toBe(1);
  });
  it('and combines multiple filter functions', () => {
    const finder = new FaceFinder().and([(f) => f.parallelTo('XY'), (f) => f.inPlane('XY', 30)]);
    expect(finder.find(makeBox([0, 0, 0], [10, 20, 30])).length).toBe(1);
  });

  it('ofArea finds faces with specific area', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    // 10x20 faces (area=200): 2 faces
    expect(new FaceFinder().ofArea(200).find(box).length).toBe(2);
    // 10x30 faces (area=300): 2 faces
    expect(new FaceFinder().ofArea(300).find(box).length).toBe(2);
    // 20x30 faces (area=600): 2 faces
    expect(new FaceFinder().ofArea(600).find(box).length).toBe(2);
  });

  it('ofArea returns empty for no match', () => {
    expect(new FaceFinder().ofArea(999).find(makeBox([0, 0, 0], [10, 10, 10])).length).toBe(0);
  });
});
