import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isValid, measureVolume, isErr } from 'brepjs';
import { author, miterCorner, unfold, toDXF, report, reportFrom, reportJSON } from '../src/api.js';
import { sheetMetal } from '../src/facade.js';
import type { BendRule } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const T = 1;
const R = 2;
const K = 0.44;
const rule: BendRule = { innerRadius: R, kFactor: K };

const baseLen = 30;
const width = 30;
const flangeLen = 15;
const gap = 1;

describe('full pipeline — author → miter → unfold → DXF → report', () => {
  it('walks every stage of the headline workflow with Ok results and well-formed artifacts', () => {
    // 1. Author an L-bracket with two perpendicular flanges meeting at a corner.
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'fx', length: flangeLen, angleDeg: 90, rule, side: 'xmax' },
        { id: 'fy', length: flangeLen, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    const part = authored.value;
    expect(part.bends).toHaveLength(2);
    expect(part.solid).toBeDefined();
    if (part.solid === undefined) return;
    expect(isValid(part.solid)).toBe(true);

    // 2. Auto-miter the shared corner with a gap — volume must strictly drop.
    const beforeVol = measureVolume(part.solid);
    expect(beforeVol.ok).toBe(true);
    const mitered = miterCorner(part, 'fx', 'fy', gap);
    expect(mitered.ok).toBe(true);
    if (isErr(mitered)) return;
    const miteredPart = mitered.value;
    expect(miteredPart.solid).toBeDefined();
    if (miteredPart.solid === undefined) return;
    expect(isValid(miteredPart.solid)).toBe(true);
    const afterVol = measureVolume(miteredPart.solid);
    expect(afterVol.ok && beforeVol.ok).toBe(true);
    if (isErr(afterVol) || isErr(beforeVol)) return;
    expect(afterVol.value).toBeGreaterThan(0);
    expect(afterVol.value).toBeLessThan(beforeVol.value);

    // 3. Unfold the mitered part into a developed flat pattern.
    const unfolded = unfold(miteredPart);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;
    const { pattern, report: inlineReport, warnings } = unfolded.value;
    expect(pattern.developedArea).toBeGreaterThan(0);
    expect(pattern.bendLines).toHaveLength(2);
    expect(pattern.outline).toBeDefined();
    // The miter feeds a closed-corner topology; warnings ride inside the Ok payload.
    expect(Array.isArray(warnings)).toBe(true);
    expect(inlineReport.bends).toHaveLength(2);

    // 4. Export an annotated multi-layer DXF of the flat pattern.
    const dxf = toDXF(pattern);
    expect(dxf.ok).toBe(true);
    if (isErr(dxf)) return;
    const text = dxf.value;
    expect(text).toContain('SECTION');
    expect(text).toContain('LWPOLYLINE');
    expect(text).toContain('BEND_UP');
    expect(text.trimEnd().endsWith('EOF')).toBe(true);
    // One annotation per bend line.
    const annotations = text.split('\n').filter((l) => l.startsWith('∠'));
    expect(annotations).toHaveLength(2);

    // 5. Build the bend report two ways; both must agree with the unfold.
    const built = report(miteredPart);
    expect(built.ok).toBe(true);
    if (isErr(built)) return;
    expect(built.value.bends).toHaveLength(2);

    const projected = reportFrom(unfolded.value);
    expect(projected.ok).toBe(true);
    if (isErr(projected)) return;
    expect(projected.value.bends).toHaveLength(built.value.bends.length);
    expect(projected.value.totalFlatSize[0]).toBeCloseTo(built.value.totalFlatSize[0], 6);

    // 6. Serialize the report to JSON and round-trip it.
    const json = reportJSON(built.value);
    const parsed = JSON.parse(json) as typeof built.value;
    expect(parsed.bends).toHaveLength(2);
    expect(parsed.totalFlatSize).toHaveLength(2);
  });

  it('drives the same pipeline through the fluent facade', () => {
    const result = sheetMetal({ length: baseLen, width }, T)
      .flange({ id: 'fx', length: flangeLen, angleDeg: 90, rule, side: 'xmax' })
      .flange({ id: 'fy', length: flangeLen, angleDeg: 90, rule, side: 'ymax' })
      .miterCorner('fx', 'fy', gap)
      .unfold();

    expect(result.pattern.bendLines).toHaveLength(2);
    expect(result.pattern.developedArea).toBeGreaterThan(0);
    expect(result.report.bends).toHaveLength(2);
  });
});
