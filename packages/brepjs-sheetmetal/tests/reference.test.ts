import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isErr } from 'brepjs';
import { bendAllowance } from '../src/allowanceFns.js';
import type { BendRule } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

function rule(kFactor: number, innerRadius: number): BendRule {
  return { innerRadius, kFactor };
}

/**
 * Cross-check our bend-allowance math against published reference values.
 *
 * Source: SheetMetal.Me — "Bend Allowance" (https://sheetmetal.me/formulas-and-functions/bend-allowance/),
 * which defines BA = (π/180)·A·(R + K·T) — the same neutral-axis formula used by
 * Machinery's Handbook bend-allowance tables. The constants below are evaluated
 * from that formula at the documented worked-example inputs (US-customary inches
 * and metric mm), to 4–6 decimal places, and are independent of our implementation.
 */

interface RefCase {
  label: string;
  angleDeg: number;
  thickness: number;
  innerRadius: number;
  kFactor: number;
  expectedBA: number;
}

const REFERENCE_CASES: RefCase[] = [
  // SheetMetal.Me worked example: 90°, T=0.036", R=0.039", K=0.446 (their default for soft mild steel).
  // BA = (π/180)·90·(0.039 + 0.446·0.036) = (π/2)·(0.055056) = 0.086482"
  { label: 'SheetMetal.Me 90° example (in)', angleDeg: 90, thickness: 0.036, innerRadius: 0.039, kFactor: 0.446, expectedBA: 0.086482 },
  // Metric 90° canonical: T=R=1 mm, K=0.44 → (π/2)·1.44 = 2.261947 mm.
  { label: '90° metric R=T=1 K=0.44', angleDeg: 90, thickness: 1.0, innerRadius: 1.0, kFactor: 0.44, expectedBA: 2.261947 },
  // 45° half bend, same geometry → exactly half the 90° allowance: (π/4)·1.44 = 1.130973 mm.
  { label: '45° metric R=T=1 K=0.44', angleDeg: 45, thickness: 1.0, innerRadius: 1.0, kFactor: 0.44, expectedBA: 1.130973 },
  // 120° obtuse bend, T=2 mm, R=3 mm, K=0.42 → (π/180)·120·(3 + 0.42·2) = (2π/3)·3.84 = 8.042477 mm.
  { label: '120° metric R=3 T=2 K=0.42', angleDeg: 120, thickness: 2.0, innerRadius: 3.0, kFactor: 0.42, expectedBA: 8.042477 },
  // Machinery's Handbook neutral-axis default K=0.50 (sharp-radius approximation):
  // 90°, T=1.5 mm, R=1.5 mm → (π/2)·(1.5 + 0.5·1.5) = (π/2)·2.25 = 3.534292 mm.
  { label: '90° metric K=0.50 R=T=1.5', angleDeg: 90, thickness: 1.5, innerRadius: 1.5, kFactor: 0.5, expectedBA: 3.534292 },
];

describe('reference table — bend allowance vs published values', () => {
  for (const c of REFERENCE_CASES) {
    it(c.label, () => {
      const r = bendAllowance(c.angleDeg, c.thickness, rule(c.kFactor, c.innerRadius));
      expect(r.ok).toBe(true);
      if (isErr(r)) return;
      // 5-decimal tolerance on the metric (mm) cases, 5 on the sub-inch case is
      // tight relative to the 6-digit reference constants above.
      expect(r.value).toBeCloseTo(c.expectedBA, 5);
    });
  }

  it('allowance scales linearly with bend angle (BA(2A) = 2·BA(A))', () => {
    const a = bendAllowance(30, 1.0, rule(0.44, 1.0));
    const b = bendAllowance(60, 1.0, rule(0.44, 1.0));
    expect(a.ok && b.ok).toBe(true);
    if (isErr(a) || isErr(b)) return;
    expect(b.value).toBeCloseTo(2 * a.value, 9);
  });
});
