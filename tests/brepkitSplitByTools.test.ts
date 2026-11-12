import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  compound,
  getFaces,
  getSolids,
  line,
  measureVolume,
  polygon,
  split,
  translate,
  unwrap,
  type Face,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const descBk = process.env['TEST_KERNEL'] === 'brepkit' ? describe : describe.skip;

type P = [number, number, number];

// A face tool cuts where it is, not along its whole plane, and an edge or a
// face lying on the body marks the face it lies on.
descBk('brepkit split by faces and edges', () => {
  /** Volume and face count of each piece of a 20 x 20 x 10 box split by `tools`, smallest first. */
  const pieces = (tools: Parameters<typeof split>[1]): Array<[number, number]> => {
    using body = box(20, 20, 10, { at: [0, 0, 5] });
    using result = unwrap(split(body, tools));
    return getSolids(result)
      .map((s): [number, number] => [unwrap(measureVolume(s)), getFaces(s).length])
      .sort((a, b) => a[0] - b[0]);
  };
  const rect = (pts: P[]): Face => unwrap(polygon(pts));
  /** A face standing in the plane y = 0, 30 wide, from z = `low` to z = `high`. */
  const standing = (low: number, high: number): Face =>
    rect([
      [-15, 0, low],
      [15, 0, low],
      [15, 0, high],
      [-15, 0, high],
    ]);

  it('marks the top with a face that only dips into it', () => {
    using dip = standing(9, 11);
    const got = pieces([dip]);
    expect(got).toHaveLength(1);
    expect(got[0]?.[0]).toBeCloseTo(4000, 6);
    expect(got[0]?.[1]).toBe(7);
  });

  it('marks the top with a face lying on it', () => {
    using lid = rect([
      [-15, 0, 10],
      [15, 0, 10],
      [15, 15, 10],
      [-15, 15, 10],
    ]);
    const got = pieces([lid]);
    expect(got).toHaveLength(1);
    expect(got[0]?.[0]).toBeCloseTo(4000, 6);
    expect(got[0]?.[1]).toBe(7);
  });

  it('marks the top with an edge lying on it', () => {
    using mark = line([-10, 0, 10], [10, 0, 10]);
    const got = pieces([mark]);
    expect(got).toHaveLength(1);
    expect(got[0]?.[0]).toBeCloseTo(4000, 6);
    expect(got[0]?.[1]).toBe(7);
  });

  it('cuts the body in two with a face across all of it', () => {
    using across = standing(-1, 11);
    const got = pieces([across]);
    expect(got.map((g) => g[1])).toEqual([6, 6]);
    expect(got[0]?.[0]).toBeCloseTo(2000, 6);
    expect(got[1]?.[0]).toBeCloseTo(2000, 6);
  });

  it('cuts by each face of a solid tool that crosses the body', () => {
    using slab = box(30, 2, 30, { at: [0, 0, 5] });
    const got = pieces([slab]);
    expect(got.map((g) => g[0]).reduce((a, b) => a + b, 0)).toBeCloseTo(4000, 6);
    expect(got).toHaveLength(3);
    expect(got[0]?.[0]).toBeCloseTo(400, 6);
  });

  it('cuts with a face and marks with an edge in one call', () => {
    using across = standing(-1, 11);
    using wall = translate(across, [0, 5, 0]);
    using mark = line([-10, -5, 10], [10, -5, 10]);
    const got = pieces([wall, mark]);
    expect(got.map((g) => g[0]).reduce((a, b) => a + b, 0)).toBeCloseTo(4000, 6);
    expect(got).toHaveLength(2);
    expect(got.map((g) => g[1]).sort()).toEqual([6, 7]);
  });

  it('marks with an edge grouped in a compound', () => {
    using mark = line([-10, 0, 10], [10, 0, 10]);
    using group = compound([mark]);
    const got = pieces([group]);
    expect(got).toHaveLength(1);
    expect(got[0]?.[0]).toBeCloseTo(4000, 6);
    expect(got[0]?.[1]).toBe(7);
  });
});
