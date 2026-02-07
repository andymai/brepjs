import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  makeCylinder,
  makeLine,
  makeVertex,
  sketchCircle,
  sketchRectangle,
  measureVolume,
  measureArea,
  measureLength,
  fnMeasureVolume,
  fnMeasureArea,
  fnMeasureLength,
  measureDistance,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  createDistanceQuery,
  castShape,
  getFaces,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('measureArea', () => {
  it('box surface area', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    // 2*(10*20 + 10*30 + 20*30) = 2*(200+300+600) = 2200
    expect(measureArea(box)).toBeCloseTo(2200, 0);
  });

  it('sphere surface area', () => {
    const sphere = makeSphere(5);
    expect(measureArea(sphere)).toBeCloseTo(4 * Math.PI * 25, 0);
  });

  it('cylinder surface area', () => {
    const cyl = makeCylinder(5, 10);
    // 2*pi*r*h + 2*pi*r^2 = 2*pi*5*10 + 2*pi*25
    expect(measureArea(cyl)).toBeCloseTo(2 * Math.PI * 5 * 10 + 2 * Math.PI * 25, 0);
  });

  it('face area of a rectangle', () => {
    const sketch = sketchRectangle(10, 20);
    const face = sketch.face();
    expect(measureArea(face)).toBeCloseTo(200, 0);
  });
});

describe('measureLength', () => {
  it('straight line edge', () => {
    const edge = makeLine([0, 0, 0], [10, 0, 0]);
    expect(measureLength(edge)).toBeCloseTo(10, 2);
  });

  it('diagonal line edge', () => {
    const edge = makeLine([0, 0, 0], [3, 4, 0]);
    expect(measureLength(edge)).toBeCloseTo(5, 2);
  });

  it('circle wire', () => {
    const circle = sketchCircle(10);
    expect(measureLength(circle.wire)).toBeCloseTo(2 * Math.PI * 10, 0);
  });
});

describe('measureDistance (functional)', () => {
  it('distance between separated boxes', () => {
    const box1 = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const box2 = castShape(makeBox([20, 0, 0], [30, 10, 10]).wrapped);
    expect(measureDistance(box1, box2)).toBeCloseTo(10, 2);
  });

  it('distance between vertices', () => {
    const v1 = castShape(makeVertex([0, 0, 0]).wrapped);
    const v2 = castShape(makeVertex([3, 4, 0]).wrapped);
    expect(measureDistance(v1, v2)).toBeCloseTo(5, 2);
  });

  it('distance between touching shapes is zero', () => {
    const box1 = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const box2 = castShape(makeBox([10, 0, 0], [20, 10, 10]).wrapped);
    expect(measureDistance(box1, box2)).toBeCloseTo(0, 2);
  });
});

describe('measureSurfaceProps (functional)', () => {
  it('returns area (mass)', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const props = measureSurfaceProps(box);
    expect(props.mass).toBeCloseTo(600, 0);
  });

  it('returns centerOfMass', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const props = measureSurfaceProps(box);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
    expect(com[1]).toBeCloseTo(5, 0);
    expect(com[2]).toBeCloseTo(5, 0);
  });

  it('works on a face', () => {
    const sketch = sketchRectangle(10, 20);
    const faces = getFaces(castShape(sketch.face().wrapped));
    const face = faces[0]!;
    const props = measureSurfaceProps(face);
    expect(props.mass).toBeCloseTo(200, 0);
  });
});

describe('measureLinearProps (functional)', () => {
  it('returns mass (length) and centerOfMass for edge', () => {
    const edge = castShape(makeLine([0, 0, 0], [10, 0, 0]).wrapped);
    const props = measureLinearProps(edge);
    expect(props.mass).toBeCloseTo(10, 2);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
  });

  it('returns mass (length) for wire', () => {
    const circle = sketchCircle(5);
    const wire = castShape(circle.wire.wrapped);
    const props = measureLinearProps(wire);
    expect(props.mass).toBeCloseTo(2 * Math.PI * 5, 0);
  });
});

describe('measureVolumeProps (functional)', () => {
  it('returns mass (volume)', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const props = measureVolumeProps(box);
    expect(props.mass).toBeCloseTo(1000, 0);
  });

  it('returns centerOfMass', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const props = measureVolumeProps(box);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
    expect(com[1]).toBeCloseTo(5, 0);
    expect(com[2]).toBeCloseTo(5, 0);
  });

  it('sphere volume properties', () => {
    const sphere = castShape(makeSphere(5).wrapped);
    const props = measureVolumeProps(sphere);
    expect(props.mass).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
    const com = props.centerOfMass;
    expect(com[0]).toBeCloseTo(0, 0);
    expect(com[1]).toBeCloseTo(0, 0);
    expect(com[2]).toBeCloseTo(0, 0);
  });
});

describe('createDistanceQuery (functional)', () => {
  it('measures distance from fixed shape to others', () => {
    const box1 = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const query = createDistanceQuery(box1);
    const box2 = castShape(makeBox([20, 0, 0], [30, 10, 10]).wrapped);
    expect(query.distanceTo(box2)).toBeCloseTo(10, 2);
  });

  it('can query multiple targets', () => {
    const box1 = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const query = createDistanceQuery(box1);
    const box2 = castShape(makeBox([20, 0, 0], [30, 10, 10]).wrapped);
    const box3 = castShape(makeBox([40, 0, 0], [50, 10, 10]).wrapped);
    expect(query.distanceTo(box2)).toBeCloseTo(10, 2);
    expect(query.distanceTo(box3)).toBeCloseTo(30, 2);
  });
});
