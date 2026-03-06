import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { polygon, outerWire, measureVolume, roof } from '../src/index.js';
import { unwrap } from '../src/core/result.js';
import { makeLine } from '../src/topology/curveBuilders.js';
import { wire } from '../src/topology/primitiveFns.js';

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
    const wire = outerWire(face);
    const result = roof(wire);
    if (!result.ok) console.error('ROOF ERROR:', result.error);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = measureVolume(result.value);
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
    const wire = outerWire(face);
    const r1 = roof(wire, { angle: 30 });
    const r2 = roof(wire, { angle: 60 });
    if (!r1.ok) console.error('R1 ERROR:', r1.error);
    if (!r2.ok) console.error('R2 ERROR:', r2.error);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(measureVolume(r2.value)).toBeGreaterThan(measureVolume(r1.value));
  });

  it('returns error for wire with fewer than 3 edges', () => {
    const e1 = makeLine([0, 0, 0], [10, 0, 0]);
    const e2 = makeLine([10, 0, 0], [0, 0, 0]);
    const w = unwrap(wire([e1, e2]));
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
    const wire = outerWire(face);
    const result = roof(wire);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = measureVolume(result.value);
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
    const wire = outerWire(face);
    const result = roof(wire);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = measureVolume(result.value);
    expect(vol).toBeGreaterThan(0);
  });
});
