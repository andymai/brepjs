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
      countersinks: [],
      chamfers: [],
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

  it('snaps extrude frames, profiles, fillet edges, and cavities', () => {
    const model: FeatureModel = {
      base: [
        {
          op: 'extrude',
          frame: { origin: [0, 0, 9.9999999], x: [1, 2e-9, 0], y: [-2e-9, 1, 0], z: [0, 0, 1] },
          profile: {
            outer: [{ kind: 'circle', center: [20.0000001, 15], r: 4.9999998 }],
            holes: [],
          },
          height: 6.0000002,
        },
      ],
      fillets: [{ op: 'fillet', radius: 2.9999994, edges: [[15.0000002, 0, 9.9999998]] }],
      countersinks: [],
      chamfers: [{ op: 'chamfer', distance: 1.9999997, edges: [[0, 4.9999999, 0]] }],
      cavities: [
        {
          base: [{ op: 'sphere', center: [10.0000001, 10, 10], r: 1.9999999 }],
          fillets: [],
          cavities: [],
          countersinks: [],
          chamfers: [],
        },
      ],
    };
    const c = canonicalize(model, 1e-5);
    expect(c.base[0]).toEqual({
      op: 'extrude',
      frame: { origin: [0, 0, 10], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
      profile: { outer: [{ kind: 'circle', center: [20, 15], r: 5 }], holes: [] },
      height: 6,
    });
    expect(c.fillets).toEqual([{ op: 'fillet', radius: 3, edges: [[15, 0, 10]] }]);
    expect(c.chamfers).toEqual([{ op: 'chamfer', distance: 2, edges: [[0, 5, 0]] }]);
    expect(c.cavities[0]?.base).toEqual([{ op: 'sphere', center: [10, 10, 10], r: 2 }]);
  });
});
