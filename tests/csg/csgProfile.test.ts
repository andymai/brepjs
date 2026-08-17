/**
 * Profile node — exact face areas for every segment kind, first-class holes,
 * auto-close semantics, profile+extrude/revolve composition, parametric cache
 * reuse, serialization round-trip (CSG_VERSION 3), optimizer folding, and
 * builder immutability.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import {
  box,
  profile,
  contour,
  lineTo,
  arcTo,
  bezierTo,
  ellipseArcTo,
  extrude,
  revolve,
  sweep,
  rotate,
  path,
  param,
  optimize,
  outputKindOf,
  toJSON,
  fromJSON,
  Evaluator,
  CSG_VERSION,
  add,
  numLit,
  type Contour,
} from '@/csg/index.js';
import { isOk, unwrap, measureArea, measureVolume } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function area(s: AnyShape<Dimension>): number {
  return unwrap(measureArea(s));
}

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

// The manifold preview kernel is mesh-CSG only; B-rep faces are out of its
// scope (same divergence class as the other feature-node tests).
const itBrep = it.skipIf(currentKernel === 'manifold');

// Rotated ellipse arcs need edge relocation, which brepkit lacks (surfaces as
// a Result error by design) — occt kernels only.
const itOcct = it.skipIf(!currentKernel.startsWith('occt'));

/** w x h rectangle contour with its lower-left corner at (x0, y0). Leaves the
 *  final closing segment to auto-close. */
function rect(w: number, h: number, x0 = 0, y0 = 0): Contour {
  return contour([x0, y0], [lineTo([x0 + w, y0]), lineTo([x0 + w, y0 + h]), lineTo([x0, y0 + h])]);
}

describe('Profile node', () => {
  it('reports Face output kind', () => {
    expect(outputKindOf(profile(rect(40, 30)))).toBe('Face');
  });

  itBrep('RECTANGULAR: line contour with exact area (auto-closed)', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(profile(rect(40, 30)));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(1200, 1);
  });

  itBrep('near-closed contour (sub-tolerance gap) still closes', () => {
    using ev = new Evaluator();
    // Ends 5e-7 short of the start: too far apart for wire closure, small
    // enough that a fixed auto-close threshold above EPS would skip it.
    const c = contour(
      [0, 0],
      [lineTo([40, 0]), lineTo([40, 30]), lineTo([0, 30]), lineTo([0, 5e-7])]
    );
    const r = ev.evaluate(profile(c));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(1200, 1);
  });

  itBrep('explicit closing segment produces the same face', () => {
    using ev = new Evaluator();
    const explicit = contour(
      [0, 0],
      [lineTo([40, 0]), lineTo([40, 30]), lineTo([0, 30]), lineTo([0, 0])]
    );
    const r = ev.evaluate(profile(explicit));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(1200, 1);
  });

  itBrep('CIRCULAR: two half-arcs with area pi*r^2', () => {
    using ev = new Evaluator();
    const c = contour([-15, 0], [arcTo([15, 0], 15), arcTo([-15, 0], 15)]);
    const r = ev.evaluate(profile(c));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(Math.PI * 225, 1);
  });

  itBrep('stadium: lines + arcs with exact area', () => {
    using ev = new Evaluator();
    const c = contour(
      [0, 0],
      [lineTo([40, 0]), arcTo([40, 20], 10), lineTo([0, 20]), arcTo([0, 0], 10)]
    );
    const r = ev.evaluate(profile(c));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(40 * 20 + Math.PI * 100, 1);
  });

  itBrep('I_BEAM: 12-segment outline with exact area', () => {
    using ev = new Evaluator();
    const fw = 100;
    const ft = 10;
    const wt = 6;
    const h = 100;
    const wx0 = (fw - wt) / 2;
    const wx1 = (fw + wt) / 2;
    const c = contour(
      [0, 0],
      [
        lineTo([fw, 0]),
        lineTo([fw, ft]),
        lineTo([wx1, ft]),
        lineTo([wx1, h - ft]),
        lineTo([fw, h - ft]),
        lineTo([fw, h]),
        lineTo([0, h]),
        lineTo([0, h - ft]),
        lineTo([wx0, h - ft]),
        lineTo([wx0, ft]),
        lineTo([0, ft]),
      ]
    );
    const r = ev.evaluate(profile(c));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(2 * fw * ft + wt * (h - 2 * ft), 1);
  });

  itOcct('rotated ELLIPSE: two rotated ellipse-arc halves with area pi*a*b', () => {
    using ev = new Evaluator();
    const a = 30;
    const b = 20;
    const phi = 30;
    const rad = (phi * Math.PI) / 180;
    const p: [number, number] = [a * Math.cos(rad), a * Math.sin(rad)];
    const q: [number, number] = [-p[0], -p[1]];
    const c = contour(p, [
      ellipseArcTo(q, [a, b], { rotation: phi }),
      ellipseArcTo(p, [a, b], { rotation: phi }),
    ]);
    const r = ev.evaluate(profile(c));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(Math.PI * a * b, 1);
  });

  itBrep('Bezier: quadratic bulge with exact pole-area (w*P/3)', () => {
    using ev = new Evaluator();
    const c = contour([0, 0], [lineTo([40, 0]), lineTo([40, 10]), bezierTo([[20, 25]], [0, 10])]);
    const r = ev.evaluate(profile(c));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(400 + (40 * 15) / 3, 1);
  });

  itBrep('RECTANGLE_HOLLOW: first-class holes subtract exactly', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(profile(rect(60, 40), [rect(40, 20, 10, 10)]));
    expect(isOk(r)).toBe(true);
    expect(area(unwrap(r))).toBeCloseTo(60 * 40 - 40 * 20, 1);
  });

  itBrep('wall: profile + extrude composes with exact volume', () => {
    using ev = new Evaluator();
    const wall = extrude(profile(rect(4000, 200)), [0, 0, 2700]);
    const r = ev.evaluate(wall);
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(4000 * 200 * 2700, 0);
  });

  itBrep('washer: profile + revolve composes with exact volume', () => {
    using ev = new Evaluator();
    // Rectangle x in [10, 20] revolved around Z: pi*(R^2 - r^2)*h.
    // Profile is in XY; rotate it into XZ via the revolve default frame by
    // building the contour in XY and sweeping around the Y axis instead:
    // revolve about the Y axis at origin with the profile in the XY plane.
    const washer = revolve(profile(rect(10, 30, 10, 0)), 360, { axis: [0, 1, 0] });
    const r = ev.evaluate(washer);
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(Math.PI * (400 - 100) * 30, 0);
  });

  itBrep('pipe: profile + sweep along a path composes (profile rotated out of plane)', () => {
    using ev = new Evaluator();
    // Profiles and Path spines both live in the XY plane, so a sweep needs
    // the profile rotated perpendicular to the spine tangent first.
    const sq = profile(contour([-5, -5], [lineTo([5, -5]), lineTo([5, 5]), lineTo([-5, 5])]));
    const positioned = rotate(sq, -90, { axis: [1, 0, 0] });
    const r = ev.evaluate(sweep(positioned, path([0, 0], [lineTo([0, 60])])));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(10 * 10 * 60, 0);
  });

  itBrep('parametric width: only the profile and its consumers re-evaluate', () => {
    using ev = new Evaluator();
    const node = extrude(
      profile(
        contour([0, 0], [lineTo([param('w'), 0]), lineTo([param('w'), 30]), lineTo([0, 30])])
      ),
      [0, 0, 10]
    );
    expect(vol(unwrap(ev.evaluate(node, { w: 40 })))).toBeCloseTo(12000, 0);
    const s1 = ev.cacheStats();
    expect(vol(unwrap(ev.evaluate(node, { w: 80 })))).toBeCloseTo(24000, 0);
    const s2 = ev.cacheStats();
    // Profile and Extrude both depend on w: two misses, no hits.
    expect(s2.misses - s1.misses).toBe(2);
    expect(s2.hits - s1.hits).toBe(0);
  });

  it('serialize round-trip preserves the structural hash (holes + params)', () => {
    const node = profile(
      contour(
        [0, 0],
        [
          lineTo([param('w'), 0]),
          arcTo([40, 20], add(param('r'), numLit(2)), { largeArc: true }),
          ellipseArcTo([0, 0], [30, 20], { rotation: 15, clockwise: true }),
        ]
      ),
      [rect(10, 5, 5, 5)]
    );
    const back = fromJSON(toJSON(node));
    expect(isOk(back)).toBe(true);
    expect(unwrap(back).structuralHash).toBe(node.structuralHash);
  });

  it('envelope version is 3; versions 1..3 load, 4 rejects', () => {
    expect(CSG_VERSION).toBe(3);
    const envelope = JSON.parse(JSON.stringify(toJSON(box(1, 2, 3)))) as {
      csgVersion: number;
    };
    for (const v of [1, 2, 3]) {
      envelope.csgVersion = v;
      expect(isOk(fromJSON(envelope))).toBe(true);
    }
    envelope.csgVersion = 4;
    expect(isOk(fromJSON(envelope))).toBe(false);
  });

  it('optimize() folds expressions inside the contour', () => {
    const node = profile(contour([0, 0], [arcTo([40, 0], add(numLit(15), numLit(5)))]));
    const opt = optimize(node);
    expect(opt.kind).toBe('Profile');
    expect(opt.structuralHash).toBe(profile(contour([0, 0], [arcTo([40, 0], 20)])).structuralHash);
  });

  it('copies the holes array at construction', () => {
    const holes = [rect(5, 5, 1, 1)];
    const node = profile(rect(40, 30), holes);
    holes.push(rect(5, 5, 20, 20));
    expect(node.holes).toHaveLength(1);
    expect(node.structuralHash).toBe(profile(rect(40, 30), [rect(5, 5, 1, 1)]).structuralHash);
  });

  it('rejects an empty contour with a Result error', () => {
    using ev = new Evaluator();
    expect(isOk(ev.evaluate(profile(contour([0, 0], []))))).toBe(false);
  });
});
