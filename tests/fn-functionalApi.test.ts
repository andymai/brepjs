import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeLine,
  sketchRectangle,
  sliceShape,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  getEdges,
  getFaces,
  getWires,
  fuseShape,
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
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const planes = [
      createPlane([0, 0, 3], null, [0, 0, 1]),
      createPlane([0, 0, 5], null, [0, 0, 1]),
      createPlane([0, 0, 7], null, [0, 0, 1]),
    ];
    const result = sliceShape(box, planes);
    expect(isOk(result)).toBe(true);
    const sections = unwrap(result);
    expect(sections).toHaveLength(3);
  });

  it('returns ok for empty planes array', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = sliceShape(box, []);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toHaveLength(0);
  });
});

describe('VolumeProps / SurfaceProps / LinearProps aliases', () => {
  it('measureVolumeProps returns volume alias', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const props = measureVolumeProps(castShape(box.wrapped));
    expect(props.volume).toBeCloseTo(1000, 0);
    expect(props.volume).toBe(props.mass);
  });

  it('measureSurfaceProps returns area alias', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const props = measureSurfaceProps(castShape(box.wrapped));
    expect(props.area).toBeCloseTo(600, 0);
    expect(props.area).toBe(props.mass);
  });

  it('measureLinearProps returns length alias', () => {
    const line = makeLine([0, 0, 0], [10, 0, 0]);
    const props = measureLinearProps(castShape(line.wrapped));
    expect(props.length).toBeCloseTo(10, 2);
    expect(props.length).toBe(props.mass);
  });
});

describe('topo caching', () => {
  it('getEdges returns same array reference on second call', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges1 = getEdges(box);
    const edges2 = getEdges(box);
    expect(edges1).toBe(edges2);
    expect(edges1.length).toBe(12);
  });

  it('getFaces returns same array reference on second call', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces1 = getFaces(box);
    const faces2 = getFaces(box);
    expect(faces1).toBe(faces2);
    expect(faces1.length).toBe(6);
  });

  it('getWires returns same array reference on second call', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const wires1 = getWires(box);
    const wires2 = getWires(box);
    expect(wires1).toBe(wires2);
  });

  it('different shapes have independent caches', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([0, 0, 0], [5, 5, 5]);
    const edges1 = getEdges(box1);
    const edges2 = getEdges(box2);
    expect(edges1).not.toBe(edges2);
  });
});

describe('AbortSignal pre-check', () => {
  it('fuseShape throws on pre-aborted signal', () => {
    const box1 = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const box2 = castShape(makeBox([5, 5, 5], [15, 15, 15]).wrapped);
    const controller = new AbortController();
    controller.abort();
    expect(() => fuseShape(box1, box2, { signal: controller.signal })).toThrow();
  });
});
