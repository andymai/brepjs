import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  sketchCircle,
  sketchEllipse,
  sketchRectangle,
  sketchRoundedRectangle,
  sketchPolysides,
  sketchFaceOffset,
  sketchParametricFunction,
  polysideInnerRadius,
  measureVolume,
  measureArea,
  box,
  getFaces,
} from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const isBrepkit = (process.env['TEST_KERNEL'] ?? 'occt') === 'brepkit';

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

  it('sketchEllipse on custom plane', () => {
    const plane = {
      origin: [0, 0, 5] as [number, number, number],
      xDir: [1, 0, 0] as [number, number, number],
      yDir: [0, 1, 0] as [number, number, number],
      zDir: [0, 0, 1] as [number, number, number],
    };
    expect(sketchEllipse(10, 5, { plane })).toBeDefined();
  });

  it('sketchRectangle on custom plane', () => {
    const plane = {
      origin: [0, 0, 0] as [number, number, number],
      xDir: [1, 0, 0] as [number, number, number],
      yDir: [0, 1, 0] as [number, number, number],
      zDir: [0, 0, 1] as [number, number, number],
    };
    expect(sketchRectangle(10, 20, { plane })).toBeDefined();
  });

  it('sketchPolysides on custom plane', () => {
    const plane = {
      origin: [0, 0, 0] as [number, number, number],
      xDir: [1, 0, 0] as [number, number, number],
      yDir: [0, 1, 0] as [number, number, number],
      zDir: [0, 0, 1] as [number, number, number],
    };
    expect(sketchPolysides(10, 5, 0, { plane })).toBeDefined();
  });

  it('sketchFaceOffset shrinks a face inward', (ctx) => {
    // brepkit: face offset area=576 vs expected<400 (offset not applied correctly)
    if (isBrepkit) ctx.skip();
    const b = box(20, 20, 20);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test indexing
    const face = getFaces(b)[0]!;
    const sketch = sketchFaceOffset(face, -2);
    expect(sketch).toBeDefined();
    const area = measureArea(sketch.face());
    expect(area).toBeGreaterThan(0);
    // Offset inward by 2 on each side → (20-4)² = 256 < 400
    expect(area).toBeLessThan(400);
  });

  it('sketchParametricFunction creates a sine curve sketch', () => {
    const sketch = sketchParametricFunction(
      (t) => [t * 20, Math.sin(t * Math.PI * 2) * 5],
      {},
      { pointsCount: 50 }
    );
    expect(sketch).toBeDefined();
  });
});
