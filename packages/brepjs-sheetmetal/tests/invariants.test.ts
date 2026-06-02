import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isValid } from 'brepjs';
import { author, unfold } from '../src/api.js';
import { isErr } from 'brepjs';
import type { BendRule, SheetMetalPart } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const T = 1;
const R = 2;

function rule(k: number): BendRule {
  return { innerRadius: R, kFactor: k };
}

/**
 * §8 developed-area invariant: the flat pattern area equals the sum of the flat
 * faces plus the developed bend strips — NOT the folded solid's raw surface area
 * (picked-face area is not conserved across a bend). The oracle is rebuilt
 * independently from the AUTHORED dimensions (the part's base footprint, each
 * flange's own span for its flat and its bend strip), not from the unfold's own
 * `developedArea` sum — so it can detect a wrong cross-width.
 */
function expectedDevelopedArea(part: SheetMetalPart): number {
  let area = part.baseLength * part.width;
  for (const flange of part.flanges) {
    const expectedBA = HALF_PI * (flange.rule.innerRadius + flange.rule.kFactor * part.thickness);
    area += flange.length * flange.span;
    area += expectedBA * flange.span;
  }
  return area;
}

const HALF_PI = Math.PI / 2;

describe('§8 invariant — developed area = Σ(flat faces) + Σ(bend strips)', () => {
  for (const k of [0.33, 0.44, 0.5]) {
    it(`single 90° flange, K=${k}`, () => {
      const flangeLen = 20;
      const authored = author({
        thickness: T,
        base: { length: 30, width: 10 },
        flanges: [{ id: 'f1', length: flangeLen, angleDeg: 90, rule: rule(k) }],
      });
      expect(authored.ok).toBe(true);
      if (isErr(authored)) return;
      const part = authored.value;
      expect(part.solid).toBeDefined();
      if (part.solid === undefined) return;
      expect(isValid(part.solid)).toBe(true);

      const unfolded = unfold(part);
      expect(unfolded.ok).toBe(true);
      if (isErr(unfolded)) return;
      const { pattern, report } = unfolded.value;

      const expected = expectedDevelopedArea(part);
      expect(pattern.developedArea).toBeCloseTo(expected, 6);
      expect(report.bends).toHaveLength(1);
    });
  }

  it('two-flange corner — area decomposes into flats + strips', () => {
    const flangeLen = 15;
    const authored = author({
      thickness: T,
      base: { length: 30, width: 30 },
      flanges: [
        { id: 'fx', length: flangeLen, angleDeg: 90, rule: rule(0.44), side: 'xmax' },
        { id: 'fy', length: flangeLen, angleDeg: 90, rule: rule(0.44), side: 'ymax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    const part = authored.value;
    expect(part.solid).toBeDefined();
    if (part.solid === undefined) return;
    expect(isValid(part.solid)).toBe(true);

    const unfolded = unfold(part);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;
    const { pattern } = unfolded.value;

    const expected = expectedDevelopedArea(part);
    expect(pattern.developedArea).toBeCloseTo(expected, 6);
  });

  it('east run = baseLength + flange flat + developed strip', () => {
    const baseLen = 30;
    const flangeLen = 20;
    const authored = author({
      thickness: T,
      base: { length: baseLen, width: 10 },
      flanges: [{ id: 'f1', length: flangeLen, angleDeg: 90, rule: rule(0.44) }],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;

    const unfolded = unfold(authored.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;
    const { report } = unfolded.value;

    const strip = report.bends.reduce((sum, b) => sum + b.allowance, 0);
    const [maxX] = report.totalFlatSize;
    expect(maxX).toBeCloseTo(baseLen + flangeLen + strip, 6);
  });
});
