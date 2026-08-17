/**
 * Revolve node — golden-value solids of revolution, partial-angle revolves,
 * parametric cache reuse, serialization round-trip, optimizer folding, and
 * tree editing. Angle is in degrees, matching the Rotate node.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  box,
  polygon,
  revolve,
  param,
  optimize,
  outputKindOf,
  toJSON,
  fromJSON,
  replaceNode,
  Evaluator,
  add,
  numLit,
} from '@/csg/index.js';
import { isOk, unwrap, measureVolume } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

// The manifold preview kernel is mesh-CSG only; B-rep revolution is out of
// its scope (same divergence class as the Extrude tests).
const itBrep = it.skipIf(currentKernel === 'manifold');

/** Rectangle in the XZ plane, x in [10, 20], z in [0, 30] — offset from the
 *  Z axis so a revolve produces an annular cylinder. */
function washerProfile() {
  return polygon([
    [10, 0, 0],
    [20, 0, 0],
    [20, 0, 30],
    [10, 0, 30],
  ]);
}

/** Full-revolution annular cylinder: pi * (R^2 - r^2) * h. */
const WASHER_VOL = Math.PI * (400 - 100) * 30;

describe('Revolve node', () => {
  it('reports Solid output kind', () => {
    expect(outputKindOf(revolve(washerProfile()))).toBe('Solid');
  });

  itBrep('full revolution materializes with exact volume', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(revolve(washerProfile()));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(WASHER_VOL, 0);
  });

  itBrep('partial angle (90 deg) yields a quarter of the volume', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(revolve(washerProfile(), 90));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(WASHER_VOL / 4, 0);
  });

  itBrep('custom axis and pivot', () => {
    using ev = new Evaluator();
    // Same washer, revolved around the X axis: put the profile in the XY
    // plane instead (y in [10, 20]) and spin about [1, 0, 0].
    const profile = polygon([
      [0, 10, 0],
      [0, 20, 0],
      [30, 20, 0],
      [30, 10, 0],
    ]);
    const r = ev.evaluate(revolve(profile, 360, { axis: [1, 0, 0], at: [0, 0, 0] }));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(WASHER_VOL, 0);
  });

  itBrep('parametric angle: the profile subtree hits the cache across env edits', () => {
    using ev = new Evaluator();
    const node = revolve(washerProfile(), param('a'));
    expect(vol(unwrap(ev.evaluate(node, { a: 360 })))).toBeCloseTo(WASHER_VOL, 0);
    const s1 = ev.cacheStats();
    expect(vol(unwrap(ev.evaluate(node, { a: 180 })))).toBeCloseTo(WASHER_VOL / 2, 0);
    const s2 = ev.cacheStats();
    // Only the Revolve node re-evaluates; the profile has no free params.
    expect(s2.misses - s1.misses).toBe(1);
    expect(s2.hits - s1.hits).toBe(1);
  });

  it('serialize round-trip preserves the structural hash (with and without options)', () => {
    const plain = revolve(washerProfile(), add(param('a'), numLit(10)));
    const withOpts = revolve(washerProfile(), 90, { axis: [0, 1, 0], at: [5, 0, 0] });
    for (const node of [plain, withOpts]) {
      const back = fromJSON(toJSON(node));
      expect(isOk(back)).toBe(true);
      expect(unwrap(back).structuralHash).toBe(node.structuralHash);
    }
  });

  it('optimize() folds expressions inside Revolve', () => {
    const node = revolve(washerProfile(), add(numLit(80), numLit(10)));
    const opt = optimize(node);
    expect(opt.kind).toBe('Revolve');
    expect(opt.structuralHash).toBe(revolve(washerProfile(), 90).structuralHash);
  });

  it('replaceNode rebuilds through Revolve', () => {
    const node = revolve(washerProfile(), 90, { axis: [0, 1, 0] });
    const swapped = replaceNode(node, (n) => n.kind === 'Polygon', washerProfile());
    expect(swapped.structuralHash).toBe(node.structuralHash);
    const shifted = replaceNode(
      node,
      (n) => n.kind === 'Polygon',
      polygon([
        [15, 0, 0],
        [25, 0, 0],
        [25, 0, 30],
        [15, 0, 30],
      ])
    );
    expect(shifted.structuralHash).not.toBe(node.structuralHash);
  });

  itBrep('clamps over-full angles to one revolution (kernel-deterministic)', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(revolve(washerProfile(), 720));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(WASHER_VOL, 0);
  });

  it('rejects non-positive angles with a Result error', () => {
    using ev = new Evaluator();
    expect(isOk(ev.evaluate(revolve(washerProfile(), 0)))).toBe(false);
    expect(isOk(ev.evaluate(revolve(washerProfile(), -90)))).toBe(false);
  });

  it('rejects a non-face profile at evaluation with a Result error', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(revolve(box(10, 10, 10)));
    expect(isOk(r)).toBe(false);
  });
});
