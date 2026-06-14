import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  sphere,
  cylinder,
  line,
  vertex,
  translate,
  sketchCircle,
  sketchRectangle,
  measureArea,
  measureLength,
  measureDistance,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  createDistanceQuery,
  castShape,
  getFaces,
  unwrap,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('measureArea', () => {
  it('box surface area', () => {
    const b = box(10, 20, 30);
    // 2*(10*20 + 10*30 + 20*30) = 2*(200+300+600) = 2200
    expect(unwrap(measureArea(b))).toBeCloseTo(2200, 0);
  });

  it('sphere surface area', () => {
    const s = sphere(5);
    expect(unwrap(measureArea(s))).toBeCloseTo(4 * Math.PI * 25, 0);
  });

  it('cylinder surface area', () => {
    const cyl = cylinder(5, 10);
    // 2*pi*r*h + 2*pi*r^2 = 2*pi*5*10 + 2*pi*25
    expect(unwrap(measureArea(cyl))).toBeCloseTo(2 * Math.PI * 5 * 10 + 2 * Math.PI * 25, 0);
  });

  it.skipIf(shouldSkipSuite('measurement.faceMeasurement'))('face area of a rectangle', () => {
    const sketch = sketchRectangle(10, 20);
    const f = sketch.face();
    expect(unwrap(measureArea(f))).toBeCloseTo(200, 0);
  });
});

describe('measureLength', () => {
  it('straight line edge', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    expect(unwrap(measureLength(edge))).toBeCloseTo(10, 2);
  });

  it('diagonal line edge', () => {
    const edge = line([0, 0, 0], [3, 4, 0]);
    expect(unwrap(measureLength(edge))).toBeCloseTo(5, 2);
  });

  it.skipIf(shouldSkipSuite('measurement.wireLength'))('circle wire', () => {
    const c = sketchCircle(10);
    expect(unwrap(measureLength(c.wire))).toBeCloseTo(2 * Math.PI * 10, 0);
  });
});

describe('measureDistance (functional)', () => {
  it('distance between separated boxes', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const b2 = castShape(translate(box(10, 10, 10), [20, 0, 0]).wrapped);
    expect(unwrap(measureDistance(b1, b2))).toBeCloseTo(10, 2);
  });

  it('distance between vertices', () => {
    const v1 = castShape(vertex([0, 0, 0]).wrapped);
    const v2 = castShape(vertex([3, 4, 0]).wrapped);
    expect(unwrap(measureDistance(v1, v2))).toBeCloseTo(5, 2);
  });

  it('distance between touching shapes is zero', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const b2 = castShape(translate(box(10, 10, 10), [10, 0, 0]).wrapped);
    expect(unwrap(measureDistance(b1, b2))).toBeCloseTo(0, 2);
  });
});

describe('measureSurfaceProps (functional)', () => {
  it('returns area (mass)', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const props = unwrap(measureSurfaceProps(b));
    expect(props.mass).toBeCloseTo(600, 0);
  });

  it('returns centerOfMass', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const props = unwrap(measureSurfaceProps(b));
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
    expect(com[1]).toBeCloseTo(5, 0);
    expect(com[2]).toBeCloseTo(5, 0);
  });

  it.skipIf(shouldSkipSuite('measurement.faceMeasurement'))('works on a face', () => {
    const sketch = sketchRectangle(10, 20);
    const faces = getFaces(castShape(sketch.face().wrapped));
    const f = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const props = unwrap(measureSurfaceProps(f));
    expect(props.mass).toBeCloseTo(200, 0);
  });
});

describe('measureLinearProps (functional)', () => {
  it('returns mass (length) and centerOfMass for edge', () => {
    const edge = castShape(line([0, 0, 0], [10, 0, 0]).wrapped);
    const props = unwrap(measureLinearProps(edge));
    expect(props.mass).toBeCloseTo(10, 2);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
  });

  it.skipIf(shouldSkipSuite('measurement.wireLength'))('returns mass (length) for wire', () => {
    const c = sketchCircle(5);
    const w = castShape(c.wire.wrapped);
    const props = unwrap(measureLinearProps(w));
    expect(props.mass).toBeCloseTo(2 * Math.PI * 5, 0);
  });
});

describe('measureVolumeProps (functional)', () => {
  it('returns mass (volume)', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const props = unwrap(measureVolumeProps(b));
    expect(props.mass).toBeCloseTo(1000, 0);
  });

  it('returns centerOfMass', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const props = unwrap(measureVolumeProps(b));
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
    expect(com[1]).toBeCloseTo(5, 0);
    expect(com[2]).toBeCloseTo(5, 0);
  });

  it('sphere volume properties', () => {
    const s = castShape(sphere(5).wrapped);
    const props = unwrap(measureVolumeProps(s));
    expect(props.mass).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
    const com = props.centerOfMass;
    expect(com[0]).toBeCloseTo(0, 0);
    expect(com[1]).toBeCloseTo(0, 0);
    expect(com[2]).toBeCloseTo(0, 0);
  });
});

describe('createDistanceQuery (functional)', () => {
  it('measures distance from fixed shape to others', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const query = unwrap(createDistanceQuery(b1));
    const b2 = castShape(translate(box(10, 10, 10), [20, 0, 0]).wrapped);
    expect(unwrap(query.distanceTo(b2))).toBeCloseTo(10, 2);
  });

  it('can query multiple targets', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const query = unwrap(createDistanceQuery(b1));
    const b2 = castShape(translate(box(10, 10, 10), [20, 0, 0]).wrapped);
    const b3 = castShape(translate(box(10, 10, 10), [40, 0, 0]).wrapped);
    expect(unwrap(query.distanceTo(b2))).toBeCloseTo(10, 2);
    expect(unwrap(query.distanceTo(b3))).toBeCloseTo(30, 2);
  });
});
