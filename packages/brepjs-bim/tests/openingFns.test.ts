import { describe, it, expect } from 'vitest';
import { parseDoorSpec, parseWindowSpec } from '../src/specs/openingSpec.js';

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
