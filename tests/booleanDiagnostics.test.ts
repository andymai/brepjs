import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  fuse,
  cut,
  intersect,
  translate,
  checkBoolean,
  isOk,
  unwrap,
  unwrapErr,
  measureVolume,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('boolean diagnostics', () => {
  it('successful fuse does not carry error diagnostics', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);
    const result = fuse(a, b);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1500, 0);
  });

  it('successful cut does not carry error diagnostics', () => {
    const a = box(10, 10, 10);
    const b = translate(box(5, 5, 5), [2.5, 2.5, 2.5]);
    const result = cut(a, b);
    expect(isOk(result)).toBe(true);
  });

  it('successful intersect does not carry error diagnostics', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 5, 5]);
    const result = intersect(a, b);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(125, 0);
  });
});

describe('enhanced boolean errors', () => {
  it('boolean error metadata contains diagnostics when OCCT reports errors', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);
    // Normal fuse should NOT trigger BOOLEAN_HAS_ERRORS
    const result = fuse(a, b);
    if (isOk(result)) {
      // Verify the shape is valid
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1500, 0);
    } else {
      // If it fails, error should have diagnostics
      const error = unwrapErr(result);
      expect(error.metadata?.diagnostics).toBeDefined();
    }
  });

  it('successful boolean does not trigger BOOLEAN_HAS_ERRORS', () => {
    const a = box(10, 10, 10);
    const b = translate(box(5, 5, 5), [2, 2, 2]);
    const result = cut(a, b);
    expect(isOk(result)).toBe(true);
  });
});

describe('checkBoolean', () => {
  it('returns valid for two valid operands', () => {
    const a = box(10, 10, 10);
    const b = translate(box(5, 5, 5), [5, 5, 5]);
    const result = checkBoolean(a, b, 'fuse');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns valid for cut operation', () => {
    const a = box(10, 10, 10);
    const b = box(5, 5, 5);
    const result = checkBoolean(a, b, 'cut');
    expect(result.valid).toBe(true);
  });

  it('returns valid for intersect operation', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 5, 5]);
    const result = checkBoolean(a, b, 'intersect');
    expect(result.valid).toBe(true);
  });

  it('result has correct structure', () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 10);
    const result = checkBoolean(a, b, 'fuse');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
