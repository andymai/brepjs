import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { authorPart } from '../src/authorFns.js';
import { validatePart } from '../src/validateFns.js';
import type { SheetMetalPart, SheetMetalWarning } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

function codes(warnings: SheetMetalWarning[]): string[] {
  return warnings.map((w) => w.code);
}

describe('validatePart — folded-solid validity', () => {
  it('passes a well-formed L-bracket with no warnings', () => {
    const result = authorPart({
      thickness: 1,
      base: { length: 30, width: 10 },
      flanges: [{ id: 'f1', length: 20, angleDeg: 90, rule: { innerRadius: 2, kFactor: 0.44 } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(validatePart(result.value)).toEqual([]);
  });

  it('flags a part with no folded solid', () => {
    const part: SheetMetalPart = { thickness: 1, baseLength: 30, width: 10, flanges: [], bends: [] };
    const warnings = validatePart(part);
    expect(codes(warnings)).toContain('INVALID_SOLID');
    const invalid = warnings.find((w) => w.code === 'INVALID_SOLID');
    expect(invalid?.message).toMatch(/no folded solid/);
  });
});

describe('validatePart — min bend radius (R < 1×T)', () => {
  it('warns when the inner radius is below one thickness', () => {
    const result = authorPart({
      thickness: 2,
      base: { length: 30, width: 10 },
      flanges: [{ id: 'tight', length: 20, angleDeg: 90, rule: { innerRadius: 0.5, kFactor: 0.44 } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const warnings = validatePart(result.value);
    const minR = warnings.find((w) => w.code === 'MIN_RADIUS');
    expect(minR).toBeDefined();
    expect(minR?.featureId).toBe('tight');
    expect(minR?.message).toMatch(/inner radius 0\.5 < thickness 2/);
  });

  it('does not warn when the inner radius equals one thickness', () => {
    const result = authorPart({
      thickness: 2,
      base: { length: 30, width: 10 },
      flanges: [{ id: 'ok', length: 20, angleDeg: 90, rule: { innerRadius: 2, kFactor: 0.44 } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(codes(validatePart(result.value))).not.toContain('MIN_RADIUS');
  });

  it('warns per offending bend independently', () => {
    const result = authorPart({
      thickness: 2,
      base: { length: 40, width: 40 },
      flanges: [
        { id: 'fx', length: 12, angleDeg: 90, rule: { innerRadius: 0.5, kFactor: 0.44 }, side: 'xmax' },
        { id: 'fy', length: 12, angleDeg: 90, rule: { innerRadius: 5, kFactor: 0.44 }, side: 'ymax' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const minR = validatePart(result.value).filter((w) => w.code === 'MIN_RADIUS');
    expect(minR).toHaveLength(1);
    expect(minR[0]?.featureId).toBe('fx');
  });
});

describe('validatePart — flange collision', () => {
  it('flags two un-mitered perpendicular flanges that share a corner', () => {
    const result = authorPart({
      thickness: 1,
      base: { length: 30, width: 30 },
      flanges: [
        { id: 'fx', length: 15, angleDeg: 90, rule: { innerRadius: 2, kFactor: 0.44 }, side: 'xmax' },
        { id: 'fy', length: 15, angleDeg: 90, rule: { innerRadius: 2, kFactor: 0.44 }, side: 'ymax' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const collision = validatePart(result.value).find((w) => w.code === 'COLLISION');
    expect(collision).toBeDefined();
    expect(collision?.message).toMatch(/overlap once folded/);
  });

  it('does not flag a single-flange part', () => {
    const result = authorPart({
      thickness: 1,
      base: { length: 30, width: 10 },
      flanges: [{ id: 'f1', length: 20, angleDeg: 90, rule: { innerRadius: 2, kFactor: 0.44 } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(codes(validatePart(result.value))).not.toContain('COLLISION');
  });
});

describe('validatePart — combined report', () => {
  it('returns warnings and never throws', () => {
    const result = authorPart({
      thickness: 2,
      base: { length: 30, width: 30 },
      flanges: [
        { id: 'fx', length: 15, angleDeg: 90, rule: { innerRadius: 0.5, kFactor: 0.44 }, side: 'xmax' },
        { id: 'fy', length: 15, angleDeg: 90, rule: { innerRadius: 0.5, kFactor: 0.44 }, side: 'ymax' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const warnings = validatePart(result.value);
    expect(codes(warnings)).toContain('COLLISION');
    expect(codes(warnings)).toContain('MIN_RADIUS');
    expect(codes(warnings)).not.toContain('INVALID_SOLID');
  });
});
