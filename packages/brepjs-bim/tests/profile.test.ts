import { describe, it, expect } from 'vitest';
import { parseProfile } from '../src/specs/profile.js';
import {
  profileCrossSectionArea,
  profileToPolygon,
} from '../src/elementFns/profileFns.js';
import type { Profile } from '../src/specs/profile.js';

describe('parseProfile', () => {
  it('accepts a rectangular profile', () => {
    const result = parseProfile({ kind: 'RECTANGULAR', width: 200, height: 400 });
    expect(result.ok).toBe(true);
  });

  it('accepts a circular profile', () => {
    const result = parseProfile({ kind: 'CIRCULAR', radius: 150 });
    expect(result.ok).toBe(true);
  });

  it('accepts an I-beam profile', () => {
    const result = parseProfile({
      kind: 'I_BEAM',
      overallWidth: 200,
      overallDepth: 400,
      flangeThickness: 15,
      webThickness: 10,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown kind', () => {
    const result = parseProfile({ kind: 'T_SHAPE', width: 100, height: 200 });
    expect(result.ok).toBe(false);
  });

  it('rejects negative dimensions', () => {
    const result = parseProfile({ kind: 'RECTANGULAR', width: -1, height: 100 });
    expect(result.ok).toBe(false);
  });

  it('rejects I-beam where flanges meet (zero web)', () => {
    const result = parseProfile({
      kind: 'I_BEAM',
      overallWidth: 200,
      overallDepth: 100,
      flangeThickness: 50, // 2 × 50 == overallDepth
      webThickness: 10,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects I-beam where web is wider than flange', () => {
    const result = parseProfile({
      kind: 'I_BEAM',
      overallWidth: 100,
      overallDepth: 400,
      flangeThickness: 15,
      webThickness: 100,
    });
    expect(result.ok).toBe(false);
  });
});

describe('profileCrossSectionArea', () => {
  it('rectangular = width × height', () => {
    const profile: Profile = { kind: 'RECTANGULAR', width: 200, height: 400 };
    expect(profileCrossSectionArea(profile)).toBe(80000);
  });

  it('circular = π × r²', () => {
    const profile: Profile = { kind: 'CIRCULAR', radius: 100 };
    expect(profileCrossSectionArea(profile)).toBeCloseTo(Math.PI * 10000, 5);
  });

  it('I-beam = flange area + web area', () => {
    const profile: Profile = {
      kind: 'I_BEAM',
      overallWidth: 200,
      overallDepth: 400,
      flangeThickness: 15,
      webThickness: 10,
    };
    // 2 × (200 × 15) + (400 - 30) × 10 = 6000 + 3700 = 9700
    expect(profileCrossSectionArea(profile)).toBe(9700);
  });
});

describe('profileToPolygon', () => {
  it('rectangular returns 4 corners centered on origin', () => {
    const result = profileToPolygon({ kind: 'RECTANGULAR', width: 200, height: 400 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pts = result.value;
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual([-100, -200, 0]);
    expect(pts[2]).toEqual([100, 200, 0]);
  });

  it('circular returns N segments centered on origin', () => {
    const result = profileToPolygon({ kind: 'CIRCULAR', radius: 100 }, 16);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pts = result.value;
    expect(pts).toHaveLength(16);
    expect(pts[0]).toEqual([100, 0, 0]);
    // All points equidistant from origin
    for (const [x, y] of pts) {
      expect(Math.sqrt(x * x + y * y)).toBeCloseTo(100, 6);
    }
  });

  it('returns an error if circleSegments < 3', () => {
    const result = profileToPolygon({ kind: 'CIRCULAR', radius: 100 }, 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PROFILE_CIRCLE_SEGMENTS');
  });

  it('I-beam returns 12 points forming the I outline', () => {
    const result = profileToPolygon({
      kind: 'I_BEAM',
      overallWidth: 200,
      overallDepth: 400,
      flangeThickness: 15,
      webThickness: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pts = result.value;
    expect(pts).toHaveLength(12);
    // Bottom-left flange corner
    expect(pts[0]).toEqual([-100, -200, 0]);
    // Top-right flange corner
    expect(pts[6]).toEqual([100, 200, 0]);
  });
});
