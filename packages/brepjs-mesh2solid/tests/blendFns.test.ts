import { box, fillet, getFaces, getKernel, measureVolume, unwrap } from 'brepjs';
import { describe, expect, it } from 'vitest';
import type { AnalyticSurface } from '../src/analyticFns.js';
import { filletBlends, findBlends } from '../src/blendFns.js';

const plane = (n: [number, number, number], d: number): AnalyticSurface => ({
  kind: 'plane',
  n,
  d,
});
const cyl = (o: [number, number, number], r: number): AnalyticSurface => ({
  kind: 'cylinder',
  o,
  a: [0, 1, 0],
  r,
});
const at = (
  p: [number, number, number]
): readonly [[number, number, number], [number, number, number]] => [p, p];

describe('findBlends', () => {
  // The floor z = 0 and the wall x = 30 of a box, the fillet between them
  // (axis along Y at x = 27, z = 3), and a hole whose axis crosses the floor.
  const surfaces: AnalyticSurface[] = [
    plane([0, 0, -1], 0),
    plane([1, 0, 0], 30),
    cyl([27, 0, 3], 3),
    { kind: 'cylinder', o: [10, 10, 0], a: [0, 0, 1], r: 3 },
  ];
  const bounds = [at([15, 10, 0]), at([30, 10, 7]), at([29, 10, 1]), at([10, 10, 5])];

  it('finds a cylinder tangent to two crossing planes, not a hole', () => {
    const b = findBlends(surfaces, bounds, 0.01);
    expect(b.edges).toHaveLength(1);
    expect(b.edges[0]?.r).toBe(3);
    expect([...b.surfaces]).toEqual([2]);
  });

  it('takes a corner patch between two fillets with them', () => {
    const corner: AnalyticSurface[] = [
      ...surfaces,
      plane([0, -1, 0], 0),
      { kind: 'cylinder', o: [27, 3, 0], a: [0, 0, 1], r: 3 },
      { kind: 'torus', c: [27, 3, 3], a: [0, 0, 1], major: 0.5, minor: 2.5 },
    ];
    const b = findBlends(
      corner,
      [...bounds, at([15, 0, 7]), at([29, 1, 7]), at([28.5, 1.5, 1.5])],
      0.01
    );
    expect(b.edges).toHaveLength(2);
    expect(b.surfaces.has(6)).toBe(true);
  });

  it('gives fillets within the tolerance of one radius their mean', () => {
    const two: AnalyticSurface[] = [
      plane([0, 0, -1], 0),
      plane([1, 0, 0], 30),
      plane([0, 0, 1], 15),
      cyl([27, 0, 2.98], 2.98),
      cyl([27, 0, 12.03], 2.97),
    ];
    const b = findBlends(
      two,
      [at([15, 10, 0]), at([30, 10, 7]), at([15, 10, 15]), at([29, 10, 1]), at([29, 10, 14])],
      0.05
    );
    expect(b.edges.map((e) => e.r)).toEqual([2.975, 2.975]);
  });
});

describe('findBlends radius sharing', () => {
  it('never moves a radius further than the tolerance from its fit', () => {
    // Four fillets between the same floor and wall, radii a chain of 0.04 steps.
    const radii = [3, 3.04, 3.08, 3.12];
    const surfaces: AnalyticSurface[] = [
      plane([0, 0, -1], 0),
      plane([1, 0, 0], 30),
      ...radii.map((r) => cyl([30 - r, 0, r], r)),
    ];
    const bounds = [at([15, 10, 0]), at([30, 10, 7]), ...radii.map((r) => at([30 - r, 10, r]))];
    const b = findBlends(surfaces, bounds, 0.05);
    const shared = b.edges.map((e) => e.r);
    expect(shared).toHaveLength(4);
    shared.forEach((r, i) => expect(Math.abs(r - (radii[i] ?? 0))).toBeLessThanOrEqual(0.05));
    expect(shared[0]).toBeCloseTo(3.02, 12);
    expect(shared[3]).toBeCloseTo(3.1, 12);
  });
});

describe('filletBlends', () => {
  it('rounds the box edges the blends are tangent to', () => {
    using sharp = box(30, 20, 15);
    using expected = unwrap(fillet(sharp, 3));
    const edges = [0, 30].flatMap((x) =>
      [0, 20].flatMap((y) => [
        {
          o: [x === 0 ? 3 : 27, y === 0 ? 3 : 17, 0] as [number, number, number],
          a: [0, 0, 1] as [number, number, number],
          r: 3,
        },
      ])
    );
    const res = filletBlends(sharp, edges, 1e-6);
    if (!res.ok) throw new Error(res.reason);
    using rounded = res.value;
    const k = getKernel();
    const cylinders = getFaces(rounded).filter((f) => k.surfaceType(f.wrapped) === 'cylinder');
    expect(cylinders).toHaveLength(4);
    const loss = (1 - Math.PI / 4) * 9 * 15 * 4;
    expect(unwrap(measureVolume(rounded))).toBeCloseTo(30 * 20 * 15 - loss, 6);
    expect(unwrap(measureVolume(expected))).toBeLessThan(unwrap(measureVolume(rounded)));
  });

  it('fails when no edge matches a blend', () => {
    using sharp = box(30, 20, 15);
    const res = filletBlends(sharp, [{ o: [100, 100, 0], a: [0, 0, 1], r: 3 }], 1e-6);
    expect(res.ok).toBe(false);
  });
});
