import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  thread,
  cylinder,
  fuse,
  measureVolume,
  getBounds,
  isShape3D,
  isOk,
  isErr,
  unwrap,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('thread', () => {
  it('builds an external thread ridge that projects to the major radius', () => {
    const r = thread({ radius: 6, pitch: 2.5, height: 7.5 });
    expect(isOk(r)).toBe(true);
    const ridge = unwrap(r);
    expect(isShape3D(ridge)).toBe(true);
    // depth defaults to 0.6 * pitch = 1.5 -> major radius 6 + 1.5 = 7.5
    expect(getBounds(ridge).xMax).toBeCloseTo(7.5, 0);
    expect(unwrap(measureVolume(ridge))).toBeGreaterThan(0);
  });

  it('fuses to a core to make a valid threaded rod', () => {
    const ridge = unwrap(thread({ radius: 6, pitch: 2.5, height: 7.5 }));
    const rod = fuse(cylinder(6.15, 7.5), ridge);
    expect(isOk(rod)).toBe(true);
    expect(unwrap(measureVolume(unwrap(rod)))).toBeGreaterThan(0);
  });

  it('builds an inward (internal) thread that stays within the nominal radius', () => {
    const r = thread({ radius: 4, pitch: 1, height: 4, inward: true });
    expect(isOk(r)).toBe(true);
    expect(getBounds(unwrap(r)).xMax).toBeLessThanOrEqual(4.5);
  });

  it('supports left-handed threads', () => {
    expect(isOk(thread({ radius: 6, pitch: 2.5, height: 5, lefthand: true }))).toBe(true);
  });

  it('builds a flat-crest (Acme/trapezoidal) thread ridge', () => {
    const r = thread({
      radius: 6,
      pitch: 4,
      height: 8,
      depth: 2,
      toothHalfWidth: 1.5,
      crest: 0.7,
    });
    expect(isOk(r)).toBe(true);
    const ridge = unwrap(r);
    expect(isShape3D(ridge)).toBe(true);
    // crest sits at radius + depth = 8
    expect(getBounds(ridge).xMax).toBeCloseTo(8, 0);
    expect(unwrap(measureVolume(ridge))).toBeGreaterThan(0);
  });

  it('rejects invalid parameters', () => {
    expect(isErr(thread({ radius: 0, pitch: 1, height: 2 }))).toBe(true);
    expect(isErr(thread({ radius: 5, pitch: 0, height: 2 }))).toBe(true);
    expect(isErr(thread({ radius: 5, pitch: 1, height: 0 }))).toBe(true);
    // crest must be < toothHalfWidth
    expect(isErr(thread({ radius: 5, pitch: 2, height: 2, toothHalfWidth: 0.8, crest: 0.8 }))).toBe(
      true
    );
  });
});
