import { describe, it, expect, beforeAll } from 'vitest';
import { measureVolumeProps, isValidSolid, unwrap } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { placementToMatrix } from '../src/import/placement.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';

describe('placementToMatrix', () => {
  it('identity frame → identity linear + given origin', () => {
    const m = placementToMatrix({ origin: [10, 20, 30], axisX: [1, 0, 0], axisZ: [0, 0, 1] });
    expect(m.linear).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(m.translation).toEqual([10, 20, 30]);
  });

  it('90° about Z (axisX=+Y) puts the X basis vector in column 0 (row-major)', () => {
    // linear is row-major [Xx,Yx,Zx, Xy,Yy,Zy, Xz,Yz,Zz]; with axisX=(0,1,0) the
    // X column is (0,1,0) → linear[0]=0, linear[3]=1, linear[6]=0.
    const m = placementToMatrix({ origin: [0, 0, 0], axisX: [0, 1, 0], axisZ: [0, 0, 1] });
    expect(m.linear[0]).toBeCloseTo(0);
    expect(m.linear[3]).toBeCloseTo(1);
    expect(m.linear[6]).toBeCloseTo(0);
  });
});

describe('placedSolids', () => {
  beforeAll(async () => {
    await initOCCT();
  }, 30000);

  it('places a solid element at its world origin (centroid shifts by origin)', () => {
    const m = new BimModel();
    m.init({ name: 'T' });
    unwrap(
      m.addBeam({
        length: 1000,
        profile: { kind: 'RECTANGULAR', width: 100, height: 100 },
        origin: [500, 0, 0],
        axisX: [1, 0, 0],
        axisZ: [0, 0, 1],
        materialName: 'Steel',
      })
    );
    const beam = m.getBeams()[0];
    const local = beam.geometry;
    const placed = unwrap(placedSolids(beam));
    expect(placed.length).toBe(1);
    const localCoM = unwrap(measureVolumeProps(local)).centerOfMass;
    const placedCoM = unwrap(measureVolumeProps(placed[0])).centerOfMass;
    // identity rotation + origin [500,0,0] → centroid shifts by exactly [500,0,0].
    expect(placedCoM[0] - localCoM[0]).toBeCloseTo(500, 1);
    expect(placedCoM[1] - localCoM[1]).toBeCloseTo(0, 1);
    expect(placedCoM[2] - localCoM[2]).toBeCloseTo(0, 1);
    for (const s of placed) s[Symbol.dispose]();
  });

  it('returns N placed flight solids for a stair (whose .geometry is null)', () => {
    const m = new BimModel();
    m.init({ name: 'T' });
    const flight = {
      width: 1000,
      riserHeight: 175,
      treadLength: 250,
      numberOfRisers: 10,
      origin: [0, 0, 0] as [number, number, number],
      axisX: [1, 0, 0] as [number, number, number],
      axisZ: [0, 0, 1] as [number, number, number],
      materialName: 'Concrete',
    };
    unwrap(
      m.addStair({
        flights: [flight, { ...flight, origin: [2500, 0, 1750] }],
        materialName: 'Concrete',
      })
    );
    const placed = unwrap(placedSolids(m.getStairs()[0]));
    expect(placed.length).toBe(2);
    for (const s of placed) expect(isValidSolid(s)).toBe(true);
    for (const s of placed) s[Symbol.dispose]();
  });
});
