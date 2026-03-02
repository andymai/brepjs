import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  sketchRectangle,
  sketchCircle,
  castShape,
  translate,
  loft,
  measureVolume,
  isShape3D,
  isOk,
  isErr,
  unwrap,
} from '../src/index.js';
import { loft as loftDirect } from '../src/operations/loftFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('loft', () => {
  it('lofts two rectangular wires', () => {
    const w1 = castShape(sketchRectangle(10, 10).wire.wrapped);
    const w2 = translate(
      castShape(sketchRectangle(10, 10, { origin: [0, 0], plane: 'XY' }).wire.wrapped),
      [0, 0, 20]
    );
    const result = loft([w1, w2]);
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
    // Loft of two identical rectangles at different heights = box-like solid
    expect(measureVolume(unwrap(result))).toBeCloseTo(10 * 10 * 20, -1);
  });

  it('lofts with startPoint', () => {
    const w1 = castShape(sketchCircle(5).wire.wrapped);
    const w2 = translate(castShape(sketchCircle(5).wire.wrapped), [0, 0, 10]);
    const result = loft([w1, w2], { startPoint: [0, 0, -5] });
    expect(isOk(result)).toBe(true);
  });

  it('lofts with endPoint', () => {
    const w1 = castShape(sketchCircle(5).wire.wrapped);
    const w2 = translate(castShape(sketchCircle(5).wire.wrapped), [0, 0, 10]);
    const result = loft([w1, w2], { endPoint: [0, 0, 15] });
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('lofts with ruled: false', () => {
    const w1 = castShape(sketchCircle(5).wire.wrapped);
    const w2 = translate(castShape(sketchCircle(5).wire.wrapped), [0, 0, 10]);
    const result = loft([w1, w2], { ruled: false });
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('returns error for empty wires', () => {
    const result = loft([]);
    expect(isErr(result)).toBe(true);
  });

  it('lofts with startPoint and endPoint', () => {
    const w1 = castShape(sketchCircle(5).wire.wrapped);
    const w2 = translate(castShape(sketchCircle(5).wire.wrapped), [0, 0, 10]);
    const result = loft([w1, w2], { startPoint: [0, 0, -5], endPoint: [0, 0, 15] });
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('lofts with returnShell', () => {
    const w1 = castShape(sketchCircle(5).wire.wrapped);
    const w2 = translate(castShape(sketchCircle(5).wire.wrapped), [0, 0, 10]);
    const result = loftDirect([w1, w2], {}, true);
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('lofts with custom tolerance', () => {
    const w1 = castShape(sketchCircle(5).wire.wrapped);
    const w2 = translate(castShape(sketchCircle(5).wire.wrapped), [0, 0, 10]);
    const result = loft([w1, w2], { tolerance: 1e-4 });
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });
});
