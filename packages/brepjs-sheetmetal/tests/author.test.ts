import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume, isValid, getBounds } from 'brepjs';
import { authorPart } from '../src/authorFns.js';
import { autoMiterCorner, miterCut } from '../src/miterFns.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const T = 1;
const R = 2;

function annularSector(angleDeg: number, span: number): number {
  const inner = R;
  const outer = R + T;
  return ((angleDeg * Math.PI) / 180 / 2) * (outer * outer - inner * inner) * span;
}

describe('authorPart — L-bracket (base + one 90° flange)', () => {
  const baseLen = 30;
  const width = 10;
  const flangeLen = 20;

  it('builds a valid solid with plausible volume', () => {
    const result = authorPart({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [{ id: 'flange-1', length: flangeLen, angleDeg: 90, rule: { innerRadius: R, kFactor: 0.44 } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const part = result.value;
    expect(part.solid).toBeDefined();
    if (part.solid === undefined) return;

    expect(isValid(part.solid)).toBe(true);

    const vol = measureVolume(part.solid);
    expect(vol.ok).toBe(true);
    if (!vol.ok) return;

    const expected =
      baseLen * width * T + flangeLen * width * T + annularSector(90, width);
    expect(vol.value).toBeCloseTo(expected, 3);

    // The 90° flange rises to z = R + T + flangeLen above the base.
    const b = getBounds(part.solid);
    expect(b.zMax).toBeCloseTo(R + T + flangeLen, 3);
  });

  it('records the bend feature tree the unfold consumes', () => {
    const result = authorPart({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [{ id: 'flange-1', length: flangeLen, angleDeg: 90, rule: { innerRadius: R, kFactor: 0.5 } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.bends).toHaveLength(1);
    const bend = result.value.bends[0];
    expect(bend).toBeDefined();
    if (bend === undefined) return;

    expect(bend.id).toBe('flange-1');
    expect(bend.angleDeg).toBe(90);
    expect(bend.direction).toBe('up');
    expect(bend.axisDir).toEqual([0, 1, 0]);
    expect(bend.axisOrigin).toEqual([baseLen, 0, T + R]);
    expect(bend.rule.innerRadius).toBe(R);
  });

  it('rejects a non-positive thickness', () => {
    const result = authorPart({
      thickness: 0,
      base: { length: baseLen, width },
      flanges: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a duplicate flange id', () => {
    const result = authorPart({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'dup', length: flangeLen, angleDeg: 90, rule: { innerRadius: R, kFactor: 0.44 } },
        { id: 'dup', length: flangeLen, angleDeg: 90, rule: { innerRadius: R, kFactor: 0.44 } },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe('miter — two-flange corner', () => {
  const baseLen = 30;
  const width = 30;
  const flangeLen = 15;

  function corner() {
    return authorPart({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'fx', length: flangeLen, angleDeg: 90, rule: { innerRadius: R, kFactor: 0.44 }, side: 'xmax' },
        { id: 'fy', length: flangeLen, angleDeg: 90, rule: { innerRadius: R, kFactor: 0.44 }, side: 'ymax' },
      ],
    });
  }

  it('builds two perpendicular flanges meeting at a corner', () => {
    const result = corner();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.solid).toBeDefined();
    if (result.value.solid === undefined) return;

    expect(isValid(result.value.solid)).toBe(true);
    expect(result.value.bends).toHaveLength(2);

    const [bx, by] = result.value.bends;
    expect(bx?.axisDir).toEqual([0, 1, 0]);
    expect(by?.axisDir).toEqual([1, 0, 0]);
  });

  it('auto-miters the corner into a valid solid', () => {
    const result = corner();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const before = measureVolume(result.value.solid ?? (() => { throw new Error('no solid'); })());
    expect(before.ok).toBe(true);

    const mitered = autoMiterCorner(result.value, 'fx', 'fy', 1);
    expect(mitered.ok).toBe(true);
    if (!mitered.ok) return;
    expect(mitered.value.solid).toBeDefined();
    if (mitered.value.solid === undefined) return;

    expect(isValid(mitered.value.solid)).toBe(true);

    const after = measureVolume(mitered.value.solid);
    expect(after.ok).toBe(true);
    if (!after.ok || !before.ok) return;
    // The miter removes corner material, so volume strictly decreases.
    expect(after.value).toBeLessThan(before.value);
    expect(after.value).toBeGreaterThan(0);
  });

  it('general miterCut removes the +normal half-space and stays valid', () => {
    const result = corner();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cut = miterCut(result.value, { origin: [20, 20, 0], normal: [1, 1, 0] });
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    expect(cut.value.solid).toBeDefined();
    if (cut.value.solid === undefined) return;

    expect(isValid(cut.value.solid)).toBe(true);
    const vol = measureVolume(cut.value.solid);
    expect(vol.ok).toBe(true);
    if (!vol.ok) return;
    expect(vol.value).toBeGreaterThan(0);
  });

  it('rejects miterCut when the part has no solid', () => {
    const cut = miterCut(
      { thickness: T, baseLength: 30, width: 10, flanges: [], bends: [] },
      { origin: [0, 0, 0], normal: [1, 0, 0] }
    );
    expect(cut.ok).toBe(false);
  });
});

describe('authorPart — input validation', () => {
  const rule = { innerRadius: R, kFactor: 0.44 };

  it('rejects two flanges on the same side (would overlap and corrupt the flat pattern)', () => {
    const result = authorPart({
      thickness: T,
      base: { length: 30, width: 10 },
      flanges: [
        { id: 'a', length: 12, angleDeg: 90, rule, side: 'xmax' },
        { id: 'b', length: 12, angleDeg: 90, rule, side: 'xmax' },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('DUPLICATE_SIDE');
  });

  it('treats an omitted side as xmax for the duplicate-side check', () => {
    const result = authorPart({
      thickness: T,
      base: { length: 30, width: 10 },
      flanges: [
        { id: 'a', length: 12, angleDeg: 90, rule },
        { id: 'b', length: 12, angleDeg: 90, rule, side: 'xmax' },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts one flange per side (xmax + ymax)', () => {
    const result = authorPart({
      thickness: T,
      base: { length: 30, width: 10 },
      flanges: [
        { id: 'a', length: 12, angleDeg: 90, rule, side: 'xmax' },
        { id: 'b', length: 12, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
