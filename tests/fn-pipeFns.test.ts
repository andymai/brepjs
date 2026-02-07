import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { pipe, castShape, makeBox, measureVolume, isShape3D, getBounds } from '../src/index.js';
import { createSolid } from '../src/core/shapeTypes.js';
import { getKernel } from '../src/kernel/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function fnBox(x = 10, y = 10, z = 10) {
  return castShape(makeBox([0, 0, 0], [x, y, z]).wrapped);
}

function fnSolid(w: number, h: number, d: number) {
  return createSolid(getKernel().makeBox(w, h, d));
}

describe('pipe', () => {
  it('done() returns the original shape', () => {
    const box = fnBox();
    const result = pipe(box).done();
    expect(isShape3D(result)).toBe(true);
    expect(measureVolume(result)).toBeCloseTo(1000, 0);
  });

  it('translate moves the shape', () => {
    const box = fnBox();
    const result = pipe(box).translate([100, 0, 0]).done();
    const bounds = getBounds(result);
    expect(bounds.xMin).toBeCloseTo(100, 0);
    expect(bounds.xMax).toBeCloseTo(110, 0);
  });

  it('chains multiple translates', () => {
    const box = fnBox();
    const result = pipe(box).translate([10, 0, 0]).translate([0, 20, 0]).done();
    const bounds = getBounds(result);
    expect(bounds.xMin).toBeCloseTo(10, 0);
    expect(bounds.yMin).toBeCloseTo(20, 0);
  });

  it('rotate rotates the shape', () => {
    const box = fnBox(10, 10, 10);
    const result = pipe(box).rotate(90, [0, 0, 0], [0, 0, 1]).done();
    expect(isShape3D(result)).toBe(true);
    expect(measureVolume(result)).toBeCloseTo(1000, 0);
  });

  it('scale scales the shape', () => {
    const box = fnBox(10, 10, 10);
    const result = pipe(box).scale(2, [0, 0, 0]).done();
    expect(measureVolume(result)).toBeCloseTo(8000, 0);
  });

  it('mirror mirrors the shape', () => {
    const box = fnBox(10, 10, 10);
    const result = pipe(box).mirror([1, 0, 0], [0, 0, 0]).done();
    expect(isShape3D(result)).toBe(true);
    const bounds = getBounds(result);
    expect(bounds.xMin).toBeCloseTo(-10, 0);
    expect(bounds.xMax).toBeCloseTo(0, 0);
  });

  it('fuse combines two shapes', () => {
    const box = fnSolid(10, 10, 10);
    const tool = fnSolid(10, 10, 10);
    const result = pipe(box).fuse(tool).done();
    expect(isShape3D(result)).toBe(true);
    expect(measureVolume(result)).toBeCloseTo(1000, 0);
  });

  it('cut subtracts a shape', () => {
    const box = fnSolid(10, 10, 10);
    const tool = fnSolid(5, 5, 10);
    const result = pipe(box).cut(tool).done();
    expect(isShape3D(result)).toBe(true);
    expect(measureVolume(result)).toBeCloseTo(750, 0);
  });

  it('intersect produces intersection', () => {
    const box = fnSolid(10, 10, 10);
    const tool = fnSolid(5, 5, 10);
    const result = pipe(box).intersect(tool).done();
    expect(isShape3D(result)).toBe(true);
    expect(measureVolume(result)).toBeCloseTo(250, 0);
  });

  it('chains transforms and booleans', () => {
    const box = fnSolid(10, 10, 10);
    const tool = fnSolid(10, 10, 10);
    const result = pipe(box).translate([5, 0, 0]).fuse(tool).done();
    expect(isShape3D(result)).toBe(true);
    // Overlapping by 5 units in X: total = 10*10*15 = 1500
    expect(measureVolume(result)).toBeCloseTo(1500, -1);
  });

  it('apply runs a custom function', () => {
    const box = fnSolid(10, 10, 10);
    const result = pipe(box)
      .apply((s) => createSolid(getKernel().scale(s.wrapped, [0, 0, 0], 3)))
      .done();
    expect(measureVolume(result)).toBeCloseTo(27000, 0);
  });
});
