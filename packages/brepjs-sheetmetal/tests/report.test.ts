import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { buildReport, reportFromUnfold, reportToJSON } from '../src/reportFns.js';
import { unfold } from '../src/unfoldFns.js';
import type { BendRule, SheetMetalPart } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const HALF_PI = Math.PI / 2;

function rule(kFactor: number, innerRadius: number): BendRule {
  return { innerRadius, kFactor };
}

const thickness = 1.0;
const radius = 1.0;
const baseLen = 30;
const flangeLen = 20;

function makePart(k: number): SheetMetalPart {
  return {
    thickness,
    baseLength: baseLen,
    width: flangeLen,
    flanges: [
      {
        id: 'flange-1',
        baseEdge: { kind: 'index', faceIndex: 0, edgeIndex: 0 },
        length: flangeLen,
        span: flangeLen,
        angleDeg: 90,
        rule: rule(k, radius),
      },
    ],
    bends: [
      {
        id: 'flange-1',
        axisOrigin: [0, 0, 0],
        axisDir: [0, 1, 0],
        angleDeg: 90,
        direction: 'up',
        rule: rule(k, radius),
      },
    ],
  };
}

describe('buildReport — bend table from authored part', () => {
  for (const k of [0.33, 0.44, 0.5]) {
    it(`K=${k} reports one bend with developed allowance and straight flat length`, () => {
      const expectedBA = HALF_PI * (radius + k * thickness);
      const result = buildReport(makePart(k));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.bends).toHaveLength(1);
      const bend = result.value.bends[0];
      expect(bend).toBeDefined();
      if (bend === undefined) return;

      expect(bend.id).toBe('flange-1');
      expect(bend.angleDeg).toBe(90);
      expect(bend.radius).toBe(radius);
      expect(bend.direction).toBe('up');
      expect(bend.allowance).toBeCloseTo(expectedBA, 5);
      // flatLength is the straight flange leg, distinct from the bend allowance
      expect(bend.flatLength).toBe(flangeLen);
    });
  }

  it('totalFlatSize: east run = baseLength + BA + flange, height = base width', () => {
    const k = 0.44;
    const expectedBA = HALF_PI * (radius + k * thickness);
    const result = buildReport(makePart(k));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [maxX, maxY] = result.value.totalFlatSize;
    expect(maxX).toBeCloseTo(baseLen + expectedBA + flangeLen, 5);
    expect(maxY).toBeCloseTo(flangeLen, 9);
  });

  it('honours an explicit allowance override', () => {
    const part = makePart(0.44);
    const overridden = part.bends[0];
    expect(overridden).toBeDefined();
    if (overridden === undefined) return;
    overridden.rule = { innerRadius: radius, kFactor: 0.44, allowance: 7 };

    const result = buildReport(part);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bend = result.value.bends[0];
    expect(bend).toBeDefined();
    if (bend === undefined) return;
    expect(bend.allowance).toBe(7);
    // flatLength tracks the straight leg, NOT the (now overridden) allowance
    expect(bend.flatLength).toBe(flangeLen);
  });

  it('rejects an out-of-range K-factor', () => {
    const part = makePart(0.44);
    const bad = part.bends[0];
    expect(bad).toBeDefined();
    if (bad === undefined) return;
    bad.rule = { innerRadius: radius, kFactor: 1.5 };
    const result = buildReport(part);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-positive thickness', () => {
    const part = makePart(0.44);
    part.thickness = 0;
    const result = buildReport(part);
    expect(result.ok).toBe(false);
  });

  it('reports an empty bend list for a flat plate (no flanges)', () => {
    const flat: SheetMetalPart = { thickness, baseLength: 25, width: 10, flanges: [], bends: [] };
    const result = buildReport(flat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bends).toHaveLength(0);
    const [maxX, maxY] = result.value.totalFlatSize;
    expect(maxX).toBeCloseTo(flat.baseLength, 9);
    expect(maxY).toBeCloseTo(flat.width, 9);
  });
});

describe('reportFromUnfold — agrees with buildReport', () => {
  it('matches the report buildReport derives for the same part', () => {
    const part = makePart(0.44);
    const direct = buildReport(part);
    const unfolded = unfold(part);
    expect(direct.ok).toBe(true);
    expect(unfolded.ok).toBe(true);
    if (!direct.ok || !unfolded.ok) return;

    const projected = reportFromUnfold(unfolded.value);
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;

    expect(projected.value.bends).toHaveLength(direct.value.bends.length);
    const a = projected.value.bends[0];
    const b = direct.value.bends[0];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (a === undefined || b === undefined) return;
    expect(a.allowance).toBeCloseTo(b.allowance, 9);
    expect(a.flatLength).toBeCloseTo(b.flatLength, 9);
    expect(projected.value.totalFlatSize[0]).toBeCloseTo(direct.value.totalFlatSize[0], 9);
    expect(projected.value.totalFlatSize[1]).toBeCloseTo(direct.value.totalFlatSize[1], 9);
  });

  it('rejects a corrupt unfold result (negative flat size)', () => {
    const part = makePart(0.44);
    const unfolded = unfold(part);
    expect(unfolded.ok).toBe(true);
    if (!unfolded.ok) return;
    unfolded.value.report.totalFlatSize = [-1, 5];
    const result = reportFromUnfold(unfolded.value);
    expect(result.ok).toBe(false);
  });
});

describe('reportToJSON — serialization', () => {
  it('round-trips through JSON.parse preserving the bend table', () => {
    const result = buildReport(makePart(0.44));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const json = reportToJSON(result.value);
    const parsed = JSON.parse(json) as typeof result.value;
    expect(parsed.bends).toHaveLength(1);
    expect(parsed.bends[0]?.id).toBe('flange-1');
    expect(parsed.totalFlatSize).toHaveLength(2);
  });
});
