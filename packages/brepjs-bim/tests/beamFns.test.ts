import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume } from 'brepjs';
import { beamToSolid } from '../src/elementFns/beamFns.js';
import { parseBeamSpec } from '../src/specs/beamSpec.js';
import type { BeamSpec } from '../src/specs/beamSpec.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const BASE: BeamSpec = {
  length: 5000,
  profile: { kind: 'RECTANGULAR', width: 200, height: 400 },
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
};

describe('beamToSolid', () => {
  it('rectangular beam returns ValidSolid with correct volume', () => {
    const result = beamToSolid(BASE);
    if (!result.ok) throw new Error(result.error.message);
    using solid = result.value;
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeCloseTo(5000 * 200 * 400, -2);
  });

  it('circular beam returns ValidSolid with correct volume', () => {
    const result = beamToSolid({
      ...BASE,
      profile: { kind: 'CIRCULAR', radius: 100 },
    });
    if (!result.ok) throw new Error(result.error.message);
    using solid = result.value;
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    // Tessellated circle approximates the true π·r² area; accept within 1%.
    const nominal = 5000 * Math.PI * 100 * 100;
    expect(vol.value).toBeGreaterThan(nominal * 0.99);
    expect(vol.value).toBeLessThan(nominal * 1.01);
  });

  it('I-beam returns ValidSolid with cross-section-area × length', () => {
    const result = beamToSolid({
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
    // 2 × (200 × 15) + (400 - 30) × 10 = 9700; × 5000 length = 48 500 000
    expect(vol.value).toBeCloseTo(5000 * 9700, -2);
  });

  it('rejects zero length', () => {
    const result = beamToSolid({ ...BASE, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BEAM_ZERO_LENGTH');
  });
});

describe('parseBeamSpec', () => {
  it('accepts a minimal valid beam', () => {
    const result = parseBeamSpec(BASE);
    expect(result.ok).toBe(true);
  });

  it('accepts all predefined types', () => {
    for (const t of ['BEAM', 'JOIST', 'LINTEL', 'NOTDEFINED'] as const) {
      const result = parseBeamSpec({ ...BASE, predefinedType: t });
      expect(result.ok).toBe(true);
    }
  });

  it('rejects an invalid profile', () => {
    const result = parseBeamSpec({
      ...BASE,
      profile: { kind: 'RECTANGULAR', width: -1, height: 100 },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an I-beam with degenerate flanges', () => {
    const result = parseBeamSpec({
      ...BASE,
      profile: {
        kind: 'I_BEAM',
        overallWidth: 200,
        overallDepth: 100,
        flangeThickness: 50,
        webThickness: 10,
      },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-orthogonal axes', () => {
    const result = parseBeamSpec({ ...BASE, axisZ: [1, 0, 0] });
    expect(result.ok).toBe(false);
  });
});
