// Parity for the locate-based rigid-transform path (#1603). evalTranslate /
// evalRotate now apply a cheap location re-tag instead of a deep-copying
// transform; the materialized geometry must be identical. Each case compares
// the locate path against the deep-copy transform path *within the same
// kernel*, so kernel-specific measurement accuracy cancels and only a real
// divergence (e.g. a rotation-convention mismatch) trips the assertion.
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import { Evaluator, box, cylinder, fuse, translate, rotate } from '@/csg/index.js';
import { translate as copyTranslate, rotate as copyRotate } from '@/topology/transformFns.js';
import { measureVolumeProps, unwrap, type AnyShape, type Dimension } from '@/index.js';
import { hasAnyMetadata } from '@/topology/metadata/metadataPropagation.js';
import { getFaceTags } from '@/topology/metadata/faceTagFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function props(shape: AnyShape<Dimension>): { volume: number; com: readonly number[] } {
  const p = unwrap(measureVolumeProps(shape));
  return { volume: p.volume, com: p.centerOfMass };
}

function expectSame(
  a: { volume: number; com: readonly number[] },
  b: { volume: number; com: readonly number[] },
  prec = 4
): void {
  expect(a.volume).toBeCloseTo(b.volume, prec);
  for (let i = 0; i < 3; i++) expect(a.com[i] ?? NaN).toBeCloseTo(b.com[i] ?? NaN, prec);
}

describe('CSG locate parity — geometry identical to the deep-copy transform', () => {
  it('translate matches the copy path', () => {
    using ev = new Evaluator();
    const widget = fuse(box(10, 10, 10), cylinder(3, 20));
    const v: [number, number, number] = [12, -7, 4];
    const located = props(unwrap(ev.evaluate(translate(widget, v))));
    const copied = props(copyTranslate(unwrap(ev.evaluate(widget)), v));
    expectSame(located, copied);
  });

  it('rotate matches the copy path (off-origin axis + center)', () => {
    using ev = new Evaluator();
    const widget = fuse(box(10, 6, 4), cylinder(2, 12));
    const located = props(
      unwrap(ev.evaluate(rotate(widget, 37, { axis: [0, 0, 1], at: [3, 1, 0] })))
    );
    // copyRotate(shape, angleDeg, position, direction)
    const copied = props(copyRotate(unwrap(ev.evaluate(widget)), 37, [3, 1, 0], [0, 0, 1]));
    expectSame(located, copied);
  });

  it('nested rigid transforms (rotate then translate) compose correctly', () => {
    using ev = new Evaluator();
    const widget = box(8, 8, 8);
    const node = translate(rotate(widget, 90, { axis: [0, 0, 1] }), [10, 0, 0]);
    const located = props(unwrap(ev.evaluate(node)));
    const base = unwrap(ev.evaluate(widget));
    const copied = props(copyTranslate(copyRotate(base, 90, [0, 0, 0], [0, 0, 1]), [10, 0, 0]));
    expectSame(located, copied);
  });

  it('centroid shifts by exactly the translation (absolute placement)', () => {
    using ev = new Evaluator();
    // Plain box: all-planar faces measure exactly on every kernel, so the
    // centroid is a reliable absolute-placement signal. (A curved/fused widget
    // is avoided here only because brepkit's mesh-based measure of it drifts
    // under a move; the locate/copy parity cases above already pin geometry on
    // those shapes per-kernel.)
    const widget = box(6, 8, 10);
    const v: [number, number, number] = [5, 9, -3];
    const base = props(unwrap(ev.evaluate(widget)));
    const moved = props(unwrap(ev.evaluate(translate(widget, v))));
    expect(moved.volume).toBeCloseTo(base.volume, 4);
    for (let i = 0; i < 3; i++)
      expect(moved.com[i] ?? NaN).toBeCloseTo((base.com[i] ?? 0) + (v[i] ?? 0), 4);
  });

  it('primitives carry no metadata (pure locate); boolean face metadata survives a move', () => {
    using ev = new Evaluator();
    // Primitives have no face metadata → relocate takes the pure O(1) locate path.
    expect(hasAnyMetadata(unwrap(ev.evaluate(box(10, 10, 10))))).toBe(false);
    expect(hasAnyMetadata(unwrap(ev.evaluate(cylinder(3, 12))))).toBe(false);
    // Boolean results carry face tags (kernel-dependent). Where they do, a move
    // must PRESERVE them — re-keyed through the location, not dropped — matching
    // scale/mirror. Guards Greptile's metadata-loss finding. Comparing tag names
    // + per-tag face counts catches a dropped or partial re-key, not just absence.
    const widget = fuse(box(8, 8, 8), cylinder(3, 12));
    const baseTags = getFaceTags(unwrap(ev.evaluate(widget)));
    if (baseTags.size > 0) {
      for (const node of [translate(widget, [5, 0, 0]), rotate(widget, 30, { axis: [0, 0, 1] })]) {
        const movedTags = getFaceTags(unwrap(ev.evaluate(node)));
        expect([...movedTags.keys()].sort()).toEqual([...baseTags.keys()].sort());
        for (const [tag, faces] of baseTags) expect(movedTags.get(tag)?.length).toBe(faces.length);
      }
    }
  });
});
