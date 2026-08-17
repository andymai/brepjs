/**
 * Spike B — can a profile be pure data?
 *
 * Falsifiable checks:
 *  1. Contour (plain-data Segment2D list) -> Wire -> Face through the kernel,
 *     with analytic area oracles per segment kind (Line, Arc, Bezier, EllipseArc).
 *  2. Zero handles in the tree: the contour JSON round-trips deep-equal.
 *  3. Hashability: identical contours hash identically, edits change the hash
 *     (same FNV machinery the IR builders use).
 *  4. Holes are first-class: RECTANGLE_HOLLOW area = outer - inner.
 *  5. Blueprint -> Contour bridge probe: roundedRectangleBlueprint -> toSVGPathD
 *     -> parse -> Contour -> Face matches the analytic area.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import { unwrap, measureArea, roundedRectangleBlueprint } from '@/index.js';
import type { Face } from '@/core/shapeTypes.js';
import { contourToFace, hashContour, blueprintToContour, type Contour } from './profileSpike.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// Profile faces are B-rep constructs; the manifold preview kernel has no
// edge/wire/face vocabulary (same skip class as Spike A's extrude tests).
const itBrep = it.skipIf(currentKernel === 'manifold');

function area(f: Face): number {
  return unwrap(measureArea(f));
}

const rect = (w: number, h: number, x0 = 0, y0 = 0): Contour => ({
  start: [x0, y0],
  segments: [
    { kind: 'Line', to: [x0 + w, y0] },
    { kind: 'Line', to: [x0 + w, y0 + h] },
    { kind: 'Line', to: [x0, y0 + h] },
    { kind: 'Line', to: [x0, y0] },
  ],
});

describe('Spike B — Contour as pure data', () => {
  it('is pure data: JSON round-trips deep-equal, no handles anywhere', () => {
    const c = rect(40, 30);
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it('hashes stably and distinguishes edits', () => {
    const a = hashContour(rect(40, 30));
    const b = hashContour(rect(40, 30));
    const edited = hashContour(rect(40, 30.5));
    expect(a).toBe(b);
    expect(a).not.toBe(edited);
  });

  itBrep('RECTANGULAR: line contour -> face with exact area', () => {
    using f = unwrap(contourToFace(rect(40, 30)));
    expect(area(f)).toBeCloseTo(1200, 1);
  });

  itBrep('CIRCULAR: two half-arcs -> face with area pi*r^2', () => {
    const r = 15;
    const circle: Contour = {
      start: [-r, 0],
      segments: [
        { kind: 'Arc', to: [r, 0], radius: r, largeArc: false, clockwise: false },
        { kind: 'Arc', to: [-r, 0], radius: r, largeArc: false, clockwise: false },
      ],
    };
    using f = unwrap(contourToFace(circle));
    expect(area(f)).toBeCloseTo(Math.PI * r * r, 1);
  });

  itBrep('stadium: lines + quarter/half arcs mix with exact area', () => {
    // 40x20 rectangle capped by two half-circles of r=10 on the short sides.
    const stadium: Contour = {
      start: [0, 0],
      segments: [
        { kind: 'Line', to: [40, 0] },
        { kind: 'Arc', to: [40, 20], radius: 10, largeArc: false, clockwise: false },
        { kind: 'Line', to: [0, 20] },
        { kind: 'Arc', to: [0, 0], radius: 10, largeArc: false, clockwise: false },
      ],
    };
    using f = unwrap(contourToFace(stadium));
    expect(area(f)).toBeCloseTo(40 * 20 + Math.PI * 100, 1);
  });

  itBrep('I_BEAM: 12-segment line contour with exact area', () => {
    // Flanges 100x10 top+bottom, web 6 wide, total height 100.
    const fw = 100;
    const ft = 10;
    const wt = 6;
    const h = 100;
    const wx0 = (fw - wt) / 2;
    const wx1 = (fw + wt) / 2;
    const iBeam: Contour = {
      start: [0, 0],
      segments: [
        { kind: 'Line', to: [fw, 0] },
        { kind: 'Line', to: [fw, ft] },
        { kind: 'Line', to: [wx1, ft] },
        { kind: 'Line', to: [wx1, h - ft] },
        { kind: 'Line', to: [fw, h - ft] },
        { kind: 'Line', to: [fw, h] },
        { kind: 'Line', to: [0, h] },
        { kind: 'Line', to: [0, h - ft] },
        { kind: 'Line', to: [wx0, h - ft] },
        { kind: 'Line', to: [wx0, ft] },
        { kind: 'Line', to: [0, ft] },
        { kind: 'Line', to: [0, 0] },
      ],
    };
    using f = unwrap(contourToFace(iBeam));
    expect(area(f)).toBeCloseTo(2 * fw * ft + wt * (h - 2 * ft), 1);
  });

  itBrep('ELLIPSE: two ellipse-arc halves -> area pi*a*b', () => {
    const a = 30;
    const b = 20;
    const ellipse: Contour = {
      start: [a, 0],
      segments: [
        {
          kind: 'EllipseArc',
          to: [-a, 0],
          radii: [a, b],
          rotation: 0,
          largeArc: false,
          clockwise: false,
        },
        {
          kind: 'EllipseArc',
          to: [a, 0],
          radii: [a, b],
          rotation: 0,
          largeArc: false,
          clockwise: false,
        },
      ],
    };
    using f = unwrap(contourToFace(ellipse));
    expect(area(f)).toBeCloseTo(Math.PI * a * b, 1);
  });

  itBrep('rotated EllipseArc: area is rotation-invariant', () => {
    const a = 30;
    const b = 20;
    const phi = Math.PI / 6;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    // Endpoints of the major axis, rotated by phi.
    const p: [number, number] = [a * c, a * s];
    const q: [number, number] = [-a * c, -a * s];
    const rotated: Contour = {
      start: p,
      segments: [
        {
          kind: 'EllipseArc',
          to: q,
          radii: [a, b],
          rotation: phi,
          largeArc: false,
          clockwise: false,
        },
        {
          kind: 'EllipseArc',
          to: p,
          radii: [a, b],
          rotation: phi,
          largeArc: false,
          clockwise: false,
        },
      ],
    };
    using f = unwrap(contourToFace(rotated));
    expect(area(f)).toBeCloseTo(Math.PI * a * b, 1);
  });

  itBrep('Bezier: quadratic bulge with exact pole-area (w*P/3)', () => {
    // Rectangle 40x10 whose top edge bulges up as a quadratic bezier with
    // control POLE 15 above the chord. Analytic: bulge area = w*P/3 = 200.
    const arch: Contour = {
      start: [0, 0],
      segments: [
        { kind: 'Line', to: [40, 0] },
        { kind: 'Line', to: [40, 10] },
        { kind: 'Bezier', controls: [[20, 25]], to: [0, 10] },
        { kind: 'Line', to: [0, 0] },
      ],
    };
    using f = unwrap(contourToFace(arch));
    expect(area(f)).toBeCloseTo(400 + (40 * 15) / 3, 1);
  });

  itBrep('RECTANGLE_HOLLOW: hole contour subtracts exactly', () => {
    using f = unwrap(contourToFace(rect(60, 40), [rect(40, 20, 10, 10)]));
    expect(area(f)).toBeCloseTo(60 * 40 - 40 * 20, 1);
  });
});

describe('Spike B — Blueprint -> Contour bridge probe', () => {
  itBrep('roundedRectangleBlueprint curves -> Contour -> Face matches analytic area', () => {
    const bp = roundedRectangleBlueprint(40, 30, 5);
    const contour = unwrap(blueprintToContour(bp.curves));
    // Pure data after the bridge: JSON round-trips deep-equal.
    expect(JSON.parse(JSON.stringify(contour))).toEqual(contour);
    using f = unwrap(contourToFace(contour));
    // Rounded rectangle: w*h - (4 - pi) * r^2
    expect(area(f)).toBeCloseTo(40 * 30 - (4 - Math.PI) * 25, 1);
  });
});
