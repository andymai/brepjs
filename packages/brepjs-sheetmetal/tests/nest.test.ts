import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { authorPart as author } from '../src/authorFns.js';
import { unfold } from '../src/unfoldFns.js';
import { nest, nestToDXF, patternBbox } from '../src/nestFns.js';
import type { AuthorSpec } from '../src/authorFns.js';
import type { BendRule, FlatPattern } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const rule: BendRule = { innerRadius: 1, kFactor: 0.44 };

/** A flat rectangular blank (no flanges) — its unfolded outline is exactly length×width. */
function flatBlank(length: number, width: number): FlatPattern {
  const spec: AuthorSpec = { thickness: 1, base: { length, width }, flanges: [] };
  const authored = author(spec);
  if (!authored.ok) throw new Error(`author failed: ${authored.error.message}`);
  const unfolded = unfold(authored.value);
  if (!unfolded.ok) throw new Error(`unfold failed: ${unfolded.error.message}`);
  return unfolded.value.pattern;
}

/** A blank with one flange, giving a longer developed outline (for rotation tests). */
function flangedBlank(length: number, width: number, flangeLen: number): FlatPattern {
  const spec: AuthorSpec = {
    thickness: 1,
    base: { length, width },
    flanges: [{ id: 'f', length: flangeLen, angleDeg: 90, rule, side: 'xmax' }],
  };
  const authored = author(spec);
  if (!authored.ok) throw new Error(`author failed: ${authored.error.message}`);
  const unfolded = unfold(authored.value);
  if (!unfolded.ok) throw new Error(`unfold failed: ${unfolded.error.message}`);
  return unfolded.value.pattern;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function placedRect(pattern: FlatPattern, x: number, y: number, rotationDeg: 0 | 90): Rect {
  const b = patternBbox(pattern);
  if (!b.ok) throw new Error('bbox failed');
  const w = rotationDeg === 90 ? b.value.height : b.value.width;
  const h = rotationDeg === 90 ? b.value.width : b.value.height;
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}

/** Two rects overlap iff they overlap on both axes (open-interval test, EPS slack). */
function overlaps(a: Rect, b: Rect, eps: number): boolean {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps;
}

describe('nest — bbox', () => {
  it('packs N identical small parts onto the hand-computed sheet count', () => {
    // 20×20 part, 5 of them, sheet 60×40, no margin/spacing.
    // Shelf packer: 3 per shelf (x=0,20,40) at y=0; shelf 2 at y=20 (3 slots).
    // 2 shelves of height 20 fit in 40 → 6 slots → all 5 fit on ONE sheet.
    const parts = Array.from({ length: 5 }, () => flatBlank(20, 20));
    const r = nest(parts, { sheet: { width: 60, height: 40 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unplaced).toEqual([]);
    expect(r.value.sheets).toHaveLength(1);
    expect(r.value.sheets[0]?.placements).toHaveLength(5);
  });

  it('opens a second sheet when parts overflow the first', () => {
    // 20×20 part, 7 of them, sheet 60×40 (6 slots per sheet) → 2 sheets (6 + 1).
    const parts = Array.from({ length: 7 }, () => flatBlank(20, 20));
    const r = nest(parts, { sheet: { width: 60, height: 40 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unplaced).toEqual([]);
    expect(r.value.sheets).toHaveLength(2);
    expect(r.value.sheets[0]?.placements).toHaveLength(6);
    expect(r.value.sheets[1]?.placements).toHaveLength(1);
  });

  it('NO OVERLAP + WITHIN BOUNDS over all placement pairs (with margin + spacing)', () => {
    const parts = Array.from({ length: 12 }, (_, i) => flatBlank(15 + (i % 3) * 5, 12 + (i % 4) * 3));
    const margin = 3;
    const spacing = 2;
    const sheet = { width: 120, height: 100 };
    const r = nest(parts, { sheet, margin, spacing, allowRotation: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const eps = 1e-6;
    for (const s of r.value.sheets) {
      const rects = s.placements.map((p) => placedRect(parts[p.patternIndex] as FlatPattern, p.x, p.y, p.rotationDeg));
      // Within usable bounds [margin, sheet - margin].
      for (const rect of rects) {
        expect(rect.x0).toBeGreaterThanOrEqual(margin - eps);
        expect(rect.y0).toBeGreaterThanOrEqual(margin - eps);
        expect(rect.x1).toBeLessThanOrEqual(sheet.width - margin + eps);
        expect(rect.y1).toBeLessThanOrEqual(sheet.height - margin + eps);
      }
      // Every pair is non-overlapping when each rect is padded by the spacing gap.
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i] as Rect;
          const b = rects[j] as Rect;
          const padded: Rect = { x0: a.x0 - spacing, y0: a.y0 - spacing, x1: a.x1 + spacing, y1: a.y1 + spacing };
          expect(overlaps(padded, b, eps)).toBe(false);
        }
      }
    }
  });

  it('utilization is in (0,1] and matches packed-area / usable-area', () => {
    // 20×20 ×4 on 50×50, margin 0 → packed = 4·400 = 1600; usable = 2500.
    const parts = Array.from({ length: 4 }, () => flatBlank(20, 20));
    const r = nest(parts, { sheet: { width: 50, height: 50 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = r.value.sheets[0]?.utilization ?? 0;
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThanOrEqual(1);
    expect(u).toBeCloseTo(1600 / 2500, 6);
  });

  it('allowRotation reduces sheet count for a tall part that only fits rotated', () => {
    // Part developed bbox is ~50 wide × 20 tall (a 20-wide base + flange runs along x).
    // Sheet 60 wide × 25 tall: a 50-tall orientation will not fit without rotation.
    const tall = flangedBlank(20, 50, 18); // base 20 long (x) × 50 wide (y) + flange off xmax
    const b = patternBbox(tall);
    if (!b.ok) throw new Error('bbox failed');
    // Choose a sheet where the un-rotated height (50) exceeds the sheet height.
    const sheet = { width: Math.ceil(b.value.width) + 40, height: Math.floor(b.value.height) - 5 };
    const parts = [tall, tall];

    const without = nest(parts, { sheet, allowRotation: false });
    const withRot = nest(parts, { sheet, allowRotation: true });
    expect(without.ok && withRot.ok).toBe(true);
    if (!without.ok || !withRot.ok) return;

    // Un-rotated: the part's height exceeds the sheet → unplaced.
    expect(without.value.unplaced.length).toBeGreaterThan(0);
    // Rotated: both fit → none unplaced, at least one sheet.
    expect(withRot.value.unplaced).toEqual([]);
    expect(withRot.value.sheets.length).toBeGreaterThan(0);
  });

  it('a part larger than the sheet goes to unplaced with a warning, no infinite loop', () => {
    const parts = [flatBlank(20, 20), flatBlank(500, 500), flatBlank(20, 20)];
    const r = nest(parts, { sheet: { width: 50, height: 50 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unplaced).toEqual([1]);
    expect(r.value.warnings.length).toBe(1);
    expect(r.value.warnings[0]?.featureId).toBe('pattern-1');
    // The two placeable parts still get placed.
    const totalPlaced = r.value.sheets.reduce((n, s) => n + s.placements.length, 0);
    expect(totalPlaced).toBe(2);
  });

  it('rejects a sheet whose margin leaves no usable area', () => {
    const r = nest([flatBlank(10, 10)], { sheet: { width: 10, height: 10 }, margin: 6 });
    expect(r.ok).toBe(false);
  });

  it('rejects a non-finite margin/spacing rather than silently producing empty sheets', () => {
    const r = nest([flatBlank(10, 10)], { sheet: { width: 100, height: 100 }, margin: Number.NaN });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('INVALID_NEST_OPTS');
  });

  it('keeps utilization strictly above 0 for a thin part (the (0,1] contract floor)', () => {
    // A thin-but-real 20×0.5 part still has positive bbox area. patternBbox rejects only
    // sub-EPS-extent (degenerate) boxes, so any part it accepts has positive area and can
    // never drive a sheet's utilization to 0 — keeping the documented (0,1] contract true.
    const thin = flatBlank(20, 0.5);
    const bb = patternBbox(thin);
    expect(bb.ok).toBe(true);
    if (bb.ok) {
      expect(bb.value.width).toBeGreaterThan(0);
      expect(bb.value.height).toBeGreaterThan(0);
    }
    const r = nest([thin], { sheet: { width: 50, height: 50 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = r.value.sheets[0]?.utilization ?? 0;
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThanOrEqual(1);
  });
});

describe('nestToDXF', () => {
  it('places two parts at their sheet offsets', () => {
    const a = flatBlank(20, 20);
    const b = flatBlank(20, 20);
    const r = nest([a, b], { sheet: { width: 60, height: 30 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sheets).toHaveLength(1);
    const placements = r.value.sheets[0]?.placements ?? [];
    expect(placements).toHaveLength(2);

    const dxf = nestToDXF(r.value, [a, b], 0);
    expect(dxf.ok).toBe(true);
    if (!dxf.ok) return;

    // Two outline polylines (one per part), both fabrication-ready on the sheet.
    const polylineCount = dxf.value.split('LWPOLYLINE').length - 1;
    expect(polylineCount).toBeGreaterThanOrEqual(2);

    // The second part is shifted: its x offset (placement.x) appears as a vertex x.
    const second = placements.find((p) => p.x > 0);
    expect(second).toBeDefined();
    if (second === undefined) return;
    // A part placed at x>0 must emit at least one vertex whose x ≈ placement.x.
    const lines = dxf.value.split('\n');
    const xs: number[] = [];
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (lines[i] === '10') {
        const v = Number(lines[i + 1]);
        if (Number.isFinite(v)) xs.push(v);
      }
    }
    const hitsOffset = xs.some((x) => Math.abs(x - second.x) < 1e-3);
    expect(hitsOffset).toBe(true);
  });

  it('errors on an out-of-range sheet index', () => {
    const a = flatBlank(20, 20);
    const r = nest([a], { sheet: { width: 60, height: 30 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dxf = nestToDXF(r.value, [a], 5);
    expect(dxf.ok).toBe(false);
  });
});
