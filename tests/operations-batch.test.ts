import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  makeCylinder,
  fuseAll,
  cutAll,
  fuseAllShapes,
  cutAllShapes,
  measureVolume,
  unwrap,
  isOk,
  isErr,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('fuseAllShapes (low-level OcType batch fuse)', () => {
  it('fuses two overlapping box shapes', () => {
    const box1 = makeBox([10, 10, 10]);
    const box2 = makeBox([10, 10, 10]).translate([5, 0, 0]);
    const result = fuseAllShapes([box1.wrapped, box2.wrapped]);
    expect(isOk(result)).toBe(true);
  });

  it('returns the single shape when given one element', () => {
    const box = makeBox([10, 10, 10]);
    const result = fuseAllShapes([box.wrapped]);
    expect(isOk(result)).toBe(true);
  });

  it('returns error for empty array', () => {
    const result = fuseAllShapes([]);
    expect(isErr(result)).toBe(true);
  });

  it('fuses three shapes', () => {
    const box1 = makeBox([10, 10, 10]);
    const box2 = makeBox([10, 10, 10]).translate([5, 0, 0]);
    const box3 = makeBox([10, 10, 10]).translate([0, 5, 0]);
    const result = fuseAllShapes([box1.wrapped, box2.wrapped, box3.wrapped]);
    expect(isOk(result)).toBe(true);
  });

  it('fuses with simplify disabled', () => {
    const box1 = makeBox([10, 10, 10]);
    const box2 = makeBox([10, 10, 10]).translate([5, 0, 0]);
    const result = fuseAllShapes([box1.wrapped, box2.wrapped], { simplify: false });
    expect(isOk(result)).toBe(true);
  });
});

describe('cutAllShapes (low-level OcType batch cut)', () => {
  it('cuts a box with a sphere', () => {
    const box = makeBox([10, 10, 10]);
    const sphere = makeSphere(3).translate([5, 5, 5]);
    const result = cutAllShapes(box.wrapped, [sphere.wrapped]);
    expect(isOk(result)).toBe(true);
  });

  it('returns base shape when tools array is empty', () => {
    const box = makeBox([10, 10, 10]);
    const result = cutAllShapes(box.wrapped, []);
    expect(isOk(result)).toBe(true);
  });

  it('cuts with multiple tools', () => {
    const box = makeBox([20, 20, 20]);
    const sphere1 = makeSphere(3).translate([5, 5, 5]);
    const sphere2 = makeSphere(3).translate([15, 15, 15]);
    const result = cutAllShapes(box.wrapped, [sphere1.wrapped, sphere2.wrapped]);
    expect(isOk(result)).toBe(true);
  });

  it('cuts with simplify disabled', () => {
    const box = makeBox([10, 10, 10]);
    const cyl = makeCylinder(2, 10).translate([5, 5, 0]);
    const result = cutAllShapes(box.wrapped, [cyl.wrapped], { simplify: false });
    expect(isOk(result)).toBe(true);
  });
});

describe('fuseAll (high-level)', () => {
  it('fuses two overlapping boxes', () => {
    const box1 = makeBox([10, 10, 10]);
    const box2 = makeBox([10, 10, 10]).translate([5, 0, 0]);
    const result = fuseAll([box1, box2]);
    expect(isOk(result)).toBe(true);
    const fused = unwrap(result);
    expect(measureVolume(fused)).toBeCloseTo(1500, 0);
  });

  it('returns error for empty array', () => {
    const result = fuseAll([]);
    expect(isErr(result)).toBe(true);
  });

  it('returns the single shape when given one element', () => {
    const box = makeBox([10, 10, 10]);
    const result = fuseAll([box]);
    expect(isOk(result)).toBe(true);
    const fused = unwrap(result);
    expect(measureVolume(fused)).toBeCloseTo(1000, 0);
  });
});

describe('cutAll (high-level)', () => {
  it('cuts a box with a sphere', () => {
    const box = makeBox([10, 10, 10]);
    const sphere = makeSphere(3).translate([5, 5, 5]);
    const result = cutAll(box, [sphere]);
    expect(isOk(result)).toBe(true);
    const cut = unwrap(result);
    expect(measureVolume(cut)).toBeLessThan(1000);
    expect(measureVolume(cut)).toBeGreaterThan(0);
  });

  it('returns base shape when tools array is empty', () => {
    const box = makeBox([10, 10, 10]);
    const result = cutAll(box, []);
    expect(isOk(result)).toBe(true);
    const cut = unwrap(result);
    expect(measureVolume(cut)).toBeCloseTo(1000, 0);
  });
});
