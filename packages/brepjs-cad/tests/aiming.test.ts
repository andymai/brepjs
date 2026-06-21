import { describe, it, expect } from 'vitest';
import { aimedSection, featureMarks } from '@/snapshot/aiming.js';

const bounds = { xMin: -20, xMax: 20, yMin: -20, yMax: 20, zMin: 0, zMax: 30 };

describe('aimedSection', () => {
  it('returns null with no bores or no bounds', () => {
    expect(aimedSection([], bounds)).toBeNull();
    expect(
      aimedSection([{ radius: 4, axisOrigin: [0, 0, 0], axisDir: [0, 0, 1] }], undefined)
    ).toBeNull();
  });

  it('cuts on a basis axis perpendicular to a Z-aligned bore, through its origin', () => {
    const s = aimedSection([{ radius: 4, axisOrigin: [0, 0, 15], axisDir: [0, 0, 1] }], bounds);
    // Z bore → cut on x or y (both perpendicular); the plane must pass through the bore at x=0.
    expect(s?.axis === 'x' || s?.axis === 'y').toBe(true);
    expect(s?.frac).toBeCloseTo(0.5, 5); // origin 0 within x span [-20,20]
  });

  it('cuts perpendicular to an X-aligned bore (not along it)', () => {
    const s = aimedSection([{ radius: 4, axisOrigin: [0, 0, 15], axisDir: [1, 0, 0] }], bounds);
    expect(s?.axis).not.toBe('x'); // never cut along the bore axis
  });

  it('aims at the DOMINANT (largest-radius) bore and positions through it', () => {
    const s = aimedSection(
      [
        { radius: 2, axisOrigin: [10, 0, 15], axisDir: [0, 0, 1] },
        { radius: 8, axisOrigin: [-10, 0, 15], axisDir: [0, 0, 1] },
      ],
      bounds
    );
    // dominant bore is the r8 at x=-10 → frac = (-10 - -20)/40 = 0.25
    expect(s?.frac).toBeCloseTo(0.25, 5);
  });

  it('clamps frac into [0,1] for an out-of-bounds origin', () => {
    const s = aimedSection([{ radius: 4, axisOrigin: [999, 0, 15], axisDir: [0, 0, 1] }], bounds);
    expect(s?.frac).toBe(1);
  });
});

describe('featureMarks', () => {
  const bounds = (i: number) => ({
    xMin: i,
    xMax: i + 2,
    yMin: 0,
    yMax: 2,
    zMin: 0,
    zMax: 2,
  });

  it('labels each body B<index> (0-based, multi-body only) at its bbox centroid', () => {
    const marks = featureMarks(
      [
        { index: 0, bounds: bounds(0) },
        { index: 1, bounds: bounds(10) },
      ],
      []
    );
    expect(marks.map((m) => m.label)).toEqual(['B0', 'B1']); // 0-based, matches the facts digest
    expect(marks[0]?.pos).toEqual([1, 1, 1]); // centroid of [0..2]^3
  });

  it('keeps body labels aligned to indices when an earlier body has no bounds (no resequence)', () => {
    const marks = featureMarks(
      [
        { index: 0 }, // unlocatable → no mark, but later labels still match their indices
        { index: 1, bounds: bounds(10) },
        { index: 2, bounds: bounds(20) },
      ],
      []
    );
    expect(marks.map((m) => m.label)).toEqual(['B1', 'B2']);
  });

  it('omits B# for a single body, but still labels its bores H#', () => {
    const marks = featureMarks(
      [{ index: 0, bounds: bounds(0) }],
      [{ axisOrigin: [5, 0, 0] }, { axisOrigin: [0, 5, 0] }]
    );
    expect(marks.map((m) => m.label)).toEqual(['H1', 'H2']);
    expect(marks[0]?.pos).toEqual([5, 0, 0]);
  });

  it('returns empty for a single body with no bores', () => {
    expect(featureMarks([{ index: 0, bounds: bounds(0) }], [])).toEqual([]);
  });

  it('combines B# and H# for a multi-body bored part', () => {
    const marks = featureMarks(
      [
        { index: 0, bounds: bounds(0) },
        { index: 1, bounds: bounds(10) },
      ],
      [{ axisOrigin: [1, 1, 1] }]
    );
    expect(marks.map((m) => m.label)).toEqual(['B0', 'B1', 'H1']);
  });
});
