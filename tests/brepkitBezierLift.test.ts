import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import { draw, measureVolume } from '@/index.js';
import { isOk } from '@/core/result.js';
import { getKernel } from '@/kernel/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const descBk = process.env['TEST_KERNEL'] === 'brepkit' ? describe : describe.skip;

const K = (4 / 3) * (Math.SQRT2 - 1);

type Point = [number, number];
type Poles = [Point, Point, Point, Point];

/** The area between a cubic Bezier from the u = 0 axis to the v = 0 axis and the axes. */
function areaUnder([p0, p1, p2, p3]: Poles): number {
  const at = (t: number): Point => {
    const s = 1 - t;
    const [b0, b1, b2, b3] = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
    return [
      b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
      b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
    ];
  };
  let twice = 0;
  let prev: Point = [0, 0];
  for (let i = 0; i <= 4001; i++) {
    const next: Point = i <= 4000 ? at(i / 4000) : [0, 0];
    twice += prev[0] * next[1] - next[0] * prev[1];
    prev = next;
  }
  return Math.abs(twice) / 2;
}

descBk('brepkit lifts a sketched Bezier as its own curve', () => {
  it('keeps a quarter-ellipse ramp on its side of the wall it is tangent to', () => {
    // A scoop ramp's profile: down a wall at u = 0, tangent to it, then out
    // along the floor, closed through the corner diagonally opposite.
    const r = 10;
    const poles: Poles = [
      [0, r],
      [0, r * (1 - K)],
      [r * (1 - K), 0],
      [r, 0],
    ];
    const [start, c1, c2, end] = poles;
    const ramp = draw(start)
      .cubicBezierCurveTo(end, c1, c2)
      .lineTo([r, r])
      .close()
      .sketchOnPlane('XY')
      .extrude(4);

    const bb = getKernel().boundingBox(ramp.wrapped);
    expect(bb.min[0]).toBeGreaterThan(-1e-6);
    expect(bb.min[1]).toBeGreaterThan(-1e-6);

    const volume = measureVolume(ramp);
    expect(isOk(volume)).toBe(true);
    if (!isOk(volume)) return;
    expect(volume.value).toBeCloseTo(4 * (r * r - areaUnder(poles)), 1);
  });
});
