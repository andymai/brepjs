import { describe, expect, it } from 'vitest';
import type { FeatureModel } from '../src/featureFns.js';
import { canonicalize, snapValue } from '../src/programFns.js';

describe('snapValue', () => {
  it('snaps float32 noise to the drawn value', () => {
    expect(snapValue(39.9999997, 1e-4)).toBe(40);
    expect(snapValue(2.99999941, 3e-5)).toBe(3);
    expect(snapValue(7.5000004, 1e-5)).toBe(7.5);
    expect(snapValue(-1.9e-8, 1e-5)).toBe(0);
  });

  it('keeps a value no round number is close to', () => {
    expect(snapValue(0.1234567, 1e-6)).toBe(0.1234567);
    expect(snapValue(12.34, 1e-6)).toBe(12.34);
  });
});

describe('canonicalize', () => {
  it('snaps directions within a microradian onto an axis and leaves others alone', () => {
    const model: FeatureModel = {
      base: [
        {
          op: 'torus',
          center: [1e-7, 0, 19.9999999],
          axis: [1.6e-9, 0, -1],
          major: 20.0000002,
          minor: 4.9999998,
        },
        { op: 'torus', center: [0, 0, 0], axis: [0, 0.6, 0.8], major: 5, minor: 1 },
      ],
      fillets: [],
      cavities: [],
    };
    const [snapped, tilted] = canonicalize(model, 1e-5).base;
    expect(snapped).toEqual({
      op: 'torus',
      center: [0, 0, 20],
      axis: [0, 0, -1],
      major: 20,
      minor: 5,
    });
    expect(tilted).toMatchObject({ axis: [0, 0.6, 0.8] });
  });
});
