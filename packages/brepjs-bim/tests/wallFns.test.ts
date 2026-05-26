import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { wallToSolid } from '../src/elementFns/wallFns.js';
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

  it('rejects negative thickness', () => {
    const result = wallToSolid({ ...spec, thickness: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
  });
});
