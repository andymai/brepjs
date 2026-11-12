import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  getFaces,
  getSolids,
  line,
  measureVolume,
  polygon,
  split,
  translate,
  unwrap,
  type Face,
  type Solid,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const descBk = process.env['TEST_KERNEL'] === 'brepkit' ? describe : describe.skip;

type P = [number, number, number];

// A face tool cuts where it is, not along its whole plane, and an edge or a
// face lying on the body marks the face it lies on.
descBk('brepkit split by faces and edges', () => {
  const body = (): Solid => box(20, 20, 10, { at: [0, 0, 5] });
  const rect = (pts: P[]): Face => unwrap(polygon(pts));
  const pieces = (tools: Parameters<typeof split>[1]): Array<[number, number]> =>
    getSolids(unwrap(split(body(), tools)))
      .map((s): [number, number] => [unwrap(measureVolume(s)), getFaces(s).length])
      .sort((a, b) => a[0] - b[0]);

  it('marks the top with a face that only dips into it', () => {
    const got = pieces([
      rect([
        [-15, 0, 9],
        [15, 0, 9],
        [15, 0, 11],
        [-15, 0, 11],
      ]),
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]?.[0]).toBeCloseTo(4000, 6);
    expect(got[0]?.[1]).toBe(7);
  });

  it('marks the top with a face lying on it', () => {
    const got = pieces([
      rect([
        [-15, 0, 10],
        [15, 0, 10],
        [15, 15, 10],
        [-15, 15, 10],
      ]),
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]?.[0]).toBeCloseTo(4000, 6);
    expect(got[0]?.[1]).toBe(7);
  });

  it('marks the top with an edge lying on it', () => {
    const got = pieces([line([-10, 0, 10], [10, 0, 10])]);
    expect(got).toHaveLength(1);
    expect(got[0]?.[0]).toBeCloseTo(4000, 6);
    expect(got[0]?.[1]).toBe(7);
  });

  it('cuts the body in two with a face across all of it', () => {
    const got = pieces([
      rect([
        [-15, 0, -1],
        [15, 0, -1],
        [15, 0, 11],
        [-15, 0, 11],
      ]),
    ]);
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
    using wall = translate(
      rect([
        [-15, 0, -1],
        [15, 0, -1],
        [15, 0, 11],
        [-15, 0, 11],
      ]),
      [0, 5, 0]
    );
    const got = pieces([wall, line([-10, -5, 10], [10, -5, 10])]);
    expect(got.map((g) => g[0]).reduce((a, b) => a + b, 0)).toBeCloseTo(4000, 6);
    expect(got).toHaveLength(2);
    expect(got.map((g) => g[1]).sort()).toEqual([6, 7]);
  });
});
