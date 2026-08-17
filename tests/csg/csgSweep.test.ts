/**
 * Sweep node — Pappus-theorem volume goldens (square torus, straight prism,
 * arc bend), Edge and Wire spines, frenet hashing, parametric cache reuse,
 * serialization round-trip (including the CSG_VERSION 1 -> 2 range), optimizer
 * folding, tree editing, and error paths.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  box,
  polygon,
  line,
  path,
  lineTo,
  arcTo,
  sweep,
  param,
  optimize,
  outputKindOf,
  toJSON,
  fromJSON,
  replaceNode,
  Evaluator,
  CSG_VERSION,
} from '@/csg/index.js';
import { isOk, unwrap, measureVolume } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

// The manifold preview kernel is mesh-CSG only; B-rep sweeping is out of its
// scope (same divergence class as the other feature-node tests).
const itBrep = it.skipIf(currentKernel === 'manifold');

/** Square profile (side s) in the XY plane centered at the origin. */
function squareXY(s: number) {
  const h = s / 2;
  return polygon([
    [-h, -h, 0],
    [h, -h, 0],
    [h, h, 0],
    [-h, h, 0],
  ]);
}

/** Square profile (side s) in the XZ plane centered at (cx, 0, 0). */
function squareXZ(s: number, cx: number) {
  const h = s / 2;
  return polygon([
    [cx - h, 0, -h],
    [cx + h, 0, -h],
    [cx + h, 0, h],
    [cx - h, 0, h],
  ]);
}

describe('Sweep node', () => {
  it('reports Solid output kind', () => {
    expect(outputKindOf(sweep(squareXY(10), line([0, 0, 0], [0, 0, 50])))).toBe('Solid');
  });

  it('canonicalizes the frenet default into the hash', () => {
    const mk = () => sweep(squareXY(10), line([0, 0, 0], [0, 0, 50]));
    expect(mk().structuralHash).toBe(
      sweep(squareXY(10), line([0, 0, 0], [0, 0, 50]), { frenet: false }).structuralHash
    );
    expect(mk().structuralHash).not.toBe(
      sweep(squareXY(10), line([0, 0, 0], [0, 0, 50]), { frenet: true }).structuralHash
    );
  });

  itBrep('straight Line spine (an Edge producer) sweeps to an exact prism', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(sweep(squareXY(10), line([0, 0, 0], [0, 0, 50])));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(10 * 10 * 50, 0);
  });

  itBrep('straight Path spine (a Wire producer) sweeps to an exact prism', () => {
    using ev = new Evaluator();
    // Path lies in the XY plane, so the profile sits in XZ at the path start.
    const spine = path([0, 0], [lineTo([0, 60])]);
    const r = ev.evaluate(sweep(squareXZ(10, 0), spine));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(10 * 10 * 60, 0);
  });

  itBrep('quarter-arc Path spine bends by Pappus (A * R * pi/2)', () => {
    using ev = new Evaluator();
    // Quarter circle from (40,0) to (0,40) about the origin, ccw, r=40.
    const spine = path([40, 0], [arcTo([0, 40], 40)]);
    const r = ev.evaluate(sweep(squareXZ(10, 40), spine));
    expect(isOk(r)).toBe(true);
    const expected = 10 * 10 * 40 * (Math.PI / 2);
    if (currentKernel.startsWith('occt')) {
      expect(vol(unwrap(r))).toBeCloseTo(expected, -1);
    } else {
      // brepkit's pipe sweep approximates arc spines (~1.1% volume drift).
      expect(Math.abs(vol(unwrap(r)) - expected) / expected).toBeLessThan(0.015);
    }
  });

  itBrep('parametric spine length: profile subtree hits the cache', () => {
    using ev = new Evaluator();
    const node = sweep(squareXZ(10, 0), path([0, 0], [lineTo([0, param('l')])]));
    expect(vol(unwrap(ev.evaluate(node, { l: 50 })))).toBeCloseTo(5000, 0);
    const s1 = ev.cacheStats();
    expect(vol(unwrap(ev.evaluate(node, { l: 80 })))).toBeCloseTo(8000, 0);
    const s2 = ev.cacheStats();
    // The Path and the Sweep re-evaluate; the profile Polygon hits.
    expect(s2.misses - s1.misses).toBe(2);
    expect(s2.hits - s1.hits).toBe(1);
  });

  it('serialize round-trip preserves the structural hash', () => {
    const node = sweep(squareXZ(10, 0), path([0, 0], [lineTo([0, param('l')])]), {
      frenet: true,
    });
    const back = fromJSON(toJSON(node));
    expect(isOk(back)).toBe(true);
    expect(unwrap(back).structuralHash).toBe(node.structuralHash);
  });

  it('fromJSON accepts the previous envelope version and rejects future ones', () => {
    expect(CSG_VERSION).toBe(2);
    const envelope = JSON.parse(JSON.stringify(toJSON(box(1, 2, 3)))) as {
      csgVersion: number;
    };
    envelope.csgVersion = 1;
    expect(isOk(fromJSON(envelope))).toBe(true);
    envelope.csgVersion = CSG_VERSION + 1;
    expect(isOk(fromJSON(envelope))).toBe(false);
  });

  it('optimize() preserves Sweep and recurses into both children', () => {
    const node = sweep(squareXY(10), line([0, 0, 0], [0, 0, 50]), { frenet: true });
    const opt = optimize(node);
    expect(opt.kind).toBe('Sweep');
    expect(opt.structuralHash).toBe(node.structuralHash);
  });

  it('replaceNode rebuilds through Sweep', () => {
    const node = sweep(squareXY(10), line([0, 0, 0], [0, 0, 50]));
    const longer = replaceNode(node, (n) => n.kind === 'Line', line([0, 0, 0], [0, 0, 90]));
    expect(longer.kind).toBe('Sweep');
    expect(longer.structuralHash).not.toBe(node.structuralHash);
    expect(longer.structuralHash).toBe(
      sweep(squareXY(10), line([0, 0, 0], [0, 0, 90])).structuralHash
    );
  });

  it('rejects a non-face profile with a Result error', () => {
    using ev = new Evaluator();
    expect(isOk(ev.evaluate(sweep(box(5, 5, 5), line([0, 0, 0], [0, 0, 50]))))).toBe(false);
  });

  it('rejects a non-curve spine with a Result error', () => {
    using ev = new Evaluator();
    expect(isOk(ev.evaluate(sweep(squareXY(10), box(5, 5, 5))))).toBe(false);
  });
});
