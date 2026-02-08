import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  Sketch as _Sketch,
  sketchCircle,
  sketchEllipse,
  sketchRectangle,
  sketchRoundedRectangle,
  sketchPolysides,
  polysideInnerRadius,
  sketchParametricFunction as _sketchParametricFunction,
  sketchHelix as _sketchHelix,
  measureVolume as _measureVolume,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Canned sketches', () => {
  it('sketchCircle default plane', () => {
    const s = sketchCircle(10);
    expect(s).toBeDefined();
    expect(measureVolume(s.extrude(5))).toBeCloseTo(Math.PI * 100 * 5, 0);
  });

  it('sketchCircle on XZ', () => {
    expect(sketchCircle(5, { plane: 'XZ' })).toBeDefined();
  });

  it('sketchCircle with origin offset', () => {
    expect(sketchCircle(5, { origin: 10 })).toBeDefined();
  });

  it('sketchEllipse', () => {
    expect(sketchEllipse(10, 5)).toBeDefined();
  });

  it('sketchEllipse with yRadius > xRadius', () => {
    expect(sketchEllipse(5, 10)).toBeDefined();
  });

  it('sketchRectangle', () => {
    expect(measureVolume(sketchRectangle(10, 20).extrude(5))).toBeCloseTo(1000, 0);
  });

  it('sketchRoundedRectangle', () => {
    expect(sketchRoundedRectangle(10, 20, 2)).toBeDefined();
  });

  it('sketchRoundedRectangle with rx/ry', () => {
    expect(sketchRoundedRectangle(10, 20, { rx: 2, ry: 1 })).toBeDefined();
  });

  it('sketchPolysides hexagon', () => {
    expect(sketchPolysides(10, 6)).toBeDefined();
  });

  it('sketchPolysides with sagitta', () => {
    expect(sketchPolysides(10, 6, 2)).toBeDefined();
  });

  it('polysideInnerRadius', () => {
    expect(polysideInnerRadius(10, 6)).toBeCloseTo(10 * Math.cos(Math.PI / 6), 5);
  });

  it('polysideInnerRadius with negative sagitta', () => {
    const base = 10 * Math.cos(Math.PI / 6);
    expect(polysideInnerRadius(10, 6, -1)).toBeCloseTo(base - 1, 5);
  });

  it('polysideInnerRadius with positive sagitta unchanged', () => {
    const base = 10 * Math.cos(Math.PI / 6);
    expect(polysideInnerRadius(10, 6, 2)).toBeCloseTo(base, 5);
  });

  // sketchParametricFunction and sketchHelix omitted — heavy WASM ops
  // that cause OOM in CI; covered indirectly via draw tests.
});
