import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import {
  bezier,
  DisposalScope,
  line,
  loft,
  measureVolume,
  polygon,
  unwrap,
  unwrapErr,
  wireLoop,
  type ClosedWire,
  type Edge,
  type Vec3,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const isBrepkit = process.env['TEST_KERNEL'] === 'brepkit';
const descBk = isBrepkit ? describe : describe.skip;

const CORNERS: ReadonlyArray<[number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
/** A square of half-size `h` at height `z`, as its outline. */
const square = (h: number, z: number): ClosedWire => {
  const pts = CORNERS.map(([x, y]): Vec3 => [x * h, y * h, z]);
  using scope = new DisposalScope();
  const sides = pts.map((p, i) => scope.register(line(p, pts[(i + 1) % pts.length] as Vec3)));
  return unwrap(wireLoop(sides));
};
/** Simpson's rule over [0, 1]. */
const integrate = (f: (v: number) => number): number => {
  const n = 2000;
  let sum = f(0) + f(1);
  for (let i = 1; i < n; i++) sum += f(i / n) * (i % 2 === 1 ? 4 : 2);
  return sum / (3 * n);
};
/** A stack of squares of half-size `a(v)`, rising at `dz(v)`. */
const stack = (a: (v: number) => number, dz: (v: number) => number): number =>
  integrate((v) => 4 * a(v) * a(v) * dz(v));
const quadratic =
  (a0: number, c: number, a1: number) =>
  (v: number): number =>
    (1 - v) * (1 - v) * a0 + 2 * v * (1 - v) * c + v * v * a1;

describe('loft rails and end conditions', () => {
  it.skipIf(isBrepkit)('reports a kernel that has neither as unsupported', () => {
    using a = square(10, 0);
    using b = square(5, 10);
    const error = unwrapErr(loft([a, b], { start: 'normal' }));
    expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
  });

  it('refuses a ruled loft or an end point along with them', () => {
    using a = square(10, 0);
    using b = square(5, 10);
    expect(unwrapErr(loft([a, b], { start: 'normal', ruled: true })).code).toBe(
      'LOFT_GUIDED_OPTIONS'
    );
    expect(unwrapErr(loft([a, b], { end: 'normal', endPoint: [0, 0, 20] })).code).toBe(
      'LOFT_GUIDED_OPTIONS'
    );
  });
});

descBk('brepkit loft rails and end conditions', () => {
  it('leaves a frustum as it is along straight rails down its corners', () => {
    using a = square(10, 0);
    using b = square(5, 10);
    using scope = new DisposalScope();
    const rails = CORNERS.map(([x, y]) =>
      scope.register(line([x * 10, y * 10, 0], [x * 5, y * 5, 10]))
    );
    using solid = unwrap(loft([a, b], { rails }));
    expect(unwrap(measureVolume(solid))).toBeCloseTo((10 / 3) * (400 + 100 + 200), 5);
  });

  it('follows rails that bow out between the profiles', () => {
    const [h, low, mid, high] = [10, 6, 14, 4];
    using a = square(low, 0);
    using b = square(high, h);
    using scope = new DisposalScope();
    const rails = CORNERS.map(([x, y]): Edge =>
      scope.register(
        unwrap(
          bezier([
            [x * low, y * low, 0],
            [x * mid, y * mid, h / 2],
            [x * high, y * high, h],
          ])
        )
      )
    );
    using solid = unwrap(loft([a, b], { rails }));
    const want = stack(quadratic(low, mid, high), () => h);
    // The straight frustum between the same squares holds 1013.33.
    expect(want).toBeCloseTo(2645.333333, 5);
    expect(unwrap(measureVolume(solid))).toBeCloseTo(want, 3);
  });

  it('leaves both profiles square to their planes under normal ends', () => {
    const [h, low, high] = [10, 6, 4];
    using a = square(low, 0);
    using b = square(high, h);
    using solid = unwrap(loft([a, b], { start: 'normal', end: { kind: 'normal', weight: 1 } }));
    const chord = Math.sqrt(2 * (high - low) ** 2 + h * h);
    // Cubic Hermite blends: the half-size runs flat out of each end, and the
    // height leaves each end at the chord's speed.
    const size = (v: number): number => low + (high - low) * (3 * v * v - 2 * v * v * v);
    const rise = (v: number): number =>
      chord * (1 - 4 * v + 3 * v * v) + h * (6 * v - 6 * v * v) + chord * (3 * v * v - 2 * v);
    const want = stack(size, rise);
    expect(want).toBeCloseTo(1019.667691, 5);
    expect(unwrap(measureVolume(solid))).toBeCloseTo(want, 3);
  });

  it('leaves along a face under a tangent start', () => {
    const [h, low, high] = [10, 10, 5];
    using ground = unwrap(
      polygon([
        [-50, -50, 0],
        [50, -50, 0],
        [50, 50, 0],
        [-50, 50, 0],
      ])
    );
    using a = square(low, 0);
    using b = square(high, h);
    using solid = unwrap(loft([a, b], { start: { kind: 'tangent', face: ground, weight: 1 } }));
    const slope = -Math.sqrt(2 * (high - low) ** 2 + h * h);
    const want = stack(quadratic(low, low + slope / 2, high), (v) => 2 * v * h);
    expect(unwrap(measureVolume(solid))).toBeCloseTo(want, 3);
    using free = unwrap(loft([a, b], { ruled: false }));
    expect(Math.abs(unwrap(measureVolume(free)) - want)).toBeGreaterThan(50);
  });

  it('reports a rail that misses the profiles', () => {
    using a = square(10, 0);
    using b = square(5, 10);
    using stray = line([20, 20, 0], [20, 20, 10]);
    const error = unwrapErr(loft([a, b], { rails: [stray] }));
    expect(error.code).toBe('LOFT_FAILED');
  });
});
