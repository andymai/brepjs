import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere as _sphere,
  cylinder as _cylinder,
  fuseAll,
  cutAll,
  measureVolume as _measureVolume,
  unwrap as _unwrap,
  isOk,
  isErr as _isErr,
  translate,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('fuseAll (high-level)', () => {
  it('fuses two overlapping boxes', () => {
    const box1 = box(10, 10, 10);
    const box2 = translate(box(10, 10, 10), [5, 0, 0]);
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
    const b = box(10, 10, 10);
    const result = fuseAll([b]);
    expect(isOk(result)).toBe(true);
    const fused = unwrap(result);
    expect(measureVolume(fused)).toBeCloseTo(1000, 0);
  });
});

describe('cutAll (high-level)', () => {
  it('cuts a box with a sphere', () => {
    const b = box(10, 10, 10);
    const s = translate(sphere(3), [5, 5, 5]);
    const result = cutAll(b, [s]);
    expect(isOk(result)).toBe(true);
    const c = unwrap(result);
    expect(measureVolume(c)).toBeLessThan(1000);
    expect(measureVolume(c)).toBeGreaterThan(0);
  });

  it('returns base shape when tools array is empty', () => {
    const b = box(10, 10, 10);
    const result = cutAll(b, []);
    expect(isOk(result)).toBe(true);
    const c = unwrap(result);
    expect(measureVolume(c)).toBeCloseTo(1000, 0);
  });
});
