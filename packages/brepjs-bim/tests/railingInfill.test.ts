import { describe, it, expect, beforeAll } from 'vitest';
import { measureVolume, isValidSolid, unwrap } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { parseRailingSpec } from '../src/specs/railingSpec.js';
import { railingToSolid } from '../src/elementFns/railingFns.js';

const base = {
  length: 2000,
  height: 1000,
  thickness: 50,
  origin: [0, 0, 0] as [number, number, number],
  axisX: [1, 0, 0] as [number, number, number],
  axisZ: [0, 0, 1] as [number, number, number],
  predefinedType: 'GUARDRAIL' as const,
  materialName: 'Steel',
};

describe('railingSpec infill', () => {
  it('defaults to undefined (PANEL behavior) when omitted', () => {
    const r = parseRailingSpec(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.infill).toBeUndefined();
  });

  it('accepts POSTED', () => {
    const r = parseRailingSpec({ ...base, infill: 'POSTED' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.infill).toBe('POSTED');
  });

  it('rejects an unknown infill', () => {
    expect(parseRailingSpec({ ...base, infill: 'GLASS' }).ok).toBe(false);
  });
});

describe('railingToSolid infill geometry', () => {
  beforeAll(async () => {
    await initOCCT();
  }, 30000);

  it('PANEL (default) builds one valid solid', () => {
    using solid = unwrap(railingToSolid({ ...base }));
    expect(isValidSolid(solid)).toBe(true);
  });

  it('POSTED builds a valid solid lighter than the full panel', () => {
    using panel = unwrap(railingToSolid({ ...base }));
    using posted = unwrap(railingToSolid({ ...base, infill: 'POSTED' }));
    expect(isValidSolid(posted)).toBe(true);
    const vPanel = unwrap(measureVolume(panel));
    const vPosted = unwrap(measureVolume(posted));
    expect(vPosted).toBeGreaterThan(0);
    // Posts + two rails are far lighter than a solid panel of the same envelope.
    expect(vPosted).toBeLessThan(vPanel);
  });
});
