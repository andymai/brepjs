import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  line,
  sketchRectangle,
  slice,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  getEdges,
  getFaces,
  getWires,
  fuse,
  isOk,
  unwrap,
  castShape,
  createPlane,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('sliceShape', () => {
  it('slices a box with multiple XY planes at different Z heights', () => {
    const b = box(10, 10, 10);
    const planes = [
      createPlane([0, 0, 3], null, [0, 0, 1]),
      createPlane([0, 0, 5], null, [0, 0, 1]),
      createPlane([0, 0, 7], null, [0, 0, 1]),
    ];
    const result = slice(b, planes);
    expect(isOk(result)).toBe(true);
    const sections = unwrap(result);
    expect(sections).toHaveLength(3);
  });

  it('returns ok for empty planes array', () => {
    const b = box(10, 10, 10);
    const result = slice(b, []);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toHaveLength(0);
  });
});

describe('VolumeProps / SurfaceProps / LinearProps aliases', () => {
  it('measureVolumeProps returns volume alias', () => {
    const b = box(10, 10, 10);
    const props = measureVolumeProps(castShape(b.wrapped));
    expect(props.volume).toBeCloseTo(1000, 0);
    expect(props.volume).toBe(props.mass);
  });

  it('measureSurfaceProps returns area alias', () => {
    const b = box(10, 10, 10);
    const props = measureSurfaceProps(castShape(b.wrapped));
    expect(props.area).toBeCloseTo(600, 0);
    expect(props.area).toBe(props.mass);
  });

  it('measureLinearProps returns length alias', () => {
    const l = line([0, 0, 0], [10, 0, 0]);
    const props = measureLinearProps(castShape(l.wrapped));
    expect(props.length).toBeCloseTo(10, 2);
    expect(props.length).toBe(props.mass);
  });
});

describe('topo caching', () => {
  it('getEdges returns same array reference on second call', () => {
    const b = box(10, 10, 10);
    const edges1 = getEdges(b);
    const edges2 = getEdges(b);
    expect(edges1).toBe(edges2);
    expect(edges1.length).toBe(12);
  });

  it('getFaces returns same array reference on second call', () => {
    const b = box(10, 10, 10);
    const faces1 = getFaces(b);
    const faces2 = getFaces(b);
    expect(faces1).toBe(faces2);
    expect(faces1.length).toBe(6);
  });

  it('getWires returns same array reference on second call', () => {
    const b = box(10, 10, 10);
    const wires1 = getWires(b);
    const wires2 = getWires(b);
    expect(wires1).toBe(wires2);
  });

  it('different shapes have independent caches', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);
    const edges1 = getEdges(b1);
    const edges2 = getEdges(b2);
    expect(edges1).not.toBe(edges2);
  });
});

describe('AbortSignal pre-check', () => {
  it('fuse throws on pre-aborted signal', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const b2 = castShape(box(10, 10, 10).wrapped);
    const controller = new AbortController();
    controller.abort();
    expect(() => fuse(b1, b2, { signal: controller.signal })).toThrow();
  });
});
