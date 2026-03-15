import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  sketchCircle,
  line,
  wire,
  castShape,
  sweep,
  isOk,
  unwrap,
  isSolid,
  isShape3D,
  measureVolume,
} from '../src/index.js';
import type { Wire } from '../src/core/shapeTypes.js';

describe('sweepFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  it('sweeps a circle along a line', () => {
    const c = sketchCircle(2);
    const profile = castShape(c.wire.wrapped) as Wire;
    const e = line([0, 0, 0], [0, 0, 20]);
    const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
    const result = sweep(profile, spine);
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('sweeps a circle along a line with transition mode 0 (Transformed)', () => {
    const c = sketchCircle(2);
    const profile = castShape(c.wire.wrapped) as Wire;
    const e = line([0, 0, 0], [0, 0, 20]);
    const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
    const result = sweep(profile, spine, { transitionMode: 0 });
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
  });

  it('sweeps a circle along a line with transition mode 1 (RightCorner)', () => {
    const c = sketchCircle(2);
    const profile = castShape(c.wire.wrapped) as Wire;
    const e = line([0, 0, 0], [0, 0, 20]);
    const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
    const result = sweep(profile, spine, { transitionMode: 1 });
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('sweeps a circle along a line with transition mode 2 (RoundCorner)', () => {
    const c = sketchCircle(2);
    const profile = castShape(c.wire.wrapped) as Wire;
    const e = line([0, 0, 0], [0, 0, 20]);
    const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
    const result = sweep(profile, spine, { transitionMode: 2 });
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('sweep with transition mode produces a solid with expected volume', () => {
    const c = sketchCircle(2);
    const profile = castShape(c.wire.wrapped) as Wire;
    const e = line([0, 0, 0], [0, 0, 20]);
    const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
    const result = sweep(profile, spine, { transitionMode: 0 });
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    if (isSolid(shape)) {
      const expected = Math.PI * 4 * 20;
      const actual = measureVolume(shape);
      expect(actual).toBeGreaterThan(expected * 0.99);
      expect(actual).toBeLessThan(expected * 1.01);
    }
  });
});
