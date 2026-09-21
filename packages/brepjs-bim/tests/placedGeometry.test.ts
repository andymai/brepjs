import { describe, it, expect, beforeAll } from 'vitest';
import { measureVolumeProps, isValidSolid, unwrap, box, DisposalScope } from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { frameFromPlacement, frameToMatrix } from '../src/placementFrame.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

describe('frameToMatrix', () => {
  it('identity frame → identity linear + given origin', () => {
    const m = frameToMatrix(
      unwrap(frameFromPlacement({ origin: [10, 20, 30], axisX: [1, 0, 0], axisZ: [0, 0, 1] }))
    );
    expect(m.linear).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(m.translation).toEqual([10, 20, 30]);
  });

  it('90° about Z (axisX=+Y) puts the X basis vector in column 0 (row-major)', () => {
    // linear is row-major [Xx,Yx,Zx, Xy,Yy,Zy, Xz,Yz,Zz]; with axisX=(0,1,0) the
    // X column is (0,1,0) → linear[0]=0, linear[3]=1, linear[6]=0.
    const m = frameToMatrix(
      unwrap(frameFromPlacement({ origin: [0, 0, 0], axisX: [0, 1, 0], axisZ: [0, 0, 1] }))
    );
    expect(m.linear[0]).toBeCloseTo(0);
    expect(m.linear[3]).toBeCloseTo(1);
    expect(m.linear[6]).toBeCloseTo(0);
  });
});

describe('placedSolids', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  // Coverings store a solid like any other plate element, and ramps mirror
  // stairs (no element solid, one inclined slab per flight). Both used to fall
  // through to the empty-array default, so a finish schedule or an accessible
  // entrance had nothing to display.
  it('returns a placed solid for a covering', () => {
    using m = new BimModel();
    m.init({ name: 'T' });
    unwrap(
      m.addCovering({
        length: 2000,
        width: 1000,
        thickness: 20,
        origin: [0, 0, 300],
        axisX: [1, 0, 0],
        axisZ: [0, 0, 1],
        predefinedType: 'FLOORING',
        materialName: 'Oak',
      })
    );
    const covering = required(m.getCoverings()[0], 'covering');
    using scope = new DisposalScope();
    const placed = unwrap(placedSolids(covering));
    for (const solid of placed) scope.register(solid);
    expect(placed.length).toBe(1);
    expect(isValidSolid(required(placed[0], 'placed item 1'))).toBe(true);
    // 2000 x 1000 x 20 mm, lifted to z = 300.
    expect(unwrap(measureVolumeProps(required(placed[0], 'placed item 1'))).mass).toBeCloseTo(
      2000 * 1000 * 20,
      -3
    );
    expect(
      unwrap(measureVolumeProps(required(placed[0], 'placed item 1'))).centerOfMass[2]
    ).toBeCloseTo(310, 1);
  });

  it('returns one placed solid per ramp flight', () => {
    using m = new BimModel();
    m.init({ name: 'T' });
    unwrap(
      m.addRamp({
        name: 'R',
        materialName: 'Concrete',
        flights: [
          {
            width: 1500,
            length: 3000,
            slope: 1 / 15,
            thickness: 180,
            origin: [0, 0, 0],
            axisX: [1, 0, 0],
            axisZ: [0, 0, 1],
            materialName: 'Concrete',
          },
          {
            width: 1500,
            length: 3000,
            slope: 1 / 15,
            thickness: 180,
            origin: [4000, 0, 200],
            axisX: [1, 0, 0],
            axisZ: [0, 0, 1],
            materialName: 'Concrete',
          },
        ],
      })
    );
    const ramp = required(m.getRamps()[0], 'ramp');
    using scope = new DisposalScope();
    const placed = unwrap(placedSolids(ramp));
    for (const solid of placed) scope.register(solid);
    expect(placed.length).toBe(2);
    expect(placed.every((sol) => isValidSolid(sol))).toBe(true);
    // The second flight is placed 4000 along X and 200 up from the first.
    const a = unwrap(measureVolumeProps(required(placed[0], 'placed item 1'))).centerOfMass;
    const b = unwrap(measureVolumeProps(required(placed[1], 'placed item 2'))).centerOfMass;
    expect(b[0] - a[0]).toBeCloseTo(4000, 1);
    expect(b[2] - a[2]).toBeCloseTo(200, 1);
  });

  // Proxies used to fall through to the empty-array default, so any equipment
  // modeled as IfcBuildingElementProxy rendered nothing and took off at 0 m3.
  it('returns a fresh caller-owned copy of a proxy solid', () => {
    using m = new BimModel();
    m.init({ name: 'T' });
    unwrap(m.addProxy({ name: 'Rack', solid: box(600, 1070, 2000) }));
    const proxy = required(m.getProxies()[0], 'proxy');
    const placed = unwrap(placedSolids(proxy));
    expect(placed.length).toBe(1);
    expect(isValidSolid(required(placed[0], 'placed item 1'))).toBe(true);
    // World coordinates pass through unchanged (proxies carry no frame).
    expect(unwrap(measureVolumeProps(required(placed[0], 'placed item 1'))).mass).toBeCloseTo(
      600 * 1070 * 2000,
      -3
    );
    const com = unwrap(measureVolumeProps(required(placed[0], 'placed item 1'))).centerOfMass;
    expect(com[0]).toBeCloseTo(300, 1);
    expect(com[1]).toBeCloseTo(535, 1);
    expect(com[2]).toBeCloseTo(1000, 1);
    // The copy is independent: disposing it must not touch the model's solid.
    for (const s of placed) s[Symbol.dispose]();
    const again = unwrap(placedSolids(proxy));
    expect(unwrap(measureVolumeProps(required(again[0], 'again item 1'))).mass).toBeCloseTo(
      600 * 1070 * 2000,
      -3
    );
    for (const s of again) s[Symbol.dispose]();
  });

  it('places a solid element at its world origin (centroid shifts by origin)', () => {
    using m = new BimModel();
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
    const beam = required(m.getBeams()[0], 'beam');
    const local = beam.geometry;
    const placed = unwrap(placedSolids(beam));
    expect(placed.length).toBe(1);
    const localCoM = unwrap(measureVolumeProps(local)).centerOfMass;
    const placedCoM = unwrap(measureVolumeProps(required(placed[0], 'placed item 1'))).centerOfMass;
    // identity rotation + origin [500,0,0] → centroid shifts by exactly [500,0,0].
    expect(placedCoM[0] - localCoM[0]).toBeCloseTo(500, 1);
    expect(placedCoM[1] - localCoM[1]).toBeCloseTo(0, 1);
    expect(placedCoM[2] - localCoM[2]).toBeCloseTo(0, 1);
    for (const s of placed) s[Symbol.dispose]();
  });

  it('returns N placed flight solids for a stair (whose .geometry is null)', () => {
    using m = new BimModel();
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
    const placed = unwrap(placedSolids(required(m.getStairs()[0], 'stair')));
    expect(placed.length).toBe(2);
    for (const s of placed) expect(isValidSolid(s)).toBe(true);
    for (const s of placed) s[Symbol.dispose]();
  });
});
