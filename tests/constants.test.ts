import { describe, expect, it } from 'vitest';
import { DEG2RAD, RAD2DEG, HASH_CODE_MAX } from '../src/core/constants.js';

describe('constants', () => {
  it('DEG2RAD converts degrees to radians', () => {
    expect(180 * DEG2RAD).toBeCloseTo(Math.PI);
    expect(90 * DEG2RAD).toBeCloseTo(Math.PI / 2);
    expect(360 * DEG2RAD).toBeCloseTo(Math.PI * 2);
  });

  it('RAD2DEG converts radians to degrees', () => {
    expect(Math.PI * RAD2DEG).toBeCloseTo(180);
    expect((Math.PI / 2) * RAD2DEG).toBeCloseTo(90);
  });

  it('DEG2RAD and RAD2DEG are inverses', () => {
    expect(DEG2RAD * RAD2DEG).toBeCloseTo(1);
  });

  it('HASH_CODE_MAX is a large positive integer', () => {
    expect(HASH_CODE_MAX).toBeGreaterThan(0);
    expect(Number.isInteger(HASH_CODE_MAX)).toBe(true);
  });
});
