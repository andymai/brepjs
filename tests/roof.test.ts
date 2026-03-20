import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { polygon, outerWire, measureVolume, roof } from '@/index.js';
import type { ClosedWire, Dimension } from '@/core/shapeTypes.js';
import type { PlanarWire } from '@/core/validityTypes.js';
import { unwrap } from '@/core/result.js';
import { makeLine } from '@/topology/curveBuilders.js';
import { wire } from '@/topology/primitiveFns.js';

type RoofWire = ClosedWire<Dimension> & PlanarWire<Dimension>;

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('roof', () => {
  it('creates a roof from a rectangular wire', () => {
    const face = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    const w = outerWire(face) as RoofWire;
    const result = roof(w);
    if (!result.ok) console.error('ROOF ERROR:', result.error);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = unwrap(measureVolume(result.value));
    expect(vol).toBeGreaterThan(0);
  });

  it('respects angle option', () => {
    const face = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ])
    );
    const w = outerWire(face) as RoofWire;
    const r1 = roof(w, { angle: 30 });
    const r2 = roof(w, { angle: 60 });
    if (!r1.ok) console.error('R1 ERROR:', r1.error);
    if (!r2.ok) console.error('R2 ERROR:', r2.error);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(unwrap(measureVolume(r2.value))).toBeGreaterThan(unwrap(measureVolume(r1.value)));
  });

  it('returns error for wire with fewer than 3 edges', () => {
    const e1 = makeLine([0, 0, 0], [10, 0, 0]);
    const e2 = makeLine([10, 0, 0], [0, 0, 0]);
    const w = unwrap(wire([e1, e2])) as RoofWire;
    const result = roof(w);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('at least 3 edges');
    }
  });

  it('creates a roof from a triangular wire', () => {
    const face = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [5, 8, 0],
      ])
    );
    const w = outerWire(face) as RoofWire;
    const result = roof(w);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = unwrap(measureVolume(result.value));
    expect(vol).toBeGreaterThan(0);
  });

  it('creates a roof from a pentagonal wire', () => {
    const face = unwrap(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [12, 8, 0],
        [5, 12, 0],
        [-2, 8, 0],
      ])
    );
    const w = outerWire(face) as RoofWire;
    const result = roof(w);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = unwrap(measureVolume(result.value));
    expect(vol).toBeGreaterThan(0);
  });
});
