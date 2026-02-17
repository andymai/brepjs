import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { polygon, outerWire, measureVolume, roof } from '../src/index.js';
import { unwrap } from '../src/core/result.js';

beforeAll(async () => {
  await initOC();
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
});
