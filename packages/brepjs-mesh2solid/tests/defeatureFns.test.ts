import { box, chamfer, cone, cut, cylinder, fillet, unwrap } from 'brepjs';
import { describe, expect, it } from 'vitest';
import { removableFaces } from '../src/defeatureFns.js';

const kinds = (rs: ReturnType<typeof removableFaces>) => rs.map((r) => r.removal.kind);

describe('removableFaces', () => {
  it('finds every chamfer strip and corner, and none of the main faces', () => {
    using b = box(30, 20, 10);
    using part = unwrap(chamfer(b, 2));
    const rs = removableFaces(part, 1e-6);
    expect(kinds(rs)).toEqual(Array<string>(20).fill('chamfer'));
    for (const r of rs) {
      if (r.removal.kind === 'chamfer') expect(r.removal.distance).toBeCloseTo(2, 9);
    }
  });

  it('finds a countersink with its rims and depth', () => {
    using plate = box(40, 30, 8);
    using hole = cylinder(3, 20, { at: [20, 15, -5] });
    using sink = cone(3, 6, 3, { at: [20, 15, 5] });
    using drilled = unwrap(cut(plate, hole));
    using part = unwrap(cut(drilled, sink));
    const rs = removableFaces(part, 1e-6);
    expect(rs).toHaveLength(1);
    const r = rs[0]?.removal;
    expect(r?.kind).toBe('countersink');
    if (r?.kind === 'countersink') {
      expect(r.narrow).toBeCloseTo(3, 9);
      expect(r.wide).toBeCloseTo(6, 9);
      expect(r.depth).toBeCloseTo(3, 9);
      expect(r.at[2]).toBeCloseTo(5, 9);
    }
  });

  it('finds fillets and corner blends with their radius', () => {
    using b = box(30, 20, 15);
    using part = unwrap(fillet(b, 3));
    const rs = removableFaces(part, 1e-6);
    expect(kinds(rs)).toEqual(Array<string>(20).fill('fillet'));
    for (const r of rs) {
      if (r.removal.kind === 'fillet') expect(r.removal.radius).toBeCloseTo(3, 9);
    }
  });

  it('leaves a plain box alone', () => {
    using b = box(30, 20, 10);
    expect(removableFaces(b, 1e-6)).toEqual([]);
  });
});
