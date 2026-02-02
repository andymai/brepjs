import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  makeCylinder,
  makeLine,
  makeVertex,
  sketchRectangle,
  // functional API
  castShape,
  fnMeasureVolume,
  fnMeasureArea,
  fnMeasureLength,
  measureDistance,
  createDistanceQuery,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  getFaces,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('fnMeasureVolume', () => {
  it('box volume', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(fnMeasureVolume(castShape(box.wrapped))).toBeCloseTo(6000, 0);
  });

  it('sphere volume', () => {
    const sphere = makeSphere(5);
    expect(fnMeasureVolume(castShape(sphere.wrapped))).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
  });
});

describe('fnMeasureArea', () => {
  it('box surface area', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(fnMeasureArea(castShape(box.wrapped))).toBeCloseTo(2200, 0);
  });

  it('face area', () => {
    const rect = sketchRectangle(10, 20);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    expect(fnMeasureArea(face)).toBeCloseTo(200, 0);
  });
});

describe('fnMeasureLength', () => {
  it('line length', () => {
    const line = makeLine([0, 0, 0], [10, 0, 0]);
    expect(fnMeasureLength(castShape(line.wrapped))).toBeCloseTo(10, 2);
  });

  it('diagonal line length', () => {
    const line = makeLine([0, 0, 0], [3, 4, 0]);
    expect(fnMeasureLength(castShape(line.wrapped))).toBeCloseTo(5, 2);
  });
});

describe('measureDistance', () => {
  it('distance between two vertices', () => {
    const v1 = castShape(makeVertex([0, 0, 0]).wrapped);
    const v2 = castShape(makeVertex([10, 0, 0]).wrapped);
    expect(measureDistance(v1, v2)).toBeCloseTo(10, 2);
  });

  it('distance between boxes', () => {
    const b1 = castShape(makeBox([0, 0, 0], [5, 5, 5]).wrapped);
    const b2 = castShape(makeBox([10, 0, 0], [15, 5, 5]).wrapped);
    expect(measureDistance(b1, b2)).toBeCloseTo(5, 2);
  });
});

describe('createDistanceQuery', () => {
  it('creates reusable distance query', () => {
    const ref = castShape(makeVertex([0, 0, 0]).wrapped);
    const query = createDistanceQuery(ref);

    const v1 = castShape(makeVertex([3, 4, 0]).wrapped);
    const v2 = castShape(makeVertex([0, 0, 10]).wrapped);

    expect(query.distanceTo(v1)).toBeCloseTo(5, 2);
    expect(query.distanceTo(v2)).toBeCloseTo(10, 2);

    query.dispose();
  });
});

describe('measureVolumeProps / measureSurfaceProps / measureLinearProps', () => {
  it('volume props include mass and centerOfMass', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const props = measureVolumeProps(castShape(box.wrapped));
    expect(props.mass).toBeCloseTo(1000, 0);
    expect(props.centerOfMass[0]).toBeCloseTo(5, 0);
    expect(props.centerOfMass[1]).toBeCloseTo(5, 0);
    expect(props.centerOfMass[2]).toBeCloseTo(5, 0);
  });

  it('surface props include mass and centerOfMass', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const props = measureSurfaceProps(castShape(box.wrapped));
    expect(props.mass).toBeCloseTo(600, 0);
    expect(props.centerOfMass[0]).toBeCloseTo(5, 0);
  });

  it('linear props include mass', () => {
    const line = makeLine([0, 0, 0], [10, 0, 0]);
    const props = measureLinearProps(castShape(line.wrapped));
    expect(props.mass).toBeCloseTo(10, 2);
  });
});
