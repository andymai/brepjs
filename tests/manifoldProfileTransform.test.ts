// @vitest-environment node
/**
 * Profile-shape transforms on the manifold adapter.
 *
 * Profile edges are backed by an inert placeholder rather than a Manifold
 * solid, so the transform is baked into their recorded points. They also carry
 * an exact analytic curve descriptor that geometryOps/measureOps prefer over
 * those points — a descriptor left in the source frame answers point and length
 * queries in the pre-transform space.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel, initOCCT } from './setup.js';
import { getKernel } from '@/kernel/index.js';

let haveManifold = false;
beforeAll(async () => {
  await initOCCT();
  try {
    await initKernel('manifold');
    haveManifold = true;
  } catch {
    haveManifold = false;
  }
}, 60_000);

const RADIUS = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

describe('manifold profile transforms', () => {
  it('translates a circle edge without changing its length', () => {
    if (!haveManifold) return;
    const k = getKernel('manifold');
    const circle = k.makeCircleEdge([0, 0, 0], [0, 0, 1], RADIUS);
    expect(k.length(circle)).toBeCloseTo(CIRCUMFERENCE, 6);

    const moved = k.translate(circle, 10, 0, 0);
    expect(k.length(moved)).toBeCloseTo(CIRCUMFERENCE, 6);
    // The descriptor must follow the geometry, not stay at the origin.
    const box = k.boundingBox(moved);
    expect(box.min[0]).toBeCloseTo(10 - RADIUS, 4);
    expect(box.max[0]).toBeCloseTo(10 + RADIUS, 4);
  });

  it('scales a circle edge length by the scale factor', () => {
    if (!haveManifold) return;
    const k = getKernel('manifold');
    const circle = k.makeCircleEdge([0, 0, 0], [0, 0, 1], RADIUS);
    const scaled = k.scale(circle, [0, 0, 0], 2);
    // Reading a stale descriptor would return the original circumference.
    expect(k.length(scaled)).toBeCloseTo(2 * CIRCUMFERENCE, 6);
  });

  it('keeps a line edge exact under a non-uniform transform', () => {
    if (!haveManifold) return;
    const k = getKernel('manifold');
    const line = k.makeLineEdge([0, 0, 0], [1, 0, 0]);
    // Lines are point-defined, so they survive any affine map.
    const stretched = k.generalTransformNonOrthogonal(line, [3, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]);
    expect(k.length(stretched)).toBeCloseTo(3, 6);
  });

  it('drops the conic descriptor under a shear rather than answering in the old frame', () => {
    if (!haveManifold) return;
    const k = getKernel('manifold');
    const circle = k.makeCircleEdge([0, 0, 0], [0, 0, 1], RADIUS);
    // A sheared circle is an ellipse whose axes rx/ry against unit x/y cannot
    // express, so the descriptor is dropped and length falls back rather than
    // confidently reporting the original circumference.
    const sheared = k.generalTransformNonOrthogonal(circle, [2, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]);
    let reported: number | undefined;
    try {
      reported = k.length(sheared);
    } catch {
      reported = undefined;
    }
    if (reported !== undefined) {
      expect(reported).not.toBeCloseTo(CIRCUMFERENCE, 6);
    }
  });
});
