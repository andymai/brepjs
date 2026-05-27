import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume } from 'brepjs';
import { columnToSolid } from '../src/elementFns/columnFns.js';
import { parseColumnSpec } from '../src/specs/columnSpec.js';
import type { ColumnSpec } from '../src/specs/columnSpec.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const BASE: ColumnSpec = {
  height: 3000,
  profile: { kind: 'RECTANGULAR', width: 300, height: 300 },
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
};

describe('columnToSolid', () => {
  it('rectangular column returns ValidSolid with correct volume', () => {
    const result = columnToSolid(BASE);
    if (!result.ok) throw new Error(result.error.message);
    using solid = result.value;
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeCloseTo(300 * 300 * 3000, -2);
  });

  it('circular column returns ValidSolid with correct volume', () => {
    const result = columnToSolid({
      ...BASE,
      profile: { kind: 'CIRCULAR', radius: 200 },
    });
    if (!result.ok) throw new Error(result.error.message);
    using solid = result.value;
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    const nominal = Math.PI * 200 * 200 * 3000;
    expect(vol.value).toBeGreaterThan(nominal * 0.99);
    expect(vol.value).toBeLessThan(nominal * 1.01);
  });

  it('I-beam column returns ValidSolid with cross-section-area × height', () => {
    const result = columnToSolid({
      ...BASE,
      profile: {
        kind: 'I_BEAM',
        overallWidth: 200,
        overallDepth: 400,
        flangeThickness: 15,
        webThickness: 10,
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    using solid = result.value;
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeCloseTo(3000 * 9700, -2);
  });

  it('rejects zero height', () => {
    const result = columnToSolid({ ...BASE, height: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COLUMN_ZERO_HEIGHT');
  });
});

describe('parseColumnSpec', () => {
  it('accepts a minimal valid column', () => {
    const result = parseColumnSpec(BASE);
    expect(result.ok).toBe(true);
  });

  it('accepts all predefined types', () => {
    for (const t of ['COLUMN', 'PILASTER', 'NOTDEFINED'] as const) {
      const result = parseColumnSpec({ ...BASE, predefinedType: t });
      expect(result.ok).toBe(true);
    }
  });

  it('rejects an invalid profile', () => {
    const result = parseColumnSpec({
      ...BASE,
      profile: { kind: 'CIRCULAR', radius: 0 },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-orthogonal axes', () => {
    const result = parseColumnSpec({ ...BASE, axisZ: [1, 0, 0] });
    expect(result.ok).toBe(false);
  });
});
