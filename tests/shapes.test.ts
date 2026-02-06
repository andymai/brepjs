import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  makeCylinder,
  makeCone,
  makeTorus,
  makeVertex,
  makeLine,
  assembleWire,
  compoundShapes,
  makeCompound,
  cast,
  downcast,
  measureVolume,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Shape construction', () => {
  it('creates a box', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(box).toBeDefined();
    expect(measureVolume(box)).toBeCloseTo(10 * 20 * 30, 0);
  });

  it('creates a sphere', () => {
    const sphere = makeSphere(5);
    expect(sphere).toBeDefined();
    expect(measureVolume(sphere)).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
  });

  it('creates a cylinder', () => {
    const cylinder = makeCylinder(5, 10);
    expect(cylinder).toBeDefined();
    expect(measureVolume(cylinder)).toBeCloseTo(Math.PI * 25 * 10, 0);
  });

  it('creates a vertex', () => {
    const vertex = makeVertex([1, 2, 3]);
    expect(vertex).toBeDefined();
  });

  it('creates a cone', () => {
    const cone = makeCone(5, 0, 10);
    const expectedVolume = (1 / 3) * Math.PI * 25 * 10;
    expect(measureVolume(cone)).toBeCloseTo(expectedVolume, 0);
  });

  it('creates a truncated cone', () => {
    const cone = makeCone(5, 3, 10);
    const expectedVolume = (1 / 3) * Math.PI * 10 * (25 + 9 + 15);
    expect(measureVolume(cone)).toBeCloseTo(expectedVolume, 0);
  });

  it('creates a torus', () => {
    const torus = makeTorus(10, 3);
    const expectedVolume = 2 * Math.PI * Math.PI * 10 * 9;
    expect(measureVolume(torus)).toBeCloseTo(expectedVolume, 0);
  });
});

describe('Edge and wire construction', () => {
  it('creates a line edge', () => {
    const edge = makeLine([0, 0, 0], [10, 0, 0]);
    expect(edge).toBeDefined();
  });

  it('assembles a wire from edges', () => {
    const e1 = makeLine([0, 0, 0], [10, 0, 0]);
    const e2 = makeLine([10, 0, 0], [10, 10, 0]);
    const wire = assembleWire([e1, e2]);
    expect(wire).toBeDefined();
  });
});

describe('cast and downcast', () => {
  it('casts a shape to its specific type', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const casted = cast(box.wrapped);
    expect(casted).toBeDefined();
  });

  it('downcasts a TopoDS_Shape', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const downcasted = downcast(box.wrapped);
    expect(downcasted).toBeDefined();
  });
});

describe('Compound shapes', () => {
  it('creates a compound from multiple solids', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([0, 0, 0], [5, 5, 5]);
    const compound = compoundShapes([box1, box2]);
    expect(compound).toBeDefined();
  });

  it('makeCompound from shapes', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([0, 0, 0], [5, 5, 5]);
    const compound = makeCompound([box1, box2]);
    expect(compound).toBeDefined();
  });
});
