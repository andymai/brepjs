import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume } from 'brepjs';
import { slabOpeningToSolid } from '../src/elementFns/slabOpeningFns.js';
import type { SlabOpeningSpec } from '../src/types/bimTypes.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const SLAB_THICKNESS = 200;
const SPEC: SlabOpeningSpec = {
  kind: 'SLAB_OPENING',
  sizeX: 1000,
  sizeY: 1500,
  offsetX: 500,
  offsetY: 800,
};

describe('slabOpeningToSolid', () => {
  it('returns a ValidSolid for a typical stairwell-sized opening', () => {
    const result = slabOpeningToSolid(SPEC, SLAB_THICKNESS);
    expect(result.ok).toBe(true);
    if (result.ok) result.value[Symbol.dispose]();
  });

  it('volume slightly exceeds sizeX × sizeY × thickness due to ε overshoot in Z', () => {
    const result = slabOpeningToSolid(SPEC, SLAB_THICKNESS);
    if (!result.ok) throw new Error(result.error.message);
    using solid = result.value;
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    const nominal = SPEC.sizeX * SPEC.sizeY * SLAB_THICKNESS;
    expect(vol.value).toBeGreaterThan(nominal);
    expect(vol.value).toBeLessThan(nominal * 1.05);
  });

  it('rejects zero sizeX', () => {
    const result = slabOpeningToSolid({ ...SPEC, sizeX: 0 }, SLAB_THICKNESS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
    expect(result.error.code).toBe('SLAB_OPENING_ZERO_SIZE_X');
  });

  it('rejects zero sizeY', () => {
    const result = slabOpeningToSolid({ ...SPEC, sizeY: 0 }, SLAB_THICKNESS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SLAB_OPENING_ZERO_SIZE_Y');
  });

  it('rejects zero slab thickness', () => {
    const result = slabOpeningToSolid(SPEC, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SLAB_OPENING_ZERO_SLAB_THICKNESS');
  });
});
