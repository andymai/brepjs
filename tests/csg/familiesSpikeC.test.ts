/**
 * Spike C (crux) — can a ShapeRef live in a content-hashed node?
 *
 * Hypothesis under test: the cache key stays purely structural because the ref
 * is serializable node DATA; resolution against the materialized target is a
 * deterministic part of evaluation, so (hash, env) still determines the result.
 *
 * Falsifiable checks:
 *  1. EdgeRef round-trip: create on a box edge, resolveRefIn re-finds it.
 *  2. Ref is pure data (JSON round-trip) and enters the spec hash.
 *  3. Fillet-via-ref: exact volume (V - (1 - pi/4) r^2 L).
 *  4. Cache soundness: same spec+env = pure hit (no kernel call, no re-resolve);
 *     upstream param edit = miss, re-resolve, and RE-TARGETS the same edge
 *     (volume formula tracks the new edge length).
 *  5. Resolution cost vs cache win, measured.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import { box, param, Evaluator } from '@/csg/index.js';
import { isOk, unwrap, measureVolume } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import {
  FilletEvaluator,
  filletSpec,
  hashFilletSpec,
  topFrontEdgeRef,
  materializeShape3D,
} from './filletRefSpike.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// Fillet + edge refs are B-rep constructs; manifold has neither.
const itBrep = it.skipIf(currentKernel === 'manifold');

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

/** Volume of a w x d x h box with one edge (length w) filleted at radius r. */
function filletedVol(w: number, d: number, h: number, r: number): number {
  return w * d * h - (1 - Math.PI / 4) * r * r * w;
}

describe('Spike C — ShapeRef in a content-hashed node', () => {
  itBrep('EdgeRef round-trips: create on a box edge, resolveRefIn re-finds it', () => {
    using ev = new Evaluator();
    const shape = materializeShape3D(ev, box(100, 40, 30));
    const ref = topFrontEdgeRef(shape, 100, 30);
    expect(ref.faceRoles).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(ref))).toEqual(ref);
    const spec = filletSpec(box(100, 40, 30), ref, 5);
    expect(hashFilletSpec(spec)).toBe(hashFilletSpec(filletSpec(box(100, 40, 30), ref, 5)));
  });

  itBrep('ref data and radius enter the spec hash', () => {
    using ev = new Evaluator();
    const shape = materializeShape3D(ev, box(100, 40, 30));
    const refA = topFrontEdgeRef(shape, 100, 30);
    const specA = filletSpec(box(100, 40, 30), refA, 5);
    // Different radius -> different hash.
    expect(hashFilletSpec(filletSpec(box(100, 40, 30), refA, 6))).not.toBe(hashFilletSpec(specA));
    // Different ref (swap the face roles for a different edge) -> different hash.
    const refB = { ...refA, faceRoles: [refA.faceRoles[0], 'box:back'] as const };
    expect(hashFilletSpec(filletSpec(box(100, 40, 30), refB, 5))).not.toBe(hashFilletSpec(specA));
  });

  itBrep('fillet-via-ref materializes with exact volume', () => {
    using ev = new Evaluator();
    using fev = new FilletEvaluator(ev);
    const shape = materializeShape3D(ev, box(100, 40, 30));
    const ref = topFrontEdgeRef(shape, 100, 30);
    const spec = filletSpec(box(100, 40, 30), ref, 5);
    const r = fev.evaluate(spec, {});
    expect(isOk(r)).toBe(true);
    // Precision -1 (+/- 5): brepkit's fillet drifts ~1.3 from OCCT's exact
    // value; a wrong-edge re-target would be off by hundreds.
    expect(vol(unwrap(r))).toBeCloseTo(filletedVol(100, 40, 30, 5), -1);
  });

  itBrep('cache is sound: hit on same env, re-resolve + re-target on upstream edit', () => {
    using ev = new Evaluator();
    using fev = new FilletEvaluator(ev);
    const target = box(param('w'), 40, 30);
    const seed = materializeShape3D(ev, target, { w: 100 });
    const ref = topFrontEdgeRef(seed, 100, 30);
    const spec = filletSpec(target, ref, 5);

    const r1 = fev.evaluate(spec, { w: 100 });
    expect(vol(unwrap(r1))).toBeCloseTo(filletedVol(100, 40, 30, 5), -1);
    expect(fev.kernelCalls).toBe(1);
    expect(fev.resolutions).toBe(1);

    // Same env: pure cache hit — no kernel call, no re-resolution, same handle.
    const r2 = fev.evaluate(spec, { w: 100 });
    expect(unwrap(r2)).toBe(unwrap(r1));
    expect(fev.kernelCalls).toBe(1);
    expect(fev.resolutions).toBe(1);

    // Upstream edit: the box stretches to w=160. The ref (authored at w=100,
    // hint now stale) must re-target the SAME top-front edge, now 160 long.
    const r3 = fev.evaluate(spec, { w: 160 });
    expect(fev.kernelCalls).toBe(2);
    expect(fev.resolutions).toBe(2);
    expect(vol(unwrap(r3))).toBeCloseTo(filletedVol(160, 40, 30, 5), -1);

    // And the first env still hits its own entry.
    const r4 = fev.evaluate(spec, { w: 100 });
    expect(unwrap(r4)).toBe(unwrap(r1));
    expect(fev.kernelCalls).toBe(2);
  });

  itBrep('resolution cost is small relative to the cache win', () => {
    using ev = new Evaluator();
    using fev = new FilletEvaluator(ev);
    const target = box(100, 40, 30);
    const seed = materializeShape3D(ev, target);
    const ref = topFrontEdgeRef(seed, 100, 30);
    const spec = filletSpec(target, ref, 5);
    expect(isOk(fev.evaluate(spec, {}))).toBe(true);

    const runs = 25;
    const resolveMs = fev.timeResolutions(seed, ref, runs);
    const filletMs = fev.filletMs / fev.kernelCalls;
    // The cache win is the skipped fillet; resolution must not eat it.
    // (Loose sanity bound; the measured ratio goes to the vault.)
    expect(resolveMs).toBeLessThan(filletMs * 5 + 5);
    console.warn(
      `[spike C] resolveRefIn mean: ${resolveMs.toFixed(3)} ms | ` +
        `fillet kernel op: ${filletMs.toFixed(3)} ms | ` +
        `ratio: ${(resolveMs / filletMs).toFixed(2)}`
    );
  });
});
