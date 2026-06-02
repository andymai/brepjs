import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { bendAllowance, developedLength, neutralRadius } from '../src/allowanceFns.js';
import { unfold } from '../src/unfoldFns.js';
import type { BendRule, SheetMetalPart } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const HALF_PI = Math.PI / 2;

function rule(kFactor: number, innerRadius: number): BendRule {
  return { innerRadius, kFactor };
}

describe('bendAllowance — 90° bend vs hand-computed BA', () => {
  const thickness = 1.0;
  const radius = 1.0;

  const cases: { k: number; expected: number }[] = [
    { k: 0.33, expected: HALF_PI * (radius + 0.33 * thickness) },
    { k: 0.44, expected: HALF_PI * (radius + 0.44 * thickness) },
    { k: 0.5, expected: HALF_PI * (radius + 0.5 * thickness) },
  ];

  for (const { k, expected } of cases) {
    it(`K=${k} → BA ≈ (π/2)·(R + K·T)`, () => {
      const r = bendAllowance(90, thickness, rule(k, radius));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toBeCloseTo(expected, 6);
    });
  }

  it('K=0.44 reference value ≈ 2.26195 mm for R=T=1', () => {
    const r = bendAllowance(90, thickness, rule(0.44, radius));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(2.261947, 5);
  });

  it('developedLength equals bendAllowance', () => {
    const a = bendAllowance(90, thickness, rule(0.44, radius));
    const d = developedLength(90, thickness, rule(0.44, radius));
    expect(a.ok && d.ok).toBe(true);
    if (!a.ok || !d.ok) return;
    expect(d.value).toBeCloseTo(a.value, 9);
  });

  it('neutralRadius = R + K·T', () => {
    const r = neutralRadius(thickness, rule(0.5, radius));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(1.5, 9);
  });

  it('allowance override bypasses the formula', () => {
    const r = bendAllowance(90, thickness, { innerRadius: radius, kFactor: 0.44, allowance: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(5);
  });

  it('rejects out-of-range K-factor', () => {
    const r = bendAllowance(90, thickness, rule(1.5, radius));
    expect(r.ok).toBe(false);
  });

  it('rejects non-positive thickness', () => {
    const r = bendAllowance(90, 0, rule(0.44, radius));
    expect(r.ok).toBe(false);
  });
});

describe('unfold — flat lengths across K', () => {
  const thickness = 1.0;
  const radius = 1.0;
  const baseLen = 30;
  const flangeLen = 20;

  function makePart(k: number): SheetMetalPart {
    return {
      thickness,
      baseLength: baseLen,
      width: flangeLen,
      flanges: [{ id: 'flange-1', baseEdge: { kind: 'index', faceIndex: 0, edgeIndex: 0 }, length: flangeLen, span: flangeLen, angleDeg: 90, rule: rule(k, radius) }],
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

  for (const k of [0.33, 0.44, 0.5]) {
    it(`K=${k} east run = baseLength + BA + flange`, () => {
      const expectedBA = HALF_PI * (radius + k * thickness);
      const result = unfold(makePart(k));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const [maxX] = result.value.report.totalFlatSize;
      expect(maxX).toBeCloseTo(baseLen + expectedBA + flangeLen, 5);

      expect(result.value.report.bends).toHaveLength(1);
      const bend = result.value.report.bends[0];
      expect(bend).toBeDefined();
      if (bend === undefined) return;
      expect(bend.allowance).toBeCloseTo(expectedBA, 5);
      // flatLength is the straight flange leg, distinct from the bend allowance
      expect(bend.flatLength).toBe(flangeLen);

      expect(result.value.pattern.bendLines).toHaveLength(1);
      expect(result.value.pattern.developedArea).toBeGreaterThan(0);
    });
  }

  it('warns when inner radius < thickness', () => {
    const part = makePart(0.44);
    part.thickness = 2.0; // radius 1.0 < thickness 2.0
    const result = unfold(part);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings.some((w) => w.code === 'MIN_RADIUS')).toBe(true);
  });
});
