import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { wallToSolid } from '../src/elementFns/wallFns.js';
import { parseWallSpec } from '../src/specs/wallSpec.js';
import { measureVolume } from 'brepjs';

beforeAll(async () => { await initOCCT(); }, 30000);

describe('wallToSolid', () => {
  const spec = {
    length: 3000,
    height: 2700,
    thickness: 200,
    origin: [0, 0, 0] as [number, number, number],
    axisX: [1, 0, 0] as [number, number, number],
    axisZ: [0, 0, 1] as [number, number, number],
    materialName: 'Concrete',
  };

  it('returns a ValidSolid', () => {
    const result = wallToSolid(spec);
    expect(result.ok).toBe(true);
  });

  it('volume matches length × height × thickness in mm³', () => {
    const result = wallToSolid(spec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    const expected = 3000 * 2700 * 200;
    expect(vol.value).toBeCloseTo(expected, -3);
  });

  it('rejects zero length', () => {
    const result = wallToSolid({ ...spec, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
    expect(result.error.code).toBe('WALL_ZERO_LENGTH');
  });

  it('rejects zero height', () => {
    const result = wallToSolid({ ...spec, height: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('WALL_ZERO_HEIGHT');
  });

  it('rejects negative thickness', () => {
    const result = wallToSolid({ ...spec, thickness: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
  });
});

describe('parseWallSpec', () => {
  const valid = {
    length: 3000,
    height: 2700,
    thickness: 200,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  };

  it('accepts a valid spec', () => {
    expect(parseWallSpec(valid).ok).toBe(true);
  });

  it('rejects non-unit axisX', () => {
    const result = parseWallSpec({ ...valid, axisX: [2, 0, 0] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_WALL_SPEC');
  });

  it('rejects non-unit axisZ', () => {
    const result = parseWallSpec({ ...valid, axisZ: [0, 0, 2] });
    expect(result.ok).toBe(false);
  });

  it('rejects non-orthogonal axes', () => {
    const result = parseWallSpec({ ...valid, axisX: [1, 0, 0], axisZ: [1, 0, 0] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_WALL_SPEC');
  });

  it('rejects zero or negative dimensions', () => {
    expect(parseWallSpec({ ...valid, length: 0 }).ok).toBe(false);
    expect(parseWallSpec({ ...valid, height: -1 }).ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { materialName: _, ...noMaterial } = valid;
    expect(parseWallSpec(noMaterial).ok).toBe(false);
  });

  it('accepts spec with Pset_WallCommon fields', () => {
    const result = parseWallSpec({
      ...valid,
      isExternal: true,
      fireRating: 'REI90',
      acousticRating: 'Rw55',
      thermalTransmittance: 0.3,
      loadBearing: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isExternal).toBe(true);
    expect(result.value.thermalTransmittance).toBe(0.3);
  });

  it('accepts spec with manufacturer fields', () => {
    const result = parseWallSpec({
      ...valid,
      manufacturerName: 'Wienerberger',
      manufacturerModel: 'Porotherm 20 DF',
      manufacturerProductionYear: 2024,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts spec with customProperties', () => {
    const result = parseWallSpec({
      ...valid,
      customProperties: {
        'Pset_AcousticPerformance': { SoundReductionIndex: 45 },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects non-positive thermalTransmittance', () => {
    const result = parseWallSpec({ ...valid, thermalTransmittance: -1 });
    expect(result.ok).toBe(false);
  });

  it('rejects non-integer manufacturerProductionYear', () => {
    const result = parseWallSpec({ ...valid, manufacturerProductionYear: 2024.5 });
    expect(result.ok).toBe(false);
  });
});
