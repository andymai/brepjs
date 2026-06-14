import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  sketchCircle,
  line,
  wire,
  castShape,
  sweep,
  helix,
  isOk,
  unwrap,
  isSolid,
  isShape3D,
  isValid,
  measureVolume,
  measureArea,
  box,
  getFaces,
  getKernel,
} from '@/index.js';
import type { Wire } from '@/core/shapeTypes.js';

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
    expect(isSolid(shape)).toBe(true);
    const expected = Math.PI * 4 * 20;
    const actual = unwrap(measureVolume(shape));
    expect(actual).toBeGreaterThan(expected * 0.99);
    expect(actual).toBeLessThan(expected * 1.01);
  });

  it('sweeps a circle along a helix spine (#1353)', () => {
    // Regression: occt-wasm built the helix edge with only a pcurve (no 3D
    // curve), so MakePipe/MakePipeShell threw on a helix spine. makeHelixWire
    // now builds the 3D curves, matching the opencascade.js build.
    const profile = castShape(sketchCircle(2).wire.wrapped) as Wire;
    const result = sweep(profile, helix(40, 40, 10));
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
    expect(unwrap(measureVolume(shape))).toBeGreaterThan(0);
  });

  it('sweeps a circle along a helix spine with frenet (#1353)', () => {
    const profile = castShape(sketchCircle(2).wire.wrapped) as Wire;
    const result = sweep(profile, helix(40, 40, 10), { frenet: true });
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeGreaterThan(0);
  });

  it('simple-mode helix sweep produces a valid (non-degenerate) shape', () => {
    // Regression: occt's simplePipe coerced the open tube (a wire profile swept
    // along a helix has no caps) into an INVALID zero-volume solid. It now
    // returns the valid open shell, matching occt-wasm. (Volume of an open shell
    // is kernel-dependent, so assert validity + surface area, not volume.)
    const profile = castShape(sketchCircle(2).wire.wrapped) as Wire;
    const result = sweep(profile, helix(40, 40, 10), { mode: 'simple' });
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
    expect(isValid(shape)).toBe(true);
    expect(unwrap(measureArea(shape))).toBeGreaterThan(0);
  });

  describe('kernel.helicalSweep', () => {
    it('produces a solid on kernels that support it', () => {
      expect.hasAssertions();
      // Use a box face as the profile, sweep along a helix around Z axis.
      const b = box(2, 2, 1);
      const faces = getFaces(b);
      const profileFace = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
      let result: unknown;
      try {
        result = getKernel().helicalSweep(
          profileFace.wrapped,
          [0, 0, 0],
          [0, 0, 1],
          10, // radius
          5, // pitch
          2 // turns
        );
      } catch (e) {
        // OCCT and occt-wasm both decline: OCCT says "only available with
        // the brepkit kernel"; occt-wasm says brepkit has a native impl
        // while its own composition isn't fleshed out yet. Either way,
        // the message mentions brepkit — brepkit is the only kernel that
        // currently implements helicalSweep.
        expect(String(e)).toContain('brepkit');
        return;
      }
      expect(result).toBeDefined();
      // Result should be a valid solid with positive volume.
      expect(getKernel().isValid(result)).toBe(true);
      expect(getKernel().volume(result)).toBeGreaterThan(0);
    });
  });
});
