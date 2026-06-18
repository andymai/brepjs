import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume, isValidSolid, unwrap, mesh } from 'brepjs';
import { parseRoofSpec } from '../src/specs/roofSpec.js';
import { roofToSolid } from '../src/elementFns/roofFns.js';

const base = {
  length: 4000,
  width: 3000,
  thickness: 200,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  predefinedType: 'GABLE_ROOF' as const,
  materialName: 'Tile',
};

describe('roofSpec pitch param', () => {
  it('accepts an optional pitch and preserves it', () => {
    const r = parseRoofSpec({ ...base, pitch: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pitch).toBe(30);
  });

  it('parses without pitch (backward-compatible)', () => {
    const r = parseRoofSpec(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pitch).toBeUndefined();
  });

  it('rejects a non-positive or >=90 pitch', () => {
    expect(parseRoofSpec({ ...base, pitch: 0 }).ok).toBe(false);
    expect(parseRoofSpec({ ...base, pitch: 90 }).ok).toBe(false);
  });
});

describe('roofToSolid shapes', () => {
  beforeAll(async () => {
    await initOCCT();
  }, 30000);

  it('flat (no pitch) stays a valid slab', () => {
    const r = roofToSolid({ ...base, predefinedType: 'FLAT_ROOF' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      using s = r.value;
      expect(isValidSolid(s)).toBe(true);
    }
  });

  for (const t of ['SHED_ROOF', 'GABLE_ROOF', 'HIP_ROOF', 'DOME_ROOF'] as const) {
    it(`${t} with pitch produces a valid solid whose volume differs from the flat slab`, () => {
      const flat = roofToSolid({ ...base, predefinedType: t });
      const shaped = roofToSolid({ ...base, predefinedType: t, pitch: 30 });
      expect(flat.ok && shaped.ok).toBe(true);
      if (!flat.ok || !shaped.ok) return;
      using flatSolid = flat.value;
      using shapedSolid = shaped.value;
      expect(isValidSolid(shapedSolid)).toBe(true);
      const vFlat = unwrap(measureVolume(flatSolid));
      const vShaped = unwrap(measureVolume(shapedSolid));
      expect(vShaped).toBeGreaterThan(0);
      // Shaping must change the volume; identical volume means it stayed a flat box.
      expect(Math.abs(vShaped - vFlat)).toBeGreaterThan(1);
      // Must mesh (the playground/IFC tessellate it) — guards against a curved
      // surface that hangs the occt-wasm mesher (e.g. a sphere-based dome).
      expect(mesh(shapedSolid).triangles.length).toBeGreaterThan(0);
    });
  }
});
