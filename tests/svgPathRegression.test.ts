/**
 * SVG path emission regression — toSVGPathD mirrors the blueprint (SVG
 * y-flip) before emitting, which historically point-reflected every trimmed
 * arc's endpoints through its center (the path never closed), and arc flags
 * were derived from trim bounds that occt-wasm reports normalized.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { roundedRectangleBlueprint } from '@/2d/blueprints/cannedBlueprints.js';
import { adaptedCurveToPathElem } from '@/2d/lib/svgPath.js';
import { approximateAsSvgCompatibleCurve } from '@/2d/lib/approximations.js';
import { make2dCircle, make2dEllipseArc } from '@/2d/lib/makeCurves.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? NaN) - (b[0] ?? NaN), (a[1] ?? NaN) - (b[1] ?? NaN));
}

describe('toSVGPathD', () => {
  it('mirrored blueprint curves chain and close', () => {
    const mirrored = roundedRectangleBlueprint(40, 30, 5).clone().mirror([1, 0], [0, 0], 'plane');
    const curves = mirrored.curves;
    for (let i = 1; i < curves.length; i++) {
      const prev = curves[i - 1];
      const cur = curves[i];
      if (!prev || !cur) throw new Error('missing curve');
      expect(dist(cur.firstPoint, prev.lastPoint), `joint ${i}`).toBeLessThan(1e-6);
    }
    const first = curves[0];
    const last = curves[curves.length - 1];
    if (!first || !last) throw new Error('missing curve');
    expect(dist(first.firstPoint, last.lastPoint)).toBeLessThan(1e-6);
  });

  it('emits a path that returns to its start point', () => {
    const d = roundedRectangleBlueprint(40, 30, 5).toSVGPathD();
    const tokens = d.replace(/Z\s*$/, '').trim().split(/\s+/);
    const mx = Number(tokens[1]);
    const my = Number(tokens[2]);
    const lastX = Number(tokens[tokens.length - 2]);
    const lastY = Number(tokens[tokens.length - 1]);
    expect(Number.isFinite(mx) && Number.isFinite(lastX)).toBe(true);
    expect(dist([lastX, lastY], [mx, my])).toBeLessThan(1e-4);
  });

  it('a 270-degree arc gets the large-arc flag from geometry, not trim bounds', () => {
    const circle = make2dCircle(5);
    // The [PI/2, 2*PI] piece spans 270 degrees.
    const arc = circle.splitAt([Math.PI / 2])[1];
    if (!arc) throw new Error('no split piece');
    const elem = adaptedCurveToPathElem(arc, arc.lastPoint);
    const flags = elem.trim().split(/\s+/);
    // A rx ry rot largeArc sweep x y
    expect(flags[0]).toBe('A');
    expect(flags[4]).toBe('1');
  });

  it('a 270-degree ellipse arc gets the large-arc flag from geometry, not trim bounds', () => {
    const arc = make2dEllipseArc(10, 5, Math.PI / 2, 2 * Math.PI, [0, 0], [1, 0]);
    const elem = adaptedCurveToPathElem(arc, arc.lastPoint);
    const flags = elem.trim().split(/\s+/);
    // A rx ry rot largeArc sweep x y
    expect(flags[0]).toBe('A');
    expect(flags[4]).toBe('1');
  });

  it('a 90-degree ellipse arc keeps the small-arc flag', () => {
    const arc = make2dEllipseArc(10, 5, 0, Math.PI / 2, [0, 0], [1, 0]);
    const elem = adaptedCurveToPathElem(arc, arc.lastPoint);
    const flags = elem.trim().split(/\s+/);
    expect(flags[0]).toBe('A');
    expect(flags[4]).toBe('0');
  });

  it('a rotated-frame 270-degree ellipse arc keeps the large-arc flag', () => {
    const arc = make2dEllipseArc(10, 5, Math.PI / 2, 2 * Math.PI, [0, 0], [0, 1]);
    const elem = adaptedCurveToPathElem(arc, arc.lastPoint);
    const flags = elem.trim().split(/\s+/);
    expect(flags[0]).toBe('A');
    expect(flags[4]).toBe('1');
  });

  it('splits a closed circle at the true parametric midpoint (antipodal halves)', () => {
    const pieces = approximateAsSvgCompatibleCurve([make2dCircle(5)]);
    expect(pieces.length).toBe(2);
    for (const p of pieces) {
      expect(dist(p.firstPoint, p.lastPoint)).toBeCloseTo(10, 5);
    }
  });
});
