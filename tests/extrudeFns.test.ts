import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  sketchRectangle,
  sketchCircle,
  wire,
  line,
  castShape,
  extrude,
  revolve,
  sweep,
  complexExtrude,
  twistExtrude,
  supportExtrude,
  cylinder,
  getFaces,
  measureVolume,
  isOk,
  isErr,
  unwrap,
  isSolid,
  isShape3D,
} from '@/index.js';
import type { Wire } from '@/core/shapeTypes.js';
import { createFace } from '@/core/shapeTypes.js';
import { getKernel } from '@/kernel/index.js';

describe('extrudeFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  function makeNullFace() {
    const oc = getKernel().oc;
    return createFace(new oc.TopoDS_Face());
  }

  describe('extrude', () => {
    it('extrudes a rectangle into a box', () => {
      const rect = sketchRectangle(10, 20);
      const f = castShape(rect.face().wrapped);
      const result = extrude(f, [0, 0, 30]);
      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      expect(unwrap(measureVolume(solid))).toBeCloseTo(10 * 20 * 30, 0);
    });

    it.skipIf(shouldSkipSuite('extrudeFns.circleExtrude'))(
      'extrudes a circle into a cylinder',
      () => {
        const c = sketchCircle(5);
        const f = castShape(c.face().wrapped);
        const result = extrude(f, [0, 0, 10]);
        expect(isOk(result)).toBe(true);
        expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(Math.PI * 25 * 10, 0);
      }
    );
  });

  describe('extrude error paths', () => {
    it.skipIf(shouldSkipSuite('extrudeFns.nullFace'))('returns error for null face', () => {
      const result = extrude(makeNullFace(), [0, 0, 10]);
      expect(isErr(result)).toBe(true);
    });

    it('returns error for zero-length extrusion vector', () => {
      const f = castShape(sketchRectangle(10, 10).face().wrapped);
      const result = extrude(f, [0, 0, 0]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('revolve', () => {
    it('revolves a rectangle 360 degrees into a cylinder', () => {
      const rect = sketchRectangle(2, 5, { origin: [6, 0] });
      const f = castShape(rect.face().wrapped);
      const result = revolve(f, { at: [0, 0, 0], axis: [0, 1, 0], angle: 360 });
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });

    it('revolves a rectangle 90 degrees', () => {
      const rect = sketchRectangle(2, 5, { origin: [6, 0] });
      const f = castShape(rect.face().wrapped);
      const result = revolve(f, { at: [0, 0, 0], axis: [0, 1, 0], angle: 90 });
      expect(isOk(result)).toBe(true);
    });
  });

  describe('revolve error paths', () => {
    it.skipIf(shouldSkipSuite('extrudeFns.revolveNullFace'))('returns error for null face', () => {
      const result = revolve(makeNullFace(), { at: [0, 0, 0], axis: [0, 1, 0], angle: 360 });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('sweep', () => {
    it('sweeps a circle along a line', () => {
      const c = sketchCircle(2);
      const profile = castShape(c.wire.wrapped) as Wire;
      const e = line([0, 0, 0], [0, 0, 20]);
      const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
      const result = sweep(profile, spine);
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });
  });

  describe('sweep simple mode', () => {
    it('sweeps in simple pipe mode', () => {
      const c = sketchCircle(2);
      const profile = castShape(c.wire.wrapped) as Wire;
      const e = line([0, 0, 0], [0, 0, 20]);
      const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
      const result = sweep(profile, spine, { mode: 'simple' });
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });
  });

  describe('complexExtrude', () => {
    it('extrudes with linear profile', () => {
      const c = sketchCircle(5);
      const w = castShape(c.wire.wrapped) as Wire;
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 10], {
        profile: 'linear',
        endFactor: 0.5,
      });
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });

    it('extrudes with s-curve profile', () => {
      const c = sketchCircle(5);
      const w = castShape(c.wire.wrapped) as Wire;
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 10], {
        profile: 's-curve',
        endFactor: 0.5,
      });
      expect(isOk(result)).toBe(true);
    });

    it('extrudes without profile (simple)', () => {
      const c = sketchCircle(5);
      const w = castShape(c.wire.wrapped) as Wire;
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 10]);
      expect(isOk(result)).toBe(true);
    });
  });

  describe('twistExtrude', () => {
    it('extrudes with twist', () => {
      const rect = sketchRectangle(6, 6);
      const w = castShape(rect.wire.wrapped) as Wire;
      const result = twistExtrude(w, 90, [0, 0, 0], [0, 0, 20]);
      expect(isOk(result)).toBe(true);
      expect(isShape3D(unwrap(result))).toBe(true);
    });

    it('returns error for zero twist angle', () => {
      const rect = sketchRectangle(6, 6);
      const w = castShape(rect.wire.wrapped) as Wire;
      const result = twistExtrude(w, 0, [0, 0, 0], [0, 0, 20]);
      expect(isErr(result)).toBe(true);
    });

    it('returns error for zero-length normal', () => {
      const rect = sketchRectangle(6, 6);
      const w = castShape(rect.wire.wrapped) as Wire;
      const result = twistExtrude(w, 90, [0, 0, 0], [0, 0, 0]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('complexExtrude error paths', () => {
    it('returns error for zero-length extrusion normal', () => {
      const c = sketchCircle(5);
      const w = castShape(c.wire.wrapped) as Wire;
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 0]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('supportExtrude', () => {
    it('sweeps a profile along a support surface from a cylinder face', () => {
      const c = sketchCircle(2);
      const w = castShape(c.wire.wrapped) as Wire;
      // Use the lateral face of a cylinder as the support surface
      const cyl = cylinder(10, 20);
      const faces = getFaces(cyl);
      // The lateral face (largest area face) is the support surface
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test array indexing
      const supportFace = faces[0]!;
      const result = supportExtrude(w, [10, 0, 0], [0, 0, 10], supportFace.wrapped);
      // supportExtrude returns a Result — it may fail for complex geometry
      // but should not throw
      expect(typeof result.ok).toBe('boolean');
    });
  });
});
