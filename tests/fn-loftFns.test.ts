import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  sketchRectangle,
  sketchCircle,
  // functional API
  castShape,
  loftWires,
  measureVolume,
  isShape3D,
  isOk,
  unwrap,
} from '../src/index.js';
import { translateShape } from '../src/topology/shapeFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('loftWires', () => {
  it('lofts two rectangular wires', () => {
    const w1 = castShape(sketchRectangle(10, 10).wire.wrapped);
    const w2 = castShape(
      translateShape(
        sketchRectangle(10, 10, { origin: [0, 0], plane: 'XY' }).wire as any,
        [0, 0, 20]
      ).wrapped
    );
    const result = loftWires([w1, w2]);
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
    // Loft of two identical rectangles at different heights = box-like solid
    expect(measureVolume(unwrap(result))).toBeCloseTo(10 * 10 * 20, -1);
  });

  it('lofts with startPoint', () => {
    const w1 = castShape(sketchCircle(5).wire.wrapped);
    const w2 = castShape(translateShape(sketchCircle(5).wire as any, [0, 0, 10]).wrapped);
    const result = loftWires([w1, w2], { startPoint: [0, 0, -5] });
    expect(isOk(result)).toBe(true);
  });
});
