import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { polygon, outerWire, unwrap } from 'brepjs';
import { authorPart as author } from '../src/authorFns.js';
import { unfold } from '../src/unfoldFns.js';
import { nest, nestToDXF } from '../src/nestFns.js';
import {
  wireToPolygon,
  transformPolygon,
  polygonsOverlap,
  polygonsOverlapWithClearance,
  segmentsIntersect,
  type Polygon,
} from '../src/polygonFns.js';
import type { AuthorSpec } from '../src/authorFns.js';
import type { FlatPattern } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

/**
 * A clean tessellating L-shaped (concave) flat pattern: a 40×40 outer square with a
 * 20×20 notch removed at the far (top-right) corner, so two of them — one rotated
 * 180° — interlock into a 40×60 rectangle with no waste. Built straight from a
 * polygon outline so the geometry is exact and deterministic (no bend-allowance
 * arithmetic), which is what the interlocking-win and non-overlap proofs need.
 */
function lPart(): FlatPattern {
  const pts: [number, number, number][] = [
    [0, 0, 0],
    [40, 0, 0],
    [40, 20, 0],
    [20, 20, 0],
    [20, 40, 0],
    [0, 40, 0],
  ];
  const wire = outerWire(unwrap(polygon(pts)));
  return {
    outline: wire,
    bendLines: [],
    holes: [],
    formCuts: [],
    formMarkers: [],
    formHinges: [],
    loftedDevelopments: [],
    developedArea: 1200,
  };
}

/** A plain rectangular blank (its outline is exactly length×width). */
function flatBlank(length: number, width: number): FlatPattern {
  const spec: AuthorSpec = { thickness: 1, base: { length, width }, flanges: [] };
  const authored = author(spec);
  if (!authored.ok) throw new Error(`author failed: ${authored.error.message}`);
  const unfolded = unfold(authored.value);
  if (!unfolded.ok) throw new Error(`unfold failed: ${unfolded.error.message}`);
  return unfolded.value.pattern;
}

/** The placed outline polygon of one placement, transformed onto the sheet. */
function placedPolygon(pattern: FlatPattern, x: number, y: number, rotationDeg: number): Polygon {
  const base = wireToPolygon(pattern.outline);
  if (!base.ok) throw new Error('wireToPolygon failed');
  // Anchor the rotated outline's bbox lower-left to (x, y), mirroring the packer.
  const rotated = transformPolygon(base.value, 0, 0, rotationDeg);
  let minX = Infinity;
  let minY = Infinity;
  for (const [px, py] of rotated) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
  }
  return transformPolygon(rotated, x - minX, y - minY, 0);
}

// ---------------------------------------------------------------------------
// Polygon-overlap predicate unit tests (the correctness backbone).
// ---------------------------------------------------------------------------

describe('polygon overlap predicate', () => {
  const square = (x: number, y: number, s: number): Polygon => [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
  ];

  it('segmentsIntersect: crossing, collinear, shared endpoint, disjoint', () => {
    // Proper crossing (an X).
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    // Collinear overlapping.
    expect(segmentsIntersect([0, 0], [10, 0], [5, 0], [15, 0])).toBe(true);
    // Shared endpoint (touching).
    expect(segmentsIntersect([0, 0], [5, 0], [5, 0], [5, 5])).toBe(true);
    // Disjoint, no touch.
    expect(segmentsIntersect([0, 0], [1, 0], [3, 3], [4, 4])).toBe(false);
    // Parallel, non-collinear.
    expect(segmentsIntersect([0, 0], [10, 0], [0, 1], [10, 1])).toBe(false);
  });

  it('overlap: crossing edges (interpenetrating squares)', () => {
    expect(polygonsOverlap(square(0, 0, 10), square(5, 5, 10))).toBe(true);
  });

  it('overlap: full containment (one inside the other, no edge crossing)', () => {
    expect(polygonsOverlap(square(0, 0, 20), square(5, 5, 5))).toBe(true);
    // Order-independent.
    expect(polygonsOverlap(square(5, 5, 5), square(0, 0, 20))).toBe(true);
  });

  it('no overlap: disjoint squares', () => {
    expect(polygonsOverlap(square(0, 0, 10), square(20, 20, 10))).toBe(false);
  });

  it('touching-but-not-overlapping shares an edge (reported as overlap by the raw predicate)', () => {
    // Edge-flush squares touch; the raw predicate is conservative and reports overlap.
    expect(polygonsOverlap(square(0, 0, 10), square(10, 0, 10))).toBe(true);
    // With a positive clearance, two squares separated by exactly a gap < clearance
    // are reported overlapping; a gap >= clearance is not.
    expect(polygonsOverlapWithClearance(square(0, 0, 10), square(12, 0, 10), 1)).toBe(false);
    expect(polygonsOverlapWithClearance(square(0, 0, 10), square(10.5, 0, 10), 1)).toBe(true);
  });

  it('clearance: disjoint parts within the gap are reported overlapping', () => {
    // 2 units apart, clearance 3 → too close.
    expect(polygonsOverlapWithClearance(square(0, 0, 10), square(12, 0, 10), 3)).toBe(true);
    // 5 units apart, clearance 3 → fine.
    expect(polygonsOverlapWithClearance(square(0, 0, 10), square(15, 0, 10), 3)).toBe(false);
  });

  it('concave (L) containment that bbox-only checking would miss', () => {
    // An L whose bounding box is 10×10 but whose notch (the [6,10]×[6,10] corner) is
    // empty. A small square placed in that notch does NOT overlap the L, even though
    // both bounding boxes overlap — the case true-shape nesting exploits.
    const lShape: Polygon = [
      [0, 0],
      [10, 0],
      [10, 6],
      [6, 6],
      [6, 10],
      [0, 10],
    ];
    const inNotch = square(6.5, 6.5, 3);
    expect(polygonsOverlap(lShape, inNotch)).toBe(false);
    // A square straddling the L's solid arm DOES overlap.
    const onArm = square(2, 2, 3);
    expect(polygonsOverlap(lShape, onArm)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// True-shape nesting integration.
// ---------------------------------------------------------------------------

describe('nest — true-shape (nfp)', () => {
  it('INTERLOCKING WIN: nfp utilization strictly beats bbox on L-shaped parts', () => {
    // Sheet 45×65: two Ls interlock onto ONE sheet (true-shape) but the bbox packer
    // fits only one 40×40 box per sheet. So nfp packs twice the material per sheet,
    // and its (true-area) utilization strictly exceeds bbox's (bbox-area) utilization.
    const parts = Array.from({ length: 4 }, () => lPart());
    const sheet = { width: 45, height: 65 };
    const opts = { sheet, allowRotation: true } as const;

    const bbox = nest(parts, { ...opts, strategy: 'bbox' });
    const nfp = nest(parts, { ...opts, strategy: 'nfp' });
    expect(bbox.ok && nfp.ok).toBe(true);
    if (!bbox.ok || !nfp.ok) return;
    expect(bbox.value.unplaced).toEqual([]);
    expect(nfp.value.unplaced).toEqual([]);

    const bestUtil = (r: typeof bbox.value): number =>
      r.sheets.reduce((m, s) => Math.max(m, s.utilization), 0);
    const bboxU = bestUtil(bbox.value);
    const nfpU = bestUtil(nfp.value);

    // bbox: 1 part/sheet (4 sheets); nfp: 2 parts/sheet (2 sheets) by interlocking.
    expect(bbox.value.sheets.every((s) => s.placements.length === 1)).toBe(true);
    expect(nfp.value.sheets.some((s) => s.placements.length === 2)).toBe(true);
    expect(nfp.value.sheets.length).toBeLessThan(bbox.value.sheets.length);
    // The whole reason PR11 exists: interlocking concave parts uses more material.
    expect(nfpU).toBeGreaterThan(bboxU + 1e-3);
  });

  it('NO OVERLAP at the polygon level over all placed pairs, within usable bounds', () => {
    const parts = [lPart(), lPart(), lPart(), flatBlank(25, 25), lPart()];
    const margin = 5;
    const spacing = 2;
    const sheet = { width: 120, height: 120 };
    const r = nest(parts, { sheet, margin, spacing, allowRotation: true, strategy: 'nfp' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const eps = 1e-6;
    for (const s of r.value.sheets) {
      const polys = s.placements.map((p) =>
        placedPolygon(parts[p.patternIndex] as FlatPattern, p.x, p.y, p.rotationDeg)
      );
      // Every transformed outline lies within [margin, sheet - margin].
      for (const poly of polys) {
        for (const [x, y] of poly) {
          expect(x).toBeGreaterThanOrEqual(margin - eps);
          expect(y).toBeGreaterThanOrEqual(margin - eps);
          expect(x).toBeLessThanOrEqual(sheet.width - margin + eps);
          expect(y).toBeLessThanOrEqual(sheet.height - margin + eps);
        }
      }
      // Exhaustive: NO two placed outline polygons overlap (with spacing clearance).
      // This is the load-bearing correctness check — concave parts whose bounding
      // boxes overlap must still not overlap at the true-outline level.
      for (let i = 0; i < polys.length; i += 1) {
        for (let j = i + 1; j < polys.length; j += 1) {
          const a = polys[i] as Polygon;
          const b = polys[j] as Polygon;
          expect(polygonsOverlapWithClearance(a, b, spacing - eps)).toBe(false);
        }
      }
    }
  });

  it('rotations: a part that only interlocks rotated is still placed', () => {
    // Two L-parts on a 45×65 sheet only both fit if the second is rotated 180° into
    // the first's notch — a 0°-only packer would spill one to a second sheet.
    const parts = [lPart(), lPart()];
    const sheet = { width: 45, height: 65 };
    const r = nest(parts, { sheet, allowRotation: true, strategy: 'nfp' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unplaced).toEqual([]);
    // Both interlock onto one sheet; the second is rotated to fit the notch.
    const onOneSheet = r.value.sheets.some((s) => s.placements.length === 2);
    expect(onOneSheet).toBe(true);
    const rotations = r.value.sheets.flatMap((s) => s.placements.map((p) => p.rotationDeg));
    expect(rotations.some((d) => d === 90 || d === 180 || d === 270)).toBe(true);
  });

  it('oversized part -> unplaced + warning, no infinite loop', () => {
    const parts = [lPart(), flatBlank(500, 500), lPart()];
    const r = nest(parts, { sheet: { width: 80, height: 80 }, strategy: 'nfp' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unplaced).toEqual([1]);
    expect(r.value.warnings.length).toBe(1);
    expect(r.value.warnings[0]?.code).toBe('PART_TOO_LARGE');
    expect(r.value.warnings[0]?.featureId).toBe('pattern-1');
    const placed = r.value.sheets.reduce((n, s) => n + s.placements.length, 0);
    expect(placed).toBe(2);
  });

  it('opens a new sheet when no feasible placement remains', () => {
    const parts = Array.from({ length: 4 }, () => flatBlank(40, 40));
    // 50×50 usable fits exactly one 40×40 per sheet → 4 sheets.
    const r = nest(parts, { sheet: { width: 50, height: 50 }, strategy: 'nfp' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unplaced).toEqual([]);
    expect(r.value.sheets).toHaveLength(4);
  });
});

describe('nestToDXF — true-shape sheet', () => {
  it('places each part at its (x, y, rotation); a second part is shifted', () => {
    const parts = [lPart(), lPart()];
    const r = nest(parts, { sheet: { width: 45, height: 65 }, allowRotation: true, strategy: 'nfp' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sheet = r.value.sheets[0];
    expect(sheet).toBeDefined();
    if (sheet === undefined) return;
    expect(sheet.placements.length).toBeGreaterThanOrEqual(2);

    const dxf = nestToDXF(r.value, parts, 0);
    expect(dxf.ok).toBe(true);
    if (!dxf.ok) return;
    const polylineCount = dxf.value.split('LWPOLYLINE').length - 1;
    expect(polylineCount).toBeGreaterThanOrEqual(2);

    // A part placed at x>0 must emit at least one vertex near that offset.
    const second = sheet.placements.find((p) => p.x > 1e-6);
    expect(second).toBeDefined();
    if (second === undefined) return;
    const lines = dxf.value.split('\n');
    const xs: number[] = [];
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (lines[i] === '10') {
        const v = Number(lines[i + 1]);
        if (Number.isFinite(v)) xs.push(v);
      }
    }
    const hits = xs.some((x) => Math.abs(x - second.x) < 1e-2);
    expect(hits).toBe(true);
  });
});

describe('nest — strategy routing', () => {
  it('default (no strategy) is identical to explicit bbox', () => {
    const parts = Array.from({ length: 5 }, () => flatBlank(20, 20));
    const sheet = { width: 60, height: 40 };
    const def = nest(parts, { sheet });
    const bbox = nest(parts, { sheet, strategy: 'bbox' });
    expect(def.ok && bbox.ok).toBe(true);
    if (!def.ok || !bbox.ok) return;
    expect(def.value.sheets.map((s) => s.placements)).toEqual(bbox.value.sheets.map((s) => s.placements));
    expect(def.value.sheets.map((s) => s.utilization)).toEqual(bbox.value.sheets.map((s) => s.utilization));
  });
});
