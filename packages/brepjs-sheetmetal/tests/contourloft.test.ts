import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume, isValid, isSolid, getSolids, getEdges } from 'brepjs';
import { authorPart } from '../src/authorFns.js';
import { authorContourFlange } from '../src/contourFlangeFns.js';
import { authorLoftedFlange } from '../src/loftedFlangeFns.js';
import { unfold } from '../src/unfoldFns.js';
import { developedLength } from '../src/allowanceFns.js';
import type { BendRule, ProfileSegment, SheetMetalPart } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const T = 1;
const rule: BendRule = { innerRadius: 2, kFactor: 0.44 };

function singleSolid(part: SheetMetalPart): boolean {
  const s = part.solid;
  if (s === undefined) return false;
  if (isSolid(s)) return true;
  return getSolids(s).length === 1;
}

describe('contour flange — exact development', () => {
  it('lays the developed strip length as the exact sum of segment developed lengths', () => {
    const base = authorPart({ thickness: T, base: { length: 50, width: 30 }, flanges: [] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    // A return / hat-style profile: flat → 90° arc → flat → 90° arc → flat.
    const profile: ProfileSegment[] = [
      { kind: 'line', length: 8 },
      { kind: 'arc', radius: 2, angleDeg: 90, direction: 'up' },
      { kind: 'line', length: 12 },
      { kind: 'arc', radius: 2, angleDeg: 90, direction: 'up' },
      { kind: 'line', length: 8 },
    ];

    const cf = authorContourFlange(base.value, { id: 'hat', side: 'xmax', profile, rule });
    expect(cf.ok).toBe(true);
    if (!cf.ok) return;
    const part = cf.value;

    expect(singleSolid(part)).toBe(true);
    if (part.solid !== undefined) expect(isValid(part.solid)).toBe(true);

    // #bends == #arc segments.
    const arcCount = profile.filter((s) => s.kind === 'arc').length;
    expect(part.contourFlanges?.[0]?.segments.filter((s) => s.kind === 'arc').length).toBe(arcCount);
    expect(part.bends.filter((b) => b.id.startsWith('contour::')).length).toBe(arcCount);

    // Exact developed length = Σ line lengths + Σ arc developed lengths.
    const arc1 = developedLength(90, T, rule);
    const arc2 = developedLength(90, T, rule);
    expect(arc1.ok && arc2.ok).toBe(true);
    if (!arc1.ok || !arc2.ok) return;
    const expectedDev = 8 + arc1.value + 12 + arc2.value + 8;
    expect(part.contourFlanges?.[0]?.developedLength).toBeCloseTo(expectedDev, 9);

    // The unfold lays the strip out straight: its developed strip length is exact.
    const unfolded = unfold(part);
    expect(unfolded.ok).toBe(true);
    if (!unfolded.ok) return;
    // One bend line per arc on the contour strip, plus none from flanges (no flanges).
    expect(unfolded.value.pattern.bendLines.length).toBe(arcCount);
  });

  it('rejects an out-of-bounds contour flange', () => {
    const base = authorPart({ thickness: T, base: { length: 50, width: 30 }, flanges: [] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const cf = authorContourFlange(base.value, {
      id: 'over',
      side: 'xmax',
      profile: [{ kind: 'line', length: 5 }],
      offset: 10,
      width: 40,
    });
    expect(cf.ok).toBe(false);
  });

  it('rejects an empty profile', () => {
    const base = authorPart({ thickness: T, base: { length: 50, width: 30 }, flanges: [] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const cf = authorContourFlange(base.value, { id: 'empty', side: 'xmax', profile: [] });
    expect(cf.ok).toBe(false);
  });
});

describe('lofted flange — triangulated development', () => {
  it('builds a valid single solid for a developable trapezoidal transition', () => {
    const base = authorPart({ thickness: T, base: { length: 60, width: 40 }, flanges: [] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    // Symmetric trapezoid: bottom edge wider than top, both centered — a developable
    // truncated-wedge ruled transition (planar quads).
    const height = 20;
    const lf = authorLoftedFlange(base.value, {
      id: 'chute',
      profileA: [
        [0, 0],
        [40, 0],
      ],
      profileB: [
        [10, 0],
        [30, 0],
      ],
      height,
      thickness: T,
    });
    expect(lf.ok).toBe(true);
    if (!lf.ok) return;
    const part = lf.value;
    expect(singleSolid(part)).toBe(true);

    const feature = part.loftedFlanges?.[0];
    expect(feature).toBeDefined();
    if (feature === undefined) return;
    expect(feature.approximate).toBe(false);

    // Analytic ruled-surface area of the trapezoidal transition (a single planar
    // trapezoid here: parallel edges 40 and 20, slant height = height since profiles
    // are symmetric in x with the same y). Area = (a + b)/2 * h.
    const slant = height; // both edges at y=0, perpendicular separation along z
    const analyticArea = ((40 + 20) / 2) * slant;
    expect(feature.developedArea).toBeCloseTo(analyticArea, 3);

    // For a developable transition the flat layout preserves area exactly: the
    // shoelace area of the developed loop equals the analytic 3D surface area.
    const loop = feature.developedLoop;
    let shoelace = 0;
    for (let i = 0; i < loop.length; i += 1) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      if (p === undefined || q === undefined) continue;
      shoelace += p[0] * q[1] - q[0] * p[1];
    }
    expect(Math.abs(shoelace) / 2).toBeCloseTo(analyticArea, 3);

    // The developed loop is a valid closed wire (≥ 3 edges).
    const unfolded = unfold(part);
    expect(unfolded.ok).toBe(true);
    if (!unfolded.ok) return;
    expect(unfolded.value.pattern.loftedDevelopments.length).toBe(1);
    const devWire = unfolded.value.pattern.loftedDevelopments[0];
    expect(devWire).toBeDefined();
    if (devWire === undefined) return;
    expect(getEdges(devWire).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps a large-scale developable transition exact (scale-invariant developability)', () => {
    const base = authorPart({ thickness: T, base: { length: 4000, width: 2000 }, flanges: [] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    // Same developable trapezoid as above but scaled up 100×. With an absolute
    // out-of-plane tolerance, numerical noise at these coordinates could false-flag
    // the planar quad as approximate; the relative tolerance must keep it exact.
    const height = 2000;
    const lf = authorLoftedFlange(base.value, {
      id: 'bigchute',
      profileA: [
        [0, 0],
        [4000, 0],
      ],
      profileB: [
        [1000, 0],
        [3000, 0],
      ],
      height,
      thickness: T,
    });
    expect(lf.ok).toBe(true);
    if (!lf.ok) return;
    const feature = lf.value.loftedFlanges?.[0];
    expect(feature?.approximate).toBe(false);

    const analyticArea = ((4000 + 2000) / 2) * height;
    expect(feature?.developedArea).toBeCloseTo(analyticArea, 0);
  });

  it('emits DEVELOPMENT_APPROXIMATE for a non-developable transition', () => {
    const base = authorPart({ thickness: T, base: { length: 60, width: 40 }, flanges: [] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    // A square-to-rotated transition is non-developable: rulings twist between the
    // two profiles (a classic square-to-square 45°-rotated hopper segment).
    const lf = authorLoftedFlange(base.value, {
      id: 'twist',
      profileA: [
        [0, 0],
        [20, 0],
        [20, 20],
      ],
      profileB: [
        [10, -7],
        [27, 10],
        [10, 27],
      ],
      height: 25,
      thickness: T,
    });
    expect(lf.ok).toBe(true);
    if (!lf.ok) return;
    const part = lf.value;
    expect(part.loftedFlanges?.[0]?.approximate).toBe(true);

    const unfolded = unfold(part);
    expect(unfolded.ok).toBe(true);
    if (!unfolded.ok) return;
    expect(unfolded.value.warnings.some((w) => w.code === 'DEVELOPMENT_APPROXIMATE')).toBe(true);

    // Even an approximate transition must still produce a valid measurable solid.
    if (part.solid !== undefined) {
      const vol = measureVolume(part.solid);
      expect(vol.ok).toBe(true);
      if (vol.ok) expect(vol.value).toBeGreaterThan(0);
    }
  });

  it('rejects mismatched profile vertex counts', () => {
    const base = authorPart({ thickness: T, base: { length: 60, width: 40 }, flanges: [] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const lf = authorLoftedFlange(base.value, {
      id: 'bad',
      profileA: [
        [0, 0],
        [10, 0],
      ],
      profileB: [
        [0, 0],
        [5, 0],
        [10, 0],
      ],
      height: 10,
    });
    expect(lf.ok).toBe(false);
  });
});
