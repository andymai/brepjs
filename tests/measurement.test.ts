import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere,
  cylinder,
  line,
  vertex,
  translate,
  sketchCircle,
  sketchRectangle,
  measureVolume,
  measureArea,
  measureLength,
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
    const b = box(10, 20, 30);
    // 2*(10*20 + 10*30 + 20*30) = 2*(200+300+600) = 2200
    expect(measureArea(b)).toBeCloseTo(2200, 0);
  });

  it('sphere surface area', () => {
    const s = sphere(5);
    expect(measureArea(s)).toBeCloseTo(4 * Math.PI * 25, 0);
  });

  it('cylinder surface area', () => {
    const cyl = cylinder(5, 10);
    // 2*pi*r*h + 2*pi*r^2 = 2*pi*5*10 + 2*pi*25
    expect(measureArea(cyl)).toBeCloseTo(2 * Math.PI * 5 * 10 + 2 * Math.PI * 25, 0);
  });

  it('face area of a rectangle', () => {
    const sketch = sketchRectangle(10, 20);
    const f = sketch.face();
    expect(measureArea(f)).toBeCloseTo(200, 0);
  });
});

describe('measureLength', () => {
  it('straight line edge', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    expect(measureLength(edge)).toBeCloseTo(10, 2);
  });

  it('diagonal line edge', () => {
    const edge = line([0, 0, 0], [3, 4, 0]);
    expect(measureLength(edge)).toBeCloseTo(5, 2);
  });

  it('circle wire', () => {
    const c = sketchCircle(10);
    expect(measureLength(c.wire)).toBeCloseTo(2 * Math.PI * 10, 0);
  });
});

describe('measureDistance (functional)', () => {
  it('distance between separated boxes', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const b2 = castShape(translate(box(10, 10, 10), [20, 0, 0]).wrapped);
    expect(measureDistance(b1, b2)).toBeCloseTo(10, 2);
  });

  it('distance between vertices', () => {
    const v1 = castShape(vertex([0, 0, 0]).wrapped);
    const v2 = castShape(vertex([3, 4, 0]).wrapped);
    expect(measureDistance(v1, v2)).toBeCloseTo(5, 2);
  });

  it('distance between touching shapes is zero', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const b2 = castShape(translate(box(10, 10, 10), [10, 0, 0]).wrapped);
    expect(measureDistance(b1, b2)).toBeCloseTo(0, 2);
  });
});

describe('measureSurfaceProps (functional)', () => {
  it('returns area (mass)', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const props = measureSurfaceProps(b);
    expect(props.mass).toBeCloseTo(600, 0);
  });

  it('returns centerOfMass', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const props = measureSurfaceProps(b);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
    expect(com[1]).toBeCloseTo(5, 0);
    expect(com[2]).toBeCloseTo(5, 0);
  });

  it('works on a face', () => {
    const sketch = sketchRectangle(10, 20);
    const faces = getFaces(castShape(sketch.face().wrapped));
    const f = faces[0]!;
    const props = measureSurfaceProps(f);
    expect(props.mass).toBeCloseTo(200, 0);
  });
});

describe('measureLinearProps (functional)', () => {
  it('returns mass (length) and centerOfMass for edge', () => {
    const edge = castShape(line([0, 0, 0], [10, 0, 0]).wrapped);
    const props = measureLinearProps(edge);
    expect(props.mass).toBeCloseTo(10, 2);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
  });

  it('returns mass (length) for wire', () => {
    const c = sketchCircle(5);
    const w = castShape(c.wire.wrapped);
    const props = measureLinearProps(w);
    expect(props.mass).toBeCloseTo(2 * Math.PI * 5, 0);
  });
});

describe('measureVolumeProps (functional)', () => {
  it('returns mass (volume)', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const props = measureVolumeProps(b);
    expect(props.mass).toBeCloseTo(1000, 0);
  });

  it('returns centerOfMass', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const props = measureVolumeProps(b);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
    expect(com[1]).toBeCloseTo(5, 0);
    expect(com[2]).toBeCloseTo(5, 0);
  });

  it('sphere volume properties', () => {
    const s = castShape(sphere(5).wrapped);
    const props = measureVolumeProps(s);
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
    const query = createDistanceQuery(b1);
    const b2 = castShape(translate(box(10, 10, 10), [20, 0, 0]).wrapped);
    expect(query.distanceTo(b2)).toBeCloseTo(10, 2);
  });

  it('can query multiple targets', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const query = createDistanceQuery(b1);
    const b2 = castShape(translate(box(10, 10, 10), [20, 0, 0]).wrapped);
    const b3 = castShape(translate(box(10, 10, 10), [40, 0, 0]).wrapped);
    expect(query.distanceTo(b2)).toBeCloseTo(10, 2);
    expect(query.distanceTo(b3)).toBeCloseTo(30, 2);
  });
});
