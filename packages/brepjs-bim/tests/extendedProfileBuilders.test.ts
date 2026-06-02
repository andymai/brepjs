import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume, unwrap } from 'brepjs';
import { beamToSolid } from '../src/elementFns/beamFns.js';
import { columnToSolid } from '../src/elementFns/columnFns.js';
import { pileToSolid } from '../src/elementFns/foundationFns.js';
import type { ExtendedProfile } from '../src/specs/profilesExtended.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

// An L-section is an extended profile: beams/columns/piles must build it via
// extendedProfileToFace() rather than the single-polygon profileToPolygon() path.
const L_PROFILE: ExtendedProfile = {
  kind: 'L_SHAPE',
  depth: 200,
  width: 150,
  legThickness: 20,
};

describe('extended profiles in beam/column/pile builders', () => {
  it('beamToSolid accepts an extended profile and yields a positive-volume solid', () => {
    const result = beamToSolid({
      length: 5000,
      profile: L_PROFILE,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Steel',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    using solid = result.value;
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('columnToSolid accepts an extended profile and yields a positive-volume solid', () => {
    const result = columnToSolid({
      height: 3000,
      profile: L_PROFILE,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Steel',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    using solid = result.value;
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('pileToSolid accepts an extended profile and yields a positive-volume solid', () => {
    const result = pileToSolid({
      length: 4000,
      profile: L_PROFILE,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    using solid = result.value;
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });
});
