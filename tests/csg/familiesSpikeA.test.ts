/**
 * Spike A — does the node union extend cleanly? Vehicle: an Extrude node.
 *
 * Falsifiable checks:
 *  1. Golden value: Extrude(Polygon) materializes a solid with exact volume.
 *  2. Parametric: extrusion vector via param(); env change re-evaluates only
 *     the affected node (profile subtree hits cache).
 *  3. Serialize round-trip: toJSON -> fromJSON -> identical structuralHash.
 *  4. optimize() preserves the node (expression folding applies).
 *  5. replaceNode rebuilds through Extrude (edit.ts coverage).
 *  6. outputKindOf(Extrude) === 'Solid'.
 *
 * The consumer-walk record (compile-forced vs silently-skippable) lives in the
 * vault tasks doc; this file is the runtime half of the evidence.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  box,
  cut,
  polygon,
  extrude,
  translate,
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

// The manifold preview kernel is mesh-CSG only; B-rep face extrusion is out of
// its scope (same divergence class as csgTranslationMesh's occt-only tests).
const itBrep = it.skipIf(currentKernel === 'manifold');

/** 40 x 30 rectangle in the XY plane. */
function rectProfile() {
  return polygon([
    [0, 0, 0],
    [40, 0, 0],
    [40, 30, 0],
    [0, 30, 0],
  ]);
}

describe('Spike A — Extrude node', () => {
  it('reports Solid output kind', () => {
    expect(outputKindOf(extrude(rectProfile(), [0, 0, 10]))).toBe('Solid');
  });

  itBrep('materializes with exact volume (40*30*10)', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(extrude(rectProfile(), [0, 0, 10]));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(12000, 0);
  });

  itBrep('composes with booleans and transforms (bracket-ish)', () => {
    using ev = new Evaluator();
    const slab = extrude(rectProfile(), [0, 0, 10]);
    const hole = translate(box(10, 10, 20), [5, 5, -5]);
    const r = ev.evaluate(translate(cut(slab, hole), [100, 0, 0]));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(12000 - 10 * 10 * 10, 0);
  });

  itBrep('parametric height: profile subtree hits cache across env edits', () => {
    using ev = new Evaluator();
    const node = extrude(rectProfile(), [0, 0, param('h')]);
    expect(vol(unwrap(ev.evaluate(node, { h: 10 })))).toBeCloseTo(12000, 0);
    const s1 = ev.cacheStats();
    expect(vol(unwrap(ev.evaluate(node, { h: 20 })))).toBeCloseTo(24000, 0);
    const s2 = ev.cacheStats();
    // Only the Extrude node re-evaluates; the Polygon profile has no free
    // params, so its projected env is unchanged -> cache hit.
    expect(s2.misses - s1.misses).toBe(1);
    expect(s2.hits - s1.hits).toBe(1);
  });

  it('serialize round-trip preserves the structural hash', () => {
    const node = extrude(rectProfile(), [0, 0, add(param('h'), numLit(2))]);
    const back = fromJSON(toJSON(node));
    expect(isOk(back)).toBe(true);
    expect(unwrap(back).structuralHash).toBe(node.structuralHash);
  });

  it('optimize() folds expressions inside Extrude', () => {
    const node = extrude(rectProfile(), [0, 0, add(numLit(4), numLit(6))]);
    const opt = optimize(node);
    expect(opt.kind).toBe('Extrude');
    // Folding (4+6) -> 10 must land on the same hash as writing 10 directly.
    expect(opt.structuralHash).toBe(extrude(rectProfile(), [0, 0, 10]).structuralHash);
  });

  it('replaceNode rebuilds through Extrude', () => {
    const node = extrude(rectProfile(), [0, 0, 10]);
    const swapped = replaceNode(node, (n) => n.kind === 'Polygon', rectProfile());
    expect(swapped.structuralHash).toBe(node.structuralHash);
    const bigger = replaceNode(
      node,
      (n) => n.kind === 'Polygon',
      polygon([
        [0, 0, 0],
        [80, 0, 0],
        [80, 30, 0],
        [0, 30, 0],
      ])
    );
    expect(bigger.structuralHash).not.toBe(node.structuralHash);
  });

  it('rejects a non-face profile at evaluation with a Result error', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(extrude(box(10, 10, 10), [0, 0, 5]));
    expect(isOk(r)).toBe(false);
  });
});
