import { describe, it, expect } from 'vitest';
import { aimedSection } from '@/snapshot/aiming.js';

const bounds = { xMin: -20, xMax: 20, yMin: -20, yMax: 20, zMin: 0, zMax: 30 };

describe('aimedSection', () => {
  it('returns null with no bores or no bounds', () => {
    expect(aimedSection([], bounds)).toBeNull();
    expect(
      aimedSection([{ radius: 4, axisOrigin: [0, 0, 0], axisDir: [0, 0, 1] }], undefined)
    ).toBeNull();
  });

  it('cuts on a basis axis perpendicular to a Z-aligned bore, through its origin', () => {
    const s = aimedSection([{ radius: 4, axisOrigin: [0, 0, 15], axisDir: [0, 0, 1] }], bounds);
    // Z bore → cut on x or y (both perpendicular); the plane must pass through the bore at x=0.
    expect(s?.axis === 'x' || s?.axis === 'y').toBe(true);
    expect(s?.frac).toBeCloseTo(0.5, 5); // origin 0 within x span [-20,20]
  });

  it('cuts perpendicular to an X-aligned bore (not along it)', () => {
    const s = aimedSection([{ radius: 4, axisOrigin: [0, 0, 15], axisDir: [1, 0, 0] }], bounds);
    expect(s?.axis).not.toBe('x'); // never cut along the bore axis
  });

  it('aims at the DOMINANT (largest-radius) bore and positions through it', () => {
    const s = aimedSection(
      [
        { radius: 2, axisOrigin: [10, 0, 15], axisDir: [0, 0, 1] },
        { radius: 8, axisOrigin: [-10, 0, 15], axisDir: [0, 0, 1] },
      ],
      bounds
    );
    // dominant bore is the r8 at x=-10 → frac = (-10 - -20)/40 = 0.25
    expect(s?.frac).toBeCloseTo(0.25, 5);
  });

  it('clamps frac into [0,1] for an out-of-bounds origin', () => {
    const s = aimedSection([{ radius: 4, axisOrigin: [999, 0, 15], axisDir: [0, 0, 1] }], bounds);
    expect(s?.frac).toBe(1);
  });
});
