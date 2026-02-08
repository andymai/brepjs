import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere as _sphere,
  cylinder as _cylinder,
  cone,
  torus,
  vertex,
  line,
  wire,
  compound,
  cast,
  downcast,
  measureVolume as _measureVolume,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Shape construction', () => {
  it('creates a box', () => {
    const b = box(10, 20, 30);
    expect(b).toBeDefined();
    expect(measureVolume(b)).toBeCloseTo(10 * 20 * 30, 0);
  });

  it('creates a sphere', () => {
    const s = sphere(5);
    expect(s).toBeDefined();
    expect(measureVolume(s)).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
  });

  it('creates a cylinder', () => {
    const c = cylinder(5, 10);
    expect(c).toBeDefined();
    expect(measureVolume(c)).toBeCloseTo(Math.PI * 25 * 10, 0);
  });

  it('creates a vertex', () => {
    const v = vertex([1, 2, 3]);
    expect(v).toBeDefined();
  });

  it('creates a cone', () => {
    const c = cone(5, 0, 10);
    const expectedVolume = (1 / 3) * Math.PI * 25 * 10;
    expect(measureVolume(c)).toBeCloseTo(expectedVolume, 0);
  });

  it('creates a truncated cone', () => {
    const c = cone(5, 3, 10);
    const expectedVolume = (1 / 3) * Math.PI * 10 * (25 + 9 + 15);
    expect(measureVolume(c)).toBeCloseTo(expectedVolume, 0);
  });

  it('creates a torus', () => {
    const t = torus(10, 3);
    const expectedVolume = 2 * Math.PI * Math.PI * 10 * 9;
    expect(measureVolume(t)).toBeCloseTo(expectedVolume, 0);
  });
});

describe('Edge and wire construction', () => {
  it('creates a line edge', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    expect(edge).toBeDefined();
  });

  it('assembles a wire from edges', () => {
    const e1 = line([0, 0, 0], [10, 0, 0]);
    const e2 = line([10, 0, 0], [10, 10, 0]);
    const w = wire([e1, e2]);
    expect(w).toBeDefined();
  });
});

describe('cast and downcast', () => {
  it('casts a shape to its specific type', () => {
    const b = box(10, 10, 10);
    const casted = cast(b.wrapped);
    expect(casted).toBeDefined();
  });

  it('downcasts a TopoDS_Shape', () => {
    const b = box(10, 10, 10);
    const downcasted = downcast(b.wrapped);
    expect(downcasted).toBeDefined();
  });
});

describe('Compound shapes', () => {
  it('creates a compound from multiple solids', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);
    const c = compound([b1, b2]);
    expect(c).toBeDefined();
  });

  it('compound from shapes', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);
    const c = compound([b1, b2]);
    expect(c).toBeDefined();
  });
});
