import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume, isValid, isSolid, getSolids, getBounds } from 'brepjs';
import { authorPart } from '../src/authorFns.js';
import { hem } from '../src/hemFns.js';
import { jog } from '../src/jogFns.js';
import { unfold } from '../src/unfoldFns.js';
import { developedLength } from '../src/allowanceFns.js';
import { registerBendTable } from '../src/bendTableFns.js';
import type { BendRule, SheetMetalPart } from '../src/types.js';

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

function basePart(): SheetMetalPart {
  const base = authorPart({ thickness: T, base: { length: 50, width: 30 }, flanges: [] });
  if (!base.ok) throw new Error('base author failed');
  return base.value;
}

describe('hem — fold-back development', () => {
  it('develops a closed hem as Σ curl allowances + return length', () => {
    const radius = 2;
    const returnLength = 6;
    const h = hem(basePart(), {
      region: 'base',
      side: 'xmax',
      type: 'closed',
      length: returnLength,
      radius,
      rule,
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const part = h.value;

    expect(singleSolid(part)).toBe(true);
    if (part.solid !== undefined) expect(isValid(part.solid)).toBe(true);

    const feature = part.hems?.[0];
    expect(feature).toBeDefined();
    if (feature === undefined) return;

    // The developed length is exactly the sum of the recorded curl bend allowances
    // (the closed hem hair-inflates the radius internally, so this self-consistent
    // check ties the strip length to the actual recorded sub-bend developments)
    // plus the flat return leg.
    const arcDev = feature.segments
      .filter((s) => s.kind === 'arc')
      .reduce((acc, s) => acc + s.dev, 0);
    expect(feature.developedLength).toBeCloseTo(arcDev + returnLength, 9);
  });

  it('develops an open hem as the exact 180° allowance at the gap radius + return', () => {
    const gap = 3;
    const returnLength = 6;
    // An open hem sizes the curl inner radius directly from the gap (no hair), so
    // its developed curl length is the exact 180° bend allowance at that radius.
    const h = hem(basePart(), {
      region: 'base',
      side: 'xmax',
      type: 'open',
      length: returnLength,
      gap,
      rule,
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const feature = h.value.hems?.[0];
    expect(feature).toBeDefined();
    if (feature === undefined) return;

    // `gap` is the physical clear distance; the inner bend radius is gap/2.
    const fullCurl = developedLength(180, T, { ...rule, innerRadius: gap / 2 });
    expect(fullCurl.ok).toBe(true);
    if (!fullCurl.ok) return;
    const arcDev = feature.segments.filter((s) => s.kind === 'arc').reduce((acc, s) => acc + s.dev, 0);
    // Σ sub-arc allowances == the single 180° allowance (allowance is linear in angle).
    expect(arcDev).toBeCloseTo(fullCurl.value, 6);
    expect(feature.developedLength).toBeCloseTo(fullCurl.value + returnLength, 6);
  });

  it('lays the curl bend lines in the flat pattern', () => {
    const h = hem(basePart(), { region: 'base', side: 'xmax', type: 'closed', length: 6, radius: 2, rule });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const unfolded = unfold(h.value);
    expect(unfolded.ok).toBe(true);
    if (!unfolded.ok) return;
    const feature = h.value.hems?.[0];
    expect(feature).toBeDefined();
    if (feature === undefined) return;
    // One bend line per recorded curl sub-bend, all marked 'up'.
    expect(unfolded.value.pattern.bendLines.length).toBe(feature.subBends.length);
    expect(unfolded.value.pattern.bendLines.every((b) => b.direction === 'up')).toBe(true);
  });

  it('builds a valid single solid for every hem type', () => {
    const types = ['closed', 'open', 'teardrop', 'rolled'] as const;
    for (const type of types) {
      const h = hem(basePart(), {
        region: 'base',
        side: 'xmax',
        type,
        length: type === 'rolled' ? undefined : 6,
        radius: 2,
        rule,
      });
      expect(h.ok, `hem type ${type}`).toBe(true);
      if (!h.ok) continue;
      expect(singleSolid(h.value), `single solid ${type}`).toBe(true);
      if (h.value.solid !== undefined) {
        expect(isValid(h.value.solid), `valid ${type}`).toBe(true);
        const vol = measureVolume(h.value.solid);
        expect(vol.ok && vol.value > 0, `volume ${type}`).toBe(true);
      }
    }
  });

  it('develops a bendTableRef hem per the table (PR8 ↔ PR9)', () => {
    const reg = registerBendTable({
      id: 'hem-test-table',
      kind: 'allowance',
      rows: [{ thickness: T, radius: 2, angleDeg: 180, value: 9.5 }],
    });
    expect(reg.ok).toBe(true);

    const tableRule: BendRule = { innerRadius: 2, kFactor: 0.44, bendTableRef: 'hem-test-table' };
    const h = hem(basePart(), { region: 'base', side: 'xmax', type: 'closed', length: 6, radius: 2, rule: tableRule });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const feature = h.value.hems?.[0];
    expect(feature).toBeDefined();
    if (feature === undefined) return;

    // The full 180° curl resolves to the single tabulated value (9.5), distinct
    // from the K-factor formula. The curl is split into sub-arcs only for geometry;
    // the development apportions the FULL-curl allowance across them by angle, so the
    // recorded Σ sub-arc devs equals the table's 180° value — NOT N× a per-sub-angle
    // clamp (a table sparse in angle would otherwise over-count by the split factor).
    const tableDev = developedLength(180, T, tableRule);
    const kDev = developedLength(180, T, { innerRadius: 2, kFactor: 0.44 });
    expect(tableDev.ok && kDev.ok).toBe(true);
    if (!tableDev.ok || !kDev.ok) return;
    expect(tableDev.value).not.toBeCloseTo(kDev.value, 2);
    const arcDev = feature.segments.filter((s) => s.kind === 'arc').reduce((acc, s) => acc + s.dev, 0);
    expect(arcDev).toBeCloseTo(tableDev.value, 6);
    expect(arcDev).not.toBeCloseTo(kDev.value, 2);
  });

  it('apportions a sparse table across split sub-arcs without over-counting (270° rolled)', () => {
    // A rolled hem curls 270°, split into 3×90° sub-arcs for geometry. A table with
    // only a 270° row would clamp each 90° sub-query up to the 270° value, recording
    // 3× the physical allowance if queried per sub-arc. The development must instead
    // resolve the full 270° curl once and apportion it, so Σ sub-arc devs == the table
    // 270° value, regardless of how many sub-arcs the geometry split needs.
    const reg = registerBendTable({
      id: 'rolled-test-table',
      kind: 'allowance',
      rows: [{ thickness: T, radius: 2, angleDeg: 270, value: 14.2 }],
    });
    expect(reg.ok).toBe(true);
    const tableRule: BendRule = { innerRadius: 2, kFactor: 0.44, bendTableRef: 'rolled-test-table' };
    const h = hem(basePart(), { region: 'base', side: 'xmax', type: 'rolled', radius: 2, rule: tableRule });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const feature = h.value.hems?.[0];
    expect(feature).toBeDefined();
    if (feature === undefined) return;
    expect(feature.subBends.length).toBeGreaterThan(1);
    const arcDev = feature.segments.filter((s) => s.kind === 'arc').reduce((acc, s) => acc + s.dev, 0);
    expect(arcDev).toBeCloseTo(14.2, 6);
  });

  it('rejects a closed hem with a return length shorter than thickness', () => {
    const h = hem(basePart(), { region: 'base', side: 'xmax', type: 'closed', length: 0.5, radius: 2, rule });
    expect(h.ok).toBe(false);
  });

  it('rejects a closed hem with no return length', () => {
    const h = hem(basePart(), { region: 'base', side: 'xmax', type: 'closed', radius: 2, rule });
    expect(h.ok).toBe(false);
  });
});

describe('jog — two-bend step', () => {
  it('produces the requested perpendicular offset', () => {
    const offsetHeight = 5;
    const j = jog(basePart(), {
      region: 'base',
      side: 'xmax',
      position: 8,
      offsetHeight,
      angle: 45,
      runOut: 8,
      radius: 2,
      rule,
    });
    expect(j.ok).toBe(true);
    if (!j.ok) return;
    const part = j.value;
    expect(singleSolid(part)).toBe(true);
    if (part.solid === undefined) return;
    expect(isValid(part.solid)).toBe(true);

    // The base flat sits in z∈[0, T]; the jog steps the run-out leg up by
    // offsetHeight, so the part's z-extent grows to ≈ offsetHeight + T.
    const b = getBounds(part.solid);
    expect(b.zMax - b.zMin).toBeCloseTo(offsetHeight + T, 1);
  });

  it('emits two opposite bend lines (one up, one down) in the flat', () => {
    const j = jog(basePart(), { region: 'base', side: 'xmax', position: 8, offsetHeight: 5, angle: 45, rule });
    expect(j.ok).toBe(true);
    if (!j.ok) return;
    const unfolded = unfold(j.value);
    expect(unfolded.ok).toBe(true);
    if (!unfolded.ok) return;
    const bendLines = unfolded.value.pattern.bendLines;
    expect(bendLines.length).toBe(2);
    expect(bendLines.filter((b) => b.direction === 'up').length).toBe(1);
    expect(bendLines.filter((b) => b.direction === 'down').length).toBe(1);
  });

  it('develops as 2 bend allowances + the leg runs (position + step + runOut)', () => {
    const angle = 45;
    const position = 8;
    const offsetHeight = 5;
    const runOut = 10;
    const j = jog(basePart(), {
      region: 'base',
      side: 'xmax',
      position,
      offsetHeight,
      angle,
      runOut,
      radius: 2,
      rule,
    });
    expect(j.ok).toBe(true);
    if (!j.ok) return;
    const feature = j.value.jogs?.[0];
    expect(feature).toBeDefined();
    if (feature === undefined) return;

    const bendDev = developedLength(angle, T, rule);
    expect(bendDev.ok).toBe(true);
    if (!bendDev.ok) return;
    const radius = 2;
    const theta = (angle * Math.PI) / 180;
    // The step run is solved so the two arcs' rise + step rise == offsetHeight.
    const arcRise = (T + 2 * radius) * (1 - Math.cos(theta));
    const stepRun = (offsetHeight - arcRise) / Math.sin(theta);
    const expectedDev = position + bendDev.value + stepRun + bendDev.value + runOut;
    expect(feature.developedLength).toBeCloseTo(expectedDev, 6);
  });

  it('rejects offsetHeight ≤ 0', () => {
    const j = jog(basePart(), { region: 'base', side: 'xmax', position: 8, offsetHeight: 0, rule });
    expect(j.ok).toBe(false);
  });

  it('rejects an out-of-range angle', () => {
    const j = jog(basePart(), { region: 'base', side: 'xmax', position: 8, offsetHeight: 5, angle: 90, rule });
    expect(j.ok).toBe(false);
  });
});

describe('hem/jog — review-fix behaviors', () => {
  it('a closed hem with no radius folds tighter than one defaulting to a thickness', () => {
    // The closed default is now ≈0 (HAIR), not one thickness — so its curl
    // allowance is smaller than an explicit radius=thickness closed hem.
    const tight = hem(basePart(), { region: 'base', side: 'xmax', type: 'closed', length: 6, rule });
    const wide = hem(basePart(), { region: 'base', side: 'xmax', type: 'closed', length: 6, radius: T, rule });
    expect(tight.ok && wide.ok).toBe(true);
    if (!tight.ok || !wide.ok) return;
    const dTight = tight.value.hems?.[0]?.developedLength ?? 0;
    const dWide = wide.value.hems?.[0]?.developedLength ?? 0;
    expect(dTight).toBeLessThan(dWide);
  });

  it('places two hems on the same edge via explicit ids (no DUPLICATE_HEM)', () => {
    const one = hem(basePart(), { region: 'base', side: 'xmax', type: 'open', id: 'h1', length: 6, offset: 0, width: 12, gap: 2, rule });
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const two = hem(one.value, { region: 'base', side: 'xmax', type: 'open', id: 'h2', length: 6, offset: 18, width: 12, gap: 2, rule });
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    expect(two.value.hems?.length).toBe(2);
    if (two.value.solid !== undefined) expect(isValid(two.value.solid)).toBe(true);
  });
});
