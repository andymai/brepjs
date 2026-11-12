import { describe, it, beforeAll, expect } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  blendSurface,
  curvePointAt,
  fairSurface,
  faceGeomType,
  getEdges,
  isFace,
  matchSurface,
  measureArea,
  normalAt,
  polygon,
  unwrap,
  unwrapErr,
  type Edge,
  type Face,
  type Vec3,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const isBrepkit = currentKernel === 'brepkit';
const descBk = isBrepkit ? describe : describe.skip;

/** A flat sheet 4 wide from `x`, 10 deep, at height `z`. */
const sheet = (x: number, z: number): Face =>
  unwrap(
    polygon([
      [x, 0, z],
      [x + 4, 0, z],
      [x + 4, 10, z],
      [x, 10, z],
    ])
  );
/** The edge of a face whose middle is at `mid`. */
const edgeAt = (face: Face, mid: Vec3): Edge => {
  const found = getEdges(face).find((e) =>
    curvePointAt(e, 0.5).every((c, k) => Math.abs(c - (mid[k] ?? 0)) < 1e-6)
  );
  if (!found) throw new Error(`no edge with its middle at ${mid.join(', ')}`);
  return found;
};
const angleBetween = (a: Vec3, b: Vec3): number => {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
  return Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b))));
};

describe('blend, match and fair surfaces', () => {
  it.skipIf(isBrepkit)('reports a kernel without them as unsupported', () => {
    using a = sheet(-4, 0);
    using b = sheet(6, 2);
    const blend = blendSurface(edgeAt(a, [0, 5, 0]), a, edgeAt(b, [6, 5, 2]), b);
    expect(unwrapErr(blend).code).toBe('UNSUPPORTED_CAPABILITY');
    const match = matchSurface(a, edgeAt(a, [0, 5, 0]), edgeAt(b, [6, 5, 2]));
    expect(unwrapErr(match).code).toBe('UNSUPPORTED_CAPABILITY');
    expect(unwrapErr(fairSurface(a, { tolerance: 0.1 })).code).toBe('UNSUPPORTED_CAPABILITY');
  });

  it('refuses an empty chain, a weight that is not positive and a tolerance of zero', () => {
    using a = sheet(-4, 0);
    using b = sheet(6, 2);
    const [ea, eb] = [edgeAt(a, [0, 5, 0]), edgeAt(b, [6, 5, 2])];
    expect(unwrapErr(blendSurface([], a, eb, b)).code).toBe('BLEND_SURFACE_EMPTY_CHAIN');
    expect(unwrapErr(blendSurface(ea, a, eb, b, { weights: [0, 1] })).code).toBe(
      'BLEND_SURFACE_BAD_WEIGHT'
    );
    expect(unwrapErr(fairSurface(a, { tolerance: 0 })).code).toBe('FAIR_SURFACE_BAD_TOLERANCE');
  });
});

descBk('brepkit blend, match and fair surfaces', () => {
  it('bridges two level sheets in the same plane with a flat strip', () => {
    using a = sheet(-4, 0);
    using b = sheet(6, 0);
    using blend = unwrap(blendSurface(edgeAt(a, [0, 5, 0]), a, edgeAt(b, [6, 5, 0]), b));
    expect(isFace(blend)).toBe(true);
    expect(unwrap(measureArea(blend))).toBeCloseTo(60, 6);
  });

  for (const continuity of ['g1', 'g2'] as const) {
    it(`bridges two sheets at different heights, ${continuity} to each`, () => {
      using a = sheet(-4, 0);
      using b = sheet(6, 2);
      using blend = unwrap(
        blendSurface([edgeAt(a, [0, 5, 0])], a, [edgeAt(b, [6, 5, 2])], b, {
          continuity,
          weights: [1, 1.5],
        })
      );
      // Longer than the straight ramp between the edges, and level where it meets each sheet.
      const area = unwrap(measureArea(blend));
      expect(area).toBeGreaterThan(10 * Math.hypot(6, 2) + 0.1);
      expect(area).toBeLessThan(80);
      expect(angleBetween(normalAt(blend, [0, 5, 0]), [0, 0, 1])).toBeLessThan(1e-6);
      expect(angleBetween(normalAt(blend, [6, 5, 2]), [0, 0, 1])).toBeLessThan(1e-6);
      expect(angleBetween(normalAt(blend, [3, 5, 1]), [0, 0, 1])).toBeGreaterThan(0.2);
    });
  }

  it('moves an edge of a blend on to another sheet and meets it level', () => {
    using a = sheet(-4, 0);
    using b = sheet(6, 2);
    using high = sheet(6, 3);
    using blend = unwrap(blendSurface(edgeAt(a, [0, 5, 0]), a, edgeAt(b, [6, 5, 2]), b));
    using matched = unwrap(
      matchSurface(blend, edgeAt(blend, [6, 5, 2]), edgeAt(high, [6, 5, 3]), { continuity: 'g1' })
    );
    expect(faceGeomType(matched)).toBe('BSPLINE_SURFACE');
    expect(angleBetween(normalAt(matched, [6, 5, 3]), [0, 0, 1])).toBeLessThan(1e-6);
    expect(angleBetween(normalAt(matched, [0, 5, 0]), [0, 0, 1])).toBeLessThan(1e-6);
  });

  it('fairs a blend within its tolerance and returns a flat sheet as it is', () => {
    using a = sheet(-4, 0);
    using b = sheet(6, 2);
    using blend = unwrap(blendSurface(edgeAt(a, [0, 5, 0]), a, edgeAt(b, [6, 5, 2]), b));
    using faired = unwrap(fairSurface(blend, { tolerance: 0.05 }));
    expect(Math.abs(unwrap(measureArea(faired)) - unwrap(measureArea(blend)))).toBeLessThan(0.5);
    using flat = unwrap(fairSurface(a, { tolerance: 0.05 }));
    expect(unwrap(measureArea(flat))).toBeCloseTo(40, 6);
  });

  it('reports a chain that is not on its face', () => {
    using a = sheet(-4, 0);
    using b = sheet(6, 2);
    const error = unwrapErr(blendSurface(edgeAt(b, [6, 5, 2]), a, edgeAt(b, [6, 5, 2]), b));
    expect(error.code).toBe('BLEND_SURFACE_FAILED');
  });
});
