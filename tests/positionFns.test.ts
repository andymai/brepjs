import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, line, positionOnCurve, isOk, isErr, unwrap, measureVolume } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('positionOnCurve', () => {
  it('positions a box at the midpoint of a line', () => {
    const b = box(2, 2, 2);
    const spine = line([0, 0, 0], [10, 0, 0]);
    const result = positionOnCurve(b, spine, 0.5);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(8, 0);
  });

  it('positions at start of curve (param=0)', () => {
    const b = box(1, 1, 1);
    const spine = line([0, 0, 0], [10, 0, 0]);
    const result = positionOnCurve(b, spine, 0.0);
    expect(isOk(result)).toBe(true);
  });

  it('positions at end of curve (param=1)', () => {
    const b = box(1, 1, 1);
    const spine = line([0, 0, 0], [10, 0, 0]);
    const result = positionOnCurve(b, spine, 1.0);
    expect(isOk(result)).toBe(true);
  });

  it('returns a Result for out-of-range parameter', () => {
    const b = box(1, 1, 1);
    const spine = line([0, 0, 0], [10, 0, 0]);
    // param=2.0 is outside [0,1] — may throw or succeed depending on kernel
    const result = positionOnCurve(b, spine, 2.0);
    // Verify it returns a structured Result (not an unhandled throw)
    expect(isOk(result) || isErr(result)).toBe(true);
  });

  it('returns a Result for negative parameter', () => {
    const b = box(1, 1, 1);
    const spine = line([0, 0, 0], [10, 0, 0]);
    const result = positionOnCurve(b, spine, -1.0);
    expect(isOk(result) || isErr(result)).toBe(true);
  });
});
