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
  measureDistanceBetween,
  measureShapeSurfaceProperties,
  measureShapeLinearProperties,
  measureShapeVolumeProperties,
  DistanceTool,
  DistanceQuery,
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

describe('measureDistanceBetween', () => {
  it('distance between separated boxes', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([20, 0, 0], [30, 10, 10]);
    expect(measureDistanceBetween(box1, box2)).toBeCloseTo(10, 2);
  });

  it('distance between vertices', () => {
    const v1 = makeVertex([0, 0, 0]);
    const v2 = makeVertex([3, 4, 0]);
    expect(measureDistanceBetween(v1, v2)).toBeCloseTo(5, 2);
  });

  it('distance between touching shapes is zero', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([10, 0, 0], [20, 10, 10]);
    expect(measureDistanceBetween(box1, box2)).toBeCloseTo(0, 2);
  });
});

describe('measureShapeSurfaceProperties', () => {
  it('returns area', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const props = measureShapeSurfaceProperties(box);
    expect(props.area).toBeCloseTo(600, 0);
  });

  it('returns centerOfMass', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const props = measureShapeSurfaceProperties(box);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
    expect(com[1]).toBeCloseTo(5, 0);
    expect(com[2]).toBeCloseTo(5, 0);
  });

  it('works on a face', () => {
    const sketch = sketchRectangle(10, 20);
    const face = sketch.face();
    const props = measureShapeSurfaceProperties(face);
    expect(props.area).toBeCloseTo(200, 0);
  });
});

describe('measureShapeLinearProperties', () => {
  it('returns length and centerOfMass for edge', () => {
    const edge = makeLine([0, 0, 0], [10, 0, 0]);
    const props = measureShapeLinearProperties(edge);
    expect(props.length).toBeCloseTo(10, 2);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
  });

  it('returns length for wire', () => {
    const circle = sketchCircle(5);
    const props = measureShapeLinearProperties(circle.wire);
    expect(props.length).toBeCloseTo(2 * Math.PI * 5, 0);
  });
});

describe('measureShapeVolumeProperties', () => {
  it('returns volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const props = measureShapeVolumeProperties(box);
    expect(props.volume).toBeCloseTo(1000, 0);
  });

  it('returns centerOfMass', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const props = measureShapeVolumeProperties(box);
    const com = props.centerOfMass;
    expect(com).toHaveLength(3);
    expect(com[0]).toBeCloseTo(5, 0);
    expect(com[1]).toBeCloseTo(5, 0);
    expect(com[2]).toBeCloseTo(5, 0);
  });

  it('sphere volume properties', () => {
    const sphere = makeSphere(5);
    const props = measureShapeVolumeProperties(sphere);
    expect(props.volume).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
    const com = props.centerOfMass;
    expect(com[0]).toBeCloseTo(0, 0);
    expect(com[1]).toBeCloseTo(0, 0);
    expect(com[2]).toBeCloseTo(0, 0);
  });
});

describe('DistanceTool', () => {
  it('measures distance between shapes', () => {
    const tool = new DistanceTool();
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([20, 0, 0], [30, 10, 10]);
    expect(tool.distanceBetween(box1, box2)).toBeCloseTo(10, 2);
  });

  it('can be reused for multiple measurements', () => {
    const tool = new DistanceTool();
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([20, 0, 0], [30, 10, 10]);
    const box3 = makeBox([40, 0, 0], [50, 10, 10]);
    expect(tool.distanceBetween(box1, box2)).toBeCloseTo(10, 2);
    expect(tool.distanceBetween(box1, box3)).toBeCloseTo(30, 2);
  });
});

describe('DistanceQuery', () => {
  it('measures distance from fixed shape to others', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const query = new DistanceQuery(box1);
    const box2 = makeBox([20, 0, 0], [30, 10, 10]);
    expect(query.distanceTo(box2)).toBeCloseTo(10, 2);
  });

  it('can query multiple targets', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const query = new DistanceQuery(box1);
    const box2 = makeBox([20, 0, 0], [30, 10, 10]);
    const box3 = makeBox([40, 0, 0], [50, 10, 10]);
    expect(query.distanceTo(box2)).toBeCloseTo(10, 2);
    expect(query.distanceTo(box3)).toBeCloseTo(30, 2);
  });
});
