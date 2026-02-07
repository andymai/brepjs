import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  makeCylinder,
  fuseAll,
  cutAll,
  measureVolume,
  unwrap,
  isOk,
  isErr,
} from '../src/index.js';
import { translateShape } from '../src/topology/shapeFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('fuseAll (high-level)', () => {
  it('fuses two overlapping boxes', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = translateShape(makeBox([0, 0, 0], [10, 10, 10]) as any, [5, 0, 0]);
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
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = fuseAll([box]);
    expect(isOk(result)).toBe(true);
    const fused = unwrap(result);
    expect(measureVolume(fused)).toBeCloseTo(1000, 0);
  });
});

describe('cutAll (high-level)', () => {
  it('cuts a box with a sphere', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const sphere = translateShape(makeSphere(3) as any, [5, 5, 5]);
    const result = cutAll(box, [sphere]);
    expect(isOk(result)).toBe(true);
    const cut = unwrap(result);
    expect(measureVolume(cut)).toBeLessThan(1000);
    expect(measureVolume(cut)).toBeGreaterThan(0);
  });

  it('returns base shape when tools array is empty', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = cutAll(box, []);
    expect(isOk(result)).toBe(true);
    const cut = unwrap(result);
    expect(measureVolume(cut)).toBeCloseTo(1000, 0);
  });
});
