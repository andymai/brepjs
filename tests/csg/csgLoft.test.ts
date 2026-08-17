/**
 * Loft node — golden-value lofts (prism, frustum), ruled flag canonicalization,
 * parametric cache reuse, serialization round-trip, optimizer folding, and
 * tree editing.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  box,
  polygon,
  loft,
  param,
  optimize,
  outputKindOf,
  toJSON,
  fromJSON,
  replaceNode,
  Evaluator,
} from '@/csg/index.js';
import { isOk, unwrap, measureVolume } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

// The manifold preview kernel is mesh-CSG only; B-rep lofting is out of its
// scope (same divergence class as the Extrude/Revolve tests).
const itBrep = it.skipIf(currentKernel === 'manifold');

/** Axis-aligned rectangle centered on the Z axis at height z. */
function rectAt(z: number, halfX: number, halfY: number) {
  return polygon([
    [-halfX, -halfY, z],
    [halfX, -halfY, z],
    [halfX, halfY, z],
    [-halfX, halfY, z],
  ]);
}

describe('Loft node', () => {
  it('reports Solid output kind', () => {
    expect(outputKindOf(loft([rectAt(0, 20, 15), rectAt(20, 20, 15)]))).toBe('Solid');
  });

  it('canonicalizes the ruled default into the hash', () => {
    const sections = () => [rectAt(0, 20, 15), rectAt(20, 20, 15)];
    expect(loft(sections()).structuralHash).toBe(loft(sections(), { ruled: true }).structuralHash);
    expect(loft(sections()).structuralHash).not.toBe(
      loft(sections(), { ruled: false }).structuralHash
    );
  });

  itBrep('two identical sections loft to a prism with exact volume', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(loft([rectAt(0, 20, 15), rectAt(20, 20, 15)]));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(40 * 30 * 20, 0);
  });

  itBrep('centered square sections loft to an exact pyramid frustum', () => {
    using ev = new Evaluator();
    // 40x40 -> 20x20 over height 30: V = h/3 * (A1 + A2 + sqrt(A1*A2)) = 28000.
    const r = ev.evaluate(loft([rectAt(0, 20, 20), rectAt(30, 10, 10)]));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(28000, 0);
  });

  itBrep('parametric top section: only the affected nodes re-evaluate', () => {
    using ev = new Evaluator();
    const node = loft([rectAt(0, 20, 20), rectAt(param('h'), 10, 10)]);
    expect(isOk(ev.evaluate(node, { h: 30 }))).toBe(true);
    const s1 = ev.cacheStats();
    expect(isOk(ev.evaluate(node, { h: 60 }))).toBe(true);
    const s2 = ev.cacheStats();
    // Bottom section hits; top section and the Loft node re-evaluate.
    expect(s2.misses - s1.misses).toBe(2);
    expect(s2.hits - s1.hits).toBe(1);
  });

  it('serialize round-trip preserves the structural hash', () => {
    for (const node of [
      loft([rectAt(0, 20, 15), rectAt(param('h'), 20, 15)]),
      loft([rectAt(0, 20, 15), rectAt(10, 15, 10), rectAt(20, 5, 5)], { ruled: false }),
    ]) {
      const back = fromJSON(toJSON(node));
      expect(isOk(back)).toBe(true);
      expect(unwrap(back).structuralHash).toBe(node.structuralHash);
    }
  });

  it('optimize() preserves Loft and its ruled flag', () => {
    const node = loft([rectAt(0, 20, 15), rectAt(20, 20, 15)], { ruled: false });
    const opt = optimize(node);
    expect(opt.kind).toBe('Loft');
    expect(opt.structuralHash).toBe(node.structuralHash);
  });

  it('replaceNode rebuilds through Loft', () => {
    const node = loft([rectAt(0, 20, 15), rectAt(20, 20, 15)]);
    const swapped = replaceNode(node, (n) => n.kind === 'Polygon', rectAt(0, 20, 15));
    // Both sections match the predicate and become the same polygon; the
    // structure changes but the rebuild must stay a Loft of two sections.
    expect(swapped.kind).toBe('Loft');
    expect(swapped.structuralHash).not.toBe(node.structuralHash);
  });

  it('rejects fewer than two sections with a Result error', () => {
    using ev = new Evaluator();
    expect(isOk(ev.evaluate(loft([rectAt(0, 20, 15)])))).toBe(false);
  });

  it('rejects a non-face section at evaluation with a Result error', () => {
    using ev = new Evaluator();
    expect(isOk(ev.evaluate(loft([rectAt(0, 20, 15), box(10, 10, 10)])))).toBe(false);
  });
});
