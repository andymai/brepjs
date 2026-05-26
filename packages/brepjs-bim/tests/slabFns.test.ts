import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume } from 'brepjs';
import { slabToSolid } from '../src/elementFns/slabFns.js';
import { parseSlabSpec } from '../src/specs/slabSpec.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const SPEC = {
  length: 5000,
  width: 4000,
  thickness: 200,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  predefinedType: 'FLOOR' as const,
  materialName: 'Concrete',
};

describe('slabToSolid', () => {
  it('returns a ValidSolid', () => {
    const result = slabToSolid(SPEC);
    expect(result.ok).toBe(true);
    if (result.ok) result.value[Symbol.dispose]();
  });

  it('volume equals length × width × thickness', () => {
    const result = slabToSolid(SPEC);
    if (!result.ok) throw new Error(result.error.message);
    using solid = result.value;
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeCloseTo(5000 * 4000 * 200, -2);
  });

  it('rejects zero length', () => {
    const result = slabToSolid({ ...SPEC, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SLAB_ZERO_LENGTH');
  });

  it('rejects zero width', () => {
    const result = slabToSolid({ ...SPEC, width: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SLAB_ZERO_WIDTH');
  });

  it('rejects zero thickness', () => {
    const result = slabToSolid({ ...SPEC, thickness: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SLAB_ZERO_THICKNESS');
  });
});

describe('parseSlabSpec', () => {
  it('accepts minimal valid slab spec', () => {
    const result = parseSlabSpec(SPEC);
    expect(result.ok).toBe(true);
  });

  it('accepts ROOF predefinedType', () => {
    const result = parseSlabSpec({ ...SPEC, predefinedType: 'ROOF' });
    expect(result.ok).toBe(true);
  });

  it('accepts LANDING predefinedType', () => {
    const result = parseSlabSpec({ ...SPEC, predefinedType: 'LANDING' });
    expect(result.ok).toBe(true);
  });

  it('accepts BASESLAB predefinedType', () => {
    const result = parseSlabSpec({ ...SPEC, predefinedType: 'BASESLAB' });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown predefinedType', () => {
    const result = parseSlabSpec({ ...SPEC, predefinedType: 'CEILING' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-orthogonal axes', () => {
    const result = parseSlabSpec({ ...SPEC, axisZ: [1, 0, 0] });
    expect(result.ok).toBe(false);
  });

  it('accepts optional Pset fields', () => {
    const result = parseSlabSpec({
      ...SPEC,
      isExternal: true,
      fireRating: 'REI120',
      loadBearing: true,
      compartmentation: true,
      combustible: false,
    });
    expect(result.ok).toBe(true);
  });
});
