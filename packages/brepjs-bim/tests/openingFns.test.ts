import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume } from 'brepjs';
import { parseDoorSpec, parseWindowSpec } from '../src/specs/openingSpec.js';
import { openingToSolid } from '../src/elementFns/openingFns.js';

describe('parseDoorSpec', () => {
  const BASE = {
    width: 900, height: 2100, offsetAlongWall: 500, offsetFromFloor: 0,
    wallLocalId: 1, materialName: 'Wood',
  };

  it('accepts minimal valid door spec', () => {
    const result = parseDoorSpec(BASE);
    expect(result.ok).toBe(true);
  });

  it('accepts optional Pset fields', () => {
    const result = parseDoorSpec({ ...BASE, isExternal: true, fireRating: 'EI60', acousticRating: 'Rw 35' });
    expect(result.ok).toBe(true);
  });

  it('rejects non-positive width', () => {
    const result = parseDoorSpec({ ...BASE, width: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects non-positive height', () => {
    const result = parseDoorSpec({ ...BASE, height: -1 });
    expect(result.ok).toBe(false);
  });

  it('rejects negative offsetFromFloor', () => {
    const result = parseDoorSpec({ ...BASE, offsetFromFloor: -1 });
    expect(result.ok).toBe(false);
  });
});

describe('parseWindowSpec', () => {
  const BASE = {
    width: 1200, height: 1400, offsetAlongWall: 1000, offsetFromFloor: 900,
    wallLocalId: 1, materialName: 'Aluminum',
  };

  it('accepts minimal valid window spec', () => {
    const result = parseWindowSpec(BASE);
    expect(result.ok).toBe(true);
  });

  it('accepts thermalTransmittance', () => {
    const result = parseWindowSpec({ ...BASE, thermalTransmittance: 1.1 });
    expect(result.ok).toBe(true);
  });

  it('rejects non-positive thermalTransmittance', () => {
    const result = parseWindowSpec({ ...BASE, thermalTransmittance: 0 });
    expect(result.ok).toBe(false);
  });
});

describe('openingToSolid', () => {
  beforeAll(async () => {
    await initOCCT();
  }, 30000);

  const WALL_THICKNESS = 200;
  const SPEC = {
    width: 900,
    height: 2100,
    offsetAlongWall: 1000,
    offsetFromFloor: 0,
  };

  it('returns a ValidSolid for a typical door-sized opening', () => {
    const result = openingToSolid(SPEC, WALL_THICKNESS);
    expect(result.ok).toBe(true);
    if (result.ok) result.value[Symbol.dispose]();
  });

  it('volume slightly exceeds width × height × thickness due to ε overshoot', () => {
    const result = openingToSolid(SPEC, WALL_THICKNESS);
    if (!result.ok) throw new Error(result.error.message);
    using solid = result.value;
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    const nominal = SPEC.width * SPEC.height * WALL_THICKNESS;
    expect(vol.value).toBeGreaterThan(nominal);
    expect(vol.value).toBeLessThan(nominal * 1.05);
  });

  it('rejects zero width', () => {
    const result = openingToSolid({ ...SPEC, width: 0 }, WALL_THICKNESS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
    expect(result.error.code).toBe('OPENING_ZERO_WIDTH');
  });

  it('rejects zero height', () => {
    const result = openingToSolid({ ...SPEC, height: 0 }, WALL_THICKNESS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
  });

  it('rejects zero wall thickness', () => {
    const result = openingToSolid(SPEC, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
  });
});
