import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isValid, measureVolume, getEdges, getBounds, isErr } from 'brepjs';
import { author, unfold, report } from '../src/api.js';
import type { BendRule } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const T = 1;
const R = 2;
const K = 0.44;
const rule: BendRule = { innerRadius: R, kFactor: K };
const DEV = (Math.PI / 180) * 90 * (R + K * T);

describe('chained U-channel (base → wall → return)', () => {
  it('builds a valid solid and unfolds with the area invariant', () => {
    const baseLen = 40;
    const width = 30;
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'wall', length: 20, angleDeg: 90, rule, side: 'xmax' },
        // The return folds off the wall's distal edge (parallel to the base) — the
        // wall's `ymax` edge, which runs the full base-width span.
        { id: 'return', length: 10, angleDeg: 90, rule, side: 'ymax', parent: 'wall' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    expect(authored.value.solid).toBeDefined();
    if (authored.value.solid === undefined) return;
    expect(isValid(authored.value.solid)).toBe(true);

    const unfolded = unfold(authored.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;

    // Developed area = base + each (strip + flat) over its span (both span the full
    // 30-wide edge: the wall off the base, the return off the wall's distal edge).
    const expected = baseLen * width + (DEV + 20) * width + (DEV + 10) * width;
    expect(unfolded.value.pattern.developedArea).toBeCloseTo(expected, 6);
    expect(unfolded.value.pattern.bendLines).toHaveLength(2);
    expect(getEdges(unfolded.value.pattern.outline).length).toBeGreaterThanOrEqual(4);
  });
});

describe('U-channel from two opposite base edges', () => {
  it('develops into a single rectangle widened on both sides', () => {
    const baseLen = 40;
    const width = 30;
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'left', length: 15, angleDeg: 90, rule, side: 'xmin' },
        { id: 'right', length: 15, angleDeg: 90, rule, side: 'xmax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    expect(isValid(authored.value.solid ?? (() => { throw new Error('no solid'); })())).toBe(true);

    const unfolded = unfold(authored.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;

    const expected = baseLen * width + 2 * (DEV + 15) * width;
    expect(unfolded.value.pattern.developedArea).toBeCloseTo(expected, 6);
    const [maxX, maxY] = unfolded.value.report.totalFlatSize;
    expect(maxX).toBeCloseTo(baseLen + 2 * (DEV + 15), 6);
    expect(maxY).toBeCloseTo(width, 6);
  });
});

describe('4-sided tray (a flange off every base edge)', () => {
  it('builds a valid solid and unfolds into a plus/cross outline', () => {
    const baseLen = 40;
    const width = 30;
    const fl = 12;
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'xn', length: fl, angleDeg: 90, rule, side: 'xmin' },
        { id: 'xp', length: fl, angleDeg: 90, rule, side: 'xmax' },
        { id: 'yn', length: fl, angleDeg: 90, rule, side: 'ymin' },
        { id: 'yp', length: fl, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    expect(isValid(authored.value.solid ?? (() => { throw new Error('no solid'); })())).toBe(true);

    const unfolded = unfold(authored.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;

    const expected =
      baseLen * width + 2 * (DEV + fl) * width + 2 * (DEV + fl) * baseLen;
    expect(unfolded.value.pattern.developedArea).toBeCloseTo(expected, 6);
    expect(unfolded.value.pattern.bendLines).toHaveLength(4);
    // A plus/cross outline has 12 corners.
    expect(getEdges(unfolded.value.pattern.outline)).toHaveLength(12);
  });
});

describe('down-bend', () => {
  it('records direction "down", stays valid, and matches an up-bend in volume', () => {
    const baseLen = 40;
    const width = 20;
    const flangeLen = 15;
    const down = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [{ id: 'd', length: flangeLen, angleDeg: 90, rule, side: 'xmax', direction: 'down' }],
    });
    expect(down.ok).toBe(true);
    if (isErr(down)) return;
    expect(down.value.bends[0]?.direction).toBe('down');
    expect(down.value.solid).toBeDefined();
    if (down.value.solid === undefined) return;
    expect(isValid(down.value.solid)).toBe(true);

    const downVol = measureVolume(down.value.solid);
    expect(downVol.ok).toBe(true);
    if (isErr(downVol)) return;

    // A down-bend folds the same material the other way: volume is unchanged but
    // the flange now sits below the base plane (zMin < 0).
    const up = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [{ id: 'd', length: flangeLen, angleDeg: 90, rule, side: 'xmax', direction: 'up' }],
    });
    expect(up.ok).toBe(true);
    if (isErr(up)) return;
    const upVol = measureVolume(up.value.solid ?? (() => { throw new Error('no solid'); })());
    expect(upVol.ok).toBe(true);
    if (isErr(upVol)) return;
    expect(downVol.value).toBeCloseTo(upVol.value, 3);

    // The defining property of a down-bend: the flange physically sits below the
    // base plane. Equal volume + valid solid alone can't distinguish a wrong-sign
    // rotation that produces an up-bend shape with 'down' metadata.
    const bounds = getBounds(down.value.solid);
    expect(bounds.zMin).toBeLessThan(-0.5);
    expect(bounds.zMax).toBeCloseTo(T, 3);

    const unfolded = unfold(down.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;
    expect(unfolded.value.pattern.bendLines[0]?.direction).toBe('down');
  });
});

describe('partial / offset flanges (two on one edge)', () => {
  it('places both without overlap and sums their developed strips', () => {
    const baseLen = 40;
    const width = 30;
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'a', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 0, width: 15 },
        { id: 'b', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 20, width: 15 },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    expect(isValid(authored.value.solid ?? (() => { throw new Error('no solid'); })())).toBe(true);

    const unfolded = unfold(authored.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;
    expect(unfolded.value.pattern.bendLines).toHaveLength(2);

    const expected = baseLen * width + 2 * (DEV + 10) * 15;
    expect(unfolded.value.pattern.developedArea).toBeCloseTo(expected, 6);
  });

  it('rejects two flanges that overlap on the same edge', () => {
    const overlapping = author({
      thickness: T,
      base: { length: 40, width: 30 },
      flanges: [
        { id: 'a', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 0, width: 25 },
        { id: 'b', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 20, width: 15 },
      ],
    });
    expect(overlapping.ok).toBe(false);
    if (overlapping.ok) return;
    expect(overlapping.error.code).toBe('OVERLAPPING_FLANGES');
  });
});

describe('closed-box seam', () => {
  it('produces a SEAM_CUT warning and a valid connected flat pattern', () => {
    const baseLen = 40;
    const width = 30;
    const closed = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'w1', length: 20, angleDeg: 90, rule, side: 'xmax' },
        { id: 'w2', length: 30, angleDeg: 90, rule, side: 'xmax', parent: 'w1' },
        { id: 'w3', length: 20, angleDeg: 90, rule, side: 'xmax', parent: 'w2' },
      ],
      seams: [{ parent: 'w3', child: 'root', angleDeg: 90, rule }],
    });
    expect(closed.ok).toBe(true);
    if (isErr(closed)) return;

    const unfolded = unfold(closed.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;

    // The SEAM_CUT must land on the authored seam bend, not a real wall bend: the
    // BFS must never promote the seam edge into the spanning tree.
    const seamWarning = unfolded.value.warnings.find((w) => w.code === 'SEAM_CUT');
    expect(seamWarning?.featureId).toMatch(/^seam::/);
    // The seam edge is left unfolded, so only the three spanning-tree bends fold.
    expect(unfolded.value.pattern.bendLines).toHaveLength(3);
    // Developed area = base + each wall's (strip + flat) over its span, in
    // spanning-tree order root→w1→w2→w3. Each wall folds off its parent's distal
    // (xmax) edge, so its span is the parent's flat length: w1 spans the base width
    // (30, length 20); w2 spans w1's length (20, length 30); w3 spans w2's length
    // (30, length 20). A corrupted tree that demoted a wall to the seam — or placed
    // w3 off the base instead of w2 — would not match this analytic sum.
    const expectedArea =
      baseLen * width + (DEV + 20) * 30 + (DEV + 30) * 20 + (DEV + 20) * 30;
    expect(unfolded.value.pattern.developedArea).toBeCloseTo(expectedArea, 6);
    expect(getEdges(unfolded.value.pattern.outline).length).toBeGreaterThanOrEqual(4);
  });
});

describe('multi-bend report', () => {
  it('has one entry per folded bend (N flanges → N entries)', () => {
    const authored = author({
      thickness: T,
      base: { length: 50, width: 40 },
      flanges: [
        { id: 'a', length: 10, angleDeg: 90, rule, side: 'xmax' },
        { id: 'b', length: 10, angleDeg: 90, rule, side: 'xmin' },
        { id: 'c', length: 10, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;

    const rep = report(authored.value);
    expect(rep.ok).toBe(true);
    if (isErr(rep)) return;
    expect(rep.value.bends).toHaveLength(3);
    expect(rep.value.bends.map((b) => b.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('input validation', () => {
  it("rejects a flange id containing '::' (reserved seam delimiter)", () => {
    const bad = author({
      thickness: T,
      base: { length: 30, width: 30 },
      flanges: [{ id: 'left::wall', length: 10, angleDeg: 90, rule, side: 'xmax' }],
    });
    expect(bad.ok).toBe(false);
    if (!isErr(bad)) return;
    expect(bad.error.code).toBe('INVALID_FLANGE_ID');
  });

  it.each(['root', 'face-0'])("rejects a flange reusing the reserved id '%s'", (reserved) => {
    const bad = author({
      thickness: T,
      base: { length: 30, width: 30 },
      flanges: [{ id: reserved, length: 10, angleDeg: 90, rule, side: 'xmax' }],
    });
    expect(bad.ok).toBe(false);
    if (!isErr(bad)) return;
    expect(bad.error.code).toBe('INVALID_FLANGE_ID');
  });

  it('rejects a seam with an out-of-range angle', () => {
    const bad = author({
      thickness: T,
      base: { length: 30, width: 30 },
      flanges: [{ id: 'w1', length: 20, angleDeg: 90, rule, side: 'xmax' }],
      seams: [{ parent: 'w1', child: 'root', angleDeg: -90, rule }],
    });
    expect(bad.ok).toBe(false);
    if (!isErr(bad)) return;
    expect(bad.error.code).toBe('INVALID_SEAM_ANGLE');
  });

  it('rejects a seam with a negative inner radius', () => {
    const bad = author({
      thickness: T,
      base: { length: 30, width: 30 },
      flanges: [{ id: 'w1', length: 20, angleDeg: 90, rule, side: 'xmax' }],
      seams: [{ parent: 'w1', child: 'root', angleDeg: 90, rule: { innerRadius: -1, kFactor: K } }],
    });
    expect(bad.ok).toBe(false);
    if (!isErr(bad)) return;
    expect(bad.error.code).toBe('INVALID_SEAM_RADIUS');
  });
});
